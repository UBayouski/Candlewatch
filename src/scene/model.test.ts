import { describe, expect, it } from "vitest";
import { BREAK_MS, INITIAL_STATE, MS_PER_MINUTE, PAUSE_LIMIT_MS, step } from "../engine";
import type { State } from "../engine";
import { CANDLE_H, STUB_H } from "./constants";
import { MOTION_FIELDS, RANGES } from "./types";
import type { SceneModel } from "./types";
import { candleHeightUnits, sceneModel } from "./model";

const T0 = 1_800_000_000_000;
const MIN = MS_PER_MINUTE;

const lit = (length = 25): State => step(INITIAL_STATE, { type: "light", length }, T0);
const paused = (at = 10 * MIN): State => step(lit(), { type: "pause" }, T0 + at);
const burnedOut = (): State => step(lit(), { type: "tick" }, T0 + 25 * MIN);
const snuffed = (): State => step(lit(), { type: "snuff" }, T0 + 7 * MIN);

/** `now` that leaves exactly `leftMs` of a 25-minute candle. */
const withLeft = (leftMs: number): number => T0 + 25 * MIN - leftMs;

describe("flame mode (R5)", () => {
  it("is steady with more than a minute left, guttering at a minute or less", () => {
    expect(sceneModel(lit(), withLeft(60_001)).flameMode).toBe("steady");
    expect(sceneModel(lit(), withLeft(60_000)).flameMode).toBe("guttering");
    expect(sceneModel(lit(), withLeft(59_999)).flameMode).toBe("guttering");
  });

  it("is guttering, not smoke, when the time is up but the engine has not settled yet", () => {
    const m = sceneModel(lit(), withLeft(0));
    expect(m.flameMode).toBe("guttering");
    expect(m.stub).toBe(0);
    expect(m.smoke).toBe(0);
  });

  it("is paused while paused, and paused wins over guttering in the last minute", () => {
    expect(sceneModel(paused(), T0 + 11 * MIN).flameMode).toBe("paused");
    const lastMinute = step(lit(), { type: "pause" }, T0 + 24.5 * MIN);
    expect(sceneModel(lastMinute, T0 + 24.6 * MIN).flameMode).toBe("paused");
  });

  it("is unlit in idle and smoke after the end", () => {
    expect(sceneModel(INITIAL_STATE, T0).flameMode).toBe("unlit");
    expect(sceneModel(burnedOut(), T0 + 26 * MIN).flameMode).toBe("smoke");
    expect(sceneModel(snuffed(), T0 + 8 * MIN).flameMode).toBe("smoke");
  });

  it("gives the fixed look of each mode", () => {
    expect(sceneModel(lit(), T0)).toMatchObject({ flameHeight: 1, flameBlue: 0, flameRagged: 0, flameGlow: 1, smoke: 0 });
    expect(sceneModel(lit(), withLeft(30_000))).toMatchObject({ flameHeight: 0.6, flameBlue: 0, flameRagged: 1, flameGlow: 0.55 });
    expect(sceneModel(paused(), T0 + 11 * MIN)).toMatchObject({ flameHeight: 0.35, flameBlue: 1, flameRagged: 0, flameGlow: 0.35 });
    expect(sceneModel(INITIAL_STATE, T0)).toMatchObject({ flameHeight: 0, smoke: 0 });
    expect(sceneModel(snuffed(), T0 + 8 * MIN)).toMatchObject({ flameHeight: 0, smoke: 1 });
  });
});

describe("drips (R4)", () => {
  /** A 100-minute-equivalent: 20 minutes gives easy fractions of a 25-minute candle. */
  const dripsAtWax = (wax: number): number => sceneModel(lit(), T0 + 25 * MIN * (1 - wax)).drips;

  it("counts the quarter marks passed: 1 at 0.75, 2 at 0.5, 3 at 0.25", () => {
    expect(dripsAtWax(1)).toBe(0);
    expect(dripsAtWax(0.76)).toBe(0);
    expect(dripsAtWax(0.75)).toBe(1);
    expect(dripsAtWax(0.5)).toBe(2);
    expect(dripsAtWax(0.26)).toBe(2);
    expect(dripsAtWax(0.25)).toBe(3);
    expect(dripsAtWax(0.02)).toBe(3);
  });

  it("is 0 at wax 0 only through the ended phases, and there is no fourth drip", () => {
    expect(sceneModel(lit(), withLeft(0)).drips).toBe(3);
    expect(sceneModel(burnedOut(), T0 + 26 * MIN).drips).toBe(0);
    expect(sceneModel(snuffed(), T0 + 8 * MIN).drips).toBe(0);
  });

  it("is 0 in idle, and does not change while paused", () => {
    expect(sceneModel(INITIAL_STATE, T0).drips).toBe(0);
    const p = paused(13 * MIN); // 12 of 25 minutes left: 0.48 -> 2 drips
    expect(sceneModel(p, T0 + 14 * MIN).drips).toBe(2);
    expect(sceneModel(p, T0 + 20 * MIN).drips).toBe(2);
  });
});

