// Property tests for serialization (P6 and P8 are added in tasks 17 and 19).
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { restoreState, serializeHistory, serializeSession } from "./serialize";
import { PROP_PARAMS, arbScript, arbT0, runScript } from "./test-kit";

describe("serialization properties", () => {
  it("setup smoke: every state of a generated run survives a serialize and restore round trip", () => {
    fc.assert(
      fc.property(arbT0, arbScript, (t0, script) => {
        for (const entry of runScript(script, t0)) {
          const s = entry.after;
          expect(restoreState(serializeSession(s), serializeHistory(s.history))).toStrictEqual(s);
        }
      }),
      PROP_PARAMS,
    );
  });
});
