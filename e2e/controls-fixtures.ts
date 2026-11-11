// Helpers for the interface's browser tests (controls-and-access design 13.3).
// Stored state is built in Node with the engine and the storage key names; the clock is Playwright's `page.clock`; nothing
// in the shipped code is there for the tests. Time moves only when a test moves it (`settle`, `runFor`, `fastForward`).
import { expect } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { restoreState, serializeHistory, serializeSession } from "../src/engine";
import type { State } from "../src/engine";
import { placeControls } from "../src/ui/layout";
import type { Placement } from "../src/ui/layout";
import { HISTORY_KEY, SESSION_KEY } from "../src/storage/storage";
import { SETTINGS_KEY } from "../src/storage/settings";
import { fontsLoaded } from "./font-fixtures";
import { MIN, T0, VIEWPORTS } from "./scene-fixtures";
import type { Fixture } from "./scene-fixtures";

export { FIXTURES, MIN, T0, VIEWPORTS } from "./scene-fixtures";
export { fontsLoaded, judgeFigures, platformFonts, readFigures } from "./font-fixtures";
export type { Fixture } from "./scene-fixtures";

export const SEC = 1000;
export const phone = VIEWPORTS.phone;
export const desktop = VIEWPORTS.desktop;
export const tablet = VIEWPORTS.tablet;
export const wide = VIEWPORTS.wide;
/** A very wide viewport: the controls must still be inside it and visible. */
export const huge = { width: 3840, height: 1860 } as const;

export interface AppOptions {
  /** A stored state from `scene-fixtures.ts`, or none (a first visit). Its `now` is the clock unless `now` is given. */
  readonly fixture?: Fixture | null;
  readonly now?: number;
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly reducedMotion?: boolean;
  readonly touch?: boolean;
  /** A phone: touch only, no fine pointer (`any-pointer: fine` is false). */
  readonly mobile?: boolean;
  /** Raw text for the settings key. */
  readonly settings?: string;
  /** Source of scripts to run in the page before it loads, after the live-region recorder. */
  readonly initScripts?: readonly string[];
}

export interface App {
  /** Page errors and console errors seen since the page was opened. */
  readonly errors: string[];
  readonly page: Page;
  readonly context: BrowserContext;
  close(): Promise<void>;
}

/** Records each distinct text of the live region (the empty clear included as a gap) with the clock when it appeared. */
const LIVE_RECORDER = `
(() => {
  window.__live = [];
  let last = "";
  const read = () => {
    const el = document.getElementById("live");
    if (!el) return;
    const text = el.textContent || "";
    if (text === last) return;
    last = text;
    if (text) window.__live.push({ text, at: Date.now() });
  };
  new MutationObserver(read).observe(document, { subtree: true, childList: true, characterData: true });
})();
`;

/**
 * Opens the page the way a visitor would, with the clock frozen: stored state if a fixture is given, the viewport, reduced
 * motion and touch as asked. The page loads 5 s before `now`, the clock is paused 100 ms before it and run 140 ms, so the last
 * frame is drawn at or after `now` (as `openScene` does).
 */
