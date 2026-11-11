import { describe, expect, it } from "vitest";
import { INITIAL_STATE, step } from "../engine";
import type { State } from "../engine";
import { DEFAULT_SETTINGS } from "../storage/settings";
import type { Settings } from "../storage/settings";
import { placeControls } from "./layout";
import { initialUi } from "./ui-state";
import type { UiState } from "./ui-state";
import { viewOf } from "./view";

const SEC = 1000;
const MIN = 60 * SEC;
const T0 = 1_800_000_000_000;
const FINE = { finePointer: true } as const;
const placement = placeControls(360, 640);
const wide = placeControls(1280, 800);

const ui0 = initialUi(DEFAULT_SETTINGS);
const view = (state: State, now: number, ui: UiState = ui0, settings: Settings = DEFAULT_SETTINGS) => viewOf(state, ui, settings, now, placement, FINE);
const lit = (lengthMin = 25, intent?: string): State =>
  step(INITIAL_STATE, intent === undefined ? { type: "light", length: lengthMin } : { type: "light", length: lengthMin, intent }, T0);

describe("the time text (design 7.1)", () => {
  it("shows the chosen length in idle, and --:-- for an invalid custom text", () => {
    expect(view(INITIAL_STATE, T0).timeText).toBe("25:00");
    expect(view(INITIAL_STATE, T0, { ...ui0, length: { kind: "preset", minutes: 50 } }).timeText).toBe("50:00");
    expect(view(INITIAL_STATE, T0, { ...ui0, length: { kind: "custom", text: "40" } }).timeText).toBe("40:00");
    for (const text of ["", "4", "91", "abc", "2.5"]) {
      const v = view(INITIAL_STATE, T0, { ...ui0, length: { kind: "custom", text } });
      expect(v.timeText, text).toBe("--:--");
      expect(v.timeWords).toBe("");
    }
  });
  it("shows the time left, rounded up, while lit and paused, and words for a screen reader", () => {
    const s = lit(25);
    expect(view(s, T0).timeText).toBe("25:00");
    expect(view(s, T0 + 12 * MIN + 29 * SEC + 100).timeText).toBe("12:31");
    expect(view(s, T0 + 12 * MIN + 29 * SEC + 100).timeWords).toBe("12 minutes 31 seconds left");
    const paused = step(s, { type: "pause" }, T0 + 5 * MIN);
    expect(view(paused, T0 + 8 * MIN).timeText).toBe("20:00"); // the time text stays still while paused
  });
  it("shows 00:00 after the end", () => {
    const burned = step(lit(25), { type: "tick" }, T0 + 25 * MIN);
    const snuffed = step(lit(25), { type: "snuff" }, T0 + MIN);
    for (const s of [burned, snuffed]) expect(view(s, T0 + 30 * MIN).timeText).toBe("00:00");
  });
  it("is the same for the same state and moment", () => {
    const s = lit(25);
    expect(view(s, T0 + 7 * MIN)).toEqual(view(s, T0 + 7 * MIN));
  });
});

