// Shared arbitraries and helpers for the engine's property tests. Imported only by tests.
import * as fc from "fast-check";
import { BREAK_MS, MAX_LENGTH_MIN, MIN_LENGTH_MIN, MS_PER_MINUTE, PAUSE_LIMIT_MS } from "./constants";
import { normalizeIntent } from "./intent";
import { restoreState, serializeHistory, serializeSession } from "./serialize";
import { step } from "./step";
import { INITIAL_STATE } from "./types";
import type { Event, HistoryEntry, State } from "./types";

/** Shared `fc.assert` settings for every property test. */
export const PROP_PARAMS = { numRuns: 300 } as const;

export type StepKind = "light" | "pause" | "resume" | "snuff" | "tick" | "hide" | "show" | "reload";

/** One scripted step: the gap since the previous step plus the data the event needs. */
export interface ScriptStep {
  readonly kind: StepKind;
  /** Milliseconds since the previous step (may be negative in "signed" scripts). */
  readonly gap: number;
  /** Used by `light`; may be an invalid length in "wild" scripts. */
  readonly length: number;
  readonly intent: string | undefined;
  /** When set on a `reload` step, the stored text fed to `restoreState` instead of a real round trip. */
  readonly junk: string | undefined;
}

export interface TraceEntry {
  readonly step: ScriptStep;
  readonly event: Event;
  readonly now: number;
  readonly before: State;
  readonly after: State;
}

// --- arbitraries ------------------------------------------------------------

/** A realistic start time in epoch milliseconds. */
export const arbT0 = fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 });

/** Non-negative gaps: mostly fast, sometimes minutes, rarely a laptop sleep. */
export const arbGap = fc.oneof(
  { weight: 4, arbitrary: fc.integer({ min: 0, max: 5_000 }) },
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 120_000 }) },
  { weight: 1, arbitrary: fc.integer({ min: 0, max: 4 * 3_600_000 }) },
);

/** Gaps that may be negative, for a clock that moves backwards. */
export const arbSignedGap = fc.integer({ min: -60_000, max: 120_000 });

export const arbLength = fc.oneof(fc.constantFrom(15, 25, 50), fc.integer({ min: MIN_LENGTH_MIN, max: MAX_LENGTH_MIN }));

export const arbBadLength = fc.oneof(
  fc.integer({ min: -10, max: MIN_LENGTH_MIN - 1 }),
  fc.integer({ min: MAX_LENGTH_MIN + 1, max: 500 }),
  fc.double({ noInteger: true, noNaN: true, noDefaultInfinity: true, min: -1000, max: 1000 }),
  fc.constantFrom(NaN, Infinity, -Infinity),
);

const arbIntentText = fc.oneof(
  fc.string({ unit: "grapheme", maxLength: 100 }),
  fc.string({ unit: "binary", maxLength: 100 }), // includes lone surrogates
  fc
    .array(fc.constantFrom("a", "\u00E9", "\u65E5\u672C", "\u{1F600}", "\n", "  ", '"', "\\"), { maxLength: 120 })
    .map((parts) => parts.join("")),
);

export const arbIntent = fc.option(arbIntentText, { nil: undefined });

const arbKind = fc.constantFrom<StepKind>(
  "tick", "tick", "tick", "tick",
  "pause", "pause", "pause",
  "resume", "resume", "resume",
  "light", "light",
  "snuff",
  "hide", "show",
  "reload", "reload",
);

const arbJunk = fc.option(
  fc.oneof(
    fc.string({ maxLength: 60 }),
    fc.json(),
    fc.constantFrom("{", "null", '{"v":1}', '{"v":1,"phase":"lit"}', '{"v":9}', "[]", ""),
  ),
  { nil: undefined },
);

export interface ScriptOptions {
  readonly gap: fc.Arbitrary<number>;
  /** Mixes in invalid lengths and junk reload text. */
  readonly wild?: boolean;
  readonly maxLength?: number;
}

export function makeArbScript(options: ScriptOptions): fc.Arbitrary<ScriptStep[]> {
  const wild = options.wild === true;
  const arbStep = fc.record<ScriptStep>({
    kind: arbKind,
    gap: options.gap,
    length: wild
      ? fc.oneof({ weight: 3, arbitrary: arbLength }, { weight: 1, arbitrary: arbBadLength })
      : arbLength,
    intent: arbIntent,
    junk: wild ? arbJunk : fc.constant(undefined),
  });
  return fc.array(arbStep, { maxLength: options.maxLength ?? 60 });
}

/** Valid steps with non-decreasing times. */
export const arbScript = makeArbScript({ gap: arbGap });
/** Invalid lengths, junk reloads and small negative gaps allowed. */
export const arbWildScript = makeArbScript({ gap: arbSignedGap, wild: true });
/** Valid steps with a clock that may move backwards. */
export const arbSignedScript = makeArbScript({ gap: arbSignedGap });

