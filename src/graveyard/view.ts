// The Door and the view switch (ghosts-and-graveyard design 3.7, R3). Pure: no engine value goes in or out. The view, the card
// state and the focus memory are the "UI-only inputs" of P8 of controls-and-access (R3.16, CR4).
import type { State } from "../engine";

export type View = "room" | "graveyard";

/** The pure door model: what the Door is in a phase. `shut` is always `!usable` (R3.1, R3.2, R3.5, R3.6). */
export interface DoorView {
  /** The Door is a button that opens the view. */
  readonly usable: boolean;
  /** The Door is drawn as a closed door and is not focusable. */
  readonly shut: boolean;
}

export function doorView(phase: State["phase"]): DoorView {
  const usable = phase === "idle" || phase === "burned-out" || phase === "snuffed";
  return { usable, shut: !usable };
}

/** The Door is usable only when no candle burns (R3.1, R3.2). */
export function doorUsable(phase: State["phase"]): boolean {
  return doorView(phase).usable;
}

export type ViewInput =
  | { readonly type: "open"; readonly phase: State["phase"] }
  | { readonly type: "leave" }
  | { readonly type: "phase"; readonly phase: State["phase"] };

/** Where focus goes after the step (CR3). */
export type ViewFocus = "first-group" | "door" | "none";

/**
 * `open` in the Room with a usable Door gives the Graveyard_View and `first-group`; in every other case it changes nothing
 * (R3.3, R3.7). `leave` in the Graveyard_View gives the Room and `door` (R3.14); in the Room it changes nothing. `phase` forces the
 * Room when the Door is not usable (R3.12) and changes nothing otherwise: `main.ts` sends it every frame, so the switch happens in
 * the frame the phase changes (R3.5, R3.6, R3.10). The initial view is `"room"` on every page load (R3.11).
 */
export function viewStep(view: View, input: ViewInput): { view: View; focus: ViewFocus } {
  switch (input.type) {
    case "open":
      return view === "room" && doorUsable(input.phase) ? { view: "graveyard", focus: "first-group" } : { view, focus: "none" };
    case "leave":
      return view === "graveyard" ? { view: "room", focus: "door" } : { view, focus: "none" };
    case "phase":
      return doorUsable(input.phase) ? { view, focus: "none" } : { view: "room", focus: "none" };
  }
}
