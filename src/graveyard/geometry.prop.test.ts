// Property tests for the card placement and the layout (ghosts-and-graveyard design 3.4, decisions L10, D14, D16).
// Properties 16 and 17.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DRIFT_UNITS, GHOST_BOX, GHOST_SLOTS } from "../ghosts/slots";
import { FLOOR_UNITS, KEEP_CLEAR_COLUMN_UNITS, stageBox } from "../ui/layout";
import {
  CARD_BOUNDS,
  CARD_RIM_PX,
  CARD_GAP,
  CARD_MAX,
  COUNT_LINE_Y,
  DOOR_RECT,
  EMPTY_LINE_Y,
  LABEL_Y,
  PANEL_RECT,
  RING_CLEAR_PX,
  RING_PX,
  dateLabelRect,
  moreRect,
  placeCard,
  stoneRect,
  stubRect,
} from "./geometry";
import type { Rect } from "./geometry";
import { PROP_PARAMS } from "./test-kit";

/** Every item the file lays out: stones 0..9 then stubs (rows 0..2, columns 0..3). */
const ITEMS: readonly Rect[] = [
  ...Array.from({ length: 10 }, (_, i) => stoneRect(i)),
  ...Array.from({ length: 3 }, (_, r) => Array.from({ length: 4 }, (_, j) => stubRect(r, j))).flat(),
];

/** Distance between two rectangles: 0 when they touch or overlap, else the larger of the axis gaps. */
function gap(a: Rect, b: Rect): number {
  const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
  const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
  return Math.max(dx, dy);
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Full-width text line, 22 high, at y (L7). */
const textLine = (y: number): Rect => ({ x: 20, y, w: 560, h: 22 });

/** The other Group's label, which a card keeps clear of where the space allows (D16). */
const otherLabel = (item: Rect): Rect => textLine(item.y >= 463 ? LABEL_Y.stones : LABEL_Y.shelf);

const insideBounds = (c: Rect): boolean => c.y >= CARD_BOUNDS.top && c.y + c.h <= CARD_BOUNDS.bottom && c.x >= CARD_BOUNDS.left && c.x + c.w <= CARD_BOUNDS.right;

/** All the Property 16 checks for one item and one measured card size (R5.10, R5.11, L10 as amended by D16). */
function checkItem(item: Rect, size: { w: number; h: number }, avoid: Rect | null): void {
  const card = placeCard(item, size, avoid);
  expect(card.w).toBe(Math.min(size.w, CARD_MAX.w));
  expect(card.h).toBe(Math.min(size.h, CARD_MAX.h));
  expect(intersects(card, item)).toBe(false);
  expect(gap(card, item)).toBeGreaterThanOrEqual(CARD_GAP);
  // The card and its rim never cover the item's focus ring, at the smallest scale (D16).
  expect(gap(card, item) * 0.6).toBeGreaterThanOrEqual(RING_PX + CARD_RIM_PX);
  expect(insideBounds(card), JSON.stringify(card)).toBe(true);
  // One of the two sides, CARD_GAP from the item.
  const above = card.y + card.h === item.y - CARD_GAP;
  const below = card.y === item.y + item.h + CARD_GAP;
  expect(above || below).toBe(true);
  // When a side inside the bounds keeps clear of the other Group's label, the card is on such a side.
  if (avoid !== null) {
    const sides = [
      { ...card, y: item.y - CARD_GAP - card.h },
      { ...card, y: item.y + item.h + CARD_GAP },
    ];
    if (sides.some((c) => insideBounds(c) && !intersects(c, avoid))) expect(intersects(card, avoid)).toBe(false);
  }
}

const arbSize = fc.record({ w: fc.integer({ min: 1, max: 700 }), h: fc.integer({ min: 1, max: 400 }) });

describe("Feature: ghosts-and-graveyard, Property 16: The card never covers its item and stays on the stage", () => {
  it("covers the whole finite domain of items at the largest size, with and without a label to avoid", () => {
    expect(ITEMS).toHaveLength(22);
    for (const item of ITEMS) {
      checkItem(item, CARD_MAX, null);
      checkItem(item, CARD_MAX, otherLabel(item));
    }
  });

  it("holds for any generated item and any measured card size", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: ITEMS.length - 1 }), arbSize, fc.boolean(), (index, size, avoidIt) => {
        const item = ITEMS[index] ?? stoneRect(0);
        checkItem(item, size, avoidIt ? otherLabel(item) : null);
      }),
      PROP_PARAMS,
    );
  });

  it("reaches both sides and both outcomes of the label rule often enough not to be luck", () => {
    const sample = fc.sample(fc.tuple(fc.integer({ min: 0, max: ITEMS.length - 1 }), arbSize), { numRuns: 2000, seed: 16 });
    let kept = 0;
    let covered = 0;
    for (const [index, size] of sample) {
      const item = ITEMS[index] ?? stoneRect(0);
      if (intersects(placeCard(item, size, otherLabel(item)), otherLabel(item))) covered++;
      else kept++;
    }
    expect(kept).toBeGreaterThanOrEqual(200);
    expect(covered).toBeGreaterThanOrEqual(200);
  });
});
// --- Property 17 ------------------------------------------------------------------------------------------------------

