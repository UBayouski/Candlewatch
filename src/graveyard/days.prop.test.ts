// Property tests for the day grouping (ghosts-and-graveyard design 8.4). Properties 1 and 2.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "../engine";
import { STRINGS } from "../strings";
import { formatCarvedDate, groupByDay, newestFirst } from "./days";
import type { DayKeyFn } from "./days";
import { HOUR_MS, PROP_PARAMS, arbDayKeyFn, arbEntry, arbHistory, dstDayStart, dstJumpDay } from "./test-kit";

const idOf = (e: HistoryEntry, index: number): string => `${e.startedAt}:${e.endedAt}:${index}`;

interface RefGroup {
  readonly dayKey: string;
  readonly ids: string[];
}

/**
 * A model of the grouping written another way: sort every entry oldest to newest on the tuple (endedAt, startedAt, position),
 * then walk from the newest end and drop each entry into the group of its key, opening a group the first time a key is seen.
 * It uses neither `newestFirst` nor a sort by key; for a day function that never goes back in time the groups it opens are in
 * descending key order because the walk meets the newest day first.
 */
function referenceGroups(history: readonly HistoryEntry[], dayKeyOf: DayKeyFn): RefGroup[] {
  const rows = history.map((entry, position) => ({ id: idOf(entry, position), key: dayKeyOf(entry.endedAt), tuple: [entry.endedAt, entry.startedAt, position] as const }));
  rows.sort((a, b) => a.tuple[0] - b.tuple[0] || a.tuple[1] - b.tuple[1] || a.tuple[2] - b.tuple[2]);
  const groups: RefGroup[] = [];
  for (const row of rows.reverse()) {
    const open = groups.find((g) => g.dayKey === row.key);
    if (open) open.ids.push(row.id);
    else groups.push({ dayKey: row.key, ids: [row.id] });
  }
  return groups;
}

/** A history that may repeat a (startedAt, endedAt) pair, as a damaged document can. */
const arbHistoryWithRepeats: fc.Arbitrary<HistoryEntry[]> = fc
  .tuple(fc.array(arbEntry, { maxLength: 30 }), fc.nat(5))
  .map(([entries, repeats]) => [...entries, ...entries.slice(0, repeats)]);

describe("Feature: ghosts-and-graveyard, Property 1: Entries group by their end day", () => {
  it("puts every entry in exactly one group, keyed by the day of its end, groups newest day first, items newest first, and equals the reference", () => {
    fc.assert(
      fc.property(fc.oneof(arbHistory, arbHistoryWithRepeats), arbDayKeyFn, (history, dayKeyOf) => {
        const groups = groupByDay(history, dayKeyOf);

        // Every entry in exactly one group.
        const ids = groups.flatMap((g) => g.items.map((i) => i.id)).sort();
        expect(ids).toEqual(history.map(idOf).sort());
        expect(groups.flatMap((g) => g.items.map((i) => i.index)).sort((a, b) => a - b)).toEqual(history.map((_, i) => i));

        // The group key is the day of the end time, for the group and for each of its items.
        for (const g of groups) {
          expect(g.items.length).toBeGreaterThan(0);
          for (const item of g.items) {
            expect(item.dayKey).toBe(g.dayKey);
            expect(dayKeyOf(item.entry.endedAt)).toBe(g.dayKey);
            expect(item.entry).toBe(history[item.index]);
          }
        }

        // Groups in strictly descending key order; items in newestFirst order.
        for (let i = 0; i + 1 < groups.length; i++) expect((groups[i]?.dayKey ?? "") > (groups[i + 1]?.dayKey ?? "")).toBe(true);
        for (const g of groups) {
          g.items.slice(1).forEach((next, i) => expect(newestFirst(g.items[i] ?? next, next)).toBeLessThan(0));
        }

        // The result equals the reference model.
        expect(groups.map((g) => ({ dayKey: g.dayKey, ids: g.items.map((i) => i.id) }))).toEqual(referenceGroups(history, dayKeyOf));
      }),
      PROP_PARAMS,
    );
  });

  it("does not change when a history with unique pairs is reordered", () => {
    const arbReordered = arbHistory.chain((history) => fc.tuple(fc.constant(history), fc.shuffledSubarray(history, { minLength: history.length, maxLength: history.length })));
    const shape = (history: readonly HistoryEntry[], dayKeyOf: DayKeyFn): string[][] =>
      groupByDay(history, dayKeyOf).map((g) => [g.dayKey, ...g.items.map((i) => `${i.entry.startedAt}:${i.entry.endedAt}`)]);
    fc.assert(
      fc.property(arbReordered, arbDayKeyFn, ([history, reordered], dayKeyOf) => {
        expect(reordered).toHaveLength(history.length);
        expect(shape(reordered, dayKeyOf)).toEqual(shape(history, dayKeyOf));
      }),
      PROP_PARAMS,
    );
  });

  it("does not change its input", () => {
    fc.assert(
      fc.property(arbHistoryWithRepeats, arbDayKeyFn, (history, dayKeyOf) => {
        const before = JSON.stringify(history);
        groupByDay(history, dayKeyOf);
        expect(JSON.stringify(history)).toBe(before);
      }),
      PROP_PARAMS,
    );
  });
});

