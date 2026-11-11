// Where the graveyard view puts things, in room units (600 x 1000 viewBox). Design 3.4, Section 1 (L1, L6 to L10, D14, D17).
// Pure: numbers in, rectangles out. The view is laid out in stage units, so one set of numbers holds on every viewport (L6).
import type { Rect } from "../ui/layout";

export type { Rect };

/** The Door and the back-door control share one rectangle, so focus returns to the same place (L1, R3.9, R3.14). Same as ui/layout. */
export const DOOR_RECT: Rect = { x: 20, y: 805, w: 80, h: 85 };
/**
 * The opaque core of the view's backdrop: the stage width, from the top of the ghost area down to the floor line (D18). All text of
 * the view lies inside it. The backdrop also has a margin of PANEL_FADE units above and to each side that fades into the room.
 */
export const PANEL_RECT: Rect = { x: 0, y: 205, w: 600, h: 695 };
/** The width of the backdrop's fading margin above and to each side of the core (D18). */
export const PANEL_FADE = 60;
/** Stones per row (L8: 110n - 10 <= 560 gives 5). */
export const STONES_PER_ROW = 5;

/**
 * The focus ring of every item: 3 px offset plus 3 px wide (R6.19), and the 2 px it must keep from any text (D14). In CSS px, so
 * in units it depends on the scale; the smallest scale (0.6, at 360 x 640) is the worst case.
 */
export const RING_PX = 6;
export const RING_CLEAR_PX = 2;
/** The smallest stage scale of the four viewports (360 x 640). */
export const MIN_SCALE = 0.6;
/** The gap between an item and any text line, in units: (6 + 2) / 0.6 = 13.33, rounded up to 14 (D14). */
export const TEXT_GAP = 14;

/** The two group labels, 22 high (L7 as amended by D14, D19: the visible view header is gone, the heading is read only). */
export const LABEL_Y = { stones: 215, shelf: 465 } as const;

/** Stone i: 100 by 80, pitch 110 across and 90 down (L7, D14). */
export function stoneRect(i: number): Rect {
  return { x: 30 + 110 * (i % STONES_PER_ROW), y: 251 + 90 * Math.floor(i / STONES_PER_ROW), w: 100, h: 80 };
}

/** Top of Day_Shelf row r: rows are 74 high with a 10 gap (L7, D14). */
export function shelfRowY(r: number): number {
  return 501 + 84 * r;
}

/** The real-text date label at the start of shelf row r (L7). */
export function dateLabelRect(r: number): Rect {
  return { x: 20, y: shelfRowY(r), w: 80, h: 74 };
}

/** Stub j of shelf row r: 74 by 74, pitch 84, 14 units right of the date label (L7, R4.13, D14). */
export function stubRect(r: number, j: number): Rect {
  return { x: 114 + 84 * j, y: shelfRowY(r), w: 74, h: 74 };
}

/** The "+n more" text at the end of shelf row r, 14 units after the fourth stub (L7, L8: 100 units reserved, D14). */
export function moreRect(r: number): Rect {
  return { x: 454, y: shelfRowY(r), w: 100, h: 74 };
}

/** Top of each Count_Line, 22 high, 14 units below the last row (L7, D14). */
export const COUNT_LINE_Y = { stones: 435, shelf: 757 } as const;
/** Top of each empty-state line, 22 high, where the first row would be (L7). */
export const EMPTY_LINE_Y = { stones: 251, shelf: 501 } as const;

/** The largest Details_Card: 520 wide; 232 high holds the padding and eight lines of 26 (L9, D16). */
export const CARD_MAX = { w: 520, h: 232 } as const;
/** The card stays inside the core, below its top edge and 10 units above the return control (L10, D16). */
export const CARD_BOUNDS = { top: 215, bottom: 795, left: 20, right: 580 } as const;
/** The card's rim in the backdrop's colour, which hides what its rounded corners would leave showing of a covered line (D16). */
export const CARD_RIM_PX = 4;
/**
 * The gap between the card and its item: the ring (6 px) and the rim (4 px) must not meet at the smallest scale, so
 * (6 + 4) / 0.6 = 16.7, rounded up to 17 units (L10, D16).
 */
export const CARD_GAP = Math.ceil((RING_PX + CARD_RIM_PX) / MIN_SCALE);

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);
const meets = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Where the card goes for an item, given the card's measured size in units (L10 as amended by D16, R5.10, R5.11). The size is
 * clamped to CARD_MAX. Two candidates, CARD_GAP from the item: above and below. The first choice is the side of L10 (above for an
 * item at y >= 463, the Shelf; below otherwise, the Stones), then the other side. Among the candidates inside CARD_BOUNDS, the
 * first that keeps clear of `avoid` (the other Group's label) wins; when none does, the first inside the bounds. For every item of
 * the view and every size up to CARD_MAX the L10 side is inside the bounds, so a card is always placed.
 */
export function placeCard(item: Rect, size: { readonly w: number; readonly h: number }, avoid: Rect | null = null): Rect {
  const w = clamp(size.w, 0, CARD_MAX.w);
  const h = clamp(size.h, 0, CARD_MAX.h);
  const x = clamp(item.x + item.w / 2 - w / 2, CARD_BOUNDS.left, CARD_BOUNDS.right - w);
  const above: Rect = { x, y: item.y - CARD_GAP - h, w, h };
  const below: Rect = { x, y: item.y + item.h + CARD_GAP, w, h };
  const order = item.y >= 463 ? [above, below] : [below, above];
  const fits = (c: Rect): boolean => c.y >= CARD_BOUNDS.top && c.y + c.h <= CARD_BOUNDS.bottom;
  const valid = order.filter(fits);
  const clear = valid.find((c) => avoid === null || !meets(c, avoid));
  return clear ?? valid[0] ?? order[0] ?? below;
}
