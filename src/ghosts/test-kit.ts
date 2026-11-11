// Shared helpers for the ghosts' tests (ghosts-and-graveyard design 8.2). Imported only by tests, never by source: the purity
// test of this folder checks it. Arbitraries are added here by the task that first needs them.
import * as fc from "fast-check";
import { INITIAL_STATE, step } from "../engine";
import type { State } from "../engine";
import { arbT0 } from "../engine/test-kit";

export { PROP_PARAMS } from "../engine/test-kit";

/**
 * 0 to 40 away spans in milliseconds, oldest first: ordinary spans (up to an hour, with a weight on the 5 minutes where the size
 * reaches 1), zero, negative values, `NaN` and the infinities. The engine maps every one of them into [0.25, 1] (R9.2).
 * The full size range is asked for, so lists longer than the 12 slots are common and the overflow cases are really exercised.
 */
export const arbGhostSpans: fc.Arbitrary<number[]> = fc.array(
  fc.oneof(
    { weight: 6, arbitrary: fc.integer({ min: 0, max: 3_600_000 }) },
    { weight: 2, arbitrary: fc.integer({ min: 299_990, max: 300_010 }) },
    { weight: 1, arbitrary: fc.constant(0) },
    { weight: 1, arbitrary: fc.integer({ min: -3_600_000, max: -1 }) },
    { weight: 1, arbitrary: fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY) },
  ),
  { maxLength: 40, size: "max" },
);

/**
 * A running 90-minute session that has seen 0 to 20 distractions, each a hide and a show 0 to 2 minutes apart, 1 to 20 seconds
 * after the last event. It never burns out (at most 20 x 140 s), so the count is the number of pairs and often passes the 12
 * slots: the states where the label says "distractions" and where more ghosts exist than are drawn.
 */
export const arbDistractedState: fc.Arbitrary<State> = fc
  .tuple(arbT0, fc.array(fc.tuple(fc.integer({ min: 1_000, max: 20_000 }), fc.integer({ min: 0, max: 120_000 })), { maxLength: 20, size: "max" }))
  .map(([t0, pairs]) => {
    let now = t0;
    let state = step(INITIAL_STATE, { type: "light", length: 90 }, now);
    for (const [wait, away] of pairs) {
      now += wait;
      state = step(state, { type: "hide" }, now);
      now += away;
      state = step(state, { type: "show" }, now);
    }
    return state;
  });