/**
 * An entry that ends at a chosen moment of a chosen day of the hand-written calendar. `day` is the ground truth of the test; the
 * day function is never asked for it. `where`: the first instant of the day, the last, or anywhere between.
 */
interface Placed {
  readonly day: number;
  readonly entry: HistoryEntry;
}

const DAYS_IN_PLAY = 31;

const arbPlaced: fc.Arbitrary<Placed> = fc
  .record({
    // Days 10 (23 hours) and 20 (25 hours) and their neighbours are drawn far more often than chance would.
    day: fc.oneof({ weight: 3, arbitrary: fc.integer({ min: -2, max: DAYS_IN_PLAY - 1 }) }, { weight: 3, arbitrary: fc.constantFrom(9, 10, 11, 19, 20, 21) }),
    where: fc.oneof(fc.constant("first" as const), fc.constant("last" as const), fc.nat()),
    spanMs: fc.integer({ min: 0, max: 90 * 60_000 }),
    lengthMin: fc.integer({ min: 5, max: 90 }),
  })
  .map(({ day, where, spanMs, lengthMin }) => {
    const start = dstDayStart(day);
    const length = dstDayStart(day + 1) - start;
    const offset = where === "first" ? 0 : where === "last" ? length - 1 : where % length;
    const endedAt = start + offset;
    return {
      day,
      entry: { startedAt: endedAt - spanMs, endedAt, lengthMin, intent: null, outcome: "burned-out" as const, distractions: 0, timeAwayMs: 0 },
    };
  });

