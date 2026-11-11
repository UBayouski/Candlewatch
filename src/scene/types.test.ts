import { describe, expect, it } from "vitest";
import {
  CANDLE_H,
  FLAME_LOOK,
  FLICKER_AMPLITUDE,
  FLOOR_Y,
  GUTTER_MS,
  LIGHT_MAX,
  LIGHT_MIN,
  STUB_H,
} from "./constants";
import { MOTION_FIELDS, RANGES } from "./types";
import type { FlameMode, SceneModel } from "./types";

/** A complete model, typed, so the field list is checked by the compiler and read at run time. */
const SAMPLE: SceneModel = {
  phase: "lit",
  waxHeight: 1,
  drips: 0,
  flameMode: "steady",
  flameHeight: 1,
  flameBlue: 0,
  flameRagged: 0,
  flameGlow: 1,
  smoke: 0,
  stub: 0,
  lightRadius: 1,
  dawn: 0,
  cooling: false,
  flickerLean: 0,
  flickerHeight: 0,
  flickerGlow: 0,
  animateDrips: false,
  animateSmoke: false,
  animateEase: false,
};

const MODES: readonly FlameMode[] = ["unlit", "steady", "paused", "guttering", "smoke"];

describe("MOTION_FIELDS", () => {
  it("names exactly the six motion fields", () => {
    expect([...MOTION_FIELDS].sort()).toEqual(
      ["animateDrips", "animateEase", "animateSmoke", "flickerGlow", "flickerHeight", "flickerLean"].sort(),
    );
  });

  it("each one is a field of the model", () => {
    for (const field of MOTION_FIELDS) expect(Object.keys(SAMPLE)).toContain(field);
  });

  it("the model has 19 fields: 13 state and 6 motion", () => {
    expect(Object.keys(SAMPLE)).toHaveLength(19);
    expect(Object.keys(SAMPLE).filter((k) => !(MOTION_FIELDS as readonly string[]).includes(k))).toHaveLength(13);
  });
});

describe("RANGES", () => {
  it("covers every numeric field of the model, and only those", () => {
    const numeric = Object.entries(SAMPLE)
      .filter(([, v]) => typeof v === "number")
      .map(([k]) => k)
      .sort();
    expect(Object.keys(RANGES).sort()).toEqual(numeric);
  });

  it("has ordered bounds, and the sample sits inside them", () => {
    for (const [field, [lo, hi]] of Object.entries(RANGES)) {
      expect(lo).toBeLessThan(hi);
      const value = SAMPLE[field as keyof SceneModel] as number;
      expect(value).toBeGreaterThanOrEqual(lo);
      expect(value).toBeLessThanOrEqual(hi);
    }
  });
});

describe("FLAME_LOOK", () => {
  it("has one look per mode, with every value inside its range", () => {
    for (const mode of MODES) {
      const look = FLAME_LOOK[mode];
      expect(look.flameHeight).toBeGreaterThanOrEqual(RANGES.flameHeight[0]);
      expect(look.flameHeight).toBeLessThanOrEqual(RANGES.flameHeight[1]);
      expect(look.flameBlue).toBeGreaterThanOrEqual(RANGES.flameBlue[0]);
      expect(look.flameBlue).toBeLessThanOrEqual(RANGES.flameBlue[1]);
      expect(look.flameGlow).toBeGreaterThanOrEqual(RANGES.flameGlow[0]);
      expect(look.flameGlow).toBeLessThanOrEqual(RANGES.flameGlow[1]);
      expect([0, 1]).toContain(look.flameRagged);
      expect([0, 1]).toContain(look.smoke);
    }
  });

  it("matches the table in the design", () => {
    expect(FLAME_LOOK.steady).toEqual({ flameHeight: 1, flameBlue: 0, flameRagged: 0, flameGlow: 1, smoke: 0 });
    expect(FLAME_LOOK.guttering).toEqual({ flameHeight: 0.6, flameBlue: 0, flameRagged: 1, flameGlow: 0.55, smoke: 0 });
    expect(FLAME_LOOK.paused).toEqual({ flameHeight: 0.35, flameBlue: 1, flameRagged: 0, flameGlow: 0.35, smoke: 0 });
    expect(FLAME_LOOK.unlit.flameHeight).toBe(0);
    expect(FLAME_LOOK.smoke.smoke).toBe(1);
  });

  it("R5.6: any two of steady, guttering and paused differ in at least two of size, colour and shape", () => {
    const flames: FlameMode[] = ["steady", "guttering", "paused"];
    for (const a of flames) {
      for (const b of flames) {
        if (a === b) continue;
        const x = FLAME_LOOK[a];
        const y = FLAME_LOOK[b];
        const differences = [
          x.flameHeight !== y.flameHeight, // size
          x.flameBlue !== y.flameBlue, // colour
          x.flameRagged !== y.flameRagged, // shape
        ].filter(Boolean).length;
        expect(differences, `${a} vs ${b}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("a flame mode differs from unlit and smoke in size and shape", () => {
    for (const flame of ["steady", "guttering", "paused"] as const) {
      expect(FLAME_LOOK[flame].flameHeight).toBeGreaterThan(0);
      expect(FLAME_LOOK.unlit.flameHeight).toBe(0);
      expect(FLAME_LOOK.smoke.flameHeight).toBe(0);
      expect(FLAME_LOOK.smoke.smoke).toBe(1);
    }
  });
});

describe("FLICKER_AMPLITUDE", () => {
  it("is zero for unlit and smoke, and gentle < larger for steady, paused, guttering (R6.5)", () => {
    for (const mode of ["unlit", "smoke"] as const) {
      expect(FLICKER_AMPLITUDE[mode]).toEqual({ lean: 0, height: 0, glow: 0, sputter: false });
    }
    expect(FLICKER_AMPLITUDE.paused.lean).toBeLessThan(FLICKER_AMPLITUDE.steady.lean);
    expect(FLICKER_AMPLITUDE.steady.lean).toBeLessThan(FLICKER_AMPLITUDE.guttering.lean);
    expect(FLICKER_AMPLITUDE.paused.height).toBeLessThan(FLICKER_AMPLITUDE.steady.height);
    expect(FLICKER_AMPLITUDE.steady.height).toBeLessThan(FLICKER_AMPLITUDE.guttering.height);
  });

  it("only guttering sputters", () => {
    for (const mode of MODES) expect(FLICKER_AMPLITUDE[mode].sputter).toBe(mode === "guttering");
  });

  it("stays inside the documented flicker ranges", () => {
    for (const mode of MODES) {
      const a = FLICKER_AMPLITUDE[mode];
      expect(a.lean).toBeLessThanOrEqual(RANGES.flickerLean[1]);
      expect(a.height + 0.45).toBeLessThanOrEqual(-RANGES.flickerHeight[0]);
      expect(a.glow + 0.405).toBeLessThanOrEqual(-RANGES.flickerGlow[0]);
    }
  });
});

describe("geometry and thresholds", () => {
  it("CANDLE_H is 420, FLOOR_Y is 900 and STUB_H is 28", () => {
    expect(CANDLE_H).toBe(420);
    expect(FLOOR_Y).toBe(900);
    expect(STUB_H).toBe(28);
  });

  it("the light radius runs from 0.2 to 1 and the last minute is 60 000 ms", () => {
    expect(LIGHT_MIN).toBe(0.2);
    expect(LIGHT_MAX).toBe(1);
    expect(GUTTER_MS).toBe(60_000);
  });
});
