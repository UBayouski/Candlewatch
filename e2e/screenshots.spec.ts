// The 21 screenshots of the candle scene (candle-scene design 11.4, requirement R13.3 to R13.5).
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
import { fontsLoaded, judgeFigures, platformFonts, readFigures } from "./font-fixtures";
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
