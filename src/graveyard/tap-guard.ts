// The tap and focus rule of the graveyard view (ghosts-and-graveyard Decision D11, R5.6 to R5.8). Pure: a tiny state machine.
// A touch tap focuses a button in most browsers, so without a rule one tap would show the card (focus) and the click would hide it.
// The rule: a touch or pen pointerdown on an item marks the gesture; the focus event that follows is dropped; the click is the tap.

export interface TapGuard {
  /** The id of the item with a touch or pen gesture in progress, or null. */
  readonly gesture: string | null;
}

export const NO_GESTURE: TapGuard = { gesture: null };

const isTouchLike = (pointerType: string): boolean => pointerType === "touch" || pointerType === "pen";

/**
 * A pointerdown. On an item with a touch or pen: the gesture starts. A touch or pen anywhere else is a tap-away (R5.8). A mouse
 * pointerdown ends any gesture and is neither (the hover card is already shown, R5.4).
 */
export function guardDown(guard: TapGuard, pointerType: string, itemId: string | null): { guard: TapGuard; away: boolean } {
  if (!isTouchLike(pointerType)) return { guard: NO_GESTURE, away: false };
  if (itemId === null) return { guard: NO_GESTURE, away: true };
  return { guard: { gesture: itemId }, away: false };
}

/** A focus event on an item: dropped when it belongs to the touch gesture on that same item (D11). The gesture stays until the click. */
export function guardFocus(guard: TapGuard, itemId: string): { guard: TapGuard; drop: boolean } {
  return { guard, drop: guard.gesture === itemId };
}

/** A click on an item: it is a tap exactly when the touch gesture was on that item. The gesture ends. */
export function guardClick(guard: TapGuard, itemId: string): { guard: TapGuard; tap: boolean } {
  return { guard: NO_GESTURE, tap: guard.gesture === itemId };
}

/** A key press or a cancelled pointer ends the gesture, so a later keyboard focus of the same item is never dropped. */
export function guardReset(): TapGuard {
  return NO_GESTURE;
}
