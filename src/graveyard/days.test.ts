// ghosts-and-graveyard R2.1 to R2.10, R2.12 (design 3.1): days, ordering and the carved date.
import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "../engine";
import { STRINGS } from "../strings";
import { dayKeyFromParts, formatCarvedDate, groupByDay, newestFirst } from "./days";
import type { Indexed } from "./days";
import { DST_LONG_DAY, DST_SHORT_DAY, dstJumpDay, fixedOffsetDay } from "./test-kit";

const entry = (startedAt: number, endedAt: number, outcome: HistoryEntry["outcome"] = "burned-out"): HistoryEntry => ({
  startedAt,
  endedAt,
  lengthMin: 25,
  intent: null,
  outcome,
  distractions: 0,
  timeAwayMs: 0,
});
const at = (y: number, mo: number, d: number, h = 0, mi = 0): number => Date.UTC(y, mo - 1, d, h, mi);
const indexed = (e: HistoryEntry, index: number): Indexed => ({ entry: e, index, dayKey: "x", id: `${e.startedAt}:${e.endedAt}:${index}` });

describe("which day an entry belongs to (R2.1, R2.2)", () => {
  it("puts a session from 23:50 to 00:15 local time on the day of 00:15", () => {
    // UTC+2: 23:50 on 10 Nov is 21:50 UTC, 00:15 on 11 Nov is 22:15 UTC.
    const local = fixedOffsetDay(2);
    const e = entry(at(2026, 11, 10, 21, 50), at(2026, 11, 10, 22, 15));
    expect(local(e.startedAt)).toBe("2026-11-10");
    expect(local(e.endedAt)).toBe("2026-11-11");
    const groups = groupByDay([e], local);
    expect(groups.map((g) => g.dayKey)).toEqual(["2026-11-11"]);
    expect(groups[0]?.items.map((i) => i.entry)).toEqual([e]);
  });

  it("is not the UTC day either: the same session is on the 10th for a function at offset 0", () => {
    const e = entry(at(2026, 11, 10, 21, 50), at(2026, 11, 10, 22, 15));
    expect(groupByDay([e], fixedOffsetDay(0)).map((g) => g.dayKey)).toEqual(["2026-11-10"]);
    expect(groupByDay([e], fixedOffsetDay(-5)).map((g) => g.dayKey)).toEqual(["2026-11-10"]);
  });

  it("makes a 23-hour day and a 25-hour day one group each (R2.3)", () => {
    for (const day of [DST_SHORT_DAY, DST_LONG_DAY]) {
      const dayBefore = entry(day.start - 20, day.start - 1);
      const first = entry(day.start - 10, day.start);
      const last = entry(day.end - 20, day.end - 1);
      const nextDay = entry(day.end, day.end + 10);
      const groups = groupByDay([nextDay, last, dayBefore, first], dstJumpDay);
      // Newest day first: the day after (1 entry), the long or short day itself (2 entries, its first and last instant), the day before (1).
      expect(groups.map((g) => g.items.length)).toEqual([1, 2, 1]);
      expect(dstJumpDay(day.start)).toBe(dstJumpDay(day.end - 1));
      expect(dstJumpDay(day.end)).not.toBe(dstJumpDay(day.end - 1));
    }
    expect(groupByDay([entry(1, DST_SHORT_DAY.start), entry(2, DST_SHORT_DAY.end - 1)], dstJumpDay)).toHaveLength(1);
    expect(groupByDay([entry(1, DST_LONG_DAY.start), entry(2, DST_LONG_DAY.end - 1)], dstJumpDay)).toHaveLength(1);
  });
});

describe("the order (R2.6, R2.7, R2.8)", () => {
  it("lists the days newest first and the entries of a day newest first", () => {
    const utc = fixedOffsetDay(0);
    const history = [
      entry(at(2026, 11, 9, 10), at(2026, 11, 9, 11)),
      entry(at(2026, 11, 11, 9), at(2026, 11, 11, 10)),
      entry(at(2026, 11, 10, 8), at(2026, 11, 10, 9)),
      entry(at(2026, 11, 11, 15), at(2026, 11, 11, 16)),
      entry(at(2026, 11, 10, 12), at(2026, 11, 10, 13)),
    ];
    const groups = groupByDay(history, utc);
    expect(groups.map((g) => g.dayKey)).toEqual(["2026-11-11", "2026-11-10", "2026-11-09"]);
    expect(groups.map((g) => g.items.map((i) => i.entry.endedAt))).toEqual([
      [at(2026, 11, 11, 16), at(2026, 11, 11, 10)],
      [at(2026, 11, 10, 13), at(2026, 11, 10, 9)],
      [at(2026, 11, 9, 11)],
    ]);
    expect(groups.flatMap((g) => g.items)).toHaveLength(history.length);
  });

  it("orders equal end times by start time, then by position in the document (a later position is newer)", () => {
    const a = indexed(entry(100, 500), 0);
    const b = indexed(entry(200, 500), 1);
    const c = indexed(entry(200, 500), 2); // the same pair as b: only a damaged document has it
    expect([a, b, c].sort(newestFirst).map((i) => i.index)).toEqual([2, 1, 0]);
    expect([c, a, b].sort(newestFirst).map((i) => i.index)).toEqual([2, 1, 0]);
    expect(newestFirst(b, c)).toBe(1);
    expect(newestFirst(c, b)).toBe(-1);
    expect(newestFirst(a, a)).toBe(0);
    expect(newestFirst(indexed(entry(1, 900), 0), indexed(entry(1, 500), 5))).toBe(-1);
  });

  it("gives the same groups for an entry list in another order when the pairs are unique", () => {
    const history = [entry(1, 1000), entry(2, 2000), entry(3, 3000), entry(4, 90_000_000)];
    const key = (gs: ReturnType<typeof groupByDay>): string[][] => gs.map((g) => [g.dayKey, ...g.items.map((i) => `${i.entry.startedAt}:${i.entry.endedAt}`)]);
    expect(key(groupByDay([...history].reverse(), fixedOffsetDay(0)))).toEqual(key(groupByDay(history, fixedOffsetDay(0))));
  });
});

