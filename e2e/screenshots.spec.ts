// The 21 screenshots of the candle scene (candle-scene design 11.4, requirement R13.3 to R13.5), and the 9 ghosts-* and 9
// graveyard-* screenshots of ghosts-and-graveyard (task 26.1, R11.10 to R11.13).
// docs/screenshots/candle-<state>-<size>[-reduced].png: seven states at desktop (1280x800) and phone (360x640),
// and the same seven at desktop with reduced motion. The tests do not compare pixels; a wrong state is caught by
// scene.spec.ts. Following scene.md, change the scene and these files must be retaken (this spec does it).
//
// Writing into docs/screenshots needs an explicit opt-in: set CANDLEWATCH_SHOTS=1 (PowerShell: $env:CANDLEWATCH_SHOTS = "1").
// A normal `npx playwright test` still renders every shot, but writes it under test-results/ (ignored by git), so the committed
// pictures are never changed by accident. Task 36 of controls-and-access sets the variable.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { KEEP_CLEAR_COLUMN_UNITS } from "../src/ui/layout";
import { fontsLoaded, judgeFigures, platformFonts, readFigures } from "./font-fixtures";
import {
  ghostShotFixture,
  graveyardFixture,
  largeHistory,
  openGraveyardApp,
  openView,
  overlaps,
  press,
  readGhosts,
  settle,
  smallHistory,
  stageOf,
  toPage,
  viewOf,
} from "./graveyard-fixtures";
import type { Fixture } from "./graveyard-fixtures";
import { STATES, VIEWPORTS, openScene } from "./scene-fixtures";

test.describe.configure({ mode: "parallel" });

const OPT_IN = process.env["CANDLEWATCH_SHOTS"] === "1";
const DIR = join(process.cwd(), "docs", "screenshots");

const SHOTS = STATES.flatMap((fixture) => [
  { file: `candle-${fixture.name}-desktop.png`, fixture, viewport: VIEWPORTS.desktop, reducedMotion: false },
  { file: `candle-${fixture.name}-phone.png`, fixture, viewport: VIEWPORTS.phone, reducedMotion: false },
  { file: `candle-${fixture.name}-desktop-reduced.png`, fixture, viewport: VIEWPORTS.desktop, reducedMotion: true },
]);

test("there are 21 screenshots to take", () => {
  expect(SHOTS).toHaveLength(21);
  expect(new Set(SHOTS.map((s) => s.file)).size).toBe(21);
});

// --- ghosts-and-graveyard (task 26.1, R11.10 to R11.13): 9 ghosts-* and 9 graveyard-* pictures -------------------------------

type Size = "desktop" | "phone";
interface ExtraShot {
  readonly file: string;
  readonly fixture: Fixture;
  readonly size: Size;
  readonly reduced: boolean;
  /** Touch only: taps instead of the keyboard (the touch card). */
  readonly touch: boolean;
  readonly prepare?: (page: Page) => Promise<void>;
}

/** The ghost counts of R11.10: 0, 1, G = 12 and G + 9 = 21, during a 50-minute session 30 minutes in; the drawn ghosts were away
 * from 5 s to 5 minutes, so the pictures show the whole size range (first costume review advisory). */
const GHOST_COUNTS = [
  { name: "0", n: 0 },
  { name: "1", n: 1 },
  { name: "g", n: 12 },
  { name: "g-plus-9", n: 21 },
] as const;

const GHOST_SHOTS: ExtraShot[] = [
  ...GHOST_COUNTS.flatMap(({ name, n }) =>
    (["desktop", "phone"] as const).map((size) => ({ file: `ghosts-${name}-${size}.png`, fixture: ghostShotFixture(n), size, reduced: false, touch: false })),
  ),
  { file: "ghosts-g-plus-9-desktop-reduced.png", fixture: ghostShotFixture(21), size: "desktop", reduced: true, touch: false },
];

const smallFixture = graveyardFixture("idle-small", "idle", smallHistory);
const largeFixture = graveyardFixture("idle-large", "idle", largeHistory);
/** The view opened with the Door's key; its first Stone has the focus, so its card shows: Escape hides it for the plain view. */
const plainView = async (page: Page): Promise<void> => {
  await openView(page);
  await press(page, "Escape");
};
/** By keyboard: the view, then the second Stone (ArrowRight) shows its card. */
const keyboardCard = async (page: Page): Promise<void> => {
  await openView(page);
  await press(page, "ArrowRight");
};
/** By touch: the Door tapped, the panel tapped to clear the opening card, then the first Stub of the Shelf tapped. */
const touchCard = async (page: Page): Promise<void> => {
  await page.locator("#door").tap();
  await settle(page);
  const s = await stageOf(page);
  const corner = toPage({ x: 590, y: 795, w: 0, h: 0 }, s);
  await page.touchscreen.tap(corner.x, corner.y);
  await settle(page);
  await page.locator("#graveyard-shelf button.item").first().tap();
  await settle(page);
};

