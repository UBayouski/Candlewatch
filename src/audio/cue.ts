// Which Cue a Transition plays (sound-and-title design 3.1; R2, D5, D29). Pure and total: the two states and the context in, one
// Cue or null out. It reads the phases and, for the end Cues only, `next.endedAt`.
import type { State } from "../engine";
import type { Cue, CueContext } from "./types";

/** Greatest lateness at which an end cue still plays: two minutes (R2.11, D5). */
export const LATE_CUE_LIMIT_MS = 120000;

/**
 * True when an end Cue for a state that ended at `endedAt` is still on time at `now` (D29: not clamped, so a negative lateness plays).
 * A non-finite lateness is never on time: `<=` alone would let `now = -Infinity` through, so finiteness is checked first.
 */
function onTime(now: number, endedAt: number): boolean {
  const lateness = now - endedAt;
  return Number.isFinite(lateness) && lateness <= LATE_CUE_LIMIT_MS;
}

/** Total and pure. Exactly one of "strike", "chime", "breath", or null. The six rules of design 3.1, tried in order. */
export function cueFor(prev: State, next: State, context: CueContext): Cue | null {
  // 1. Sound off: nothing (R2.7).
  if (!context.sound) return null;
  // 2. A reload never plays (R2.6).
  if (context.eventType === "reload") return null;
  const from = prev.phase;
  const lighting = from === "idle" || from === "burned-out" || from === "snuffed";
  const running = from === "lit" || from === "paused";
  // 3. Lighting strikes, whatever the delay (R2.2, R2.12).
  if (lighting && next.phase === "lit") return "strike";
  // 4. The dawn chimes, when found within the Late_Cue_Limit (R2.3, R2.11).
  if (running && next.phase === "burned-out") return onTime(context.now, next.endedAt) ? "chime" : null;
  // 5. Going dark breathes out, within the same limit (R2.4, R2.11).
  if (running && next.phase === "snuffed") return onTime(context.now, next.endedAt) ? "breath" : null;
  // 6. Anything else.
  return null;
}
