// Property tests for the ghost selectors: D8 (distraction-tracking design.md section 10.4).
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GHOST_FULL_SIZE_MS, GHOST_MIN_SIZE } from "./constants";
import { distractionCount, ghostSize, ghostSpansMs } from "./ghosts";
import { PROP_PARAMS, arbT0, arbVisibilityScript, runScript } from "./test-kit";
import { INITIAL_STATE } from "./types";

describe("D8: ghost selectors", () => {
  const arbSpan = fc.oneof(
    fc.integer({ min: 0, max: 3_600_000 }),
    fc.double({ min: 0, max: 3_600_000, noNaN: true }),
    fc.integer({ min: GHOST_FULL_SIZE_MS - 5, max: GHOST_FULL_SIZE_MS + 5 }),
  );

  it("ghostSize is in [0.25, 1], is 0.25 at span 0, never decreases, and is 1 from 5 minutes on", () => {
    fc.assert(
      fc.property(arbSpan, arbSpan, (x, y) => {
        const [a, b] = x <= y ? [x, y] : [y, x];
        expect(ghostSize(a)).toBeGreaterThanOrEqual(GHOST_MIN_SIZE);
        expect(ghostSize(a)).toBeLessThanOrEqual(1);
        expect(ghostSize(a)).toBeLessThanOrEqual(ghostSize(b));
        if (a >= GHOST_FULL_SIZE_MS) expect(ghostSize(a)).toBe(1);
      }),
      PROP_PARAMS,
    );
    expect(ghostSize(0)).toBe(0.25);
    expect(ghostSize(GHOST_FULL_SIZE_MS)).toBe(1);
    expect(ghostSpansMs(INITIAL_STATE)).toEqual([]);
  });

  it("every state has one ghost span per distraction, summing to the total time away", () => {
    fc.assert(
      fc.property(arbT0, arbVisibilityScript, (t0, script) => {
        for (const { after } of runScript(script, t0)) {
          const spans = ghostSpansMs(after);
          expect(spans.length).toBe(distractionCount(after));
          if (after.phase === "idle") {
            expect(spans).toEqual([]);
            expect(distractionCount(after)).toBe(0);
          } else {
            expect(spans.reduce((a, b) => a + b, 0)).toBe(after.session.timeAwayMs);
            expect(spans.every((s) => ghostSize(s) >= GHOST_MIN_SIZE)).toBe(true); // every counted ghost is visible
          }
        }
      }),
      PROP_PARAMS,
    );
  });
});
