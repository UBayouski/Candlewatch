// Property tests for what the graveyard draws (ghosts-and-graveyard design 8.4). Properties 7, 8, 9 and 10.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "../engine";
import { indexHistory, newestFirst } from "./days";
import type { DayKeyFn } from "./days";
import { visibleHistory } from "./visible";
import { stonesCountLine, daysCountLine, moreText } from "./text";
import { CLUSTER_DAY0, DAY_MS, PROP_PARAMS, arbCrowdedHistory, arbDayKeyFn, arbEntry, arbEntryInDays, arbHistory, arbLimits, fixedOffsetDay, uniquePairs } from "./test-kit";

/** A history that may repeat a (startedAt, endedAt) pair, as a damaged document can. */
const arbHistoryWithRepeats: fc.Arbitrary<HistoryEntry[]> = fc
  .tuple(fc.array(arbEntry, { maxLength: 30 }), fc.nat(5))
  .map(([entries, repeats]) => [...entries, ...entries.slice(0, repeats)]);

/** Spread over seven days, with repeated pairs, or crowded onto two days so that the limits cut. */
const arbAnyHistory: fc.Arbitrary<HistoryEntry[]> = fc.oneof(arbHistory, arbHistoryWithRepeats, arbCrowdedHistory);

describe("Feature: ghosts-and-graveyard, Property 7: Visible history is a partition of the history", () => {
  it("draws snuffed entries as stones and burned-out entries as stubs, counts every entry once, and agrees with a sort-filter-slice reference", () => {
    fc.assert(
      fc.property(arbAnyHistory, arbLimits, arbDayKeyFn, (history, { S, D, K }, dayKeyOf) => {
        const v = visibleHistory(history, { S, D, K, dayKeyOf });
        const snuffed = history.filter((e) => e.outcome === "snuffed");
        const burned = history.filter((e) => e.outcome === "burned-out");
        const stubs = v.shelves.flatMap((s) => s.stubs);

        // Stones are snuffed only, stubs are burned-out only.
        for (const stone of v.stones) expect(stone.entry.outcome).toBe("snuffed");
        for (const stub of stubs) expect(stub.entry.outcome).toBe("burned-out");

        // No entry is counted twice, and each drawn item is the entry at its position in the history.
        const positions = [...v.stones, ...stubs].map((i) => i.index);
        expect(new Set(positions).size).toBe(positions.length);
        for (const item of [...v.stones, ...stubs]) expect(item.entry).toBe(history[item.index]);
        expect(new Set([...v.stones, ...stubs].map((i) => i.id)).size).toBe(positions.length);

        // The stones: what is drawn plus what is hidden is every snuffed entry.
        expect(v.stones.length + v.hiddenStones).toBe(snuffed.length);

        // The stubs: drawn, plus hidden on a drawn day, plus every burned-out entry of a day not drawn, is every burned-out entry.
        const perDay = new Map<string, number>();
        for (const e of burned) perDay.set(dayKeyOf(e.endedAt), (perDay.get(dayKeyOf(e.endedAt)) ?? 0) + 1);
        const drawnDays = new Set(v.shelves.map((s) => s.dayKey));
        const inUndrawnDays = [...perDay.entries()].filter(([day]) => !drawnDays.has(day)).reduce((sum, [, n]) => sum + n, 0);
        const hiddenOnDrawnDays = v.shelves.reduce((sum, s) => sum + s.hiddenStubs, 0);
        expect(stubs.length + hiddenOnDrawnDays + inUndrawnDays).toBe(burned.length);

        // A shelf holds the stubs of its own day only, and each shelf is a different day.
        for (const shelf of v.shelves) for (const stub of shelf.stubs) expect(dayKeyOf(stub.entry.endedAt)).toBe(shelf.dayKey);
        expect(drawnDays.size).toBe(v.shelves.length);
        expect(v.shelves.length + v.hiddenDays).toBe(perDay.size);

        // The reference: sort, filter, slice.
        const newestFirstKey = (e: HistoryEntry, i: number): [number, number, number] => [e.endedAt, e.startedAt, i];
        const byNewest = (a: [number, number, number], b: [number, number, number]): number => b[0] - a[0] || b[1] - a[1] || b[2] - a[2];
        const refStones = history
          .map(newestFirstKey)
          .filter((_, i) => history[i]?.outcome === "snuffed")
          .sort(byNewest)
          .slice(0, S)
          .map((k) => k[2]);
        expect(v.stones.map((s) => s.index)).toEqual(refStones);

        const refDays = [...perDay.keys()].sort().reverse().slice(0, D);
        expect(v.shelves.map((s) => s.dayKey)).toEqual(refDays);
        for (const shelf of v.shelves) {
          const inDay = history
            .map(newestFirstKey)
            .filter((k) => history[k[2]]?.outcome === "burned-out" && dayKeyOf(k[0]) === shelf.dayKey)
            .sort(byNewest);
          expect(shelf.stubs.map((s) => s.index)).toEqual(inDay.slice(0, K).map((k) => k[2]));
          expect(shelf.hiddenStubs).toBe(Math.max(0, inDay.length - K));
        }
      }),
      PROP_PARAMS,
    );
  });

  it("never changes its input, and gives equal results for equal inputs", () => {
    fc.assert(
      fc.property(arbAnyHistory, arbLimits, arbDayKeyFn, (history, { S, D, K }, dayKeyOf) => {
        const before = JSON.stringify(history);
        const a = visibleHistory(history, { S, D, K, dayKeyOf });
        const b = visibleHistory(history, { S, D, K, dayKeyOf });
        expect(JSON.stringify(history)).toBe(before);
        expect(a).toEqual(b);
      }),
      PROP_PARAMS,
    );
  });

  it("is exercised: some runs cut stones, some cut days, and some cut stubs on a drawn day", () => {
    let cutStones = 0;
    let cutDays = 0;
    let cutStubs = 0;
    fc.assert(
      fc.property(arbAnyHistory, arbLimits, arbDayKeyFn, (history, { S, D, K }, dayKeyOf) => {
        const v = visibleHistory(history, { S, D, K, dayKeyOf });
        if (v.hiddenStones > 0) cutStones++;
        if (v.hiddenDays > 0) cutDays++;
        if (v.shelves.some((s) => s.hiddenStubs > 0)) cutStubs++;
      }),
      PROP_PARAMS,
    );
    expect(cutStones).toBeGreaterThan(20);
    expect(cutDays).toBeGreaterThan(20);
    expect(cutStubs).toBeGreaterThan(20);
  });
});