/** Limits S, D, K (L8): stones, day shelves, stubs per day. */
interface Limits {
  readonly S: number;
  readonly D: number;
  readonly K: number;
}
const DEFAULT_LIMITS: Limits = { S: 10, D: 3, K: 4 };

/** One view: stones drawn, and per day the stubs drawn and whether "+n more" shows. */
interface Scenario {
  readonly stones: number;
  readonly days: readonly { readonly stubs: number; readonly more: boolean }[];
}

/** A count in 0..max (min..max), the two ends weighted so the maxima are met often. */
const biased = (min: number, max: number): fc.Arbitrary<number> =>
  fc.oneof(
    { weight: 4, arbitrary: fc.constant(max) },
    { weight: 1, arbitrary: fc.constant(min) },
    { weight: 2, arbitrary: fc.integer({ min, max }) },
  );

const arbLimits: fc.Arbitrary<Limits> = fc.oneof(
  { weight: 3, arbitrary: fc.constant(DEFAULT_LIMITS) },
  {
    weight: 2,
    arbitrary: fc.record({ S: fc.integer({ min: 0, max: 10 }), D: fc.integer({ min: 0, max: 3 }), K: fc.integer({ min: 1, max: 4 }) }),
  },
);

const arbScenario: fc.Arbitrary<Scenario> = arbLimits.chain((lim) =>
  fc.record({
    stones: biased(0, lim.S),
    days: biased(0, lim.D).chain((n) =>
      fc.array(fc.record({ stubs: biased(1, lim.K), more: fc.oneof({ weight: 3, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }) }), { minLength: n, maxLength: n }),
    ),
  }),
);

/** A named rectangle: the name only makes a failure readable. */
interface Named {
  readonly name: string;
  readonly rect: Rect;
}

/** Every rectangle the view draws for a scenario (R4.10 to R4.12). Header and labels come from the L7 table. */
function viewRects(s: Scenario): Named[] {
  const out: Named[] = [
    { name: "graveyard label", rect: textLine(LABEL_Y.stones) },
    { name: "shelf label", rect: textLine(LABEL_Y.shelf) },
    { name: "stones count line", rect: textLine(COUNT_LINE_Y.stones) },
    { name: "shelf count line", rect: textLine(COUNT_LINE_Y.shelf) },
  ];
  for (let i = 0; i < s.stones; i++) out.push({ name: `stone ${i}`, rect: stoneRect(i) });
  if (s.stones === 0) out.push({ name: "stones empty line", rect: textLine(EMPTY_LINE_Y.stones) });
  s.days.forEach((day, r) => {
    out.push({ name: `date label ${r}`, rect: dateLabelRect(r) });
    for (let j = 0; j < day.stubs; j++) out.push({ name: `stub ${r},${j}`, rect: stubRect(r, j) });
    if (day.more) out.push({ name: `more ${r}`, rect: moreRect(r) });
  });
  if (s.days.length === 0) out.push({ name: "shelf empty line", rect: textLine(EMPTY_LINE_Y.shelf) });
  return out;
}

const inside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

/** The layout checks for one scenario: all inside the panel, none touching another, the return control clear of all (R4.10, R4.11, R4.12). */
function checkLayout(s: Scenario): void {
  const all = viewRects(s);
  for (const a of all) expect(inside(a.rect, PANEL_RECT), `${a.name} inside the panel`).toBe(true);
  for (let i = 0; i < all.length; i++) {
    for (let k = i + 1; k < all.length; k++) {
      const a = all[i];
      const b = all[k];
      if (a !== undefined && b !== undefined) expect(intersects(a.rect, b.rect), `${a.name} meets ${b.name}`).toBe(false);
    }
  }
  // The return control shares the Door's rectangle (L1, R3.14): it must meet nothing.
  for (const a of all) expect(intersects(a.rect, DOOR_RECT), `${a.name} meets the return control`).toBe(false);
  // The focus ring (D14): every item and the return control, grown by the ring's 6 px, keeps 2 px from every text line, at the
  // scale of each of the four viewports.
  const rings = [...all.filter((a) => /^(stone|stub) /.test(a.name)), { name: "return control", rect: DOOR_RECT }];
  const texts = all.filter((a) => !/^(stone|stub) /.test(a.name));
  for (const scale of SCALES) {
    const grow = RING_PX / scale;
    for (const r of rings) {
      const ring: Rect = { x: r.rect.x - grow, y: r.rect.y - grow, w: r.rect.w + 2 * grow, h: r.rect.h + 2 * grow };
      for (const t of texts) {
        const clear = !intersects(ring, t.rect) && gap(ring, t.rect) * scale >= RING_CLEAR_PX - 1e-9;
        expect(clear, `the ring of ${r.name} and ${t.name} at scale ${scale}`).toBe(true);
      }
    }
  }
}

