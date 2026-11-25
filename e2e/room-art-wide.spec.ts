/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { CANDLE_H, LANDSCAPE_CANDLE_H, LANDSCAPE_WAX_BASE_Y, LANDSCAPE_WINDOW, WINDOW } from "../src/scene/constants";
import { WALL, WALL_ORIGIN_X, wallBlocks, wallHeights } from "../src/scene/setting";
import { placeControls, stageBox } from "../src/ui/layout";
import { FIXTURES, VIEWPORTS_ART, openScene, patch, rgbAt, luminance } from "./room-art-fixtures";

const night = [5, 7, 13] as const;
const edgeDistance = (pixel: readonly number[]) => pixel.reduce((s, v, i) => s + Math.abs(v - night[i]!), 0);
const sizes = [...VIEWPORTS_ART, { name: "wide-short", width: 2560, height: 1080 }] as const;
const states = [FIXTURES.idle, FIXTURES.litStart, FIXTURES.paused, FIXTURES.burnedOut] as const;

test.describe("visual-polish D2: the candle and its setting fit the viewport", () => {
  for (const viewport of [VIEWPORTS_ART[0], VIEWPORTS_ART[3], VIEWPORTS_ART[4], VIEWPORTS_ART[6]]) {
    test(`${viewport.name}: full wax, window, holder, table and time band`, async ({ browser }) => {
      const { width, height } = viewport;
      const layout = placeControls(width, height);
      const { ox, oy, scale } = layout.stage;
      const window = layout.landscapeScene ? LANDSCAPE_WINDOW : WINDOW;
      const app = await openScene(browser, FIXTURES.litStart, { viewport, reducedMotion: true });
      try {
        const box = async (selector: string) => {
          const rect = await app.page.locator(selector).boundingBox();
          if (!rect) throw new Error(`Missing visible geometry for ${selector}`);
          return rect;
        };
        const wax = await box(".room .body");
        expect(wax.height).toBeCloseTo((layout.landscapeScene ? LANDSCAPE_CANDLE_H : CANDLE_H) * scale, 1);
        if (layout.landscapeScene) expect(wax.height / height).toBeGreaterThanOrEqual(0.546);
        const waxBottom = wax.y + wax.height;
        expect(waxBottom).toBeCloseTo(layout.landscapeScene ? oy + LANDSCAPE_WAX_BASE_Y * scale : layout.floorY, 1);
        const pane = await box(".f-wood");
        expect(pane.x).toBeCloseTo(ox + window.x * scale, 1);
        expect(pane.y).toBeCloseTo(oy + window.y * scale, 1);
        expect(pane.width).toBeCloseTo(window.width * scale, 1);
        expect(pane.height).toBeCloseTo(window.height * scale, 1);
        const halo = await box(".halo");
        const wick = await box(".wick");
        expect(wick.y + wick.height).toBeCloseTo(wax.y, 1);
        expect(halo.y).toBeGreaterThan(pane.y + pane.height);
        const holder = await box(".holder");
        expect(holder.width).toBeCloseTo((layout.landscapeScene ? 150 : 124) * scale, 1);
        const table = await box(".t-face");
        expect(table.x).toBeLessThan(0);
        expect(table.x + table.width).toBeGreaterThan(width);
        const tableBottom = table.y + table.height;
        if (layout.landscapeScene) {
          const front = await box(".h-front");
          const frontBottom = front.y + front.height;
          const dishBottom = Math.max(frontBottom, holder.y + holder.height);
          expect(dishBottom).toBeLessThan(layout.floorY);
          expect(tableBottom).toBeLessThan(layout.floorY);
          expect(tableBottom - dishBottom).toBeGreaterThanOrEqual(8);
          expect(front.y).toBeLessThan(waxBottom);
          expect(waxBottom).toBeLessThan(frontBottom);

          const x = Math.floor(wax.x + wax.width / 2);
          const isWax = ([r, g, b]: readonly number[]) => r! > 190 && g! > 175 && b! > 140;
          const picture = await app.page.screenshot({ animations: "disabled" });
          const hiddenFoot = Math.floor(waxBottom - 1);
          let lastWax = hiddenFoot;
          while (lastWax >= wax.y && !isWax(rgbAt(picture, x, lastWax))) lastWax--;
          expect(lastWax + 1).toBeLessThan(waxBottom);
          expect(lastWax + 1).toBeLessThan(frontBottom);
          expect((lastWax + 1 - wax.y) / height).toBeGreaterThanOrEqual(0.546);
          const hiddenFront = await app.page.addStyleTag({ content: ".candle-scene[data-landscape] .holder-foreground { display: none; }" });
          expect(isWax(rgbAt(await app.page.screenshot({ animations: "disabled" }), x, hiddenFoot))).toBe(true);
          await hiddenFront.evaluate((sheet) => sheet.parentNode?.removeChild(sheet));
          console.log("D2 foot", viewport.name, {
            waxBottom, visibleWaxBottom: lastWax + 1, visibleWaxHeight: lastWax + 1 - wax.y,
            dishBottom, tableBottom, bandTop: layout.floorY, tableBelowDish: tableBottom - dishBottom,
          });
        } else {
          expect(tableBottom).toBeCloseTo(layout.floorY, 1);
        }
        const time = await box("#time");
        expect(time.y).toBeGreaterThanOrEqual(layout.floorY - 0.05);
        expect(time.y + time.height).toBeLessThan(height);
        console.log("D2 rendered full wax", viewport.name, wax.height, wax.height / height);
        if (layout.landscapeScene) {
          await app.page.emulateMedia({ forcedColors: "active" });
          await expect(app.page.locator(".holder-foreground")).toBeHidden();
          const forcedWax = await box(".room .body");
          expect(forcedWax.y + forcedWax.height).toBeCloseTo(layout.floorY, 1);
        }
      } finally { await app.close(); }
    });
  }
});