export async function openApp(browser: Browser, options: AppOptions = {}): Promise<App> {
  const fixture = options.fixture ?? null;
  const now = options.now ?? fixture?.now ?? T0;
  const context = await browser.newContext({
    viewport: options.viewport ?? desktop,
    reducedMotion: options.reducedMotion ? "reduce" : "no-preference",
    hasTouch: options.touch === true || options.mobile === true,
    isMobile: options.mobile === true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  await page.addInitScript(LIVE_RECORDER);
  for (const script of options.initScripts ?? []) await page.addInitScript(script);
  if (fixture?.state) {
    await page.addInitScript(
      ({ sessionKey, historyKey, session, history }) => {
        if (session !== null) localStorage.setItem(sessionKey, session);
        localStorage.setItem(historyKey, history);
      },
      {
        sessionKey: SESSION_KEY,
        historyKey: HISTORY_KEY,
        session: serializeSession(fixture.state),
        history: serializeHistory(fixture.state.history),
      },
    );
  }
  if (options.settings !== undefined) {
    await page.addInitScript(({ key, text }) => localStorage.setItem(key, text), { key: SETTINGS_KEY, text: options.settings });
  }
  await page.clock.install({ time: now - 5000 });
  await page.goto("/");
  await page.clock.pauseAt(now - 100);
  await page.clock.runFor(140);
  await expect(page.locator("#scene")).toHaveAttribute("data-settled", "true");
  // The web fonts load after the page does; every picture and every measurement is taken with both families in place.
  await fontsLoaded(page);
  return { errors, page, context, close: () => context.close() };
}

/** Three frames: enough for the view to be applied and focus to have moved. */
export async function settle(page: Page): Promise<void> {
  await page.clock.runFor(48);
}

/** Jumps the clock (a sleeping laptop, a throttled tab) and lets the page redraw once. */
export async function jump(page: Page, ms: number): Promise<void> {
  await page.clock.fastForward(ms);
  await settle(page);
}

export const clockNow = (page: Page): Promise<number> => page.evaluate(() => Date.now());

/** The stored state, read back with the engine's own restore (the session key and the history key). */
export async function storedState(page: Page): Promise<State> {
  const [session, history] = await page.evaluate(([s, h]) => [localStorage.getItem(s as string), localStorage.getItem(h as string)], [SESSION_KEY, HISTORY_KEY]);
  return restoreState(session, history);
}

export const storedSession = storedState;

/** The raw stored session text (for byte-equality checks). */
export const rawSession = (page: Page): Promise<string | null> => page.evaluate((k) => localStorage.getItem(k), SESSION_KEY);

export const timeText = async (page: Page): Promise<string> => (await page.locator("#time").textContent()) ?? "";
export const statusText = async (page: Page): Promise<string> => (await page.locator("#status").textContent()) ?? "";

export interface LiveEntry {
  readonly text: string;
  readonly at: number;
}
export const liveLog = (page: Page): Promise<LiveEntry[]> => page.evaluate(() => (window as unknown as { __live: LiveEntry[] }).__live);
export const liveTexts = async (page: Page): Promise<string[]> => (await liveLog(page)).map((e) => e.text);

export interface Focused {
  readonly id: string;
  readonly name: string;
  readonly tag: string;
}
/** The id and accessible name (aria-label, else text) of `document.activeElement`. */
export const focused = (page: Page): Promise<Focused> =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return { id: "", name: "", tag: "" };
    return { id: el.id, name: el.getAttribute("aria-label") ?? (el.textContent ?? "").trim(), tag: el.tagName.toLowerCase() };
  });

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
/** The page's rectangle of the first element matching `selector`, or null when it has no box (hidden). */
export const rectOf = (page: Page, selector: string): Promise<Rect | null> =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el || el.getClientRects().length === 0) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }, selector);

export const expectedPlacement = (vw: number, vh: number): Placement => placeControls(vw, vh);

export const sceneAttr = (page: Page, name: string): Promise<string | null> => page.locator("#scene").getAttribute(name);
export const phaseOf = (page: Page): Promise<string | null> => sceneAttr(page, "data-phase");
export const flameOf = (page: Page): Promise<string | null> => sceneAttr(page, "data-flame");

/** A key press followed by a settle, the unit of every keyboard script. */
export async function press(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await settle(page);
}

/** True when the rectangles overlap by more than `slack` pixels in both directions. */
export function intersects(a: Rect, b: Rect, slack = 0): boolean {
  return a.x < b.x + b.w - slack && b.x < a.x + a.w - slack && a.y < b.y + b.h - slack && b.y < a.y + a.h - slack;
}

export { MIN as MINUTE };

// --- layout checks shared by E3 and E14 ---------------------------------------