/**
 * The same draw worked out another way, from sorts, filters and slices of the history itself and a plain `Map` of days. It uses
 * neither `groupIndexed`, `indexHistory` nor `visibleHistory`: positions are the positions in the history array.
 */
function referenceVisible(history: readonly HistoryEntry[], S: number, D: number, K: number, dayKeyOf: (ms: number) => string) {
  const newestFirstOf = (a: number, b: number): number => {
    const [x, y] = [history[a] as HistoryEntry, history[b] as HistoryEntry];
    return y.endedAt - x.endedAt || y.startedAt - x.startedAt || b - a;
  };
  const positions = history.map((_, i) => i);
  const snuffed = positions.filter((i) => history[i]?.outcome === "snuffed").sort(newestFirstOf);
  const burned = positions.filter((i) => history[i]?.outcome === "burned-out");
  const days = new Map<string, number[]>();
  for (const i of burned) days.set(dayKeyOf((history[i] as HistoryEntry).endedAt), [...(days.get(dayKeyOf((history[i] as HistoryEntry).endedAt)) ?? []), i]);
  const dayKeys = [...days.keys()].sort().reverse();
  return {
    stones: snuffed.slice(0, S),
    hiddenStones: snuffed.slice(S),
    drawnDays: dayKeys.slice(0, D),
    hiddenDayKeys: dayKeys.slice(D),
    shelf: (day: string) => {
      const inDay = (days.get(day) ?? []).sort(newestFirstOf);
      return { stubs: inDay.slice(0, K), hidden: inDay.slice(K) };
    },
  };
}

