// ghosts-and-graveyard R9.4, R9.5, R9.7, R9.8, R9.14, R10.8 (design 3.9, Section 1, L2 to L5): the slot table and its geometry.
import { describe, expect, it } from "vitest";
import { DOOR_RECT, FLOOR_UNITS, GHOST_CELLS, KEEP_CLEAR_COLUMN_UNITS, KEEP_CLEAR_WINDOW_UNITS } from "../ui/layout";
import type { Rect } from "../ui/layout";
import { DRIFT_UNITS, GHOST_BOX, GHOST_SLOTS, OVERFLOW_MARK } from "./slots";

/** The cell each slot owns: the resting box plus 10 units on every side (L3). */
const CELL = { w: 90, h: 95 } as const;

const cellOf = (k: number): Rect => {
  const s = GHOST_SLOTS[k];
  if (!s) throw new Error(`no slot ${k}`);
  return { x: s.cx - CELL.w / 2, y: s.cy - CELL.h / 2, w: CELL.w, h: CELL.h };
};
/** The resting box of slot k, grown by `grow` units on every side. */
const boxOf = (k: number, grow = 0): Rect => {
  const s = GHOST_SLOTS[k];
  if (!s) throw new Error(`no slot ${k}`);
  return { x: s.cx - GHOST_BOX.w / 2 - grow, y: s.cy - GHOST_BOX.h / 2 - grow, w: GHOST_BOX.w + 2 * grow, h: GHOST_BOX.h + 2 * grow };
};
const right = (r: Rect): number => r.x + r.w;
const bottom = (r: Rect): number => r.y + r.h;
/** How far apart two rectangles are along their best axis: negative when they overlap on both axes, 0 when they touch. */
const separation = (a: Rect, b: Rect): number => Math.max(a.x - right(b), b.x - right(a), a.y - bottom(b), b.y - bottom(a));

/** The table of design L4, row by row: slot, cell x, cell y, centre, resting box x and y. Written out, not computed. */
const TABLE: readonly (readonly [number, readonly [number, number], readonly [number, number], readonly [number, number], readonly [number, number], readonly [number, number]])[] = [
  [0, [10, 100], [215, 310], [55, 262.5], [20, 90], [225, 300]],
  [1, [500, 590], [215, 310], [545, 262.5], [510, 580], [225, 300]],
  [2, [10, 100], [310, 405], [55, 357.5], [20, 90], [320, 395]],
  [3, [500, 590], [310, 405], [545, 357.5], [510, 580], [320, 395]],
  [4, [10, 100], [405, 500], [55, 452.5], [20, 90], [415, 490]],
  [5, [500, 590], [405, 500], [545, 452.5], [510, 580], [415, 490]],
  [6, [10, 100], [500, 595], [55, 547.5], [20, 90], [510, 585]],
  [7, [500, 590], [500, 595], [545, 547.5], [510, 580], [510, 585]],
  [8, [10, 100], [595, 690], [55, 642.5], [20, 90], [605, 680]],
  [9, [500, 590], [595, 690], [545, 642.5], [510, 580], [605, 680]],
  [10, [10, 100], [690, 785], [55, 737.5], [20, 90], [700, 775]],
  [11, [500, 590], [690, 785], [545, 737.5], [510, 580], [700, 775]],
];

describe("the constants of L2, L3 and L5", () => {
  it("has the full-size box, the drift allowance and the Overflow_Mark of the design", () => {
    expect(GHOST_BOX).toEqual({ w: 70, h: 75 });
    expect(DRIFT_UNITS).toBe(8);
    expect(OVERFLOW_MARK).toEqual({ x: 545, y: 860, fontSize: 24 });
  });
});

describe("the slot table of L4, row by row", () => {
  it("has twelve slots, left band for even k and right band for odd k", () => {
    expect(GHOST_SLOTS).toHaveLength(12);
    GHOST_SLOTS.forEach((s, k) => expect(s.cx, `slot ${k}`).toBe(k % 2 === 0 ? 55 : 545));
  });

  for (const [k, [cx0, cx1], [cy0, cy1], [cx, cy], [bx0, bx1], [by0, by1]] of TABLE) {
    it(`slot ${k}: centre (${cx}, ${cy}), cell x ${cx0}..${cx1} y ${cy0}..${cy1}, resting box x ${bx0}..${bx1} y ${by0}..${by1}`, () => {
      expect(GHOST_SLOTS[k]).toEqual({ cx, cy });
      const cell = cellOf(k);
      expect([cell.x, right(cell), cell.y, bottom(cell)]).toEqual([cx0, cx1, cy0, cy1]);
      const box = boxOf(k);
      expect([box.x, right(box), box.y, bottom(box)]).toEqual([bx0, bx1, by0, by1]);
    });
  }

  it("puts slot k on row floor(k / 2): the centre is 262.5 + 95 * row", () => {
    GHOST_SLOTS.forEach((s, k) => expect(s.cy, `slot ${k}`).toBe(262.5 + 95 * Math.floor(k / 2)));
  });
});

