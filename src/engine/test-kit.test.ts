import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BREAK_MS, MS_PER_MINUTE, PAUSE_LIMIT_MS } from "./constants";
import {
  PROP_PARAMS,
  arbEntry,
  arbScript,
  arbSignedVisibilityScript,
  arbT0,
  arbVisibilityScript,
  assertInvariants,
  assertMatchesReference,
  referenceTrace,
  runScript,
} from "./test-kit";
import type { ScriptStep } from "./test-kit";
import { step } from "./step";
import { INITIAL_STATE } from "./types";
import type { State } from "./types";

const T0 = 1_800_000_000_000;
const MIN = MS_PER_MINUTE;

const s = (kind: ScriptStep["kind"], gap: number, length = 25): ScriptStep => ({
  kind,
  gap,
  length,
  intent: "x",
  junk: undefined,
});

const SCRIPT: ScriptStep[] = [
  s("light", 0),
  s("tick", 5 * MIN),
  s("pause", 0),
  s("reload", MIN),
  s("resume", MIN),
  s("hide", MIN),
  s("tick", 30 * MIN),
  s("light", 0, 15),
  s("snuff", MIN),
];

describe("runScript", () => {
  it("is deterministic for the same script and start time", () => {
    expect(runScript(SCRIPT, T0)).toStrictEqual(runScript(SCRIPT, T0));
  });

  it("uses t0 plus the running sum of the gaps as now", () => {
    const trace = runScript(SCRIPT, T0);
    expect(trace[0]?.now).toBe(T0);
    expect(trace[1]?.now).toBe(T0 + 5 * MIN);
    expect(trace[3]?.now).toBe(T0 + 6 * MIN);
  });

  it("chains states: each before is the previous after", () => {
    const trace = runScript(SCRIPT, T0);
    for (let i = 1; i < trace.length; i++) {
      expect(trace[i]?.before).toBe(trace[i - 1]?.after);
    }
    expect(trace[0]?.before).toBe(INITIAL_STATE);
  });

  it("turns a reload step into a real round trip that restores the same state", () => {
    const trace = runScript(SCRIPT, T0);
    const reload = trace[3];
    expect(reload?.event.type).toBe("reload");
    expect(reload?.event.type === "reload" && reload.event.state).toStrictEqual(reload?.before);
  });

  it("feeds junk text to restoreState on a junk reload", () => {
    const junk: ScriptStep = { ...s("reload", 0), junk: "{" };
    const trace = runScript([s("light", 0), junk], T0);
    expect(trace[1]?.event.type === "reload" && trace[1].event.state.phase).toBe("idle");
    expect(trace[1]?.after.phase).toBe("idle");
  });

  it("produces states that satisfy the invariants", () => {
    for (const entry of runScript(SCRIPT, T0)) assertInvariants(entry.after);
  });

  it("generated scripts run without breaking invariants (smoke)", () => {
    fc.assert(
      fc.property(arbT0, arbScript, (t0, script) => {
        for (const entry of runScript(script, t0)) assertInvariants(entry.after);
      }),
      PROP_PARAMS,
    );
  });

  it("generates valid history entries", () => {
    fc.assert(
      fc.property(arbEntry, (e) => {
        expect(e.endedAt).toBeGreaterThanOrEqual(e.startedAt);
        expect(e.lengthMin).toBeGreaterThanOrEqual(5);
        expect(e.lengthMin).toBeLessThanOrEqual(90);
      }),
      PROP_PARAMS,
    );
  });
});

