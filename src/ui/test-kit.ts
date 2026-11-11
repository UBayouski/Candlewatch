// Shared helpers for the interface's tests (controls-and-access design 1.3). Imported only by tests, never by source:
// src/ui/purity.test.ts checks it. Arbitraries are added here by the task that first needs them.
import * as fc from "fast-check";
import { INITIAL_STATE, step } from "../engine";
import { DEFAULT_SETTINGS } from "../storage/settings";
import type { Event, State } from "../engine";
import { arbGap, assertInvariants } from "../engine/test-kit";
import { keyAction } from "./keys";
import type { FocusKind, KeyContext, KeyDescriptor } from "./keys";
import { initialUi, uiStep } from "./ui-state";
import type { UiAction, UiState } from "./ui-state";

export { PROP_PARAMS } from "../engine/test-kit";

const digits = (min: number, max: number): fc.Arbitrary<string> =>
  fc.array(fc.constantFrom("0", "1", "2", "3", "4", "5", "6", "7", "8", "9"), { minLength: min, maxLength: max }).map((d) => d.join(""));
export const arbPadding = fc.array(fc.constantFrom(" ", "\t"), { maxLength: 3 }).map((p) => p.join(""));
const foreignDigits = fc.array(fc.constantFrom("٠", "١", "٢", "٥", "٩", "０", "２", "５", "９"), { minLength: 1, maxLength: 3 }).map((d) => d.join(""));

/** Texts a user can put in the custom length field: digit strings, padded, signed, decimal, exponent, hex, other scripts, noise. */
export const arbLengthText: fc.Arbitrary<string> = fc.oneof(
  { weight: 5, arbitrary: digits(0, 5) },
  { weight: 4, arbitrary: fc.tuple(arbPadding, digits(0, 4), arbPadding).map(([a, d, b]) => a + d + b) },
  { weight: 2, arbitrary: fc.tuple(fc.constantFrom("+", "-", "–"), digits(1, 3)).map(([s, d]) => s + d) },
  { weight: 2, arbitrary: fc.tuple(digits(1, 3), digits(1, 2)).map(([a, b]) => `${a}.${b}`) },
  { weight: 2, arbitrary: fc.tuple(digits(1, 2), digits(1, 2)).map(([a, b]) => `${a}e${b}`) },
  { weight: 1, arbitrary: fc.tuple(digits(1, 2), digits(1, 2)).map(([a, b]) => `${a} ${b}`) },
  { weight: 1, arbitrary: fc.constantFrom("0x19", "0x5A", "25.", ".5", "1,5", "25m", "1_0", "\n", "25\n", "\u00A025", "Infinity", "NaN") },
  { weight: 2, arbitrary: foreignDigits },
  { weight: 2, arbitrary: fc.string({ unit: "grapheme", maxLength: 6 }) },
);

/**
 * An independent reading of requirements R2.4, written character by character instead of with the code's regular expression:
 * the length a custom text stands for, or null when it is not one to three ASCII digits worth 5 to 90 after trimming spaces and tabs.
 */
export function referenceLength(text: string): number | null {
  let from = 0;
  let to = text.length;
  while (from < to && (text.charAt(from) === " " || text.charAt(from) === "\t")) from++;
  while (to > from && (text.charAt(to - 1) === " " || text.charAt(to - 1) === "\t")) to--;
  const core = text.slice(from, to);
  if (core.length < 1 || core.length > 3) return null;
  let value = 0;
  for (const ch of core) {
    const code = ch.charCodeAt(0);
    if (code < 48 || code > 57) return null;
    value = value * 10 + (code - 48);
  }
  return value >= 5 && value <= 90 ? value : null;
}

/** Whatever a person can type or paste in the intent field: Unicode, line breaks, emoji, white space, long text, lone surrogates. */
export const arbIntentText: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.string({ unit: "grapheme", maxLength: 120 }) },
  { weight: 2, arbitrary: fc.string({ unit: "binary", maxLength: 120 }) },
  {
    weight: 4,
    arbitrary: fc
      .array(fc.constantFrom(" ", "\t", "\n", "\r\n", "\u2028", "\u2029", "\u00A0", "a", "word", "é", "\u65E5\u672C", "\u{1F600}", '"', "\\"), { maxLength: 160 })
      .map((parts) => parts.join("")),
  },
  { weight: 1, arbitrary: fc.integer({ min: 70, max: 100 }).map((n) => "\u{1F600}".repeat(n)) },
  { weight: 1, arbitrary: fc.constantFrom("", " ", "   ", "\n", "\t \n") },
);

