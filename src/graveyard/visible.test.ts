// ghosts-and-graveyard R4.1, R4.4, R8.1 to R8.5, R8.8, R8.9, R8.12, R8.15 (design 3.2): what is drawn and what is counted as hidden.
import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "../engine";
import { DEFAULT_LIMITS, visibleHistory } from "./visible";
import type { Limits } from "./visible";
import { DAY_MS, DEFAULT_LIMIT_COUNTS, HOUR_MS, fixedOffsetDay } from "./test-kit";

const DAY0 = Date.UTC(2026, 10, 1);
const utc = fixedOffsetDay(0);
const limits = (over: Partial<Limits> = {}): Limits => ({ ...DEFAULT_LIMITS, dayKeyOf: utc, ...over });

/** An entry that ends `hour` hours into day `day` (0 is 1 Nov 2026, UTC). */
const entry = (day: number, hour: number, outcome: HistoryEntry["outcome"], tag = ""): HistoryEntry => ({
  startedAt: DAY0 + day * DAY_MS + hour * HOUR_MS - 25 * 60_000,
  endedAt: DAY0 + day * DAY_MS + hour * HOUR_MS,
  lengthMin: 25,
  intent: tag === "" ? null : tag,
  outcome,
  distractions: 0,
  timeAwayMs: 0,
});
const hoursOf = (items: readonly { entry: HistoryEntry }[]): number[] => items.map((i) => (i.entry.endedAt - DAY0) / HOUR_MS);

describe("the defaults", () => {
  it("are 10 stones, 3 days and 4 stubs a day (L8), the numbers the test-kit repeats", () => {
    expect(DEFAULT_LIMITS).toEqual({ S: 10, D: 3, K: 4 });
    expect(DEFAULT_LIMIT_COUNTS).toEqual(DEFAULT_LIMITS);
  });
});

describe("a history within the limits", () => {
  it("hides nothing for 3 sessions", () => {
    const history = [entry(0, 9, "snuffed"), entry(0, 10, "burned-out"), entry(1, 9, "burned-out")];
    const v = visibleHistory(history, limits());
    expect(v.stones).toHaveLength(1);
    expect(v.shelves.map((s) => [s.dayKey, s.stubs.length, s.hiddenStubs])).toEqual([["2026-11-02", 1, 0], ["2026-11-01", 1, 0]]);
    expect([v.hiddenStones, v.hiddenDays]).toEqual([0, 0]);
  });

  it("gives an empty history nothing to draw", () => {
    expect(visibleHistory([], limits())).toEqual({ stones: [], shelves: [], hiddenStones: 0, hiddenDays: 0 });
  });
});

describe("the stones (R8.3, R8.8)", () => {
  const history = Array.from({ length: 11 }, (_, i) => entry(i % 3, 8 + Math.floor(i / 3), "snuffed")); // 11 distinct end times

  it("draws the newest 10 of 11 and counts 1 hidden", () => {
    const v = visibleHistory(history, limits());
    expect(v.stones).toHaveLength(10);
    expect(v.hiddenStones).toBe(1);
    const oldest = Math.min(...history.map((e) => e.endedAt));
    expect(v.stones.map((s) => s.entry.endedAt)).not.toContain(oldest);
    expect(v.stones.map((s) => s.entry.endedAt)).toEqual([...v.stones.map((s) => s.entry.endedAt)].sort((a, b) => b - a));
  });

  it("draws only snuffed entries, and gives each its day", () => {
    const v = visibleHistory([entry(0, 9, "burned-out"), entry(1, 5, "snuffed")], limits());
    expect(v.stones.map((s) => [s.entry.outcome, s.dayKey])).toEqual([["snuffed", "2026-11-02"]]);
  });
});

describe("the shelf (R8.4, R8.5, R8.9)", () => {
  it("draws the newest 3 of 5 days and counts 2 hidden", () => {
    const history = [0, 1, 2, 3, 4].map((d) => entry(d, 12, "burned-out"));
    const v = visibleHistory(history, limits());
    expect(v.shelves.map((s) => s.dayKey)).toEqual(["2026-11-05", "2026-11-04", "2026-11-03"]);
    expect(v.hiddenDays).toBe(2);
  });

  it("draws the newest 4 of 6 stubs of a day and counts 2 hidden", () => {
    const history = [1, 2, 3, 4, 5, 6].map((h) => entry(0, h, "burned-out"));
    const v = visibleHistory(history, limits());
    expect(v.shelves).toHaveLength(1);
    expect(hoursOf(v.shelves[0]?.stubs ?? [])).toEqual([6, 5, 4, 3]);
    expect(v.shelves[0]?.hiddenStubs).toBe(2);
    expect(v.hiddenDays).toBe(0);
  });

  it("gives a day with only snuffed entries no shelf, and does not count it as a hidden day", () => {
    const history = [entry(0, 9, "burned-out"), entry(1, 9, "snuffed"), entry(1, 10, "snuffed"), entry(2, 9, "snuffed")];
    const v = visibleHistory(history, limits());
    expect(v.shelves.map((s) => s.dayKey)).toEqual(["2026-11-01"]);
    expect(v.hiddenDays).toBe(0);
    expect(v.stones).toHaveLength(3);
  });

  it("does not let the days of the stones use up the days of the shelf", () => {
    const history = [entry(5, 9, "snuffed"), entry(6, 9, "snuffed"), entry(0, 9, "burned-out")];
    expect(visibleHistory(history, limits({ D: 1 })).shelves.map((s) => s.dayKey)).toEqual(["2026-11-01"]);
  });
});

