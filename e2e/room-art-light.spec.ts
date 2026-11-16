/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect, test } from "@playwright/test";
import { CANDLE_H, LIGHT_FULL_UNITS, STUB_H } from "../src/scene/constants";
import { STRINGS } from "../src/strings";
import { patch, ratio, roomToPx, wallSample, VIEWPORTS_ART, WALL_SAMPLES, STATES, FIXTURES, openScene, hideInterface } from "./room-art-fixtures";
import type { Colour } from "./room-art-fixtures";

const distance = (a: Colour, b: Colour): number => Math.max(...a.map((v, i) => Math.abs(v - (b[i] ?? 0))));
const photo = async (page: import("@playwright/test").Page) => page.screenshot({ animations: "disabled" });

test.describe("room-art E1: constant Window_Light and shrinking pool", () => {
  test("lit start and last minute use the same constant light outside the pool", async ({ browser }) => {
    const viewport = VIEWPORTS_ART[3];
    const between = wallSample(120, 150).board;
    const fromStart = Math.hypot(between.x - 300, between.y - 400);
    expect(fromStart).toBeGreaterThan(230);
    expect(fromStart).toBeLessThan(650);
    // The two circular profiles cross here; this is on the wall, clear of the candle.
    const lastCentre = 400 + 0.98 * 420, lastRadius = 0.2 + 0.8 * 0.02;
    const common = { x: 235, y: 755 };
    expect(Math.hypot(common.x - 300, common.y - 400)).toBeLessThan(LIGHT_FULL_UNITS);
    expect(Math.hypot(common.x - 300, common.y - lastCentre)).toBeLessThan(LIGHT_FULL_UNITS * lastRadius);
    const readings: Colour[][] = [];
    for (const fixture of [FIXTURES.litStart, FIXTURES.litLastMinute]) {
      const app = await openScene(browser, fixture, { viewport });
      try {
        await hideInterface(app.page);
        const png = await photo(app.page);
        readings.push([between, common, { x: -480, y: 300 }, { x: 300, y: 150 }].map((p) => { const q = roomToPx(viewport.width, viewport.height, p.x, p.y); return patch(png, q.x, q.y); }));
      } finally { await app.close(); }
    }
    const [start, last] = readings;
    expect(start).toBeDefined(); expect(last).toBeDefined();
    const changes = start!.map((a, i) => distance(a, last![i] as Colour));
    console.log("E1 start/last changes between, both, outside, glass", changes);
    expect(changes[0]).toBeGreaterThan(2);
    for (const i of [1, 2, 3]) expect(changes[i], `E1 point ${i}`).toBeLessThanOrEqual(2);
  });
});

test.describe("room-art E4: Holder stays behind the candle", () => {
  for (const viewport of [VIEWPORTS_ART[0], VIEWPORTS_ART[3]]) test(`${viewport.name}: body patch is unchanged when Holder is hidden`, async ({ browser }) => {
    const app = await openScene(browser, FIXTURES.litStart, { viewport });
    try {
      await hideInterface(app.page);
      const p = roomToPx(viewport.width, viewport.height, 300, 892);
      const withHolder = patch(await photo(app.page), p.x, p.y);
      const rule = await app.page.addStyleTag({ content: ".holder { display: none !important }" });
      const withoutHolder = patch(await photo(app.page), p.x, p.y);
      await rule.evaluate((el) => el.parentNode?.removeChild(el));
      const d = distance(withHolder, withoutHolder);
      console.log("E4 holder/body difference", viewport.name, d);
      expect(d).toBeLessThanOrEqual(2);
    } finally { await app.close(); }
  });
});

const night: Colour = [5, 7, 13];
const wallPoints = WALL_SAMPLES.map(([x, y]) => wallSample(x, y).board);
const returningIdle = { name: "idle-returning", state: { phase: "idle", history: FIXTURES.snuffed.state.history }, now: FIXTURES.idle.now } as const;
const settingPoints = [wallPoints[0], { x: 100, y: 888 }, { x: 244, y: 150 }, { x: 50, y: 860 }] as const;
const readPoints = (png: Buffer, viewport: (typeof VIEWPORTS_ART)[number], points: readonly { x: number; y: number }[]) =>
  points.map(({ x, y }) => { const p = roomToPx(viewport.width, viewport.height, x, y); return patch(png, p.x, p.y); });

