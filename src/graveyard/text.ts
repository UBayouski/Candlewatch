// The words of the graveyard and the shelf (ghosts-and-graveyard design 3.3, R4, R5, R7, R8). Pure and total: every function
// returns the same text for equal inputs, and every wording comes from `src/strings.ts`.
import type { HistoryEntry } from "../engine";
import { STRINGS } from "../strings";
import { fill, spokenTime } from "../ui/format";
import { formatCarvedDate } from "./days";
import type { Indexed } from "./days";

/** The intent when it is a non-empty string, else the placeholder line (R4.3, R5.2, R7.2). The Stone, the card and the Item name all use it. */
export function stoneIntent(entry: HistoryEntry): string {
  return typeof entry.intent === "string" && entry.intent !== "" ? entry.intent : STRINGS.graveyard.noIntent;
}

/** The accessible name of an Item: the intent (or the placeholder) and the Carved_Date, "Write the essay, 10 Nov" (R7.1, R7.2). */
export function itemName(item: Indexed): string {
  return fill(STRINGS.graveyard.itemName, { intent: stoneIntent(item.entry), date: formatCarvedDate(item.dayKey) });
}

/**
 * The five lines of the Details_Card, in this order (R5.1, R5.12, R5.13): the intent or the placeholder; the Carved_Date; the
 * planned length ("1 minute", "25 minutes"); the distractions as plain digits ("Distractions: 3", no words for the count); the
 * time away in words.
 */
export function cardLines(item: Indexed): readonly string[] {
  const { entry } = item;
  const planned = fill(entry.lengthMin === 1 ? STRINGS.time.minute : STRINGS.time.minutes, { n: entry.lengthMin });
  return [
    stoneIntent(entry),
    formatCarvedDate(item.dayKey),
    fill(STRINGS.graveyard.card.planned, { time: planned }),
    fill(STRINGS.graveyard.card.distractions, { n: entry.distractions }),
    fill(STRINGS.graveyard.card.away, { time: spokenTime(entry.timeAwayMs) }),
  ];
}

/** A hidden count as a whole number, 0 when it is not a count at all: the lines below are `null` exactly when this is 0. */
const whole = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** "38 older stones not shown", or `null` when nothing is hidden: a missing value, not an empty string (R8.8, R8.10). */
export function stonesCountLine(hidden: number): string | null {
  const n = whole(hidden);
  return n === 0 ? null : fill(n === 1 ? STRINGS.graveyard.olderStone : STRINGS.graveyard.olderStones, { n });
}

/** "12 older days not shown", or `null` when nothing is hidden (R8.9, R8.10). */
export function daysCountLine(hidden: number): string | null {
  const n = whole(hidden);
  return n === 0 ? null : fill(n === 1 ? STRINGS.graveyard.olderDay : STRINGS.graveyard.olderDays, { n });
}

/** "+3 more" for the stubs of a day that are not drawn, or `null` when none is hidden (R8.5). */
export function moreText(hiddenStubs: number): string | null {
  const n = whole(hiddenStubs);
  return n === 0 ? null : fill(STRINGS.graveyard.more, { n });
}
