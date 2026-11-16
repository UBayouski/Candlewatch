/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect, test } from "@playwright/test";
import { STRINGS } from "../src/strings";
import { FIXTURES, VIEWPORTS_ART, openScene } from "./room-art-fixtures";

test.describe("room-art E8: zone controls share their padding", () => {
  for (const viewport of [VIEWPORTS_ART[3], VIEWPORTS_ART[4]]) for (const fixture of [FIXTURES.litStart, FIXTURES.paused]) {
    test(`${viewport.name} ${fixture.name}: button padding, gap, T and label bounds`, async ({ browser }) => {
      const app = await openScene(browser, fixture, { viewport });
      try {
        const reading = await app.page.evaluate(() => {
          const box = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right }; };
          const button = (id: string) => {
            const el = document.getElementById(id) as HTMLElement;
            const icon = el.querySelector(".icon:not([data-off])") as Element;
            const label = el.querySelector(".label") as Element;
            const b = box(el), i = box(icon), l = box(label);
            return { box: b, text: label.textContent ?? "", textWidth: l.w, left: i.x - b.x, right: b.right - l.right };
          };
          return { pause: button("pause"), snuff: button("snuff"), settings: button("settings-button"), time: box(document.getElementById("time") as Element) };
        });
        const { pause, snuff, settings, time } = reading;
        const spread = [pause, snuff, settings].map((r) => Math.abs(r.left - r.right));
        const gap = settings.box.x - snuff.box.right;
        const tLeft = time.x - pause.box.right, tRight = snuff.box.x - time.right;
        const bounds = [fixture === FIXTURES.paused ? 58 : 46, 88, 59];
        console.log("E8", viewport.name, fixture.name, { heights: [pause.box.h, snuff.box.h, settings.box.h], spread, padding: [pause, snuff, settings].map((r) => [r.left, r.right]), gap, tLeft, tRight,
          labels: [pause.text, snuff.text, settings.text], widths: [pause.textWidth, snuff.textWidth, settings.textWidth] });
        for (const r of [pause, snuff, settings]) expect(r.box.h).toBeCloseTo(44, 0);
        for (const value of spread) expect(value).toBeLessThanOrEqual(1);
        for (const r of [pause, snuff, settings]) {
          expect(Math.abs(r.left - 16.1)).toBeLessThanOrEqual(1);
          expect(Math.abs(r.right - 16.1)).toBeLessThanOrEqual(1);
        }
        expect(Math.abs(gap - 8)).toBeLessThanOrEqual(1);
        expect(Math.abs(tLeft - tRight)).toBeLessThanOrEqual(1);
        expect(pause.text).toBe(fixture === FIXTURES.paused ? STRINGS.pause.resume : STRINGS.pause.pause);
        expect(snuff.text).toBe(STRINGS.snuff.open);
        expect(settings.text).toBe(STRINGS.settings.open);
        for (const [i, r] of [pause, snuff, settings].entries()) expect(r.textWidth).toBeLessThanOrEqual(bounds[i]!);
      } finally { await app.close(); }
    });
  }
});
