import {
  DIP_DEPTH_MIN,
  DIP_DEPTH_SPAN,
  DIP_GLOW_FACTOR,
  DIP_PROBABILITY,
  DIP_WIDTH_MS,
  DIP_WINDOW_MS,
  FLICKER_AMPLITUDE,
  FLICKER_CHANNEL,
  FLICKER_STEP_MS,
} from "./constants";
import type { FlameMode } from "./types";

export interface Flicker {
  /** Sideways lean in degrees. */
  readonly lean: number;
  /** Added to 1 to scale the flame's height. */
  readonly height: number;
  /** Added to the flame's glow. */
  readonly glow: number;
}

/** Exactly zero, used for `unlit`, `smoke` and reduced motion. */
export const NO_FLICKER: Flicker = { lean: 0, height: 0, glow: 0 };

const TWO32 = 4294967296;

/** A 32-bit integer hash ("lowbias32" style mixer): only `Math.imul` and shifts (design 4.1). */
export function hash32(a: number, b: number, c: number): number {
  let h = (a ^ Math.imul(b, 0x9e3779b1) ^ Math.imul(c, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

const unit = (h: number): number => h / TWO32; // [0, 1)
const signed = (h: number): number => unit(h) * 2 - 1; // [-1, 1)

/** Reduces a lattice index to 32 bits; works for negative indices. */
const idx = (i: number): number => ((i % TWO32) + TWO32) % TWO32;

const clamp = (x: number, lo: number, hi: number): number => Math.min(Math.max(x, lo), hi);

/** Smooth 1-D value noise in [-1, 1] on a fixed lattice step (design 4.2). */
function noise(seed: number, now: number, channel: number, stepMs: number): number {
  const t = now / stepMs;
  const i = Math.floor(t);
  const f = t - i;
  const s = f * f * (3 - 2 * f);
  const a = signed(hash32(seed, idx(i), channel));
  const b = signed(hash32(seed, idx(i + 1), channel));
  return a + (b - a) * s;
}

/**
 * The sputter (design 4.4): in about one 1500 ms window in three, a smooth short dip that
 * nearly kills the flame and lets it recover. Returns the dip strength `depth * pulse`.
 */
function dip(seed: number, now: number): number {
  const w = Math.floor(now / DIP_WINDOW_MS);
  const key = idx(w);
  if (unit(hash32(seed, key, 3)) >= DIP_PROBABILITY) return 0;
  const centre = w * DIP_WINDOW_MS + DIP_WIDTH_MS / 2 + unit(hash32(seed, key, 4)) * (DIP_WINDOW_MS - DIP_WIDTH_MS);
  const depth = DIP_DEPTH_MIN + DIP_DEPTH_SPAN * unit(hash32(seed, key, 5));
  const pulse = 0.5 * (1 + Math.cos(Math.PI * clamp(Math.abs(now - centre) / (DIP_WIDTH_MS / 2), 0, 1)));
  return depth * pulse;
}

/**
 * The seeded flame flicker: a pure function of `(seed, now, mode)` (R6.2, R6.6).
 * No `Math.random`, no state, no history. A non-finite `now` is treated as 0.
 */
export function flicker(seed: number, now: number, mode: FlameMode): Flicker {
  const amplitude = FLICKER_AMPLITUDE[mode];
  if (amplitude.lean === 0 && amplitude.height === 0 && amplitude.glow === 0) return NO_FLICKER;
  const at = Number.isFinite(now) ? now : 0;
  const s = seed | 0;
  let height = amplitude.height * noise(s, at, FLICKER_CHANNEL.height, FLICKER_STEP_MS.height);
  let glow = amplitude.glow * noise(s, at, FLICKER_CHANNEL.glow, FLICKER_STEP_MS.glow);
  if (amplitude.sputter) {
    const d = dip(s, at);
    height -= d;
    glow -= DIP_GLOW_FACTOR * d;
  }
  return {
    lean: amplitude.lean * noise(s, at, FLICKER_CHANNEL.lean, FLICKER_STEP_MS.lean),
    height,
    glow,
  };
}
