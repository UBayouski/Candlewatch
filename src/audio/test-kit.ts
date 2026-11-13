// Shared arbitraries and the reference model for the audio property tests. Test-only: never imported by a shipped file.
import * as fc from "fast-check";
import { INITIAL_STATE, step } from "../engine";
import type { Event, State } from "../engine";
import { arbGap, arbScript, arbT0, makeArbScript, runScript } from "../engine/test-kit";
import type { StepKind } from "../engine/test-kit";
import type { Cue } from "./types";

export { PROP_PARAMS } from "../engine/test-kit";

export type Phase = State["phase"];
export const PHASES: readonly Phase[] = ["idle", "lit", "paused", "burned-out", "snuffed"];

/** The engine's event names. */
export const EVENT_TYPES: readonly Event["type"][] = ["light", "pause", "resume", "snuff", "tick", "hide", "show", "reload"];
/** Every event type except `reload`. */
export const LIVE_EVENT_TYPES: readonly Event["type"][] = EVENT_TYPES.filter((t) => t !== "reload");

const MIN = 60_000;

/** One state of each phase, built with the engine at `t0`; the ended ones end at `endedAt` when given. */
export function stateOf(phase: Phase, t0: number, endedAt?: number): State {
  const lit = step(INITIAL_STATE, { type: "light", length: 25 }, t0);
  switch (phase) {
    case "idle":
      return INITIAL_STATE;
    case "lit":
      return lit;
    case "paused":
      return step(lit, { type: "pause" }, t0 + MIN);
    case "burned-out": {
      const s = step(lit, { type: "tick" }, t0 + 25 * MIN);
      return s.phase === "burned-out" && endedAt !== undefined ? { ...s, endedAt, breakEndsAt: endedAt + 5 * MIN } : s;
    }
    case "snuffed": {
      const s = step(lit, { type: "snuff" }, t0 + 7 * MIN);
      return s.phase === "snuffed" && endedAt !== undefined ? { ...s, endedAt } : s;
    }
  }
}

/** The `endedAt` of an ended state, or `t0` for the others (used to place `now` near the end). */
export const endOf = (s: State, t0: number): number => (s.phase === "burned-out" || s.phase === "snuffed" ? s.endedAt : t0);

/** Scripts that lean on the events that change phase (light, snuff, pause, resume) and on long gaps that burn a candle out. */
export const arbCueScript = makeArbScript({
  gap: fc.oneof(arbGap, fc.integer({ min: 5 * MIN, max: 2 * 3_600_000 })),
  kinds: fc.constantFrom<StepKind>("light", "light", "snuff", "snuff", "pause", "resume", "tick", "tick", "hide", "show", "reload"),
});

/** Every kind of Transition the engine makes, built with `step` at `t0`: the before and after states and the event's type. */
export const TRANSITION_KINDS = [
  "light-from-idle",
  "pause",
  "resume",
  "burn-out",
  "snuff-lit",
  "snuff-paused",
  "pause-limit",
  "light-after-dawn",
  "light-after-dark",
] as const;
export type TransitionKind = (typeof TRANSITION_KINDS)[number];

export function transition(kind: TransitionKind, t0: number): { prev: State; next: State; eventType: Event["type"]; now: number } {
  const lit = stateOf("lit", t0);
  const paused = stateOf("paused", t0);
  switch (kind) {
    case "light-from-idle":
      return { prev: INITIAL_STATE, next: lit, eventType: "light", now: t0 };
    case "pause":
      return { prev: lit, next: paused, eventType: "pause", now: t0 + MIN };
    case "resume":
      return { prev: paused, next: step(paused, { type: "resume" }, t0 + 2 * MIN), eventType: "resume", now: t0 + 2 * MIN };
    case "burn-out":
      return { prev: lit, next: step(lit, { type: "tick" }, t0 + 25 * MIN), eventType: "tick", now: t0 + 25 * MIN };
    case "snuff-lit":
      return { prev: lit, next: step(lit, { type: "snuff" }, t0 + 3 * MIN), eventType: "snuff", now: t0 + 3 * MIN };
    case "snuff-paused":
      return { prev: paused, next: step(paused, { type: "snuff" }, t0 + 2 * MIN), eventType: "snuff", now: t0 + 2 * MIN };
    case "pause-limit":
      return { prev: paused, next: step(paused, { type: "tick" }, t0 + 12 * MIN), eventType: "tick", now: t0 + 12 * MIN };
    case "light-after-dawn": {
      const prev = stateOf("burned-out", t0);
      const now = t0 + 40 * MIN;
      return { prev, next: step(prev, { type: "light", length: 25 }, now), eventType: "light", now };
    }
    case "light-after-dark": {
      const prev = stateOf("snuffed", t0);
      const now = t0 + 40 * MIN;
      return { prev, next: step(prev, { type: "light", length: 25 }, now), eventType: "light", now };
    }
  }
}

