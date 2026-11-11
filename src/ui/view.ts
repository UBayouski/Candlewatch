// The view model: everything the page shows, as plain data with the words already in it
// (controls-and-access R3.4, R4.4, R5.4, R7, R8.1, R14.1, R14.2; design 3.6, 7.1, 7.2).
// Pure: a state, the UI state, the settings, `now` and a placement in; the DOM layer only copies what comes out.
import {
  INTENT_MAX_CODE_POINTS,
  MAX_LENGTH_MIN,
  MIN_LENGTH_MIN,
  MS_PER_MINUTE,
  PRESET_LENGTHS_MIN,
  isBreak,
  pauseLeftMs,
  timeLeftMs,
} from "../engine";
import type { State } from "../engine";
import { STRINGS } from "../strings";
import type { Settings } from "../storage/settings";
import { fill, formatTime, spokenTime } from "./format";
import { lengthOf, parseLength } from "./length";
import type { ChoiceIndex, LengthChoice } from "./length";
import type { ControlName, Placement, Rect } from "./layout";
import { visibleControls } from "./layout";
import type { UiState } from "./ui-state";

/** What the view needs to know about the device, measured by the DOM layer (the pure modules never ask the browser). */
export interface ViewEnv {
  /** True when a mouse or another fine pointer is available (`any-pointer: fine`): keys are named in the first-visit line. */
  readonly finePointer: boolean;
}

/** The last minute: the status line says the flame gutters (when there is no intent to show). */
const LAST_MINUTE_MS = 60_000;

export type StatusKind = "refusal" | "instructions" | "idle" | "intent" | "lit" | "guttering" | "allowance" | "cools" | "burnedOut" | "snuffed";

export interface ViewModel {
  readonly phase: State["phase"];
  /** `mm:ss` (design 7.1). */
  readonly timeText: string;
  /** The same time in words, for the timer's accessible text. Empty when there is no time to say (an invalid custom length). */
  readonly timeWords: string;
  readonly status: { readonly kind: StatusKind; readonly text: string; readonly rect: Rect };
  /** The length chooser, the intent field and Light: `idle` and the ended phases. */
  readonly setupVisible: boolean;
  /** Pause or Resume and Let it go dark: `lit` and `paused`. */
  readonly runningVisible: boolean;
  /** Settings is a zone control and is always shown. */
  readonly settingsVisible: true;
  readonly light: { readonly label: string };
  readonly pause: { readonly label: string };
  readonly snuff: { readonly label: string };
  readonly settingsButton: { readonly label: string };
  readonly chooser: {
    readonly groupLabel: string;
    /** The three preset cells' accessible names, in the order of `PRESET_LENGTHS_MIN`. */
    readonly presetLabels: readonly string[];
    readonly customLabel: string;
    readonly customPlaceholder: string;
    readonly selected: ChoiceIndex;
    readonly customText: string;
    /** The custom text is not a valid length and the user has typed in it or pressed Light. */
    readonly customInvalid: boolean;
    /** The length message, or null. The wide layout shows it under the chooser; the compact layout shows it in the status line. */
    readonly error: string | null;
    /** The element that describes an invalid custom field: the message under the chooser (wide) or the status line (compact). */
    readonly describedBy: "length-error" | "status";
  };
  readonly intent: {
    readonly label: string;
    /** The visible hint in the empty field: the full label in the wide layout, a shorter one in the compact layout. */
    readonly placeholder: string;
    readonly text: string;
    readonly codePoints: number;
    readonly overLimit: boolean;
    /** "{n} of {max}", shown in the wide layout. */
    readonly counter: string;
    /** The short mark shown in the compact layout once the limit is passed. */
    readonly overLimitMark: string;
    readonly hint: string;
  };
  readonly overlay: UiState["overlay"];
  readonly settings: {
    readonly sound: { readonly checked: boolean; readonly label: string; readonly stateText: string };
    readonly ghosts: { readonly checked: boolean; readonly label: string; readonly stateText: string };
    readonly defaultLength: {
      readonly label: string;
      readonly value: number;
      readonly selected: ChoiceIndex;
      readonly customText: string;
    };
  };
  /** The visible controls in DOM order, which is the Tab order and the reading order (R10.6). */
  readonly tabOrder: readonly ControlName[];
  readonly placement: Placement;
}

const isRunning = (phase: State["phase"]): boolean => phase === "lit" || phase === "paused";

function stopOf(choice: LengthChoice): ChoiceIndex {
  if (choice.kind === "custom") return 3;
  const i = PRESET_LENGTHS_MIN.indexOf(choice.minutes);
  return (i < 0 ? 3 : i) as ChoiceIndex;
}

/** The time text and its words (design 7.1). */
function timeOf(state: State, ui: UiState, now: number): { text: string; words: string } {
  switch (state.phase) {
    case "lit":
    case "paused": {
      const left = timeLeftMs(state, now);
      return { text: formatTime(left), words: fill(STRINGS.time.timeLeft, { time: spokenTime(left) }) };
    }
    case "idle": {
      const chosen = lengthOf(ui.length);
      if (!chosen.ok) return { text: STRINGS.time.timeUnknown, words: "" };
      const ms = chosen.minutes * MS_PER_MINUTE;
      return { text: formatTime(ms), words: spokenTime(ms) };
    }
    case "burned-out":
    case "snuffed":
      return { text: formatTime(0), words: spokenTime(0) };
  }
}

