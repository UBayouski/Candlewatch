// ghosts-and-graveyard R3.9, R4.10 to R4.13, R5.10, R5.11, R6.19 (design 3.4, Section 1, L1, L7 to L10 as amended by D14, D16, D18,
// D19): the graveyard view's room-unit geometry.
import { describe, expect, it } from "vitest";
import { DOOR_RECT as UI_DOOR_RECT, FLOOR_UNITS, GHOST_CELLS, KEEP_CLEAR_COLUMN_UNITS, KEEP_CLEAR_WINDOW_UNITS, stageBox } from "../ui/layout";
import {
  CARD_BOUNDS,
  CARD_RIM_PX,
  CARD_GAP,
  CARD_MAX,
  COUNT_LINE_Y,
  DOOR_RECT,
  EMPTY_LINE_Y,
  LABEL_Y,
  MIN_SCALE,
  PANEL_FADE,
  PANEL_RECT,
  RING_CLEAR_PX,
  RING_PX,
  STONES_PER_ROW,
  TEXT_GAP,
  dateLabelRect,
  moreRect,
  placeCard,
  shelfRowY,
  stoneRect,
  stubRect,
} from "./geometry";
import type { Rect } from "./geometry";

const right = (r: Rect): number => r.x + r.w;
const bottom = (r: Rect): number => r.y + r.h;
/** How far apart two rectangles are along their best axis: negative when they overlap on both axes, 0 when they touch. */
const separation = (a: Rect, b: Rect): number => Math.max(a.x - right(b), b.x - right(a), a.y - bottom(b), b.y - bottom(a));
/** Smallest hit size in CSS px at the smallest scale, 360 x 640 (s = 0.6). */
const PX = 0.6;
const MIN_HIT_PX = 44;
const line = (y: number): Rect => ({ x: 20, y, w: 560, h: 22 });

const STONES: readonly Rect[] = Array.from({ length: 10 }, (_, i) => stoneRect(i));
const STUBS: readonly Rect[] = [0, 1, 2].flatMap((r) => [0, 1, 2, 3].map((j) => stubRect(r, j)));
/** Every text line of the view at its fixed place: labels, count lines, empty lines, date labels, "+n more". */
const TEXT: readonly [string, Rect][] = [
  ["graveyard label", line(LABEL_Y.stones)],
  ["shelf label", line(LABEL_Y.shelf)],
  ["stones count", line(COUNT_LINE_Y.stones)],
  ["shelf count", line(COUNT_LINE_Y.shelf)],
  ...[0, 1, 2].flatMap((r): [string, Rect][] => [
    [`date label ${r}`, dateLabelRect(r)],
    [`more ${r}`, moreRect(r)],
  ]),
];

describe("the constants of L1, L7 and L9 as amended by D14, D16, D18 and D19", () => {
  it("has the Door, the backdrop core and its fade, and the stone count", () => {
    expect(DOOR_RECT).toEqual({ x: 20, y: 805, w: 80, h: 85 });
    expect(PANEL_RECT).toEqual({ x: 0, y: 205, w: 600, h: 695 });
    expect(bottom(PANEL_RECT)).toBe(FLOOR_UNITS);
    expect(PANEL_FADE).toBe(60);
    expect(STONES_PER_ROW).toBe(5);
  });

  it("has the labels, count lines, empty lines and card limits", () => {
    expect(LABEL_Y).toEqual({ stones: 215, shelf: 465 });
    expect(COUNT_LINE_Y).toEqual({ stones: 435, shelf: 757 });
    expect(EMPTY_LINE_Y).toEqual({ stones: 251, shelf: 501 });
    expect(CARD_MAX).toEqual({ w: 520, h: 232 });
    expect(CARD_BOUNDS).toEqual({ top: 215, bottom: 795, left: 20, right: 580 });
    expect(CARD_GAP).toBe(17);
  });

  it("derives the 14-unit text gap from the ring at the smallest scale", () => {
    expect([RING_PX, RING_CLEAR_PX, MIN_SCALE]).toEqual([6, 2, 0.6]);
    expect(TEXT_GAP).toBe(Math.ceil((RING_PX + RING_CLEAR_PX) / MIN_SCALE));
  });

  it("puts the stones at x 30 + 110 i, y 251 + 90 row, 100 by 80 (two rows of five)", () => {
    const xs = [30, 140, 250, 360, 470];
    for (let i = 0; i < 10; i++) expect(stoneRect(i), `stone ${i}`).toEqual({ x: xs[i % 5], y: i < 5 ? 251 : 341, w: 100, h: 80 });
    expect(right(stoneRect(4))).toBe(570);
    expect(bottom(stoneRect(9))).toBe(421);
  });

  it("puts the shelf rows at y 501, 585 and 669", () => {
    expect([0, 1, 2].map(shelfRowY)).toEqual([501, 585, 669]);
    expect(bottom(stubRect(2, 0))).toBe(743);
  });

  it("puts the date labels at x 20..100, the stubs at x 114 + 84 j (74 by 74) and +n more at 454..554", () => {
    for (let r = 0; r < 3; r++) {
      const y = 501 + 84 * r;
      expect(dateLabelRect(r)).toEqual({ x: 20, y, w: 80, h: 74 });
      [114, 198, 282, 366].forEach((x, j) => expect(stubRect(r, j), `stub ${r},${j}`).toEqual({ x, y, w: 74, h: 74 }));
      expect(moreRect(r)).toEqual({ x: 454, y, w: 100, h: 74 });
    }
  });

  it("stacks the view: 14 units from every row to the text next to it, the last line ending at 779, above the return control", () => {
    expect(stoneRect(0).y - bottom(line(LABEL_Y.stones))).toBe(14);
    expect(COUNT_LINE_Y.stones - bottom(stoneRect(9))).toBe(14);
    expect(LABEL_Y.shelf - bottom(line(COUNT_LINE_Y.stones))).toBe(8);
    expect(shelfRowY(0) - bottom(line(LABEL_Y.shelf))).toBe(14);
    expect(COUNT_LINE_Y.shelf - bottom(stubRect(2, 0))).toBe(14);
    expect(bottom(line(COUNT_LINE_Y.shelf))).toBe(779);
    expect(DOOR_RECT.y - bottom(line(COUNT_LINE_Y.shelf))).toBe(26);
  });

  it("keeps every drawn item and text line inside x 20..580 and inside the backdrop's core", () => {
    for (const r of [...STONES, ...STUBS, ...TEXT.map(([, t]) => t)]) {
      expect(r.x).toBeGreaterThanOrEqual(20);
      expect(right(r)).toBeLessThanOrEqual(580);
      expect(r.y).toBeGreaterThanOrEqual(PANEL_RECT.y);
      expect(bottom(r)).toBeLessThanOrEqual(DOOR_RECT.y);
    }
  });
});