/** The stage scales of the four viewports of R4.10. */
const SCALES: readonly number[] = [
  [360, 640],
  [768, 1024],
  [1280, 800],
  [1920, 1080],
].map(([w, h]) => stageBox(w ?? 0, h ?? 0).scale);

const cellOf = (k: number): Rect => {
  const slot = GHOST_SLOTS[k];
  const cx = slot?.cx ?? 0;
  const cy = slot?.cy ?? 0;
  return { x: cx - 45, y: cy - 47.5, w: 90, h: 95 };
};

/** The box of slot k at full size, grown by DRIFT_UNITS on each side: the drift extremes (L2, L3). */
function driftedBox(k: number): Rect {
  const slot = GHOST_SLOTS[k];
  const cx = slot?.cx ?? 0;
  const cy = slot?.cy ?? 0;
  return {
    x: cx - GHOST_BOX.w / 2 - DRIFT_UNITS,
    y: cy - GHOST_BOX.h / 2 - DRIFT_UNITS,
    w: GHOST_BOX.w + 2 * DRIFT_UNITS,
    h: GHOST_BOX.h + 2 * DRIFT_UNITS,
  };
}

/** Ghost checks for one slot (R9.4, R9.5, R10.8). */
function checkSlot(k: number): void {
  const cell = cellOf(k);
  for (const box of [driftedBox(k), { ...driftedBox(k), x: driftedBox(k).x + DRIFT_UNITS, y: driftedBox(k).y + DRIFT_UNITS, w: GHOST_BOX.w, h: GHOST_BOX.h }]) {
    expect(inside(box, cell), `slot ${k} inside its cell`).toBe(true);
    for (let o = 0; o < GHOST_SLOTS.length; o++) {
      if (o !== k) expect(intersects(box, cellOf(o)), `slot ${k} meets cell ${o}`).toBe(false);
    }
    expect(intersects(box, DOOR_RECT), `slot ${k} meets the Door`).toBe(false);
    expect(intersects(box, KEEP_CLEAR_COLUMN_UNITS), `slot ${k} meets the candle column`).toBe(false);
    expect(box.y + box.h, `slot ${k} above the floor band`).toBeLessThanOrEqual(FLOOR_UNITS);
  }
}

const isMaxima = (s: Scenario): boolean => s.stones === 10 && s.days.length === 3 && s.days.every((d) => d.stubs === 4 && d.more);

describe("Feature: ghosts-and-graveyard, Property 17: The layout fits and does not overlap", () => {
  it("holds for the default limits at their maxima, with every day showing +n more", () => {
    const full: Scenario = { stones: 10, days: [0, 1, 2].map(() => ({ stubs: 4, more: true })) };
    expect(isMaxima(full)).toBe(true);
    checkLayout(full);
  });

  it("holds for the empty Stones Group and the empty Shelf", () => {
    checkLayout({ stones: 0, days: [] });
    checkLayout({ stones: 10, days: [] });
    checkLayout({ stones: 0, days: [{ stubs: 4, more: true }] });
  });

  it("holds for any generated counts up to the limits", () => {
    fc.assert(
      fc.property(arbScenario, (s) => {
        checkLayout(s);
      }),
      PROP_PARAMS,
    );
  });

  it("meets the maxima, an empty Stones Group and an empty Shelf often enough not to be luck", () => {
    const sample = fc.sample(arbScenario, { numRuns: 2000, seed: 17 });
    const count = (p: (s: Scenario) => boolean): number => sample.filter(p).length;
    expect(count(isMaxima)).toBeGreaterThanOrEqual(20);
    expect(count((s) => s.stones === 10)).toBeGreaterThanOrEqual(50);
    expect(count((s) => s.stones === 0)).toBeGreaterThanOrEqual(50);
    expect(count((s) => s.days.length === 0)).toBeGreaterThanOrEqual(50);
    expect(count((s) => s.days.some((d) => d.more))).toBeGreaterThanOrEqual(100);
  });

  it("keeps every ghost slot, at full size and at its drift extremes, in its own cell and clear of the rest", () => {
    expect(GHOST_SLOTS).toHaveLength(12);
    for (let k = 0; k < GHOST_SLOTS.length; k++) checkSlot(k);
  });

  it("holds for any generated slot", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: GHOST_SLOTS.length - 1 }), (k) => {
        checkSlot(k);
      }),
      PROP_PARAMS,
    );
  });
});
