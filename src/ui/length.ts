// Choosing a length: parsing the custom text, the chosen length, and the arrow keys of the chooser
// (controls-and-access R2.1, R2.3, R2.4; design 3.2). Pure: no clock, no DOM.
import { MAX_LENGTH_MIN, MIN_LENGTH_MIN, PRESET_LENGTHS_MIN } from "../engine";

export type PresetMinutes = (typeof PRESET_LENGTHS_MIN)[number];

/** What the chooser holds: one of the presets, or the text typed in the custom field. */
export type LengthChoice =
  | { readonly kind: "preset"; readonly minutes: PresetMinutes }
  | { readonly kind: "custom"; readonly text: string };

export type LengthResult =
  | { readonly ok: true; readonly minutes: number }
  | { readonly ok: false; readonly reason: "empty" | "format" | "range" };

/** The four stops of the chooser, in reading order: 15, 25, 50, custom. */
export type ChoiceIndex = 0 | 1 | 2 | 3;
export type ArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/**
 * Accepts exactly the text that, after trimming spaces and tabs, is one to three ASCII digits worth `MIN_LENGTH_MIN` to
 * `MAX_LENGTH_MIN` (5 to 90). Leading zeros are allowed (`025` is 25). Empty text (or only spaces) is `empty`; anything
 * that is not one to three ASCII digits is `format` (signs, decimals, exponents, other scripts' digits, inner spaces);
 * digits outside the range are `range`. It never uses `Number(text)` on the raw text, which would accept `+25`, `2e1` and `0x19`.
 */
export function parseLength(text: string): LengthResult {
  const trimmed = text.replace(/^[ \t]+|[ \t]+$/g, "");
  if (trimmed === "") return { ok: false, reason: "empty" };
  if (!/^[0-9]{1,3}$/.test(trimmed)) return { ok: false, reason: "format" };
  const minutes = Number(trimmed);
  if (minutes < MIN_LENGTH_MIN || minutes > MAX_LENGTH_MIN) return { ok: false, reason: "range" };
  return { ok: true, minutes };
}

/** The length a choice stands for: a preset is always valid, custom text goes through `parseLength`. */
export function lengthOf(choice: LengthChoice): LengthResult {
  return choice.kind === "preset" ? { ok: true, minutes: choice.minutes } : parseLength(choice.text);
}

/** The arrow keys of a radio group over four stops: Left and Up go to the previous stop, Right and Down to the next, wrapping around. */
export function nextChoice(index: ChoiceIndex, key: ArrowKey): ChoiceIndex {
  const step = key === "ArrowLeft" || key === "ArrowUp" ? 3 : 1;
  return ((index + step) % 4) as ChoiceIndex;
}
