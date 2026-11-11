import type { LitState } from "./types";

/**
 * Opens a hide at `max(at, litSince)` (R1.1). Returns the same state when a hide
 * is already open (R3.2). Touches no timer field (R5.1).
 */
export function openHide(s: LitState, at: number): LitState {
  if (s.awaySince !== null) return s;
  return { ...s, awaySince: Math.max(at, s.litSince) };
}

/**
 * Closes the open hide at `max(at, awaySince)` (R2.1, R4.1): the span is never
 * negative. Adds one to the count and the span to the total and to the list of
 * spans, and clears the open hide (R2.2). Returns the same state when no hide is
 * open. Touches no timer field (R5.1).
 */
export function closeHide(s: LitState, at: number): LitState {
  if (s.awaySince === null) return s;
  const closeAt = Math.max(at, s.awaySince);
  const span = closeAt - s.awaySince;
  return {
    ...s,
    awaySince: null,
    session: {
      ...s.session,
      distractions: s.session.distractions + 1,
      timeAwayMs: s.session.timeAwayMs + span,
      awaySpansMs: [...s.session.awaySpansMs, span],
    },
  };
}