describe("the focus ring clears every text line (D14, R6.19)", () => {
  it.each([
    [360, 640],
    [768, 1024],
    [1280, 800],
    [1920, 1080],
  ])("at %i x %i, every item's ring, grown by 6 px, keeps at least 2 px from every text line", (vw, vh) => {
    const { scale } = stageBox(vw, vh);
    const grow = RING_PX / scale;
    for (const item of [...STONES, ...STUBS, DOOR_RECT]) {
      const ring: Rect = { x: item.x - grow, y: item.y - grow, w: item.w + 2 * grow, h: item.h + 2 * grow };
      for (const [name, text] of TEXT) expect(separation(ring, text) * scale, `${JSON.stringify(item)} and ${name}`).toBeGreaterThanOrEqual(RING_CLEAR_PX - 1e-9);
    }
  });
});

describe("hit sizes at 360 x 640 (R4.13)", () => {
  it("gives the Door, the stones and the stubs at least 44 px each way", () => {
    const interactive: readonly [string, Rect][] = [
      ["door", DOOR_RECT],
      ["stone 0", stoneRect(0)],
      ["stone 9", stoneRect(9)],
      ["stub 0,0", stubRect(0, 0)],
      ["stub 2,3", stubRect(2, 3)],
    ];
    for (const [name, r] of interactive) {
      expect(r.w * PX, `${name} width`).toBeGreaterThanOrEqual(MIN_HIT_PX);
      expect(r.h * PX, `${name} height`).toBeGreaterThanOrEqual(MIN_HIT_PX);
    }
  });
});

describe("the Door (R3.9, L1)", () => {
  it("lies in the left band, below y 300 and above the floor band", () => {
    expect(DOOR_RECT.x).toBeGreaterThanOrEqual(0);
    expect(right(DOOR_RECT)).toBeLessThanOrEqual(110);
    expect(DOOR_RECT.y).toBeGreaterThan(300);
    expect(bottom(DOOR_RECT)).toBeLessThan(FLOOR_UNITS);
    expect(FLOOR_UNITS - bottom(DOOR_RECT)).toBe(10);
  });

  it("is clear of the candle column by 60 units (36 px, above the 6 px minimum)", () => {
    expect(KEEP_CLEAR_COLUMN_UNITS.x - right(DOOR_RECT)).toBe(60);
    expect(separation(DOOR_RECT, KEEP_CLEAR_COLUMN_UNITS) * PX).toBeGreaterThanOrEqual(6);
  });

  it("is clear of the window pane", () => {
    expect(separation(DOOR_RECT, KEEP_CLEAR_WINDOW_UNITS)).toBeGreaterThan(0);
  });

  it("is clear of every ghost cell (the lowest ends at 785, 20 units above)", () => {
    for (const cell of GHOST_CELLS) expect(separation(DOOR_RECT, cell)).toBeGreaterThanOrEqual(20);
  });

  it("equals DOOR_RECT of src/ui/layout.ts", () => {
    expect(DOOR_RECT).toEqual(UI_DOOR_RECT);
  });

  it("measures 48 by 51 px at 360 x 640, at x 12 and y 503", () => {
    const { scale, ox, oy } = stageBox(360, 640);
    expect(scale).toBeCloseTo(0.6, 10);
    expect([DOOR_RECT.w * scale, DOOR_RECT.h * scale]).toEqual([expect.closeTo(48, 6), expect.closeTo(51, 6)]);
    expect(ox + DOOR_RECT.x * scale).toBeCloseTo(12, 6);
    expect(oy + DOOR_RECT.y * scale).toBeCloseTo(503, 6);
  });
});