// --- keys (task 11) ---------------------------------------------------------

export const arbPhase = fc.constantFrom<State["phase"]>("idle", "lit", "paused", "burned-out", "snuffed");
export const arbFocusKind = fc.constantFrom<FocusKind>("body", "text", "button", "other");
export const arbOverlay = fc.constantFrom<KeyContext["overlay"]>("none", "snuff", "settings");

/** The keys the map knows, the keys it must ignore, and any single character. */
const arbKeyName = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom("Enter", " ", "Escape", "t", "T") },
  { weight: 3, arbitrary: fc.constantFrom("Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Backspace", "Delete", "Home", "End", "Shift", "Control", "Alt", "Meta", "F5") },
  { weight: 2, arbitrary: fc.string({ unit: "grapheme", minLength: 1, maxLength: 1 }) },
);

export const arbKeyDescriptor: fc.Arbitrary<KeyDescriptor> = fc.record({
  key: arbKeyName,
  ctrl: fc.boolean(),
  alt: fc.boolean(),
  meta: fc.boolean(),
  shift: fc.boolean(),
  repeat: fc.boolean(),
});

/** A key press with no Ctrl, Alt or Meta and no repeat: the case where the map has something to say. */
export const arbPlainKey: fc.Arbitrary<KeyDescriptor> = arbKeyDescriptor.map((k) => ({ ...k, ctrl: false, alt: false, meta: false, repeat: false }));

export const arbKeyContext: fc.Arbitrary<KeyContext> = fc.record({ phase: arbPhase, overlay: arbOverlay, focus: arbFocusKind });

// --- UI scripts (tasks 13 and 14) -------------------------------------------

export type UiOp =
  | { readonly kind: "key"; readonly key: KeyDescriptor; readonly focus: FocusKind }
  | { readonly kind: "action"; readonly action: UiAction }
  | { readonly kind: "tick" };

export interface UiOpStep {
  readonly gap: number;
  readonly op: UiOp;
  /** Whether a text field has focus when the engine phase changes on its own. */
  readonly typing: boolean;
}

export interface UiWorld {
  readonly engine: State;
  readonly ui: UiState;
}

export interface UiTraceEntry {
  readonly step: UiOpStep;
  readonly now: number;
  readonly before: UiWorld;
  readonly after: UiWorld;
  /** The action the op stood for (a key press may stand for none). */
  readonly action: UiAction | null;
  /** The events the UI sent, each with the engine phase it was sent in. */
  readonly sent: readonly { readonly event: Event; readonly phase: State["phase"] }[];
}

export const arbUiAction: fc.Arbitrary<UiAction> = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom<UiAction>(
    { type: "light" }, { type: "toggle-pause" }, { type: "open-snuff" }, { type: "confirm-snuff" }, { type: "keep-burning" },
    { type: "open-settings" }, { type: "close-settings" }, { type: "announce-time" },
  ) },
  { weight: 2, arbitrary: fc.constantFrom<15 | 25 | 50>(15, 25, 50).map((minutes): UiAction => ({ type: "select-preset", minutes })) },
  { weight: 2, arbitrary: arbLengthText.map((text): UiAction => ({ type: "set-custom", text })) },
  { weight: 1, arbitrary: arbIntentText.map((text): UiAction => ({ type: "set-intent", text })) },
);

const arbKeyOp: fc.Arbitrary<UiOp> = fc.record({ kind: fc.constant("key" as const), key: arbKeyDescriptor, focus: arbFocusKind });

export const arbUiOp: fc.Arbitrary<UiOp> = fc.oneof(
  { weight: 4, arbitrary: arbUiAction.map((action): UiOp => ({ kind: "action", action })) },
  { weight: 4, arbitrary: arbKeyOp },
  { weight: 3, arbitrary: fc.constant<UiOp>({ kind: "tick" }) },
);

/** Actions that must never change the engine: no Light, Pause, Resume or confirmed snuff. */
const NEUTRAL_TYPES: readonly UiAction["type"][] = [
  "open-snuff", "keep-burning", "open-settings", "close-settings", "announce-time", "select-preset", "set-custom", "set-intent",
];
export const isNeutral = (action: UiAction | null): boolean => action === null || NEUTRAL_TYPES.includes(action.type);

