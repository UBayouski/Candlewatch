// Shared helpers for the graveyard's tests (ghosts-and-graveyard design 8.2). Imported only by tests, never by source:
// the purity test of this folder checks it. Arbitraries are added here by the task that first needs them; one used by a single
// property file stays in that file.
import * as fc from "fast-check";
import type { HistoryEntry, State } from "../engine";
import { arbEntry as arbEngineEntry } from "../engine/test-kit";
import type { KeyDescriptor } from "../ui/keys";
import type { CardInput } from "./card";
import { dayKeyFromParts } from "./days";
import type { DayKey, DayKeyFn } from "./days";
import type { ViewInput } from "./view";

export { PROP_PARAMS } from "../engine/test-kit";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** The key of the instants no calendar can name (NaN, infinite or past the range of a Date): it formats as the unknown date. */
const NO_DAY: DayKey = dayKeyFromParts(0, 0, 0);

// --- day functions: no test reads the machine's time zone (R11.2) -------------------------------------------------------

/** A `DayKeyFn` for a fixed UTC offset in hours (negative west of Greenwich, fractions allowed): every day is 24 hours long. */
export function fixedOffsetDay(hours: number): DayKeyFn {
  return (ms) => {
    if (!Number.isFinite(ms)) return NO_DAY;
    const d = new Date(ms + hours * HOUR_MS);
    if (Number.isNaN(d.getTime())) return NO_DAY;
    return dayKeyFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  };
}

/** Day 0 of the hand-written calendar of `dstJumpDay`: 1 March 2026, 00:00 UTC. */
const DST_BASE = Date.UTC(2026, 2, 1);
/** Day 10 of that calendar is the 23-hour day (the clocks go forward) and day 20 is the 25-hour day (they go back). */
export const DST_SHORT_DAY_INDEX = 10;
export const DST_LONG_DAY_INDEX = 20;

/** First instant of day `i` (any integer) of the hand-written calendar. Day i lasts 24 hours except days 10 (23) and 20 (25). */
export function dstDayStart(i: number): number {
  const shift = i > DST_LONG_DAY_INDEX ? 0 : i > DST_SHORT_DAY_INDEX ? -HOUR_MS : 0;
  return DST_BASE + i * DAY_MS + shift;
}

/** The 23-hour day and the 25-hour day as half-open ranges `[start, end)` of `dstJumpDay`. */
export const DST_SHORT_DAY = { start: dstDayStart(DST_SHORT_DAY_INDEX), end: dstDayStart(DST_SHORT_DAY_INDEX + 1) } as const;
export const DST_LONG_DAY = { start: dstDayStart(DST_LONG_DAY_INDEX), end: dstDayStart(DST_LONG_DAY_INDEX + 1) } as const;

/**
 * A hand-written `DayKeyFn` whose calendar has one 23-hour day and one 25-hour day, like a spring and an autumn change of the
 * clocks. The key of day i is the UTC date i days after 1 March 2026, so the function reads no local time and no time zone.
 * `NO_DAY` for an instant that is not a finite, representable time.
 */
export const dstJumpDay: DayKeyFn = (ms) => {
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.6e15) return NO_DAY;
  let i = Math.floor((ms - DST_BASE) / DAY_MS);
  while (dstDayStart(i) > ms) i--;
  while (dstDayStart(i + 1) <= ms) i++;
  const label = new Date(Date.UTC(2026, 2, 1 + i));
  if (Number.isNaN(label.getTime())) return NO_DAY;
  return dayKeyFromParts(label.getUTCFullYear(), label.getUTCMonth() + 1, label.getUTCDate());
};

/**
 * Any of the day functions the tests use: whole-hour offsets from UTC-12 to UTC+14, a few offsets with a fraction of an hour, and
 * the hand-written calendar with a 23-hour and a 25-hour day. All of them are non-decreasing in time, as a calendar is.
 */
export const arbDayKeyFn: fc.Arbitrary<DayKeyFn> = fc.oneof(
  { weight: 4, arbitrary: fc.integer({ min: -12, max: 14 }).map(fixedOffsetDay) },
  { weight: 2, arbitrary: fc.constantFrom(5.5, -3.5, 12.75, -9.5, 5.75).map(fixedOffsetDay) },
  { weight: 2, arbitrary: fc.constant(dstJumpDay) },
);