/** The status line, first match wins (design 7.2). */
function statusOf(state: State, ui: UiState, now: number, wide: boolean, env: ViewEnv): { kind: StatusKind; text: string } {
  // In the wide layout the refusal stands under the chooser; the compact layout has no room there and says it in the status line.
  if (ui.refusal !== null && !wide) return { kind: "refusal", text: fill(STRINGS.status.lengthRange, { min: MIN_LENGTH_MIN, max: MAX_LENGTH_MIN }) };
  switch (state.phase) {
    case "idle":
      return state.history.length === 0
        ? { kind: "instructions", text: env.finePointer ? STRINGS.status.firstVisit : STRINGS.status.firstVisitTouch }
        : { kind: "idle", text: STRINGS.status.idle };
    case "lit":
      if (state.session.intent !== null) return { kind: "intent", text: state.session.intent };
      return timeLeftMs(state, now) <= LAST_MINUTE_MS
        ? { kind: "guttering", text: STRINGS.status.guttering }
        : { kind: "lit", text: STRINGS.status.lit };
    case "paused":
      return { kind: "allowance", text: fill(STRINGS.status.pauseLeft, { time: formatTime(pauseLeftMs(state, now)) }) };
    case "burned-out":
      return isBreak(state, now) ? { kind: "cools", text: STRINGS.status.cools } : { kind: "burnedOut", text: STRINGS.status.burnedOut };
    case "snuffed":
      return { kind: "snuffed", text: STRINGS.status.snuffed };
  }
}

function onOff(checked: boolean): string {
  return checked ? STRINGS.settings.on : STRINGS.settings.off;
}

/** What to show for this state, UI state, settings and moment. A pure function: equal arguments give equal views. */
export function viewOf(state: State, ui: UiState, settings: Settings, now: number, placement: Placement, env: ViewEnv, view: "room" | "graveyard" = "room"): ViewModel {
  const phase = state.phase;
  const running = isRunning(phase);
  const time = timeOf(state, ui, now);
  const wide = placement.mode === "wide";
  const status = statusOf(state, ui, now, wide, env);
  const codePoints = Array.from(ui.intentText).length;
  const preset = PRESET_LENGTHS_MIN.find((m) => m === settings.defaultLength);
  const defaultChoice: LengthChoice = preset !== undefined ? { kind: "preset", minutes: preset } : { kind: "custom", text: String(settings.defaultLength) };

  return {
    phase,
    timeText: time.text,
    timeWords: time.words,
    status: { ...status, rect: running ? placement.statusRunning : placement.statusResting },
    setupVisible: !running && view === "room",
    runningVisible: running,
    settingsVisible: true,
    light: { label: phase === "idle" ? STRINGS.light.light : STRINGS.light.again },
    pause: { label: phase === "paused" ? STRINGS.pause.resume : STRINGS.pause.pause },
    snuff: { label: STRINGS.snuff.open },
    settingsButton: { label: STRINGS.settings.open },
    chooser: {
      groupLabel: STRINGS.length.group,
      presetLabels: PRESET_LENGTHS_MIN.map((n) => fill(STRINGS.length.preset, { n })),
      customLabel: STRINGS.length.custom,
      customPlaceholder: STRINGS.length.placeholder,
      selected: stopOf(ui.length),
      customText: ui.length.kind === "custom" ? ui.length.text : "",
      customInvalid: ui.customTouched && ui.length.kind === "custom" && !parseLength(ui.length.text).ok,
      error: ui.refusal === null ? null : fill(STRINGS.status.lengthRange, { min: MIN_LENGTH_MIN, max: MAX_LENGTH_MIN }),
      describedBy: wide ? "length-error" : "status",
    },
    intent: {
      label: STRINGS.intent.label,
      placeholder: wide ? STRINGS.intent.label : STRINGS.intent.placeholderShort,
      text: ui.intentText,
      codePoints,
      overLimit: codePoints > INTENT_MAX_CODE_POINTS,
      counter: fill(STRINGS.intent.count, { n: codePoints, max: INTENT_MAX_CODE_POINTS }),
      overLimitMark: fill(STRINGS.intent.overLimit, { max: INTENT_MAX_CODE_POINTS }),
      hint: fill(STRINGS.intent.hint, { max: INTENT_MAX_CODE_POINTS }),
    },
    overlay: ui.overlay,
    settings: {
      sound: { checked: settings.sound, label: STRINGS.settings.sound, stateText: onOff(settings.sound) },
      ghosts: { checked: settings.ghosts, label: STRINGS.settings.ghosts, stateText: onOff(settings.ghosts) },
      defaultLength: {
        label: STRINGS.settings.defaultLength,
        value: settings.defaultLength,
        selected: stopOf(defaultChoice),
        customText: defaultChoice.kind === "custom" ? defaultChoice.text : "",
      },
    },
    tabOrder: visibleControls(placement, running)
      .map((c) => c.name)
      .filter((name) => view === "room" || name === "settings" || running),
    placement,
  };
}
