import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openApp, press } from "./controls-fixtures";

const read = (page: Page): Promise<{ title: string; time: string; phase: string | null }> =>
  page.evaluate(() => ({
    title: document.title,
    time: document.getElementById("time")?.textContent?.trim() ?? "",
    phase: document.getElementById("scene")?.getAttribute("data-phase") ?? null,
  }));

test.describe("sound E7: title and visible time", () => {
  test.setTimeout(90_000);
  test("the title uses the same time through a keyboard session and omits intent", async ({ browser }) => {
    const app = await openApp(browser);
    try {
      const { page } = app;
      const intent = "Quietly catalogue the blue lanterns";
      expect((await read(page)).title).toBe("Candlewatch");
      await page.locator("#length-custom").fill("5");
      await page.locator("#intent").fill(intent);
      await page.locator("#light").focus();
      await press(page, "Enter");
      const lit = await read(page);
      expect(lit.phase).toBe("lit");
      expect(lit.title).toBe(`${lit.time} · Candlewatch`);
      expect(lit.title).not.toContain(intent);
      await press(page, "Space");
      const paused = await read(page);
      expect(paused.phase).toBe("paused");
      expect(paused.title).toBe(`${paused.time} paused · Candlewatch`);
      await page.clock.runFor(5000);
      expect((await read(page)).title).toBe(paused.title);
      await press(page, "Space");
      for (let i = 0; i < 60; i++) {
        await page.clock.runFor(5000);
        const sample = await read(page);
        expect(sample.title).not.toContain(intent);
        expect(sample.title).toBe(sample.phase === "burned-out" ? "Morning · Candlewatch" : `${sample.time} · Candlewatch`);
      }
      expect((await read(page)).phase).toBe("burned-out");
    } finally { await app.close(); }
  });

  test("without JavaScript, index.html keeps the product title", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto("/");
      expect(await page.title()).toBe("Candlewatch");
    } finally { await context.close(); }
  });
});
