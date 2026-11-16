import { expect, test } from "@playwright/test";
import { formatTime } from "../src/ui/format";
import { FIXTURES, T0, clockNow, liveTexts, openApp, phaseOf, settle, storedState, timeText } from "./controls-fixtures";
import { FAKE_AUDIO_SCRIPT, audioLog, cuesPlayed, setHidden } from "./sound-fixtures";

test.describe("sound E5: a hidden lit tab", () => {
  test.setTimeout(90_000);
  test("the title and end cue advance while the visible timer is frozen", async ({ browser }) => {
    const end = T0 + 25 * 60_000;
    const app = await openApp(browser, { fixture: FIXTURES.litStart, now: end - 20_000, initScripts: [FAKE_AUDIO_SCRIPT] });
    try {
      const { page } = app;
      await page.locator("#settings-button").click(); // a gesture unlocks the audio context
      await settle(page);
      await page.locator("#close").click();
      await settle(page);
      await setHidden(page, true);
      await settle(page);
      const frozen = await timeText(page);
      const titles: string[] = [];
      for (let i = 0; i < 5; i++) {
        await page.clock.runFor(1000);
        const now = await clockNow(page);
        const title = await page.title();
        titles.push(title);
        expect(title).toBe(`${formatTime(Math.max(0, end - now))} · Candlewatch`);
        expect(await timeText(page)).toBe(frozen);
      }
      expect(new Set(titles).size).toBe(5);
      await page.clock.runFor(end - (await clockNow(page)) + 1000);
      expect(await page.title()).toBe("Morning · Candlewatch");
      expect(cuesPlayed(await audioLog(page))).toEqual(["chime"]);
      await setHidden(page, false);
      await settle(page);
      expect(cuesPlayed(await audioLog(page))).toEqual(["chime"]);
      const finished = await storedState(page);
      expect(finished.phase).toBe("burned-out");
      if (finished.phase !== "burned-out") throw new Error(`expected burned-out, got ${finished.phase}`);
      expect(finished.session.distractions).toBe(1);
      expect(await timeText(page)).toBe("00:00");
      expect((await liveTexts(page)).filter((s) => s.includes("Morning"))).toHaveLength(1);
      expect(app.errors).toEqual([]);
    } finally { await app.close(); }
  });
});

test.describe("sound E6: a hidden pause limit", () => {
  test.setTimeout(90_000);
  test("the pause limit plays one breath and writes Dark", async ({ browser }) => {
    const app = await openApp(browser, { fixture: FIXTURES.paused, now: T0 + 20 * 60_000 - 5000, initScripts: [FAKE_AUDIO_SCRIPT] });
    try {
      const { page } = app;
      await page.locator("#settings-button").click();
      await settle(page);
      await page.locator("#close").click();
      await settle(page);
      await setHidden(page, true);
      await settle(page);
      await page.clock.runFor(6000);
      expect(await phaseOf(page)).toBe("paused"); // frames are held
      expect((await storedState(page)).phase).toBe("snuffed");
      expect(await page.title()).toBe("Dark · Candlewatch");
      expect(cuesPlayed(await audioLog(page))).toEqual(["breath"]);
    } finally { await app.close(); }
  });

  for (const ending of ["burned-out", "snuffed"] as const) {
    for (const late of [90_000, 130_000]) {
      test(`${ending} timer ${late / 1000}s late obeys the cue limit`, async ({ browser }) => {
        const end = T0 + (ending === "burned-out" ? 25 : 20) * 60_000;
        const app = await openApp(browser, { fixture: ending === "burned-out" ? FIXTURES.litStart : FIXTURES.paused, now: end - 20_000, initScripts: [FAKE_AUDIO_SCRIPT] });
        try {
          const { page } = app;
          await page.locator("#settings-button").click();
          await settle(page);
          await page.locator("#close").click();
          await settle(page);
          await setHidden(page, true);
          await settle(page);
          await page.clock.fastForward(end - (await clockNow(page)) + late);
          expect((await storedState(page)).phase).toBe(ending);
          expect(await page.title()).toBe(ending === "burned-out" ? "Morning · Candlewatch" : "Dark · Candlewatch");
          expect(cuesPlayed(await audioLog(page))).toEqual(late === 90_000 ? [ending === "burned-out" ? "chime" : "breath"] : []);
        } finally { await app.close(); }
      });
    }
  }
});
