// Property tests for the scene label (ghosts-and-graveyard design 8.4). Property 21.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { INITIAL_STATE, distractionCount, ghostSpansMs } from "../engine";
import type { State } from "../engine";
import { arbT0, arbVisibilityScript, runScript } from "../engine/test-kit";
import { STRINGS } from "../strings";
import { sceneLabel } from "./label";
import type { SceneMode } from "./label";
import { GHOST_SLOTS } from "./slots";
import { PROP_PARAMS, arbDistractedState } from "./test-kit";
import { visibleGhosts } from "./visible";

const MODES = Object.keys(STRINGS.scene) as SceneMode[];

/** States from random scripts of every kind of event, and states that were distracted on purpose. */
const arbStates: fc.Arbitrary<State[]> = fc.oneof(
  fc.tuple(arbT0, arbVisibilityScript).map(([t0, script]) => [INITIAL_STATE, ...runScript(script, t0).map((entry) => entry.after)]),
  arbDistractedState.map((state) => [state]),
);

describe("Feature: ghosts-and-graveyard, Property 21: The scene label always gives the engine count", () => {
  it("states the engine's count in decimal digits and the right word, never the time, whatever the ghost setting and G", () => {
    fc.assert(
      fc.property(arbStates, fc.constantFrom(...MODES), fc.boolean(), fc.oneof(fc.constant(GHOST_SLOTS.length), fc.integer({ min: 0, max: 20 })), (states, mode, ghosts, G) => {
        for (const state of states) {
          const count = distractionCount(state);
          const label = sceneLabel(mode, count);

          // The count and the word: "<digits> distraction" for 1, "<digits> distractions" otherwise.
          expect(label).toBe(`${STRINGS.scene[mode]} ${count} ${count === 1 ? "distraction" : "distractions"}.`);
          expect(label).toMatch(new RegExp(`(?:^|\\D)${count} distractions?\\.$`));
          expect(/\bdistractions\b/.test(label)).toBe(count !== 1);

          // No mm:ss time of any kind.
          expect(label).not.toMatch(/\d{1,2}:\d{2}/);

          // The label is the engine's count, not the number of ghosts drawn: with ghosts off (G read as 0) or capped at G, the
          // ghosts drawn plus the ghosts hidden still add up to the engine's count, and the label does not change.
          const plan = visibleGhosts(ghostSpansMs(state), ghosts ? G : 0);
          expect(plan.drawn.length + plan.hidden).toBe(count);
          expect(sceneLabel(mode, plan.drawn.length + plan.hidden)).toBe(label);
        }
      }),
      PROP_PARAMS,
    );
  });

  it("reaches every case it claims: zero, one, several, and more distractions than the 12 slots", () => {
    const seen = new Set<string>();
    fc.assert(
      fc.property(arbStates, (states) => {
        for (const state of states) {
          const count = distractionCount(state);
          seen.add(count === 0 ? "zero" : count === 1 ? "one" : count <= GHOST_SLOTS.length ? "several" : "over the slots");
        }
      }),
      PROP_PARAMS,
    );
    expect([...seen].sort()).toEqual(["one", "over the slots", "several", "zero"]);
  });
});
