import { describe, expect, it } from "vitest";
import { guardCancel, guardClick, guardDown, guardFocus, guardReset, NO_GESTURE } from "./tap-guard";
import type { TapGuard } from "./tap-guard";

/** What the DOM layer sends to the card from one pointer, key and focus sequence on items (view-dom.ts: focusin and click). */
type Step =
  | { readonly type: "down"; readonly pointer: "mouse" | "touch" | "pen"; readonly item: string | null }
  | { readonly type: "focus"; readonly item: string }
  | { readonly type: "click"; readonly item: string }
  | { readonly type: "key" }
  | { readonly type: "cancel" };

function cardInputs(steps: readonly Step[]): string[] {
  let guard: TapGuard = NO_GESTURE;
  const out: string[] = [];
  for (const step of steps) {
    switch (step.type) {
      case "down": {
        const result = guardDown(guard, step.pointer, step.item);
        guard = result.guard;
        if (result.away) out.push("tap-away");
        break;
      }
      case "focus": {
        const result = guardFocus(guard, step.item);
        guard = result.guard;
        if (!result.drop) out.push(`focus ${step.item}`);
        break;
      }
      case "click": {
        const result = guardClick(guard, step.item);
        guard = result.guard;
        if (result.tap) out.push(`tap ${step.item}`);
        break;
      }
      case "key":
        guard = guardReset();
        break;
      case "cancel":
        guard = guardCancel(guard);
        break;
    }
  }
  return out;
}

describe("the tap and focus rule (D11, D24)", () => {
  it("the start state is keyboard: no gesture and the keyboard modality", () => {
    expect(NO_GESTURE).toEqual({ gesture: null, modality: "keyboard" });
  });

  it("a touch tap: the focus after the pointerdown is dropped and the click is the tap", () => {
    const down = guardDown(NO_GESTURE, "touch", "a");
    expect(down.away).toBe(false);
    expect(guardFocus(down.guard, "a").drop).toBe(true);
    const click = guardClick(down.guard, "a");
    expect(click.tap).toBe(true);
    expect(click.guard).toEqual({ gesture: null, modality: "pointer" }); // the gesture ends, the last input stays a pointer's
  });

  it("a pen counts as a touch", () => {
    expect(guardFocus(guardDown(NO_GESTURE, "pen", "a").guard, "a").drop).toBe(true);
  });

  it("a mouse click on an item: its focus is dropped for the card, and the click is not a tap", () => {
    const down = guardDown(NO_GESTURE, "mouse", "a");
    expect(down).toEqual({ guard: { gesture: null, modality: "pointer" }, away: false });
    expect(guardFocus(down.guard, "a").drop).toBe(true);
    const click = guardClick(down.guard, "a");
    expect(click.tap).toBe(false);
    expect(click.guard).toEqual({ gesture: null, modality: "pointer" });
  });

  it("mouse pointerdown, then focus, then click on the same item gives no card input and no tap", () => {
    expect(cardInputs([{ type: "down", pointer: "mouse", item: "a" }, { type: "focus", item: "a" }, { type: "click", item: "a" }])).toEqual([]);
  });

  it("keyboard focus and clicks without a gesture are untouched", () => {
    expect(guardFocus(NO_GESTURE, "a").drop).toBe(false);
    expect(guardClick(NO_GESTURE, "a").tap).toBe(false);
  });

  it("a focus with no preceding pointerdown is a keyboard focus", () => {
    expect(cardInputs([{ type: "focus", item: "a" }])).toEqual(["focus a"]);
    expect(cardInputs([{ type: "focus", item: "a" }, { type: "focus", item: "b" }])).toEqual(["focus a", "focus b"]);
  });

  it("a gesture on one item never taps another; while the last input is a pointer's, the focus of another item is dropped too", () => {
    const { guard } = guardDown(NO_GESTURE, "touch", "a");
    expect(guardFocus(guard, "b").drop).toBe(true);
    expect(guardClick(guard, "b").tap).toBe(false);
  });

  it("a touch elsewhere is a tap-away and ends the gesture", () => {
    const first = guardDown(NO_GESTURE, "touch", "a");
    expect(guardDown(first.guard, "touch", null)).toEqual({ guard: { gesture: null, modality: "pointer" }, away: true });
  });

  it("a mouse pointerdown elsewhere is not a tap-away", () => {
    expect(guardDown(NO_GESTURE, "mouse", null).away).toBe(false);
  });

  it("a pointerdown on a non-item, such as the Door, makes the next focus on any item a pointer's: it is dropped", () => {
    for (const pointer of ["mouse", "touch", "pen"] as const) {
      expect(cardInputs([{ type: "down", pointer, item: null }, { type: "focus", item: "first" }]), pointer).toEqual(pointer === "mouse" ? [] : ["tap-away"]);
    }
  });

  it("a key press ends the gesture, so a later keyboard focus is kept", () => {
    const { guard } = guardDown(NO_GESTURE, "touch", "a");
    expect(guardFocus(guardReset(), "a").drop).toBe(false);
    expect(guardFocus(guard, "a").drop).toBe(true);
  });

  it("a key press after a pointer input returns to keyboard behaviour: the next focus follows", () => {
    expect(guardReset()).toEqual(NO_GESTURE);
    expect(cardInputs([{ type: "down", pointer: "mouse", item: "a" }, { type: "focus", item: "a" }, { type: "key" }, { type: "focus", item: "b" }])).toEqual(["focus b"]);
  });

  it("a click keeps the modality: a focus after a tap is still a pointer's, and a mouse press after a key is a pointer's again", () => {
    expect(cardInputs([{ type: "down", pointer: "touch", item: "a" }, { type: "focus", item: "a" }, { type: "click", item: "a" }, { type: "focus", item: "b" }])).toEqual(["tap a"]);
    expect(cardInputs([{ type: "key" }, { type: "down", pointer: "mouse", item: "a" }, { type: "focus", item: "a" }])).toEqual([]);
  });

  it("a cancelled pointer ends the gesture and keeps the modality, never switching it to keyboard", () => {
    const touch = guardDown(NO_GESTURE, "touch", "a").guard;
    expect(guardCancel(touch)).toEqual({ gesture: null, modality: "pointer" });
    expect(guardCancel(NO_GESTURE)).toEqual(NO_GESTURE);
    expect(guardFocus(guardCancel(touch), "a").drop).toBe(true);
    expect(guardClick(guardCancel(touch), "a").tap).toBe(false);
  });
});
