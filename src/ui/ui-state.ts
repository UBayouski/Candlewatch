// The UI state machine: what the interface remembers on top of the engine state, and what each input does to it
// (controls-and-access R2.2, R2.5, R3.5, R4, R5, R6, R10.5; design 3.5). Pure: no DOM, no clock.
// `uiStep` decides; the DOM layer (later tasks) turns its `Effects` into engine events, announcements and focus moves.
import type { Event, State } from "../engine";
import { PRESET_LENGTHS_MIN } from "../engine";
import { lightRequest } from "./light";
import { parseLength } from "./length";
import type { LengthChoice, PresetMinutes } from "./length";

type Phase = State["phase"];

/** Where focus should go after an input. `restore` means "the element that had it before the overlay opened". */
export type FocusTarget =
  | "pause-resume"
  | "light"
  | "custom-length"
  | "keep-burning"
  | "settings-first"
  | "settings-button"
  | "restore"
  | "none";

export interface UiState {
  /** The chosen length (initially the default length from the settings). */
  readonly length: LengthChoice;
  /** The raw text of the intent field. */
  readonly intentText: string;
  readonly overlay: "none" | "snuff" | "settings";
  /** Why Light was refused; shown in the status line until the text becomes valid. */
  readonly refusal: "format" | "range" | "empty" | null;
  /** The custom field has been typed in, or Light was pressed: its errors may show. */
  readonly customTouched: boolean;
  /** Where focus goes when the overlay closes. */
  readonly returnFocus: FocusTarget | "element";
  /** A focus move held back (while the settings panel is open, or until the phase has changed). */
  readonly pendingFocus: FocusTarget | null;
}

/** KeyAction plus what only a pointer, a form or a field can do. */
export type UiAction =
  | { readonly type: "light" }
  | { readonly type: "toggle-pause" }
  | { readonly type: "open-snuff" }
  | { readonly type: "confirm-snuff" }
  | { readonly type: "keep-burning" }
  | { readonly type: "open-settings" }
  | { readonly type: "close-settings" }
  | { readonly type: "announce-time" }
  | { readonly type: "select-preset"; readonly minutes: PresetMinutes }
  | { readonly type: "set-custom"; readonly text: string }
  | { readonly type: "set-intent"; readonly text: string };

export type UiInput =
  | { readonly type: "action"; readonly action: UiAction }
  /** The engine phase changed (the candle burned out, the pause ran out, a reload); `typing` is true while a text field has focus. */
  | { readonly type: "engine"; readonly from: Phase; readonly to: Phase; readonly typing: boolean };

/** What to say through the live region. */
export type AnnounceRequest = "refusal" | "time";

export interface Effects {
  /** Engine events to dispatch, in order. Today 0 or 1: only `light`, `pause`, `resume` or `snuff`. */
  readonly events: readonly Event[];
  readonly announce: AnnounceRequest | null;
  /** `none` when focus stays where it is. */
  readonly focus: FocusTarget;
  /** Clear the intent field (after a successful Light). */
  readonly clearIntent: boolean;
}

const isRunning = (phase: Phase): boolean => phase === "lit" || phase === "paused";
const isEnded = (phase: Phase): boolean => phase === "burned-out" || phase === "snuffed";
const canLight = (phase: Phase): boolean => phase === "idle" || isEnded(phase);

const effects = (e: Partial<Effects> = {}): Effects => ({ events: [], announce: null, focus: "none", clearIntent: false, ...e });
const unchanged = (ui: UiState): { ui: UiState; effects: Effects } => ({ ui, effects: effects() });

/**
 * The UI state at page load. The default length selects the preset 15, 25 or 50, or, when it is another whole number,
 * the custom stop with the text of that number.
 */
export function initialUi(settings: { readonly defaultLength: number }): UiState {
  const preset = PRESET_LENGTHS_MIN.find((minutes) => minutes === settings.defaultLength);
  const length: LengthChoice =
    preset !== undefined ? { kind: "preset", minutes: preset } : { kind: "custom", text: String(settings.defaultLength) };
  return { length, intentText: "", overlay: "none", refusal: null, customTouched: false, returnFocus: "none", pendingFocus: null };
}

/**
 * One step of the UI state machine. `phase` is the engine's phase at the moment of the input. An input that is not valid for it
 * (a pause while idle, a second candle, a dialog answer with no dialog) returns the same `ui` and no effects.
 * Total and pure: equal inputs give equal outputs, and nothing is changed in place. No input ever produces a `tick`, `hide`,
 * `show` or `reload` event, and a `snuff` event comes only from `confirm-snuff` with the snuff dialog open.
 */
