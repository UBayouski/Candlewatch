// The first-gesture listener (sound-and-title design 3.4; R4.2, R4.4, R4.6, R4.16, R4.17). Effect file with no global: the target
// is injected (`document` in main.ts, a fake in tests).

export type GestureEventName = "keydown" | "pointerdown" | "touchend";

/** The part of EventTarget the arming uses. */
export interface GestureTarget {
  addEventListener(type: GestureEventName, listener: () => void, options: { capture: true; passive?: boolean }): void;
  removeEventListener(type: GestureEventName, listener: () => void, options: { capture: true }): void;
}

const EVENTS: readonly GestureEventName[] = ["keydown", "pointerdown", "touchend"];

/**
 * Listen for the first gesture. Returns `disarm`, which removes all three listeners and is safe to call more than once.
 * `wanted()` is the `sound` setting; `unlock()` is `player.unlock`.
 */
export function armFirstGesture(target: GestureTarget, wanted: () => boolean, unlock: () => boolean): () => void {
  let armed = true;

  const disarm = (): void => {
    if (!armed) return;
    armed = false;
    for (const type of EVENTS) target.removeEventListener(type, handler, { capture: true });
  };

  // Never calls preventDefault or stopPropagation: the gesture goes on to the controls as usual.
  function handler(): void {
    if (!wanted()) return; // sound off: create nothing, stay armed (R4.6)
    try {
      unlock();
    } catch {
      /* a failing unlock is silent; the player is failed for good */
    }
    disarm(); // in the same dispatch, also when unlock() returned false (design 3.4)
  }

  for (const type of EVENTS) {
    target.addEventListener(type, handler, type === "touchend" ? { capture: true, passive: true } : { capture: true });
  }
  return disarm;
}