describe("groupByDay", () => {
  it("gives no group for an empty history", () => {
    expect(groupByDay([], fixedOffsetDay(0))).toEqual([]);
  });

  it("gives each item its position, its day and the id `startedAt:endedAt:index`", () => {
    const history = [entry(10, 20), entry(30, 40)];
    const items = groupByDay(history, () => "2026-11-10")[0]?.items ?? [];
    expect(items.map((i) => [i.index, i.dayKey, i.id])).toEqual([
      [1, "2026-11-10", "30:40:1"],
      [0, "2026-11-10", "10:20:0"],
    ]);
  });

  it("makes unique ids, even for a repeated pair", () => {
    const ids = groupByDay([entry(1, 2), entry(1, 2), entry(1, 3)], () => "d").flatMap((g) => g.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(3);
  });

  it("does not change its input", () => {
    const history = Object.freeze([Object.freeze(entry(1, 2000)), Object.freeze(entry(2, 1000))]);
    expect(() => groupByDay(history, fixedOffsetDay(0))).not.toThrow();
    expect(history.map((e) => e.endedAt)).toEqual([2000, 1000]);
  });

  it("keeps a malformed key from the day function as its own group, which formats as the unknown date", () => {
    const groups = groupByDay([entry(1, 2), entry(3, 4)], () => "not a day");
    expect(groups).toHaveLength(1);
    expect(groups[0]?.dayKey).toBe("not a day");
    expect(formatCarvedDate(groups[0]?.dayKey ?? "")).toBe(STRINGS.graveyard.unknownDate);
  });
});

describe("formatCarvedDate (R2.9, R2.10)", () => {
  it('turns "2026-11-10" into "10 Nov"', () => {
    expect(formatCarvedDate("2026-11-10")).toBe("10 Nov");
  });

  it("drops the leading zero of the day and names every month", () => {
    expect(formatCarvedDate("2026-01-05")).toBe("5 Jan");
    expect(formatCarvedDate("2026-02-28")).toBe("28 Feb");
    STRINGS.graveyard.months.forEach((name, i) => expect(formatCarvedDate(dayKeyFromParts(2026, i + 1, 9))).toBe(`9 ${name}`));
  });

  it("shows no time of day and no year", () => {
    expect(formatCarvedDate("2026-11-10")).not.toMatch(/\d{4}|:/);
  });

  it("gives the unknown date for a key that is not YYYY-MM-DD with a month 01 to 12", () => {
    const unknown = STRINGS.graveyard.unknownDate;
    for (const key of ["2026-13-01", "2026-00-10", "0000-00-00", "", "garbage", "2026-1-1", "2026-11-1", "26-11-10", "2026/11/10", " 2026-11-10", "2026-11-10 ", "2026-11-10T00:00"]) {
      expect(formatCarvedDate(key), key).toBe(unknown);
    }
  });
});

describe("dayKeyFromParts", () => {
  it("pads the year to four digits and the month and the day to two", () => {
    expect(dayKeyFromParts(2026, 3, 7)).toBe("2026-03-07");
    expect(dayKeyFromParts(2026, 11, 10)).toBe("2026-11-10");
    expect(dayKeyFromParts(12, 1, 1)).toBe("0012-01-01");
    expect(dayKeyFromParts(0, 0, 0)).toBe("0000-00-00");
  });

  it("makes keys that sort as dates do", () => {
    const keys = [dayKeyFromParts(2026, 11, 10), dayKeyFromParts(2026, 2, 28), dayKeyFromParts(2025, 12, 31), dayKeyFromParts(2026, 11, 9)];
    expect([...keys].sort()).toEqual(["2025-12-31", "2026-02-28", "2026-11-09", "2026-11-10"]);
  });
});
