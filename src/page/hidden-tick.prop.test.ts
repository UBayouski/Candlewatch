// Property tests of the Hidden_Tick (sound-and-title tasks 9.3 and 9.4, design 3.7, D27). Properties 12 and 9.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { distractionCount, ghostSpansMs, INITIAL_STATE, step } from "../engine";
import type { Event, State } from "../engine";
import { arbGap, arbLength, arbT0, arbVisibilityScript } from "../engine/test-kit";
import type { ScriptStep } from "../engine/test-kit";
import { FakeTimer } from "./fake-timer";
import { createHiddenTick } from "./hidden-tick";
import { PROP_PARAMS, runWithExtraTicks, runWithoutExtraTicks, stepOnce } from "./test-kit";
import { WAKE_MAX_MS } from "./wake";

const MIN = 60_000;
type Phase = State["phase"];
const needsWake = (p: Phase): boolean => p === "lit" || p === "paused";

/** One operation on the Hidden_Tick and its surroundings (P12). */
type Op =
  | { readonly kind: "start" }
  | { readonly kind: "stop" }
  | { readonly kind: "advance"; readonly ms: number }
  | { readonly kind: "late"; readonly ms: number }
  | { readonly kind: "setPhase"; readonly phase: Phase; readonly length: number; readonly leftMs: number }
  | { readonly kind: "throwDispatch"; readonly on: boolean }
  | { readonly kind: "throwGetState"; readonly on: boolean }
  | { readonly kind: "stopInDispatch" };

const arbOp: fc.Arbitrary<Op> = fc.oneof(
  { weight: 4, arbitrary: fc.constant<Op>({ kind: "start" }) },
  { weight: 3, arbitrary: fc.constant<Op>({ kind: "stop" }) },
  { weight: 4, arbitrary: fc.oneof(fc.integer({ min: 0, max: 50 }), fc.integer({ min: 0, max: 3000 })).map((ms): Op => ({ kind: "advance", ms })) },
  { weight: 1, arbitrary: fc.integer({ min: 0, max: 11 * MIN }).map((ms): Op => ({ kind: "advance", ms })) },
  { weight: 2, arbitrary: fc.oneof(fc.integer({ min: 0, max: 2000 }), fc.integer({ min: 0, max: 70_000 })).map((ms): Op => ({ kind: "late", ms })) },
  {
    weight: 3,
    arbitrary: fc
      .record({
        phase: fc.constantFrom<Phase>("idle", "lit", "lit", "paused", "paused", "burned-out", "snuffed"),
        length: fc.integer({ min: 5, max: 90 }),
        leftMs: fc.oneof(fc.integer({ min: 0, max: 3000 }), fc.integer({ min: 0, max: 90 * MIN })),
      })
      .map((r): Op => ({ kind: "setPhase", ...r })),
  },
  { weight: 2, arbitrary: fc.boolean().map((on): Op => ({ kind: "throwDispatch", on })) },
  { weight: 2, arbitrary: fc.boolean().map((on): Op => ({ kind: "throwGetState", on })) },
  { weight: 1, arbitrary: fc.constant<Op>({ kind: "stopInDispatch" }) },
);

/** An advance long enough for an armed timer (at most 1000 ms) to fall due. */
const arbDueAdvance = fc.integer({ min: 1000, max: 3000 }).map((ms): Op => ({ kind: "advance", ms }));

/**
 * Ops, partly in chunks that reach the rare paths: a start, a stop and an advance (a callback already queued when the timer
 * ignores cancels); a stop asked for inside the next dispatch, then an advance; a start, then an advance.
 */
