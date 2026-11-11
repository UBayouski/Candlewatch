import { describe, expect, it } from "vitest";
import { initialUi, uiStep } from "./ui-state";
import type { UiAction, UiInput, UiState } from "./ui-state";
import type { State } from "../engine";

type Phase = State["phase"];

const base = initialUi({ defaultLength: 25 });
const act = (action: UiAction): UiInput => ({ type: "action", action });
const run = (ui: UiState, action: UiAction, phase: Phase) => uiStep(ui, act(action), phase);
const withOverlay = (overlay: UiState["overlay"]): UiState => ({ ...base, overlay });
const engine = (from: Phase, to: Phase, typing = false): UiInput => ({ type: "engine", from, to, typing });

describe("initialUi (R2.2)", () => {
  it("selects a preset when the default is one", () => {
    for (const minutes of [15, 25, 50] as const) {
      expect(initialUi({ defaultLength: minutes }).length).toEqual({ kind: "preset", minutes });
    }
  });
  it("selects the custom stop for another whole number", () => {
    expect(initialUi({ defaultLength: 40 }).length).toEqual({ kind: "custom", text: "40" });
  });
  it("starts quiet", () => {
    expect(base).toMatchObject({ intentText: "", overlay: "none", refusal: null, customTouched: false, pendingFocus: null });
  });
});

describe("light", () => {
  it("sends a light event, clears the intent and focuses Pause", () => {
    const ui = { ...base, intentText: "  write  " };
    const r = run(ui, { type: "light" }, "idle");
    expect(r.effects.events).toEqual([{ type: "light", length: 25, intent: "  write  " }]);
    expect(r.effects.focus).toBe("pause-resume");
    expect(r.effects.clearIntent).toBe(true);
    expect(r.ui.intentText).toBe("");
  });
  it("works after a session has ended", () => {
    for (const phase of ["burned-out", "snuffed"] as const) {
      expect(run(base, { type: "light" }, phase).effects.events).toHaveLength(1);
    }
  });
  it("refuses a bad custom length, announces it and focuses the field", () => {
    const ui: UiState = { ...base, length: { kind: "custom", text: "4" } };
    const r = run(ui, { type: "light" }, "idle");
    expect(r.effects.events).toEqual([]);
    expect(r.effects.announce).toBe("refusal");
    expect(r.effects.focus).toBe("custom-length");
    expect(r.ui.refusal).toBe("range");
    expect(r.ui.customTouched).toBe(true);
  });
  it("does nothing while running or with an overlay open", () => {
    for (const phase of ["lit", "paused"] as const) expect(run(base, { type: "light" }, phase).ui).toBe(base);
    for (const overlay of ["snuff", "settings"] as const) {
      const ui = withOverlay(overlay);
      expect(run(ui, { type: "light" }, "idle")).toEqual({ ui, effects: { events: [], announce: null, focus: "none", clearIntent: false } });
    }
  });
});

describe("toggle-pause", () => {
  it("pauses while lit and resumes while paused, focus on the button", () => {
    expect(run(base, { type: "toggle-pause" }, "lit").effects).toMatchObject({ events: [{ type: "pause" }], focus: "pause-resume" });
    expect(run(base, { type: "toggle-pause" }, "paused").effects).toMatchObject({ events: [{ type: "resume" }], focus: "pause-resume" });
  });
  it("does nothing otherwise", () => {
    for (const phase of ["idle", "burned-out", "snuffed"] as const) expect(run(base, { type: "toggle-pause" }, phase).effects.events).toEqual([]);
    expect(run(withOverlay("snuff"), { type: "toggle-pause" }, "lit").effects.events).toEqual([]);
    expect(run(withOverlay("settings"), { type: "toggle-pause" }, "lit").effects.events).toEqual([]);
  });
});

describe("snuff dialog (R4)", () => {
  it("opens with focus on Keep burning and sends nothing", () => {
    const r = run(base, { type: "open-snuff" }, "lit");
    expect(r.ui.overlay).toBe("snuff");
    expect(r.ui.returnFocus).toBe("element");
    expect(r.effects).toMatchObject({ events: [], focus: "keep-burning" });
  });
  it("opens while paused, not while idle or ended or with another overlay", () => {
    expect(run(base, { type: "open-snuff" }, "paused").ui.overlay).toBe("snuff");
    for (const phase of ["idle", "burned-out", "snuffed"] as const) expect(run(base, { type: "open-snuff" }, phase).ui).toBe(base);
    const s = withOverlay("settings");
    expect(run(s, { type: "open-snuff" }, "lit").ui).toBe(s);
  });
  it("keep burning closes it, restores focus and sends nothing", () => {
    const r = run(withOverlay("snuff"), { type: "keep-burning" }, "lit");
    expect(r.ui.overlay).toBe("none");
    expect(r.effects).toMatchObject({ events: [], focus: "restore" });
  });
  it("confirm sends exactly one snuff and holds the focus move for Light", () => {
    const r = run(withOverlay("snuff"), { type: "confirm-snuff" }, "paused");
    expect(r.effects.events).toEqual([{ type: "snuff" }]);
    expect(r.effects.focus).toBe("none");
    expect(r.ui).toMatchObject({ overlay: "none", pendingFocus: "light" });
  });
  it("confirm sends nothing when the session already ended", () => {
    const r = run(withOverlay("snuff"), { type: "confirm-snuff" }, "burned-out");
    expect(r.effects.events).toEqual([]);
  });
  it("answers without a dialog are ignored", () => {
    for (const a of ["confirm-snuff", "keep-burning"] as const) {
      for (const overlay of ["none", "settings"] as const) {
        const ui = withOverlay(overlay);
        expect(run(ui, { type: a }, "lit")).toEqual({ ui, effects: { events: [], announce: null, focus: "none", clearIntent: false } });
      }
    }
  });
});