describe("the status line (design 7.2)", () => {
  const text = (state: State, now: number, ui: UiState = ui0): string => view(state, now, ui).status.text;
  const kind = (state: State, now: number, ui: UiState = ui0): string => view(state, now, ui).status.kind;

  it("says the instructions on a first visit and the flavour line after", () => {
    expect(kind(INITIAL_STATE, T0)).toBe("instructions");
    expect(text(INITIAL_STATE, T0)).toBe("Enter lights. Space pauses. Esc lets it go dark.");
    // An idle state with a non-empty history never shows the first-visit line.
    const idleWithHistory: State = { phase: "idle", history: step(lit(25), { type: "snuff" }, T0 + MIN).history };
    expect(idleWithHistory.history).toHaveLength(1);
    expect(kind(idleWithHistory, T0 + 3 * MIN)).toBe("idle");
    expect(text(idleWithHistory, T0 + 3 * MIN)).toBe("The candle waits.");
  });
  it("does not say the instructions during or after the first session", () => {
    expect(kind(lit(25), T0)).not.toBe("instructions");
    expect(kind(step(lit(25), { type: "snuff" }, T0 + MIN), T0 + 2 * MIN)).toBe("snuffed");
  });
  it("shows the intent while lit, and the flavour line without one", () => {
    expect(text(lit(25, "write the report"), T0 + MIN)).toBe("write the report");
    expect(kind(lit(25, "write the report"), T0 + MIN)).toBe("intent");
    expect(text(lit(25), T0 + MIN)).toBe("The wick catches.");
  });
  it("shows the guttering line in the last minute when there is no intent, and the intent when there is", () => {
    const end = T0 + 25 * MIN;
    expect(text(lit(25), end - 60 * SEC)).toBe("The flame gutters."); // exactly 60 s left (<=)
    expect(text(lit(25), end - 60 * SEC - 1)).toBe("The wick catches.");
    expect(text(lit(25, "ship it"), end - 30 * SEC)).toBe("ship it");
  });
  it("counts the pause allowance down while the time text stays still", () => {
    const paused = step(lit(25), { type: "pause" }, T0 + 5 * MIN);
    expect(text(paused, T0 + 5 * MIN)).toBe("Pause left 10:00");
    expect(text(paused, T0 + 7 * MIN + 30 * SEC)).toBe("Pause left 07:30");
    expect(view(paused, T0 + 7 * MIN).timeText).toBe(view(paused, T0 + 5 * MIN).timeText);
    const earlier = step(step(step(lit(25), { type: "pause" }, T0 + MIN), { type: "resume" }, T0 + 5 * MIN), { type: "pause" }, T0 + 6 * MIN);
    expect(text(earlier, T0 + 6 * MIN)).toBe("Pause left 06:00"); // 4 minutes already used
  });
  it("says the wax cools for the break, then the watch is over", () => {
    const burned = step(lit(25), { type: "tick" }, T0 + 25 * MIN);
    expect(text(burned, T0 + 25 * MIN + 4 * MIN)).toBe("The wax cools.");
    expect(kind(burned, T0 + 25 * MIN + 4 * MIN)).toBe("cools");
    expect(text(burned, T0 + 25 * MIN + 5 * MIN)).toBe("The watch is over. Morning.");
  });
  it("says the flame is out when snuffed", () => {
    expect(text(step(lit(25), { type: "snuff" }, T0 + MIN), T0 + 2 * MIN)).toBe("The flame is out.");
  });
  it("shows a refusal first, and removes it when the UI state clears it", () => {
    const refused: UiState = { ...ui0, refusal: "range", customTouched: true, length: { kind: "custom", text: "4" } };
    expect(text(INITIAL_STATE, T0, refused)).toBe("Choose 5 to 90 minutes.");
    expect(kind(INITIAL_STATE, T0, refused)).toBe("refusal");
    expect(kind(INITIAL_STATE, T0, { ...refused, refusal: null })).toBe("instructions");
  });
  it("names the keys on a device with a fine pointer and taps on one without (the view model is told, it never asks)", () => {
    expect(view(INITIAL_STATE, T0).status.text).toBe("Enter lights. Space pauses. Esc lets it go dark.");
    const touch = viewOf(INITIAL_STATE, ui0, DEFAULT_SETTINGS, T0, placement, { finePointer: false });
    expect(touch.status).toMatchObject({ kind: "instructions", text: "Tap Light to begin. Tap pause to rest." });
    // Only the first-visit line changes with the pointer.
    expect(viewOf(lit(25), ui0, DEFAULT_SETTINGS, T0, placement, { finePointer: false }).status.text).toBe("The wick catches.");
  });
  it("puts the length message under the chooser in the wide layout and in the status line in the compact one", () => {
    const refused: UiState = { ...ui0, refusal: "range", customTouched: true, length: { kind: "custom", text: "4" } };
    const compact = viewOf(INITIAL_STATE, refused, DEFAULT_SETTINGS, T0, placement, FINE);
    expect(compact.status).toMatchObject({ kind: "refusal", text: "Choose 5 to 90 minutes." });
    expect(compact.chooser).toMatchObject({ error: "Choose 5 to 90 minutes.", describedBy: "status" });
    const side = viewOf(INITIAL_STATE, refused, DEFAULT_SETTINGS, T0, wide, FINE);
    expect(side.status.kind).toBe("instructions");
    expect(side.chooser).toMatchObject({ error: "Choose 5 to 90 minutes.", describedBy: "length-error" });
    expect(viewOf(INITIAL_STATE, ui0, DEFAULT_SETTINGS, T0, wide, FINE).chooser.error).toBeNull();
  });
  it("takes the narrow rectangle while Pause and Let it go dark are shown, and the wide one at rest", () => {
    expect(view(lit(25), T0).status.rect).toEqual(placement.statusRunning);
    expect(view(INITIAL_STATE, T0).status.rect).toEqual(placement.statusResting);
    expect(view(step(lit(25), { type: "snuff" }, T0 + MIN), T0 + 2 * MIN).status.rect).toEqual(placement.statusResting);
  });
});

