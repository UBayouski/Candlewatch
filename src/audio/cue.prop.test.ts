// Property tests for cueFor (sound-and-title design 3.1, section 9). Properties 1, 2 and 4.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isBreak } from "../engine";
import { arbScript, arbT0, runScript } from "../engine/test-kit";
import type { ScriptStep } from "../engine/test-kit";
import { LATE_CUE_LIMIT_MS, cueFor } from "./cue";
import { EVENT_TYPES, LIVE_EVENT_TYPES, PROP_PARAMS, TRANSITION_KINDS, arbCueScript, transition, arbCueContext, arbOffset, arbPhasePair, endOf, referenceCue, stateOf } from "./test-kit";

const CUES = new Set(["strike", "chime", "breath"]);

const cueStep = (kind: ScriptStep["kind"], gap: number): ScriptStep =>
  ({ kind, gap, length: 25, intent: undefined, junk: undefined });
type CueExample = [ScriptStep[], number, number, number, "light" | "tick" | "snuff", number, boolean];
const cueExamples: CueExample[] = [
  [[cueStep("light", 0)], 1_500_000_000_000, 0, 0, "light", 0, true],
  [[cueStep("light", 1000)], 1_500_000_000_001, 0, 0, "light", 1, true],
  [[cueStep("light", 2000)], 1_500_000_000_002, 0, 0, "light", -1, true],
  [[cueStep("light", 0), cueStep("tick", 25 * 60_000)], 1_500_000_000_003, 1, 0, "tick", 0, true],
  [[cueStep("light", 1000), cueStep("tick", 25 * 60_000)], 1_500_000_000_004, 1, 0, "tick", 1, true],
  [[cueStep("light", 2000), cueStep("tick", 25 * 60_000)], 1_500_000_000_005, 1, 0, "tick", -1, true],
  [[cueStep("light", 0), cueStep("snuff", 60_000)], 1_500_000_000_006, 1, 0, "snuff", 0, true],
  [[cueStep("light", 1000), cueStep("snuff", 60_000)], 1_500_000_000_007, 1, 0, "snuff", 1, true],
  [[cueStep("light", 2000), cueStep("snuff", 60_000)], 1_500_000_000_008, 1, 0, "snuff", -1, true],
];

describe("Feature: sound-and-title, Property 1: No Cue when sound is off or on reload", () => {
  it("gives null for sound off, and null for a reload, for any two states, event and now", () => {
    let soundOff = 0;
    let reloads = 0;
    fc.assert(
      fc.property(
        arbPhasePair.chain((pair) => fc.record({ pair: fc.constant(pair), ctx: arbCueContext(endOf(pair.next, 0)) })),
        ({ pair, ctx }) => {
          const got = cueFor(pair.prev, pair.next, ctx);
          if (!ctx.sound) {
            soundOff++;
            expect(got).toBeNull();
          }
          if (ctx.eventType === "reload") {
            reloads++;
            expect(got).toBeNull();
          }
          // And the same pair, forced into each case, whatever the other inputs.
          expect(cueFor(pair.prev, pair.next, { ...ctx, sound: false })).toBeNull();
          expect(cueFor(pair.prev, pair.next, { ...ctx, sound: true, eventType: "reload" })).toBeNull();
        },
      ),
      PROP_PARAMS,
    );
    expect(soundOff).toBeGreaterThanOrEqual(60);
    expect(reloads).toBeGreaterThanOrEqual(15);
  });
});