export function uiStep(ui: UiState, input: UiInput, phase: Phase): { ui: UiState; effects: Effects } {
  return input.type === "engine" ? onEngine(ui, input) : onAction(ui, input.action, phase);
}

function onAction(ui: UiState, action: UiAction, phase: Phase): { ui: UiState; effects: Effects } {
  switch (action.type) {
    case "light": {
      if (ui.overlay !== "none" || !canLight(phase)) return unchanged(ui);
      const request = lightRequest(ui.length, ui.intentText);
      if (!request.ok) {
        return {
          ui: { ...ui, refusal: request.reason, customTouched: true },
          effects: effects({ announce: "refusal", focus: "custom-length" }),
        };
      }
      return {
        ui: { ...ui, refusal: null, intentText: "" },
        effects: effects({ events: [request.event], focus: "pause-resume", clearIntent: true }),
      };
    }

    case "toggle-pause":
      if (ui.overlay !== "none" || !isRunning(phase)) return unchanged(ui);
      return { ui, effects: effects({ events: [{ type: phase === "lit" ? "pause" : "resume" }], focus: "pause-resume" }) };

    case "open-snuff":
      if (ui.overlay !== "none" || !isRunning(phase)) return unchanged(ui);
      return { ui: { ...ui, overlay: "snuff", returnFocus: "element" }, effects: effects({ focus: "keep-burning" }) };

    case "keep-burning":
      if (ui.overlay !== "snuff") return unchanged(ui);
      return { ui: { ...ui, overlay: "none" }, effects: effects({ focus: "restore" }) };

    case "confirm-snuff":
      if (ui.overlay !== "snuff") return unchanged(ui);
      // The snuff is sent only while the session still runs. Focus goes to Light once the phase has changed: the move is held
      // in `pendingFocus` and released by the `engine` input that reports the change.
      return {
        ui: { ...ui, overlay: "none", pendingFocus: "light" },
        effects: effects({ events: isRunning(phase) ? [{ type: "snuff" }] : [] }),
      };

    case "open-settings":
      if (ui.overlay !== "none") return unchanged(ui);
      return { ui: { ...ui, overlay: "settings", returnFocus: "element" }, effects: effects({ focus: "settings-first" }) };

    case "close-settings":
      if (ui.overlay !== "settings") return unchanged(ui);
      return { ui: { ...ui, overlay: "none", pendingFocus: null }, effects: effects({ focus: ui.pendingFocus ?? "settings-button" }) };

    case "announce-time":
      if (ui.overlay !== "none" || !isRunning(phase)) return unchanged(ui);
      return { ui, effects: effects({ announce: "time" }) };

    case "select-preset":
      if (ui.overlay === "snuff") return unchanged(ui);
      return { ui: { ...ui, length: { kind: "preset", minutes: action.minutes }, refusal: null }, effects: effects() };

    case "set-custom": {
      const valid = parseLength(action.text).ok;
      return {
        ui: { ...ui, length: { kind: "custom", text: action.text }, customTouched: true, refusal: valid ? null : ui.refusal },
        effects: effects(),
      };
    }

    case "set-intent":
      return { ui: { ...ui, intentText: action.text }, effects: effects() };
  }
}

function onEngine(ui: UiState, input: { readonly from: Phase; readonly to: Phase; readonly typing: boolean }): { ui: UiState; effects: Effects } {
  // The snuff dialog exists only while a session runs: any change that leaves `lit` and `paused` closes it, in the same step.
  const closeDialog = ui.overlay === "snuff" && !isRunning(input.to);
  const base: UiState = closeDialog ? { ...ui, overlay: "none" } : ui;

  // The candle burned out or the pause ran out: focus goes to Light, unless the user is typing (focus stays in the field)
  // or the settings panel is open (the move is held until it closes).
  if (isRunning(input.from) && isEnded(input.to)) {
    if (base.overlay === "settings") return { ui: { ...base, pendingFocus: "light" }, effects: effects() };
    if (input.typing) return { ui: { ...base, pendingFocus: null }, effects: effects() };
    return { ui: { ...base, pendingFocus: null }, effects: effects({ focus: "light" }) };
  }
  return base === ui ? unchanged(ui) : { ui: base, effects: effects() };
}