describe("which controls are shown", () => {
  it("shows the setup controls in idle and the ended phases, and Pause and Let it go dark only while lit or paused", () => {
    const burned = step(lit(25), { type: "tick" }, T0 + 25 * MIN);
    const snuffed = step(lit(25), { type: "snuff" }, T0 + MIN);
    const paused = step(lit(25), { type: "pause" }, T0 + MIN);
    for (const s of [INITIAL_STATE, burned, snuffed]) {
      const v = view(s, T0 + 30 * MIN);
      expect([v.setupVisible, v.runningVisible]).toEqual([true, false]);
    }
    for (const s of [lit(25), paused]) {
      const v = view(s, T0 + MIN);
      expect([v.setupVisible, v.runningVisible]).toEqual([false, true]);
    }
  });
  it("always shows Settings", () => {
    for (const s of [INITIAL_STATE, lit(25), step(lit(25), { type: "snuff" }, T0 + MIN)]) {
      expect(view(s, T0 + 2 * MIN).settingsVisible).toBe(true);
      expect(view(s, T0 + 2 * MIN).tabOrder.at(-1)).toBe("settings");
    }
  });
  it("labels Light, then Light another, and Pause, then Resume", () => {
    expect(view(INITIAL_STATE, T0).light.label).toBe("Light");
    expect(view(step(lit(25), { type: "snuff" }, T0 + MIN), T0 + 2 * MIN).light.label).toBe("Light another");
    expect(view(lit(25), T0).pause.label).toBe("Pause");
    expect(view(step(lit(25), { type: "pause" }, T0 + MIN), T0 + 2 * MIN).pause.label).toBe("Resume");
  });
  it("lists the Tab order: chooser, intent, Light, Settings at rest; Pause, Let it go dark, Settings while a candle burns", () => {
    expect(view(INITIAL_STATE, T0).tabOrder).toEqual(["chooser", "intent", "light", "settings"]);
    expect(view(lit(25), T0).tabOrder).toEqual(["pause", "snuff", "settings"]);
    expect(viewOf(lit(25), ui0, DEFAULT_SETTINGS, T0, wide, FINE).tabOrder).toEqual(["pause", "snuff", "settings"]);
  });
});

