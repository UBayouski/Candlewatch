// Property tests for serialization: P6 and P8 (design.md section 8.2).
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "./constants";
import {
  parseHistory,
  readHistory,
  restoreState,
  serializeHistory,
  serializeSession,
} from "./serialize";
import { step } from "./step";
import { PROP_PARAMS, arbEntry, arbHistory, arbScript, arbT0, runScript } from "./test-kit";
import { parseEntry } from "./validate";

const HOUR = 3_600_000;

describe("P6: history JSON round trip", () => {
  it("serialize then parse is the identity, for arbitrary intents, and the JSON carries the version", () => {
    fc.assert(
      fc.property(arbHistory, (h) => {
        const text = serializeHistory(h);
        expect(parseHistory(text)).toStrictEqual(h);
        expect((JSON.parse(text) as { v: number }).v).toBe(SCHEMA_VERSION);
        expect(readHistory(text).status).toBe("ok");
      }),
      PROP_PARAMS,
    );
  });

  it("parsing arbitrary text never throws and always returns an array", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.json(), fc.string().map((s) => JSON.stringify(s))), (text) => {
        expect(Array.isArray(parseHistory(text))).toBe(true);
      }),
      PROP_PARAMS,
    );
  });

  it("injected invalid entries are dropped and the valid ones come back unchanged, in order", () => {
    const arbJunk = fc
      .oneof(
        fc.anything(),
        arbEntry.map((e) => ({ ...e, lengthMin: 4 })),
        arbEntry.map((e) => ({ ...e, endedAt: e.startedAt - 1 })),
        arbEntry.map((e) => ({ ...e, outcome: "lost" })),
        arbEntry.map((e) => ({ ...e, startedAt: 1.5 })),
      )
      .filter((j) => parseEntry(j) === null);

    fc.assert(
      fc.property(arbHistory, fc.array(arbJunk, { maxLength: 20 }), fc.array(fc.nat(60), { maxLength: 20 }), (h, junk, at) => {
        const mixed: unknown[] = [...h];
        junk.forEach((j, i) => {
          mixed.splice((at[i] ?? 0) % (mixed.length + 1), 0, j);
        });
        const text = JSON.stringify({ v: SCHEMA_VERSION, entries: mixed });
        expect(parseHistory(text)).toStrictEqual(h);
      }),
      PROP_PARAMS,
    );
  });
});

describe("P8: reload equals tick", () => {
  const arbLater = fc.array(fc.integer({ min: 0, max: 6 * HOUR }), { minLength: 60, maxLength: 60 });

  it("restoring a serialized state gives it back, and reload at T equals tick at T", () => {
    fc.assert(
      fc.property(arbT0, arbScript, arbLater, (t0, script, laters) => {
        runScript(script, t0).forEach(({ after, now }, i) => {
          if (after.phase === "idle" || after.phase === "snuffed") return; // running states and the break window
          const restored = restoreState(serializeSession(after), serializeHistory(after.history));
          expect(restored).toStrictEqual(after);
          const T = now + (laters[i] ?? 0);
          expect(step(after, { type: "reload", state: restored }, T)).toStrictEqual(step(after, { type: "tick" }, T));
        });
      }),
      PROP_PARAMS,
    );
  });
});
