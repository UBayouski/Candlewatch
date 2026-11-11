// Turns the Page Visibility API into `hide` and `show` events (distraction-tracking R11).
// Outside the engine: the engine never imports this module. Every global is injected.

export type VisibilityEventType = "hide" | "show";

/** What this module needs from `document`. */
export interface VisibilityTarget {
  readonly visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface VisibilityWiring {
  readonly target: VisibilityTarget;
  /** Returns "now" in epoch milliseconds. `main.ts` passes `Date.now`. */
  readonly clock: () => number;
  /** Delivers the event. `main.ts` runs `step` and then saves. */
  readonly send: (type: VisibilityEventType, now: number) => void;
}

/** `hidden` is a `hide`; anything else (`visible`, unknown values) is a `show` (R11.3). */
export function eventFor(visibilityState: string): VisibilityEventType {
  return visibilityState === "hidden" ? "hide" : "show";
}

/**
 * Sends `hide` or `show` on every `visibilitychange` (R11.3).
 * Returns the function that stops listening.
 */
export function watchVisibility(wiring: VisibilityWiring): () => void {
  const { target, clock, send } = wiring;
  const listener = (): void => {
    send(eventFor(target.visibilityState), clock());
  };
  target.addEventListener("visibilitychange", listener);
  return () => {
    target.removeEventListener("visibilitychange", listener);
  };
}

/**
 * Sends the event that matches the current visibility, once (R11.3). Call it right
 * after a reload: `show` closes a persisted open hide; `hide` is ignored by the
 * engine when a hide is already open.
 */
export function syncVisibility(wiring: VisibilityWiring): void {
  const { target, clock, send } = wiring;
  send(eventFor(target.visibilityState), clock());
}

/** `document` as a `VisibilityTarget`, or null when there is none or access throws. */
export function browserVisibilityTarget(): VisibilityTarget | null {
  try {
    if (typeof document === "undefined") return null;
    const doc = document;
    return {
      get visibilityState(): string {
        return doc.visibilityState;
      },
      addEventListener(type, listener): void {
        doc.addEventListener(type, listener);
      },
      removeEventListener(type, listener): void {
        doc.removeEventListener(type, listener);
      },
    };
  } catch {
    return null;
  }
}
