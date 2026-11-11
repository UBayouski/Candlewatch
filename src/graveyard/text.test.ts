// ghosts-and-graveyard R4.3, R5.1, R5.2, R5.12, R5.13, R7.1, R7.2, R8.5, R8.8 to R8.10 (design 3.3): the words.
import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "../engine";
import { STRINGS } from "../strings";
import { indexHistory } from "./days";
import type { Indexed } from "./days";
import { cardLines, daysCountLine, itemName, moreText, stoneIntent, stonesCountLine } from "./text";
import { fixedOffsetDay } from "./test-kit";

const NOV_10 = Date.UTC(2026, 10, 10, 15, 0);
const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  startedAt: NOV_10 - 25 * 60_000,
  endedAt: NOV_10,
  lengthMin: 25,
  intent: "Write the essay",
  outcome: "snuffed",
  distractions: 3,
  timeAwayMs: 61_000,
  ...over,
});
const item = (e: HistoryEntry): Indexed => {
  const [first] = indexHistory([e], fixedOffsetDay(0));
  if (!first) throw new Error("no item");
  return first;
};

describe("the Item name (R7.1, R7.2)", () => {
  it('is the intent and the Carved_Date: "Write the essay, 10 Nov"', () => {
    expect(itemName(item(entry()))).toBe("Write the essay, 10 Nov");
  });

  it("uses the placeholder line for a null intent", () => {
    expect(itemName(item(entry({ intent: null })))).toBe(`${STRINGS.graveyard.noIntent}, 10 Nov`);
  });

  it("uses the placeholder line for an empty intent", () => {
    expect(itemName(item(entry({ intent: "" })))).toBe(`${STRINGS.graveyard.noIntent}, 10 Nov`);
  });

  it("names the unknown date when the key is not a date", () => {
    expect(itemName({ ...item(entry()), dayKey: "0000-00-00" })).toBe(`Write the essay, ${STRINGS.graveyard.unknownDate}`);
  });

  it("keeps the intent exactly as written", () => {
    const odd = '  <b>"x"</b> & {n} {date}  ';
    expect(stoneIntent(entry({ intent: odd }))).toBe(odd);
    expect(itemName(item(entry({ intent: odd })))).toBe(`${odd}, 10 Nov`);
  });
});

describe("stoneIntent (R4.3, R5.2)", () => {
  it("is the intent, or the placeholder when it is null or empty", () => {
    expect(stoneIntent(entry({ intent: "Read" }))).toBe("Read");
    expect(stoneIntent(entry({ intent: null }))).toBe(STRINGS.graveyard.noIntent);
    expect(stoneIntent(entry({ intent: "" }))).toBe(STRINGS.graveyard.noIntent);
  });
});

describe("cardLines (R5.1, R5.12, R5.13)", () => {
  it("gives exactly five lines for a known entry: planned 25 minutes, 3 distractions, time away 1:01", () => {
    expect(cardLines(item(entry()))).toEqual([
      "Write the essay",
      "10 Nov",
      "Planned: 25 minutes",
      "Distractions: 3",
      "Time away: 1 minute 1 second",
    ]);
  });

  it("says 1 minute, in the singular, for a one-minute session", () => {
    expect(cardLines(item(entry({ lengthMin: 1 })))[2]).toBe("Planned: 1 minute");
  });

  it("gives the placeholder as the first line for a null intent", () => {
    const lines = cardLines(item(entry({ intent: null })));
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe(STRINGS.graveyard.noIntent);
  });

  it("states the distractions as plain digits, never in words", () => {
    for (const n of [0, 1, 2, 14, 1000]) expect(cardLines(item(entry({ distractions: n })))[3]).toBe(`Distractions: ${n}`);
  });

  it("states no time of day in the date line, and the time away in words", () => {
    const lines = cardLines(item(entry({ timeAwayMs: 0 })));
    expect(lines[1]).not.toMatch(/:/);
    expect(lines[4]).toBe("Time away: 0 seconds");
    expect(cardLines(item(entry({ timeAwayMs: 3_600_000 })))[4]).toBe("Time away: 60 minutes");
  });

  it("gives the same text for equal inputs", () => {
    expect(cardLines(item(entry()))).toEqual(cardLines(item(entry())));
  });
});

describe("the count lines (R8.8 to R8.10)", () => {
  it("are null for 0: a missing value, not an empty string", () => {
    expect(stonesCountLine(0)).toBeNull();
    expect(daysCountLine(0)).toBeNull();
    expect(moreText(0)).toBeNull();
  });

  it("say the exact number, in the singular for 1", () => {
    expect(stonesCountLine(1)).toBe(`1 older stone not shown`);
    expect(stonesCountLine(38)).toBe("38 older stones not shown");
    expect(daysCountLine(1)).toBe("1 older day not shown");
    expect(daysCountLine(12)).toBe("12 older days not shown");
  });

  it("are null for what is not a count: negative, NaN, infinite", () => {
    for (const bad of [-1, -0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(stonesCountLine(bad), String(bad)).toBeNull();
      expect(daysCountLine(bad), String(bad)).toBeNull();
      expect(moreText(bad), String(bad)).toBeNull();
    }
  });

  it("read a fraction as its whole part, and below 1 as nothing", () => {
    expect(stonesCountLine(2.9)).toBe("2 older stones not shown");
    expect(stonesCountLine(0.9)).toBeNull();
  });

  it('gives "+3 more" for 3 hidden stubs, and the same text each time', () => {
    expect(moreText(3)).toBe("+3 more");
    expect(moreText(1)).toBe("+1 more");
    expect(moreText(3)).toBe(moreText(3));
  });
});