// --- history entries and histories --------------------------------------------------------------------------------------

/** The first day of the clusters: 1 October 2026, 00:00 UTC. */
export const CLUSTER_DAY0 = Date.UTC(2026, 9, 1);

/** Offsets into a day that sit on the edges: the first and last millisecond, the hour marks and the instant on either side of them. */
const arbEdgeOffset = fc
  .tuple(fc.integer({ min: 0, max: 24 }), fc.constantFrom(-1, 0, 1))
  .map(([hour, nudge]) => Math.min(DAY_MS - 1, Math.max(0, hour * HOUR_MS + nudge)));

/**
 * A history entry whose end time lies in one of `days` consecutive days (by UTC, near the days of most fixed offsets), so a
 * generated history has several entries per day. Everything else comes from the engine's `arbEntry`: both outcomes, intents that
 * are normalised text or `null`, lengths, distractions, time away. The length of the session is kept.
 */
export const arbEntryInDays = (days: number): fc.Arbitrary<HistoryEntry> =>
  fc
    .record({
      base: arbEngineEntry,
      dayIndex: fc.integer({ min: 0, max: days - 1 }),
      offsetMs: fc.oneof({ weight: 4, arbitrary: fc.integer({ min: 0, max: DAY_MS - 1 }) }, { weight: 2, arbitrary: arbEdgeOffset }),
    })
    .map(({ base, dayIndex, offsetMs }) => {
      const endedAt = CLUSTER_DAY0 + dayIndex * DAY_MS + offsetMs;
      return { ...base, endedAt, startedAt: endedAt - (base.endedAt - base.startedAt) };
    });

/** Entries spread over seven days. */
export const arbEntry: fc.Arbitrary<HistoryEntry> = arbEntryInDays(7);

/** The first entry of each `(startedAt, endedAt)` pair, in order: what `appendEntry` allows in a valid history document. */
export function uniquePairs(entries: readonly HistoryEntry[]): HistoryEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const pair = `${e.startedAt}:${e.endedAt}`;
    if (seen.has(pair)) return false;
    seen.add(pair);
    return true;
  });
}

/** 0 to 40 entries in clusters of days, with unique `(startedAt, endedAt)` pairs (a valid document), in any order. */
export const arbHistory: fc.Arbitrary<HistoryEntry[]> = fc.array(arbEntry, { maxLength: 40 }).map(uniquePairs);

/** 12 to 40 entries on only two days, so a day holds many stubs and many stones: the histories where the limits cut. Unique pairs. */
export const arbCrowdedHistory: fc.Arbitrary<HistoryEntry[]> = fc.array(arbEntryInDays(2), { minLength: 12, maxLength: 40 }).map(uniquePairs);

// --- limits -------------------------------------------------------------------------------------------------------------

export interface LimitCounts {
  readonly S: number;
  readonly D: number;
  readonly K: number;
}

/** The defaults of Decision L8: 10 stones, 3 days, 4 stubs a day. `visible.ts` (task 3.4) exports the same numbers as `DEFAULT_LIMITS`. */
export const DEFAULT_LIMIT_COUNTS: LimitCounts = { S: 10, D: 3, K: 4 };

/** The three limits, each 0 to 15, one time in five the defaults. The day function is added by the test. */
export const arbLimits: fc.Arbitrary<LimitCounts> = fc.oneof(
  { weight: 4, arbitrary: fc.record({ S: fc.integer({ min: 0, max: 15 }), D: fc.integer({ min: 0, max: 15 }), K: fc.integer({ min: 0, max: 15 }) }) },
  { weight: 1, arbitrary: fc.constant(DEFAULT_LIMIT_COUNTS) },
);

// --- roving focus -------------------------------------------------------------------------------------------------------

/**
 * A layout for roving focus: 0 to 10 Stones ("s0", "s1", ...) and 0 to 3 Day_Shelf rows of 1 to 4 Stubs ("t0_0", "t1_2", ...).
 * Ids are unique over the whole layout and never shared between the Groups. Ask for `size: "max"` so 10 ids and 3 rows come often.
 */