describe("Feature: ghosts-and-graveyard, Property 8: The newest entries are the ones drawn", () => {
  it("draws the newest stones, the newest days and the newest stubs of each day, and equals the reference", () => {
    fc.assert(
      fc.property(arbAnyHistory, arbLimits, arbDayKeyFn, (history, { S, D, K }, dayKeyOf) => {
        const v = visibleHistory(history, { S, D, K, dayKeyOf });
        const ref = referenceVisible(history, S, D, K, dayKeyOf);
        const items = indexHistory(history, dayKeyOf);

        // Every drawn Stone is newer than every snuffed entry that is not drawn.
        const drawnStoneIndices = new Set(v.stones.map((s) => s.index));
        const hiddenStones = items.filter((i) => i.entry.outcome === "snuffed" && !drawnStoneIndices.has(i.index));
        for (const stone of v.stones) for (const hidden of hiddenStones) expect(newestFirst(stone, hidden), `stone ${stone.index} against hidden ${hidden.index}`).toBeLessThan(0);
        expect(v.hiddenStones).toBe(hiddenStones.length);

        // The drawn Day_Shelves are the newest days with a burned-out entry, and every day not drawn is older than every day drawn.
        expect(v.shelves.map((s) => s.dayKey)).toEqual(ref.drawnDays);
        for (const drawn of v.shelves) for (const hiddenDay of ref.hiddenDayKeys) expect(drawn.dayKey > hiddenDay).toBe(true);
        expect(v.hiddenDays).toBe(ref.hiddenDayKeys.length);

        // In each drawn day the drawn stubs are the newest of that day, and the rest are hidden.
        for (const shelf of v.shelves) {
          const drawnIndices = new Set(shelf.stubs.map((s) => s.index));
          const hiddenStubs = items.filter((i) => i.entry.outcome === "burned-out" && i.dayKey === shelf.dayKey && !drawnIndices.has(i.index));
          for (const stub of shelf.stubs) for (const hidden of hiddenStubs) expect(newestFirst(stub, hidden)).toBeLessThan(0);
          expect(shelf.hiddenStubs).toBe(hiddenStubs.length);
          expect(shelf.stubs.length).toBe(Math.min(K, shelf.stubs.length + hiddenStubs.length));
          const refShelf = ref.shelf(shelf.dayKey);
          expect(shelf.stubs.map((s) => s.index)).toEqual(refShelf.stubs);
          expect(shelf.hiddenStubs).toBe(refShelf.hidden.length);
        }

        // The stones, entry for entry, equal the reference.
        expect(v.stones.map((s) => s.index)).toEqual(ref.stones);
        expect(v.hiddenStones).toBe(ref.hiddenStones.length);
      }),
      PROP_PARAMS,
    );
  });
});

describe("Feature: ghosts-and-graveyard, Property 9: Visible history does not depend on the array order", () => {
  it("returns equal results, entry for entry and in the same order, for any permutation of a history with unique pairs", () => {
    /** What the page shows: the pair of each entry in place of its id, because the position in the array is what a permutation changes. */
    const shape = (history: readonly HistoryEntry[], limits: { S: number; D: number; K: number }, dayKeyOf: DayKeyFn) => {
      const v = visibleHistory(history, { ...limits, dayKeyOf });
      const pair = (i: { entry: HistoryEntry; dayKey: string }): string => `${i.entry.startedAt}:${i.entry.endedAt}:${i.dayKey}`;
      return {
        stones: v.stones.map(pair),
        shelves: v.shelves.map((s) => ({ dayKey: s.dayKey, stubs: s.stubs.map(pair), hiddenStubs: s.hiddenStubs })),
        hiddenStones: v.hiddenStones,
        hiddenDays: v.hiddenDays,
      };
    };
    const arbPermuted = fc
      .oneof(arbHistory, arbCrowdedHistory)
      .chain((history) => fc.tuple(fc.constant(history), fc.shuffledSubarray(history, { minLength: history.length, maxLength: history.length })));
    fc.assert(
      fc.property(arbPermuted, arbLimits, arbDayKeyFn, ([history, permuted], limits, dayKeyOf) => {
        expect(permuted).toHaveLength(history.length);
        expect(shape(permuted, limits, dayKeyOf)).toEqual(shape(history, limits, dayKeyOf));
      }),
      PROP_PARAMS,
    );
  });
});

