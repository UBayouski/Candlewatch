// Fixtures and helpers for the scene's browser tests (candle-scene design 11.1, 11.2).
// Every stored session is built in Node with the engine and the storage key names, never by hand.
import { expect } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { INITIAL_STATE, serializeHistory, serializeSession, step } from "../src/engine";
import type { State } from "../src/engine";
import { HISTORY_KEY, SESSION_KEY } from "../src/storage/storage";

export const T0 = Date.UTC(2026, 10, 10, 20, 0, 0);
export const MIN = 60_000;

const lit = (lengthMin = 25): State => step(INITIAL_STATE, { type: "light", length: lengthMin }, T0);

export interface Fixture {
  /** Screenshot name: the state, e.g. `lit-half`. */
  readonly name: string;
  /** The stored state, or null for a first visit (nothing stored). */
  readonly state: State | null;
  /** The faked clock when the page is looked at. */
  readonly now: number;
}

export const FIXTURES = {
  idle: { name: "idle", state: null, now: T0 },
  litStart: { name: "lit-start", state: lit(), now: T0 },
  litHalf: { name: "lit-half", state: lit(), now: T0 + 12.5 * MIN },
  litLastMinute: { name: "lit-last-minute", state: lit(), now: T0 + 24.5 * MIN },
  paused: { name: "paused", state: step(lit(), { type: "pause" }, T0 + 10 * MIN), now: T0 + 11 * MIN },
  burnedOut: { name: "burned-out", state: step(lit(), { type: "tick" }, T0 + 25 * MIN), now: T0 + 26 * MIN },
  burnedOutAfterBreak: { name: "burned-out-after-break", state: step(lit(), { type: "tick" }, T0 + 25 * MIN), now: T0 + 31 * MIN },
  snuffed: { name: "snuffed", state: step(lit(), { type: "snuff" }, T0 + 7 * MIN), now: T0 + 8 * MIN },
  /** Stored as lit; the clock is long past completion, so the reload settles it into the dawn. */
  litPastCompletion: { name: "lit-past-completion", state: lit(), now: T0 + 40 * MIN },
  /** Stored as paused; the clock is past the 10-minute pause limit, so the reload settles it into smoke. */
  pausedPastLimit: { name: "paused-past-limit", state: step(lit(), { type: "pause" }, T0 + 10 * MIN), now: T0 + 21 * MIN },
} as const satisfies Record<string, Fixture>;

/** The seven states of the screenshots (burned-out is shot inside the break). */
export const STATES = [
  FIXTURES.idle,
  FIXTURES.litStart,
  FIXTURES.litHalf,
  FIXTURES.litLastMinute,
  FIXTURES.paused,
  FIXTURES.burnedOut,
  FIXTURES.snuffed,
] as const;

export const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  phone: { width: 360, height: 640 },
  tablet: { width: 768, height: 1024 },
  wide: { width: 1920, height: 1080 },
} as const;

export interface OpenOptions {
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly reducedMotion?: boolean;
}

export interface OpenScene {
  readonly page: Page;
  close(): Promise<void>;
}

/**
 * Opens the page with the fixture stored and the clock frozen at the fixture's `now` (design 11.2).
 * The page loads 5 s before `now`, then the clock is run to 40 ms after `now`: animation frames are 16 ms apart, so this
 * guarantees the last frame is drawn at or after `now`, never before an exact quarter mark. The flicker is a pure function
 * of the frozen time, so the same fixture draws the same pixels every time. Waits until the scene has painted twice.
 */
export async function openScene(browser: Browser, fixture: Fixture, options: OpenOptions = {}): Promise<OpenScene> {
  const context = await browser.newContext({
    viewport: options.viewport ?? VIEWPORTS.desktop,
    reducedMotion: options.reducedMotion ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  if (fixture.state !== null) {
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
  await page.clock.install({ time: fixture.now - 5000 });
  await page.goto("/");
  await page.clock.pauseAt(fixture.now - 100);
  await page.clock.runFor(140);
  await expect(page.locator("#scene")).toHaveAttribute("data-settled", "true");
  // Wait for CSS transitions only: the smoke sway is an infinite animation and never finishes.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a instanceof CSSTransition)
        .map((a) => a.finished),
    ),
  );
  return { page, close: () => context.close() };
}

export interface SceneReading {
  readonly role: string | null;
  readonly ariaLabel: string | null;
  readonly flame: string | null;
  readonly phase: string | null;
  readonly settled: string | null;
  readonly ease: string | null;
  readonly animateDrips: string | null;
  readonly animateSmoke: string | null;
  readonly props: Record<string, number>;
}

const PROPERTY_NAMES = [
  "--wax-height",
  "--drips",
  "--flame-height",
  "--flame-blue",
  "--flame-ragged",
  "--flame-glow",
  "--smoke",
  "--stub",
  "--light-radius",
  "--dawn",
  "--cooling",
  "--flicker-lean",
  "--flicker-height",
  "--flicker-glow",
] as const;

/** The attributes and computed custom properties of `#scene`. */
export async function readScene(page: Page): Promise<SceneReading> {
  return page.evaluate((names) => {
    const el = document.querySelector("#scene");
    if (!el) throw new Error("no #scene");
    const style = getComputedStyle(el);
    const props: Record<string, number> = {};
    for (const n of names) props[n] = Number(style.getPropertyValue(n).trim());
    return {
      role: el.getAttribute("role"),
      ariaLabel: el.getAttribute("aria-label"),
      flame: el.getAttribute("data-flame"),
      phase: el.getAttribute("data-phase"),
      settled: el.getAttribute("data-settled"),
      ease: el.getAttribute("data-ease"),
      animateDrips: el.getAttribute("data-animate-drips"),
      animateSmoke: el.getAttribute("data-animate-smoke"),
      props,
    };
  }, PROPERTY_NAMES);
}

/** A computed palette colour of `#scene`, as [r, g, b]. */
export async function paletteColour(page: Page, name: string): Promise<[number, number, number]> {
  const hex = await page.evaluate((n) => getComputedStyle(document.querySelector("#scene") as Element).getPropertyValue(n).trim(), name);
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  return box;
}

/**
 * The largest per-channel distance between the pixels of the page region `box` and the colour `rgb`.
 * The region is captured as a PNG and decoded in the page (createImageBitmap and a canvas), test code only.
 */
export async function maxPixelDistance(page: Page, box: Box, rgb: [number, number, number]): Promise<number> {
  const png = await page.screenshot({ clip: box, animations: "disabled" });
  return page.evaluate(
    async ({ base64, target }) => {
      const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let worst = 0;
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs((data[i + c] ?? 0) - (target[c] ?? 0)));
      }
      return worst;
    },
    { base64: png.toString("base64"), target: rgb },
  );
}