describe("Feature: ghosts-and-graveyard, Property 2: A daylight-saving day is one shelf", () => {
  it("puts every entry of one local day in one group, including the 23-hour and the 25-hour day, and entries of different days in different groups", () => {
    fc.assert(
      fc.property(fc.array(arbPlaced, { minLength: 1, maxLength: 40 }), (placed) => {
        const history = placed.map((p) => p.entry);
        const groups = groupByDay(history, dstJumpDay);

        // One group per distinct day, however many entries the day has.
        const days = new Set(placed.map((p) => p.day));
        expect(groups).toHaveLength(days.size);

        // Entries of the same day share a group; entries of different days never do.
        const groupOf = new Map<number, number>();
        groups.forEach((g, gi) => g.items.forEach((item) => groupOf.set(item.index, gi)));
        expect(groupOf.size).toBe(history.length);
        placed.forEach((a, i) => {
          placed.forEach((b, j) => {
            expect(groupOf.get(i) === groupOf.get(j), `entries ${i} (day ${a.day}) and ${j} (day ${b.day})`).toBe(a.day === b.day);
          });
        });

        // Newest day first, which is the highest day number first.
        const order = groups.map((g) => placed[g.items[0]?.index ?? 0]?.day ?? Number.NaN);
        expect(order).toEqual([...days].sort((a, b) => b - a));
      }),
      PROP_PARAMS,
    );
  });

  it("covers both odd days: some runs hold an entry on the 23-hour day and on the 25-hour day, at their first and last instants", () => {
    let short = 0;
    let long = 0;
    let edges = 0;
    fc.assert(
      fc.property(fc.array(arbPlaced, { minLength: 1, maxLength: 40 }), (placed) => {
        for (const p of placed) {
          if (p.day === 10) short++;
          if (p.day === 20) long++;
          const length = dstDayStart(p.day + 1) - dstDayStart(p.day);
          const offset = p.entry.endedAt - dstDayStart(p.day);
          if (offset === 0 || offset === length - 1) edges++;
          expect(offset).toBeGreaterThanOrEqual(0);
          expect(offset).toBeLessThan(length);
          expect(length).toBe(p.day === 10 ? 23 * HOUR_MS : p.day === 20 ? 25 * HOUR_MS : 24 * HOUR_MS);
        }
      }),
      PROP_PARAMS,
    );
    expect(short).toBeGreaterThan(50);
    expect(long).toBeGreaterThan(50);
    expect(edges).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// sound-and-title task 16.2

/** Written out here, not read from `STRINGS`, so a change of the strings file cannot move the reference with it. */
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
/** The independent day-count table: days in each month of a common year. */
const COMMON_YEAR_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** A leap year, stated the other way round from the code under test: every year divisible by 4 except the centuries not divisible by 400. */
const isLeapRef = (year: number): boolean => year % 4 === 0 && !(year % 100 === 0 && year % 400 !== 0);
const lastDayRef = (year: number, month: number): number => (month === 2 && isLeapRef(year) ? 29 : (COMMON_YEAR_DAYS[month - 1] ?? 0));
const pad = (n: number, width: number): string => String(n).padStart(width, "0");
const keyOf = (year: number, month: number, day: number): string => `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;

/** The answer written without a regular expression: split on "-", check the three widths and the digits, then the calendar. */
function referenceCarved(input: unknown): string {
  const unknown = STRINGS.graveyard.unknownDate;
  if (typeof input !== "string") return unknown;
  const parts = input.split("-");
  if (parts.length !== 3) return unknown;
  const [y = "", m = "", d = ""] = parts;
  if (y.length !== 4 || m.length !== 2 || d.length !== 2) return unknown;
  for (const ch of y + m + d) if (ch < "0" || ch > "9") return unknown;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > lastDayRef(year, month)) return unknown;
  return `${day} ${MONTH_NAMES[month - 1]}`;
}

/** Years drawn mostly from the leap-year edge cases. */
const arbYear = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 9999 }) },
  { weight: 2, arbitrary: fc.constantFrom(0, 4, 100, 400, 1900, 2000, 2023, 2024, 2026, 2100, 2400, 9999) },
);

/** A valid Day_Key with its parts. The day is drawn from 1 to the last day of the month, and the last day and 29 February are over-drawn. */
const arbValidParts = fc.oneof(
  { weight: 6, arbitrary: fc
    .record({ year: arbYear, month: fc.integer({ min: 1, max: 12 }), pick: fc.nat(), edge: fc.constantFrom("any", "any", "last", "first") })
    .map(({ year, month, pick, edge }) => {
      const last = lastDayRef(year, month);
      const day = edge === "last" ? last : edge === "first" ? 1 : (pick % last) + 1;
      return { year, month, day };
    }) },
  // 29 February of a leap year, drawn on purpose: a common year has no such day.
  { weight: 1, arbitrary: fc.constantFrom(0, 4, 96, 400, 1600, 2000, 2024, 2028, 2400, 9996).map((year) => ({ year, month: 2, day: 29 })) },
);

/** A well-formed key (four, two and two digits, "-" between) that names no day: month 00 or 13 to 99, day 00, or a day past the end of the month. */
const arbWellFormedButWrong = fc.oneof(
  fc.record({ year: arbYear, month: fc.integer({ min: 13, max: 99 }), day: fc.integer({ min: 0, max: 99 }) }),
  fc.record({ year: arbYear, month: fc.constant(0), day: fc.integer({ min: 0, max: 99 }) }),
  fc.record({ year: arbYear, month: fc.integer({ min: 1, max: 12 }), over: fc.integer({ min: 1, max: 68 }) }).map(({ year, month, over }) => ({ year, month, day: lastDayRef(year, month) + over })),
  fc.record({ year: arbYear, month: fc.integer({ min: 1, max: 12 }) }).map(({ year, month }) => ({ year, month, day: 0 })),
).map(({ year, month, day }) => keyOf(year, month, day));

/** A valid key with one fault: another separator, a missing or extra digit, a prefix, a suffix, a letter. */
const arbDamaged = fc
  .tuple(arbValidParts, fc.constantFrom("sep1", "sep2", "short", "long", "prefix", "suffix", "letter", "space", "slash"), fc.string({ maxLength: 3 }))
  .map(([p, fault, junk]) => {
    const key = keyOf(p.year, p.month, p.day);
    switch (fault) {
      case "sep1":
        return `${key.slice(0, 4)}.${key.slice(5)}`;
      case "sep2":
        return `${key.slice(0, 7)}_${key.slice(8)}`;
      case "short":
        return key.slice(0, 9);
      case "long":
        return `${key}0`;
      case "prefix":
        return `${junk || "x"}${key}`;
      case "suffix":
        return `${key}${junk || "x"}`;
      case "letter":
        return `${key.slice(0, 2)}x${key.slice(3)}`;
      case "space":
        return ` ${key}`;
      default:
        return key.replaceAll("-", "/");
    }
  });

describe("Feature: sound-and-title, Property 11: formatCarvedDate", () => {
  it("gives the day without a leading zero, one space and the month name for every valid Day_Key, with no year and no time", () => {
    let feb29 = 0;
    let lastDays = 0;
    let singleDigit = 0;
    fc.assert(
      fc.property(arbValidParts, ({ year, month, day }) => {
        const result = formatCarvedDate(keyOf(year, month, day));
        expect(result).toBe(`${day} ${MONTH_NAMES[month - 1]}`);
        expect(result.startsWith("0")).toBe(false);
        expect(result.split(" ")).toHaveLength(2);
        expect(result).not.toMatch(/\d{3,}|:/);
        if (month === 2 && day === 29) feb29++;
        if (day === lastDayRef(year, month)) lastDays++;
        if (day < 10) singleDigit++;
      }),
      PROP_PARAMS,
    );
    // The generator must reach the cases a lazy one would miss.
    expect(feb29).toBeGreaterThan(5);
    expect(lastDays).toBeGreaterThan(50);
    expect(singleDigit).toBeGreaterThan(50);
  });

  it("gives the unknown-date line for every other input and never throws: null, undefined, any string, damaged keys and well-formed keys naming no day", () => {
    const unknown = STRINGS.graveyard.unknownDate;
    let nonexistent = 0;
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.string(),
          fc.string({ unit: "binary" }),
          { weight: 4, arbitrary: arbWellFormedButWrong },
          arbDamaged,
        ),
        (input) => {
          expect(() => formatCarvedDate(input)).not.toThrow();
          const result = formatCarvedDate(input);
          // The reference decides whether the input is a day; an arbitrary string that happens to be one is allowed to be one.
          expect(result).toBe(referenceCarved(input));
          if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input) && referenceCarved(input) === unknown) nonexistent++;
        },
      ),
      PROP_PARAMS,
    );
    expect(nonexistent).toBeGreaterThan(50);
  });

  it("gives the unknown-date line for each damaged key and each well-formed key that names no day, checked without the reference", () => {
    fc.assert(
      fc.property(fc.oneof(arbWellFormedButWrong, arbDamaged), (input) => {
        expect(formatCarvedDate(input)).toBe(STRINGS.graveyard.unknownDate);
      }),
      PROP_PARAMS,
    );
  });
});