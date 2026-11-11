import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { INITIAL_STATE, MS_PER_MINUTE, step } from "../engine";
import { RANGES } from "./types";
import type { SceneModel } from "./types";
import { arbNow, arbNowNear, arbReduced, arbSeed, deepFreeze, sampleModels } from "./scene-kit";

const T0 = 1_800_000_000_000;

describe("arbNow", () => {
  const sample = fc.sample(arbNow, 1000);

  it("produces realistic, small, negative, huge and non-finite moments", () => {
    expect(sample.some((n) => Number.isNaN(n))).toBe(true);
    expect(sample.some((n) => n === Infinity)).toBe(true);
    expect(sample.some((n) => n === -Infinity)).toBe(true);
    expect(sample.some((n) => Number.isFinite(n) && n < 0)).toBe(true);
    expect(sample.some((n) => Number.isFinite(n) && n >= 1_000_000_000_000 && n <= 2_000_000_000_000)).toBe(true);
    expect(sample.some((n) => Number.isFinite(n) && Math.abs(n) > 1e15)).toBe(true);
  });

  it("is mostly finite", () => {
    expect(sample.filter(Number.isFinite).length).toBeGreaterThan(700);
  });
});

describe("arbNowNear", () => {
  it("stays within two minutes before and four hours after the base", () => {
    for (const n of fc.sample(arbNowNear(T0), 300)) {
      expect(n).toBeGreaterThanOrEqual(T0 - 120_000);
      expect(n).toBeLessThanOrEqual(T0 + 4 * 3_600_000);
    }
  });
});

describe("arbSeed and arbReduced", () => {
  it("arbSeed gives any double, including non-finite ones", () => {
    const seeds = fc.sample(arbSeed, 2000);
    expect(seeds.every((s) => typeof s === "number")).toBe(true);
    expect(seeds.some((s) => !Number.isFinite(s))).toBe(true);
    expect(seeds.some((s) => Number.isFinite(s) && !Number.isInteger(s))).toBe(true);
  });

  it("arbReduced gives both booleans", () => {
    const flags = fc.sample(arbReduced, 100);
    expect(flags).toContain(true);
    expect(flags).toContain(false);
  });
});

describe("deepFreeze", () => {
  it("freezes nested objects and arrays, and returns the same value", () => {
    const value = { a: { b: [1, { c: 2 }] }, d: 3 };
    expect(deepFreeze(value)).toBe(value);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.a)).toBe(true);
    expect(Object.isFrozen(value.a.b)).toBe(true);
    expect(Object.isFrozen(value.a.b[1])).toBe(true);
    expect(() => {
      "use strict";
      (value as { d: number }).d = 4;
    }).toThrow();
  });

  it("freezes an engine state, so the code under test cannot write to it", () => {
    const state = deepFreeze(step(INITIAL_STATE, { type: "light", length: 25 }, T0));
    expect(Object.isFrozen(state)).toBe(true);
    if (state.phase === "lit") expect(Object.isFrozen(state.session)).toBe(true);
  });

  it("leaves primitives and null alone", () => {
    expect(deepFreeze(3)).toBe(3);
    expect(deepFreeze(null)).toBeNull();
    expect(deepFreeze("x")).toBe("x");
  });
});

describe("sampleModels", () => {
  const lit = step(INITIAL_STATE, { type: "light", length: 25 }, T0);
  const trace = [
    { after: INITIAL_STATE, now: T0 - 1000 },
    { after: lit, now: T0 },
    { after: step(lit, { type: "pause" }, T0 + MS_PER_MINUTE), now: T0 + MS_PER_MINUTE },
  ];

  it("evaluates every state at its own time and at each finite offset", () => {
    const samples = sampleModels(trace, [0, 1000, NaN, Infinity, 60_000]);
    expect(samples).toHaveLength(trace.length * 4); // own time + offsets 0, 1000, 60000
    expect(samples[0]?.now).toBe(T0 - 1000);
    expect(samples[1]?.now).toBe(T0 - 1000); // offset 0
    expect(samples[2]?.now).toBe(T0);
  });

  it("returns valid models, and passes the options through", () => {
    for (const s of sampleModels(trace, [5000, 90_000])) {
      for (const [field, [lo, hi]] of Object.entries(RANGES)) {
        const v = s.model[field as keyof SceneModel] as number;
        expect(v).toBeGreaterThanOrEqual(lo);
        expect(v).toBeLessThanOrEqual(hi);
      }
    }
    for (const s of sampleModels(trace, [5000], { reducedMotion: true })) {
      expect(s.model.animateEase).toBe(false);
      expect(s.model.flickerLean).toBe(0);
    }
  });

  it("is empty for an empty trace", () => {
    expect(sampleModels([], [1, 2, 3])).toEqual([]);
  });
});
