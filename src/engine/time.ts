import { MS_PER_MINUTE, PAUSE_LIMIT_MS } from "./constants";
import type { LitState, PausedState, Session, State } from "./types";

/** Session length in ms. */
export function lengthMs(session: Session): number {
  return session.lengthMin * MS_PER_MINUTE;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

/** The instant a lit session completes: start + all closed pauses + length (R5.1). */
export function completionAt(s: LitState): number {
  return s.session.startedAt + s.session.pausedTotalMs + lengthMs(s.session);
}

/** The instant the 10-minute pause allowance runs out: pause start + remaining allowance (R3.5). */
export function pauseLimitAt(s: PausedState): number {
  return s.pausedAt + (PAUSE_LIMIT_MS - s.session.pausedTotalMs);
}

/**
 * Burn time in ms, from timestamps only (R4.1).
 * Lit: `now` is clamped up to `litSince` so a clock that moved backwards counts
 * as zero elapsed (R4.5). Paused: burn is frozen at `pausedAt`.
 */
export function burnMs(s: State, now: number): number {
  if (s.phase === "lit") {
    const { startedAt, pausedTotalMs } = s.session;
    return clamp(Math.max(now, s.litSince) - startedAt - pausedTotalMs, 0, lengthMs(s.session));
  }
  if (s.phase === "paused") {
    const { startedAt, pausedTotalMs } = s.session;
    return clamp(s.pausedAt - startedAt - pausedTotalMs, 0, lengthMs(s.session));
  }
  return 0;
}