test.describe("room-art E2: the setting reaches both edges", () => {
  for (const viewport of sizes) for (const state of states) {
    test(`${viewport.name} ${state.name}: edge patches and no scroll`, async ({ browser }) => {
      const app = await openScene(browser, state, { viewport });
      try {
        const scroll = await app.page.evaluate(() => ({
          width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        }));
        expect(scroll.width).toBeLessThanOrEqual(viewport.width);
        expect(scroll.height).toBeLessThanOrEqual(viewport.height);
        if (viewport.name === "wide" && state === FIXTURES.idle) {
          const jointOpacity = await app.page.evaluate(() => Number(getComputedStyle(document.querySelector(".s-joint") as Element).fillOpacity));
          console.log("E2 horizontal-joint opacity", jointOpacity);
          expect(jointOpacity).toBe(0.6);
        }
        if (viewport.name === "wide-short" && state === FIXTURES.idle) {
          const ends = await app.page.locator("#cw-win-edge-grad stop").evaluateAll((nodes) =>
            [nodes[0]?.getAttribute("data-k"), nodes[nodes.length - 1]?.getAttribute("data-k")]);
          console.log("E2 held edge-shade ends", ends);
          expect(ends).toEqual(["1", "1"]);
        }
        const png = await app.page.screenshot({ animations: "disabled" });
        const distances: number[] = [];
        for (const fraction of [0.3, 0.6, 0.8]) for (const x of [2, viewport.width - 3]) {
          distances.push(edgeDistance(patch(png, x, fraction * viewport.height)));
        }
        if (viewport.name === "wide" && state === FIXTURES.idle) {
          const stage = stageBox(viewport.width, viewport.height);
          const edgeX = (2 - stage.ox) / stage.scale;
          const tileH = wallHeights(WALL.seed).reduce((a, b) => a + b, 0);
          const nearest = wallBlocks(WALL.seed).flatMap((block) => {
            if (!block.joint) return [];
            return Array.from({ length: 9 }, (_, k) => {
              const dx = k - 4;
              const x = WALL_ORIGIN_X + block.cx + dx * WALL.tileW;
              const y = block.joint!.y + tileH;
              return { x, y, distance: Math.abs(x - edgeX) + Math.abs(y - 600) / 10 };
            });
          }).sort((a, b) => a.distance - b.distance)[0];
          expect(nearest).toBeDefined();
          const jointY = stage.oy + nearest!.y * stage.scale;
          const jointDistance = edgeDistance(patch(png, 2, jointY));
          console.log("E2 horizontal joint at edge", { x: edgeX, nearest, jointY, jointDistance });
          expect(jointDistance).toBeGreaterThanOrEqual(8);
        }
        console.log("E2", viewport.name, state.name, "edge distances", distances, "minimum", Math.min(...distances));
        for (const d of distances) expect(d).toBeGreaterThanOrEqual(8);
      } finally { await app.close(); }
    });
  }
});

