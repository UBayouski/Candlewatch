// P10 (controls-and-access R8.2 to R8.7, R10.6): the placement keeps every rule at every viewport.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { G, HALO_TOP_UNITS, M, PAD_COLUMN, PAD_WINDOW, T, placeControls, stageBox, visibleControls } from "./layout";
import type { ControlName, Placement, Rect } from "./layout";
import { PROP_PARAMS } from "./test-kit";

const EPS = 1e-6;
const AMPLE = 4;

type Viewport = readonly [number, number];

/** The four named sizes of the design (6.5), always tried. */
const NAMED: readonly Viewport[] = [
  [360, 640],
  [1280, 800],
  [768, 1024],
  [1920, 1080],
];

const arbAny: fc.Arbitrary<Viewport> = fc.tuple(fc.integer({ min: 360, max: 2560 }), fc.integer({ min: 640, max: 1440 }));

/** Viewports on the switches: ox near 360, the window top near 50, the smallest zones, the edges of the range. */
const arbBoundary: fc.Arbitrary<Viewport> = fc.oneof(
  // ox = 360 when the stage is limited by height: vw = 0.6 vh + 720.
  fc.tuple(fc.integer({ min: 640, max: 1440 }), fc.integer({ min: -3, max: 3 })).map(([h, d]): Viewport => [clampW(Math.round(0.6 * h + 720) + d), h]),
  // the window top is 50 when the stage is limited by width: vh = 100 + 900 vw / 600 ... solve oy + 50 s = 50 for s = vw / 600.
  fc.tuple(fc.integer({ min: 360, max: 1000 }), fc.integer({ min: -3, max: 3 })).map(([w, d]): Viewport => [w, clampH(Math.round(100 + (900 * w) / 600) + d)]),
  // the smallest zones: the lowest heights, and the narrowest widths.
  fc.tuple(fc.integer({ min: 360, max: 2560 }), fc.integer({ min: 640, max: 660 })),
  fc.tuple(fc.integer({ min: 360, max: 380 }), fc.integer({ min: 640, max: 1440 })),
  fc.tuple(fc.integer({ min: 2540, max: 2560 }), fc.integer({ min: 1420, max: 1440 })),
);

function clampW(w: number): number {
  return Math.min(Math.max(w, 360), 2560);
}
function clampH(h: number): number {
  return Math.min(Math.max(h, 640), 1440);
}

const arbViewport: fc.Arbitrary<Viewport> = fc.oneof({ weight: 3, arbitrary: arbAny }, { weight: 3, arbitrary: arbBoundary }, { weight: 1, arbitrary: fc.constantFrom(...NAMED) });

// --- geometry helpers --------------------------------------------------------

const right = (r: Rect): number => r.x + r.w;
const bottom = (r: Rect): number => r.y + r.h;

/** The empty space between two rectangles in pixels; negative when they overlap. */
function gap(a: Rect, b: Rect): number {
  const dx = Math.max(a.x - right(b), b.x - right(a));
  const dy = Math.max(a.y - bottom(b), b.y - bottom(a));
  return Math.max(dx, dy);
}

const inside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x - EPS && inner.y >= outer.y - EPS && right(inner) <= right(outer) + EPS && bottom(inner) <= bottom(outer) + EPS;

/** `a` comes before `b` when reading top to bottom, then left to right: wholly above it, or on the same rows and wholly to its left. */
function readsBefore(a: Rect, b: Rect): boolean {
  if (bottom(a) <= b.y + EPS) return true;
  const sameRows = a.y < bottom(b) - EPS && b.y < bottom(a) - EPS;
  return sameRows && right(a) <= b.x + EPS;
}

interface Item {
  readonly name: string;
  readonly rect: Rect;
}

/** What is on screen together when no candle burns, and while one does. */
function sets(p: Placement): { setup: Item[]; running: Item[] } {
  return {
    setup: [
      { name: "chooser", rect: p.setup.chooser },
      ...(p.setup.lengthError ? [{ name: "lengthError", rect: p.setup.lengthError }] : []),
      { name: "intent", rect: p.setup.intent },
      { name: "light", rect: p.setup.light },
      { name: "settings", rect: p.zoneControls.settings },
      { name: "time", rect: p.time },
      { name: "status", rect: p.statusResting },
    ],
    running: [
      { name: "pause", rect: p.zoneControls.pause },
      { name: "snuff", rect: p.zoneControls.snuff },
      { name: "settings", rect: p.zoneControls.settings },
      { name: "time", rect: p.time },
      { name: "status", rect: p.statusRunning },
    ],
  };
}