describe("the limits are read as max(0, floor(x)) and NaN as 0", () => {
  const history = [...[1, 2, 3, 4].map((h) => entry(0, h, "snuffed")), ...[1, 2, 3, 4].flatMap((d) => [entry(d, 1, "burned-out"), entry(d, 2, "burned-out")])];

  it("with 0 draws nothing and hides everything", () => {
    const v = visibleHistory(history, limits({ S: 0, D: 0, K: 0 }));
    expect(v.stones).toEqual([]);
    expect(v.shelves).toEqual([]);
    expect([v.hiddenStones, v.hiddenDays]).toEqual([4, 4]);
  });

  it("with K = 0 keeps the shelf and hides every stub", () => {
    const v = visibleHistory(history, limits({ K: 0 }));
    expect(v.shelves).toHaveLength(3);
    expect(v.shelves.map((s) => [s.stubs.length, s.hiddenStubs])).toEqual([[0, 2], [0, 2], [0, 2]]);
  });

  it("reads a negative limit as 0 and NaN as 0", () => {
    for (const bad of [-1, -0.5, -1000, Number.NaN, Number.NEGATIVE_INFINITY]) {
      const v = visibleHistory(history, limits({ S: bad, D: bad, K: bad }));
      expect([v.stones.length, v.shelves.length, v.hiddenStones, v.hiddenDays], String(bad)).toEqual([0, 0, 4, 4]);
    }
  });

  it("floors a fractional limit", () => {
    const v = visibleHistory(history, limits({ S: 2.9, D: 1.99, K: 1.5 }));
    expect(v.stones).toHaveLength(2);
    expect(v.hiddenStones).toBe(2);
    expect(v.shelves).toHaveLength(1);
    expect(v.shelves[0]?.stubs).toHaveLength(1);
    expect(v.shelves[0]?.hiddenStubs).toBe(1);
    expect(v.hiddenDays).toBe(3);
  });

  it("draws everything for an infinite limit", () => {
    const v = visibleHistory(history, limits({ S: Number.POSITIVE_INFINITY, D: Number.POSITIVE_INFINITY, K: Number.POSITIVE_INFINITY }));
    expect([v.stones.length, v.shelves.length, v.hiddenStones, v.hiddenDays]).toEqual([4, 4, 0, 0]);
  });
});

describe("the entries drawn", () => {
  it("keep their position in the whole history, so ids are unique across stones and stubs", () => {
    const history = [entry(0, 9, "burned-out"), entry(0, 10, "snuffed"), entry(1, 9, "burned-out"), entry(1, 10, "snuffed")];
    const v = visibleHistory(history, limits());
    expect(v.stones.map((s) => s.index)).toEqual([3, 1]);
    expect(v.shelves.flatMap((s) => s.stubs.map((i) => i.index))).toEqual([2, 0]);
    const ids = [...v.stones, ...v.shelves.flatMap((s) => s.stubs)].map((i) => i.id);
    expect(new Set(ids).size).toBe(4);
  });

  it("are the entries of the history, not copies", () => {
    const history = [entry(0, 9, "snuffed"), entry(0, 10, "burned-out")];
    const v = visibleHistory(history, limits());
    expect(v.stones[0]?.entry).toBe(history[0]);
    expect(v.shelves[0]?.stubs[0]?.entry).toBe(history[1]);
  });
});

describe("the input (R8.12)", () => {
  it("is not changed, trimmed or sorted", () => {
    const history = Object.freeze(Array.from({ length: 30 }, (_, i) => Object.freeze(entry(i % 9, (i * 7) % 24, i % 2 === 0 ? "snuffed" : "burned-out"))));
    const before = history.map((e) => e.endedAt);
    const v = visibleHistory(history, limits());
    expect(v.hiddenStones + v.stones.length).toBe(15);
    expect(history).toHaveLength(30);
    expect(history.map((e) => e.endedAt)).toEqual(before);
  });
});