describe("idle, burned-out and snuffed values", () => {
  it("idle: a whole candle, no flame, a small light, no drips, no stub", () => {
    expect(sceneModel(INITIAL_STATE, T0)).toMatchObject({
      phase: "idle",
      waxHeight: 1,
      drips: 0,
      flameMode: "unlit",
      lightRadius: 0.2,
      dawn: 0,
      stub: 0,
      cooling: false,
    });
  });

  it("burned-out: wax 0, dawn 1, no light, smoke, the stub", () => {
    expect(sceneModel(burnedOut(), T0 + 26 * MIN)).toMatchObject({
      phase: "burned-out",
      waxHeight: 0,
      lightRadius: 0,
      dawn: 1,
      smoke: 1,
      stub: 1,
    });
  });

  it("snuffed: wax 0, no dawn, no light, smoke, the stub", () => {
    expect(sceneModel(snuffed(), T0 + 8 * MIN)).toMatchObject({
      phase: "snuffed",
      waxHeight: 0,
      lightRadius: 0,
      dawn: 0,
      smoke: 1,
      stub: 1,
    });
  });

  it("lit and paused follow the wax: wax height is the engine's fraction, light radius is linear in it", () => {
    const half = sceneModel(lit(50), T0 + 25 * MIN);
    expect(half.waxHeight).toBe(0.5);
    expect(half.lightRadius).toBeCloseTo(0.6, 12);
    expect(sceneModel(lit(), T0).waxHeight).toBe(1);
    expect(sceneModel(lit(), T0).lightRadius).toBe(1);
    expect(sceneModel(lit(), withLeft(30_000)).lightRadius).toBeCloseTo(0.2 + 0.8 * (30_000 / (25 * MIN)), 12);
    const p = sceneModel(paused(10 * MIN), T0 + 11 * MIN);
    expect(p.waxHeight).toBeCloseTo(0.6, 12);
    expect(p.lightRadius).toBeCloseTo(0.68, 12);
  });
});

describe("the stub (R3.7)", () => {
  it("is 0 in idle, lit and paused at every wax height, including 0.02 and a lit state with no time left", () => {
    expect(sceneModel(INITIAL_STATE, T0).stub).toBe(0);
    for (let left = 25 * MIN; left >= 0; left -= 15_000) expect(sceneModel(lit(), withLeft(left)).stub).toBe(0);
    expect(sceneModel(lit(), withLeft(30_000)).stub).toBe(0); // wax 0.02
    expect(sceneModel(lit(), withLeft(0)).stub).toBe(0);
    expect(sceneModel(paused(), T0 + 11 * MIN).stub).toBe(0);
  });

  it("is 1 in burned-out and snuffed", () => {
    expect(sceneModel(burnedOut(), T0 + 26 * MIN).stub).toBe(1);
    expect(sceneModel(snuffed(), T0 + 8 * MIN).stub).toBe(1);
  });
});

describe("candle height (R3.7)", () => {
  it("is exactly proportional to the wax height: the ratio is the constant 420", () => {
    expect(CANDLE_H).toBe(420);
    for (let left = 25 * MIN; left > 0; left -= 7_777) {
      const m = sceneModel(lit(), withLeft(left));
      expect(m.stub).toBe(0);
      expect(m.waxHeight).toBeGreaterThan(0);
      expect(candleHeightUnits(m) / m.waxHeight).toBeCloseTo(CANDLE_H, 9);
    }
    expect(candleHeightUnits(sceneModel(INITIAL_STATE, T0))).toBe(420);
    expect(candleHeightUnits(sceneModel(lit(), T0))).toBe(420);
  });

  it("is the fixed stub of 28 units after the end, and nothing is added while running", () => {
    expect(candleHeightUnits(sceneModel(burnedOut(), T0 + 26 * MIN))).toBe(STUB_H);
    expect(candleHeightUnits(sceneModel(snuffed(), T0 + 8 * MIN))).toBe(28);
    expect(candleHeightUnits(sceneModel(lit(), withLeft(0)))).toBe(0);
  });
});

