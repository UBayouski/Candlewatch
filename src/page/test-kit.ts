// Shared arbitraries for the page property tests (title, wake, Hidden_Tick). Test-only: never imported by a shipped file.
import * as fc from "fast-check";
import { INITIAL_STATE, step } from "../engine";
import type { State } from "../engine";
import { arbGap, arbScript, arbT0, makeArbScript, runScript } from "../engine/test-kit";
import type { ScriptStep, StepKind } from "../engine/test-kit";

export { PROP_PARAMS } from "../engine/test-kit";

const MIN = 60_000;

/** Scripts that light, pause, resume and snuff often, so every phase is reached. */
export const arbPhaseScript = makeArbScript({
  gap: fc.oneof(arbGap, fc.integer({ min: 5 * MIN, max: 2 * 3_600_000 })),
  kinds: fc.constantFrom<StepKind>("light", "light", "pause", "resume", "snuff", "tick", "tick", "hide", "show", "reload"),
});

/** A state picked out of a script's trace (any phase), with the time of its last step. */
const arbTraceState: fc.Arbitrary<{ state: State; at: number }> = fc
  .tuple(fc.oneof(arbScript, arbPhaseScript), arbT0, fc.nat())
  .map(([script, t0, pick]) => {
    const trace = runScript(script, t0);
    const all = [{ state: INITIAL_STATE as State, at: t0 }, ...trace.map((e) => ({ state: e.after, at: e.now }))];
    return all[pick % all.length] ?? { state: INITIAL_STATE, at: t0 };
  });

/** A state of each phase built with `step` at chosen times: a light, then a pause, a burn-out or a snuff some time later. */
const arbBuiltState: fc.Arbitrary<{ state: State; at: number }> = fc
  .record({
    phase: fc.constantFrom("idle", "lit", "paused", "burned-out", "snuffed"),
    t0: arbT0,
    length: fc.integer({ min: 5, max: 90 }),
    frac: fc.double({ min: 0, max: 1, noNaN: true }),
    pauseFor: fc.integer({ min: 0, max: 10 * MIN }),
  })
  .map(({ phase, t0, length, frac, pauseFor }) => {
    const lit = step(INITIAL_STATE, { type: "light", length }, t0);
    const into = t0 + Math.floor(frac * length * MIN);
    switch (phase) {
      case "idle":
        return { state: INITIAL_STATE, at: t0 };
      case "lit":
        return { state: lit, at: t0 };
      case "paused": {
        const paused = step(lit, { type: "pause" }, into);
        return { state: paused, at: into + pauseFor };
      }
      case "burned-out":
        return { state: step(lit, { type: "tick" }, t0 + length * MIN), at: t0 + length * MIN };
      case "snuffed":
        return { state: step(lit, { type: "snuff" }, into), at: into };
    }
  });

/** Any state, with the time of its last step: from a trace, or built for a chosen phase. */
export const arbAnyState: fc.Arbitrary<{ state: State; at: number }> = fc.oneof(arbTraceState, arbBuiltState);

/** A `lit` state: from a trace when one has it, else a session lit at t0 with a chosen length. */
export const arbLitState: fc.Arbitrary<{ state: State; at: number }> = fc.oneof(
  fc.tuple(arbT0, fc.integer({ min: 5, max: 90 })).map(([t0, length]) => ({ state: step(INITIAL_STATE, { type: "light", length }, t0), at: t0 })),
  arbAnyState.filter((x) => x.state.phase === "lit"),
);

/** A start and a list of non-negative gaps, as absolute non-decreasing times. */
export const arbNonDecreasingTimes = (start: number): fc.Arbitrary<number[]> =>
  fc
    .array(fc.oneof(fc.integer({ min: 0, max: 50 }), fc.integer({ min: 0, max: 1_500 }), fc.integer({ min: 0, max: 120_000 })), {
      minLength: 1,
      maxLength: 120,
      size: "max",
    })
    .map((gaps) => {
      let t = start;
      return gaps.map((g) => (t += g));
    });

// --- the extra-tick runners (P9) ----------------------------------------------

/** One script step applied to `state` at `now`, with the event built exactly as `runScript` builds it (a reload is a real round trip). */
export function stepOnce(state: State, s: ScriptStep, now: number): State {
  const [entry] = runScript([{ ...s, gap: 0 }], now, state);
  return entry?.after ?? state;
}

/** The end of a run: the final state, every `now` given to `step` in order, and how many extra ticks went in. */
export interface TickRun {
  readonly state: State;
  readonly nows: readonly number[];
  readonly extraTicks: number;
}

/**
 * Runs `script` from `t0` through `step` and, between steps, sends a `tick` at each extra time that falls between the previous
 * `now` and the next one (an extra time equal to a step's time goes before that step; one equal to the last `now` goes before the
 * closing tick). Extra times before the previous `now` or after the last step are left out, so the `now` values never go
 * backwards. Ends with one `tick` at the last `now`.
 */
export function runWithExtraTicks(script: readonly ScriptStep[], t0: number, extraTimes: readonly number[]): TickRun {
  const extras = extraTimes.filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  let state: State = INITIAL_STATE;
  let prev = t0;
  let k = 0;
  let extraTicks = 0;
  const nows: number[] = [];
  /** Sends a tick at every extra time up to `limit` not sent yet. */
  const ticksUpTo = (limit: number): void => {
    for (; k < extras.length && (extras[k] ?? Number.POSITIVE_INFINITY) <= limit; k++) {
      const t = extras[k] ?? limit;
      if (t < prev) continue;
      const at = t; // the extra tick's now
      state = step(state, { type: "tick" }, at);
      nows.push(at);
      prev = at;
      extraTicks++;
    }
  };
  let now = t0;
  for (const s of script) {
    now += s.gap;
    ticksUpTo(now);
    state = stepOnce(state, s, now);
    nows.push(now);
    prev = now;
  }
  ticksUpTo(now);
  state = step(state, { type: "tick" }, now);
  nows.push(now);
  return { state, nows, extraTicks };
}

/** The same script with no extra tick, followed by one `tick` at the last `now`. */
export function runWithoutExtraTicks(script: readonly ScriptStep[], t0: number): TickRun {
  const trace = runScript(script, t0);
  const last = trace[trace.length - 1];
  const now = last?.now ?? t0;
  const state = step(last?.after ?? INITIAL_STATE, { type: "tick" }, now);
  return { state, nows: [...trace.map((e) => e.now), now], extraTicks: 0 };
}
