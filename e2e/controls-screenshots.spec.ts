// The 20 screenshots of the controls (controls-and-access design 14, requirement R15.3):
// docs/screenshots/controls-<screen>-<desktop|phone>[-reduced].png. The tests do not compare pixels.
//
// Writing into docs/screenshots needs an explicit opt-in: set CANDLEWATCH_SHOTS=1 (PowerShell: $env:CANDLEWATCH_SHOTS = "1").
// A normal `npx playwright test` still renders every shot, but writes it under test-results/ (ignored by git).
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { INITIAL_STATE, serializeHistory, step } from "../src/engine";
import { HISTORY_KEY } from "../src/storage/storage";
import { FIXTURES, desktop, fontsLoaded, judgeFigures, openApp, phone, platformFonts, press, readFigures, settle } from "./controls-fixtures";
import type { Fixture } from "./controls-fixtures";

test.describe.configure({ mode: "parallel" });

const OPT_IN = process.env["CANDLEWATCH_SHOTS"] === "1";
const DIR = join(process.cwd(), "docs", "screenshots");

const withIntent: Fixture = {
  name: "lit-intent",
  state: step(INITIAL_STATE, { type: "light", length: 25, intent: "write the report" }, FIXTURES.litHalf.now - 12.5 * 60_000),
  now: FIXTURES.litHalf.now,
};

interface Shot {
  readonly screen: string;
  /** Fixture to store, or none for a first visit. */
  readonly fixture: Fixture | null;
  readonly prepare?: (page: Page) => Promise<void>;
  readonly history?: boolean;
  readonly reduced?: boolean;
  readonly sizes?: readonly ("desktop" | "phone")[];
}

const SCREENS: Shot[] = [
  { screen: "idle-returning", fixture: null, history: true },
  {
    screen: "invalid-length",
    fixture: null,
    prepare: async (page) => {
      await page.locator("#length-custom").focus();
      await page.keyboard.type("4");
      await press(page, "Enter");
    },
  },
  // The length message on the dawn, the brightest room the setup controls ever stand on (costume review, second pass, finding 1).
  {
    screen: "invalid-length-dawn",
    fixture: FIXTURES.burnedOut,
    prepare: async (page) => {
      await page.locator("#length-custom").focus();
      await page.keyboard.type("4");
      await press(page, "Enter");
    },
    sizes: ["desktop"],
  },
  { screen: "lit-intent", fixture: withIntent },
  { screen: "snuff-dialog", fixture: FIXTURES.litHalf, prepare: (page) => press(page, "Escape") },
  {
    screen: "settings",
    fixture: FIXTURES.idle,
    prepare: async (page) => {
      await page.locator("#settings-button").click();
      await settle(page);
    },
  },
  {
    screen: "focus-light",
    fixture: FIXTURES.idle,
    prepare: async (page) => {
      for (let i = 0; i < 3; i++) await press(page, "Tab");
    },
  },
  { screen: "focus-pause", fixture: FIXTURES.litHalf, prepare: (page) => press(page, "Tab") },
  { screen: "snuff-dialog", fixture: FIXTURES.litHalf, prepare: (page) => press(page, "Escape"), reduced: true, sizes: ["desktop"] },
  {
    screen: "settings-off",
    fixture: FIXTURES.idle,
    prepare: async (page) => {
      await page.locator("#settings-button").click();
      await settle(page);
      await page.locator("#sound").click();
      await page.locator("#ghosts").click();
      await settle(page);
    },
  },
  { screen: "idle-returning", fixture: null, history: true, reduced: true, sizes: ["desktop"] },
  {
    screen: "settings",
    fixture: FIXTURES.idle,
    prepare: async (page) => {
      await page.locator("#settings-button").click();
      await settle(page);
    },
    reduced: true,
    sizes: ["desktop"],
  },
];

const SHOTS = SCREENS.flatMap((s) =>
  (s.sizes ?? (["desktop", "phone"] as const)).map((size) => ({ ...s, size, file: `controls-${s.screen}-${size}${s.reduced ? "-reduced" : ""}.png` })),
);

test("there are 20 screenshots to take", () => {
  expect(SHOTS).toHaveLength(20);
  expect(new Set(SHOTS.map((s) => s.file)).size).toBe(20);
});

for (const shot of SHOTS) {
  test(shot.file, async ({ browser }, testInfo) => {
    const target = OPT_IN ? join(DIR, shot.file) : testInfo.outputPath(shot.file);
    if (OPT_IN) mkdirSync(DIR, { recursive: true });
    const history = shot.history ? [`localStorage.setItem(${JSON.stringify(HISTORY_KEY)}, ${JSON.stringify(serializeHistory(FIXTURES.snuffed.state?.history ?? []))});`] : [];
    const app = await openApp(browser, {
      fixture: shot.fixture,
      viewport: shot.size === "phone" ? phone : desktop,
      // A phone is touch only: `any-pointer: fine` is false, so the first-visit line says Tap, not the keys.
      mobile: shot.size === "phone",
      reducedMotion: shot.reduced === true,
      initScripts: history,
    });
    try {
      const { page } = app;
      if (shot.prepare) await shot.prepare(page);
      // Both font families in place before the picture (a fallback serif has other figures), and the pointer off the controls so
      // no button is photographed in its hover look.
      await fontsLoaded(page);
      await page.mouse.move(1, 1);
      await expect(page.locator("#ui button:hover, #ui input:hover")).toHaveCount(0);
      await page.screenshot({ path: target, animations: "disabled" });
      // What the time text shows, for the screenshot log: the font that painted it and whether its figures are lining.
      const fonts = await platformFonts(page, "#time");
      expect(fonts.length).toBeGreaterThan(0);
      for (const font of fonts) expect(font, `${shot.file}: #time is painted with the web font ${JSON.stringify(fonts)}`).toMatchObject({ family: expect.stringMatching(/^Cormorant Garamond/), custom: true }); // the file's internal family name is "Cormorant Garamond Light" (Bold style)
      const figures = judgeFigures(await readFigures(page, "#time"));
      // A time text without digits (an invalid custom length) has no figures to judge; any other must be lining.
      const timeText = ((await page.locator("#time").textContent()) ?? "").trim();
      if (figures.count > 0) expect(figures.lining, `${shot.file}: lining figures ${JSON.stringify(figures)}`).toBe(true);
      else expect(timeText, `${shot.file}: #time without digits`).not.toMatch(/\d/);
      console.log(`SHOT ${shot.file} | #time font ${fonts.map((f) => f.family).join("+")} | text ${JSON.stringify(timeText)} | lining ${figures.count > 0 ? figures.lining : "n/a, no digits"} (${figures.count} digits, bottom spread ${figures.bottomSpreadEm.toFixed(3)} em, shortest ${figures.shortestEm.toFixed(2)} em) | first-visit line ${JSON.stringify(((await page.locator("#status").textContent()) ?? "").trim())}`);
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  });
}
