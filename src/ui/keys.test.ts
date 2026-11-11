import { describe, expect, it } from "vitest";
import type { State } from "../engine";
import { keyAction } from "./keys";
import type { FocusKind, KeyAction, KeyContext, KeyDescriptor } from "./keys";

type Phase = State["phase"];
const PHASES: readonly Phase[] = ["idle", "lit", "paused", "burned-out", "snuffed"];
const RUNNING: readonly Phase[] = ["lit", "paused"];
const FOCUS: readonly FocusKind[] = ["body", "text", "button", "other"];
const OVERLAYS: readonly KeyContext["overlay"][] = ["none", "snuff", "settings"];

const press = (key: string, extra: Partial<KeyDescriptor> = {}): KeyDescriptor => ({
  key,
  ctrl: false,
  alt: false,
  meta: false,
  shift: false,
  repeat: false,
  ...extra,
});
const ctx = (phase: Phase, focus: FocusKind = "body", overlay: KeyContext["overlay"] = "none"): KeyContext => ({ phase, overlay, focus, view: "room" });

describe("Enter lights (R4.2, R10.3)", () => {
  it("lights in idle, burned-out and snuffed when the focus is on the body, a text field or something else", () => {
    for (const phase of ["idle", "burned-out", "snuffed"] as const) {
      for (const focus of ["body", "text", "other"] as const) {
        expect(keyAction(ctx(phase, focus), press("Enter")), `${phase} ${focus}`).toEqual({ type: "light" });
      }
    }
  });

  it("leaves Enter to a focused button, which activates itself", () => {
    for (const phase of PHASES) expect(keyAction(ctx(phase, "button"), press("Enter"))).toBeNull();
  });

  it("does nothing while a session runs: a second candle cannot be lit", () => {
    for (const phase of RUNNING) for (const focus of FOCUS) expect(keyAction(ctx(phase, focus), press("Enter"))).toBeNull();
  });
});

describe("Space pauses and resumes (R5.2, R10.3)", () => {
  it("toggles while lit or paused when the focus is on the body or something that does not use Space", () => {
    for (const phase of RUNNING) {
      for (const focus of ["body", "other"] as const) {
        expect(keyAction(ctx(phase, focus), press(" ")), `${phase} ${focus}`).toEqual({ type: "toggle-pause" });
      }
    }
  });

  it("is left to a text field (a space is typed) and to any button (the browser activates it, including the Pause button)", () => {
    for (const phase of RUNNING) for (const focus of ["text", "button"] as const) expect(keyAction(ctx(phase, focus), press(" "))).toBeNull();
  });

  it("does nothing in idle, burned-out and snuffed", () => {
    for (const phase of ["idle", "burned-out", "snuffed"] as const) for (const focus of FOCUS) expect(keyAction(ctx(phase, focus), press(" "))).toBeNull();
  });

  it("works with Shift held", () => {
    expect(keyAction(ctx("lit"), press(" ", { shift: true }))).toEqual({ type: "toggle-pause" });
  });
});

describe("Escape (R6.1)", () => {
  it("opens the snuff dialog while lit or paused, from any focus, with no overlay open", () => {
    for (const phase of RUNNING) for (const focus of FOCUS) expect(keyAction(ctx(phase, focus), press("Escape"))).toEqual({ type: "open-snuff" });
  });

  it("does nothing in idle, burned-out and snuffed with no overlay open", () => {
    for (const phase of ["idle", "burned-out", "snuffed"] as const) expect(keyAction(ctx(phase), press("Escape"))).toBeNull();
  });

  it("is Keep burning with the snuff dialog open, and closes the settings panel with that open", () => {
    for (const phase of PHASES) {
      for (const focus of FOCUS) {
        expect(keyAction(ctx(phase, focus, "snuff"), press("Escape"))).toEqual({ type: "keep-burning" });
        expect(keyAction(ctx(phase, focus, "settings"), press("Escape"))).toEqual({ type: "close-settings" });
      }
    }
  });
});

describe("t announces the time (R9.5)", () => {
  it("announces while lit or paused, with either case, unless a text field has the focus", () => {
    for (const phase of RUNNING) {
      for (const focus of ["body", "button", "other"] as const) {
        for (const key of ["t", "T"]) expect(keyAction(ctx(phase, focus), press(key)), `${phase} ${focus} ${key}`).toEqual({ type: "announce-time" });
      }
      expect(keyAction(ctx(phase, "text"), press("t"))).toBeNull();
      expect(keyAction(ctx(phase, "text"), press("T"))).toBeNull();
    }
  });

  it("does nothing in idle, burned-out and snuffed", () => {
    for (const phase of ["idle", "burned-out", "snuffed"] as const) expect(keyAction(ctx(phase), press("t"))).toBeNull();
  });
});

