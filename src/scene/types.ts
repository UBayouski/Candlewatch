import type { State } from "../engine";

/** Optional caller content for the accessible name (R10.1, CR-S1). A plain string; the scene knows nothing about its meaning. */
export interface SceneExtra {
  readonly labelSuffix: string;
}

/** The five flames (R5.1). */
export type FlameMode = "unlit" | "steady" | "paused" | "guttering" | "smoke";

export interface SceneOptions {
  /** The still version of the scene (R9). Default false. */
  readonly reducedMotion?: boolean;
  /** Flicker seed. Default `DEFAULT_SEED`; a non-finite value falls back to it. */
  readonly seed?: number;
}

/** Plain data the renderer copies to the page. Numbers, booleans and two fixed unions only (R2.5). */
export interface SceneModel {
  // --- state (not motion) ---
  /** Echo of `state.phase`; the renderer writes `data-phase`. */
  readonly phase: State["phase"];
  /** [0, 1]. Equals `waxFraction` while running, 1 in idle, 0 after the end. */
  readonly waxHeight: number;
  readonly drips: 0 | 1 | 2 | 3;
  readonly flameMode: FlameMode;
  /** [0, 1] fraction of the full flame. */
  readonly flameHeight: number;
  /** [0, 1] 0 amber, 1 blue. */
  readonly flameBlue: number;
  /** 0 or 1. 1 is a leaning, ragged tip. */
  readonly flameRagged: number;
  /** [0, 1] strength of the flame's own light. */
  readonly flameGlow: number;
  /** 0 or 1. The wisp. */
  readonly smoke: number;
  /** 0 or 1. The stub of an ended candle (burned-out, snuffed). */
  readonly stub: number;
  /** [0, 1] fraction of `LIGHT_FULL_UNITS`. */
  readonly lightRadius: number;
  /** 0 or 1. */
  readonly dawn: number;
  /** `isBreak(state, now)`. */
  readonly cooling: boolean;
  // --- motion (zero or false under reduced motion) ---
  /** [-12, 12] degrees. */
  readonly flickerLean: number;
  /** [-0.6, 0.2] added to 1, scales the flame's height. */
  readonly flickerHeight: number;
  /** [-0.6, 0.25] added to `flameGlow`. */
  readonly flickerGlow: number;
  /** A new drip may run down. */
  readonly animateDrips: boolean;
  /** The wisp may sway. */
  readonly animateSmoke: boolean;
  /** Looks may ease between modes; the dawn may ease in. */
  readonly animateEase: boolean;
}

/** Every field that exists only to move something (R9.1). */
export const MOTION_FIELDS = [
  "flickerLean",
  "flickerHeight",
  "flickerGlow",
  "animateDrips",
  "animateSmoke",
  "animateEase",
] as const;

export type MotionField = (typeof MOTION_FIELDS)[number];

/** The documented inclusive range of every numeric field (R2.4, checked by P6). */
export const RANGES = {
  waxHeight: [0, 1],
  drips: [0, 3],
  flameHeight: [0, 1],
  flameBlue: [0, 1],
  flameRagged: [0, 1],
  flameGlow: [0, 1],
  smoke: [0, 1],
  stub: [0, 1],
  lightRadius: [0, 1],
  dawn: [0, 1],
  flickerLean: [-12, 12],
  flickerHeight: [-0.6, 0.2],
  flickerGlow: [-0.6, 0.25],
} as const satisfies Record<string, readonly [number, number]>;