const gradientSizes = [VIEWPORTS_ART[4], VIEWPORTS_ART[5], VIEWPORTS_ART[6], { name: "wide-short", width: 2560, height: 1080 }] as const;
const gradientHide = "#ui,.ghost-layer{display:none!important}.setting{visibility:hidden!important}.setting .wall-veil{visibility:visible!important}";
// Q69: measured from the frozen Prototype's #idle picture served locally with gradientHide and readGradient below.
const PROTOTYPE_GRADIENT: Record<string, { rise: number; step: number; channel: number }> = {
  wide: { rise: 0.943962, step: 3.200727, channel: 17.696893 },
  wider: { rise: 2.430255, step: 2.430255, channel: 17.824176 },
  "4k": { rise: 2.059466, step: 2.364745, channel: 17.820984 },
  "wide-short": { rise: 1.234767, step: 3.461612, channel: 16.190540 },
};

function readGradient(png: Buffer, width: number, height: number) {
  const stage = stageBox(width, height), y0 = Math.round(stage.oy + 330 * stage.scale), y1 = Math.round(stage.oy + 860 * stage.scale);
  const col: number[] = [], channels: number[] = [];
  for (let x = 0; x < width; x += 4) {
    let light = 0, channel = 0, count = 0;
    for (let y = y0; y < y1; y += 2) {
      const rx = (x - stage.ox) / stage.scale, ry = (y - stage.oy) / stage.scale;
      if ((rx > 250 && rx < 350) || (rx < 120 && ry > 780)) continue;
      const rgb = rgbAt(png, x, y);
      light += luminance(rgb); channel += (rgb[0] + rgb[1] + rgb[2]) / 3; count++;
    }
    col.push(count ? light / count : Number.NaN);
    channels.push(count ? channel / count : Number.NaN);
  }
  const valid = col.filter(Number.isFinite), mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const goodChannels = channels.filter(Number.isFinite), meanChannel = goodChannels.reduce((a, b) => a + b, 0) / goodChannels.length;
  const axis = (stage.ox + 300 * stage.scale) / 4;
  let rise = 0, step = 0;
  for (let i = 1; i < col.length; i++) {
    const a = col[i - 1]!, b = col[i]!;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    rise = Math.max(rise, i <= axis ? a - b : b - a);
    if (Math.abs(i * 4 - stage.ox - 300 * stage.scale) > 320 * stage.scale) step = Math.max(step, Math.abs(b - a));
  }
  return { rise: 100 * rise / mean, step: 100 * step / mean, channel: meanChannel, oneLevelPercent: 100 / meanChannel };
}

