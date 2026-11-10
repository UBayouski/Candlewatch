import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BREAK_MS, MS_PER_MINUTE, PAUSE_LIMIT_MS } from "./constants";
import { assertInvariants, arbEntry, arbScript, arbT0, runScript } from "./test-kit";
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
      { numRuns: 100 },
    );
  });

  it("generates valid history entries", () => {
    fc.assert(
      fc.property(arbEntry, (e) => {
        expect(e.endedAt).toBeGreaterThanOrEqual(e.startedAt);
        expect(e.lengthMin).toBeGreaterThanOrEqual(5);
        expect(e.lengthMin).toBeLessThanOrEqual(90);
      }),
      { numRuns: 100 },
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
