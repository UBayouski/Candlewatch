// Property tests for the graveyard's words (ghosts-and-graveyard design 8.4). Properties 3, 11 and 18.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "../engine";
import { STRINGS } from "../strings";
import { spokenTime } from "../ui/format";
import { formatCarvedDate, indexHistory } from "./days";
import { PROP_PARAMS, arbDayKeyFn, arbEntry } from "./test-kit";
import { cardLines, daysCountLine, itemName, moreText, stoneIntent, stonesCountLine } from "./text";

describe("Feature: ghosts-and-graveyard, Property 3: The carved date comes from the end day", () => {
  it("is formatCarvedDate(dayKeyOf(endedAt)) in the Item name and on the card, with no time of day", () => {
    fc.assert(
      fc.property(arbEntry, arbDayKeyFn, (entry, dayKeyOf) => {
        const [item] = indexHistory([entry], dayKeyOf);
        if (!item) throw new Error("no item");
        const date = formatCarvedDate(dayKeyOf(entry.endedAt));

        // The Item name is the intent (or its placeholder), the separator of the template and the date: nothing else follows the intent.
        const intent = stoneIntent(entry);
        const name = itemName(item);
        expect(name.startsWith(intent)).toBe(true);
        expect(name.slice(intent.length)).toBe(`, ${date}`);

        // The card's second line is the date, and the date is not built from the start.
        expect(cardLines(item)[1]).toBe(date);
        const [moved] = indexHistory([{ ...entry, startedAt: entry.startedAt - 86_400_000 * 40 }], dayKeyOf);
        expect(moved && cardLines(moved)[1]).toBe(date);
        expect(moved && itemName(moved)).toBe(name);

        // The date is the day of the key and the short month of the key, written out here from the key's own characters.
        const key = dayKeyOf(entry.endedAt);
        expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(date).toBe(`${Number(key.slice(8, 10))} ${STRINGS.graveyard.months[Number(key.slice(5, 7)) - 1]}`);

        // No time of day: no colon, no am or pm, no digits beyond the day of the month.
        expect(date).not.toContain(":");
        expect(date).not.toMatch(/\b[ap]\.?m\.?\b/i);
        expect(date).toMatch(/^\d{1,2} [A-Z][a-z]{2}$/);
      }),
      PROP_PARAMS,
    );
  });

  it("gives the unknown date, and still no time of day, for an instant no calendar can name", () => {
    fc.assert(
      fc.property(arbEntry, fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY), arbDayKeyFn, (entry, bad, dayKeyOf) => {
        const [item] = indexHistory([{ ...entry, endedAt: bad }], dayKeyOf);
        if (!item) throw new Error("no item");
        expect(cardLines(item)[1]).toBe(STRINGS.graveyard.unknownDate);
        expect(itemName(item).endsWith(`, ${STRINGS.graveyard.unknownDate}`)).toBe(true);
      }),
      PROP_PARAMS,
    );
  });
});

describe("Feature: ghosts-and-graveyard, Property 11: Count lines state the exact hidden number", () => {
  /** A hidden count: a few small numbers, ordinary ones and large ones, always including 1 and 2. */
  const arbHidden = fc.oneof(
    { weight: 2, arbitrary: fc.constantFrom(1, 2, 3, 10, 11, 38, 100, 1000) },
    { weight: 4, arbitrary: fc.integer({ min: 1, max: 60 }) },
    { weight: 2, arbitrary: fc.integer({ min: 1, max: 5_000_000 }) },
  );
  /** The text of a template with the count written in by hand. */
  const written = (template: string, n: number): string => template.replace("{n}", String(n));
  const digitsOnly = (text: string, n: number): boolean => new RegExp(`(?:^|\\D)${n}(?:\\D|$)`).test(text);

  it("writes the exact number in decimal digits, in the one-form only for 1", () => {
    fc.assert(
      fc.property(arbHidden, (n) => {
        const stones = stonesCountLine(n);
        const days = daysCountLine(n);
        const more = moreText(n);
        for (const line of [stones, days, more]) {
          expect(line).not.toBeNull();
          expect(digitsOnly(line ?? "", n), `${line} holds ${n}`).toBe(true);
        }
        expect(stones).toBe(written(n === 1 ? STRINGS.graveyard.olderStone : STRINGS.graveyard.olderStones, n));
        expect(days).toBe(written(n === 1 ? STRINGS.graveyard.olderDay : STRINGS.graveyard.olderDays, n));
        expect(more).toBe(written(STRINGS.graveyard.more, n));
        // Plain digits: no grouping separator, no exponent, no sign.
        for (const line of [stones, days, more]) expect(line ?? "").not.toMatch(/\d[,.\s_']\d|e\+|\d-/);
      }),
      PROP_PARAMS,
    );
  });

  it("uses a different wording for 1 than for every other count", () => {
    expect(STRINGS.graveyard.olderStone).not.toBe(STRINGS.graveyard.olderStones);
    expect(STRINGS.graveyard.olderDay).not.toBe(STRINGS.graveyard.olderDays);
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 5_000_000 }), (n) => {
        expect(stonesCountLine(n)).not.toBe(written(STRINGS.graveyard.olderStone, n));
        expect(daysCountLine(n)).not.toBe(written(STRINGS.graveyard.olderDay, n));
      }),
      PROP_PARAMS,
    );
    expect(stonesCountLine(1)).toBe(written(STRINGS.graveyard.olderStone, 1));
    expect(daysCountLine(1)).toBe(written(STRINGS.graveyard.olderDay, 1));
  });

  it("is null for 0, and for what is not a positive count", () => {
    expect(stonesCountLine(0)).toBeNull();
    expect(daysCountLine(0)).toBeNull();
    expect(moreText(0)).toBeNull();
    fc.assert(
      fc.property(fc.oneof(fc.integer({ min: -5_000_000, max: 0 }), fc.double({ min: -100, max: 0.999, noNaN: true }), fc.constantFrom(Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)), (n) => {
        expect(stonesCountLine(n)).toBeNull();
        expect(daysCountLine(n)).toBeNull();
        expect(moreText(n)).toBeNull();
      }),
      PROP_PARAMS,
    );
  });
});

