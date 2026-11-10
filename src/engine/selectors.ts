import { burnMs, lengthMs } from "./time";
import type { State } from "./types";

/**
 * Time left in ms, in [0, session length] (R4.4). Zero when there is no running
 * candle (idle, burned-out, snuffed) or when `now` is not finite (R12.4).
 * Does not settle: a lit state whose completion has passed reads as the true
 * value until the next `tick` settles it.
 */
export function timeLeftMs(state: State, now: number): number {
  if (!Number.isFinite(now)) return 0;
  if (state.phase !== "lit" && state.phase !== "paused") return 0;
  return lengthMs(state.session) - burnMs(state, Math.floor(now));
}

/** Time left divided by session length, in [0, 1] (R4.6). */
export function waxFraction(state: State, now: number): number {
  if (state.phase !== "lit" && state.phase !== "paused") return 0;
  const length = lengthMs(state.session);
  return length > 0 ? timeLeftMs(state, now) / length : 0;
}

/** True exactly while the phase is burned-out and `now` is before `breakEndsAt` (R7.2). */
export function isBreak(state: State, now: number): boolean {
  if (!Number.isFinite(now)) return false;
  return state.phase === "burned-out" && now < state.breakEndsAt;
}
