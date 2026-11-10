import { describe, expect, it } from "vitest";
import { BREAK_MS, MS_PER_MINUTE } from "./constants";
import { isBreak, timeLeftMs, waxFraction } from "./selectors";
import { step } from "./step";
import { INITIAL_STATE } from "./types";
import type { Event, State } from "./types";

const T0 = 1_800_000_000_000;
const MIN = MS_PER_MINUTE;
const LIGHT25: Event = { type: "light", length: 25 };

const lit = (): State => step(INITIAL_STATE, LIGHT25, T0);

describe("timeLeftMs and waxFraction", () => {
  it("is the full length at the start", () => {
    expect(timeLeftMs(lit(), T0)).toBe(25 * MIN);
    expect(waxFraction(lit(), T0)).toBe(1);
  });

  it("is half at the halfway point of a 50-minute candle", () => {
    const s = step(INITIAL_STATE, { type: "light", length: 50 }, T0);
    expect(timeLeftMs(s, T0 + 25 * MIN)).toBe(25 * MIN);
    expect(waxFraction(s, T0 + 25 * MIN)).toBe(0.5);
  });

  it("is zero at completion and stays zero after", () => {
    expect(timeLeftMs(lit(), T0 + 25 * MIN)).toBe(0);
    expect(waxFraction(lit(), T0 + 25 * MIN)).toBe(0);
    expect(timeLeftMs(lit(), T0 + 99 * MIN)).toBe(0);
  });

  it("is frozen while paused", () => {
    const p = step(lit(), { type: "pause" }, T0 + 10 * MIN);
    expect(timeLeftMs(p, T0 + 10 * MIN)).toBe(15 * MIN);
    expect(timeLeftMs(p, T0 + 20 * MIN)).toBe(15 * MIN);
  });

  it("does not change across a pause and resume", () => {
    const p = step(lit(), { type: "pause" }, T0 + 10 * MIN);
    const r = step(p, { type: "resume" }, T0 + 14 * MIN);
    expect(timeLeftMs(r, T0 + 14 * MIN)).toBe(15 * MIN);
    expect(timeLeftMs(r, T0 + 24 * MIN)).toBe(5 * MIN);
  });

  it("clamps when now is before the anchor", () => {
    expect(timeLeftMs(lit(), T0 - 10 * MIN)).toBe(25 * MIN);
    const p = step(lit(), { type: "pause" }, T0 + 10 * MIN);
    const r = step(p, { type: "resume" }, T0 + 14 * MIN);
    expect(timeLeftMs(r, T0)).toBe(timeLeftMs(r, T0 + 14 * MIN));
  });

  it("floors a fractional now", () => {
    expect(timeLeftMs(lit(), T0 + 1000.9)).toBe(25 * MIN - 1000);
  });

  it("is 0 when there is no running candle", () => {
    expect(timeLeftMs(INITIAL_STATE, T0)).toBe(0);
    expect(waxFraction(INITIAL_STATE, T0)).toBe(0);
    const burned = step(lit(), { type: "tick" }, T0 + 25 * MIN);
    expect(timeLeftMs(burned, T0 + 26 * MIN)).toBe(0);
    expect(waxFraction(burned, T0 + 26 * MIN)).toBe(0);
    const snuffed = step(lit(), { type: "snuff" }, T0 + MIN);
    expect(timeLeftMs(snuffed, T0 + 2 * MIN)).toBe(0);
  });

  it("is 0 for a non-finite now", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(timeLeftMs(lit(), bad)).toBe(0);
      expect(waxFraction(lit(), bad)).toBe(0);
    }
  });
});

describe("isBreak", () => {
  const burned = (): State => step(lit(), { type: "tick" }, T0 + 25 * MIN);
  const end = T0 + 25 * MIN;

  it("is true while now is before breakEndsAt", () => {
    expect(isBreak(burned(), end)).toBe(true);
    expect(isBreak(burned(), end + BREAK_MS - 1)).toBe(true);
  });

  it("is false at and after breakEndsAt", () => {
    expect(isBreak(burned(), end + BREAK_MS)).toBe(false);
    expect(isBreak(burned(), end + BREAK_MS + 1)).toBe(false);
  });

  it("is false in every other phase", () => {
    expect(isBreak(INITIAL_STATE, T0)).toBe(false);
    expect(isBreak(lit(), T0 + MIN)).toBe(false);
    expect(isBreak(step(lit(), { type: "pause" }, T0 + MIN), T0 + 2 * MIN)).toBe(false);
    expect(isBreak(step(lit(), { type: "snuff" }, T0 + MIN), T0 + 2 * MIN)).toBe(false);
  });

  it("is false for a non-finite now", () => {
    expect(isBreak(burned(), NaN)).toBe(false);
    expect(isBreak(burned(), -Infinity)).toBe(false);
  });

  it("uses the true end time after a late discovery", () => {
    const late = step(lit(), { type: "tick" }, T0 + 40 * MIN);
    expect(late.phase === "burned-out" && late.breakEndsAt).toBe(end + BREAK_MS);
    expect(isBreak(late, T0 + 40 * MIN)).toBe(false);
  });
});