const rectAlmost = (actual: Rect, expected: { x: number; y: number; w: number; h: number }, label: string, tolerance = 1): void => {
  expect(Math.abs(actual.x - expected.x), `${label} x ${actual.x} vs ${expected.x}`).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.y - expected.y), `${label} y ${actual.y} vs ${expected.y}`).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.w - expected.w), `${label} w ${actual.w} vs ${expected.w}`).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.h - expected.h), `${label} h ${actual.h} vs ${expected.h}`).toBeLessThanOrEqual(tolerance);
};

export interface LayoutReading {
  /** Every visible control or text of the interface, by selector, with its rectangle. */
  readonly seen: Record<string, Rect>;
  readonly running: boolean;
}

const CONTROL_SELECTORS = ["#length", "#length-error", "#intent-box", "#light", "#pause", "#snuff", "#settings-button", "#time", "#status"] as const;

/**
 * Compares what the page shows with `placeControls(vw, vh)` within 1 px (design 13.3, E3 and E14): the rectangle of each visible
 * control and text, the dialogs (same corner and width, height up to the placed maximum), the chooser's cells, and, while a session
 * runs, that nothing persistent is above the top of `.zone-text-area`. Returns what it saw.
 */
export async function checkLayoutNow(page: Page, vw: number, vh: number): Promise<LayoutReading> {
  const p = placeControls(vw, vh);
  const seen: Record<string, Rect> = {};
  for (const selector of CONTROL_SELECTORS) {
    const r = await rectOf(page, selector);
    if (r) seen[selector] = r;
  }
  const running = seen["#pause"] !== undefined;
  const expected: Record<string, Rect> = {
    "#length": p.setup.chooser,
    "#length-error": p.setup.lengthError ?? p.setup.chooser,
    "#intent-box": p.setup.intent,
    "#light": p.setup.light,
    "#pause": p.zoneControls.pause,
    "#snuff": p.zoneControls.snuff,
    "#settings-button": p.zoneControls.settings,
    "#time": p.time,
    "#status": running ? p.statusRunning : p.statusResting,
  };
  for (const [selector, rect] of Object.entries(seen)) rectAlmost(rect, expected[selector] as Rect, selector);
  // The setup controls are shown together; Pause and Let it go dark together; Settings and the time text always.
  expect(seen["#settings-button"], "Settings is always shown").toBeDefined();
  expect(seen["#time"], "the time text is always shown").toBeDefined();
  expect(seen["#snuff"] !== undefined, "Pause and Let it go dark come together").toBe(running);
  expect(seen["#light"] !== undefined, "Light is shown when no candle burns").toBe(!running);
  if (!running) {
    const cells = await page.evaluate(() => [...document.querySelectorAll("#length .cell, #length .custom-cell")].map((el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    }));
    expect(cells).toHaveLength(4);
    cells.forEach((cell, i) => rectAlmost(cell, p.setup.cells[i] as Rect, `cell ${i}`));
  }
  for (const [selector, placed] of [["#snuff-dialog[open]", p.snuffDialog], ["#settings-dialog[open]", p.settingsPanel]] as const) {
    const r = await rectOf(page, selector);
    if (r) {
      rectAlmost({ ...r, h: placed.h }, placed, selector);
      expect(r.h, `${selector} is no taller than its place`).toBeLessThanOrEqual(placed.h + 1);
    }
  }
  const area = await rectOf(page, ".zone-text-area");
  expect(area).not.toBeNull();
  const time = seen["#time"] as Rect;
  const text = area as Rect;
  expect(time.x).toBeGreaterThanOrEqual(text.x - 1);
  expect(time.y).toBeGreaterThanOrEqual(text.y - 1);
  expect(time.x + time.w).toBeLessThanOrEqual(text.x + text.w + 1);
  expect(time.y + time.h).toBeLessThanOrEqual(text.y + text.h + 1);
  if (running) for (const [selector, rect] of Object.entries(seen)) expect(rect.y, `${selector} is not above the zone while a session runs`).toBeGreaterThanOrEqual(text.y - 1);
  return { seen, running };
}
