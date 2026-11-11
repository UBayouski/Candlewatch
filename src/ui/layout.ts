// Where the controls and text go (controls-and-access R8.2 to R8.7, R10.6; design section 6).
// Pure: a viewport size in, pixel rectangles out. It keeps its own copy of the few scene numbers it must avoid
// (the scene is not imported); layout.test.ts compares them with src/scene/constants.ts and the halo markup.

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Stage {
  /** CSS pixels per room unit. */
  readonly scale: number;
  /** Left edge of the 600-unit-wide stage, in CSS pixels. */
  readonly ox: number;
  /** Top edge of the 1000-unit-high stage, in CSS pixels. */
  readonly oy: number;
}

export interface Placement {
  readonly mode: "compact" | "wide";
  /** Where the setup controls go: a row across the top, a grid left of the window pane, or a column beside the stage. */
  readonly variant: "top-row" | "left-region" | "column";
  readonly stage: Stage;
  /** The floor line: the candle base, the clip line of the light, the top of the zone. */
  readonly floorY: number;
  /** The floor line to the bottom of the viewport, full width. */
  readonly zone: Rect;
  /** The scene's `.zone-text-area`: X(110)..X(490), the floor line to Y(1000). */
  readonly textArea: Rect;
  readonly timeSize: number;
  readonly time: Rect;
  /** The status line while Pause and Let it go dark are shown. */
  readonly statusRunning: Rect;
  /** The status line in `idle` and the ended phases (wider; two lines when there is room). */
  readonly statusResting: Rect;
  readonly setup: {
    readonly chooser: Rect;
    readonly cells: readonly [Rect, Rect, Rect, Rect];
    readonly intent: Rect;
    readonly light: Rect;
  };
  readonly zoneControls: {
    readonly pause: Rect;
    readonly snuff: Rect;
    readonly settings: Rect;
    /** True in the wide mode: the buttons show their text. */
    readonly labelled: boolean;
  };
  readonly snuffDialog: Rect;
  readonly settingsPanel: Rect;
  readonly keepClear: { readonly column: Rect; readonly windowPane: Rect };
}

/** Touch target, gap between controls, margin to the viewport edge, pad around the keep-clear column and the window pane (px). */
export const T = 44;
export const G = 8;
export const M = 8;
export const PAD_COLUMN = 6;
export const PAD_WINDOW = 1;

/** The room is 600 by 1000 units (candle-scene 5.1). */
export const ROOM_W = 600;
export const ROOM_H = 1000;
export const FLOOR_UNITS = 900;
/** Where the candle is, and the highest point of the halo over every wax height (circle centre 410, radius 120). */
export const CANDLE_AXIS_UNITS = 300;
export const HALO_TOP_UNITS = 290;

/** Room units, copied from the scene and guarded by layout.test.ts: the candle, flame, halo and idle pool over every wax height. */
export const KEEP_CLEAR_COLUMN_UNITS: Rect = { x: 160, y: 260, w: 280, h: 640 };
/** The window pane (blur not counted). */
export const KEEP_CLEAR_WINDOW_UNITS: Rect = { x: 240, y: 50, w: 120, h: 210 };

/** The zone text area (candle-scene): room units. */
const TEXT_AREA_UNITS = { x: 110, y: 900, w: 380, h: 100 } as const;

/** Wide mode needs this much free space on each side of the stage (px). */
export const WIDE_MIN_SIDE = 360;
/** The top row needs the window pane to start at least this far below the viewport top (px). */
export const TOP_ROW_MIN_WINDOW_TOP = 50;
/** Compensates the float rounding of `oy + 50 s` (exactly 50 at 360 x 640). */
const EPS = 1e-9;

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/** The scene's own scaling rule (`viewBox 0 0 600 1000`, `meet`): where the stage sits in a viewport. */
export function stageBox(vw: number, vh: number): Stage {
  const w = Math.max(1, vw);
  const h = Math.max(1, vh);
  const scale = Math.min(w / ROOM_W, h / ROOM_H);
  return { scale, ox: (w - ROOM_W * scale) / 2, oy: (h - ROOM_H * scale) / 2 };
}

/**
 * The rectangles of every control and text for a viewport, in CSS pixels. Defined for any size; the rules of R8.3 are guaranteed from
 * 360 x 640 up (best effort below, design 6.7).
 */