/** Keys that never Light, Pause or Resume (no Enter, no Space): Escape, t, Tab, letters, with any modifier. */
const arbQuietKeyOp: fc.Arbitrary<UiOp> = fc.record({
  kind: fc.constant("key" as const),
  key: arbKeyDescriptor.chain((k) => fc.constantFrom("Escape", "t", "T", "Tab", "a", "ArrowDown").map((key) => ({ ...k, key }))),
  focus: arbFocusKind,
});

export const arbNeutralOp: fc.Arbitrary<UiOp> = fc.oneof(
  arbUiAction.filter((a) => isNeutral(a)).map((action): UiOp => ({ kind: "action", action })),
  arbQuietKeyOp,
);

export const arbUiScript: fc.Arbitrary<UiOpStep[]> = fc.array(
  fc.record({ gap: arbGap, op: arbUiOp, typing: fc.boolean() }),
  { maxLength: 60 },
);

/** Mostly the controls that act (Light, Pause, Resume, the snuff dialog, Space, Enter, Escape) with short gaps, so scripts reach every phase. */
const arbControlOp: fc.Arbitrary<UiOp> = fc.oneof(
  { weight: 5, arbitrary: fc.constantFrom<UiAction>({ type: "light" }, { type: "toggle-pause" }, { type: "open-snuff" }, { type: "confirm-snuff" }, { type: "keep-burning" }).map((action): UiOp => ({ kind: "action", action })) },
  { weight: 5, arbitrary: fc.record({ kind: fc.constant("key" as const), key: arbPlainKey.chain((k) => fc.constantFrom("Enter", " ", "Escape", "t").map((key) => ({ ...k, key }))), focus: arbFocusKind }) },
  { weight: 1, arbitrary: fc.constant<UiOp>({ kind: "tick" }) },
);

export const arbControlScript: fc.Arbitrary<UiOpStep[]> = fc.array(
  fc.record({ gap: fc.oneof(fc.integer({ min: 0, max: 5_000 }), fc.integer({ min: 0, max: 900_000 })), op: arbControlOp, typing: fc.boolean() }),
  { maxLength: 60 },
);

const isRunning = (phase: State["phase"]): boolean => phase === "lit" || phase === "paused";

/** Feeds the UI the engine's phase change, as main.ts will after every engine step. */
export function afterEngineStep(ui: UiState, from: State["phase"], to: State["phase"], typing: boolean): UiState {
  return from === to ? ui : uiStep(ui, { type: "engine", from, to, typing }, to).ui;
}

/**
 * Plays a UI script the way main.ts will: a key goes through `keyAction`, the action through `uiStep`, its events through the engine
 * at the script's now, and a phase change is reported back with an `engine` input. A `tick` op ticks the engine. Never reads a clock.
 */
export function runUiScript(steps: readonly UiOpStep[], t0: number, defaultLength = 25): UiTraceEntry[] {
  const trace: UiTraceEntry[] = [];
  let world: UiWorld = { engine: INITIAL_STATE, ui: initialUi({ ...DEFAULT_SETTINGS, defaultLength }) };
  let now = t0;
  for (const s of steps) {
    now += s.gap;
    const before = world;
    let { engine, ui } = world;
    let action: UiAction | null = null;
    const sent: { event: Event; phase: State["phase"] }[] = [];
    if (s.op.kind === "tick") {
      engine = step(engine, { type: "tick" }, now);
    } else {
      action =
        s.op.kind === "key"
          ? keyAction({ phase: engine.phase, overlay: ui.overlay, focus: s.op.focus }, s.op.key)
          : s.op.action;
      if (action !== null) {
        const r = uiStep(ui, { type: "action", action }, engine.phase);
        ui = r.ui;
        for (const event of r.effects.events) {
          sent.push({ event, phase: engine.phase });
          engine = step(engine, event, now);
        }
      }
    }
    ui = afterEngineStep(ui, before.engine.phase, engine.phase, s.typing);
    world = { engine, ui };
    trace.push({ step: s, now, before, after: world, action, sent });
  }
  return trace;
}

/** Whether the engine accepts the event in the phase (the UI must never send one it would refuse). */
export function validInPhase(event: Event, phase: State["phase"]): boolean {
  switch (event.type) {
    case "light": return !isRunning(phase);
    case "pause": return phase === "lit";
    case "resume": return phase === "paused";
    case "snuff": return isRunning(phase);
    default: return false;
  }
}

export { assertInvariants };