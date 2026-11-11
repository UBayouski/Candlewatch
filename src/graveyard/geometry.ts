// Where the graveyard view puts things, in room units (600 x 1000 viewBox). Design 3.4, Section 1 (L1, L6 to L10).
// Pure: numbers in, rectangles out. The view is laid out in stage units, so one set of numbers holds on every viewport (L6).
import type { Rect } from "../ui/layout";

export type { Rect };

/** The Door and the back-door control share one rectangle, so focus returns to the same place (L1, R3.9, R3.14). Same as ui/layout. */
export const DOOR_RECT: Rect = { x: 20, y: 805, w: 80, h: 85 };
/** The panel the view covers: from the top of the ghost area to just above the Door (decision D8). */
export const PANEL_RECT: Rect = { x: 0, y: 205, w: 600, h: 595 };
/** Stones per row (L8: 110n - 10 <= 560 gives 5). */
export const STONES_PER_ROW = 5;

/** Stone i: 100 by 90, pitch 110 across and 100 down (L7). */
export function stoneRect(i: number): Rect {
  return { x: 30 + 110 * (i % STONES_PER_ROW), y: 273 + 100 * Math.floor(i / STONES_PER_ROW), w: 100, h: 90 };
}

/** Top of Day_Shelf row r: rows are 74 high with a 10 gap (L7). */
export function shelfRowY(r: number): number {
  return 522 + 84 * r;
}

/** The real-text date label at the start of shelf row r (L7). */
export function dateLabelRect(r: number): Rect {
  return { x: 20, y: shelfRowY(r), w: 80, h: 74 };
}

/** Stub j of shelf row r: 74 by 74, pitch 84 (L7, R4.13). */
export function stubRect(r: number, j: number): Rect {
  return { x: 110 + 84 * j, y: shelfRowY(r), w: 74, h: 74 };
}

/** The "+n more" text at the end of shelf row r (L7, L8: 100 units reserved). */
export function moreRect(r: number): Rect {
  return { x: 446, y: shelfRowY(r), w: 100, h: 74 };
}

/** Top of each Count_Line, 22 high (L7). */
export const COUNT_LINE_Y = { stones: 466, shelf: 767 } as const;
/** Top of each empty-state line, 22 high, where the first row would be (L7). */
export const EMPTY_LINE_Y = { stones: 273, shelf: 522 } as const;

/** The Details_Card (L9). */
export const CARD_SIZE = { w: 520, h: 240 } as const;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/**
 * Where the card goes for an item (L10, R5.10, R5.11): above when it fits (item.y >= 463), else below; 8 units from the item.
 * No third branch: every stone ends at 463 or less and every shelf item starts at 522 or more, so one of the two always holds.
 */
export function placeCard(item: Rect): Rect {
  const x = clamp(item.x + item.w / 2 - CARD_SIZE.w / 2, 20, 60);
  const y = item.y >= 463 ? item.y - 8 - CARD_SIZE.h : item.y + item.h + 8;
  return { x, y, w: CARD_SIZE.w, h: CARD_SIZE.h };
}