describe("cooling (R8.5)", () => {
  const end = T0 + 25 * MIN;

  it("is true at the end instant and 299 999 ms after, false at breakEndsAt and later", () => {
    expect(sceneModel(burnedOut(), end).cooling).toBe(true);
    expect(sceneModel(burnedOut(), end + BREAK_MS - 1).cooling).toBe(true);
    expect(sceneModel(burnedOut(), end + BREAK_MS).cooling).toBe(false);
    expect(sceneModel(burnedOut(), end + BREAK_MS + 1).cooling).toBe(false);
  });

  it("changes nothing else, and is false outside burned-out", () => {
    const inBreak = sceneModel(burnedOut(), end + 1000);
    const after = sceneModel(burnedOut(), end + BREAK_MS + 1000);
    const { cooling: a, ...restIn } = inBreak;
    const { cooling: b, ...restAfter } = after;
    expect([a, b]).toEqual([true, false]);
    expect(restIn).toEqual(restAfter);
    expect(sceneModel(lit(), T0).cooling).toBe(false);
    expect(sceneModel(snuffed(), T0 + 8 * MIN).cooling).toBe(false);
  });
});

describe("reduced motion (R9)", () => {
  const states: [string, State, number][] = [
    ["idle", INITIAL_STATE, T0],
    ["steady", lit(), T0 + 5 * MIN],
    ["guttering", lit(), withLeft(30_000)],
    ["paused", paused(), T0 + 11 * MIN],
    ["burned-out", burnedOut(), T0 + 26 * MIN],
    ["snuffed", snuffed(), T0 + 8 * MIN],
  ];

  it("zeroes the motion values and changes nothing else", () => {
    for (const [name, state, now] of states) {
      const normal = sceneModel(state, now);
      const still = sceneModel(state, now, { reducedMotion: true });
      for (const field of MOTION_FIELDS) {
        expect(still[field], `${name}.${field}`).toBe(typeof still[field] === "boolean" ? false : 0);
      }
      const strip = (m: SceneModel) => Object.fromEntries(Object.entries(m).filter(([k]) => !(MOTION_FIELDS as readonly string[]).includes(k)));
      expect(strip(still), name).toEqual(strip(normal));
    }
  });

  it("the normal model animates, and only the wisp sways in smoke", () => {
    const m = sceneModel(lit(), T0 + 5 * MIN);
    expect(m.animateDrips).toBe(true);
    expect(m.animateEase).toBe(true);
    expect(m.animateSmoke).toBe(false);
    expect(sceneModel(burnedOut(), T0 + 26 * MIN).animateSmoke).toBe(true);
    expect(sceneModel(burnedOut(), T0 + 26 * MIN, { reducedMotion: true }).animateSmoke).toBe(false);
  });

  it("the flicker is live while a flame burns and zero when there is none", () => {
    const m = sceneModel(lit(), T0 + 5 * MIN);
    expect(Math.abs(m.flickerLean) + Math.abs(m.flickerHeight) + Math.abs(m.flickerGlow)).toBeGreaterThan(0);
    const out = sceneModel(snuffed(), T0 + 8 * MIN);
    expect([out.flickerLean, out.flickerHeight, out.flickerGlow]).toEqual([0, 0, 0]);
  });
});

describe("options and odd input", () => {
  it("the seed changes the flicker only, and a non-finite seed falls back to the default", () => {
    const a = sceneModel(lit(), T0 + 5 * MIN, { seed: 1 });
    const b = sceneModel(lit(), T0 + 5 * MIN, { seed: 2 });
    expect(a.flickerLean).not.toBe(b.flickerLean);
    expect({ ...a, flickerLean: 0, flickerHeight: 0, flickerGlow: 0 }).toEqual({ ...b, flickerLean: 0, flickerHeight: 0, flickerGlow: 0 });
    expect(sceneModel(lit(), T0 + 5 * MIN, { seed: NaN })).toEqual(sceneModel(lit(), T0 + 5 * MIN));
    expect(sceneModel(lit(), T0 + 5 * MIN, { seed: Infinity })).toEqual(sceneModel(lit(), T0 + 5 * MIN));
  });

  it("gives a valid model for a non-finite now (the selectors return 0 and false)", () => {
    for (const now of [NaN, Infinity, -Infinity]) {
      const m = sceneModel(lit(), now);
      expect(m.waxHeight).toBe(0);
      expect(m.cooling).toBe(false);
      for (const [field, [lo, hi]] of Object.entries(RANGES)) {
        const v = m[field as keyof SceneModel] as number;
        expect(Number.isFinite(v), `${field} at ${now}`).toBe(true);
        expect(v).toBeGreaterThanOrEqual(lo);
        expect(v).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("does not mutate its input, and is a pure function of its arguments", () => {
    const state = Object.freeze(lit());
    expect(sceneModel(state, T0 + 5 * MIN)).toEqual(sceneModel(state, T0 + 5 * MIN));
    expect(() => sceneModel(state, T0)).not.toThrow();
  });

  it("the pause limit does not matter to the scene until the engine settles", () => {
    const p = paused(10 * MIN);
    expect(sceneModel(p, T0 + 10 * MIN + PAUSE_LIMIT_MS + 5000).flameMode).toBe("paused");
  });
});
