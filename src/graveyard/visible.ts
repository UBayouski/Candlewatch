// What the graveyard and the shelf draw (ghosts-and-graveyard design 3.2, R8). Pure: the day function arrives in the limits, the
// history is never changed, and nothing here reads the clock or the DOM.
import type { HistoryEntry } from "../engine";
import { groupIndexed, indexHistory, newestFirst } from "./days";
import type { DayKey, DayKeyFn, Indexed } from "./days";

export interface Limits {
  /** Stones drawn. */
  readonly S: number;
  /** Day_Shelves drawn. */
  readonly D: number;
  /** Stubs drawn on one Day_Shelf. */
  readonly K: number;
  readonly dayKeyOf: DayKeyFn;
}

/** From Section 1, Decision L8. */
export const DEFAULT_LIMITS = { S: 10, D: 3, K: 4 } as const;

export interface ShelfView {
  readonly dayKey: DayKey;
  /** The newest K stubs of the day, newest first. */
  readonly stubs: readonly Indexed[];
  /** Stubs of this day that are not drawn: the n of "+n more" (R8.5). */
  readonly hiddenStubs: number;
}

export interface VisibleHistory {
  /** The newest S snuffed entries, newest first (R8.3). */
  readonly stones: readonly Indexed[];
  /** The newest D days that hold a burned-out entry, newest first (R8.4). */
  readonly shelves: readonly ShelfView[];
  /** Snuffed entries not drawn (R8.8). */
  readonly hiddenStones: number;
  /** Days with a burned-out entry that are not drawn (R8.9). */
  readonly hiddenDays: number;
}

/** A limit is read as `max(0, floor(x))` and `NaN` as 0 (design section 7). */
const limit = (x: number): number => (Number.isNaN(x) ? 0 : Math.max(0, Math.floor(x)));

const isSnuffed = (item: Indexed): boolean => item.entry.outcome === "snuffed";

/**
 * Stones are the newest S snuffed entries; the Shelf is the newest D days that hold a burned-out entry, each with its newest K
 * stubs. A day with only snuffed entries has no Day_Shelf (R4.4). Every `index` is the entry's position in `history`. The result
 * is new and the input is never changed or trimmed (R8.12). When nothing is cut, every hidden count is 0 (R8.15).
 */
export function visibleHistory(history: readonly HistoryEntry[], limits: Limits): VisibleHistory {
  const [S, D, K] = [limit(limits.S), limit(limits.D), limit(limits.K)];
  const items = indexHistory(history, limits.dayKeyOf);

  const snuffed = items.filter(isSnuffed).sort(newestFirst);
  const stones = snuffed.slice(0, S);

  const days = groupIndexed(items.filter((item) => !isSnuffed(item)));
  const shelves = days.slice(0, D).map((day) => ({
    dayKey: day.dayKey,
    stubs: day.items.slice(0, K),
    hiddenStubs: Math.max(0, day.items.length - K),
  }));

  return { stones, shelves, hiddenStones: snuffed.length - stones.length, hiddenDays: days.length - shelves.length };
}
