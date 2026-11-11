// P1 (controls-and-access R7.3, R9.1): the time text and the time in words, for every time.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatTime, spokenTime } from "./format";
import { PROP_PARAMS } from "./test-kit";

const MIN = 60_000;
const MAX_LENGTH_MS = 90 * MIN;

/** Times a candle can show, plus negatives, zero, the non-finite values and very large numbers. */
const arbMs = fc.oneof(
  { weight: 4, arbitrary: fc.integer({ min: 0, max: MAX_LENGTH_MS }) },
  { weight: 3, arbitrary: fc.double({ min: 0, max: MAX_LENGTH_MS, noNaN: true }) },
  { weight: 1, arbitrary: fc.integer({ min: -MAX_LENGTH_MS, max: 0 }) },
  { weight: 1, arbitrary: fc.integer({ min: 0, max: 1_000_000_000_000 }) },
  { weight: 1, arbitrary: fc.constantFrom(0, -0, NaN, Infinity, -Infinity, 1, 999, 1000, 1001, 0.0001) },
);

const secondsOfText = (text: string): number => {
  const [mm, ss] = text.split(":").map(Number);
  return (mm ?? NaN) * 60 + (ss ?? NaN);
};

describe("P1: the time text", () => {
  it("is mm:ss with at least two digits of minutes and seconds 00 to 59, for every time", () => {
    fc.assert(
      fc.property(arbMs, (ms) => {
        const text = formatTime(ms);
        expect(text).toMatch(/^\d{2,}:\d{2}$/);
        expect(Number(text.split(":")[1])).toBeLessThanOrEqual(59);
      }),
      PROP_PARAMS,
    );
  });

  it("is the time rounded up to whole seconds, and 00:00 exactly when the time is zero, negative or not finite", () => {
    fc.assert(
      fc.property(arbMs, (ms) => {
        const text = formatTime(ms);
        const positive = Number.isFinite(ms) && ms > 0;
        expect(text === "00:00").toBe(!positive);
        // Reading the text back gives the seconds the time rounds up to: the smallest whole number of seconds that covers it,
        // that is (s - 1) * 1000 < ms <= s * 1000 (not Math.ceil(ms / 1000), which underflows to 0 for 5e-324).
        const seconds = secondsOfText(text);
        if (positive) {
          expect((seconds - 1) * 1000).toBeLessThan(ms);
          expect(ms).toBeLessThanOrEqual(seconds * 1000);
        } else {
          expect(seconds).toBe(0);
        }
      }),
      PROP_PARAMS,
    );
  });

  it("never shows an earlier time for a later (larger) time left", () => {
    fc.assert(
      fc.property(arbMs, arbMs, (a, b) => {
        fc.pre(Number.isFinite(a) && Number.isFinite(b));
        const [hi, lo] = a >= b ? [a, b] : [b, a];
        expect(secondsOfText(formatTime(hi))).toBeGreaterThanOrEqual(secondsOfText(formatTime(lo)));
      }),
      PROP_PARAMS,
    );
  });

  it("shows a whole length exactly as that length (25 minutes is 25:00)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 90 }), (minutes) => {
        expect(formatTime(minutes * MIN)).toBe(`${String(minutes).padStart(2, "0")}:00`);
      }),
      PROP_PARAMS,
    );
  });

  it("is spoken with the same minutes and seconds as the text", () => {
    fc.assert(
      fc.property(arbMs, (ms) => {
        const text = formatTime(ms);
        const [minutes, seconds] = text.split(":").map(Number) as [number, number];
        const spoken = spokenTime(ms);
        const numbers = (spoken.match(/\d+/g) ?? []).map(Number);
        const expected = [...(minutes > 0 ? [minutes] : []), ...(seconds > 0 ? [seconds] : [])];
        expect(numbers).toEqual(expected.length > 0 ? expected : [0]);
        // The words agree with the numbers: singular for one, plural otherwise, and no unit that is zero.
        expect(/\bminutes?\b/.test(spoken)).toBe(minutes > 0);
        expect(/\b1 minute\b/.test(spoken)).toBe(minutes === 1);
        expect(/\bseconds?\b/.test(spoken)).toBe(seconds > 0 || minutes === 0);
        expect(/\b1 second\b/.test(spoken)).toBe(seconds === 1);
      }),
      PROP_PARAMS,
    );
  });
});
