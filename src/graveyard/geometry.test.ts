// ghosts-and-graveyard R3.9, R4.10 to R4.13, R5.10, R5.11 (design 3.4, Section 1, L1, L7 to L10): the graveyard view's room-unit geometry.
import { describe, expect, it } from "vitest";
import { DOOR_RECT as UI_DOOR_RECT, FLOOR_UNITS, GHOST_CELLS, KEEP_CLEAR_COLUMN_UNITS, KEEP_CLEAR_WINDOW_UNITS, stageBox } from "../ui/layout";
import {
  CARD_SIZE,
  COUNT_LINE_Y,
  DOOR_RECT,
  EMPTY_LINE_Y,
  PANEL_RECT,
  STONES_PER_ROW,
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

describe("the constants of L1, L7 and L9", () => {
  it("has the Door, the panel and the stone count of the design", () => {
    expect(DOOR_RECT).toEqual({ x: 20, y: 805, w: 80, h: 85 });
    expect(PANEL_RECT).toEqual({ x: 0, y: 205, w: 600, h: 595 });
    expect(STONES_PER_ROW).toBe(5);
  });

  it("has the count lines, empty lines and card size of the design", () => {
    expect(COUNT_LINE_Y).toEqual({ stones: 466, shelf: 767 });
    expect(EMPTY_LINE_Y).toEqual({ stones: 273, shelf: 522 });
    expect(CARD_SIZE).toEqual({ w: 520, h: 240 });
  });

  it("puts the stones at x 30 + 110 i, y 273 + 100 row, 100 by 90 (two rows of five)", () => {
    const xs = [30, 140, 250, 360, 470];
    for (let i = 0; i < 10; i++) {
      expect(stoneRect(i), `stone ${i}`).toEqual({ x: xs[i % 5], y: i < 5 ? 273 : 373, w: 100, h: 90 });
    }
    expect(right(stoneRect(4))).toBe(570);
    expect(bottom(stoneRect(9))).toBe(463);
  });

  it("puts the shelf rows at y 522, 606 and 690", () => {
    expect([0, 1, 2].map(shelfRowY)).toEqual([522, 606, 690]);
    expect(bottom(stubRect(2, 0))).toBe(764);
  });

  it("puts the date labels at x 20..100 and the stubs at x 110 + 84 j, 74 by 74", () => {
    for (let r = 0; r < 3; r++) {
      const y = 522 + 84 * r;
      expect(dateLabelRect(r)).toEqual({ x: 20, y, w: 80, h: 74 });
      [110, 194, 278, 362].forEach((x, j) => expect(stubRect(r, j), `stub ${r},${j}`).toEqual({ x, y, w: 74, h: 74 }));
      expect(moreRect(r)).toEqual({ x: 446, y, w: 100, h: 74 });
    }
  });

  it("fits a full shelf row (label, four stubs, gap, more) inside x 20..546", () => {
    expect(right(stubRect(0, 3))).toBe(436);
    expect(moreRect(0).x - right(stubRect(0, 3))).toBe(10);
    expect(right(moreRect(0))).toBe(546);
    expect(right(dateLabelRect(0)) + 10).toBe(stubRect(0, 0).x);
  });

  it("stacks the view above the Door: the last count line ends at 789 and the Door starts at 805", () => {
    expect(COUNT_LINE_Y.stones).toBe(bottom(stoneRect(9)) + 3);
    expect(COUNT_LINE_Y.shelf).toBe(bottom(stubRect(2, 0)) + 3);
    expect(COUNT_LINE_Y.shelf + 22).toBe(789);
    expect(COUNT_LINE_Y.shelf + 22).toBeLessThan(DOOR_RECT.y);
  });

  it("keeps every drawn item inside x 20..580 and inside the panel", () => {
    const all: Rect[] = [];
    for (let i = 0; i < 10; i++) all.push(stoneRect(i));
    for (let r = 0; r < 3; r++) {
      all.push(dateLabelRect(r), moreRect(r));
      for (let j = 0; j < 4; j++) all.push(stubRect(r, j));
    }
    for (const r of all) {
      expect(r.x).toBeGreaterThanOrEqual(20);
      expect(right(r)).toBeLessThanOrEqual(580);
      expect(r.y).toBeGreaterThanOrEqual(PANEL_RECT.y);
      expect(bottom(r)).toBeLessThanOrEqual(bottom(PANEL_RECT));
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

describe("placeCard (L10, R5.10, R5.11)", () => {
  it("puts the card below stone rows 1 and 2 at y 371 and 471", () => {
    expect(placeCard(stoneRect(0)).y).toBe(371);
    expect(placeCard(stoneRect(5)).y).toBe(471);
  });

  it("puts the card above shelf rows 1 to 3 at y 274, 358 and 442", () => {
    expect([0, 1, 2].map((r) => placeCard(stubRect(r, 0)).y)).toEqual([274, 358, 442]);
  });

  it("gives the card the size of L9", () => {
    const c = placeCard(stoneRect(3));
    expect([c.w, c.h]).toEqual([520, 240]);
  });

  it("takes the first branch at t = 463 and the second just below", () => {
    expect(placeCard({ x: 100, y: 463, w: 50, h: 50 }).y).toBe(463 - 8 - 240);
    expect(placeCard({ x: 100, y: 462, w: 50, h: 50 }).y).toBe(462 + 50 + 8);
  });

  it("centres the card on the item and clamps x to 20..60", () => {
    expect(placeCard({ x: 30, y: 273, w: 100, h: 90 }).x).toBe(20);
    expect(placeCard({ x: 470, y: 273, w: 100, h: 90 }).x).toBe(60);
    // Item centre 300 gives 300 - 260 = 40, inside the range.
    expect(placeCard({ x: 250, y: 273, w: 100, h: 90 }).x).toBe(40);
  });

  it("is 8 units from the item and never touches it, for every stone and stub", () => {
    const items: Rect[] = [];
    for (let i = 0; i < 10; i++) items.push(stoneRect(i));
    for (let r = 0; r < 3; r++) for (let j = 0; j < 4; j++) items.push(stubRect(r, j));
    for (const item of items) {
      const card = placeCard(item);
      expect(separation(card, item)).toBeGreaterThanOrEqual(8);
      expect(card.y).toBeGreaterThanOrEqual(215);
      expect(bottom(card)).toBeLessThanOrEqual(895);
    }
  });

  it.each([
    [360, 640],
    [1280, 800],
  ])("lies inside the %i x %i viewport for every stone and stub", (vw, vh) => {
    const { scale, ox, oy } = stageBox(vw, vh);
    const items: Rect[] = [];
    for (let i = 0; i < 10; i++) items.push(stoneRect(i));
    for (let r = 0; r < 3; r++) for (let j = 0; j < 4; j++) items.push(stubRect(r, j));
    for (const item of items) {
      const c = placeCard(item);
      expect(ox + c.x * scale).toBeGreaterThanOrEqual(0);
      expect(ox + right(c) * scale).toBeLessThanOrEqual(vw);
      expect(oy + c.y * scale).toBeGreaterThanOrEqual(0);
      expect(oy + bottom(c) * scale).toBeLessThanOrEqual(vh);
    }
  });

  it("stays above the Door and below the top of the panel", () => {
    for (let i = 0; i < 10; i++) expect(bottom(placeCard(stoneRect(i)))).toBeLessThan(DOOR_RECT.y);
    for (let r = 0; r < 3; r++) expect(placeCard(stubRect(r, 0)).y).toBeGreaterThan(PANEL_RECT.y);
  });
});
