// P4 (controls-and-access R5.3, R6.1, R6.4, R9.5, R10.3): the key map, for every context and every key press.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { keyAction } from "./keys";
import type { KeyAction, KeyContext, KeyDescriptor } from "./keys";
import { PROP_PARAMS, arbKeyContext, arbKeyDescriptor, arbPlainKey } from "./test-kit";

const isRunning = (phase: string): boolean => phase === "lit" || phase === "paused";

describe("P4: the key map", () => {
  it("does nothing for Ctrl, Alt or Meta, and nothing for the repeats of a held key (R10.3)", () => {
    fc.assert(
      fc.property(arbKeyContext, arbKeyDescriptor, (context, key) => {
        const action = keyAction(context, key);
        if (key.ctrl || key.alt || key.meta) expect(action).toBeNull();
        if (key.repeat) expect(action).toBeNull();
      }),
      PROP_PARAMS,
    );
  });

  it("silences every key that would act: Ctrl, Alt, Meta or a repeat turns any action into none (R10.3)", () => {
    // Only (context, key) pairs where the plain key acts are interesting, so the pairs are drawn from the keys the map knows
    // and filtered to the ones that act; otherwise a random context rarely gives the key anything to do.
    const plain = (key: string): KeyDescriptor => ({ key, ctrl: false, alt: false, meta: false, shift: false, repeat: false });
    const arbActing = fc
      .tuple(arbKeyContext, fc.constantFrom("Enter", " ", "Escape", "t", "T"))
      .filter(([context, key]) => keyAction(context, plain(key)) !== null);
    fc.assert(
      fc.property(arbActing, fc.boolean(), ([context, key], shift) => {
        const base: KeyDescriptor = { ...plain(key), shift };
        const acting: KeyAction | null = keyAction(context as KeyContext, base);
        expect(acting).not.toBeNull();
        expect(keyAction(context, { ...base, ctrl: true })).toBeNull();
        expect(keyAction(context, { ...base, alt: true })).toBeNull();
        expect(keyAction(context, { ...base, meta: true })).toBeNull();
        expect(keyAction(context, { ...base, repeat: true })).toBeNull();
      }),
      PROP_PARAMS,
    );
  });

  it("never lets Space act with a text field or any button focused, so the space is typed or the button pressed (R5.3, R10.3)", () => {
    fc.assert(
      fc.property(arbKeyContext, arbKeyDescriptor, (context, key) => {
        fc.pre(key.key === " ");
        if (context.focus === "text" || context.focus === "button") expect(keyAction(context, key)).toBeNull();
      }),
      PROP_PARAMS,
    );
  });

  it("never gives a snuff: a key can only open the dialog, and only Escape does (R6.1, R6.4)", () => {
    fc.assert(
      fc.property(arbKeyContext, arbKeyDescriptor, (context, key) => {
        const action = keyAction(context, key);
        expect(action === null || ["light", "toggle-pause", "open-snuff", "keep-burning", "close-settings", "announce-time"].includes(action.type)).toBe(true);
        if (action?.type === "open-snuff") expect(key.key).toBe("Escape");
      }),
      PROP_PARAMS,
    );
  });

  it("gives open-snuff only in lit or paused with no overlay open, and closes an open overlay instead (R6.1)", () => {
    fc.assert(
      fc.property(arbKeyContext, arbPlainKey, (context, key) => {
        fc.pre(key.key === "Escape");
        const action = keyAction(context, key);
        if (context.overlay === "snuff") expect(action).toEqual({ type: "keep-burning" });
        else if (context.overlay === "settings") expect(action).toEqual({ type: "close-settings" });
        else expect(action).toEqual(isRunning(context.phase) ? { type: "open-snuff" } : null);
      }),
      PROP_PARAMS,
    );
  });

  it("with an overlay open, no key gives light, pause or announce (R6.4)", () => {
    fc.assert(
      fc.property(arbKeyContext, arbKeyDescriptor, (context, key) => {
        fc.pre(context.overlay !== "none");
        const action = keyAction(context, key);
        expect(action === null || action.type === "keep-burning" || action.type === "close-settings").toBe(true);
      }),
      PROP_PARAMS,
    );
  });

  it("never gives an action that is invalid for the phase or the overlay (R1.4, R10.3)", () => {
    fc.assert(
      fc.property(arbKeyContext, arbKeyDescriptor, (context, key) => {
        const action: KeyAction | null = keyAction(context, key);
        if (action === null) return;
        switch (action.type) {
          case "light":
            expect(isRunning(context.phase)).toBe(false);
            expect(context.overlay).toBe("none");
            expect(context.focus).not.toBe("button");
            break;
          case "toggle-pause":
          case "announce-time":
            expect(isRunning(context.phase)).toBe(true);
            expect(context.overlay).toBe("none");
            break;
          case "open-snuff":
            expect(isRunning(context.phase)).toBe(true);
            expect(context.overlay).toBe("none");
            break;
          case "keep-burning":
            expect(context.overlay).toBe("snuff");
            break;
          case "close-settings":
            expect(context.overlay).toBe("settings");
            break;
        }
      }),
      PROP_PARAMS,
    );
  });

  it("gives announce-time only in lit or paused with no overlay, never with a text field focused (R9.5)", () => {
    fc.assert(
      fc.property(arbKeyContext, arbPlainKey, (context, key) => {
        fc.pre(key.key === "t" || key.key === "T");
        const action = keyAction(context, key);
        const expected = isRunning(context.phase) && context.overlay === "none" && context.focus !== "text";
        expect(action).toEqual(expected ? { type: "announce-time" } : null);
      }),
      PROP_PARAMS,
    );
  });

  it("lights only on Enter, and toggles the pause only on Space (R4.2, R5.2)", () => {
    fc.assert(
      fc.property(arbKeyContext, arbKeyDescriptor, (context, key) => {
        const action = keyAction(context, key);
        if (action?.type === "light") expect(key.key).toBe("Enter");
        if (action?.type === "toggle-pause") expect(key.key).toBe(" ");
        if (action?.type === "announce-time") expect(["t", "T"]).toContain(key.key);
      }),
      PROP_PARAMS,
    );
  });
});
