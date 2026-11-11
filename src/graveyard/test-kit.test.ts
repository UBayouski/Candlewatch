// Self-test of the graveyard's test-kit: the day functions and the generators do what later property tests rely on.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DAY_MS, DST_LONG_DAY, DST_SHORT_DAY, DEFAULT_LIMIT_COUNTS, HOUR_MS, PROP_PARAMS, arbCrowdedHistory, arbDayKeyFn, arbEntry, arbHistory, arbLimits, dstDayStart, dstJumpDay, fixedOffsetDay, uniquePairs } from "./test-kit";
import { formatCarvedDate } from "./days";
import { STRINGS } from "../strings";

describe("fixedOffsetDay", () => {
  it("moves the day boundary by the offset", () => {
    const t = Date.UTC(2026, 10, 10, 23, 30);
    expect(fixedOffsetDay(0)(t)).toBe("2026-11-10");
    expect(fixedOffsetDay(1)(t)).toBe("2026-11-11");
    expect(fixedOffsetDay(-24)(t)).toBe("2026-11-09");
    expect(fixedOffsetDay(5.5)(Date.UTC(2026, 10, 10, 18, 30))).toBe("2026-11-11");
  });

  it("makes every day 24 hours long", () => {
    const f = fixedOffsetDay(-8);
    const midnight = Date.UTC(2026, 10, 10, 8, 0);
    expect(f(midnight - 1)).toBe("2026-11-09");
    expect(f(midnight)).toBe("2026-11-10");
    expect(f(midnight + DAY_MS - 1)).toBe("2026-11-10");
    expect(f(midnight + DAY_MS)).toBe("2026-11-11");
  });

  it("gives the unknown date for an instant no calendar can name", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 9e15]) expect(formatCarvedDate(fixedOffsetDay(3)(bad))).toBe(STRINGS.graveyard.unknownDate);
  });
});

describe("dstJumpDay", () => {
  it("has a 23-hour day and a 25-hour day and 24 hours elsewhere", () => {
    expect(DST_SHORT_DAY.end - DST_SHORT_DAY.start).toBe(23 * HOUR_MS);
    expect(DST_LONG_DAY.end - DST_LONG_DAY.start).toBe(25 * HOUR_MS);
    for (let i = -3; i < 30; i++) {
      const length = dstDayStart(i + 1) - dstDayStart(i);
      expect(length, `day ${i}`).toBe(i === 10 ? 23 * HOUR_MS : i === 20 ? 25 * HOUR_MS : DAY_MS);
    }
  });

  it("gives one key from the first to the last millisecond of every day, and a new key the millisecond after", () => {
    for (let i = -3; i < 30; i++) {
      const start = dstDayStart(i);
      const end = dstDayStart(i + 1);
      expect(dstJumpDay(start), `day ${i} start`).toBe(dstJumpDay(end - 1));
      expect(dstJumpDay(end), `day ${i} end`).not.toBe(dstJumpDay(end - 1));
      expect(dstJumpDay(start - 1), `day ${i - 1}`).not.toBe(dstJumpDay(start));
    }
  });

  it("names the days in order, one after another, and gives the unknown date for what is not a time", () => {
    expect(dstJumpDay(dstDayStart(0))).toBe("2026-03-01");
    expect(dstJumpDay(dstDayStart(1))).toBe("2026-03-02");
    expect(dstJumpDay(dstDayStart(30))).toBe("2026-03-31");
    expect(dstJumpDay(dstDayStart(31))).toBe("2026-04-01");
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 1e300, -1e300]) expect(dstJumpDay(bad)).toBe("0000-00-00");
  });
});

describe("the generators", () => {
  it("generate entries whose end time is in the seven clustered days and whose start is not after the end", () => {
    fc.assert(
      fc.property(arbEntry, (e) => {
        expect(e.startedAt).toBeLessThanOrEqual(e.endedAt);
        expect(["burned-out", "snuffed"]).toContain(e.outcome);
        expect(e.intent === null || typeof e.intent === "string").toBe(true);
        expect(fixedOffsetDay(0)(e.endedAt) >= "2026-10-01" && fixedOffsetDay(0)(e.endedAt) <= "2026-10-07").toBe(true);
      }),
      PROP_PARAMS,
    );
  });

  it("generate histories with unique (startedAt, endedAt) pairs, and several entries on one day", () => {
    let crowded = 0;
    let snuffed = 0;
    let burned = 0;
    let named = 0;
    let unnamed = 0;
    fc.assert(
      fc.property(arbHistory, (h) => {
        expect(new Set(h.map((e) => `${e.startedAt}:${e.endedAt}`)).size).toBe(h.length);
        const perDay = new Map<string, number>();
        for (const e of h) {
          const d = fixedOffsetDay(0)(e.endedAt);
          perDay.set(d, (perDay.get(d) ?? 0) + 1);
          if (e.outcome === "snuffed") snuffed++;
          else burned++;
          if (e.intent === null) unnamed++;
          else named++;
        }
        if ([...perDay.values()].some((n) => n >= 3)) crowded++;
      }),
      PROP_PARAMS,
    );
    expect(crowded, "histories with three entries on one day").toBeGreaterThan(30);
    expect(Math.min(snuffed, burned, named, unnamed), "both outcomes, with and without an intent").toBeGreaterThan(0);
  });

  it("arbDayKeyFn gives day functions whose keys never go back in time and are always well-formed dates", () => {
    fc.assert(
      fc.property(arbDayKeyFn, fc.integer({ min: 0, max: 2_000_000_000_000 }), fc.integer({ min: 0, max: 3 * DAY_MS }), (dayKeyOf, t, later) => {
        expect(dayKeyOf(t)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(dayKeyOf(t + later) >= dayKeyOf(t)).toBe(true);
      }),
      PROP_PARAMS,
    );
  });

  it("arbCrowdedHistory puts its entries on two days only, with unique pairs", () => {
    fc.assert(
      fc.property(arbCrowdedHistory, (h) => {
        expect(new Set(h.map((e) => `${e.startedAt}:${e.endedAt}`)).size).toBe(h.length);
        expect(new Set(h.map((e) => fixedOffsetDay(0)(e.endedAt))).size).toBeLessThanOrEqual(2);
        expect(h.length).toBeLessThanOrEqual(40);
      }),
      PROP_PARAMS,
    );
  });

  it("uniquePairs keeps the first of each pair and the order", () => {
    const mk = (s: number, e: number, tag: string) => ({ startedAt: s, endedAt: e, lengthMin: 25, intent: tag, outcome: "snuffed" as const, distractions: 0, timeAwayMs: 0 });
    expect(uniquePairs([mk(1, 2, "a"), mk(3, 4, "b"), mk(1, 2, "c"), mk(1, 3, "d")]).map((e) => e.intent)).toEqual(["a", "b", "d"]);
  });

  it("generate limits from 0 to 15, with the defaults among them", () => {
    let defaults = 0;
    fc.assert(
      fc.property(arbLimits, ({ S, D, K }) => {
        for (const n of [S, D, K]) expect(Number.isInteger(n) && n >= 0 && n <= 15).toBe(true);
        if (S === DEFAULT_LIMIT_COUNTS.S && D === DEFAULT_LIMIT_COUNTS.D && K === DEFAULT_LIMIT_COUNTS.K) defaults++;
      }),
      PROP_PARAMS,
    );
    expect(DEFAULT_LIMIT_COUNTS).toEqual({ S: 10, D: 3, K: 4 });
    expect(defaults).toBeGreaterThan(0);
  });
});
