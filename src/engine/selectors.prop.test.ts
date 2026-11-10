// Property tests for the selectors (P5 and P11 are added in tasks 16 and 22).
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { waxFraction } from "./selectors";
import { PROP_PARAMS, arbSignedScript, arbT0, runScript } from "./test-kit";

describe("selector properties", () => {
  it("setup smoke: the wax fraction stays within [0, 1] at every step, even with a clock that moves backwards", () => {
    fc.assert(
      fc.property(arbT0, arbSignedScript, (t0, script) => {
        for (const entry of runScript(script, t0)) {
          const f = waxFraction(entry.after, entry.now);
          expect(f).toBeGreaterThanOrEqual(0);
          expect(f).toBeLessThanOrEqual(1);
        }
      }),
      PROP_PARAMS,
    );
  });
});