export function placeControls(vw: number, vh: number): Placement {
  const width = Math.max(1, vw);
  const height = Math.max(1, vh);
  const stage = stageBox(width, height);
  const { scale: s, ox, oy } = stage;
  const X = (u: number): number => ox + u * s;
  const Y = (u: number): number => oy + u * s;

  const floorY = Y(FLOOR_UNITS);
  const zoneH = height - floorY;
  const cx = X(CANDLE_AXIS_UNITS);
  const wide = ox >= WIDE_MIN_SIDE;
  const textArea = rect(X(TEXT_AREA_UNITS.x), floorY, TEXT_AREA_UNITS.w * s, TEXT_AREA_UNITS.h * s);
  const windowPx = rect(X(KEEP_CLEAR_WINDOW_UNITS.x), Y(KEEP_CLEAR_WINDOW_UNITS.y), KEEP_CLEAR_WINDOW_UNITS.w * s, KEEP_CLEAR_WINDOW_UNITS.h * s);
  const column = rect(X(KEEP_CLEAR_COLUMN_UNITS.x), Y(KEEP_CLEAR_COLUMN_UNITS.y), KEEP_CLEAR_COLUMN_UNITS.w * s, KEEP_CLEAR_COLUMN_UNITS.h * s);

  // The zone, both modes: buttons centred vertically, the time text under the floor line, the status line under it.
  const by = floorY + (zoneH - T) / 2;
  const timeSize = wide ? clamp(zoneH - 28, 32, 44) : 36;
  const timeW = Math.round(3.1 * timeSize);
  const time = rect(cx - timeW / 2, floorY + 2, timeW, timeSize);
  const statusY = time.y + time.h;

  let pause: Rect;
  let snuff: Rect;
  let settings: Rect;
  let statusRunning: Rect;
  let statusResting: Rect;
  if (wide) {
    pause = rect(textArea.x - 16 - 128, by, 128, T);
    snuff = rect(textArea.x + textArea.w + 16, by, 160, T);
    settings = rect(snuff.x + snuff.w + G, by, 96, T);
    statusRunning = rect(textArea.x, statusY, textArea.w, 20);
    const half = Math.max(0, Math.min(cx - M, settings.x - G - cx));
    statusResting = rect(cx - half, statusY, 2 * half, 20);
  } else {
    pause = rect(M, by, T, T);
    settings = rect(width - M - T, by, T, T);
    snuff = rect(settings.x - G - T, by, T, T);
    const runningHalf = Math.max(0, Math.min(cx - (pause.x + T + G), snuff.x - G - cx));
    statusRunning = rect(cx - runningHalf, statusY, 2 * runningHalf, 20);
    const restHalf = Math.max(0, Math.min(cx - M, settings.x - G - cx));
    statusResting = rect(cx - restHalf, statusY, 2 * restHalf, zoneH >= 80 ? 40 : 20);
  }

  // The setup controls (idle and the ended phases), always above the floor line.
  let variant: Placement["variant"];
  let chooser: Rect;
  let cells: [Rect, Rect, Rect, Rect];
  let intent: Rect;
  let light: Rect;
  let snuffDialog: Rect;
  let settingsPanel: Rect;
  if (wide) {
    variant = "column";
    const cw = Math.min(360, ox - 48);
    const x0 = width - 24 - cw;
    chooser = rect(x0, 96, cw, T);
    const cell = (cw - 3 * G) / 4;
    cells = [0, 1, 2, 3].map((i) => rect(x0 + i * (cell + G), 96, cell, T)) as [Rect, Rect, Rect, Rect];
    intent = rect(x0, 152, cw, T);
    light = rect(x0, 212, cw, 52);
    snuffDialog = rect(x0, 96, cw, 260);
    settingsPanel = rect(24, 96, cw, 360);
  } else {
    const topRow = windowPx.y >= TOP_ROW_MIN_WINDOW_TOP - EPS;
    variant = topRow ? "top-row" : "left-region";
    const rowY = topRow ? 56 : 108;
    if (topRow) {
      const cell = (width - 2 * M - 3 * G) / 4;
      chooser = rect(M, 4, width - 2 * M, T);
      cells = [0, 1, 2, 3].map((i) => rect(M + i * (cell + G), 4, cell, T)) as [Rect, Rect, Rect, Rect];
    } else {
      chooser = rect(M, 4, 116, 96);
      cells = [0, 1, 2, 3].map((i) => rect(M + (i % 2) * (54 + G), 4 + Math.floor(i / 2) * (T + G), 54, T)) as [Rect, Rect, Rect, Rect];
    }
    intent = rect(M, rowY, Math.max(0, windowPx.x - G - M), T);
    light = rect(width - M - 116, rowY, 116, 52);
    // Anchored to the top and no taller than the space above the halo's highest point (design 6.6).
    snuffDialog = rect(M, M, width - 2 * M, Math.max(0, Y(HALO_TOP_UNITS) - 2 * M));
    settingsPanel = rect(M, M, width - 2 * M, Math.min(280, Math.max(0, height - 2 * M)));
  }

  return {
    mode: wide ? "wide" : "compact",
    variant,
    stage,
    floorY,
    zone: rect(0, floorY, width, zoneH),
    textArea,
    timeSize,
    time,
    statusRunning,
    statusResting,
    setup: { chooser, cells, intent, light },
    zoneControls: { pause, snuff, settings, labelled: wide },
    snuffDialog,
    settingsPanel,
    keepClear: { column, windowPane: windowPx },
  };
}

/**
 * The visible controls in DOM order, which is the Tab order and the reading order (R10.6, design 12.2):
 * chooser, intent, Light, then Settings when no candle burns; Pause or Resume, Let it go dark, Settings while one does.
 */
export type ControlName = "chooser" | "intent" | "light" | "pause" | "snuff" | "settings";
export const DOM_ORDER_SETUP: readonly ControlName[] = ["chooser", "intent", "light", "settings"];
export const DOM_ORDER_RUNNING: readonly ControlName[] = ["pause", "snuff", "settings"];

export function visibleControls(p: Placement, running: boolean): { name: ControlName; rect: Rect }[] {
  const rects: Record<ControlName, Rect> = {
    chooser: p.setup.chooser,
    intent: p.setup.intent,
    light: p.setup.light,
    pause: p.zoneControls.pause,
    snuff: p.zoneControls.snuff,
    settings: p.zoneControls.settings,
  };
  return (running ? DOM_ORDER_RUNNING : DOM_ORDER_SETUP).map((name) => ({ name, rect: rects[name] }));
}