describe("Feature: ghosts-and-graveyard, Property 10: A history within the limits hides nothing", () => {
  interface Within {
    readonly history: HistoryEntry[];
    readonly limits: { S: number; D: number; K: number };
    readonly snuffedCount: number;
    readonly burnedPerDay: number[];
  }

  /** A count from 0 to `max`, one time in three exactly `max`: the histories that sit on a limit. */
  const upTo = (max: number): fc.Arbitrary<number> => fc.oneof({ weight: 2, arbitrary: fc.integer({ min: 0, max }) }, { weight: 1, arbitrary: fc.constant(max) });
  const placedOnDay = (e: HistoryEntry, day: number, outcome: HistoryEntry["outcome"]): HistoryEntry => ({
    ...e,
    outcome,
    startedAt: e.startedAt + day * DAY_MS,
    endedAt: e.endedAt + day * DAY_MS,
  });

  /**
   * Built from the limits, so none is exceeded: at most S snuffed entries on any days, at most D days holding a burned-out entry,
   * at most K burned-out entries on each of those days. Days are UTC days, which is what `fixedOffsetDay(0)` reads.
   */
  const arbWithinLimits: fc.Arbitrary<Within> = arbLimits.chain((limits) => {
    const days = Math.min(limits.D, 8);
    const arbBurned = limits.K === 0 ? fc.constant<number[]>([]) : fc.array(fc.integer({ min: 1, max: limits.K }), { minLength: 0, maxLength: days }).map((a) => a.slice(0, days));
    return fc
      .tuple(upTo(limits.S), arbBurned.chain((perDay) => fc.tuple(...perDay.map((k) => upTo(k).map((n) => Math.max(1, n)))).map((counts) => counts as number[])))
      .chain(([snuffedCount, burnedPerDay]) =>
        fc.tuple(
          fc.array(arbEntryInDays(1), { minLength: snuffedCount, maxLength: snuffedCount }),
          fc.tuple(...burnedPerDay.map((k) => fc.array(arbEntryInDays(1), { minLength: k, maxLength: k }))),
          fc.array(fc.integer({ min: 0, max: 8 }), { minLength: snuffedCount, maxLength: snuffedCount }),
        ).map(([snuffed, burned, snuffedDays]) => {
          const entries = [
            ...snuffed.map((e, i) => placedOnDay(e, snuffedDays[i] ?? 0, "snuffed")),
            ...burned.flatMap((dayEntries, day) => dayEntries.map((e) => placedOnDay(e, day, "burned-out"))),
          ];
          const history = uniquePairs(entries);
          return { history, limits, snuffedCount: history.filter((e) => e.outcome === "snuffed").length, burnedPerDay: burnedPerDay.map((_, day) => history.filter((e) => e.outcome === "burned-out" && Math.floor((e.endedAt - CLUSTER_DAY0) / DAY_MS) === day).length) };
        }),
      );
  });

  it("hides nothing, draws everything, and has no count line", () => {
    const utc = fixedOffsetDay(0);
    fc.assert(
      fc.property(arbWithinLimits, ({ history, limits, snuffedCount, burnedPerDay }) => {
        const v = visibleHistory(history, { ...limits, dayKeyOf: utc });
        expect([v.hiddenStones, v.hiddenDays]).toEqual([0, 0]);
        for (const shelf of v.shelves) expect(shelf.hiddenStubs).toBe(0);
        expect(v.stones).toHaveLength(snuffedCount);
        const daysWithStubs = burnedPerDay.filter((n) => n > 0);
        expect(v.shelves).toHaveLength(daysWithStubs.length);
        expect(v.shelves.flatMap((s) => s.stubs)).toHaveLength(daysWithStubs.reduce((a, b) => a + b, 0));

        expect(stonesCountLine(v.hiddenStones)).toBeNull();
        expect(daysCountLine(v.hiddenDays)).toBeNull();
        for (const shelf of v.shelves) expect(moreText(shelf.hiddenStubs)).toBeNull();
      }),
      PROP_PARAMS,
    );
  });

  it("is exercised: histories with entries of both kinds, and histories exactly on each limit", () => {
    const utc = fixedOffsetDay(0);
    let onStones = 0;
    let onDays = 0;
    let onStubs = 0;
    let both = 0;
    fc.assert(
      fc.property(arbWithinLimits, ({ history, limits }) => {
        const v = visibleHistory(history, { ...limits, dayKeyOf: utc });
        if (limits.S > 0 && v.stones.length === limits.S) onStones++;
        if (limits.D > 0 && v.shelves.length === limits.D) onDays++;
        if (v.shelves.some((s) => limits.K > 0 && s.stubs.length === limits.K)) onStubs++;
        if (v.stones.length > 0 && v.shelves.length > 0) both++;
      }),
      PROP_PARAMS,
    );
    expect(onStones).toBeGreaterThan(20);
    expect(onDays).toBeGreaterThan(20);
    expect(onStubs).toBeGreaterThan(20);
    expect(both).toBeGreaterThan(20);
  });
});