describe("Feature: sound-and-title, Property 2: cueFor agrees with the reference table", () => {
  it("equals the reference for any two states reached by a script, a live event, sound on and now within the limit", () => {
    const seen = new Map<string, number>();
    fc.assert(
      fc.property(
        fc.oneof(arbScript, arbCueScript),
        arbT0,
        fc.nat(),
        fc.nat(),
        fc.constantFrom(...LIVE_EVENT_TYPES),
        fc.integer({ min: -200000, max: LATE_CUE_LIMIT_MS }),
        fc.oneof({ weight: 3, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
        (script, t0, i, j, eventType, offset, consecutive) => {
          const trace = runScript(script, t0);
          const states = [stateOf("idle", t0), ...trace.map((e) => e.after)];
          // Three pairs in four are one event's own before and after (real Transitions), the rest any two states of the trace.
          const changes = trace.filter((e) => e.before.phase !== e.after.phase);
          const pool = changes.length > 0 ? changes : trace;
          const entry = pool[i % Math.max(1, pool.length)];
          const prev = consecutive && entry !== undefined ? entry.before : (states[i % states.length] ?? stateOf("idle", t0));
          const next = consecutive && entry !== undefined ? entry.after : (states[j % states.length] ?? stateOf("idle", t0));
          const now = endOf(next, t0) + offset;
          const got = cueFor(prev, next, { eventType, sound: true, now });
          const want = referenceCue(prev.phase, next.phase, eventType, true, now - endOf(next, t0));
          expect(got).toBe(want);
          expect(got === null || CUES.has(got)).toBe(true);
          // A break does not change the result: the same burned-out state during and after its break.
          if (next.phase === "burned-out") {
            const during = cueFor(prev, next, { eventType, sound: true, now: next.endedAt });
            expect(isBreak(next, next.endedAt)).toBe(true);
            expect(cueFor(prev, next, { eventType, sound: true, now: next.endedAt + 1 })).toBe(during);
          }
          seen.set(`${prev.phase}>${next.phase}`, (seen.get(`${prev.phase}>${next.phase}`) ?? 0) + 1);
        },
      ),
      { ...PROP_PARAMS, examples: cueExamples },
    );
    // The pairs that give a Cue are met, so the property is not passing on nulls alone (the next test meets every kind).
    for (const pair of ["idle>lit", "lit>burned-out", "lit>snuffed"]) {
      expect(seen.get(pair) ?? 0, pair).toBeGreaterThanOrEqual(3);
    }
    const exampleSeen = new Map<string, number>();
    for (const [script, t0, i, , , , consecutive] of cueExamples) {
      const trace = runScript(script, t0);
      const changes = trace.filter((e) => e.before.phase !== e.after.phase);
      const pool = changes.length > 0 ? changes : trace;
      const entry = pool[i % Math.max(1, pool.length)];
      const prev = consecutive && entry !== undefined ? entry.before : stateOf("idle", t0);
      const next = consecutive && entry !== undefined ? entry.after : stateOf("idle", t0);
      const pair = `${prev.phase}>${next.phase}`;
      exampleSeen.set(pair, (exampleSeen.get(pair) ?? 0) + 1);
    }
    const exampleCounts = ["idle>lit", "lit>burned-out", "lit>snuffed"].map((pair) => [pair, exampleSeen.get(pair) ?? 0] as const);
    expect(Math.min(...exampleCounts.map(([, count]) => count)), `examples alone: ${JSON.stringify(exampleCounts)}`).toBeGreaterThanOrEqual(3);
  });

  it("equals the reference on every kind of Transition the engine makes, built with step, with now within the limit", () => {
    const seen = new Map<string, number>();
    fc.assert(
      fc.property(fc.constantFrom(...TRANSITION_KINDS), arbT0, fc.integer({ min: -200000, max: LATE_CUE_LIMIT_MS }), (kind, t0, offset) => {
        const tr = transition(kind, t0);
        const now = tr.next.phase === "burned-out" || tr.next.phase === "snuffed" ? tr.next.endedAt + offset : tr.now;
        const got = cueFor(tr.prev, tr.next, { eventType: tr.eventType, sound: true, now });
        expect(got).toBe(referenceCue(tr.prev.phase, tr.next.phase, tr.eventType, true, now - endOf(tr.next, t0)));
        seen.set(`${tr.prev.phase}>${tr.next.phase}`, (seen.get(`${tr.prev.phase}>${tr.next.phase}`) ?? 0) + 1);
      }),
      PROP_PARAMS,
    );
    // Every Transition the engine makes, including the ones that give a Cue, is met many times.
    for (const pair of ["idle>lit", "lit>paused", "paused>lit", "lit>burned-out", "lit>snuffed", "paused>snuffed", "burned-out>lit", "snuffed>lit"]) {
      expect(seen.get(pair) ?? 0, pair).toBeGreaterThanOrEqual(15);
    }
  });

  it("equals the reference on all 25 hand-built pairs with any context", () => {
    fc.assert(
      fc.property(
        arbPhasePair.chain((pair) => fc.record({ pair: fc.constant(pair), ctx: arbCueContext(endOf(pair.next, 0)) })),
        ({ pair, ctx }) => {
          const got = cueFor(pair.prev, pair.next, ctx);
          expect(got).toBe(referenceCue(pair.prev.phase, pair.next.phase, ctx.eventType, ctx.sound, ctx.now - endOf(pair.next, 0)));
        },
      ),
      PROP_PARAMS,
    );
  });
});

describe("Feature: sound-and-title, Property 4: The Late_Cue_Limit decides end Cues and never strikes", () => {
  it("an end Cue is null exactly when now - endedAt > 120000, otherwise chime or breath by the next phase", () => {
    let late = 0;
    let onTime = 0;
    let edges = 0;
    fc.assert(
      fc.property(
        fc.constantFrom("lit", "paused"),
        fc.constantFrom("burned-out", "snuffed"),
        arbT0,
        fc.integer({ min: 0, max: 3_600_000 }),
        arbOffset,
        fc.constantFrom(...LIVE_EVENT_TYPES),
        (from, to, t0, d, offset, eventType) => {
          const next = stateOf(to, t0, t0 + d);
          const now = endOf(next, t0) + offset;
          const got = cueFor(stateOf(from, t0), next, { eventType, sound: true, now });
          if (offset > 120000) {
            late++;
            expect(got).toBeNull();
          } else {
            onTime++;
            expect(got).toBe(to === "burned-out" ? "chime" : "breath");
          }
          if (offset === 119999 || offset === 120000 || offset === 120001) edges++;
        },
      ),
      PROP_PARAMS,
    );
    expect(late).toBeGreaterThanOrEqual(30);
    expect(onTime).toBeGreaterThanOrEqual(30);
    expect(edges).toBeGreaterThanOrEqual(10);
  });

  it("lighting strikes whatever the delay since the previous state ended", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("idle", "burned-out", "snuffed"),
        arbT0,
        arbOffset,
        fc.constantFrom(...EVENT_TYPES.filter((t) => t !== "reload")),
        (from, t0, offset, eventType) => {
          const prev = stateOf(from, t0, t0);
          const now = t0 + Math.abs(offset) + offset;
          expect(cueFor(prev, stateOf("lit", now), { eventType, sound: true, now })).toBe("strike");
          expect(cueFor(prev, stateOf("lit", t0), { eventType, sound: true, now: t0 + offset })).toBe("strike");
        },
      ),
      PROP_PARAMS,
    );
  });
});