const arbOps: fc.Arbitrary<Op[]> = fc
  .array(
    fc.oneof(
      { weight: 6, arbitrary: arbOp.map((op) => [op]) },
      { weight: 1, arbitrary: arbDueAdvance.map((adv): Op[] => [{ kind: "start" }, { kind: "stop" }, { kind: "start" }, adv]) },
      { weight: 1, arbitrary: arbDueAdvance.map((adv): Op[] => [{ kind: "start" }, { kind: "stopInDispatch" }, adv]) },
      { weight: 1, arbitrary: arbDueAdvance.map((adv): Op[] => [{ kind: "start" }, adv]) },
      {
        weight: 1,
        arbitrary: fc
          .tuple(fc.constantFrom<Phase>("lit", "paused"), fc.integer({ min: 5, max: 90 }), fc.integer({ min: 0, max: 2500 }), arbDueAdvance)
          .map(([phase, length, leftMs, adv]): Op[] => [{ kind: "setPhase", phase, length, leftMs }, { kind: "start" }, adv]),
      },
    ),
    { maxLength: 24 },
  )
  .map((chunks) => chunks.flat());

/**
 * A state of `phase` built with the engine at `now`. A lit one has `leftMs` of burn left (capped at its length), a paused one
 * `leftMs` of pause allowance left (capped at 10 minutes), so the chain often meets the end within an advance.
 */
function stateAt(phase: Phase, length: number, now: number, leftMs = length * MIN): State {
  switch (phase) {
    case "idle":
      return INITIAL_STATE;
    case "lit":
      return step(INITIAL_STATE, { type: "light", length }, now - (length * MIN - Math.min(leftMs, length * MIN)));
    case "paused": {
      const pausedAt = now - (10 * MIN - Math.min(leftMs, 10 * MIN));
      return step(step(INITIAL_STATE, { type: "light", length }, pausedAt - 1000), { type: "pause" }, pausedAt);
    }
    case "burned-out":
      return step(step(INITIAL_STATE, { type: "light", length }, now - length * MIN), { type: "tick" }, now);
    case "snuffed":
      return step(step(INITIAL_STATE, { type: "light", length }, now - 1000), { type: "snuff" }, now);
  }
}