test.describe("room-art E14: the periphery agrees with the Prototype", () => {
  for (const viewport of gradientSizes) test(`${viewport.name}: outward rise and four-pixel step`, async ({ browser }) => {
    test.setTimeout(90_000);
    const root = resolve(import.meta.dirname, "..");
    const server = createServer((req, res) => {
      const path = resolve(root, "." + decodeURIComponent((req.url ?? "/").split("?")[0]!));
      if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      try { res.writeHead(200, { "Content-Type": path.endsWith(".html") ? "text/html" : "text/css" }).end(readFileSync(path)); }
      catch { res.writeHead(404).end(); }
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const port = (server.address() as { port: number }).port;
    const context = await browser.newContext({ viewport });
    const proto = await context.newPage();
    const build = await openScene(browser, FIXTURES.idle, { viewport });
    try {
      await proto.goto(`http://127.0.0.1:${port}/.kiro/specs/room-art/prototype/index.html#idle`);
      // The frozen HTML still links the live styles. Restore its retired wash's
      // opacity binding so the idle reference remains dark in the same way.
      await proto.addStyleTag({ content: `${gradientHide}.dawn-wash{opacity:var(--dawn)}` });
      await build.page.addStyleTag({ content: gradientHide });
      const reference = readGradient(await proto.screenshot({ animations: "disabled" }), viewport.width, viewport.height);
      const actual = readGradient(await build.page.screenshot({ animations: "disabled" }), viewport.width, viewport.height);
      console.log("E14", viewport.name, { prototype: reference, build: actual });
      const pinned = PROTOTYPE_GRADIENT[viewport.name];
      expect(pinned).toBeDefined();
      expect(reference.rise).toBeCloseTo(pinned!.rise, 1);
      expect(reference.step).toBeCloseTo(pinned!.step, 1);
      expect(reference.channel).toBeCloseTo(pinned!.channel, 1);
      expect(Math.abs(actual.rise - pinned!.rise)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(actual.step - pinned!.step)).toBeLessThanOrEqual(0.5);
    } finally {
      await build.close(); await context.close();
      await new Promise<void>((done) => server.close(() => done()));
    }
  });
  const movingAverage = (xs: number[], win: number) => xs.map((_, i) => {
    const values = xs.slice(Math.max(0, i - win / 2), i + win / 2).filter(Number.isFinite);
    return values.length > win / 3 ? values.reduce((a, b) => a + b, 0) / values.length : Number.NaN;
  });
  for (const viewport of [VIEWPORTS_ART[3], VIEWPORTS_ART[4], VIEWPORTS_ART[5]]) {
    test(`${viewport.name}: fade-removed wall-column residual`, async ({ browser }) => {
      test.setTimeout(90_000);
      const app = await openScene(browser, FIXTURES.idle, { viewport });
      try {
        await app.page.addStyleTag({ content: "#ui,.ghost-layer,.wall-veil,.win-edge{display:none!important}" });
        const png = await app.page.screenshot({ animations: "disabled" });
        const stage = stageBox(viewport.width, viewport.height);
        const y0 = Math.round(stage.oy + 330 * stage.scale), y1 = Math.round(stage.oy + 860 * stage.scale);
        const col: number[] = [];
        for (let x = 0; x < viewport.width; x++) {
          let sum = 0, count = 0;
          for (let y = y0; y < y1; y += 2) {
            const rx = (x - stage.ox) / stage.scale, ry = (y - stage.oy) / stage.scale;
            if ((rx > 250 && rx < 350) || (rx < 120 && ry > 780)) continue;
            sum += luminance(rgbAt(png, x, y)); count++;
          }
          col.push(count ? sum / count : Number.NaN);
        }
        const fine = movingAverage(col, Math.round(130 * stage.scale));
        const slow = movingAverage(col, Math.round(600 * stage.scale));
        const residual = col.map((_, i) => fine[i]! - slow[i]!).filter(Number.isFinite);
        const valid = col.filter(Number.isFinite), mean = valid.reduce((a, b) => a + b, 0) / valid.length;
        const value = Math.sqrt(residual.reduce((a, b) => a + b * b, 0) / residual.length) / mean;
        console.log("E14", viewport.name, "fade-removed residual", value);
        expect(value).toBeLessThanOrEqual(0.06);
      } finally { await app.close(); }
    });
  }
});

