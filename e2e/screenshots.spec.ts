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
    const scene = await openScene(browser, shot.fixture, { viewport: shot.viewport, reducedMotion: shot.reducedMotion });
    try {
      // "disabled" settles transitions and stops the smoke sway, so the same state always gives the same picture.
      await scene.page.screenshot({ path: target, animations: "disabled" });
    } finally {
      await scene.close();
    }
  });
}
