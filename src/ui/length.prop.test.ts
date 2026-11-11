// P2 and P2b (controls-and-access R2.3, R2.4, R2.6): parsing the custom length, and the arrow keys of the chooser.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { lengthOf, nextChoice, parseLength } from "./length";
import type { ArrowKey, ChoiceIndex } from "./length";
import { PROP_PARAMS, arbLengthText, arbPadding, referenceLength } from "./test-kit";

describe("P2: length parsing (R2.4, R2.6)", () => {
  it("accepts exactly the trimmed texts of one to three ASCII digits worth 5 to 90, and returns that integer", () => {
    fc.assert(
      fc.property(arbLengthText, (text) => {
        const result = parseLength(text);
        const want = referenceLength(text);
        if (want === null) {
          expect(result.ok, JSON.stringify(text)).toBe(false);
        } else {
          expect(result).toEqual({ ok: true, minutes: want });
        }
      }),
      PROP_PARAMS,
    );
  });

  it("never returns a length outside 5 to 90, and gives the right reason when it refuses", () => {
    fc.assert(
      fc.property(arbLengthText, (text) => {
        const result = parseLength(text);
        if (result.ok) {
          expect(Number.isInteger(result.minutes)).toBe(true);
          expect(result.minutes).toBeGreaterThanOrEqual(5);
          expect(result.minutes).toBeLessThanOrEqual(90);
        } else if (result.reason === "range") {
          // Only digit strings of one to three digits can be out of range.
          expect(text.replace(/^[ \t]+|[ \t]+$/g, "")).toMatch(/^[0-9]{1,3}$/);
        } else if (result.reason === "empty") {
          expect(text.replace(/^[ \t]+|[ \t]+$/g, "")).toBe("");
        }
      }),
      PROP_PARAMS,
    );
  });

  it("round-trips every length from 5 to 90 through String, with or without padding, and every preset", () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 90 }), arbPadding, arbPadding, (n, before, after) => {
        expect(parseLength(String(n))).toEqual({ ok: true, minutes: n });
        expect(parseLength(`${before}${n}${after}`)).toEqual({ ok: true, minutes: n });
        expect(lengthOf({ kind: "custom", text: String(n) })).toEqual({ ok: true, minutes: n });
      }),
      PROP_PARAMS,
    );
    for (const minutes of [15, 25, 50] as const) expect(lengthOf({ kind: "preset", minutes })).toEqual({ ok: true, minutes });
  });

  it("refuses 0 to 4 and 91 to 999 as out of range", () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer({ min: 0, max: 4 }), fc.integer({ min: 91, max: 999 })), (n) => {
        expect(parseLength(String(n))).toEqual({ ok: false, reason: "range" });
      }),
      PROP_PARAMS,
    );
  });
});

describe("P2b: the arrow keys of the chooser (R2.3)", () => {
  const arbIndex = fc.constantFrom<ChoiceIndex>(0, 1, 2, 3);
  const arbKey = fc.constantFrom<ArrowKey>("ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown");

  it("stays on one of the four stops, and four presses of the same key come back to the start", () => {
    fc.assert(
      fc.property(arbIndex, arbKey, (index, key) => {
        const once = nextChoice(index, key);
        expect([0, 1, 2, 3]).toContain(once);
        expect(once).not.toBe(index);
        const four = nextChoice(nextChoice(nextChoice(once, key), key), key);
        expect(four).toBe(index);
      }),
      PROP_PARAMS,
    );
  });

  it("Left and Up undo Right and Down", () => {
    fc.assert(
      fc.property(arbIndex, (index) => {
        for (const forward of ["ArrowRight", "ArrowDown"] as const) {
          for (const back of ["ArrowLeft", "ArrowUp"] as const) {
            expect(nextChoice(nextChoice(index, forward), back)).toBe(index);
            expect(nextChoice(nextChoice(index, back), forward)).toBe(index);
          }
        }
      }),
      PROP_PARAMS,
    );
  });
});