const GRAVEYARD_SHOTS: ExtraShot[] = [
  ...(["desktop", "phone"] as const).flatMap((size): ExtraShot[] => [
    { file: `graveyard-small-${size}.png`, fixture: smallFixture, size, reduced: false, touch: false, prepare: plainView },
    { file: `graveyard-large-${size}.png`, fixture: largeFixture, size, reduced: false, touch: false, prepare: plainView },
    { file: `graveyard-card-keyboard-${size}.png`, fixture: smallFixture, size, reduced: false, touch: false, prepare: keyboardCard },
    { file: `graveyard-card-touch-${size}.png`, fixture: smallFixture, size, reduced: false, touch: true, prepare: touchCard },
  ]),
  { file: "graveyard-large-desktop-reduced.png", fixture: largeFixture, size: "desktop", reduced: true, touch: false, prepare: plainView },
];

test("there are 9 ghosts-* and 9 graveyard-* screenshots to take", () => {
  expect(GHOST_SHOTS).toHaveLength(9);
  expect(GRAVEYARD_SHOTS).toHaveLength(9);
  expect(new Set([...GHOST_SHOTS, ...GRAVEYARD_SHOTS, ...SHOTS].map((s) => s.file)).size).toBe(39);
});

for (const shot of [...GHOST_SHOTS, ...GRAVEYARD_SHOTS]) {
  test(shot.file, async ({ browser }, testInfo) => {
    const target = OPT_IN ? join(DIR, shot.file) : testInfo.outputPath(shot.file);
    if (OPT_IN) mkdirSync(DIR, { recursive: true });
    const viewport = shot.size === "phone" ? VIEWPORTS.phone : VIEWPORTS.desktop;
    // A phone is touch only, as in the other shots; the touch card at desktop size is a touch screen of that size.
    const app = await openGraveyardApp(browser, { fixture: shot.fixture, viewport, reducedMotion: shot.reduced, mobile: shot.size === "phone", touch: shot.touch });
    try {
      const { page } = app;
      if (shot.prepare) await shot.prepare(page);
      await fontsLoaded(page);
      if (!shot.touch && shot.size === "desktop") await page.mouse.move(1, 1);
      // What the picture must show, checked before it is taken (the tests do not compare pixels).
      const ghosts = await readGhosts(page);
      const view = await viewOf(page);
      const card = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>("#graveyard-card");
        return el !== null && !el.hidden;
      });
      if (shot.file.startsWith("ghosts-")) {
        const n = GHOST_COUNTS.find((c) => new RegExp(`^ghosts-${c.name}-(desktop|phone)(-reduced)?\\.png$`).test(shot.file))?.n ?? -1;
        expect(view).toBe("room");
        expect(ghosts.ghosts).toHaveLength(Math.min(n, 12));
        expect(ghosts.mark.shown).toBe(n > 12);
        if (n === 21) {
          // G + 9: no ghost and not the mark over the candle column or the Floor_Band (R11.10).
          const s = await stageOf(page);
          const column = toPage(KEEP_CLEAR_COLUMN_UNITS, s);
          const floorTop = s.oy + 900 * s.scale;
          for (const b of [...ghosts.ghosts.map((g) => g.rect), ...(ghosts.mark.rect ? [ghosts.mark.rect] : [])]) {
            expect(overlaps(b, column, 0.5)).toBe(false);
            expect(b.y + b.h).toBeLessThanOrEqual(floorTop + 0.5);
          }
        }
      } else {
        expect(view).toBe("graveyard");
        expect(card).toBe(shot.file.includes("-card-"));
      }
      await page.screenshot({ path: target, animations: "disabled" });
      console.log(`SHOT ${shot.file} | view ${view} | ghosts ${ghosts.ghosts.length} mark ${ghosts.mark.shown ? ghosts.mark.text : "none"} | card ${card} | label ${JSON.stringify(await page.locator("#scene").getAttribute("aria-label"))}`);
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  });
}

for (const shot of SHOTS) {
  test(shot.file, async ({ browser }, testInfo) => {
    const target = OPT_IN ? join(DIR, shot.file) : testInfo.outputPath(shot.file);
    if (OPT_IN) mkdirSync(DIR, { recursive: true });
    // A phone is touch only (`any-pointer: fine` is false), so the first-visit line says Tap, not the keys.
    const mobile = shot.viewport === VIEWPORTS.phone;
    const scene = await openScene(browser, shot.fixture, { viewport: shot.viewport, reducedMotion: shot.reducedMotion, mobile });
    try {
      const { page } = scene;
      // Both font families in place before the picture (a fallback serif has other figures), and the pointer off the controls.
      await fontsLoaded(page);
      await page.mouse.move(1, 1);
      await expect(page.locator("#ui button:hover, #ui input:hover")).toHaveCount(0);
      // "disabled" settles transitions and stops the smoke sway, so the same state always gives the same picture.
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
    } finally {
      await scene.close();
    }
  });
}
