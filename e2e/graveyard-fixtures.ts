// Helpers for the ghosts and the graveyard in a real browser (ghosts-and-graveyard R11.3, R11.4).
// Every stored session and history is built in Node with the engine's own serializers and the storage key names, and written
// through `addInitScript` by `openApp`: no hook in shipped code.
import type { Browser, Page } from "@playwright/test";
import type { HistoryEntry, Outcome, Session, State } from "../src/engine";
import { MIN, T0, VIEWPORTS, openApp, rectOf } from "./controls-fixtures";
import type { App, Fixture, Rect } from "./controls-fixtures";

export { focused } from "./controls-fixtures";
export { rectOf };
export { MIN, T0, VIEWPORTS };
export type { App, Fixture, Rect };

export const DAY = 24 * 60 * MIN;

/** The viewports of the plan: phone 360 x 640, desktop 1280 x 800, 768 x 1024 and 1920 x 1080. */
export const GRAVEYARD_VIEWPORTS = [VIEWPORTS.phone, VIEWPORTS.desktop, VIEWPORTS.tablet, VIEWPORTS.wide] as const;

// --- histories ---------------------------------------------------------------

export interface EntrySpec {
  readonly endedAt: number;
  readonly lengthMin?: number;
  readonly intent?: string | null;
  readonly outcome?: Outcome;
  readonly distractions?: number;
  readonly timeAwayMs?: number;
}

/** One finished session that ended at `endedAt` and ran for its planned length (or, snuffed, for half of it). */
export function entryAt(spec: EntrySpec): HistoryEntry {
  const lengthMin = spec.lengthMin ?? 25;
  const outcome = spec.outcome ?? "burned-out";
  const ranMs = outcome === "burned-out" ? lengthMin * MIN : Math.floor((lengthMin * MIN) / 2);
  return {
    startedAt: spec.endedAt - ranMs,
    endedAt: spec.endedAt,
    lengthMin,
    intent: spec.intent ?? null,
    outcome,
    distractions: spec.distractions ?? 0,
    timeAwayMs: spec.timeAwayMs ?? 0,
  };
}

/** The stored history sorts by end time, oldest first (an append-only list). */
const sorted = (entries: readonly HistoryEntry[]): HistoryEntry[] => [...entries].sort((a, b) => a.endedAt - b.endedAt);

/** The days of the small history end at noon on these instants, so a local day cannot straddle midnight in any time zone within a few hours. */
const NOON = T0 - 8 * 60 * MIN;

/** Four entries over two days: a stone with an intent, a stone without, and two stubs. */
export const smallHistory: readonly HistoryEntry[] = sorted([
  entryAt({ endedAt: NOON - 2 * DAY, outcome: "snuffed", lengthMin: 25, intent: "Write the report", distractions: 2, timeAwayMs: 90_000 }),
  entryAt({ endedAt: NOON - 2 * DAY + 3 * 60 * MIN, outcome: "burned-out", lengthMin: 50, intent: "Review the draft", distractions: 1, timeAwayMs: 20_000 }),
  entryAt({ endedAt: NOON - 1 * DAY, outcome: "snuffed", lengthMin: 15 }),
  entryAt({ endedAt: NOON - 1 * DAY + 2 * 60 * MIN, outcome: "burned-out", lengthMin: 25, intent: null, distractions: 0 }),
]);

const LONG_INTENT = "Finish the quarterly lighthouse inspection report and send it to the harbour office before the tide turns";

/** `n` finished sessions over `days` days, ending before `NOON`, both outcomes alternating, every seventh intent long. */
export function spreadHistory(n: number, days: number): HistoryEntry[] {
  return sorted(
    Array.from({ length: n }, (_, i) => {
      const day = Math.floor((i * days) / Math.max(n, 1));
      const slot = i % 6;
      return entryAt({
        endedAt: NOON - (days - day) * DAY + slot * 60 * MIN,
        outcome: i % 3 === 0 ? "snuffed" : "burned-out",
        lengthMin: [15, 25, 50][i % 3] ?? 25,
        intent: i % 7 === 0 ? LONG_INTENT : i % 5 === 0 ? null : `Task ${i + 1}`,
        distractions: i % 4,
        timeAwayMs: (i % 4) * 30_000,
      });
    }),
  );
}

/** 200 sessions over 45 days, with both outcomes and long intents. */
export const largeHistory: readonly HistoryEntry[] = spreadHistory(200, 45);

