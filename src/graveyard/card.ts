// The Details_Card state machine (ghosts-and-graveyard design 3.6, R5). Pure: one card at most, shown by the rules, and a hover
// never moves keyboard focus.

export interface CardState {
  /** The id whose card is shown, or null (R5.9: at most one). */
  readonly shown: string | null;
  readonly source: "focus" | "hover" | "tap" | null;
  /** The id with keyboard focus inside a Group, or null. */
  readonly focused: string | null;
}

export type CardInput =
  | { readonly type: "focus"; readonly id: string } // keyboard focus (not a pointer's)
  | { readonly type: "blur"; readonly id: string }
  | { readonly type: "hover"; readonly id: string } // mouse enters
  | { readonly type: "unhover"; readonly id: string } // mouse leaves
  | { readonly type: "tap"; readonly id: string } // touch or pen
  | { readonly type: "tap-away" } // touch elsewhere
  | { readonly type: "escape" }
  | { readonly type: "clear" }; // the view closed or the items were rebuilt

export const NO_CARD: CardState = { shown: null, source: null, focused: null };

/**
 * `focus` shows the item and sets `focused` (R5.3). `blur` clears `focused` when it was that id, and hides a card that was shown
 * by that focus. `hover` shows without touching `focused` (R5.4, R5.5); `unhover` of a hover-shown card falls back to the focused
 * item (source `focus`) or to nothing. `tap` toggles (R5.6, R5.7) and `tap-away` hides (R5.8). `escape` hides a shown card and
 * reports `handled = true` (R5.14, R6.13), else reports `false` so the caller leaves the view (R6.14). `clear` returns `NO_CARD`.
 * A shown id is only ever one that an input named, and only one id is shown (R5.9).
 */
export function cardStep(state: CardState, input: CardInput): { state: CardState; handled: boolean } {
  const done = (next: CardState, handled = false): { state: CardState; handled: boolean } => ({ state: next, handled });
  switch (input.type) {
    case "focus":
      return done({ shown: input.id, source: "focus", focused: input.id });
    case "blur": {
      const focused = state.focused === input.id ? null : state.focused;
      const hide = state.source === "focus" && state.shown === input.id;
      return done(hide ? { shown: null, source: null, focused } : { ...state, focused });
    }
    case "hover":
      return done({ shown: input.id, source: "hover", focused: state.focused });
    case "unhover": {
      if (state.source !== "hover" || state.shown !== input.id) return done(state);
      return done(state.focused !== null ? { shown: state.focused, source: "focus", focused: state.focused } : { shown: null, source: null, focused: null });
    }
    case "tap":
      return done(state.shown === input.id ? { shown: null, source: null, focused: state.focused } : { shown: input.id, source: "tap", focused: state.focused });
    case "tap-away":
      return done({ shown: null, source: null, focused: state.focused });
    case "escape":
      return state.shown === null ? done(state, false) : done({ shown: null, source: null, focused: state.focused }, true);
    case "clear":
      return done(NO_CARD);
  }
}
