import { describe, expect, it } from "vitest";
import { BREAK_MS, MS_PER_MINUTE, PAUSE_LIMIT_MS } from "./constants";
import { isBreak, pauseLeftMs, timeLeftMs, waxFraction } from "./selectors";
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
// controls-and-access R5.6: the pause allowance left, used by the interface while paused.
describe("pauseLeftMs", () => {
  const PAUSE_AT = T0 + 10 * MIN;
  const paused = (): State => step(lit(), { type: "pause" }, PAUSE_AT);

  it("is the whole allowance at the moment the pause starts (elapsed 0)", () => {
    expect(pauseLeftMs(paused(), PAUSE_AT)).toBe(PAUSE_LIMIT_MS);
  });

  it("counts down one for one: halfway through the allowance, 5 minutes are left", () => {
    expect(pauseLeftMs(paused(), PAUSE_AT + 5 * MIN)).toBe(5 * MIN);
    expect(pauseLeftMs(paused(), PAUSE_AT + 1)).toBe(PAUSE_LIMIT_MS - 1);
  });

  it("is 0 exactly when the allowance is used up (elapsed exactly PAUSE_LIMIT_MS), and the state is still paused then", () => {
    expect(pauseLeftMs(paused(), PAUSE_AT + PAUSE_LIMIT_MS)).toBe(0);
    expect(step(paused(), { type: "tick" }, PAUSE_AT + PAUSE_LIMIT_MS).phase).toBe("paused");
  });

  it("is 0 one millisecond past the limit, and a tick snuffs there (elapsed past PAUSE_LIMIT_MS)", () => {
    expect(pauseLeftMs(paused(), PAUSE_AT + PAUSE_LIMIT_MS + 1)).toBe(0);
    expect(step(paused(), { type: "tick" }, PAUSE_AT + PAUSE_LIMIT_MS + 1).phase).toBe("snuffed");
    expect(pauseLeftMs(paused(), PAUSE_AT + 3 * PAUSE_LIMIT_MS)).toBe(0);
  });

  it("counts an earlier closed pause against the allowance (4 minutes used leaves 6)", () => {
    const first = step(lit(), { type: "pause" }, T0 + 5 * MIN);
    const resumed = step(first, { type: "resume" }, T0 + 9 * MIN); // a 4 minute pause
    const again = step(resumed, { type: "pause" }, T0 + 12 * MIN);
    expect(pauseLeftMs(again, T0 + 12 * MIN)).toBe(6 * MIN);
    expect(pauseLeftMs(again, T0 + 12 * MIN + 6 * MIN)).toBe(0);
    expect(step(again, { type: "tick" }, T0 + 12 * MIN + 6 * MIN).phase).toBe("paused");
    expect(step(again, { type: "tick" }, T0 + 12 * MIN + 6 * MIN + 1).phase).toBe("snuffed");
  });

  it("never gives more than the allowance when the clock moved backwards", () => {
    expect(pauseLeftMs(paused(), PAUSE_AT - 5 * MIN)).toBe(PAUSE_LIMIT_MS);
    const first = step(lit(), { type: "pause" }, T0 + 5 * MIN);
    const again = step(step(first, { type: "resume" }, T0 + 9 * MIN), { type: "pause" }, T0 + 12 * MIN);
    expect(pauseLeftMs(again, T0)).toBe(6 * MIN);
  });

  it("is 0 in every phase but paused", () => {
    expect(pauseLeftMs(INITIAL_STATE, T0)).toBe(0);
    expect(pauseLeftMs(lit(), T0 + MIN)).toBe(0);
    expect(pauseLeftMs(step(lit(), { type: "tick" }, T0 + 25 * MIN), T0 + 26 * MIN)).toBe(0);
    expect(pauseLeftMs(step(lit(), { type: "snuff" }, T0 + MIN), T0 + 2 * MIN)).toBe(0);
  });

  it("is 0 for a non-finite now", () => {
    expect(pauseLeftMs(paused(), NaN)).toBe(0);
    expect(pauseLeftMs(paused(), Infinity)).toBe(0);
    expect(pauseLeftMs(paused(), -Infinity)).toBe(0);
  });

  it("floors a fractional now, like the engine does", () => {
    expect(pauseLeftMs(paused(), PAUSE_AT + 1000.9)).toBe(PAUSE_LIMIT_MS - 1000);
  });

  it("reads the state without changing it", () => {
    const s = paused();
    const copy = JSON.stringify(s);
    pauseLeftMs(s, PAUSE_AT + MIN);
    expect(JSON.stringify(s)).toBe(copy);
  });
});
