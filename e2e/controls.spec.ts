// The controls in a real browser (controls-and-access design 13.3): whole sessions by keyboard and by touch (E1, E1b, E2),
// keys (E5), first visit (E10), the T key and the pause allowance (E13) and visibility (E8). The clock is Playwright's
// `page.clock`; stored state is built with the engine; nothing in the shipped code is there for the tests.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { serializeHistory } from "../src/engine";
import { HISTORY_KEY } from "../src/storage/storage";
import { boxOf, paletteColour } from "./scene-fixtures";
import {
  FIXTURES,
  MIN,
  SEC,
  checkLayoutNow,
  clockNow,
  desktop,
  flameOf,
  focused,
  jump,
  liveTexts,
  openApp,
  phaseOf,
  phone,
  press,
  rawSession,
  rectOf,
  settle,
  statusText,
  storedState,
  timeText,
} from "./controls-fixtures";

const dawnOf = (page: Page): Promise<number> => page.evaluate(() => Number(getComputedStyle(document.querySelector("#scene") as Element).getPropertyValue("--dawn").trim()));
const dialogOpen = (page: Page, id: "snuff-dialog" | "settings-dialog"): Promise<boolean> => page.evaluate((i) => (document.getElementById(i) as HTMLDialogElement).open, id);

test("the helpers load the page with nothing stored and see the first-visit line and the Light button", async ({ browser }) => {
  const app = await openApp(browser);
  try {
    const { page } = app;
    await expect(page.locator("#status")).toHaveText("Enter lights. Space pauses. Esc lets it go dark.");
    await expect(page.getByRole("button", { name: "Light", exact: true })).toBeVisible();
    expect(await timeText(page)).toBe("25:00");
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test("E1: a whole session by keyboard at 1280 x 800", async ({ browser }) => {
  const app = await openApp(browser, { viewport: desktop });
  try {
    const { page } = app;
    const layout = (): Promise<unknown> => checkLayoutNow(page, desktop.width, desktop.height);
    await layout();

    // (a) Tab to the chooser, ArrowLeft to 15, Tab to the intent field, type, Enter.
    await press(page, "Tab");
    expect((await focused(page)).name).toBe("25 minutes");
    await press(page, "ArrowLeft");
    expect(await timeText(page)).toBe("15:00");
    await expect(page.getByRole("radio", { name: "15 minutes" })).toHaveAttribute("aria-checked", "true");
    await press(page, "Tab");
    expect((await focused(page)).id).toBe("intent");
    await page.keyboard.type("write the report");
    await settle(page);
    await press(page, "Enter");
    let stored = await storedState(page);
    expect(stored.phase).toBe("lit");
    if (stored.phase !== "lit") throw new Error("not lit");
    expect(stored.session.lengthMin).toBe(15);
    expect(stored.session.intent).toBe("write the report");
    expect(await phaseOf(page)).toBe("lit");
    expect(await flameOf(page)).toBe("steady");
    expect(await timeText(page)).toBe("15:00");
    expect(await statusText(page)).toBe("write the report");
    expect((await focused(page)).id).toBe("pause");
    expect(await liveTexts(page)).toEqual(["The wick catches. 15 minutes left."]);
    await layout();

    // (b) five minutes pass; pause with Space; the allowance counts down while the time text stands still; resume.
    await jump(page, 5 * MIN);
    expect(await timeText(page)).toBe("10:00");
    await press(page, "Space");
    expect(await storedState(page).then((s) => s.phase)).toBe("paused");
    expect(await flameOf(page)).toBe("paused");
    expect(await statusText(page)).toBe("Pause left 10:00");
    expect(await timeText(page)).toBe("10:00");
    expect((await focused(page)).id).toBe("pause");
    await layout();
    await jump(page, 3 * MIN);
    expect(await timeText(page)).toBe("10:00");
    expect(await statusText(page)).toBe("Pause left 07:00");
    await press(page, "Space");
    expect(await phaseOf(page)).toBe("lit");
    expect(await flameOf(page)).toBe("steady");
    expect((await focused(page)).id).toBe("pause");
    expect(await liveTexts(page)).toEqual(["The wick catches. 15 minutes left.", "A quarter is gone. 10 minutes left.", "Paused.", "The flame steadies."]);

    // (c) T adds exactly one message with the time in words.
    await jump(page, MIN);
    const before = (await liveTexts(page)).length;
    await press(page, "t");
    const after = await liveTexts(page);
    expect(after).toHaveLength(before + 1);
    expect(after.at(-1)).toMatch(/^\d+ minutes?( \d+ seconds?)? left\.$/);

    // (d) Esc opens the dialog with Keep burning focused; Esc closes it and restores focus; the stored session is untouched.
    const rawBefore = await rawSession(page);
    const timeBefore = await timeText(page);
    await press(page, "Escape");
    expect(await dialogOpen(page, "snuff-dialog")).toBe(true);
    expect((await focused(page)).name).toBe("Keep burning");
    await layout();
    await press(page, "Escape");
    expect(await dialogOpen(page, "snuff-dialog")).toBe(false);
    expect((await focused(page)).id).toBe("pause");
    expect(await rawSession(page)).toBe(rawBefore);
    await jump(page, 2 * SEC);
    expect(await timeText(page)).not.toBe(timeBefore);
    // Esc, Tab to Snuff it, Enter.
    await press(page, "Escape");
    await press(page, "Tab");
    expect((await focused(page)).name).toBe("Snuff it");
    await press(page, "Enter");
    stored = await storedState(page);
    expect(stored.phase).toBe("snuffed");
    expect(stored.history).toHaveLength(1);
    expect(stored.history[0]?.outcome).toBe("snuffed");
    expect(await phaseOf(page)).toBe("snuffed");
    expect((await focused(page)).id).toBe("light");
    expect(await statusText(page)).toBe("The flame is out.");
    expect((await liveTexts(page)).at(-1)).toBe("The candle is out.");
    expect(await dialogOpen(page, "snuff-dialog")).toBe(false);
    await layout();

    // (e) Enter lights again with the chosen length and no intent; past the end it burns out into the dawn.
    await press(page, "Enter");
    stored = await storedState(page);
    expect(stored.phase).toBe("lit");
    if (stored.phase !== "lit") throw new Error("not lit");
    expect(stored.session.lengthMin).toBe(15);
    expect(stored.session.intent).toBeNull();
    expect(await timeText(page)).toBe("15:00");
    await jump(page, 15 * MIN + 2 * SEC);
    expect(await phaseOf(page)).toBe("burned-out");
    expect(await dawnOf(page)).toBe(1);
    expect(await statusText(page)).toBe("The wax cools.");
    expect(await timeText(page)).toBe("00:00");
    expect((await focused(page)).id).toBe("light");
    await layout();
    await jump(page, 5 * MIN);
    expect(await statusText(page)).toBe("The watch is over. Morning.");
    expect((await liveTexts(page)).at(-1)).toBe("The watch is over. Morning.");

    // A reload keeps the ended state, and says nothing.
    await page.reload();
    await settle(page);
    expect((await storedState(page)).phase).toBe("burned-out");
    expect(await phaseOf(page)).toBe("burned-out");
    expect(await statusText(page)).toBe("The watch is over. Morning.");
    expect(await liveTexts(page)).toEqual([]);
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test("E1b: the same session by touch at 360 x 640", async ({ browser }) => {
  const app = await openApp(browser, { viewport: phone, touch: true });
  try {
    const { page } = app;
    const layout = (): Promise<unknown> => checkLayoutNow(page, phone.width, phone.height);
    const tap = async (selector: string): Promise<void> => {
      await page.locator(selector).tap();
      await settle(page);
    };
    await layout();
    await page.getByRole("radio", { name: "50 minutes" }).tap();
    await settle(page);
    expect(await timeText(page)).toBe("50:00");
    await layout();
    await tap("#light");
    expect((await storedState(page)).phase).toBe("lit");
    expect(await timeText(page)).toBe("50:00");
    expect(await phaseOf(page)).toBe("lit");
    await layout();
    await jump(page, 4 * MIN);
    await tap("#pause");
    expect((await storedState(page)).phase).toBe("paused");
    expect(await phaseOf(page)).toBe("paused");
    expect(await flameOf(page)).toBe("paused");
    expect(await statusText(page)).toBe("Pause left 10:00");
    expect(await page.locator("#pause").textContent()).toBe("Resume");
    await layout();
    await tap("#pause");
    expect((await storedState(page)).phase).toBe("lit");
    expect(await page.locator("#pause").textContent()).toBe("Pause");
    await tap("#snuff");
    expect(await dialogOpen(page, "snuff-dialog")).toBe(true);
    await layout();
    await tap("#keep");
    expect(await dialogOpen(page, "snuff-dialog")).toBe(false);
    expect((await storedState(page)).phase).toBe("lit");
    await tap("#snuff");
    await tap("#confirm");
    expect((await storedState(page)).phase).toBe("snuffed");
    expect(await statusText(page)).toBe("The flame is out.");
    expect(await page.locator("#light").textContent()).toBe("Light another");
    await layout();
    await tap("#light");
    const stored = await storedState(page);
    expect(stored.phase).toBe("lit");
    if (stored.phase !== "lit") throw new Error("not lit");
    expect(stored.session.lengthMin).toBe(50);
    await layout();
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test.describe("E2: the time text", () => {
  /** Moves the clock so that `left` ms of the 25-minute candle (lit at T0) remain, and lets the page draw. */
  async function toLeft(page: Page, left: number): Promise<void> {
    const target = FIXTURES.litStart.now - 40 + 25 * MIN - left;
    const now = await clockNow(page);
    if (target - 48 > now) await page.clock.fastForward(target - 48 - now);
    await settle(page);
  }

  test("reads the time left, rounded up, at fixed clock points of a 25-minute session, inside the zone", async ({ browser }) => {
    const app = await openApp(browser, { fixture: FIXTURES.litStart });
    try {
      const { page } = app;
      expect(await timeText(page)).toBe("25:00");
      const points: [number, string][] = [
        [18 * MIN + 44_500, "18:45"],
        [12 * MIN + 30_100, "12:31"],
        [12 * MIN + 29_500, "12:30"],
        [6 * MIN + 14_500, "06:15"],
        [58_500, "00:59"],
        [500, "00:01"],
      ];
      for (const [left, text] of points) {
        await toLeft(page, left);
        expect(await timeText(page), `left ${left}`).toBe(text);
        const time = await rectOf(page, "#time");
        const area = await boxOf(page, ".zone-text-area");
        expect(time).not.toBeNull();
        if (time) {
          expect(time.x).toBeGreaterThanOrEqual(area.x - 1);
          expect(time.x + time.w).toBeLessThanOrEqual(area.x + area.width + 1);
          expect(time.y).toBeGreaterThanOrEqual(area.y - 1);
          expect(time.y + time.h).toBeLessThanOrEqual(area.y + area.height + 1);
        }
      }
      await jump(page, 2 * SEC);
      expect(await phaseOf(page)).toBe("burned-out");
      expect(await timeText(page)).toBe("00:00");
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test("is written only when the string changes, and not at all while paused", async ({ browser }) => {
    const app = await openApp(browser, { fixture: FIXTURES.litStart });
    try {
      const { page } = app;
      await page.evaluate(() => {
        const w = window as unknown as { __timeWrites: number };
        w.__timeWrites = 0;
        new MutationObserver((list) => (w.__timeWrites += list.length)).observe(document.querySelector("#time") as Element, { subtree: true, childList: true, characterData: true });
      });
      const writes = (): Promise<number> => page.evaluate(() => (window as unknown as { __timeWrites: number }).__timeWrites);
      await page.clock.runFor(10_000); // about 625 frames
      expect(await writes()).toBeLessThanOrEqual(11);
      expect(await writes()).toBeGreaterThanOrEqual(9);
      await press(page, "Space");
      const pausedAt = await writes();
      await page.clock.runFor(5_000);
      expect(await writes()).toBe(pausedAt);
    } finally {
      await app.close();
    }
  });

  test("is at least as bright as ivory and keeps its contrast in lit-start, lit-last-minute, burned-out and idle (R7.6)", async ({ browser }) => {
    const luminance = ([r, g, b]: number[]): number => {
      const lin = (v: number): number => ((v / 255) <= 0.03928 ? v / 255 / 12.92 : (((v / 255) + 0.055) / 1.055) ** 2.4);
      return 0.2126 * lin(r ?? 0) + 0.7152 * lin(g ?? 0) + 0.0722 * lin(b ?? 0);
    };
    for (const fixture of [FIXTURES.litStart, FIXTURES.litLastMinute, FIXTURES.burnedOut, FIXTURES.idle]) {
      const app = await openApp(browser, { fixture });
      try {
        const { page } = app;
        const colour = await page.evaluate(() => (getComputedStyle(document.querySelector("#time") as Element).color.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number));
        const dawn = fixture.name === "burned-out";
        const background = await paletteColour(page, dawn ? "--zone-bg-brightest" : "--zone-bg-darkest");
        const lt = luminance(colour);
        expect(lt, fixture.name).toBeGreaterThanOrEqual(0.7945 - 0.001);
        const ratio = (lt + 0.05) / (luminance(background) + 0.05);
        expect(ratio, fixture.name).toBeGreaterThanOrEqual(dawn ? 7.5 : 15.8);
      } finally {
        await app.close();
      }
    }
  });
});

test("E5: keys", async ({ browser }) => {
  // Ctrl+Enter and Alt+Space do nothing.
  let app = await openApp(browser);
  try {
    const { page } = app;
    await press(page, "Control+Enter");
    expect(await phaseOf(page)).toBe("idle");
    expect((await storedState(page)).phase).toBe("idle");
  } finally {
    await app.close();
  }

  app = await openApp(browser, { fixture: FIXTURES.litStart });
  try {
    const { page } = app;
    await press(page, "Alt+Space");
    expect((await storedState(page)).phase).toBe("lit");
    // A held Space pauses once and does not resume in a loop.
    await page.keyboard.down("Space");
    await page.keyboard.down("Space");
    await page.keyboard.down("Space");
    await page.keyboard.up("Space");
    await settle(page);
    expect((await storedState(page)).phase).toBe("paused");
    await press(page, "Space");
    expect((await storedState(page)).phase).toBe("lit");
    // Space on the focused Settings button opens the settings and does not pause.
    await page.locator("#settings-button").focus();
    await press(page, "Space");
    expect(await dialogOpen(page, "settings-dialog")).toBe(true);
    expect((await storedState(page)).phase).toBe("lit");
    // Esc with the settings open closes them and does not open the dialog.
    await press(page, "Escape");
    expect(await dialogOpen(page, "settings-dialog")).toBe(false);
    expect(await dialogOpen(page, "snuff-dialog")).toBe(false);
    expect((await focused(page)).id).toBe("settings-button");
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }

  // Enter in the intent field lights.
  app = await openApp(browser);
  try {
    const { page } = app;
    await page.locator("#intent").focus();
    await page.keyboard.type("plan the week");
    await press(page, "Enter");
    const stored = await storedState(page);
    expect(stored.phase).toBe("lit");
    if (stored.phase === "lit") expect(stored.session.intent).toBe("plan the week");
  } finally {
    await app.close();
  }
});

test("E10: the first-visit instructions", async ({ browser }) => {
  let app = await openApp(browser);
  try {
    const { page } = app;
    const line = await statusText(page);
    expect(line).toContain("Enter");
    expect(line).toContain("Space");
    expect(line).toContain("Esc");
    await page.locator("#light").focus();
    await press(page, "Enter");
    expect(await statusText(page)).not.toBe(line);
    await press(page, "Escape");
    await press(page, "Tab");
    await press(page, "Enter");
    expect(await phaseOf(page)).toBe("snuffed");
    expect(await statusText(page)).toBe("The flame is out.");
    await page.reload();
    await settle(page);
    expect(await statusText(page)).toBe("The flame is out.");
    expect(await statusText(page)).not.toBe(line);
  } finally {
    await app.close();
  }

  // An idle page with a history never shows them.
  const history = serializeHistory(FIXTURES.snuffed.state?.history ?? []);
  app = await openApp(browser, { initScripts: [`localStorage.setItem(${JSON.stringify(HISTORY_KEY)}, ${JSON.stringify(history)});`] });
  try {
    const { page } = app;
    expect(await phaseOf(page)).toBe("idle");
    expect(await statusText(page)).toBe("The candle waits.");
  } finally {
    await app.close();
  }
});

test("E13: the T key and the pause allowance", async ({ browser }) => {
  const app = await openApp(browser, { fixture: FIXTURES.litStart });
  try {
    const { page } = app;
    const base = (await liveTexts(page)).length;
    await press(page, "t");
    expect(await liveTexts(page)).toHaveLength(base + 1);
    expect((await liveTexts(page)).at(-1)).toMatch(/^\d+ minutes?( \d+ seconds?)? left\.$/);
    await press(page, "t");
    await settle(page);
    expect(await liveTexts(page)).toHaveLength(base + 2); // identical text is announced again
    // Typing a t in the intent field adds no message (the field is hidden while a candle burns: use the paused page's Settings text? no, the idle page).
  } finally {
    await app.close();
  }

  const idle = await openApp(browser);
  try {
    const { page } = idle;
    await page.locator("#intent").focus();
    await page.keyboard.type("tea time");
    await settle(page);
    expect(await page.locator("#intent").inputValue()).toBe("tea time");
    expect(await liveTexts(page)).toEqual([]);
  } finally {
    await idle.close();
  }

  const paused = await openApp(browser, { fixture: FIXTURES.litStart });
  try {
    const { page } = paused;
    await press(page, "Space");
    expect(await statusText(page)).toBe("Pause left 10:00");
    const time = await timeText(page);
    await jump(page, 4 * MIN);
    expect(await statusText(page)).toBe("Pause left 06:00");
    expect(await timeText(page)).toBe(time);
    await jump(page, 6 * MIN + 2 * SEC);
    expect((await storedState(page)).phase).toBe("snuffed");
    expect(await phaseOf(page)).toBe("snuffed");
    expect(await statusText(page)).toBe("The flame is out.");
    expect((await liveTexts(page)).at(-1)).toBe("The candle is out.");
  } finally {
    await paused.close();
  }
});

test.describe("E8: visibility", () => {
  const setVisibility = (page: Page, state: "hidden" | "visible"): Promise<void> =>
    page.evaluate((s) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => s });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);

  test("a hide and a show are one distraction and change nothing the user sees except the clock", async ({ browser }) => {
    const app = await openApp(browser, { fixture: FIXTURES.litStart });
    try {
      const { page } = app;
      await page.locator("#pause").focus();
      const statusBefore = await statusText(page);
      const liveBefore = await liveTexts(page);
      const focusBefore = await focused(page);
      await setVisibility(page, "hidden");
      await settle(page);
      await jump(page, 30 * SEC);
      await setVisibility(page, "visible");
      await settle(page);
      const stored = await storedState(page);
      expect(stored.phase).toBe("lit");
      if (stored.phase !== "lit") throw new Error("not lit");
      expect(stored.session.distractions).toBe(1);
      expect(stored.session.timeAwayMs).toBeGreaterThanOrEqual(30 * SEC);
      expect(stored.session.timeAwayMs).toBeLessThan(31 * SEC);
      expect(stored.awaySince).toBeNull();
      expect(await timeText(page)).toBe("24:30"); // the clock says 30 s and a few frames have passed
      expect(await statusText(page)).toBe(statusBefore);
      expect(await liveTexts(page)).toEqual(liveBefore);
      expect(await focused(page)).toEqual(focusBefore);
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test("a session stored with an open hide is closed on load", async ({ browser }) => {
    const { INITIAL_STATE, step } = await import("../src/engine");
    const lit = step(INITIAL_STATE, { type: "light", length: 25 }, FIXTURES.litStart.now - 40);
    const hidden = step(lit, { type: "hide" }, FIXTURES.litStart.now + MIN);
    const app = await openApp(browser, { fixture: { name: "lit-hidden", state: hidden, now: FIXTURES.litStart.now + 5 * MIN } });
    try {
      const stored = await storedState(app.page);
      expect(stored.phase).toBe("lit");
      if (stored.phase !== "lit") throw new Error("not lit");
      expect(stored.awaySince).toBeNull();
      expect(stored.session.distractions).toBe(1);
      expect(await phaseOf(app.page)).toBe("lit");
    } finally {
      await app.close();
    }
  });

  test("an unknown visibility value is read as visible and the page loads without error", async ({ browser }) => {
    const app = await openApp(browser, { initScripts: [`Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "prerender" });`] });
    try {
      await expect(app.page.locator("#light")).toBeVisible();
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
