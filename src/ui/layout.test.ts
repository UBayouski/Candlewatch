import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CANDLE_H, FLOOR_Y, LIGHT_FULL_UNITS, LIGHT_MIN, WINDOW } from "../scene/constants";
import { ROOM_SVG } from "../scene/room";
import {
  CANDLE_AXIS_UNITS,
  DOM_ORDER_RUNNING,
  DOM_ORDER_SETUP,
  FLOOR_UNITS,
  G,
  HALO_TOP_UNITS,
  KEEP_CLEAR_COLUMN_UNITS,
  KEEP_CLEAR_WINDOW_UNITS,
  DOOR_RECT,
  GHOST_CELLS,
  M,
  PAD_COLUMN,
  PAD_WINDOW,
  ROOM_H,
  ROOM_W,
  T,
  placeControls,
  stageBox,
  visibleControls,
} from "./layout";
import type { Rect } from "./layout";

const HERE = dirname(fileURLToPath(import.meta.url));

function expectRect(actual: Rect, expected: readonly [number, number, number, number], label = ""): void {
  const got = [actual.x, actual.y, actual.w, actual.h];
  expected.forEach((value, i) => expect(got[i], `${label} ${["x", "y", "w", "h"][i]}`).toBeCloseTo(value, 6));
}

describe("the guard on the scene's numbers (D11)", () => {
  it("copies the room size, the floor line, the window pane and the candle axis", () => {
    expect([ROOM_W, ROOM_H]).toEqual([600, 1000]);
    expect(FLOOR_UNITS).toBe(FLOOR_Y);
    expect(KEEP_CLEAR_WINDOW_UNITS).toEqual({ x: WINDOW.x, y: WINDOW.y, w: WINDOW.width, h: WINDOW.height });
    expect(ROOM_SVG).toContain('viewBox="0 0 600 1000"');
    expect(ROOM_SVG).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it("keeps the column around the candle, the flame, the halo and the idle pool at every wax height", () => {
    // The idle pool: a disc of LIGHT_MIN x LIGHT_FULL_UNITS around (300, 400) (scene.css, wax height 1).
    const css = readFileSync(join(HERE, "..", "scene", "scene.css"), "utf8");
    const centre = css.match(/translate\((\d+)px,\s*calc\((\d+)px \+ \(1 - var\(--wax-height\)\) \* (\d+)px\)\)\s*scale\(var\(--light-radius\)\)/);
    expect(centre, "the pool rule in scene.css").not.toBeNull();
    const [cx, cy, drop] = [Number(centre?.[1]), Number(centre?.[2]), Number(centre?.[3])];
    expect(cx).toBe(CANDLE_AXIS_UNITS);
    expect(drop).toBe(CANDLE_H);
    const radius = LIGHT_MIN * LIGHT_FULL_UNITS;
    const column = KEEP_CLEAR_COLUMN_UNITS;
    expect(column.x).toBeLessThanOrEqual(cx - radius);
    expect(column.x + column.w).toBeGreaterThanOrEqual(cx + radius);
    expect(column.y).toBeLessThanOrEqual(cy - radius);
    expect(column.y + column.h).toBe(FLOOR_Y);

    // The halo circle of the markup, over every wax height (it moves down by (1 - wax) x CANDLE_H and is clipped at the floor line).
    const halo = ROOM_SVG.match(/<circle class="halo" cx="(\d+)" cy="(\d+)" r="(\d+)"/);
    expect(halo, "the halo circle in room.ts").not.toBeNull();
    const [hx, hy, hr] = [Number(halo?.[1]), Number(halo?.[2]), Number(halo?.[3])];
    expect(hx).toBe(CANDLE_AXIS_UNITS);
    expect(hy - hr).toBe(HALO_TOP_UNITS);
    expect(column.x).toBeLessThanOrEqual(hx - hr);
    expect(column.x + column.w).toBeGreaterThanOrEqual(hx + hr);
    expect(column.y).toBeLessThanOrEqual(hy - hr);
    // The candle, 64 units wide, from the rim down to the floor line.
    expect(column.x).toBeLessThanOrEqual(268);
    expect(column.x + column.w).toBeGreaterThanOrEqual(332);
  });

  it("states the pads and targets the requirements name", () => {
    expect([T, G, M, PAD_COLUMN, PAD_WINDOW]).toEqual([44, 8, 8, 6, 1]);
  });
});

describe("stageBox", () => {
  it("is the scene's rule: scale = min(vw / 600, vh / 1000), centred", () => {
    expect(stageBox(360, 640)).toEqual({ scale: 0.6, ox: 0, oy: 20 });
    expect(stageBox(1280, 800)).toEqual({ scale: 0.8, ox: 400, oy: 0 });
    expect(stageBox(1920, 1080).ox).toBeCloseTo(636, 9);
  });
});

describe("360 x 640 (compact, top-row), design 6.5", () => {
  const p = placeControls(360, 640);
  it("is compact with the top row, floor line 560 and a 80 px zone", () => {
    expect([p.mode, p.variant, p.floorY]).toEqual(["compact", "top-row", 560]);
    expectRect(p.zone, [0, 560, 360, 80], "zone");
    expectRect(p.textArea, [66, 560, 228, 60], "text area");
  });
  it("keeps the column and the window pane where the table says", () => {
    expectRect(p.keepClear.column, [96, 176, 168, 384], "column");
    expectRect(p.keepClear.windowPane, [144, 50, 72, 126], "window");
  });
  it("puts the setup controls in the top rows", () => {
    expectRect(p.setup.chooser, [8, 4, 344, 44], "chooser");
    [8, 96, 184, 272].forEach((x, i) => expectRect(p.setup.cells[i] as Rect, [x, 4, 80, 44], `cell ${i}`));
    expectRect(p.setup.intent, [8, 56, 128, 44], "intent");
    expectRect(p.setup.light, [236, 56, 116, 52], "light");
  });
  it("puts the time, the status and the buttons in the zone", () => {
    expect(p.timeSize).toBe(36);
    expectRect(p.time, [124, 560, 112, 36], "time");
    expectRect(p.statusRunning, [112, 596, 136, 20], "status running");
    expectRect(p.statusResting, [60, 596, 240, 36], "status resting");
    // No text within 8 px of the bottom edge (the touch line wraps to two lines at rest).
    expect(p.statusResting.y + p.statusResting.h).toBeLessThanOrEqual(640 - 8);
    expectRect(p.zoneControls.pause, [8, 578, 44, 44], "pause");
    expectRect(p.zoneControls.snuff, [256, 578, 44, 44], "snuff");
    expectRect(p.zoneControls.settings, [308, 578, 44, 44], "settings");
    expect(p.zoneControls.labelled).toBe(false);
  });
  it("places the overlays", () => {
    expectRect(p.snuffDialog, [8, 8, 344, 178], "snuff dialog");
    expect(p.snuffDialog.y + p.snuffDialog.h + M).toBeCloseTo(194, 9); // 8 px above the halo's highest point
    expectRect(p.settingsPanel, [8, 0, 344, 280], "settings panel");
    expect(p.setup.lengthError).toBeNull();
  });
});

describe("1280 x 800 (wide, column), design 6.5", () => {
  const p = placeControls(1280, 800);
  it("is wide with the column variant, floor line 720 and a 80 px zone", () => {
    expect([p.mode, p.variant, p.floorY]).toEqual(["wide", "column", 720]);
    expectRect(p.zone, [0, 720, 1280, 80], "zone");
    expectRect(p.textArea, [488, 720, 304, 80], "text area");
  });
  it("keeps the column and the window pane where the table says", () => {
    expectRect(p.keepClear.column, [528, 208, 224, 512], "column");
    expectRect(p.keepClear.windowPane, [592, 40, 96, 168], "window");
  });
  it("puts the setup controls in the column beside the stage", () => {
    expectRect(p.setup.chooser, [904, 96, 352, 44], "chooser");
    [904, 994, 1084, 1174].forEach((x, i) => expectRect(p.setup.cells[i] as Rect, [x, 96, 82, 44], `cell ${i}`));
    expectRect(p.setup.lengthError as Rect, [904, 144, 352, 28], "length error");
    expectRect(p.setup.intent, [904, 180, 352, 44], "intent");
    expectRect(p.setup.light, [904, 240, 352, 52], "light");
  });
  it("puts the time, the status and the labelled buttons in the zone", () => {
    expect(p.timeSize).toBe(44);
    expectRect(p.time, [572, 720, 136, 44], "time");
    expectRect(p.statusRunning, [488, 764, 304, 20], "status running");
    expectRect(p.statusResting, [312, 764, 656, 20], "status resting");
    expectRect(p.zoneControls.pause, [344, 738, 128, 44], "pause");
    expectRect(p.zoneControls.snuff, [808, 738, 160, 44], "snuff");
    expectRect(p.zoneControls.settings, [976, 738, 96, 44], "settings");
    expect(p.zoneControls.labelled).toBe(true);
  });
  it("places the overlays in the side columns", () => {
    expectRect(p.snuffDialog, [904, 96, 352, 260], "snuff dialog");
    expectRect(p.settingsPanel, [24, 96, 352, 360], "settings panel");
  });
});

describe("the other sizes of design 6.5", () => {
  it("375 x 667: compact top-row, a 359 px chooser row and a 134 px intent field", () => {
    const p = placeControls(375, 667);
    expect([p.mode, p.variant]).toEqual(["compact", "top-row"]);
    expectRect(p.setup.chooser, [8, 4, 359, 44], "chooser");
    expect(p.setup.intent.w).toBeCloseTo(134, 6);
    expect(p.zone.h).toBeCloseTo(83.5, 6);
  });
  it("768 x 1024: compact top-row with the window top at 51.2, a 752 px chooser and a 307 px intent field", () => {
    const p = placeControls(768, 1024);
    expect([p.mode, p.variant]).toEqual(["compact", "top-row"]);
    expect(p.keepClear.windowPane.y).toBeCloseTo(51.2, 6);
    expect(p.setup.chooser.w).toBeCloseTo(752, 6);
    expect(p.setup.intent.w).toBeCloseTo(306.56, 6);
    expect(p.zone.h).toBeCloseTo(102.4, 6);
  });
  it("480 x 800: compact left-region, a 2 x 2 chooser grid and a 176 px intent field", () => {
    const p = placeControls(480, 800);
    expect([p.mode, p.variant]).toEqual(["compact", "left-region"]);
    expect(p.keepClear.windowPane.y).toBeCloseTo(40, 6);
    expectRect(p.setup.chooser, [8, 4, 116, 96], "chooser");
    [[8, 4], [70, 4], [8, 56], [70, 56]].forEach(([x, y], i) => expectRect(p.setup.cells[i] as Rect, [x as number, y as number, 54, 44], `cell ${i}`));
    expectRect(p.setup.intent, [8, 108, 176, 44], "intent");
    expectRect(p.setup.light, [356, 108, 116, 52], "light");
  });
  it("1920 x 1080: wide, a 360 px column and Settings at x 1349", () => {
    const p = placeControls(1920, 1080);
    expect([p.mode, p.variant]).toEqual(["wide", "column"]);
    expectRect(p.setup.chooser, [1536, 96, 360, 44], "chooser");
    expect(p.zoneControls.settings.x).toBeCloseTo(1349.2, 6);
  });
});

describe("the switches", () => {
  it("goes wide exactly when 360 px are free on each side of the stage (ox >= 360)", () => {
    // At 800 px high the stage is 480 wide: ox = (vw - 480) / 2.
    expect(stageBox(1200, 800).ox).toBe(360);
    expect(placeControls(1200, 800).mode).toBe("wide");
    expect(stageBox(1198, 800).ox).toBe(359);
    expect(placeControls(1198, 800).mode).toBe("compact");
  });
  it("uses the top row when the window pane starts at least 50 px down, else the left region", () => {
    expect(placeControls(360, 640).keepClear.windowPane.y).toBeCloseTo(50, 9);
    expect(placeControls(360, 640).variant).toBe("top-row");
    expect(placeControls(359, 640).variant).toBe("top-row");
    expect(placeControls(900, 800).keepClear.windowPane.y).toBeCloseTo(40, 9);
    expect(placeControls(900, 800).variant).toBe("left-region");
  });
  it("sizes the time text 36 px compact and 32 to 44 px wide by the zone height", () => {
    expect(placeControls(360, 640).timeSize).toBe(36);
    expect(placeControls(1104, 640).timeSize).toBe(36); // zone 64 px: 64 - 28
    expect(placeControls(1280, 800).timeSize).toBe(44);
    expect(placeControls(1190, 600).timeSize).toBe(32);
  });
  it("gives the status line at rest two lines only when the compact zone is 80 px or taller", () => {
    expect(placeControls(360, 640).statusResting.h).toBe(36);
    expect(placeControls(700, 640).statusResting.h).toBe(20); // zone 64 px
  });
});

describe("the order lists and the pure function", () => {
  it("lists the controls in DOM order for the idle and running sets", () => {
    expect(DOM_ORDER_SETUP).toEqual(["chooser", "intent", "light", "settings"]);
    expect(DOM_ORDER_RUNNING).toEqual(["pause", "snuff", "settings"]);
    const p = placeControls(360, 640);
    expect(visibleControls(p, false).map((c) => c.name)).toEqual(["chooser", "intent", "light", "settings"]);
    expect(visibleControls(p, true).map((c) => c.name)).toEqual(["pause", "snuff", "settings"]);
  });
  it("gives equal outputs for equal inputs", () => {
    expect(placeControls(777, 913)).toEqual(placeControls(777, 913));
  });
});

describe("the Door and the ghost cells (ghosts-and-graveyard CR5)", () => {
  it("are the keep-clear rectangles of the design in room units", () => {
    expect(DOOR_RECT).toEqual({ x: 20, y: 805, w: 80, h: 85 });
    expect(GHOST_CELLS).toHaveLength(12);
    expect(GHOST_CELLS.filter((c) => c.x === 10)).toHaveLength(6);
    expect(GHOST_CELLS.filter((c) => c.x === 500)).toHaveLength(6);
    expect(Math.min(...GHOST_CELLS.map((c) => c.y))).toBe(215);
    expect(Math.max(...GHOST_CELLS.map((c) => c.y + c.h))).toBe(785);
  });
  it("are placed in pixels with the stage scale at 360 x 640", () => {
    const p = placeControls(360, 640);
    expectRect(p.keepClear.door, [12, 20 + 805 * 0.6, 48, 51], "door");
    expect(p.keepClear.ghostCells).toHaveLength(12);
    expectRect(p.keepClear.ghostCells[0] as Rect, [6, 20 + 215 * 0.6, 54, 57], "cell 0");
  });
  it("keep clear of the candle column, the window pane and the floor band", () => {
    const p = placeControls(1280, 800);
    for (const cell of [p.keepClear.door, ...p.keepClear.ghostCells]) {
      const col = p.keepClear.column;
      expect(cell.x + cell.w <= col.x || cell.x >= col.x + col.w).toBe(true);
      expect(cell.y + cell.h).toBeLessThanOrEqual(p.floorY);
    }
  });
});