/** States picked out of engine traces, any phase. */
const arbTraceState: fc.Arbitrary<State> = fc
  .tuple(arbScript, arbT0, fc.nat())
  .map(([script, t0, pick]) => {
    const trace = runScript(script, t0);
    const states = [INITIAL_STATE, ...trace.map((e) => e.after)];
    return states[pick % states.length] ?? INITIAL_STATE;
  });

/** A state of the given phase: from a trace when one has it, else hand-built with a chosen `endedAt`. */
const arbStateOfPhase = (phase: Phase): fc.Arbitrary<State> =>
  fc.oneof(
    fc.tuple(arbT0, fc.integer({ min: 0, max: 3_600_000 })).map(([t0, d]) => stateOf(phase, t0, t0 + d)),
    arbTraceState.filter((s) => s.phase === phase),
  );

/** All 25 ordered phase pairs, each pair a pair of states of those phases. */
export const arbPhasePair: fc.Arbitrary<{ prev: State; next: State }> = fc
  .tuple(fc.constantFrom(...PHASES), fc.constantFrom(...PHASES))
  .chain(([p, n]) => fc.record({ prev: arbStateOfPhase(p), next: arbStateOfPhase(n) }));

/** Offsets of `now` from the end instant: the limit's edges, zero, large values and negative ones. */
export const arbOffset = fc.oneof(
  fc.constantFrom(0, 119999, 120000, 120001, -1, -200000, 10 * 3_600_000),
  fc.integer({ min: -200000, max: 400000 }),
  fc.integer({ min: 120001, max: 48 * 3_600_000 }),
);

/** A context: any event type, any sound, `now` placed by an offset from `base` (the end instant of the next state). */
export const arbCueContext = (base: number): fc.Arbitrary<{ eventType: Event["type"]; sound: boolean; now: number }> =>
  fc.record({ eventType: fc.constantFrom(...EVENT_TYPES), sound: fc.boolean(), now: arbOffset.map((o) => base + o) });

export const arbCue: fc.Arbitrary<Cue> = fc.constantFrom<Cue>("strike", "chime", "breath");

/** One step of a script against the Audio_Player (P10, P15). */
export type GestureStep =
  | { readonly kind: "gesture" }
  | { readonly kind: "request"; readonly cue: Cue }
  | { readonly kind: "setSound"; readonly on: boolean }
  | { readonly kind: "advance"; readonly ms: number }
  | { readonly kind: "settle" };

/** Short advances (inside a fade, inside the 50 ms bound) and long ones (past the end of a Cue). */
export const arbAdvanceMs: fc.Arbitrary<number> = fc.oneof(fc.integer({ min: 0, max: 80 }), fc.integer({ min: 0, max: 2500 }));

const arbGestureStep: fc.Arbitrary<GestureStep> = fc.oneof(
  { weight: 2, arbitrary: fc.constant<GestureStep>({ kind: "gesture" }) },
  { weight: 4, arbitrary: arbCue.map((cue): GestureStep => ({ kind: "request", cue })) },
  { weight: 2, arbitrary: fc.boolean().map((on): GestureStep => ({ kind: "setSound", on })) },
  { weight: 3, arbitrary: arbAdvanceMs.map((ms): GestureStep => ({ kind: "advance", ms })) },
  { weight: 2, arbitrary: fc.constant<GestureStep>({ kind: "settle" }) },
);

/** A list of gestures, Cue requests, sound-setting changes, clock advances and promise settles. */
export const arbGestureScript: fc.Arbitrary<GestureStep[]> = fc.array(arbGestureStep, { maxLength: 30 });

/**
 * The reference: written from the requirements, not from cue.ts. A lookup by "<prev>><next>" and a lateness test.
 * `lateness` is `now - endedAt` for end Cues (ignored otherwise).
 */
export function referenceCue(prevPhase: Phase, nextPhase: Phase, eventType: Event["type"], sound: boolean, lateness: number): Cue | null {
  if (!sound || eventType === "reload") return null;
  const table: Readonly<Record<string, Cue>> = {
    "idle>lit": "strike",
    "burned-out>lit": "strike",
    "snuffed>lit": "strike",
    "lit>burned-out": "chime",
    "paused>burned-out": "chime",
    "lit>snuffed": "breath",
    "paused>snuffed": "breath",
  };
  const cue = table[`${prevPhase}>${nextPhase}`] ?? null;
  if (cue === null || cue === "strike") return cue;
  if (!Number.isFinite(lateness)) return null;
  return !(lateness > 120000) ? cue : null;
}