export const arbEntry: fc.Arbitrary<HistoryEntry> = fc
  .record({
    startedAt: fc.integer({ min: 0, max: 2_000_000_000_000 }),
    span: fc.integer({ min: 0, max: 100 * MS_PER_MINUTE }),
    lengthMin: arbLength,
    intent: arbIntent.map((raw) => normalizeIntent(raw)),
    outcome: fc.constantFrom<HistoryEntry["outcome"]>("burned-out", "snuffed"),
    distractions: fc.integer({ min: 0, max: 20 }),
    timeAwayMs: fc.integer({ min: 0, max: 10_000_000 }),
  })
  .map(({ startedAt, span, ...rest }) => ({ startedAt, endedAt: startedAt + span, ...rest }));

export const arbHistory = fc.array(arbEntry, { maxLength: 40 });

// --- running a script -------------------------------------------------------

function toEvent(s: ScriptStep, state: State): Event {
  switch (s.kind) {
    case "light":
      return s.intent === undefined
        ? { type: "light", length: s.length }
        : { type: "light", length: s.length, intent: s.intent };
    case "reload": {
      const restored =
        s.junk !== undefined
          ? restoreState(s.junk, s.junk)
          : restoreState(serializeSession(state), serializeHistory(state.history));
      return { type: "reload", state: restored };
    }
    default:
      return { type: s.kind };
  }
}

/**
 * Runs a script through `step`. Absolute times are `t0` plus the running sum of
 * the gaps. A `reload` step is a real serialize and restore round trip. Never
 * reads a clock.
 */
export function runScript(script: readonly ScriptStep[], t0: number, initial: State = INITIAL_STATE): TraceEntry[] {
  const trace: TraceEntry[] = [];
  let now = t0;
  let state = initial;
  for (const s of script) {
    now += s.gap;
    const event = toEvent(s, state);
    const after = step(state, event, now);
    trace.push({ step: s, event, now, before: state, after });
    state = after;
  }
  return trace;
}

// --- invariants -------------------------------------------------------------

function fail(message: string): never {
  throw new Error(`invariant violated: ${message}`);
}

function isCount(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
}

/** Throws if the state breaks a structural rule that must always hold. */
export function assertInvariants(state: State): void {
  for (const e of state.history) {
    if (!isCount(e.startedAt) || !isCount(e.endedAt) || e.endedAt < e.startedAt) fail("history entry times");
    if (!Number.isInteger(e.lengthMin) || e.lengthMin < MIN_LENGTH_MIN || e.lengthMin > MAX_LENGTH_MIN) {
      fail("history entry length");
    }
    if (e.outcome !== "burned-out" && e.outcome !== "snuffed") fail("history entry outcome");
    if (!isCount(e.distractions) || !isCount(e.timeAwayMs)) fail("history entry counters");
    if (e.intent !== null && typeof e.intent !== "string") fail("history entry intent");
  }

  if ("breakEndsAt" in state !== (state.phase === "burned-out")) fail("breakEndsAt only on burned-out");
  if ("session" in state !== (state.phase !== "idle")) fail("session present unless idle");
  if (state.phase === "idle") return;

  const { session } = state;
  if (!isCount(session.startedAt)) fail("startedAt");
  if (!Number.isInteger(session.lengthMin) || session.lengthMin < MIN_LENGTH_MIN || session.lengthMin > MAX_LENGTH_MIN) {
    fail("session length");
  }
  if (!isCount(session.pausedTotalMs) || session.pausedTotalMs > PAUSE_LIMIT_MS) fail("pausedTotalMs within limit");
  if (!isCount(session.distractions) || !isCount(session.timeAwayMs)) fail("session counters");
  if (session.intent !== null && typeof session.intent !== "string") fail("session intent");

  const lengthMs = session.lengthMin * MS_PER_MINUTE;
  const base = session.startedAt + session.pausedTotalMs;

  switch (state.phase) {
    case "lit":
      if (!isCount(state.litSince) || state.litSince < base) fail("litSince after start plus pauses");
      if (state.litSince >= base + lengthMs) fail("litSince before completion");
      return;
    case "paused":
      if (!isCount(state.pausedAt) || state.pausedAt < base) fail("pausedAt after start plus pauses");
      if (state.pausedAt - base >= lengthMs) fail("burn at pausedAt below length");
      return;
    case "burned-out":
    case "snuffed": {
      if (!isCount(state.endedAt) || state.endedAt < session.startedAt) fail("endedAt");
      if (state.phase === "burned-out" && state.breakEndsAt !== state.endedAt + BREAK_MS) fail("breakEndsAt = endedAt + 5 min");
      const outcome = state.phase;
      const recorded = state.history.some(
        (e) => e.startedAt === session.startedAt && e.endedAt === state.endedAt && e.outcome === outcome,
      );
      if (!recorded) fail("final session is in history");
      return;
    }
  }
}
