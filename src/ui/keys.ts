// The key map: which key does what, given the phase, the open overlay and what has the focus
// (controls-and-access R5.2, R5.3, R6.1, R6.4, R9.5, R10.2, R10.3; design 3.4). Pure: no DOM, no clock.
// `null` means "no action": the DOM layer then leaves the browser's own handling of the key alone.
import type { State } from "../engine";

/** A key press as the DOM layer describes it. `key` is the `KeyboardEvent.key` value: "Enter", " " (Space), "Escape", "t", "T". */
export interface KeyDescriptor {
  readonly key: string;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
  /** True for the repeats of a held key. */
  readonly repeat: boolean;
}

/**
 * What has the focus, as far as keys care:
 * - `body`: the document, or a non-interactive element;
 * - `text`: a text field (the intent, the custom length), where a letter or a space is typed;
 * - `button`: a button, switch, radio, link or select, which Space and Enter already activate (the Pause and Resume button included);
 * - `other`: anything else focusable.
 */
export type FocusKind = "body" | "text" | "button" | "other";

export interface KeyContext {
  readonly phase: State["phase"];
  readonly overlay: "none" | "snuff" | "settings";
  readonly focus: FocusKind;
}

/** What a key can do. There is no snuff here: a key only ever opens the dialog (design 3.4). */
export type KeyAction =
  | { readonly type: "light" }
  | { readonly type: "toggle-pause" }
  | { readonly type: "open-snuff" }
  | { readonly type: "keep-burning" }
  | { readonly type: "close-settings" }
  | { readonly type: "announce-time" };

const LIGHT: KeyAction = { type: "light" };
const TOGGLE_PAUSE: KeyAction = { type: "toggle-pause" };
const OPEN_SNUFF: KeyAction = { type: "open-snuff" };
const KEEP_BURNING: KeyAction = { type: "keep-burning" };
const CLOSE_SETTINGS: KeyAction = { type: "close-settings" };
const ANNOUNCE_TIME: KeyAction = { type: "announce-time" };

/**
 * The action for a key press, or `null`.
 * - A key held with Ctrl, Alt or Meta does nothing, so browser and assistive-technology shortcuts keep working. Shift changes nothing.
 * - The repeats of a held key do nothing, so a held Space cannot pause and resume in a loop and a held Escape does not open the
 *   dialog and close it again.
 * - Escape closes an open overlay (Keep burning for the snuff dialog), else opens the snuff dialog while a session runs.
 * - With an overlay open nothing else applies.
 * - Enter lights outside buttons; Space pauses or resumes outside text fields and buttons; `t` announces the time while a
 *   session runs, never with a text field focused (so the letter can be typed).
 */
export function keyAction(context: KeyContext, key: KeyDescriptor): KeyAction | null {
  if (key.ctrl || key.alt || key.meta || key.repeat) return null;
  const { phase, overlay, focus } = context;
  const running = phase === "lit" || phase === "paused";

  if (key.key === "Escape") {
    if (overlay === "snuff") return KEEP_BURNING;
    if (overlay === "settings") return CLOSE_SETTINGS;
    return running ? OPEN_SNUFF : null;
  }
  if (overlay !== "none") return null;

  switch (key.key) {
    case "Enter":
      return !running && focus !== "button" ? LIGHT : null;
    case " ":
      return running && (focus === "body" || focus === "other") ? TOGGLE_PAUSE : null;
    case "t":
    case "T":
      return running && focus !== "text" ? ANNOUNCE_TIME : null;
    default:
      return null;
  }
}