describe("Feature: sound-and-title, Property 12: The Hidden_Tick keeps at most one timer and stops when told", () => {
  it("one live timer at most, nothing after stop, only tick with the clock's now, throws never end the chain", () => {
    const coverage = { fires: 0, dispatchThrows: 0, stateThrows: 0, staleRuns: 0, stopsInDispatch: 0, ends: 0 };
    fc.assert(
      fc.property(arbT0, fc.boolean(), fc.integer({ min: 5, max: 90 }), arbOps, (t0, ignoreCancel, length, ops) => {
        const timer = new FakeTimer({ start: t0, ignoreCancel });
        // The page starts with a lit session (as after a hide); the ops change it at will.
        let state: State = stateAt("lit", length, t0);
        const flags = { throwDispatch: false, throwGetState: false, stopNext: false, stoppedInDispatch: false };
        /** True after stop(), until a start that armed: no dispatch and no arm may happen. */
        let quiet = true;
        /** Inside a callback, between its dispatch and its arm. */
        let firing = false;
        /** A throwing dispatch happened and the chain must still arm the next timer. */
        let mustArm = false;
        /** Counts the stop() calls; a callback armed before the latest one must not dispatch, even if its timer still runs. */
        let epoch = 0;
        let callbackOf: number | null = null;

        // Checks made inside the module's callbacks are recorded, not thrown: the module's own try/catch around dispatch (D27)
        // would swallow a thrown assertion. The list is asserted empty after every op.
        const violations: string[] = [];
        const must = (ok: boolean, what: string): void => {
          if (!ok) violations.push(what);
        };

        const hidden = createHiddenTick({
          schedule: (fn, ms) => {
            must(!quiet, "armed after stop");
            must(ms > 0 && ms <= WAKE_MAX_MS, `delay ${ms} outside (0, ${WAKE_MAX_MS}]`);
            if (firing && flags.throwGetState) must(ms === WAKE_MAX_MS, `delay ${ms} after a getState throw`);
            else must(needsWake(state.phase), `armed in phase ${state.phase}`);
            mustArm = false;
            firing = false;
            const armedIn = epoch;
            return timer.schedule(() => {
              if (armedIn !== epoch) coverage.staleRuns++;
              callbackOf = armedIn;
              fn();
              callbackOf = null;
            }, ms);
          },
          cancel: timer.cancel,
          clock: timer.clock,
          dispatch: (event: Event, now: number) => {
            must(!quiet, "dispatch after stop");
            must(callbackOf === epoch, "dispatch from a callback armed before the last stop");
            must(!mustArm, "a throwing dispatch did not arm the next timer");
            must(event.type === "tick" && Object.keys(event).length === 1, `sent ${JSON.stringify(event)}`);
            must(now === timer.clock(), "dispatch now is not the clock when the callback ran");
            coverage.fires++;
            state = step(state, event, now);
            firing = true;
            if (flags.stopNext) {
              flags.stopNext = false;
              coverage.stopsInDispatch++;
              hidden.stop();
              epoch++;
              quiet = true;
              flags.stoppedInDispatch = true;
              firing = false;
            }
            if (flags.throwDispatch) {
              coverage.dispatchThrows++;
              mustArm = !quiet && (flags.throwGetState || needsWake(state.phase));
              throw new Error("sink");
            }
          },
          getState: () => {
            if (flags.throwGetState) {
              coverage.stateThrows++;
              throw new Error("state");
            }
            return state;
          },
        });

        for (const op of ops) {
          const wasRunning = hidden.isRunning();
          let stopped = false;
          flags.stoppedInDispatch = false;
          switch (op.kind) {
            case "start": {
              // A start may arm; it ends the quiet only if it did (the module is then running).
              const wasQuiet: boolean = quiet;
              quiet = false;
              try {
                hidden.start(timer.clock());
              } catch (error) {
                must(flags.throwGetState && error instanceof Error && error.message === "state", "start threw something else");
              }
              if (!hidden.isRunning()) quiet = wasQuiet;
              break;
            }
            case "stop":
              hidden.stop();
              epoch++;
              quiet = true;
              stopped = true;
              break;
            case "advance":
              timer.advance(op.ms);
              break;
            case "late":
              timer.lateBy(op.ms);
              break;
            case "setPhase":
              state = stateAt(op.phase, op.length, timer.clock(), op.leftMs);
              break;
            case "throwDispatch":
              flags.throwDispatch = op.on;
              break;
            case "throwGetState":
              flags.throwGetState = op.on;
              break;
            case "stopInDispatch":
              flags.stopNext = true;
              break;
          }
          if (flags.stoppedInDispatch) stopped = true;
          firing = false;
          expect(violations).toEqual([]);
          expect(mustArm).toBe(false);
          expect(timer.live()).toBeLessThanOrEqual(1);
          expect(timer.live()).toBe(hidden.hasPending() ? 1 : 0);
          if (hidden.hasPending()) expect(hidden.isRunning()).toBe(true);
          if (quiet) expect(hidden.isRunning()).toBe(false);
          // The chain ends only when nextWakeMs is null (the phase needs no wake) or stop() has run.
          if (wasRunning && !hidden.isRunning() && !stopped) {
            coverage.ends++;
            expect(flags.throwGetState).toBe(false);
            expect(needsWake(state.phase)).toBe(false);
          }
        }
      }),
      PROP_PARAMS,
    );
    for (const [name, n] of Object.entries(coverage)) expect(n, name).toBeGreaterThanOrEqual(10);
  });
});

/** Scripts with many hides and shows, and the extra times of P9: absolute times inside the script's span, step times among them. */
const arbExtraTickCase = fc
  .tuple(arbVisibilityScript, arbT0)
  .chain(([script, t0]) => {
    let t = t0;
    const stepTimes = script.map((s) => (t += s.gap));
    const span = t - t0;
    return fc.record({
      script: fc.constant(script),
      t0: fc.constant(t0),
      extra: fc
        .tuple(fc.array(fc.integer({ min: 0, max: span }), { maxLength: 80 }), fc.subarray(stepTimes))
        .map(([offsets, atSteps]) => [...offsets.map((o) => t0 + o), ...atSteps]),
    });
  });