describe("settings", () => {
  it("opens with focus inside and closes back to the opener", () => {
    const opened = run(base, { type: "open-settings" }, "lit");
    expect(opened.ui.overlay).toBe("settings");
    expect(opened.effects).toMatchObject({ events: [], focus: "settings-first" });
    const closed = run(opened.ui, { type: "close-settings" }, "lit");
    expect(closed.ui.overlay).toBe("none");
    expect(closed.effects.focus).toBe("settings-button");
  });
  it("cannot open over the snuff dialog; close needs it open", () => {
    const s = withOverlay("snuff");
    expect(run(s, { type: "open-settings" }, "lit").ui).toBe(s);
    expect(run(base, { type: "close-settings" }, "lit").ui).toBe(base);
  });
  it("releases a held focus move on close", () => {
    const ui: UiState = { ...withOverlay("settings"), pendingFocus: "light" };
    const r = run(ui, { type: "close-settings" }, "burned-out");
    expect(r.effects.focus).toBe("light");
    expect(r.ui.pendingFocus).toBeNull();
  });
});

describe("announce-time", () => {
  it("announces while running with no overlay", () => {
    expect(run(base, { type: "announce-time" }, "lit").effects.announce).toBe("time");
    expect(run(base, { type: "announce-time" }, "paused").effects.announce).toBe("time");
  });
  it("is silent otherwise", () => {
    expect(run(base, { type: "announce-time" }, "idle").effects.announce).toBeNull();
    expect(run(withOverlay("snuff"), { type: "announce-time" }, "lit").effects.announce).toBeNull();
  });
});

describe("length and intent inputs", () => {
  it("select-preset sets the length and clears a refusal", () => {
    const ui: UiState = { ...base, refusal: "range", length: { kind: "custom", text: "4" } };
    const r = run(ui, { type: "select-preset", minutes: 50 }, "idle");
    expect(r.ui.length).toEqual({ kind: "preset", minutes: 50 });
    expect(r.ui.refusal).toBeNull();
    expect(r.effects.events).toEqual([]);
  });
  it("select-preset is ignored under the snuff dialog", () => {
    const s = withOverlay("snuff");
    expect(run(s, { type: "select-preset", minutes: 15 }, "lit").ui).toBe(s);
  });
  it("set-custom keeps a refusal until the text is valid", () => {
    const refused: UiState = { ...base, refusal: "range", length: { kind: "custom", text: "4" } };
    const still = run(refused, { type: "set-custom", text: "3" }, "idle").ui;
    expect(still.refusal).toBe("range");
    expect(still.length).toEqual({ kind: "custom", text: "3" });
    expect(still.customTouched).toBe(true);
    expect(run(refused, { type: "set-custom", text: "30" }, "idle").ui.refusal).toBeNull();
  });
  it("set-intent keeps the text exactly as typed", () => {
    expect(run(base, { type: "set-intent", text: "  a\n" }, "idle").ui.intentText).toBe("  a\n");
  });
});

describe("engine input", () => {
  it("closes the snuff dialog when the session stops running", () => {
    for (const to of ["burned-out", "snuffed", "idle"] as const) {
      expect(uiStep(withOverlay("snuff"), engine("lit", to), to).ui.overlay).toBe("none");
    }
  });
  it("keeps the dialog across lit and paused", () => {
    const s = withOverlay("snuff");
    expect(uiStep(s, engine("lit", "paused"), "paused").ui).toBe(s);
  });
  it("moves focus to Light when a session ends on its own", () => {
    expect(uiStep(base, engine("lit", "burned-out"), "burned-out").effects.focus).toBe("light");
    expect(uiStep(base, engine("paused", "snuffed"), "snuffed").effects.focus).toBe("light");
  });
  it("releases the focus move held by confirm-snuff", () => {
    const confirmed = run(withOverlay("snuff"), { type: "confirm-snuff" }, "lit").ui;
    const r = uiStep(confirmed, engine("lit", "snuffed"), "snuffed");
    expect(r.effects.focus).toBe("light");
    expect(r.ui.pendingFocus).toBeNull();
  });
  it("leaves focus in a field being typed in", () => {
    const r = uiStep(base, engine("lit", "burned-out", true), "burned-out");
    expect(r.effects.focus).toBe("none");
  });
  it("holds the move while settings are open", () => {
    const r = uiStep(withOverlay("settings"), engine("lit", "burned-out"), "burned-out");
    expect(r.effects.focus).toBe("none");
    expect(r.ui.pendingFocus).toBe("light");
    expect(r.ui.overlay).toBe("settings");
  });
  it("does nothing for changes that do not end a session", () => {
    expect(uiStep(base, engine("idle", "lit"), "lit")).toEqual({ ui: base, effects: { events: [], announce: null, focus: "none", clearIntent: false } });
  });
});

describe("invariants", () => {
  it("never mutates its input", () => {
    const frozen = Object.freeze({ ...base });
    expect(() => run(frozen, { type: "light" }, "idle")).not.toThrow();
  });
  it("never sends tick, hide, show or reload", () => {
    const actions: UiAction[] = [
      { type: "light" }, { type: "toggle-pause" }, { type: "open-snuff" }, { type: "confirm-snuff" }, { type: "keep-burning" },
      { type: "open-settings" }, { type: "close-settings" }, { type: "announce-time" },
    ];
    for (const phase of ["idle", "lit", "paused", "burned-out", "snuffed"] as const) {
      for (const overlay of ["none", "snuff", "settings"] as const) {
        for (const a of actions) {
          for (const e of run(withOverlay(overlay), a, phase).effects.events) {
            expect(["light", "pause", "resume", "snuff"]).toContain(e.type);
          }
        }
      }
    }
  });
});
