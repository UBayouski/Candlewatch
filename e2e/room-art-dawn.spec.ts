import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { press } from "./controls-fixtures";
import { FIXTURES, STATES, VIEWPORTS_ART, luminance, openApp, openScene, patch, ratio, rgbAt, roomToPx, wallSample, windowPoint } from "./room-art-fixtures";
import type { Colour } from "./room-art-fixtures";

const views = [VIEWPORTS_ART[0], VIEWPORTS_ART[3], VIEWPORTS_ART[4], VIEWPORTS_ART[6]] as const;
type View = (typeof views)[number];

function sample(png: Buffer, view: View, x: number, y: number): Colour {
  const p = roomToPx(view.width, view.height, x, y);
  return patch(png, p.x, p.y);
}

function tablePixel(png: Buffer, view: View, x: number, y: number): Colour {
  const pixels = [-4, -2, 0, 2, 4].map(dx => {
    const p = roomToPx(view.width, view.height, x + dx, y);
    return rgbAt(png, p.x, p.y);
  });
  return [0, 1, 2].map(channel =>
    pixels.reduce((sum, pixel) => sum + (pixel[channel] ?? 0), 0) / pixels.length,
  ) as Colour;
}

async function backing(page: Page, selector: string, pseudo?: string) {
  return page.locator(selector).evaluate((el, pseudo) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el, pseudo);
    const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number) as Colour;
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom,
      text: rgb(style.color), edge: rgb(style.borderTopColor), fill: rgb(style.backgroundColor) };
  }, pseudo);
}