test.describe("room-art E12: idle is a room and snuffed is darker", () => {
  for (const viewport of VIEWPORTS_ART) {
    test(`${viewport.name}: idle and snuffed art, smoke, candle and status`, async ({ browser }) => {
      const colours: Colour[][] = [];
      for (const fixture of [returningIdle, FIXTURES.snuffed]) {
        const app = await openScene(browser, fixture, { viewport });
        try {
          const indicators = await app.page.evaluate(() => {
            const style = (selector: string) => getComputedStyle(document.querySelector(selector) as Element);
            const height = (selector: string) => (document.querySelector(selector) as SVGGraphicsElement).getBoundingClientRect().height;
            return { pool: style(".pool").display, tint: style(".pool-tint").display,
              smoke: Number(style(".smoke-wisp").opacity), body: height(".body"), stub: height(".stub"),
              stubOpacity: Number(style(".stub").opacity), status: document.querySelector("#status")?.textContent };
          });
          if (fixture === returningIdle) {
            expect(indicators.pool).toBe("none"); expect(indicators.tint).toBe("none");
            expect(indicators.smoke).toBe(0);
            expect(indicators.body).toBeCloseTo(CANDLE_H * roomToPx(viewport.width, viewport.height, 1, 0).x - CANDLE_H * roomToPx(viewport.width, viewport.height, 0, 0).x, 1);
            expect(indicators.stubOpacity).toBe(0);
            expect(indicators.status).toBe(STRINGS.status.idle);
          } else {
            expect(indicators.smoke).toBe(1); expect(indicators.body).toBeLessThan(1);
            expect(indicators.stubOpacity).toBe(1);
            const scale = roomToPx(viewport.width, viewport.height, 1, 0).x - roomToPx(viewport.width, viewport.height, 0, 0).x;
            expect(indicators.stub).toBeCloseTo(STUB_H * scale, 1);
            expect(indicators.status).toBe(STRINGS.status.snuffed);
          }
          await hideInterface(app.page);
          colours.push(readPoints(await photo(app.page), viewport, [...wallPoints, ...settingPoints] as { x: number; y: number }[]));
        } finally { await app.close(); }
      }
      const idle = colours[0]!, snuffed = colours[1]!;
      const wallRatios = wallPoints.map((_, i) => ratio(idle[i]!, snuffed[i]!));
      const settingRatios = settingPoints.map((_, i) => ratio(idle[wallPoints.length + i]!, night));
      console.log("E12", viewport.name, "points", wallPoints, "idle/snuffed wall", wallRatios, "idle/night wall/table/frame/door", settingRatios);
      for (const value of wallRatios) expect(value).toBeGreaterThanOrEqual(1.10);
      for (const value of settingRatios) expect(value).toBeGreaterThanOrEqual(1.10);
    });
    test(`${viewport.name}: lit start has a visible pool`, async ({ browser }) => {
      const app = await openScene(browser, FIXTURES.litStart, { viewport });
      try {
        const displays = await app.page.evaluate(() => [".pool", ".pool-tint"].map((s) => getComputedStyle(document.querySelector(s) as Element).display));
        expect(displays).not.toContain("none");
      } finally { await app.close(); }
    });
    for (const fixture of STATES.filter((s) => s !== FIXTURES.snuffed)) {
      test(`${viewport.name}: snuffed is no brighter than ${fixture.name}`, async ({ browser }) => {
        const readings: Colour[][] = [];
        for (const state of [fixture, FIXTURES.snuffed]) {
          const app = await openScene(browser, state, { viewport });
          try { await hideInterface(app.page); readings.push(readPoints(await photo(app.page), viewport, wallPoints)); }
          finally { await app.close(); }
        }
        const differences = wallPoints.map((_, i) => Math.max(...readings[1]![i]!.map((v, c) => v - readings[0]![i]![c]!)));
        console.log("E12", viewport.name, "snuffed minus", fixture.name, differences);
        for (const d of differences) expect(d).toBeLessThanOrEqual(2);
      });
    }
  }
});
