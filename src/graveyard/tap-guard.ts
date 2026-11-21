// The tap and focus rule of the graveyard view (ghosts-and-graveyard Decision D11, R5.6 to R5.8; amendment 2026-11-20, D24, R5.16 to R5.22).
// A touch tap focuses a button in most browsers, so without a rule one tap would show the card (focus) and the click would hide it.
// The rule: a touch or pen pointerdown on an item marks the gesture; the focus event that follows is dropped; the click is the tap.
// D24 adds the kind of the last input. A focus that a pointer caused is not keyboard focus (card.ts: "keyboard focus, not a pointer's"):
// any pointerdown, of any type and anywhere, makes the modality "pointer", and a key press makes it "keyboard". While it is "pointer"
// the focus is dropped for card purposes. The element keeps its real DOM focus; the caller still remembers it and sets the tab stops.

export type Modality = "keyboard" | "pointer";

export interface TapGuard {
  /** The id of the item with a touch or pen gesture in progress, or null. */
  readonly gesture: string | null;
  /** The kind of the last input: a pointerdown ("pointer") or a key press, which is also the start ("keyboard"). */
  readonly modality: Modality;
}

export const NO_GESTURE: TapGuard = { gesture: null, modality: "keyboard" };

const isTouchLike = (pointerType: string): boolean => pointerType === "touch" || pointerType === "pen";

/**
 * A pointerdown, of any type and on anything. The modality becomes "pointer". On an item with a touch or pen: the gesture starts. A
 * touch or pen anywhere else is a tap-away (R5.8). A mouse pointerdown ends any gesture and is neither (the hover card is already
 * shown, R5.4).
 */
export function guardDown(guard: TapGuard, pointerType: string, itemId: string | null): { guard: TapGuard; away: boolean } {
  if (!isTouchLike(pointerType)) return { guard: { gesture: null, modality: "pointer" }, away: false };
  if (itemId === null) return { guard: { gesture: null, modality: "pointer" }, away: true };
  return { guard: { gesture: itemId, modality: "pointer" }, away: false };
}

/**
 * A focus event on an item: dropped for card purposes while the last input was a pointer's, which includes the touch gesture on
 * that same item (D11, D24). The gesture stays until the click.
 */
export function guardFocus(guard: TapGuard, itemId: string): { guard: TapGuard; drop: boolean } {
  return { guard, drop: guard.modality === "pointer" || guard.gesture === itemId };
}

/** A click on an item: it is a tap exactly when the touch gesture was on that item. The gesture ends; the modality stays. */
export function guardClick(guard: TapGuard, itemId: string): { guard: TapGuard; tap: boolean } {
  return { guard: { gesture: null, modality: guard.modality }, tap: guard.gesture === itemId };
}

/** A key press: the gesture ends and the modality is "keyboard", so a later focus follows the card and is never dropped. */
export function guardReset(): TapGuard {
  return NO_GESTURE;
}

/** A cancelled pointer, or the view closing: the gesture ends and the modality stays, since no key was pressed. */
export function guardCancel(guard: TapGuard): TapGuard {
  return { gesture: null, modality: guard.modality };
}
