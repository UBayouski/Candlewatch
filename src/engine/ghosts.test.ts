import { describe, expect, it } from "vitest";
import { GHOST_FULL_SIZE_MS, GHOST_MIN_SIZE, MS_PER_MINUTE } from "./constants";
import { distractionCount, ghostSize, ghostSpansMs } from "./ghosts";
import { step } from "./step";
import { INITIAL_STATE } from "./types";
import type { Event, State } from "./types";

const T0 = 1_800_000_000_000;
const MIN = MS_PER_MINUTE;
const LIGHT: Event = { type: "light", length: 25 };

describe("ghostSize", () => {
  it("has the floor at span 0", () => {
    expect(ghostSize(0)).toBe(0.25);
    expect(GHOST_MIN_SIZE).toBe(0.25);
  });

  it("is full size from 5 minutes on, and stays there", () => {
    expect(GHOST_FULL_SIZE_MS).toBe(5 * MIN);
    expect(ghostSize(5 * MIN)).toBe(1);
    expect(ghostSize(5 * MIN + 1)).toBe(1);
    expect(ghostSize(60 * MIN)).toBe(1);
    expect(ghostSize(Infinity)).toBe(1);
  });

  it("follows the square-root curve between", () => {
    expect(ghostSize(75_000)).toBe(0.625); // a quarter of 5 minutes: sqrt = 0.5
    expect(ghostSize(1)).toBeGreaterThan(0.25);
    expect(ghostSize(150_000)).toBeCloseTo(0.25 + 0.75 * Math.sqrt(0.5), 12);
  });

  it("maps negative and NaN spans to the floor", () => {
    expect(ghostSize(-1)).toBe(0.25);
    expect(ghostSize(-Infinity)).toBe(0.25);
    expect(ghostSize(NaN)).toBe(0.25);
  });

  it("never decreases as the span grows (sample)", () => {
    let prev = ghostSize(0);
    for (let span = 0; span <= 6 * MIN; span += 1000) {
      const size = ghostSize(span);
      expect(size).toBeGreaterThanOrEqual(prev);
      expect(size).toBeGreaterThanOrEqual(0.25);
      expect(size).toBeLessThanOrEqual(1);
      prev = size;
    }
  });
});

describe("distractionCount and ghostSpansMs", () => {
  /** Lit at T0, a 3-minute and a 1-minute distraction. */
  const withTwo = (): State => {
    let s = step(INITIAL_STATE, LIGHT, T0);
    s = step(s, { type: "hide" }, T0 + 2 * MIN);
    s = step(s, { type: "show" }, T0 + 5 * MIN);
    s = step(s, { type: "hide" }, T0 + 8 * MIN);
    return step(s, { type: "show" }, T0 + 9 * MIN);
  };

  it("is 0 and empty for idle", () => {
    expect(distractionCount(INITIAL_STATE)).toBe(0);
    expect(ghostSpansMs(INITIAL_STATE)).toEqual([]);
  });

  it("returns the completed spans of a lit session, oldest first", () => {
    const s = withTwo();
    expect(distractionCount(s)).toBe(2);
    expect(ghostSpansMs(s)).toEqual([3 * MIN, 1 * MIN]);
  });

  it("does not count an open hide: no ghost until it is closed", () => {
    const s = step(withTwo(), { type: "hide" }, T0 + 12 * MIN);
    expect(distractionCount(s)).toBe(2);
    expect(ghostSpansMs(s)).toEqual([3 * MIN, 1 * MIN]);
  });

  it("keeps the spans through burned-out and snuffed until the next light", () => {
    const burned = step(withTwo(), { type: "tick" }, T0 + 30 * MIN);
    expect(burned.phase).toBe("burned-out");
    expect(ghostSpansMs(burned)).toEqual([3 * MIN, 1 * MIN]);
    const snuffed = step(withTwo(), { type: "snuff" }, T0 + 10 * MIN);
    expect(distractionCount(snuffed)).toBe(2);
    const next = step(burned, LIGHT, T0 + 31 * MIN);
    expect(ghostSpansMs(next)).toEqual([]);
    expect(distractionCount(next)).toBe(0);
  });

  it("counts a distraction still open when the candle burns out, up to the true end", () => {
    let s = step(INITIAL_STATE, LIGHT, T0);
    s = step(s, { type: "hide" }, T0 + 20 * MIN);
    const out = step(s, { type: "show" }, T0 + 40 * MIN);
    expect(ghostSpansMs(out)).toEqual([5 * MIN]);
  });

  it("agrees with the stored count and total", () => {
    const s = withTwo();
    if (s.phase === "idle") throw new Error("setup");
    expect(ghostSpansMs(s).length).toBe(s.session.distractions);
    expect(ghostSpansMs(s).reduce((a, b) => a + b, 0)).toBe(s.session.timeAwayMs);
  });
});
