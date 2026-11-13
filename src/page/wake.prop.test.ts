// Property test for the Wake_Delay (sound-and-title design 3.6, section 9). Property 8.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { pauseLeftMs, timeLeftMs } from "../engine";
import { PROP_PARAMS, arbAnyState } from "./test-kit";
import { nextWakeMs } from "./wake";

const arbNowOffset = fc.oneof(
  fc.integer({ min: -60_000, max: 3_600_000 }),
  fc.integer({ min: 0, max: 2_000 }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
);

describe("Feature: sound-and-title, Property 8: The wake delay is bounded and never passes the end", () => {
  it("is in (0, 1000] while lit or paused, at most the time (or allowance) left or 1, never 0, and null otherwise", () => {
    const seen = new Map<string, number>();
    let short = 0;
    fc.assert(
      fc.property(arbAnyState, arbNowOffset, ({ state, at }, offset) => {
        const now = at + offset;
        const wake = nextWakeMs(state, now);
        if (state.phase === "lit" || state.phase === "paused") {
          expect(wake).not.toBeNull();
          const w = wake ?? Number.NaN;
          expect(w).toBeGreaterThan(0);
          expect(w).toBeLessThanOrEqual(1000);
          expect(w).not.toBe(0);
          const left = state.phase === "lit" ? timeLeftMs(state, now) : pauseLeftMs(state, now);
          expect(w).toBeLessThanOrEqual(Math.max(left, 1));
          if (w < 1000) short++;
        } else {
          expect(wake).toBeNull();
        }
        seen.set(state.phase, (seen.get(state.phase) ?? 0) + 1);
      }),
      PROP_PARAMS,
    );
    for (const p of ["idle", "lit", "paused", "burned-out", "snuffed"]) expect(seen.get(p) ?? 0, p).toBeGreaterThanOrEqual(10);
    expect(short).toBeGreaterThanOrEqual(10);
  });
});