/** Every rule of design 6.8 for one viewport. Throws with the broken rule's name. */
function violations(vw: number, vh: number): string[] {
  const out: string[] = [];
  const bad = (rule: string, cond: boolean): void => {
    if (!cond) out.push(rule);
  };
  const p = placeControls(vw, vh);
  const viewport: Rect = { x: 0, y: 0, w: vw, h: vh };
  const { setup, running } = sets(p);
  const all: Item[] = [
    ...setup,
    ...running,
    ...p.setup.cells.map((rect, i) => ({ name: `cell${i}`, rect })),
    { name: "zone", rect: p.zone },
    { name: "textArea", rect: p.textArea },
  ];

  // Every rectangle is inside the viewport.
  for (const { name, rect } of all) bad(`${name} inside the viewport`, inside(rect, viewport));
  bad("snuff dialog inside the viewport", inside(p.snuffDialog, viewport));
  bad("settings panel inside the viewport", inside(p.settingsPanel, viewport));

  // Every control is at least 44 by 44.
  const controls: Item[] = [
    { name: "chooser", rect: p.setup.chooser },
    ...p.setup.cells.map((rect, i) => ({ name: `cell${i}`, rect })),
    { name: "intent", rect: p.setup.intent },
    { name: "light", rect: p.setup.light },
    { name: "pause", rect: p.zoneControls.pause },
    { name: "snuff", rect: p.zoneControls.snuff },
    { name: "settings", rect: p.zoneControls.settings },
  ];
  for (const { name, rect } of controls) bad(`${name} is at least ${T} x ${T}`, rect.w >= T - EPS && rect.h >= T - EPS);

  // Every pair that is on screen together keeps at least 4 px. The time text and the status line are one text stack: they touch.
  for (const [label, set] of [["setup", setup], ["running", running]] as const) {
    set.forEach((a, i) => {
      for (const b of set.slice(i + 1)) {
        if ((a.name === "time" && b.name === "status") || (a.name === "status" && b.name === "time")) {
          bad(`status is under the time text (${label})`, p.statusRunning.y >= bottom(p.time) - EPS && p.statusResting.y >= bottom(p.time) - EPS);
        } else {
          bad(`${a.name} and ${b.name} keep ${AMPLE} px (${label})`, gap(a.rect, b.rect) >= AMPLE - EPS);
        }
      }
    });
  }
  // The cells of the chooser keep a gap between them.
  p.setup.cells.forEach((a, i) => p.setup.cells.slice(i + 1).forEach((b) => bad("chooser cells keep a gap", gap(a, b) >= G - EPS)));
  p.setup.cells.forEach((c, i) => bad(`cell${i} inside the chooser`, inside(c, p.setup.chooser)));

  // The setup controls: 6 px from the keep-clear column, 1 px from the window pane, above the floor line.
  for (const { name, rect } of [
    { name: "chooser", rect: p.setup.chooser },
    ...(p.setup.lengthError ? [{ name: "lengthError", rect: p.setup.lengthError }] : []),
    { name: "intent", rect: p.setup.intent },
    { name: "light", rect: p.setup.light },
  ]) {
    bad(`${name} keeps ${PAD_COLUMN} px from the column`, gap(rect, p.keepClear.column) >= PAD_COLUMN - EPS);
    bad(`${name} keeps ${PAD_WINDOW} px from the window pane`, gap(rect, p.keepClear.windowPane) >= PAD_WINDOW - EPS);
    bad(`${name} is above the floor line`, bottom(rect) <= p.floorY + EPS);
  }

  // Reading order: the chooser above the intent field, the intent field before Light.
  bad("the chooser is above (or, in the left-region variant, left of) the intent field", bottom(p.setup.chooser) <= p.setup.intent.y + EPS || (p.variant === "left-region" && right(p.setup.chooser) <= p.setup.intent.x + EPS));
  bad("the intent field is before Light", readsBefore(p.setup.intent, p.setup.light));
  // The length message stands directly under the chooser in the wide layout (the compact layout has none).
  bad("the length message exists exactly in the wide layout", (p.setup.lengthError !== null) === (p.mode === "wide"));
  if (p.setup.lengthError) {
    bad("the length message is directly under the chooser", p.setup.lengthError.y >= bottom(p.setup.chooser) - EPS && p.setup.lengthError.y - bottom(p.setup.chooser) <= 8);
    bad("the length message is above the intent field", bottom(p.setup.lengthError) <= p.setup.intent.y + EPS);
  }

  // No text sits within 8 px of the bottom edge of the viewport (a phone's home bar), and the status line ends inside the zone.
  for (const [name, r] of [["time", p.time], ["statusRunning", p.statusRunning], ["statusResting", p.statusResting]] as const) bad(`${name} ends 8 px above the bottom edge`, bottom(r) <= vh - 8 + EPS);

  // The settings panel covers the chooser underneath wholly (no sliver above or beside it) in the compact layout.
  if (p.mode === "compact") bad("the settings panel covers the chooser", inside(p.setup.chooser, p.settingsPanel));

  // The zone: the buttons, the time text and the status line are wholly inside it, left to right Pause, Let it go dark, Settings.
  const z = p.zoneControls;
  for (const { name, rect } of [
    { name: "pause", rect: z.pause },
    { name: "snuff", rect: z.snuff },
    { name: "settings", rect: z.settings },
    { name: "time", rect: p.time },
    { name: "statusRunning", rect: p.statusRunning },
    { name: "statusResting", rect: p.statusResting },
  ]) bad(`${name} is inside the zone`, inside(rect, p.zone));
  bad("Pause, Let it go dark and Settings run left to right", right(z.pause) <= z.snuff.x + EPS && right(z.snuff) <= z.settings.x + EPS);
  bad("the time text is inside the text area", inside(p.time, p.textArea));
  bad("the time text is centred on the candle", Math.abs(p.time.x + p.time.w / 2 - (p.stage.ox + 300 * p.stage.scale)) < 1e-6);
  for (const [label, status] of [["running", p.statusRunning], ["resting", p.statusResting]] as const) {
    bad(`the status line (${label}) is inside the viewport`, inside(status, viewport));
  }
  bad("the status line is wider than 136 px while running", p.statusRunning.w >= 136 - EPS);

  // The left edge band below y = 300 room units, down to the floor line, is free (the door's slot).
  const bandRight = p.stage.ox + 110 * p.stage.scale;
  const bandTop = p.stage.oy + 300 * p.stage.scale;
  for (const { name, rect } of controls) {
    if (bottom(rect) <= bandTop + EPS || rect.y >= p.floorY - EPS) continue; // not in the band's rows
    bad(`${name} leaves the left edge band free`, rect.x >= bandRight - EPS);
  }

  // While a session runs, no persistent control or text is above the floor line.
  for (const { name, rect } of running) bad(`${name} is below the floor line while a session runs`, rect.y >= p.floorY - EPS);

  // Compact sizes: the intent field is wide enough to type in.
  if (p.mode === "compact") bad("the compact intent field is at least 120 px wide", p.setup.intent.w >= 120 - EPS);

  // DOM order equals reading order for both sets.
  for (const running of [false, true]) {
    const list = visibleControls(p, running);
    list.slice(1).forEach((b, i) => bad(`${(list[i] as { name: ControlName }).name} before ${b.name} in reading order`, readsBefore((list[i] as { rect: Rect }).rect, b.rect)));
  }

  // The compact snuff dialog stops above the halo's highest point.
  if (p.mode === "compact") bad("the snuff dialog stops above the halo", bottom(p.snuffDialog) + M <= p.stage.oy + HALO_TOP_UNITS * p.stage.scale + EPS);

  // No control covers the Door or a ghost cell (ghosts-and-graveyard P10; the cells stay drawn while the setup controls show).
  // The length message (a filled box in the wide layout) is covered too: it is not a control, but it is drawn on the room.
  const clearOf: Item[] = [...controls, ...(p.setup.lengthError ? [{ name: "lengthError", rect: p.setup.lengthError }] : [])];
  for (const { name, rect } of clearOf) {
    bad(`${name} keeps clear of the Door`, gap(rect, p.keepClear.door) >= -EPS);
    p.keepClear.ghostCells.forEach((cell, i) => bad(`${name} keeps clear of ghost cell ${i}`, gap(rect, cell) >= -EPS));
  }

  // The stage and the box agree.
  bad("placement uses the stage box", JSON.stringify(p.stage) === JSON.stringify(stageBox(vw, vh)));
  return out;
}

describe("P10: layout geometry (R8.2 to R8.7, R10.6)", () => {
  it("keeps every rule at the four named sizes", () => {
    for (const [w, h] of NAMED) expect(violations(w, h), `${w} x ${h}`).toEqual([]);
  });

  it("keeps every rule at every viewport from 360 x 640 to 2560 x 1440, boundaries included", () => {
    fc.assert(
      fc.property(arbViewport, ([w, h]) => {
        expect(violations(w, h), `${w} x ${h}`).toEqual([]);
      }),
      { ...PROP_PARAMS, numRuns: 1500 },
    );
  });

  it("keeps every rule across a regular sweep of the whole range", () => {
    for (let w = 360; w <= 2560; w += 13) for (let h = 640; h <= 1440; h += 17) expect(violations(w, h), `${w} x ${h}`).toEqual([]);
  });

  it("is a pure function of the size", () => {
    fc.assert(
      fc.property(arbViewport, ([w, h]) => {
        expect(placeControls(w, h)).toEqual(placeControls(w, h));
      }),
      PROP_PARAMS,
    );
  });
});
