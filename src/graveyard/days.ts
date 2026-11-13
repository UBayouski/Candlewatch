// Days, ordering and the carved date (ghosts-and-graveyard design 3.1, R2). Pure: the day function is passed in, so no result
// depends on the machine's time zone, and nothing here reads the clock or the DOM. Days are computed on every build of the view
// and stored nowhere (R2.12).
import type { HistoryEntry } from "../engine";
import { STRINGS } from "../strings";
import { fill } from "../ui/format";

/** "YYYY-MM-DD" of a local calendar day. */
export type DayKey = string;

/** Passed in by the caller, so no result depends on the machine's time zone (R2.4). */
export type DayKeyFn = (ms: number) => DayKey;

/** An entry with its position in the history document, so that ties are broken the same way every time (R2.8). */
export interface Indexed {
  readonly entry: HistoryEntry;
  /** Position in the history document (oldest first). */
  readonly index: number;
  /** `dayKeyOf(entry.endedAt)` (R2.1). */
  readonly dayKey: DayKey;
  /** `${startedAt}:${endedAt}:${index}`: unique, used as the element id and the focus key. */
  readonly id: string;
}

export interface DayGroup {
  readonly dayKey: DayKey;
  /** Newest first (Decision D4). */
  readonly items: readonly Indexed[];
}

/**
 * Newest first: the order of the Graveyard, of the Day_Shelves and inside one Day_Shelf. `endedAt` descending, then `startedAt`
 * descending, then `index` descending. A later position means a later append, so it sorts as newer (R2.8).
 */
export function newestFirst(a: Indexed, b: Indexed): number {
  if (a.entry.endedAt !== b.entry.endedAt) return a.entry.endedAt > b.entry.endedAt ? -1 : 1;
  if (a.entry.startedAt !== b.entry.startedAt) return a.entry.startedAt > b.entry.startedAt ? -1 : 1;
  if (a.index !== b.index) return a.index > b.index ? -1 : 1;
  return 0;
}

/**
 * Each entry with its position in `history` and its day, which is the local day of the end time and never the day of the start
 * and never the UTC day (R2.1). The one place that builds an `Indexed`. Filter the result, not the history, when only some
 * entries are wanted: the positions then stay the positions in the document (R2.8) and the ids stay unique across the view.
 */
export function indexHistory(history: readonly HistoryEntry[], dayKeyOf: DayKeyFn): Indexed[] {
  return history.map((entry, index) => ({ entry, index, dayKey: dayKeyOf(entry.endedAt), id: `${entry.startedAt}:${entry.endedAt}:${index}` }));
}

/** Groups indexed entries by their day: groups newest day first (R2.6), items newest first (R2.7). The input is not changed. */
export function groupIndexed(items: readonly Indexed[]): readonly DayGroup[] {
  const byDay = new Map<DayKey, Indexed[]>();
  for (const item of items) {
    const group = byDay.get(item.dayKey);
    if (group) group.push(item);
    else byDay.set(item.dayKey, [item]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a === b ? 0 : a < b ? 1 : -1))
    .map(([dayKey, group]) => ({ dayKey, items: group.sort(newestFirst) }));
}

/**
 * Every entry in exactly one group (R2.1); groups newest day first (R2.6), items newest first (R2.7). The key is the local day of
 * the end time, never of the start and never the UTC day. The input is not changed.
 */
export function groupByDay(history: readonly HistoryEntry[], dayKeyOf: DayKeyFn): readonly DayGroup[] {
  return groupIndexed(indexHistory(history, dayKeyOf));
}

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a leap year of the Gregorian calendar. */
const isLeap = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** The number of days in a month 1 to 12 of a year. */
const daysInMonth = (year: number, month: number): number => (month === 2 ? (isLeap(year) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31);

/**
 * "10 Nov" from "2026-11-10": the day without a leading zero and the short month name, filled into the template of
 * `STRINGS.graveyard.carvedDate`. No year and no time of day (R2.10). Anything that is not a real calendar day written as
 * `YYYY-MM-DD` (null, undefined, a wrong separator, month 00 or 13, day 00 or 32, a day the month does not have such as
 * 2026-02-30) gives `STRINGS.graveyard.unknownDate`. Total: it never throws. The Stone, the Day_Shelf label, the Item name and
 * the Details_Card all call this (R2.9; sound-and-title R8.9, R8.10).
 */
export function formatCarvedDate(dayKey: DayKey | null | undefined): string {
  if (typeof dayKey !== "string") return STRINGS.graveyard.unknownDate;
  const match = DAY_KEY.exec(dayKey);
  if (!match) return STRINGS.graveyard.unknownDate;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const name = STRINGS.graveyard.months[month - 1];
  if (name === undefined || day < 1 || day > daysInMonth(year, month)) return STRINGS.graveyard.unknownDate;
  return fill(STRINGS.graveyard.carvedDate, { day, month: name });
}

/** Builds a key from calendar parts, padded to `YYYY-MM-DD`. The only place that builds a key, so every `DayKeyFn` agrees on the format. */
export function dayKeyFromParts(year: number, month1: number, day: number): DayKey {
  return `${String(year).padStart(4, "0")}-${String(month1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