describe("the chooser, the intent field and the settings", () => {
  it("selects the stop of the UI state and marks an invalid custom text only after it was touched", () => {
    expect(view(INITIAL_STATE, T0).chooser).toMatchObject({ selected: 1, customText: "", customInvalid: false });
    expect(view(INITIAL_STATE, T0, { ...ui0, length: { kind: "preset", minutes: 15 } }).chooser.selected).toBe(0);
    expect(view(INITIAL_STATE, T0, { ...ui0, length: { kind: "preset", minutes: 50 } }).chooser.selected).toBe(2);
    const custom: UiState = { ...ui0, length: { kind: "custom", text: "4" } };
    expect(view(INITIAL_STATE, T0, custom).chooser).toMatchObject({ selected: 3, customText: "4", customInvalid: false });
    expect(view(INITIAL_STATE, T0, { ...custom, customTouched: true }).chooser.customInvalid).toBe(true);
    expect(view(INITIAL_STATE, T0, { ...custom, customTouched: true, length: { kind: "custom", text: "40" } }).chooser.customInvalid).toBe(false);
    expect(view(INITIAL_STATE, T0).chooser.presetLabels).toEqual(["15 minutes", "25 minutes", "50 minutes"]);
  });
  it("counts the intent in code points and flags it past 80", () => {
    const at = (text: string) => view(INITIAL_STATE, T0, { ...ui0, intentText: text }).intent;
    expect(at("")).toMatchObject({ codePoints: 0, overLimit: false, counter: "0 of 80" });
    expect(at("a".repeat(80))).toMatchObject({ codePoints: 80, overLimit: false });
    expect(at("a".repeat(81))).toMatchObject({ codePoints: 81, overLimit: true, overLimitMark: "80+" });
    expect(at("\u{1F600}".repeat(80)).codePoints).toBe(80); // 160 UTF-16 units, 80 code points
    expect(at("\u{1F600}".repeat(81)).overLimit).toBe(true);
    expect(at("x").hint).toBe("Only the first 80 characters are kept.");
    // The visible hint: the full label in the wide layout, a shorter one in the compact layout.
    expect(at("").placeholder).toBe("Intent (optional)");
    expect(viewOf(INITIAL_STATE, ui0, DEFAULT_SETTINGS, T0, wide, FINE).intent.placeholder).toBe("What is this candle for? (optional)");
  });
  it("shows the overlay and the settings with On and Off text", () => {
    const v = view(INITIAL_STATE, T0, { ...ui0, overlay: "settings" }, { sound: false, ghosts: true, defaultLength: 40 });
    expect(v.overlay).toBe("settings");
    expect(v.settings.sound).toEqual({ checked: false, label: "Sound", stateText: "Off" });
    expect(v.settings.ghosts).toEqual({ checked: true, label: "Ghosts", stateText: "On" });
    expect(v.settings.defaultLength).toEqual({ label: "Default length", value: 40, selected: 3, customText: "40" });
    expect(view(INITIAL_STATE, T0).settings.defaultLength).toMatchObject({ selected: 1, customText: "" });
  });
  it("passes the placement through", () => {
    expect(view(INITIAL_STATE, T0).placement).toBe(placement);
  });
});

describe("the graveyard view (ghosts-and-graveyard R3.13, R6.16)", () => {
  const inGraveyard = (state: State, now: number) => viewOf(state, ui0, DEFAULT_SETTINGS, now, placement, FINE, "graveyard");
  const burned = step(lit(25), { type: "tick" }, T0 + 25 * MIN);
  const snuffed = step(lit(25), { type: "snuff" }, T0 + MIN);

  it("hides the setup controls in idle and the ended phases, and keeps Settings", () => {
    for (const s of [INITIAL_STATE, burned, snuffed]) {
      const v = inGraveyard(s, T0 + 30 * MIN);
      expect([v.setupVisible, v.runningVisible, v.settingsVisible]).toEqual([false, false, true]);
      expect(v.tabOrder).toEqual(["settings"]);
    }
  });
  it("keeps the zone controls and Settings while a candle burns", () => {
    for (const s of [lit(25), step(lit(25), { type: "pause" }, T0 + MIN)]) {
      const v = inGraveyard(s, T0 + 2 * MIN);
      expect([v.setupVisible, v.runningVisible]).toEqual([false, true]);
      expect(v.tabOrder).toEqual(["pause", "snuff", "settings"]);
    }
  });
  it("is the room view when the view argument is left out or is room", () => {
    expect(viewOf(INITIAL_STATE, ui0, DEFAULT_SETTINGS, T0, placement, FINE)).toEqual(viewOf(INITIAL_STATE, ui0, DEFAULT_SETTINGS, T0, placement, FINE, "room"));
    expect(view(INITIAL_STATE, T0).tabOrder).toEqual(["chooser", "intent", "light", "settings"]);
  });
});