test.describe("visual-polish D3: directional dawn", () => {
  for (const view of views) {
    test(`${view.name}: window light reaches the stonework and tabletop`, async ({ browser }, testInfo) => {
      const compact = view.name === "phone";
      const { page, close } = await openScene(browser, FIXTURES.burnedOut, { viewport: view, reducedMotion: true });
      try {
        const time = await backing(page, "#time");
        const status = await backing(page, "#status");
        const light = await backing(page, "#light");
        const door = await backing(page, "#door");
        const handle = await backing(page, "#door", "::after");
        await page.screenshot({ path: testInfo.outputPath(`candle-burned-out-${view.name}.png`) });

        // Isolate background pixels without moving text or removing its backing.
        const bare = await page.addStyleTag({ content: "#time,#status {color:transparent!important} #door {visibility:hidden!important}" });
        const png = await page.screenshot();
        const worstBacking = (item: typeof time) => {
          let worst = Infinity;
          for (let y = Math.max(0, Math.ceil(item.y)); y < Math.min(view.height, item.bottom); y++) {
            for (let x = Math.max(0, Math.ceil(item.x)); x < Math.min(view.width, item.right); x++) {
              worst = Math.min(worst, ratio(item.text, rgbAt(png, x, y)));
            }
          }
          return worst;
        };
        const timeRatio = worstBacking(time);
        const statusRatio = worstBacking(status);
        expect(timeRatio).toBeGreaterThanOrEqual(7.5);
        expect(statusRatio).toBeGreaterThanOrEqual(7.5);
        expect(ratio(light.text, light.fill)).toBeGreaterThanOrEqual(4.5);
        const outsideLight = [
          rgbAt(png, light.x - 3, (light.y + light.bottom) / 2),
          rgbAt(png, (light.x + light.right) / 2, light.bottom + 3),
        ];
        const controlRatio = Math.min(...outsideLight.map(pixel => ratio(light.edge, pixel)));
        expect(controlRatio).toBeGreaterThanOrEqual(3);
        const wood = Array.from({ length: 10 }, (_, i) => sample(png, view, 28 + i * 7, 851));
        const handleRatio = Math.min(...wood.map(pixel => ratio(handle.fill, pixel)));
        const doorRatio = Math.min(...[16, 102].map(x => ratio(door.edge, sample(png, view, x, 847))));
        expect(handleRatio).toBeGreaterThanOrEqual(3);
        expect(doorRatio).toBeGreaterThanOrEqual(3);

        const hideInterface = await page.addStyleTag({ content: "#ui {visibility:hidden!important}" });
        const room = await page.screenshot();
        const night = await openScene(browser, FIXTURES.idle, { viewport: view, reducedMotion: true });
        let aboveDifference = 0;
        let abovePoint = "";
        try {
          await night.page.addStyleTag({ content: "#ui {visibility:hidden!important}" });
          const nightRoom = await night.page.screenshot();
          const windowTop = windowPoint(view.width, view.height, 240, 50);
          const top = roomToPx(view.width, view.height, windowTop.x, windowTop.y).y;
          // Measure overlapping 3 × 3 areas, wholly above the frame.
          for (let y = 1; y < Math.floor(top) - 1; y++) {
            for (let x = 1; x < view.width - 1; x++) {
              const atNight = luminance(patch(nightRoom, x, y));
              const atDawn = luminance(patch(room, x, y));
              const difference = Math.abs(atDawn - atNight) / atNight;
              if (difference > aboveDifference) {
                aboveDifference = difference;
                abovePoint = `${x}, ${y}`;
              }
            }
          }
        } finally { await night.close(); }
        expect(aboveDifference, `maximum luminance change above the window at ${abovePoint}`).toBeLessThanOrEqual(.02);
        const patchX = compact ? 300 : 241;
        const adjacentX = compact ? 490 : 520;
        const wall = sample(room, view, patchX, 520);
        const adjacent = sample(room, view, adjacentX, 520);
        const tableY = compact ? 887 : 874;
        const table = tablePixel(room, view, 215, tableY);
        const tableSide = tablePixel(room, view, 500, tableY);
        const joint = wallSample(patchX, 520, view);
        const jointRatio = ratio(sample(room, view, joint.board.x, joint.board.y), sample(room, view, joint.joint.x, joint.joint.y));
        const wallRatio = ratio(wall, adjacent);
        const tableRatio = ratio(table, tableSide);
        const nearWindow = sample(room, view, compact ? 300 : 185, compact ? 310 : 205);
        const besideWindow = sample(room, view, compact ? 495 : 430, compact ? 310 : 205);
        const besideSill = sample(room, view, compact ? 372 : 237, compact ? 242 : 136);
        const offSill = sample(room, view, compact ? 495 : 475, compact ? 242 : 136);
        const sillSideRatio = ratio(besideSill, offSill);
        console.log("D3", view.name, { wall, adjacent, wallRatio, table, tableSide, tableRatio, jointRatio, timeRatio, statusRatio,
          handleRatio, doorRatio, controlRatio, nearWindowRatio: ratio(nearWindow, besideWindow), sillSideRatio, aboveDifference });
        expect(luminance(wall)).toBeGreaterThan(luminance(adjacent));
        expect(wall[0] - wall[2]).toBeGreaterThan(12);
        expect(wallRatio).toBeGreaterThanOrEqual(1.5);
        expect(luminance(nearWindow)).toBeGreaterThan(luminance(besideWindow));
        expect(ratio(nearWindow, besideWindow)).toBeGreaterThanOrEqual(1.25);
        expect(luminance(besideSill)).toBeGreaterThan(luminance(offSill));
        expect(sillSideRatio).toBeGreaterThanOrEqual(1.25);
        expect(luminance(table)).toBeGreaterThan(luminance(tableSide));
        expect(tableRatio).toBeGreaterThanOrEqual(1.15);
        const besideDish = [215, 385].map(x => luminance(tablePixel(room, view, x, tableY)));
        const awayFromDish = [135, 160, 450, 500, 560].map(x => luminance(tablePixel(room, view, x, tableY)));
        expect(Math.min(...besideDish)).toBeGreaterThan(Math.max(...awayFromDish));
        expect(jointRatio).toBeGreaterThanOrEqual(1.04);
        const unlitField = await page.addStyleTag({ content: ".dawn-field {display:none!important}" });
        const ambient = await page.screenshot();
        expect(ratio(wall, sample(ambient, view, patchX, 520))).toBeGreaterThanOrEqual(1.5);
        expect(ratio(table, tablePixel(ambient, view, 215, tableY))).toBeGreaterThanOrEqual(1.15);
        for (const style of [unlitField, hideInterface, bare]) await style.evaluate(node => node.parentNode?.removeChild(node));
        await page.emulateMedia({ forcedColors: "active" });
        await expect(page.locator(".dawn-tint .dawn-field")).toHaveCSS("display", "none");
        await expect(page.locator(".dawn-light")).toHaveCSS("display", "none");
        await expect(page.locator("#time")).toHaveText("00:00");
        await expect(page.locator("#light")).toBeVisible();
      } finally { await close(); }
    });
  }

  for (const view of views.slice(0, 3)) {
    test(`${view.name}: dawn setup contrast and capture`, async ({ browser }, testInfo) => {
      const { page, close } = await openApp(browser, { fixture: FIXTURES.burnedOut, viewport: view, touch: view.name === "phone" });
      try {
        await page.locator("#length-custom").focus();
        await page.keyboard.type("4");
        await press(page, "Enter");
        await expect(page.locator("#length-custom")).toHaveAttribute("aria-invalid", "true");
        if (view.name !== "phone") {
          await expect(page.locator("#length-error")).toBeVisible();
          const error = await backing(page, "#length-error");
          expect(ratio(error.text, error.fill)).toBeGreaterThanOrEqual(4.5);
        }
        await page.screenshot({ path: testInfo.outputPath(`controls-invalid-length-dawn-${view.name}.png`), animations: "disabled" });
      } finally { await close(); }
    });
  }

  for (const view of [VIEWPORTS_ART[0], VIEWPORTS_ART[4]]) for (const reducedMotion of [false, true]) {
    test(`${view.name} reduced ${reducedMotion}: dawn differs from every night through the window`, async ({ browser }, testInfo) => {
      test.setTimeout(90_000);
      const pane = windowPoint(view.width, view.height, 300, 218);
      const readings: Colour[] = [];
      for (const fixture of [FIXTURES.burnedOut, ...STATES.filter(row => row !== FIXTURES.burnedOut)]) {
        const { page, close } = await openScene(browser, fixture, { viewport: view, reducedMotion });
        try {
          const png = await page.screenshot({
            animations: "disabled",
            ...(reducedMotion ? {} : { path: testInfo.outputPath(`comparison-${view.name}-${fixture.name}.png`) }),
          });
          readings.push(sample(png, view, pane.x, pane.y));
        } finally { await close(); }
      }
      const [dawn, ...nights] = readings;
      if (!dawn) throw new Error("Missing dawn reading");
      expect(dawn[0] - dawn[2]).toBeGreaterThan(40);
      for (const night of nights) {
        expect(luminance(dawn)).toBeGreaterThan(luminance(night));
        expect(ratio(dawn, night)).toBeGreaterThanOrEqual(2.5);
      }
    });
  }

  for (const reducedMotion of [false, true]) {
    test(`live completion with reduced motion ${reducedMotion}`, async ({ browser }) => {
      const { page, close } = await openScene(browser, FIXTURES.litLastMinute, { viewport: VIEWPORTS_ART[3], reducedMotion });
      try {
        const field = page.locator(".dawn-light");
        await expect(field).toHaveCSS("opacity", "0");
        await page.clock.fastForward(31_000);
        await page.clock.runFor(48);
        const scene = page.locator("#scene");
        await expect(scene).toHaveAttribute("data-phase", "burned-out");
        await expect(scene).toHaveCSS("transition-duration", reducedMotion ? "0s" : "3s");
        if (!reducedMotion) await page.screenshot({ animations: "disabled" });
        await expect(field).toHaveCSS("opacity", "0.92");
      } finally { await close(); }
    });
  }
});