export const arbNavLayout: fc.Arbitrary<{ readonly graveyard: readonly string[]; readonly shelf: readonly (readonly string[])[] }> = fc
  .record({
    stones: fc.integer({ min: 0, max: 10 }),
    rows: fc.array(fc.integer({ min: 1, max: 4 }), { maxLength: 3, size: "max" }),
  })
  .map(({ stones, rows }) => ({
    graveyard: Array.from({ length: stones }, (_, i) => `s${i}`),
    shelf: rows.map((length, r) => Array.from({ length }, (_, j) => `t${r}_${j}`)),
  }));

// --- the Details_Card ---------------------------------------------------------------------------------------------------

/**
 * 0 to 40 card inputs over a pool of 3 to 5 ids (so the same id recurs): focus, blur, hover, unhover, tap, tap-away, escape and
 * clear. Ask for `size: "max"` so long lists come often.
 */
export const arbCardInputs: fc.Arbitrary<CardInput[]> = fc
  .integer({ min: 3, max: 5 })
  .chain((count) => {
    const arbId = fc.integer({ min: 0, max: count - 1 }).map((i) => `c${i}`);
    return fc.array(
      fc.oneof(
        { weight: 3, arbitrary: arbId.map((id): CardInput => ({ type: "focus", id })) },
        { weight: 2, arbitrary: arbId.map((id): CardInput => ({ type: "blur", id })) },
        { weight: 3, arbitrary: arbId.map((id): CardInput => ({ type: "hover", id })) },
        { weight: 2, arbitrary: arbId.map((id): CardInput => ({ type: "unhover", id })) },
        { weight: 3, arbitrary: arbId.map((id): CardInput => ({ type: "tap", id })) },
        { weight: 2, arbitrary: fc.constant<CardInput>({ type: "tap-away" }) },
        { weight: 2, arbitrary: fc.constant<CardInput>({ type: "escape" }) },
        { weight: 1, arbitrary: fc.constant<CardInput>({ type: "clear" }) },
      ),
      { maxLength: 40, size: "max" },
    );
  });

// --- the view switch ----------------------------------------------------------------------------------------------------
/** Any of the five phases of the engine's model. */
export const arbPhase: fc.Arbitrary<State["phase"]> = fc.constantFrom<State["phase"]>("idle", "lit", "paused", "burned-out", "snuffed");

/**
 * 0 to 40 view inputs over all phases: `open` (with the phase the Door sees), `leave` and `phase` (the frame's phase). Ask for
 * `size: "max"` so long sequences come often, with runs of phases that open and close the view several times.
 */
export const arbViewScript: fc.Arbitrary<ViewInput[]> = fc.array(
  fc.oneof(
    { weight: 3, arbitrary: arbPhase.map((phase): ViewInput => ({ type: "open", phase })) },
    { weight: 2, arbitrary: fc.constant<ViewInput>({ type: "leave" }) },
    { weight: 4, arbitrary: arbPhase.map((phase): ViewInput => ({ type: "phase", phase })) },
  ),
  { maxLength: 40, size: "max" },
);

// --- the graveyard key map ----------------------------------------------------------------------------------------------

/** The keys of the Room map (Enter, Space, Escape, t, T), the nav keys, g and G, other letters and a few named keys. */
const GRAVE_KEY_NAMES: readonly string[] = [
  "Enter", " ", "Escape", "t", "T",
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End",
  "g", "G", "a", "x", "Z", "1", "5",
  "Tab", "Backspace", "Delete", "PageUp", "PageDown", "F1",
];

/**
 * A key press for the key maps (R3.3, R6.15 to R6.17): any of the keys above, with random Ctrl, Alt, Meta, Shift and `repeat`.
 * Plain presses come most often, so the acting branches are reached; `g` is weighted so the Door key is tried in every context.
 */
export const arbGraveKey: fc.Arbitrary<KeyDescriptor> = fc.record({
  key: fc.oneof({ weight: 5, arbitrary: fc.constantFrom(...GRAVE_KEY_NAMES) }, { weight: 3, arbitrary: fc.constantFrom("g", "G") }),
  ctrl: fc.oneof({ weight: 5, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.boolean() }),
  alt: fc.oneof({ weight: 5, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.boolean() }),
  meta: fc.oneof({ weight: 5, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.boolean() }),
  shift: fc.boolean(),
  repeat: fc.oneof({ weight: 5, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.boolean() }),
});
