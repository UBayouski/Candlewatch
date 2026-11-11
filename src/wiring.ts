// Connects the Page Visibility API to the engine (controls-and-access R12, distraction-tracking R11).
// Everything is injected so the order can be tested without a page: sync once right after the reload step, then watch.
import { syncVisibility, watchVisibility } from "./distraction/visibility";
import type { VisibilityEventType, VisibilityTarget } from "./distraction/visibility";

export interface VisibilityDeps {
  /** `document`, or null when there is none (then nothing is wired and nothing fails). */
  readonly target: VisibilityTarget | null;
  readonly clock: () => number;
  /** Delivers `hide` or `show` to the engine's one dispatch. */
  readonly dispatch: (event: { readonly type: VisibilityEventType }, now: number) => void;
}

/**
 * Sends the event for the current visibility once (a persisted open hide is closed or kept), then one event per
 * `visibilitychange` for the life of the page. Returns the function that stops listening, or null with no target.
 */
export function wireVisibility(deps: VisibilityDeps): (() => void) | null {
  const { target, clock, dispatch } = deps;
  if (target === null) return null;
  const wiring = { target, clock, send: (type: VisibilityEventType, now: number): void => dispatch({ type }, now) };
  syncVisibility(wiring);
  return watchVisibility(wiring);
}