describe("placeCard (L10 as amended by D16, R5.10, R5.11)", () => {
  const SHELF_LABEL = line(LABEL_Y.shelf);
  const STONES_LABEL = line(LABEL_Y.stones);
  const FIVE_LINES = { w: 400, h: 128 }; // a card of 128 units

  it("puts a stone's card below it, and a stub's card above it", () => {
    expect(placeCard(stoneRect(0), FIVE_LINES).y).toBe(331 + 17);
    expect(placeCard(stoneRect(5), FIVE_LINES).y).toBe(421 + 17);
    expect(placeCard(stubRect(0, 0), FIVE_LINES).y).toBe(501 - 17 - 128);
    expect(placeCard(stubRect(2, 0), FIVE_LINES).y).toBe(669 - 17 - 128);
  });

  it("sizes the card to its content, clamped to 520 by 232", () => {
    expect(placeCard(stoneRect(0), { w: 300, h: 100 })).toMatchObject({ w: 300, h: 100 });
    expect(placeCard(stoneRect(0), { w: 900, h: 400 })).toMatchObject({ w: 520, h: 232 });
  });

  it("keeps a second-row stone's card off the Shelf label when it fits above, and falls back to below when it does not", () => {
    const short = { w: 300, h: 24 + 3 * 26 }; // 102: the intent on one line and two rows
    const above = placeCard(stoneRect(5), short, SHELF_LABEL);
    expect(above.y + above.h).toBe(341 - 17);
    expect(separation(above, SHELF_LABEL)).toBeGreaterThan(0);
    const tall = placeCard(stoneRect(5), { w: 300, h: 180 }, SHELF_LABEL);
    expect(tall.y).toBe(421 + 17);
  });

  it("keeps a first-row stone's short card below it and clear of the Shelf label", () => {
    const c = placeCard(stoneRect(2), { w: 300, h: 102 }, SHELF_LABEL);
    expect(c.y).toBe(348);
    expect(bottom(c)).toBeLessThanOrEqual(LABEL_Y.shelf);
  });

  it("never puts a stub's card on the Graveyard label", () => {
    for (const stub of STUBS) expect(separation(placeCard(stub, CARD_MAX, STONES_LABEL), STONES_LABEL)).toBeGreaterThan(0);
  });

  it("centres the card on the item and clamps x to 20..580 - w", () => {
    expect(placeCard({ x: 30, y: 251, w: 100, h: 80 }, { w: 520, h: 128 }).x).toBe(20);
    expect(placeCard({ x: 470, y: 251, w: 100, h: 80 }, { w: 520, h: 128 }).x).toBe(60);
    expect(placeCard({ x: 250, y: 251, w: 100, h: 80 }, { w: 200, h: 128 }).x).toBe(200);
  });

  it("is 17 units from the item, its rim clear of the item's focus ring at every scale, and inside the bounds, for every item at the largest size", () => {
    for (const item of [...STONES, ...STUBS]) {
      const card = placeCard(item, CARD_MAX);
      expect(separation(card, item)).toBeGreaterThanOrEqual(17);
      expect(separation(card, item) * MIN_SCALE).toBeGreaterThanOrEqual(RING_PX + CARD_RIM_PX);
      expect(card.y).toBeGreaterThanOrEqual(CARD_BOUNDS.top);
      expect(bottom(card)).toBeLessThanOrEqual(CARD_BOUNDS.bottom);
      expect(bottom(card)).toBeLessThan(DOOR_RECT.y);
    }
  });

  it.each([
    [360, 640],
    [1280, 800],
  ])("lies inside the %i x %i viewport for every stone and stub", (vw, vh) => {
    const { scale, ox, oy } = stageBox(vw, vh);
    for (const item of [...STONES, ...STUBS]) {
      const c = placeCard(item, CARD_MAX);
      expect(ox + c.x * scale).toBeGreaterThanOrEqual(0);
      expect(ox + right(c) * scale).toBeLessThanOrEqual(vw);
      expect(oy + c.y * scale).toBeGreaterThanOrEqual(0);
      expect(oy + bottom(c) * scale).toBeLessThanOrEqual(vh);
    }
  });
});
