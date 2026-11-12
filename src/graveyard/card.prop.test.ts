// Property test for the Details_Card state machine and its marker (ghosts-and-graveyard design 8.4, D22). Property 15.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { NO_CARD, cardMarker, cardStep } from "./card";
import type { CardInput, CardState } from "./card";
import { PROP_PARAMS, arbCardInputs } from "./test-kit";

/** The reference model: the shown id, what showed it, and the focused id, kept as plain variables. */
interface Model {
  shown: string | null;
  by: "focus" | "hover" | "tap" | null;
  focused: string | null;
}

/** One step of the reference model, written from the requirements and not from card.ts. */
function modelStep(m: Model, input: CardInput): { model: Model; handled: boolean } {
  const next: Model = { ...m };
  let handled = false;
  switch (input.type) {
    case "focus": // R5.3
      next.shown = input.id;
      next.by = "focus";
      next.focused = input.id;
      break;
    case "blur":
      if (m.focused === input.id) next.focused = null;
      if (m.by === "focus" && m.shown === input.id) {
        next.shown = null;
        next.by = null;
      }
      break;
    case "hover": // R5.4, R5.5: the focus does not move
      next.shown = input.id;
      next.by = "hover";
      break;
    case "unhover":
      if (m.by === "hover" && m.shown === input.id) {
        next.shown = m.focused;
        next.by = m.focused === null ? null : "focus";
      }
      break;
    case "tap": // R5.6, R5.7
      if (m.shown === input.id) {
        next.shown = null;
        next.by = null;
      } else {
        next.shown = input.id;
        next.by = "tap";
      }
      break;
    case "tap-away": // R5.8
      next.shown = null;
      next.by = null;
      break;
    case "escape": // R5.14, R6.13, R6.14
      handled = m.shown !== null;
      next.shown = null;
      next.by = null;
      break;
    case "clear":
      next.shown = null;
      next.by = null;
      next.focused = null;
      break;
  }
  return { model: next, handled };
}

const START: Model = { shown: null, by: null, focused: null };

describe("Feature: ghosts-and-graveyard, Property 15: One card at most, shown by the rules", () => {
  it("every step obeys the card rules and matches the reference model", () => {
    const seenKinds = new Map<string, number>();
    let escapeShown = 0;
    let escapeNone = 0;
    let runs = 0;
    fc.assert(
      fc.property(arbCardInputs, (inputs) => {
        runs++;
        let state: CardState = NO_CARD;
        let model: Model = START;
        const named = new Set<string>();
        const kinds = new Set<string>();
        for (const input of inputs) {
          if ("id" in input) named.add(input.id);
          kinds.add(input.type);
          const before = state;
          const out = cardStep(state, input);
          const ref = modelStep(model, input);
          state = out.state;
          model = ref.model;

          // The shown id is a single id (or none), and it was named by some input so far (R5.9).
          expect(state.shown === null || typeof state.shown === "string").toBe(true);
          if (state.shown !== null) expect(named.has(state.shown)).toBe(true);

          // The marker (D22): at most one drawn item carries it, the one whose card is shown, and none when no card is shown or the
          // shown id is not drawn.
          for (const drawn of [named, new Set([...named].slice(1))]) {
            const marker = cardMarker(state, drawn);
            const marked = [...drawn].filter((id) => id === marker);
            expect(marked.length).toBeLessThanOrEqual(1);
            expect(marker).toBe(model.shown !== null && drawn.has(model.shown) ? model.shown : null);
          }

          // The state matches the reference model.
          expect(state.shown).toBe(model.shown);
          expect(state.focused).toBe(model.focused);
          expect(out.handled).toBe(ref.handled);

          switch (input.type) {
            case "hover": // R5.4, R5.5
              expect(state.focused).toBe(before.focused);
              expect(state.shown).toBe(input.id);
              break;
            case "tap": // R5.6, R5.7
              expect(state.shown).toBe(before.shown === input.id ? null : input.id);
              break;
            case "tap-away": // R5.8
              expect(state.shown).toBeNull();
              break;
            case "escape": // R5.14, R6.13, R6.14
              expect(state.shown).toBeNull();
              expect(out.handled).toBe(before.shown !== null);
              if (before.shown !== null) escapeShown++;
              else escapeNone++;
              break;
            case "focus": // R5.3
              expect(state.shown).toBe(input.id);
              expect(state.focused).toBe(input.id);
              break;
            case "clear":
              expect(state).toEqual(NO_CARD);
              break;
            default:
              break;
          }
          if (input.type !== "escape") expect(out.handled).toBe(false);
        }
        for (const k of kinds) seenKinds.set(k, (seenKinds.get(k) ?? 0) + 1);
        // An empty list leaves the start state.
        if (inputs.length === 0) expect(state).toEqual(NO_CARD);
      }),
      { ...PROP_PARAMS },
    );
    // Coverage guard: every input kind, and escape with and without a shown card, is met often enough.
    const need = Math.min(20, Math.floor(runs / 15));
    for (const kind of ["focus", "blur", "hover", "unhover", "tap", "tap-away", "escape", "clear"]) {
      expect(seenKinds.get(kind) ?? 0, `runs with ${kind}`).toBeGreaterThanOrEqual(need);
    }
    expect(escapeShown).toBeGreaterThanOrEqual(20);
    expect(escapeNone).toBeGreaterThanOrEqual(20);
  });
});
