// Property test for the tap guard (ghosts-and-graveyard amendment 2026-11-20, design D24, Property 23; requirements P17).
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { guardCancel, guardClick, guardDown, guardFocus, guardReset, NO_GESTURE } from "./tap-guard";
import type { TapGuard } from "./tap-guard";
import { PROP_PARAMS } from "./test-kit";

type Pointer = "mouse" | "touch" | "pen";
type Input =
  | { readonly type: "down"; readonly pointer: Pointer; readonly item: string | null }
  | { readonly type: "cancel" }
  | { readonly type: "key" }
  | { readonly type: "focus"; readonly item: string }
  | { readonly type: "click"; readonly item: string };

const ITEMS = ["a", "b", "c"] as const;
const arbItem = fc.constantFrom(...ITEMS);
const arbInput: fc.Arbitrary<Input> = fc.oneof(
  fc.record({ type: fc.constant("down" as const), pointer: fc.constantFrom<Pointer>("mouse", "touch", "pen"), item: fc.option(arbItem, { nil: null }) }),
  fc.constant<Input>({ type: "cancel" }),
  fc.constant<Input>({ type: "key" }),
  fc.record({ type: fc.constant("focus" as const), item: arbItem }),
  fc.record({ type: fc.constant("click" as const), item: arbItem }),
);

/** The reference model, written from the requirements and not from tap-guard.ts. */
interface Model {
  /** True when the last pointerdown came after the last keydown (the start counts as keyboard). */
  pointerLast: boolean;
  /** The item with a touch or pen gesture in progress. */
  touchOn: string | null;
}

describe("Property 23: the guard drops what a pointer focused, and only that", () => {
  it("a focus is dropped exactly when the last pointerdown came after the last keydown or a touch or pen gesture is on that item; a tap only for a touch or pen gesture on the clicked item", () => {
    fc.assert(
      fc.property(fc.array(arbInput, { maxLength: 40 }), (inputs) => {
        let guard: TapGuard = NO_GESTURE;
        const model: Model = { pointerLast: false, touchOn: null };
        for (const input of inputs) {
          switch (input.type) {
            case "down": {
              const result = guardDown(guard, input.pointer, input.item);
              guard = result.guard;
              const touchLike = input.pointer !== "mouse";
              expect(result.away).toBe(touchLike && input.item === null); // R5.8: a touch or pen elsewhere is a tap-away, a mouse press is not
              model.pointerLast = true; // any pointer type, anywhere
              model.touchOn = touchLike ? input.item : null;
              break;
            }
            case "cancel":
              guard = guardCancel(guard);
              model.touchOn = null; // the gesture ends; which input came last does not change
              break;
            case "key":
              guard = guardReset();
              model.pointerLast = false;
              model.touchOn = null;
              break;
            case "focus": {
              const result = guardFocus(guard, input.item);
              guard = result.guard;
              expect(result.drop).toBe(model.pointerLast || model.touchOn === input.item);
              break;
            }
            case "click": {
              const result = guardClick(guard, input.item);
              guard = result.guard;
              expect(result.tap).toBe(model.touchOn === input.item); // a mouse click is never a tap
              model.touchOn = null; // the click ends the gesture; the modality stays
              break;
            }
          }
        }
      }),
      PROP_PARAMS,
    );
  });

  it("a mouse pointerdown never makes a tap, whatever came before it", () => {
    fc.assert(
      fc.property(fc.array(arbInput, { maxLength: 20 }), arbItem, (inputs, item) => {
        let guard: TapGuard = NO_GESTURE;
        for (const input of inputs) {
          if (input.type === "down") guard = guardDown(guard, input.pointer, input.item).guard;
          else if (input.type === "cancel") guard = guardCancel(guard);
          else if (input.type === "key") guard = guardReset();
          else if (input.type === "focus") guard = guardFocus(guard, input.item).guard;
          else guard = guardClick(guard, input.item).guard;
        }
        const pressed = guardDown(guard, "mouse", item).guard;
        expect(guardClick(pressed, item).tap).toBe(false);
        expect(guardFocus(pressed, item).drop).toBe(true);
      }),
      PROP_PARAMS,
    );
  });

  it("a key press clears the gesture and the pointer modality, and a cancelled pointer clears only the gesture", () => {
    fc.assert(
      fc.property(fc.array(arbInput, { maxLength: 30 }), (inputs) => {
        let guard: TapGuard = NO_GESTURE;
        for (const input of inputs) {
          if (input.type === "down") guard = guardDown(guard, input.pointer, input.item).guard;
          else if (input.type === "cancel") guard = guardCancel(guard);
          else if (input.type === "key") guard = guardReset();
          else if (input.type === "focus") guard = guardFocus(guard, input.item).guard;
          else guard = guardClick(guard, input.item).guard;
        }
        expect(guardReset()).toEqual(NO_GESTURE);
        expect(guardCancel(guard).modality).toBe(guard.modality);
        expect(guardCancel(guard).gesture).toBeNull();
      }),
      PROP_PARAMS,
    );
  });
});
