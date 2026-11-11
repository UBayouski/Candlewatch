import { describe, expect, it } from "vitest";
import { DEFAULT_SEED, DIP_WINDOW_MS, FLICKER_AMPLITUDE } from "./constants";
import { NO_FLICKER, flicker, hash32 } from "./flicker";
import type { FlameMode } from "./types";

const SEED = 20261031;

/** [now, lean, height, glow]: pinned values, to catch an accidental change of the hash or the steps. */
const REFERENCE: Readonly<Record<"steady" | "paused" | "guttering", readonly (readonly [number, number, number, number])[]>> = {
  steady: [
    [0, -2.154107, 0.052395, -0.032922],
    [37, -1.390666, 0.037032, -0.025774],
    [500, 0.415071, 0.02314, -0.032066],
    [1234, -0.553754, -0.024339, -0.003607],
    [5000, 1.637426, -0.002093, 0.018357],
    [123456, 2.528962, 0.030608, -0.02253],
    [1700000000123, 2.144473, 0.006092, -0.017604],
    [1788000030500, 2.616504, 0.040321, -0.056473],
  ],
  paused: [
    [0, -0.718036, 0.026197, -0.016461],
    [37, -0.463555, 0.018516, -0.012887],
    [500, 0.138357, 0.01157, -0.016033],
    [1234, -0.184585, -0.01217, -0.001804],
    [5000, 0.545809, -0.001046, 0.009179],
    [123456, 0.842987, 0.015304, -0.011265],
    [1700000000123, 0.714824, 0.003046, -0.008802],
    [1788000030500, 0.872168, 0.020161, -0.028237],
  ],
  guttering: [
    [0, -5.026249, 0.104789, -0.061729],
    [37, -3.244887, 0.074064, -0.048326],
    [500, 0.9685, 0.04628, -0.060125],
    [1234, -1.292094, -0.048678, -0.006763],
    [5000, 3.82066, -0.004185, 0.03442],
    [123456, 5.900911, 0.061216, -0.042244],
    [1700000000123, 5.003771, -0.18213, -0.20789],
    [1788000030500, 6.105176, -0.209486, -0.367002],
  ],
};

describe("flicker: reference table for seed 20261031", () => {
  for (const mode of ["steady", "paused", "guttering"] as const) {
    it(`${mode} matches the pinned values at 8 instants`, () => {
      for (const [now, lean, height, glow] of REFERENCE[mode]) {
        const f = flicker(SEED, now, mode);
        expect(f.lean, `${mode} lean at ${now}`).toBeCloseTo(lean, 5);
        expect(f.height, `${mode} height at ${now}`).toBeCloseTo(height, 5);
        expect(f.glow, `${mode} glow at ${now}`).toBeCloseTo(glow, 5);
      }
    });
  }

  it("uses the default seed constant", () => {
    expect(DEFAULT_SEED).toBe(SEED);
  });

  it("the hash is a fixed function (pinned)", () => {
    expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3));
    expect(hash32(1, 2, 3)).not.toBe(hash32(1, 2, 4));
    expect(hash32(SEED, 0, 0)).toBeGreaterThanOrEqual(0);
    expect(hash32(SEED, 0, 0)).toBeLessThan(2 ** 32);
  });
});

describe("flicker: zero modes", () => {
  it("is exactly 0 for unlit and smoke, at any instant and seed", () => {
    for (const mode of ["unlit", "smoke"] as FlameMode[]) {
      for (const now of [0, 1, 999, 1_700_000_000_000, -5000, NaN, Infinity]) {
        for (const seed of [0, SEED, -7]) {
          const f = flicker(seed, now, mode);
          expect(Object.is(f.lean, 0)).toBe(true);
          expect(Object.is(f.height, 0)).toBe(true);
          expect(Object.is(f.glow, 0)).toBe(true);
        }
      }
    }
    expect(NO_FLICKER).toEqual({ lean: 0, height: 0, glow: 0 });
  });
});

