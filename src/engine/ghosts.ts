import { GHOST_FULL_SIZE_MS, GHOST_MIN_SIZE } from "./constants";
import type { State } from "./types";

const NO_SPANS: readonly number[] = Object.freeze([]);

/** Completed distractions of the current session; 0 for idle (R9.2). */
export function distractionCount(state: State): number {
  return state.phase === "idle" ? 0 : state.session.distractions;
}

/**
 * The completed spans of the current session, oldest first; one ghost per element
 * (R9.1, R9.2). Empty for idle. Does not depend on `now`: an open hide has no ghost
 * until it is closed (R9.3).
 */
export function ghostSpansMs(state: State): readonly number[] {
  return state.phase === "idle" ? NO_SPANS : state.session.awaySpansMs;
}

/**
 * Ghost size for a span, in [GHOST_MIN_SIZE, 1] (R9.2): a floor so that every counted
 * distraction is visible, a square-root curve, full size from GHOST_FULL_SIZE_MS on.
 * A negative or NaN span maps to the floor.
 */
export function ghostSize(spanMs: number): number {
  const f = Number.isNaN(spanMs) ? 0 : Math.min(1, Math.max(0, spanMs) / GHOST_FULL_SIZE_MS);
  return GHOST_MIN_SIZE + (1 - GHOST_MIN_SIZE) * Math.sqrt(f);
}
