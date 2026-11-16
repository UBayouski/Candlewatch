/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect, test } from "@playwright/test";
import { FIXTURES, VIEWPORTS_ART, openScene, patch, rgbAt, ratio, roomToPx } from "./room-art-fixtures";
import type { Colour } from "./room-art-fixtures";

const mean = (pixels: Colour[]): Colour => [0, 1, 2].map((c) =>
  pixels.reduce((sum, pixel) => sum + pixel[c]!, 0) / pixels.length) as Colour;
const row = (png: Buffer, viewport: { width: number; height: number }, y: number): Colour =>
  mean(Array.from({ length: 9 }, (_, i) => {
    const p = roomToPx(viewport.width, viewport.height, 146 + i, y);
    return rgbAt(png, p.x, p.y);
  }));

test.describe("room-art E15: the lit base", () => {
  for (const viewport of [VIEWPORTS_ART[0], VIEWPORTS_ART[3]]) {
    test(`${viewport.name}: dish, lip, and short shadow`, async ({ browser }) => {
      test.setTimeout(90_000);
      const app = await openScene(browser, FIXTURES.litHalf, { viewport });
      try {
        const page = app.page;
        await page.addStyleTag({ content: "#ui,.ghost-layer{display:none!important}" });
        const on = await page.screenshot({ animations: "disabled" });
        const point = (x: number, y: number) => {
          const p = roomToPx(viewport.width, viewport.height, x, y);
          return patch(on, p.x, p.y);
        };
        const ring = point(244, 891), inside = point(259, 891.6), front = point(150, 896);
        const lip = row(on, viewport, 890.2), under = row(on, viewport, 891.9), top = row(on, viewport, 886.5);
        const values = { ringInside: ratio(ring, inside), ringFront: ratio(ring, front), lipUnder: ratio(lip, under), lipTop: ratio(lip, top) };
        console.log("E15", viewport.name, values);
        expect(values.ringInside).toBeGreaterThanOrEqual(viewport.name === "phone" ? 1.35 : 1.4);
        expect(values.ringFront).toBeGreaterThanOrEqual(1.5);
        expect(values.lipUnder).toBeGreaterThanOrEqual(1.2);
        expect(values.lipTop).toBeGreaterThanOrEqual(1.05);

        // The unfiltered picture is the background under the shadow. Resolve
        // the shadow's opacity per row from the dark band colour and both pictures.
        await page.addStyleTag({ content: ".zone-rest,.zone-dawn{filter:none!important}" });
        const off = await page.screenshot({ animations: "disabled" });
        const band: Colour = [8, 11, 18];
        const alpha = (y: number) => {
          const p = roomToPx(viewport.width, viewport.height, 500, y);
          const a = rgbAt(on, p.x, p.y), b = rgbAt(off, p.x, p.y);
          const channel = [0, 1, 2].reduce((best, c) => Math.abs(b[c]! - band[c]!) > Math.abs(b[best]! - band[best]!) ? c : best, 0);
          return (b[channel]! - a[channel]!) / (b[channel]! - band[channel]!);
        };
        const samples = Array.from({ length: 121 }, (_, i) => 890 + i / 12);
        const half = samples.find((y) => alpha(y) >= 0.5);
        console.log("E15", viewport.name, "first half-dark y", half, "alpha samples", samples.filter((_, i) => i % 12 === 0).map((y) => [y, alpha(y)]));
        expect(half).toBeDefined();
        expect(half!).toBeGreaterThanOrEqual(896.5);
      } finally { await app.close(); }
    });
  }

  for (const viewport of [VIEWPORTS_ART[0], VIEWPORTS_ART[3]]) {
    test(`${viewport.name}: time and status contrast at rest and dawn`, async ({ browser }) => {
      test.setTimeout(90_000);
      for (const [fixture, floor] of [[FIXTURES.idle, 15.8], [FIXTURES.burnedOut, 7.5]] as const) {
        const app = await openScene(browser, fixture, { viewport });
        try {
          const page = app.page;
          const png = await page.screenshot({ animations: "disabled" });
          for (const selector of ["#time", "#status"]) {
            const data = await page.locator(selector).evaluate((el) => {
              const r = el.getBoundingClientRect();
              return { colour: getComputedStyle(el).color, x: r.x, y: r.y, w: r.width, h: r.height };
            });
            const channels = data.colour.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
            if (channels.length !== 3) throw new Error(`bad ${selector} colour: ${data.colour}`);
            const text = channels as Colour;
            const background = rgbAt(png, Math.min(viewport.width - 3, data.x + data.w + 3), data.y + data.h / 2);
            const reading = ratio(text, background);
            console.log("E15", viewport.name, fixture.name, selector, "contrast", reading, "pixel", background);
            expect(reading, `${viewport.name} ${fixture.name} ${selector}`).toBeGreaterThanOrEqual(floor);
          }
        } finally { await app.close(); }
      }
    });
  }
});
