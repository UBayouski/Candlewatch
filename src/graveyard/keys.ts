// The graveyard key map (ghosts-and-graveyard design 3.8; R3.3, R3.13, R6.7 to R6.17, Decisions D7, D13). Pure: no DOM, no clock.
// `null` means "no action": the DOM layer then leaves the browser's own handling of the key alone.
import type { State } from "../engine";
import type { FocusKind, KeyDescriptor } from "../ui/keys";
import type { GroupId, NavKey } from "./focus";
import { doorUsable } from "./view";
import type { View } from "./view";

export interface GraveKeyContext {
  readonly view: View;
  readonly phase: State["phase"];
  readonly overlay: "none" | "snuff" | "settings";
  readonly focus: FocusKind;
  readonly cardShown: boolean;
  /** The Group of the focused item, or null when focus is not on an item. */
  readonly onItem: GroupId | null;
}

export type GraveKeyAction =
  | { readonly type: "open" }
  | { readonly type: "leave" }
  | { readonly type: "hide-card" }
  | { readonly type: "show-card" }
  | { readonly type: "nav"; readonly key: NavKey };

const OPEN: GraveKeyAction = { type: "open" };
const LEAVE: GraveKeyAction = { type: "leave" };
const HIDE_CARD: GraveKeyAction = { type: "hide-card" };
const SHOW_CARD: GraveKeyAction = { type: "show-card" };

/** Narrows a key value to the keys of the roving focus. */
function navKey(key: string): NavKey | null {
  switch (key) {
    case "ArrowLeft":
    case "ArrowRight":
    case "ArrowUp":
    case "ArrowDown":
    case "Home":
    case "End":
      return key;
    default:
      return null;
  }
}

/**
 * The action for a key press, or `null`.
 * - Ctrl, Alt, Meta and the repeats of a held key do nothing, like the Room map. Shift changes nothing.
 * - With an overlay open nothing applies, so the Settings panel keeps Escape.
 * - `g` (or `G`, as the Room map takes `t` and `T`) is the Door's key: open in the Room when the Door is usable, leave in the
 *   graveyard; never with a text field focused, never with a shut Door.
 * - In the Room nothing else is claimed: Escape still opens the snuff dialog and the arrows stay with the length chooser.
 * - In the graveyard: Escape hides a shown card, else leaves; arrows, Home and End move the roving focus when an item has it
 *   (Up and Down mean nothing on a Stone); Enter on an item shows its card; Enter elsewhere keeps its native activation.
 */
export function graveKeyAction(context: GraveKeyContext, key: KeyDescriptor): GraveKeyAction | null {
  if (key.ctrl || key.alt || key.meta || key.repeat) return null;
  if (context.overlay !== "none") return null;
  const { view, phase, focus, cardShown, onItem } = context;

  if (key.key === "g" || key.key === "G") {
    if (focus === "text") return null;
    if (view === "graveyard") return LEAVE;
    return doorUsable(phase) ? OPEN : null;
  }
  if (view === "room") return null;

  if (key.key === "Escape") return cardShown ? HIDE_CARD : LEAVE;
  if (onItem === null) return null;
  if (key.key === "Enter") return SHOW_CARD;
  const nav = navKey(key.key);
  if (nav === null) return null;
  if (onItem === "graveyard" && (nav === "ArrowUp" || nav === "ArrowDown")) return null;
  return { type: "nav", key: nav };
}