describe("flicker: amplitudes and shape", () => {
  const sweep = (mode: FlameMode, seed = SEED) => {
    let lean = 0;
    let height = 0;
    let glow = 0;
    for (let t = 0; t < 120_000; t += 37) {
      const f = flicker(seed, t, mode);
      lean = Math.max(lean, Math.abs(f.lean));
      height = Math.max(height, Math.abs(f.height));
      glow = Math.max(glow, Math.abs(f.glow));
    }
    return { lean, height, glow };
  };

  it("is gentle for steady, very small for paused, larger for guttering", () => {
    const steady = sweep("steady");
    const paused = sweep("paused");
    const guttering = sweep("guttering");
    expect(paused.lean).toBeLessThan(steady.lean);
    expect(steady.lean).toBeLessThan(guttering.lean);
    expect(paused.height).toBeLessThan(steady.height);
    expect(steady.height).toBeLessThan(guttering.height);
  });

  it("stays inside the amplitude of its mode (lean) and the documented ranges", () => {
    for (const mode of ["steady", "paused", "guttering"] as const) {
      const m = sweep(mode);
      expect(m.lean).toBeLessThanOrEqual(FLICKER_AMPLITUDE[mode].lean);
    }
    for (let t = 0; t < 200_000; t += 53) {
      const f = flicker(SEED, t, "guttering");
      expect(f.lean).toBeGreaterThanOrEqual(-12);
      expect(f.lean).toBeLessThanOrEqual(12);
      expect(f.height).toBeGreaterThanOrEqual(-0.6);
      expect(f.height).toBeLessThanOrEqual(0.2);
      expect(f.glow).toBeGreaterThanOrEqual(-0.6);
      expect(f.glow).toBeLessThanOrEqual(0.25);
    }
  });

  it("only guttering has deep dips (the sputter), and the flame nearly dies in them", () => {
    let deepest = 0;
    for (let t = 0; t < 60_000; t += 10) deepest = Math.min(deepest, flicker(SEED, t, "guttering").height);
    expect(deepest).toBeLessThan(-0.3); // jitter alone never goes below -0.12
    let steadyDeepest = 0;
    for (let t = 0; t < 60_000; t += 10) steadyDeepest = Math.min(steadyDeepest, flicker(SEED, t, "steady").height);
    expect(steadyDeepest).toBeGreaterThanOrEqual(-0.06);
  });

  it("a dip stays inside its 1500 ms window and is gone at the window's edges", () => {
    // Without the dip the height is bounded by the jitter alone (0.12). A larger drop is a dip.
    for (let w = 0; w < 400; w++) {
      const start = w * DIP_WINDOW_MS;
      expect(flicker(SEED, start, "guttering").height).toBeGreaterThan(-0.13);
      expect(flicker(SEED, start + DIP_WINDOW_MS - 1, "guttering").height).toBeGreaterThan(-0.13);
    }
  });

  it("is deterministic and depends on the seed", () => {
    expect(flicker(SEED, 12345, "guttering")).toEqual(flicker(SEED, 12345, "guttering"));
    let different = 0;
    for (let t = 0; t < 2000; t += 10) {
      if (flicker(1, t, "steady").lean !== flicker(2, t, "steady").lean) different++;
    }
    expect(different).toBeGreaterThan(150);
  });

  it("is smooth: instants a few ms apart give nearby values", () => {
    for (let t = 1000; t < 5000; t += 17) {
      const a = flicker(SEED, t, "steady");
      const b = flicker(SEED, t + 3, "steady");
      expect(Math.abs(b.lean - a.lean)).toBeLessThan(0.3);
      expect(Math.abs(b.height - a.height)).toBeLessThan(0.02);
    }
  });
});

describe("flicker: odd inputs", () => {
  it("gives finite values for negative, huge and non-finite now", () => {
    for (const mode of ["steady", "paused", "guttering"] as const) {
      for (const now of [-1, -123_456_789, 1e15, NaN, Infinity, -Infinity]) {
        const f = flicker(SEED, now, mode);
        expect(Number.isFinite(f.lean)).toBe(true);
        expect(Number.isFinite(f.height)).toBe(true);
        expect(Number.isFinite(f.glow)).toBe(true);
      }
    }
  });

  it("treats a non-finite now as 0", () => {
    expect(flicker(SEED, NaN, "steady")).toEqual(flicker(SEED, 0, "steady"));
    expect(flicker(SEED, Infinity, "guttering")).toEqual(flicker(SEED, 0, "guttering"));
  });
});