/** A history of exactly `n` entries (the days follow `n`: about five a day). */
export const historyWith = (n: number): readonly HistoryEntry[] => spreadHistory(n, Math.max(1, Math.ceil(n / 5)));

// --- stored states -----------------------------------------------------------

/** A session of `lengthMin` that started at `startedAt`, with `n` completed distractions of 20 s each. */
export function sessionWith(startedAt: number, lengthMin: number, n: number): Session {
  const awaySpansMs = Array.from({ length: n }, (_, i) => 10_000 + 5_000 * (i % 7));
  return { startedAt, lengthMin, intent: null, pausedTotalMs: 0, distractions: n, timeAwayMs: awaySpansMs.reduce((a, b) => a + b, 0), awaySpansMs };
}

export type Phase = State["phase"];

/** A stored state in `phase` with `history` behind it and `distractions` ghosts this session. The clock is `fixture.now`. */
export function graveyardFixture(name: string, phase: Phase, history: readonly HistoryEntry[] = [], distractions = 0): Fixture {
  const lengthMin = 25;
  const startedAt = T0;
  const session = sessionWith(startedAt, lengthMin, distractions);
  switch (phase) {
    case "idle":
      return { name, state: { phase: "idle", history }, now: T0 };
    case "lit":
      return { name, state: { phase: "lit", history, session, litSince: startedAt, awaySince: null }, now: T0 + 5 * MIN };
    case "paused":
      return { name, state: { phase: "paused", history, session, pausedAt: T0 + 5 * MIN }, now: T0 + 6 * MIN };
    case "burned-out": {
      const endedAt = T0 + lengthMin * MIN;
      const finished = entryAt({ endedAt, lengthMin, distractions, timeAwayMs: session.timeAwayMs });
      return { name, state: { phase: "burned-out", history: sorted([...history, { ...finished, startedAt }]), session, endedAt, breakEndsAt: endedAt + 5 * MIN }, now: endedAt + MIN };
    }
    case "snuffed": {
      const endedAt = T0 + 7 * MIN;
      const finished = entryAt({ endedAt, lengthMin, outcome: "snuffed", distractions, timeAwayMs: session.timeAwayMs });
      return { name, state: { phase: "snuffed", history: sorted([...history, { ...finished, startedAt }]), session, endedAt }, now: endedAt + MIN };
    }
  }
}

/** A lit session, 5 minutes in, with `n` distractions (0, 1, 12 or 21 in the plan). */
export const withDistractions = (n: number, phase: "lit" | "burned-out" | "snuffed" = "lit", history: readonly HistoryEntry[] = []): Fixture =>
  graveyardFixture(`${phase}-${n}-distractions`, phase, history, n);

// --- opening the page --------------------------------------------------------

export interface GraveyardOptions {
  readonly fixture: Fixture;
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly reducedMotion?: boolean;
  /** Touch only (a phone): taps instead of hovers. */
  readonly touch?: boolean;
  readonly mobile?: boolean;
  readonly settings?: string;
}

/** Opens the page with the fixture stored and the clock frozen at its `now` (a thin layer over `openApp`). */
export function openGraveyardApp(browser: Browser, options: GraveyardOptions): Promise<App> {
  return openApp(browser, options);
}

// --- reading the page --------------------------------------------------------

export interface DoorState {
  /** The Door button exists and is shown (not `hidden`). */
  readonly buttonShown: boolean;
  /** The shut door exists and is shown. */
  readonly shutShown: boolean;
}

/** The `hidden` flags of the Door button and of the shut door (the DOM check of Property 4). */
export const doorState = (page: Page): Promise<DoorState> =>
  page.evaluate(() => {
    const button = document.querySelector<HTMLElement>("#graveyard #door");
    const shut = document.querySelector<HTMLElement>("#graveyard .door-shut");
    return { buttonShown: button !== null && !button.hidden, shutShown: shut !== null && !shut.hidden };
  });

/** The ids of the drawn Items (stones and stubs) in DOM order. */
export const itemIds = (page: Page): Promise<string[]> => page.evaluate(() => [...document.querySelectorAll("#graveyard button.item")].map((el) => el.id));

/** Whether the page scrolls in either direction. */
export const scrolls = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight;
  });

/** The current view: `room` or `graveyard` (the section's `data-view`). */
export const viewOf = (page: Page): Promise<string | null> => page.locator("#graveyard").getAttribute("data-view");