describe("Feature: ghosts-and-graveyard, Property 18: The card text and the Item name equal the entry", () => {
  /** Entries as stored, and the odd ones: no intent, an empty intent, a one-minute session, a long time away. */
  const arbCardEntry: fc.Arbitrary<HistoryEntry> = fc.oneof(
    { weight: 4, arbitrary: arbEntry },
    { weight: 1, arbitrary: arbEntry.map((e) => ({ ...e, intent: null })) },
    { weight: 1, arbitrary: arbEntry.map((e) => ({ ...e, intent: "" })) },
    { weight: 1, arbitrary: arbEntry.map((e) => ({ ...e, lengthMin: 1 })) },
    { weight: 1, arbitrary: arbEntry.map((e) => ({ ...e, timeAwayMs: e.timeAwayMs * 1000 + 3_599_000 })) },
  );
  const fillTemplate = (template: string, values: Record<string, string>): string => template.replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole);

  it("has five lines holding, in order, the intent or its placeholder, the date, the length, the distractions and the time away", () => {
    fc.assert(
      fc.property(arbCardEntry, arbDayKeyFn, (entry, dayKeyOf) => {
        const [item] = indexHistory([entry], dayKeyOf);
        if (!item) throw new Error("no item");
        const lines = cardLines(item);
        const intent = typeof entry.intent === "string" && entry.intent !== "" ? entry.intent : STRINGS.graveyard.noIntent;
        const date = formatCarvedDate(dayKeyOf(entry.endedAt));

        expect(lines).toHaveLength(5);
        expect(lines[0]).toBe(intent);
        expect(lines[1]).toBe(date);
        // The length in whole minutes, singular for 1 only; the distractions as plain digits; the time away in words.
        const minutes = fillTemplate(entry.lengthMin === 1 ? STRINGS.time.minute : STRINGS.time.minutes, { n: String(entry.lengthMin) });
        expect(lines[2]).toBe(fillTemplate(STRINGS.graveyard.card.planned, { time: minutes }));
        expect(lines[3]).toBe(fillTemplate(STRINGS.graveyard.card.distractions, { n: String(entry.distractions) }));
        expect(lines[4]).toBe(fillTemplate(STRINGS.graveyard.card.away, { time: spokenTime(entry.timeAwayMs) }));
        expect(lines[3]).toMatch(new RegExp(`(?:^|\\D)${entry.distractions}$`));
      }),
      PROP_PARAMS,
    );
  });

  it("names an Item with the intent or its placeholder and the date, joined by the template", () => {
    fc.assert(
      fc.property(arbCardEntry, arbDayKeyFn, (entry, dayKeyOf) => {
        const [item] = indexHistory([entry], dayKeyOf);
        if (!item) throw new Error("no item");
        const intent = typeof entry.intent === "string" && entry.intent !== "" ? entry.intent : STRINGS.graveyard.noIntent;
        const date = formatCarvedDate(dayKeyOf(entry.endedAt));
        expect(itemName(item)).toBe(fillTemplate(STRINGS.graveyard.itemName, { intent, date }));
      }),
      PROP_PARAMS,
    );
  });

  it("gives the same lines and the same name for equal entries", () => {
    fc.assert(
      fc.property(arbCardEntry, arbDayKeyFn, (entry, dayKeyOf) => {
        const [a] = indexHistory([entry], dayKeyOf);
        const [b] = indexHistory([{ ...entry }], dayKeyOf);
        if (!a || !b) throw new Error("no item");
        expect(cardLines(a)).toEqual(cardLines(b));
        expect(itemName(a)).toBe(itemName(b));
      }),
      PROP_PARAMS,
    );
  });
});
