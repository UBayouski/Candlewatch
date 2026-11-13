// sound-and-title R5.3 to R5.5 (design 3.6): the Wake_Delay.
import { describe, expect, it } from "vitest";
import { INITIAL_STATE, PAUSE_LIMIT_MS, step } from "../engine";
import { WAKE_MAX_MS, WAKE_MIN_MS, clampWake, nextWakeMs } from "./wake";

const T0 = 1_800_000_000_000;
const MIN = 60_000;
const lit = step(INITIAL_STATE, { type: "light", length: 25 }, T0);
const END = T0 + 25 * MIN;

describe("nextWakeMs while lit (the time left, clamped to [1, 1000])", () => {
  it.each([
    [0, 1],
    [0.4, 1],
    [1, 1],
    [999, 999],
    [1000, 1000],
    [1001, 1000],
    [5000, 1000],
  ])("with %d ms left gives %d", (left, want) => {
    expect(nextWakeMs(lit, END - left)).toBe(want);
  });

  it("a non-finite now gives 1 (the selector reads 0 left)", () => {
    for (const now of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(nextWakeMs(lit, now)).toBe(1);
  });
});

describe("nextWakeMs while paused (the pause allowance left)", () => {
  const pausedAt = T0 + 3 * MIN;
  const paused = step(lit, { type: "pause" }, pausedAt);
  it("with 10 minutes of allowance gives 1000, and with 0 left gives 1", () => {
    expect(PAUSE_LIMIT_MS).toBe(10 * MIN);
    expect(nextWakeMs(paused, pausedAt)).toBe(1000);
    expect(nextWakeMs(paused, pausedAt + PAUSE_LIMIT_MS)).toBe(1);
    expect(nextWakeMs(paused, pausedAt + PAUSE_LIMIT_MS - 300)).toBe(300);
  });
});

describe("nextWakeMs in the other phases", () => {
  it("gives null for idle, burned-out and snuffed", () => {
    expect(nextWakeMs(INITIAL_STATE, T0)).toBeNull();
    expect(nextWakeMs(step(lit, { type: "tick" }, END), END)).toBeNull();
    expect(nextWakeMs(step(lit, { type: "snuff" }, T0 + MIN), T0 + MIN)).toBeNull();
  });
});

describe("the clamp, row by row (design 3.6)", () => {
  it.each([
    [0, 1],
    [0.4, 1],
    [1, 1],
    [999, 999],
    [1000, 1000],
    [1000.5, 1000],
    [5000, 1000],
    [1500000, 1000],
    [Number.POSITIVE_INFINITY, 1000],
    [Number.NEGATIVE_INFINITY, 1],
    [-5, 1],
    [Number.NaN, 1000],
  ])("clampWake(%d) is %d", (ms, want) => {
    expect(clampWake(ms)).toBe(want);
  });

  it("has the bounds 1 and 1000", () => {
    expect([WAKE_MIN_MS, WAKE_MAX_MS]).toEqual([1, 1000]);
  });
});
