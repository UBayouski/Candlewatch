// Property 6 (ghosts-and-graveyard design 8.4): the graveyard's UI-only inputs never reach the engine.
import * as fc from "fast-check";
import { describe, expect, expectTypeOf, it } from "vitest";
import { distractionCount, ghostSpansMs, serializeHistory, serializeSession } from "../engine";
import type { State } from "../engine";
import { arbScript, arbT0, arbVisibilityScript, runScript } from "../engine/test-kit";
import { arbDistractedState } from "../ghosts/test-kit";
import { visibleGhosts } from "../ghosts/visible";
import { cardStep } from "./card";
import type { CardInput, CardState } from "./card";
import { navigate, remember, tabStops } from "./focus";
import type { FocusMemory, GroupId, NavLayout } from "./focus";
import { graveKeyAction } from "./keys";
import type { GraveKeyAction, GraveKeyContext } from "./keys";
import { PROP_PARAMS, arbCardInputs, arbGraveKey, arbNavLayout, arbViewScript, fixedOffsetDay } from "./test-kit";
import { NO_CARD } from "./card";
import { NO_MEMORY } from "./focus";
import { viewStep } from "./view";
import type { View, ViewFocus, ViewInput } from "./view";
import { visibleHistory } from "./visible";

/** Freezes a value and everything inside it, so any write to it throws (the test files are strict-mode modules). */
function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

/** What a stored session and history look like: the strings the storage adapter would write. */
const stored = (state: State): { session: string | null; history: string } => ({ session: serializeSession(state), history: serializeHistory(state.history) });

/** Engine scripts of every kind of event, and scripts heavy in hides and shows, so that sessions have distractions and ghost spans. */
const arbAnyScript = fc.oneof(arbScript, arbVisibilityScript);
const arbGroup = fc.constantFrom<GroupId>("graveyard", "shelf");
const arbOverlay = fc.constantFrom<GraveKeyContext["overlay"]>("none", "none", "none", "snuff", "settings");
const arbFocus = fc.constantFrom<GraveKeyContext["focus"]>("body", "button", "text", "other");

describe("Feature: ghosts-and-graveyard, Property 6: UI-only inputs never change the engine state", () => {
  it("leaves the engine state, its stored session and its stored history exactly as they were, after any mix of UI-only inputs", () => {
    fc.assert(
      fc.property(
        arbT0,
        arbAnyScript,
        arbDistractedState,
        arbViewScript,
        arbCardInputs,
        arbNavLayout,
        fc.array(fc.tuple(arbGroup, fc.nat(30), fc.constantFrom("ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End" as const)), { maxLength: 12 }),
        fc.array(fc.tuple(arbGraveKey, arbOverlay, arbFocus, fc.boolean(), fc.option(arbGroup, { nil: null })), { maxLength: 12 }),
        fc.array(fc.boolean(), { maxLength: 6 }),
        (t0, script, distracted, views, cards, layout, navs, keys, ghostToggles) => {
          // The engine script alone, and the same script again whose states are deep-frozen and then hammered by the UI inputs.
          const alone = runScript(script, t0);
          const hammered = runScript(script, t0);
          expect(hammered).toHaveLength(alone.length);

          // The states of the script, and one session that has been distracted on purpose (ghost spans, a count past the slots).
          [...hammered.map((entry) => entry.after), distracted].forEach((after, at) => {
            const state = deepFreeze(after);
            const before = structuredClone(state);
            const storedBefore = stored(state);
            const counts = { spans: [...ghostSpansMs(state)], count: distractionCount(state) };

            // The view switch, with the phase the page would send.
            let view: View = "room";
            for (const input of views) view = viewStep(view, input).view;
            view = viewStep(view, { type: "phase", phase: state.phase }).view;

            // The card state machine and the roving focus.
            let card: CardState = NO_CARD;
            for (const input of cards) card = cardStep(card, input).state;
            let memory: FocusMemory = NO_MEMORY;
            for (const [group, pick, key] of navs) {
              const ids = group === "graveyard" ? layout.graveyard : layout.shelf.flat();
              const current = ids[pick % Math.max(1, ids.length)] ?? "unknown";
              memory = remember(memory, group, navigate(layout, group, current, key));
            }
            tabStops(layout, memory);

            // The graveyard's key map, in the state's own phase.
            for (const [key, overlay, focus, cardShown, onItem] of keys) {
              const context: GraveKeyContext = { view, phase: state.phase, overlay, focus, cardShown, onItem };
              graveKeyAction(context, key);
            }

            // Ghosts on and off, and what is drawn from the state's spans and history: all reads.
            for (const on of ghostToggles) visibleGhosts(ghostSpansMs(state), on ? 12 : 0);
            visibleHistory(state.history, { S: 10, D: 3, K: 4, dayKeyOf: fixedOffsetDay(0) });

            // Nothing moved: the same state, the same stored forms, the same ghost data.
            expect(state, `state ${at}`).toEqual(before);
            expect(stored(state)).toEqual(storedBefore);
            expect([...ghostSpansMs(state)]).toEqual(counts.spans);
            expect(distractionCount(state)).toBe(counts.count);
          });

          // The final state after the hammered run is the final state of the run alone, and so are the stored forms.
          const last = (trace: typeof alone): State | undefined => trace[trace.length - 1]?.after;
          const [a, b] = [last(alone), last(hammered)];
          expect(b).toEqual(a);
          if (a !== undefined && b !== undefined) expect(stored(b)).toEqual(stored(a));
        },
      ),
      PROP_PARAMS,
    );
  });

  it("is a matter of types too: none of the UI-only functions takes or returns an engine value", () => {
    // Inputs and outputs are the UI's own types. The one engine-derived value they read is a phase name (a string), never a State.
    expectTypeOf(viewStep).parameters.toEqualTypeOf<[View, ViewInput]>();
    expectTypeOf(viewStep).returns.toEqualTypeOf<{ view: View; focus: ViewFocus }>();
    expectTypeOf(cardStep).parameters.toEqualTypeOf<[CardState, CardInput]>();
    expectTypeOf(cardStep).returns.toEqualTypeOf<{ state: CardState; handled: boolean }>();
    expectTypeOf(navigate).parameters.toEqualTypeOf<[NavLayout, GroupId, string, "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End"]>();
    expectTypeOf(navigate).returns.toEqualTypeOf<string>();
    expectTypeOf(remember).returns.toEqualTypeOf<FocusMemory>();
    expectTypeOf(tabStops).returns.toEqualTypeOf<FocusMemory>();
    expectTypeOf(graveKeyAction).returns.toEqualTypeOf<GraveKeyAction | null>();
    expectTypeOf<GraveKeyContext["phase"]>().toEqualTypeOf<State["phase"]>();
    expectTypeOf<State>().not.toMatchTypeOf<CardState>();
    expectTypeOf<ReturnType<typeof cardStep>["state"]>().not.toMatchTypeOf<State>();
    expect(true).toBe(true);
  });

  it("really does see states with history and distractions, so the freezing and the stored forms are not empty", () => {
    let withHistory = 0;
    let withSpans = 0;
    fc.assert(
      fc.property(arbT0, arbAnyScript, arbDistractedState, (t0, script, distracted) => {
        for (const { after } of runScript(script, t0)) if (after.history.length > 0) withHistory++;
        if (ghostSpansMs(distracted).length > 0) withSpans++;
      }),
      PROP_PARAMS,
    );
    expect(withHistory).toBeGreaterThan(50);
    expect(withSpans).toBeGreaterThan(150);
  });
});
