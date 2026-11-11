// ghosts-and-graveyard R2.3, R2.5, R2.12 (design 4.4): the local day of an instant. Dates are built with the `Date` constructor
// from local parts, so every expectation holds in any time zone.
import { describe, expect, it } from "vitest";
import { STRINGS } from "../strings";
import { formatCarvedDate, groupByDay } from "./days";
import { localDayKey } from "./day-key";

const local = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0, ms = 0): number => new Date(y, mo - 1, d, h, mi, s, ms).getTime();

describe("localDayKey", () => {
  it("gives the local day of the instant: 23:50 on 10 Nov and 00:15 on 11 Nov are different days", () => {
    expect(localDayKey(new Date(2026, 10, 10, 23, 50).getTime())).toBe("2026-11-10");
    expect(localDayKey(new Date(2026, 10, 11, 0, 15).getTime())).toBe("2026-11-11");
  });

  it("changes at local midnight, to the millisecond", () => {
    expect(localDayKey(local(2026, 11, 10, 23, 59, 59, 999))).toBe("2026-11-10");
    expect(localDayKey(local(2026, 11, 11, 0, 0, 0, 0))).toBe("2026-11-11");
  });

  it("pads the month and the day, and crosses a month and a year", () => {
    expect(localDayKey(local(2026, 3, 7, 12))).toBe("2026-03-07");
    expect(localDayKey(local(2026, 12, 31, 23, 59))).toBe("2026-12-31");
    expect(localDayKey(local(2027, 1, 1, 0, 0))).toBe("2027-01-01");
    expect(localDayKey(local(2028, 2, 29, 12))).toBe("2028-02-29");
  });

  it("gives one key for every hour of a day, whatever the length of that day in the local time zone", () => {
    // Local noon on the days around the usual changes of the clocks; every hour of one day shares a key.
    for (const [y, mo, d] of [[2026, 3, 8], [2026, 3, 29], [2026, 10, 25], [2026, 11, 1]] as const) {
      const key = localDayKey(local(y, mo, d, 12));
      for (let hour = 0; hour < 24; hour++) expect(localDayKey(local(y, mo, d, hour, 30)), `${y}-${mo}-${d} ${hour}:30`).toBe(key);
    }
  });

  it("gives the unknown date for a time that is not an instant", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 9e15, -9e15]) {
      expect(localDayKey(bad), String(bad)).toBe("0000-00-00");
      expect(formatCarvedDate(localDayKey(bad)), String(bad)).toBe(STRINGS.graveyard.unknownDate);
    }
  });

  it("sorts the unknown date oldest, and works as the DayKeyFn of groupByDay", () => {
    const entry = (endedAt: number) => ({ startedAt: endedAt - 60_000, endedAt, lengthMin: 25, intent: null, outcome: "burned-out" as const, distractions: 0, timeAwayMs: 0 });
    const groups = groupByDay([entry(local(2026, 11, 10, 23, 50)), entry(local(2026, 11, 11, 0, 15)), entry(Number.NaN)], localDayKey);
    expect(groups.map((g) => g.dayKey)).toEqual(["2026-11-11", "2026-11-10", "0000-00-00"]);
  });
});