describe("cells, drift and clearances", () => {
  const cells = GHOST_SLOTS.map((_, k) => cellOf(k));

  it("tiles the cells without overlap, each ending where the next in its column begins", () => {
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) expect(separation(cells[i] as Rect, cells[j] as Rect), `cells ${i} and ${j}`).toBeGreaterThanOrEqual(0);
    }
    for (let k = 0; k + 2 < cells.length; k++) expect(bottom(cells[k] as Rect), `cell ${k} meets cell ${k + 2}`).toBe((cells[k + 2] as Rect).y);
  });

  it("keeps a drifted box inside its own cell with at least 2 units to spare, and 4 units from every other drifted box", () => {
    GHOST_SLOTS.forEach((_, k) => {
      const drifted = boxOf(k, DRIFT_UNITS);
      const cell = cells[k] as Rect;
      expect(drifted.x - cell.x, `slot ${k} left`).toBeGreaterThanOrEqual(2);
      expect(drifted.y - cell.y, `slot ${k} top`).toBeGreaterThanOrEqual(2);
      expect(right(cell) - right(drifted), `slot ${k} right`).toBeGreaterThanOrEqual(2);
      expect(bottom(cell) - bottom(drifted), `slot ${k} bottom`).toBeGreaterThanOrEqual(2);
    });
    for (let i = 0; i < GHOST_SLOTS.length; i++) {
      for (let j = i + 1; j < GHOST_SLOTS.length; j++) {
        expect(separation(boxOf(i, DRIFT_UNITS), boxOf(j, DRIFT_UNITS)), `drifted boxes ${i} and ${j}`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("lies inside the bands 0..110 and 490..600 and between y 215 and y 785", () => {
    for (const c of cells) {
      const inLeft = c.x >= 0 && right(c) <= 110;
      const inRight = c.x >= 490 && right(c) <= 600;
      expect(inLeft || inRight, `cell at x ${c.x}`).toBe(true);
    }
    expect(Math.min(...cells.map((c) => c.y))).toBe(215);
    expect(Math.max(...cells.map(bottom))).toBe(785);
  });

  it("ends 20 units above the Door and clear of it", () => {
    expect(DOOR_RECT.y - Math.max(...cells.map(bottom))).toBe(20);
    for (const c of cells) expect(separation(c, DOOR_RECT)).toBeGreaterThanOrEqual(20);
  });

  it("is clear of the floor band, the candle column and the window pane, even at the extreme of the drift", () => {
    const lowestDrifted = Math.max(...GHOST_SLOTS.map((_, k) => bottom(boxOf(k, DRIFT_UNITS))));
    expect(lowestDrifted).toBe(783);
    expect(lowestDrifted).toBeLessThan(FLOOR_UNITS);
    for (const c of cells) {
      expect(bottom(c)).toBeLessThanOrEqual(FLOOR_UNITS);
      expect(separation(c, KEEP_CLEAR_COLUMN_UNITS), "candle column").toBeGreaterThan(0);
      expect(separation(c, KEEP_CLEAR_WINDOW_UNITS), "window pane").toBeGreaterThan(0);
    }
  });
});

describe("the Overflow_Mark box of L5", () => {
  // "+9999" is five characters; the advance of a character is taken as 0.6 of the font size.
  const half = (5 * 0.6 * OVERFLOW_MARK.fontSize) / 2;
  const mark: Rect = { x: OVERFLOW_MARK.x - half, y: 838, w: 2 * half, h: 864 - 838 };

  it("spans x 509..581 and y 838..864 with its baseline inside", () => {
    expect([mark.x, right(mark), mark.y, bottom(mark)]).toEqual([509, 581, 838, 864]);
    expect(OVERFLOW_MARK.y).toBeGreaterThan(mark.y);
    expect(OVERFLOW_MARK.y).toBeLessThanOrEqual(bottom(mark));
  });

  it("lies in the right band, clear of the lowest drifted box (783), the Door and the floor band", () => {
    expect(mark.x).toBeGreaterThanOrEqual(490);
    expect(right(mark)).toBeLessThanOrEqual(600);
    const lowestDrifted = Math.max(...GHOST_SLOTS.map((_, k) => bottom(boxOf(k, DRIFT_UNITS))));
    expect(mark.y).toBeGreaterThan(lowestDrifted);
    expect(bottom(mark)).toBeLessThan(FLOOR_UNITS);
    expect(separation(mark, DOOR_RECT)).toBeGreaterThan(0);
    for (let k = 0; k < GHOST_SLOTS.length; k++) expect(separation(mark, boxOf(k, DRIFT_UNITS)), `drifted box ${k}`).toBeGreaterThan(0);
  });

  it("is legible: the font size times 0.6 is at least 12 (14.4 at 360 x 640)", () => {
    expect(OVERFLOW_MARK.fontSize * 0.6).toBeGreaterThanOrEqual(12);
  });
});

describe("agreement with the layout of the controls (CR5)", () => {
  it("makes GHOST_CELLS of src/ui/layout.ts equal to the cells of this table", () => {
    const order = (a: Rect, b: Rect): number => a.x - b.x || a.y - b.y;
    const fromTable = GHOST_SLOTS.map((_, k) => cellOf(k)).sort(order);
    const fromLayout = [...GHOST_CELLS].sort(order);
    expect(fromLayout).toEqual(fromTable);
  });
});
