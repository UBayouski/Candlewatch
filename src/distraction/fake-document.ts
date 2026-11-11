// Test-only: a stand-in for `document` with a controllable visibility state.
// Imported only by tests (the purity test enforces it).
import type { VisibilityTarget } from "./visibility";

export interface FakeDocument extends VisibilityTarget {
  /** Sets `visibilityState`, then calls every registered listener (like a `visibilitychange` event). */
  setVisibility(state: string): void;
  /** How many listeners are registered; shows that unsubscribing worked. */
  listenerCount(): number;
}

export function createFakeDocument(initial: "visible" | "hidden" = "visible"): FakeDocument {
  let state: string = initial;
  const listeners = new Set<() => void>();
  return {
    get visibilityState(): string {
      return state;
    },
    addEventListener(_type, listener): void {
      listeners.add(listener);
    },
    removeEventListener(_type, listener): void {
      listeners.delete(listener);
    },
    setVisibility(next: string): void {
      state = next;
      for (const listener of [...listeners]) listener();
    },
    listenerCount(): number {
      return listeners.size;
    },
  };
}
