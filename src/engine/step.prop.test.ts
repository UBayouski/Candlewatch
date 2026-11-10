// Property tests for `step` (P1, P2, P3, P4, P7, P9, P10 are added in tasks 12 to 15 and 18 to 21).
import * as fc from "fast-check";
import { describe, it } from "vitest";
import { PROP_PARAMS, arbT0, arbWildScript, assertInvariants, runScript } from "./test-kit";

describe("step properties", () => {
  it("setup smoke: every state of a generated run, including invalid steps, satisfies the invariants", () => {
    fc.assert(
      fc.property(arbT0, arbWildScript, (t0, script) => {
        for (const entry of runScript(script, t0)) assertInvariants(entry.after);
      }),
      PROP_PARAMS,
    );
  });
});