describe("assertInvariants", () => {
  const lit = step(INITIAL_STATE, { type: "light", length: 25 }, T0);
  const burned = step(lit, { type: "tick" }, T0 + 25 * MIN);
  const snuffed = step(lit, { type: "snuff" }, T0 + MIN);
  const paused = step(lit, { type: "pause" }, T0 + 5 * MIN);

  it("accepts states produced by step", () => {
    for (const state of [INITIAL_STATE, lit, paused, burned, snuffed]) {
      expect(() => assertInvariants(state)).not.toThrow();
    }
  });

  it("rejects a pause total over the limit", () => {
    if (lit.phase !== "lit") throw new Error("setup");
    const bad: State = { ...lit, session: { ...lit.session, pausedTotalMs: PAUSE_LIMIT_MS + 1 } };
    expect(() => assertInvariants(bad)).toThrow(/pausedTotalMs/);
  });

  it("rejects breakEndsAt on a snuffed state", () => {
    const bad = { ...snuffed, breakEndsAt: T0 + MIN + BREAK_MS } as unknown as State;
    expect(() => assertInvariants(bad)).toThrow(/breakEndsAt/);
  });

  it("rejects a burned-out state with the wrong break end", () => {
    if (burned.phase !== "burned-out") throw new Error("setup");
    const bad: State = { ...burned, breakEndsAt: burned.breakEndsAt + 1 };
    expect(() => assertInvariants(bad)).toThrow(/breakEndsAt/);
  });

  it("rejects unordered anchors", () => {
    if (lit.phase !== "lit" || paused.phase !== "paused") throw new Error("setup");
    expect(() => assertInvariants({ ...lit, litSince: T0 - 1 })).toThrow(/litSince/);
    expect(() => assertInvariants({ ...paused, pausedAt: T0 - 1 })).toThrow(/pausedAt/);
  });

  it("rejects a final session that is missing from history", () => {
    if (burned.phase !== "burned-out") throw new Error("setup");
    expect(() => assertInvariants({ ...burned, history: [] })).toThrow(/history/);
  });

  it("rejects a session present on idle", () => {
    if (lit.phase !== "lit") throw new Error("setup");
    const bad = { phase: "idle", history: [], session: lit.session } as unknown as State;
    expect(() => assertInvariants(bad)).toThrow(/session/);
  });

  it("rejects an invalid history entry", () => {
    const entry = burned.history[0];
    if (entry === undefined) throw new Error("setup");
    const bad: State = { phase: "idle", history: [{ ...entry, lengthMin: 4 }] };
    expect(() => assertInvariants(bad)).toThrow(/history/);
  });
});

describe("visibility script arbitraries", () => {
  const share = (scripts: ScriptStep[][]): number => {
    const steps = scripts.flat();
    return steps.filter((x) => x.kind === "hide" || x.kind === "show").length / Math.max(1, steps.length);
  };

  it("produce many hides and shows, far more than the default mix", () => {
    const visibility = share(fc.sample(arbVisibilityScript, 200));
    const normal = share(fc.sample(arbScript, 200));
    expect(visibility).toBeGreaterThan(0.3);
    expect(visibility).toBeGreaterThan(normal * 2);
  });

  it("the signed variant also produces negative gaps", () => {
    const gaps = fc.sample(arbSignedVisibilityScript, 100).flat().map((x) => x.gap);
    expect(gaps.some((g) => g < 0)).toBe(true);
    expect(fc.sample(arbVisibilityScript, 100).flat().every((x) => x.gap >= 0)).toBe(true);
  });

  it("runs of both keep the invariants, including the distraction ones (smoke)", () => {
    fc.assert(
      fc.property(arbT0, arbVisibilityScript, arbSignedVisibilityScript, (t0, a, b) => {
        for (const entry of runScript(a, t0)) assertInvariants(entry.after);
        for (const entry of runScript(b, t0)) assertInvariants(entry.after);
      }),
      PROP_PARAMS,
    );
  });
});