describe("modifiers and repeats (R10.3)", () => {
  const keys = ["Enter", " ", "Escape", "t", "T"];

  it("does nothing with Ctrl, Alt or Meta held, so browser shortcuts keep working", () => {
    for (const phase of PHASES) {
      for (const key of keys) {
        for (const mod of ["ctrl", "alt", "meta"] as const) expect(keyAction(ctx(phase), press(key, { [mod]: true })), `${phase} ${key} ${mod}`).toBeNull();
      }
    }
  });

  it("does nothing for the repeats of a held key: Space, Enter, t, and Escape (a held Escape must not open the dialog and close it again)", () => {
    for (const phase of PHASES) for (const key of keys) expect(keyAction(ctx(phase), press(key, { repeat: true })), `${phase} ${key}`).toBeNull();
    expect(keyAction(ctx("lit", "body", "snuff"), press("Escape", { repeat: true }))).toBeNull();
  });
});

describe("with an overlay open nothing else applies (R6.4)", () => {
  it("gives no light, pause or announce for Enter, Space or t", () => {
    for (const phase of PHASES) {
      for (const overlay of ["snuff", "settings"] as const) {
        for (const focus of FOCUS) {
          for (const key of ["Enter", " ", "t", "T"]) expect(keyAction(ctx(phase, focus, overlay), press(key)), `${phase} ${overlay} ${focus} ${key}`).toBeNull();
        }
      }
    }
  });
});

describe("no key ever snuffs, and other keys do nothing", () => {
  it("gives only the six actions of the table", () => {
    const allowed = new Set<KeyAction["type"]>(["light", "toggle-pause", "open-snuff", "keep-burning", "close-settings", "announce-time"]);
    for (const phase of PHASES) {
      for (const focus of FOCUS) {
        for (const overlay of OVERLAYS) {
          for (const key of ["Enter", " ", "Escape", "t", "T", "Tab", "ArrowLeft", "a", "Backspace", "s", "x"]) {
            const action = keyAction(ctx(phase, focus, overlay), press(key));
            if (action !== null) expect(allowed.has(action.type)).toBe(true);
          }
        }
      }
    }
  });

  it("ignores Tab, arrows and letters", () => {
    for (const key of ["Tab", "ArrowLeft", "ArrowDown", "a", "s", "Backspace", "Delete", "Home"]) expect(keyAction(ctx("lit"), press(key))).toBeNull();
  });
});

describe("the graveyard view (ghosts-and-graveyard R3.13, R6.16, R6.17)", () => {
  const inGraveyard = (phase: Phase, focus: FocusKind = "body", overlay: KeyContext["overlay"] = "none"): KeyContext => ({ phase, overlay, focus, view: "graveyard" });

  it("gives no action for Enter, Space, Escape, t or T with no overlay open", () => {
    for (const phase of PHASES) for (const focus of FOCUS) for (const key of ["Enter", " ", "Escape", "t", "T", "g", "ArrowLeft"]) {
      expect(keyAction(inGraveyard(phase, focus), press(key)), `${phase} ${focus} ${key}`).toBeNull();
    }
  });

  it("still closes an open settings overlay with Escape", () => {
    for (const phase of PHASES) for (const focus of FOCUS) {
      expect(keyAction(inGraveyard(phase, focus, "settings"), press("Escape"))).toEqual({ type: "close-settings" });
    }
  });

  it("gives nothing else with the settings overlay open, nor for the snuff dialog, nor for a held or modified Escape", () => {
    expect(keyAction(inGraveyard("lit", "body", "settings"), press("Enter"))).toBeNull();
    expect(keyAction(inGraveyard("lit", "body", "snuff"), press("Escape"))).toBeNull();
    expect(keyAction(inGraveyard("lit", "body", "settings"), press("Escape", { repeat: true }))).toBeNull();
    expect(keyAction(inGraveyard("lit", "body", "settings"), press("Escape", { ctrl: true }))).toBeNull();
  });

  it("leaves the room as before: Escape still opens the snuff dialog while lit", () => {
    expect(keyAction(ctx("lit"), press("Escape"))).toEqual({ type: "open-snuff" });
  });
});