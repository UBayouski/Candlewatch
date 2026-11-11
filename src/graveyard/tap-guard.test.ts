import { describe, expect, it } from "vitest";
import { guardClick, guardDown, guardFocus, guardReset, NO_GESTURE } from "./tap-guard";

describe("the tap and focus rule (D11)", () => {
  it("a touch tap: the focus after the pointerdown is dropped and the click is the tap", () => {
    const down = guardDown(NO_GESTURE, "touch", "a");
    expect(down.away).toBe(false);
    expect(guardFocus(down.guard, "a").drop).toBe(true);
    const click = guardClick(down.guard, "a");
    expect(click.tap).toBe(true);
    expect(click.guard).toEqual(NO_GESTURE);
  });

  it("a pen counts as a touch", () => {
    expect(guardFocus(guardDown(NO_GESTURE, "pen", "a").guard, "a").drop).toBe(true);
  });

  it("a mouse click is not a tap and its focus is not dropped", () => {
    const down = guardDown(NO_GESTURE, "mouse", "a");
    expect(down).toEqual({ guard: NO_GESTURE, away: false });
    expect(guardFocus(down.guard, "a").drop).toBe(false);
    expect(guardClick(down.guard, "a").tap).toBe(false);
  });

  it("keyboard focus and clicks without a gesture are untouched", () => {
    expect(guardFocus(NO_GESTURE, "a").drop).toBe(false);
    expect(guardClick(NO_GESTURE, "a").tap).toBe(false);
  });

  it("a gesture on one item never drops the focus of another or taps another", () => {
    const { guard } = guardDown(NO_GESTURE, "touch", "a");
    expect(guardFocus(guard, "b").drop).toBe(false);
    expect(guardClick(guard, "b").tap).toBe(false);
  });

  it("a touch elsewhere is a tap-away and ends the gesture", () => {
    const first = guardDown(NO_GESTURE, "touch", "a");
    expect(guardDown(first.guard, "touch", null)).toEqual({ guard: NO_GESTURE, away: true });
  });

  it("a mouse pointerdown elsewhere is not a tap-away", () => {
    expect(guardDown(NO_GESTURE, "mouse", null).away).toBe(false);
  });

  it("a key press ends the gesture, so a later keyboard focus is kept", () => {
    const { guard } = guardDown(NO_GESTURE, "touch", "a");
    expect(guardFocus(guardReset(), "a").drop).toBe(false);
    expect(guardFocus(guard, "a").drop).toBe(true);
  });
});