describe("assertInvariants: distraction fields", () => {
  const base = step(INITIAL_STATE, { type: "light", length: 25 }, T0);
  const hidden = step(base, { type: "hide" }, T0 + 2 * MIN);
  const counted = step(hidden, { type: "show" }, T0 + 5 * MIN); // one span of 3 minutes
  const paused = step(counted, { type: "pause" }, T0 + 6 * MIN);

  if (counted.phase !== "lit" || hidden.phase !== "lit" || paused.phase !== "paused") throw new Error("setup");
  const lit = counted;

  it("accepts states with spans and an open hide", () => {
    for (const state of [hidden, counted, paused]) expect(() => assertInvariants(state)).not.toThrow();
  });

  it("rejects a span count that differs from distractions", () => {
    const bad: State = { ...lit, session: { ...lit.session, distractions: 2 } };
    expect(() => assertInvariants(bad)).toThrow(/spans/);
  });

  it("rejects a span sum that differs from timeAwayMs", () => {
    const bad: State = { ...lit, session: { ...lit.session, timeAwayMs: lit.session.timeAwayMs + 1 } };
    expect(() => assertInvariants(bad)).toThrow(/sum of spans/);
  });

  it("rejects a negative span", () => {
    const bad: State = { ...lit, session: { ...lit.session, awaySpansMs: [-1, 2], distractions: 2, timeAwayMs: 1 } };
    expect(() => assertInvariants(bad)).toThrow(/non-negative/);
  });

  it("rejects a fractional span", () => {
    const bad: State = { ...lit, session: { ...lit.session, awaySpansMs: [0.5, 0.5], distractions: 2, timeAwayMs: 1 } };
    expect(() => assertInvariants(bad)).toThrow(/non-negative/);
  });

  it("rejects awaySince on a paused state", () => {
    const bad = { ...paused, awaySince: T0 + MIN } as unknown as State;
    expect(() => assertInvariants(bad)).toThrow(/awaySince/);
  });

  it("rejects awaySince before litSince and at or after completion", () => {
    expect(() => assertInvariants({ ...lit, awaySince: T0 - 1 })).toThrow(/awaySince/);
    expect(() => assertInvariants({ ...lit, awaySince: T0 + 25 * MIN })).toThrow(/awaySince/);
  });
});

describe("referenceTrace", () => {
  const run = (script: ScriptStep[]) => {
    const trace = runScript(script, T0);
    return { trace, ref: referenceTrace(script, T0) };
  };

  it("agrees with the engine: a hide and show in the middle of a candle", () => {
    const { trace, ref } = run([s("light", 0), s("hide", 5 * MIN), s("show", 3 * MIN), s("tick", MIN)]);
    expect(() => assertMatchesReference(trace, ref)).not.toThrow();
    expect(ref[3]?.spans).toEqual([3 * MIN]);
    expect(ref[3]?.hiddenAt).toBeNull();
  });

  it("agrees with the engine: a hide through completion, noticed by a late show", () => {
    const { trace, ref } = run([s("light", 0), s("hide", 20 * MIN), s("show", 20 * MIN), s("show", MIN)]);
    expect(() => assertMatchesReference(trace, ref)).not.toThrow();
    expect(ref[2]?.phase).toBe("done");
    expect(ref[2]?.entries).toEqual([
      { startedAt: T0, endedAt: T0 + 25 * MIN, distractions: 1, timeAwayMs: 5 * MIN },
    ]);
  });

  it("agrees with the engine: pause while hidden, then a hide and show while paused", () => {
    const { trace, ref } = run([
      s("light", 0),
      s("hide", 5 * MIN),
      s("pause", 2 * MIN),
      s("hide", MIN),
      s("show", MIN),
      s("resume", MIN),
    ]);
    expect(() => assertMatchesReference(trace, ref)).not.toThrow();
    expect(ref[2]?.spans).toEqual([2 * MIN]);
    expect(ref[5]?.phase).toBe("lit");
    expect(ref[5]?.hiddenAt).toBeNull();
  });

  it("agrees with the engine across a reload round trip and a pause-limit snuff", () => {
    const { trace, ref } = run([
      s("light", 0),
      s("hide", MIN),
      s("show", MIN),
      s("reload", MIN),
      s("pause", MIN),
      s("tick", 11 * MIN),
    ]);
    expect(() => assertMatchesReference(trace, ref)).not.toThrow();
    expect(ref[5]?.phase).toBe("done");
    expect(ref[5]?.entries[0]).toMatchObject({ distractions: 1, timeAwayMs: MIN });
  });

  it("assertMatchesReference detects a disagreement", () => {
    const { trace, ref } = run([s("light", 0), s("hide", MIN), s("show", MIN)]);
    const tampered = ref.map((r, i) => (i === 2 ? { ...r, spans: [MIN + 1] } : r));
    expect(() => assertMatchesReference(trace, tampered)).toThrow(/spans/);
    expect(() => assertMatchesReference(trace, ref.slice(1))).toThrow(/same length/);
  });
});
