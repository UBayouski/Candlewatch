import type { FlameMode } from "./types";

// --- the model (design 3.1) ---

/** "Last minute" threshold in ms (R5.1). */
export const GUTTER_MS = 60_000;
/** Smallest light radius while a candle exists (R7.2). */
export const LIGHT_MIN = 0.2;
/** Light radius at a whole candle. */
export const LIGHT_MAX = 1;
/** Radius in room units when `lightRadius` is 1. */
export const LIGHT_FULL_UNITS = 700;
/** Wax heights at which drips 1, 2 and 3 appear (R4.1). */
export const DRIP_MARKS = [0.75, 0.5, 0.25] as const;
/** Flicker seed when none is given. */
export const DEFAULT_SEED = 20261031;

// --- the flames (design 3.3) ---

export interface FlameLook {
  readonly flameHeight: number;
  readonly flameBlue: number;
  readonly flameRagged: number;
  readonly flameGlow: number;
  readonly smoke: number;
}

/** Fixed per mode (R5.5). Size is `flameHeight`, colour is `flameBlue`, shape is `flameRagged`. */
export const FLAME_LOOK: Readonly<Record<FlameMode, FlameLook>> = {
  unlit: { flameHeight: 0, flameBlue: 0, flameRagged: 0, flameGlow: 0, smoke: 0 },
  steady: { flameHeight: 1, flameBlue: 0, flameRagged: 0, flameGlow: 1, smoke: 0 },
  guttering: { flameHeight: 0.6, flameBlue: 0, flameRagged: 1, flameGlow: 0.55, smoke: 0 },
  paused: { flameHeight: 0.35, flameBlue: 1, flameRagged: 0, flameGlow: 0.35, smoke: 0 },
  smoke: { flameHeight: 0, flameBlue: 0, flameRagged: 0, flameGlow: 0, smoke: 1 },
};

// --- the flicker (design 4) ---

export interface FlickerAmplitude {
  /** Degrees. */
  readonly lean: number;
  readonly height: number;
  readonly glow: number;
  /** Occasional deeper dips (the sputter). */
  readonly sputter: boolean;
}

export const FLICKER_AMPLITUDE: Readonly<Record<FlameMode, FlickerAmplitude>> = {
  unlit: { lean: 0, height: 0, glow: 0, sputter: false },
  steady: { lean: 3, height: 0.06, glow: 0.08, sputter: false },
  paused: { lean: 1, height: 0.03, glow: 0.04, sputter: false },
  guttering: { lean: 7, height: 0.12, glow: 0.15, sputter: true },
  smoke: { lean: 0, height: 0, glow: 0, sputter: false },
};

/** Noise channels and their lattice step in ms (design 4.2). */
export const FLICKER_CHANNEL = { lean: 0, height: 1, glow: 2 } as const;
export const FLICKER_STEP_MS = { lean: 120, height: 70, glow: 90 } as const;

/** The sputter (design 4.4). */
export const DIP_WINDOW_MS = 1500;
export const DIP_WIDTH_MS = 400;
export const DIP_PROBABILITY = 0.35;
export const DIP_DEPTH_MIN = 0.25;
export const DIP_DEPTH_SPAN = 0.2;
export const DIP_GLOW_FACTOR = 0.9;

// --- the room (design 5.4), in room units ---

/** Full candle height. The drawn height is `CANDLE_H * waxHeight` (R3.7). */
export const CANDLE_H = 420;
/** The candle's base, the drip clip line and the top of the time-text zone. */
export const FLOOR_Y = 900;
/** The stub of an ended candle. */
export const STUB_H = 28;
