// How long the Hidden_Tick may sleep (sound-and-title design 3.6, R5.3 to R5.5). Pure and total.
import { pauseLeftMs, timeLeftMs } from "../engine";
import type { State } from "../engine";

/** Longest sleep: one second (R5.2, R5.3). */
export const WAKE_MAX_MS = 1000;
/** Shortest sleep: one millisecond (R5.4, R5.5). Never 0, so a timer never re-arms in a tight loop. */
export const WAKE_MIN_MS = 1;

/** The clamp of design 3.6: NaN looks again in a second (never spins); otherwise inside [WAKE_MIN_MS, WAKE_MAX_MS]. */
export function clampWake(ms: number): number {
  if (Number.isNaN(ms)) return WAKE_MAX_MS;
  return Math.min(Math.max(ms, WAKE_MIN_MS), WAKE_MAX_MS);
}

/** Delay in (0, 1000] ms for `lit` and `paused`; null for `idle`, `burned-out` and `snuffed`. Total. */
export function nextWakeMs(state: State, now: number): number | null {
  switch (state.phase) {
    case "lit":
      return clampWake(timeLeftMs(state, now));
    case "paused":
      return clampWake(pauseLeftMs(state, now));
    case "idle":
    case "burned-out":
    case "snuffed":
      return null;
  }
}
