import { isBreak, timeLeftMs, waxFraction } from "../engine";
import type { State } from "../engine";
import {
  CANDLE_H,
  DEFAULT_SEED,
  DRIP_MARKS,
  FLAME_LOOK,
  GUTTER_MS,
  LIGHT_MAX,
  LIGHT_MIN,
  STUB_H,
} from "./constants";
import { NO_FLICKER, flicker } from "./flicker";
import type { FlameMode, SceneModel, SceneOptions } from "./types";

/** The flame mode is a pure function of the phase and the time left (R5.1 to R5.4). */
function flameModeOf(phase: State["phase"], timeLeft: number): FlameMode {
  switch (phase) {
    case "idle":
      return "unlit";
    case "paused":
      return "paused"; // wins over guttering (R5.3)
    case "burned-out":
    case "snuffed":
      return "smoke";
    case "lit":
      return timeLeft <= GUTTER_MS ? "guttering" : "steady"; // time left 0 while still lit: guttering (R5.4)
  }
}

/** One drip per quarter mark passed: 0.75, 0.5 and 0.25 of the wax left (R4.1). */
function dripsOf(frac: number): 0 | 1 | 2 | 3 {
  const passed = DRIP_MARKS.filter((mark) => frac <= mark).length;
  return passed === 3 ? 3 : passed === 2 ? 2 : passed === 1 ? 1 : 0;
}

/**
 * Turns the engine state into plain numbers and flags (design section 3). Pure, total and DOM-free.
 * Reads only `phase` and the selectors `timeLeftMs`, `waxFraction` and `isBreak` (R1.1, R1.2).
 */
export function sceneModel(state: State, now: number, options: SceneOptions = {}): SceneModel {
  const phase = state.phase;
  const running = phase === "lit" || phase === "paused";
  const ended = phase === "burned-out" || phase === "snuffed";
  const timeLeft = timeLeftMs(state, now);
  const frac = waxFraction(state, now);

  const flameMode = flameModeOf(phase, timeLeft);
  const look = FLAME_LOOK[flameMode];

  const reducedMotion = options.reducedMotion === true;
  const seed =
    typeof options.seed === "number" && Number.isFinite(options.seed) ? Math.trunc(options.seed) | 0 : DEFAULT_SEED;
  const motion = reducedMotion ? NO_FLICKER : flicker(seed, now, flameMode);

  return {
    phase,
    waxHeight: phase === "idle" ? 1 : running ? frac : 0,
    drips: running ? dripsOf(frac) : 0,
    flameMode,
    flameHeight: look.flameHeight,
    flameBlue: look.flameBlue,
    flameRagged: look.flameRagged,
    flameGlow: look.flameGlow,
    smoke: look.smoke,
    stub: ended ? 1 : 0,
    lightRadius: phase === "idle" ? LIGHT_MIN : running ? LIGHT_MIN + (LIGHT_MAX - LIGHT_MIN) * frac : 0,
    dawn: phase === "burned-out" ? 1 : 0,
    cooling: isBreak(state, now),
    flickerLean: motion.lean,
    flickerHeight: motion.height,
    flickerGlow: motion.glow,
    animateDrips: !reducedMotion,
    animateSmoke: !reducedMotion && flameMode === "smoke",
    animateEase: !reducedMotion,
  };
}

/**
 * The drawn height of the candle in room units (R3.7): exactly `CANDLE_H * waxHeight` while it burns,
 * and the fixed stub after the end.
 */
export function candleHeightUnits(model: SceneModel): number {
  return model.stub === 1 ? STUB_H : CANDLE_H * model.waxHeight;
}