/** Visibility scripts that begin with a light and a hide, so the module has a lit session to tick from the start. */
const arbLitFirstScript: fc.Arbitrary<ScriptStep[]> = fc
  .tuple(arbLength, arbGap, arbVisibilityScript)
  .map(([length, hideAfter, rest]): ScriptStep[] => [
    { kind: "light", gap: 0, length, intent: undefined, junk: undefined },
    { kind: "hide", gap: hideAfter, length, intent: undefined, junk: undefined },
    ...rest,
  ]);

/** Runs `script` with a real Hidden_Tick started on each hide and stopped on each show, ticking the engine through `step`. */
function runWithHiddenTick(script: readonly ScriptStep[], t0: number): { state: State; tickTimes: number[] } {
  const timer = new FakeTimer({ start: t0 });
  let state: State = INITIAL_STATE;
  const tickTimes: number[] = [];
  const hidden = createHiddenTick({
    schedule: timer.schedule,
    cancel: timer.cancel,
    clock: timer.clock,
    dispatch: (event, now) => {
      tickTimes.push(now);
      state = step(state, event, now);
    },
    getState: () => state,
  });
  let now = t0;
  for (const s of script) {
    timer.advance(s.gap); // the module's own ticks, each at its due time
    now += s.gap;
    state = stepOnce(state, s, now);
    if (s.kind === "hide") hidden.start(now);
    else if (s.kind === "show") hidden.stop();
  }
  hidden.stop();
  return { state: step(state, { type: "tick" }, now), tickTimes };
}

describe("Feature: sound-and-title, Property 9: Extra hidden ticks change nothing", () => {
  it("engine part: a script with extra ticks ends in the state of the script without them plus one tick at the end", () => {
    let withTicks = 0;
    fc.assert(
      fc.property(arbExtraTickCase, ({ script, t0, extra }) => {
        const a = runWithExtraTicks(script, t0, extra);
        const b = runWithoutExtraTicks(script, t0);
        // The runner keeps its contract: every extra time went in, and the `now` values never go backwards.
        expect(a.extraTicks).toBe(extra.length);
        for (let i = 1; i < a.nows.length; i++) expect(a.nows[i] ?? 0).toBeGreaterThanOrEqual(a.nows[i - 1] ?? 0);
        expect(a.state).toEqual(b.state);
        expect(distractionCount(a.state)).toBe(distractionCount(b.state));
        expect(ghostSpansMs(a.state)).toEqual(ghostSpansMs(b.state));
        if (a.extraTicks > 0) withTicks++;
      }),
      PROP_PARAMS,
    );
    expect(withTicks).toBeGreaterThanOrEqual(150);
  });

  it("Hidden_Tick part: the ticks the module sends between hide and show change nothing", () => {
    let ticked = 0;
    let ghosts = 0;
    fc.assert(
      fc.property(arbLitFirstScript, arbT0, (script, t0) => {
        const a = runWithHiddenTick(script, t0);
        const b = runWithoutExtraTicks(script, t0);
        expect(a.state).toEqual(b.state);
        expect(distractionCount(a.state)).toBe(distractionCount(b.state));
        expect(ghostSpansMs(a.state)).toEqual(ghostSpansMs(b.state));
        // The same ticks fed to the engine runner give the same state too.
        expect(runWithExtraTicks(script, t0, a.tickTimes).state).toEqual(b.state);
        if (a.tickTimes.length > 0) ticked++;
        if (distractionCount(a.state) > 0) ghosts++;
      }),
      PROP_PARAMS,
    );
    expect(ticked).toBeGreaterThanOrEqual(100);
    expect(ghosts).toBeGreaterThanOrEqual(50);
  });
});
