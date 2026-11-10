import { BREAK_MS } from "./constants";
import { appendEntry, entryOf } from "./history";
import { completionAt, pauseLimitAt } from "./time";
import type { BurnedOutState, LitState, PausedState, SnuffedState, State } from "./types";

/** Ends a lit session as burned-out at `end`, with its break window (R5.1, R7.1). */
export function endBurnedOut(s: LitState, end: number): BurnedOutState {
  return {
    phase: "burned-out",
    session: s.session,
    endedAt: end,
    breakEndsAt: end + BREAK_MS,
    history: appendEntry(s.history, entryOf(s.session, end, "burned-out")),
  };
}

/** Ends a lit or paused session as snuffed at `end` (R3.5, R6.1). */
export function endSnuffed(s: LitState | PausedState, end: number): SnuffedState {
  return {
    phase: "snuffed",
    session: s.session,
    endedAt: end,
    history: appendEntry(s.history, entryOf(s.session, end, "snuffed")),
  };
}

/**
 * Moves a session that has already ended, by timestamps, into its final phase
 * (R5.1, R5.2). The end is dated to the true instant, not to `now`. Idempotent;
 * returns the same reference when nothing is due.
 */
export function settle(s: State, now: number): State {
  if (s.phase === "lit") {
    const c = completionAt(s);
    if (now >= c) return endBurnedOut(s, c);
  } else if (s.phase === "paused") {
    const limit = pauseLimitAt(s);
    if (now > limit) return endSnuffed(s, limit);
  }
  return s;
}
