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

/** The height of every text line of the view: text of 23.4 units (14 px at 360 x 640) on a 28-unit line (D21). */
export const TEXT_LINE_H = 28;
/** The two group labels (L7 as amended by D14, D19, D21: the visible view header is gone, the heading is read only). */
export const LABEL_Y = { stones: 215, shelf: 463 } as const;

/** Stone i: 100 by 74 (44.4 px at 360 x 640), pitch 110 across and 84 down (L7, D14, D21). */
export function stoneRect(i: number): Rect {
  return { x: 30 + 110 * (i % STONES_PER_ROW), y: 257 + 84 * Math.floor(i / STONES_PER_ROW), w: 100, h: 74 };
}

/** Top of Day_Shelf row r: rows are 74 high with a 10 gap (L7, D14). */
export function shelfRowY(r: number): number {
  return 505 + 84 * r;
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

/** Top of each Count_Line, one text line high, 14 units below the last row (L7, D14, D21). */
export const COUNT_LINE_Y = { stones: 429, shelf: 761 } as const;
/** Top of each empty-state line, one text line high, where the first row would be (L7). */
export const EMPTY_LINE_Y = { stones: 257, shelf: 505 } as const;

/** The largest Details_Card: 520 wide; 240 high holds the padding (24) and eight card lines of 27 (L9, D16, D21). */
export const CARD_MAX = { w: 520, h: 240 } as const;
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
 * clamped to CARD_MAX. The card stands CARD_GAP or more from the item, above or below it; `avoid` lists the text lines it must not
 * cut through (the two group labels, D16). Candidates, in order: the L10 side (above for an item at y >= 463, the Shelf; below
 * otherwise), the other side, then each side pushed away from the item past any label that crosses its near edge. The first
 * candidate inside CARD_BOUNDS that meets no label wins. When none does, the first that fits is lengthened (and widened to the
 * label's start) so that it covers each label it meets whole: a card never cuts through a label's text. Every item of the view has
 * a fitting candidate for every size up to CARD_MAX, so a card is always placed and never covers its item.
 */
export function placeCard(item: Rect, size: { readonly w: number; readonly h: number }, avoid: Rect | readonly Rect[] | null = null): Rect {
  const labels: readonly Rect[] = avoid === null ? [] : "x" in avoid ? [avoid] : avoid;
  const w = clamp(size.w, 0, CARD_MAX.w);
  const h = clamp(size.h, 0, CARD_MAX.h);
  const x = clamp(item.x + item.w / 2 - w / 2, CARD_BOUNDS.left, CARD_BOUNDS.right - w);
  const above: Rect = { x, y: item.y - CARD_GAP - h, w, h };
  const below: Rect = { x, y: item.y + item.h + CARD_GAP, w, h };
  const isBelow = (c: Rect): boolean => c.y > item.y;
  /** The candidate moved away from the item until no label crosses its near edge. */
  const pushed = (c: Rect): Rect => {
    let out = c;
    for (let moved = true; moved; ) {
      moved = false;
      for (const a of labels) {
        if (!meets(out, a)) continue;
        if (isBelow(out) && a.y < out.y) {
          out = { ...out, y: a.y + a.h };
          moved = true;
        } else if (!isBelow(out) && a.y + a.h > out.y + out.h) {
          out = { ...out, y: a.y - out.h };
          moved = true;
        }
      }
    }
    return out;
  };
  const sides = item.y >= 463 ? [above, below] : [below, above];
  const fits = (c: Rect): boolean => c.y >= CARD_BOUNDS.top && c.y + c.h <= CARD_BOUNDS.bottom;
  const clearOf = (c: Rect): boolean => labels.every((a) => !meets(c, a));
  const candidates = [...sides, ...sides.map(pushed)];
  const clear = candidates.find((c) => fits(c) && clearOf(c));
  if (clear !== undefined) return clear;
  // No candidate keeps clear: the first that fits, preferring one with no label across its near edge, covers its labels whole
  // (D16, second amendment). The edge next to the item stays; the far edge moves out past each label, the left edge to the label's
  // start (a label's text begins at the left of its line), inside the bounds.
  let pick = [...sides.map(pushed), ...sides].find(fits) ?? sides[0] ?? below;
  for (const a of labels) {
    if (!meets(pick, a)) continue;
    const left = Math.max(Math.min(pick.x, a.x), CARD_BOUNDS.left);
    const wide = { x: left, w: pick.x + pick.w - left };
    if (isBelow(pick)) pick = { ...pick, ...wide, h: Math.min(Math.max(pick.y + pick.h, a.y + a.h), CARD_BOUNDS.bottom) - pick.y };
    else {
      const top = Math.max(Math.min(pick.y, a.y), CARD_BOUNDS.top);
      pick = { ...pick, ...wide, y: top, h: pick.y + pick.h - top };
    }
  }
  return pick;
}