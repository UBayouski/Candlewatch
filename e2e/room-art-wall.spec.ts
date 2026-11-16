/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect, test } from "@playwright/test";
import { FIXTURES, STATES, VIEWPORTS_ART, openScene, patch, ratio, roomToPx, wallSample, hideInterface } from "./room-art-fixtures";
import { ghostShotFixture, readGhosts } from "./graveyard-fixtures";

const phone = VIEWPORTS_ART[0], desktop = VIEWPORTS_ART[3];
const sampleRatio = (png: Buffer, viewport: { width: number; height: number }, x: number, y: number) => {
  const s = wallSample(x, y), a = roomToPx(viewport.width, viewport.height, s.board.x, s.board.y),
    b = roomToPx(viewport.width, viewport.height, s.joint.x, s.joint.y);
  return ratio(patch(png, a.x, a.y), patch(png, b.x, b.y));
};

test.describe("room-art E3: the wall and window", () => {
  test("joint samples, intrinsic Frame style and frame/glass contrast", async ({ browser }) => {
    test.setTimeout(90_000);
    for (const viewport of [phone, desktop]) {
      const readings: Record<string, { style: string[]; frameGlass: number }> = {};
      for (const fixture of [FIXTURES.idle, FIXTURES.litStart, FIXTURES.litLastMinute, FIXTURES.burnedOut]) {
        const app = await openScene(browser, fixture, { viewport });
        try {
          await hideInterface(app.page);
          const png = await app.page.screenshot({ animations: "disabled" });
          const style = await app.page.locator(".frame").evaluate((frame) =>
            [".f-wood", ".f-hi", ".f-sill", ".f-sill-hi"].map((selector) => {
              const s = getComputedStyle(frame.querySelector(selector) as Element);
              return `${s.fill}|${s.stroke}`;
            }));
          const f = roomToPx(viewport.width, viewport.height, 244, 150);
          const g = roomToPx(viewport.width, viewport.height, 260, 150);
          const frameGlass = ratio(patch(png, f.x, f.y), patch(png, g.x, g.y));
          readings[fixture.name] = { style, frameGlass };
          const stars = await app.page.locator(".stars").evaluate((el) => getComputedStyle(el).opacity);
          expect(stars, `${viewport.name} ${fixture.name} stars`).toBe(fixture === FIXTURES.burnedOut ? "0" : "1");
          if (fixture === FIXTURES.idle) {
            const joints = [sampleRatio(png, viewport, 200, 150), sampleRatio(png, viewport, 400, 150)];
            console.log("E3", viewport.name, "idle joints", joints);
            for (const value of joints) expect(value).toBeGreaterThanOrEqual(1.10);
          }
          if (fixture === FIXTURES.litStart) {
            const near = sampleRatio(png, viewport, 200, 500);
            console.log("E3", viewport.name, "lit joint", near);
            expect(near).toBeGreaterThanOrEqual(1.10);
          }
          if (fixture === FIXTURES.burnedOut) {
            const joints = [200, 400, 120, 480].map((x, i) => sampleRatio(png, viewport, x, i < 2 ? 150 : 500));
            console.log("E3", viewport.name, "dawn joints", joints);
            for (const value of joints) expect(value).toBeGreaterThanOrEqual(1.04);
            expect(frameGlass).toBeGreaterThanOrEqual(1.15);
            const glass = await app.page.locator(".window-dawn").boundingBox();
            expect(glass).not.toBeNull();
            const inside = patch(png, glass!.x + glass!.width / 2, glass!.y + glass!.height / 2);
            const left = patch(png, glass!.x - 60, glass!.y + glass!.height / 2);
            const token = await app.page.locator(".candle-scene").evaluate((el) => getComputedStyle(el).getPropertyValue("--window-dawn").trim());
            const target = [1, 3, 5].map((i) => Number.parseInt(token.slice(i, i + 2), 16));
            expect(inside.reduce((s, c) => s + c, 0) - left.reduce((s, c) => s + c, 0)).toBeGreaterThan(30);
            expect(Math.max(...inside.map((c, i) => Math.abs(c - target[i]!)))).toBeLessThanOrEqual(6);
          }
        } finally { await app.close(); }
      }
      expect(readings["lit-start"]!.style).toEqual(readings["lit-last-minute"]!.style);
      expect(readings["lit-start"]!.frameGlass).toBeGreaterThanOrEqual(1.10);
      expect(readings["lit-last-minute"]!.frameGlass).toBeGreaterThanOrEqual(1.10);
      console.log("E3", viewport.name, "frame/glass", readings);
    }
  });
});

test.describe("room-art E9: reduced motion keeps the Still Setting", () => {
  for (const viewport of [phone, desktop]) for (const fixture of [...STATES, ghostShotFixture(5)]) {
    test(`${viewport.name} ${fixture.name}: still patches, ghosts and motion properties`, async ({ browser }) => {
      test.setTimeout(90_000);
      const normal = await openScene(browser, fixture, { viewport });
      const reduced = await openScene(browser, fixture, { viewport, reducedMotion: true });
      try {
        const ghostNormal = (await readGhosts(normal.page)).ghosts.map((g) => [g.slot, g.rest.x, g.rest.y]);
        const ghostReduced = (await readGhosts(reduced.page)).ghosts.map((g) => [g.slot, g.rest.x, g.rest.y]);
        expect(ghostReduced).toEqual(ghostNormal);
        await hideInterface(normal.page); await hideInterface(reduced.page);
        const points = [[200, 150], [100, 888], [244, 150], [50, 860]] as const;
        const one = await normal.page.screenshot({ animations: "disabled" });
        const two = await reduced.page.screenshot({ animations: "disabled" });
        const differences = points.map(([x, y]) => {
          const p = roomToPx(viewport.width, viewport.height, x, y);
          const a = patch(one, p.x, p.y), b = patch(two, p.x, p.y);
          return Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));
        });
        console.log("E9", viewport.name, fixture.name, "Still Setting differences", differences, "ghosts", ghostReduced.length);
        for (const value of differences) expect(value).toBeLessThanOrEqual(2);
        const still = () => reduced.page.locator(".candle-scene").evaluate((el) => {
          const s = getComputedStyle(el);
          return ["--flicker-lean", "--flicker-height", "--flicker-glow"].map((name) => s.getPropertyValue(name).trim());
        });
        const first = await still();
        await reduced.page.clock.runFor(500);
        const second = await still();
        expect(first).toEqual(["0", "0", "0"]);
        expect(second).toEqual(first);
        const durations = await reduced.page.evaluate(() => [...document.querySelectorAll(".candle-scene,.candle-scene *,.ghost-layer,.ghost-layer *")].flatMap((el) => {
          const s = getComputedStyle(el);
          return [s.animationDuration, s.transitionDuration].flatMap((value) => value.split(",").map((part) => Number.parseFloat(part)));
        }));
        expect(durations.every((value) => value === 0)).toBe(true);
      } finally { await normal.close(); await reduced.close(); }
    });
  }
});
