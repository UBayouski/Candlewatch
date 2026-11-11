// Property tests for serialization: P6 and P8 (session-engine design.md section 8.2), D6 (distraction-tracking).
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { HISTORY_SCHEMA_VERSION } from "./constants";
import {
  parseHistory,
  readHistory,
  readSession,
  restoreState,
  serializeHistory,
  serializeSession,
} from "./serialize";
import { step } from "./step";
import {
  PROP_PARAMS,
  arbEntry,
  arbHistory,
  arbScript,
  arbT0,
  arbVisibilityScript,
  runScript,
} from "./test-kit";
import type { State } from "./types";
import { parseEntry } from "./validate";

const HOUR = 3_600_000;

describe("P6: history JSON round trip", () => {
  it("serialize then parse is the identity, for arbitrary intents, and the JSON carries the version", () => {
    fc.assert(
      fc.property(arbHistory, (h) => {
        const text = serializeHistory(h);
        expect(parseHistory(text)).toStrictEqual(h);
        expect((JSON.parse(text) as { v: number }).v).toBe(HISTORY_SCHEMA_VERSION);
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
        const text = JSON.stringify({ v: HISTORY_SCHEMA_VERSION, entries: mixed });
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

describe("D6: serialization with the new fields", () => {
  const doc = (s: State): Record<string, unknown> => JSON.parse(serializeSession(s) ?? "null") as Record<string, unknown>;
  const sessionOf = (d: Record<string, unknown>): Record<string, unknown> => d["session"] as Record<string, unknown>;

  it("restore of serialize is the identity, open hide and spans included, and reload at T equals tick at T", () => {
    fc.assert(
      fc.property(
        arbT0,
        arbVisibilityScript,
        fc.array(fc.integer({ min: 0, max: 6 * HOUR }), { minLength: 60, maxLength: 60 }),
        (t0, script, laters) => {
          runScript(script, t0).forEach(({ after, now }, i) => {
            const restored = restoreState(serializeSession(after), serializeHistory(after.history));
            expect(restored).toStrictEqual(after);
            const T = now + (laters[i] ?? 0);
            expect(step(after, { type: "reload", state: restored }, T)).toStrictEqual(step(after, { type: "tick" }, T));
          });
        },
      ),
      PROP_PARAMS,
    );
  });

  it("a version 1 rewrite of a state with no distractions and no open hide restores to the same state", () => {
    fc.assert(
      fc.property(arbT0, arbVisibilityScript, (t0, script) => {
        for (const { after } of runScript(script, t0)) {
          if (after.phase === "idle") continue;
          if (after.session.distractions !== 0) continue;
          if (after.phase === "lit" && after.awaySince !== null) continue;
          const d = doc(after);
          delete sessionOf(d)["awaySpansMs"];
          delete d["awaySince"];
          d["v"] = 1;
          expect(restoreState(JSON.stringify(d), serializeHistory(after.history))).toStrictEqual(after);
        }
      }),
      PROP_PARAMS,
    );
  });

  type Mutation =
    | "spans-missing"
    | "spans-not-array"
    | "negative-span"
    | "extra-span"
    | "sum-mismatch"
    | "count-mismatch"
    | "awaySince-not-lit"
    | "awaySince-before-litSince";

  const MUTATIONS: readonly Mutation[] = [
    "spans-missing",
    "spans-not-array",
    "negative-span",
    "extra-span",
    "sum-mismatch",
    "count-mismatch",
    "awaySince-not-lit",
    "awaySince-before-litSince",
  ];

  /** Corrupts one new field. Returns false when the mutation does not apply to this phase. */
  function corrupt(d: Record<string, unknown>, phase: State["phase"], m: Mutation): boolean {
    const session = sessionOf(d);
    const spans = session["awaySpansMs"] as number[];
    switch (m) {
      case "spans-missing":
        delete session["awaySpansMs"]; // a version 2 document must carry the list, even when empty
        return true;
      case "spans-not-array":
        session["awaySpansMs"] = "30000";
        return true;
      case "negative-span":
        spans.push(-5);
        return true;
      case "extra-span":
        spans.push(7);
        return true;
      case "sum-mismatch":
        session["timeAwayMs"] = (session["timeAwayMs"] as number) + 1;
        return true;
      case "count-mismatch":
        session["distractions"] = (session["distractions"] as number) + 1;
        return true;
      case "awaySince-not-lit":
        if (phase === "lit") return false;
        d["awaySince"] = 1_000_000_000_000;
        return true;
      case "awaySince-before-litSince":
        if (phase !== "lit") return false;
        d["awaySince"] = (d["litSince"] as number) - 1;
        return true;
    }
  }

  it("corrupting one new field never throws and gives idle with the history intact", () => {
    fc.assert(
      fc.property(arbT0, arbVisibilityScript, fc.constantFrom(...MUTATIONS), (t0, script, mutation) => {
        for (const { after } of runScript(script, t0)) {
          if (after.phase === "idle") continue;
          const d = doc(after);
          if (!corrupt(d, after.phase, mutation)) continue;
          const text = JSON.stringify(d);
          expect(() => restoreState(text, serializeHistory(after.history))).not.toThrow();
          expect(readSession(text)).toEqual({ state: null, status: "unreadable" });
          expect(restoreState(text, serializeHistory(after.history))).toStrictEqual({
            phase: "idle",
            history: after.history,
          });
        }
      }),
      PROP_PARAMS,
    );
  });
});
