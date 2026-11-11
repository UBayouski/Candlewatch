// The candle scene in a real browser (candle-scene design 11.3, requirement R13.7).
// Each state is reached the way a real visit reaches it: a stored session and a frozen clock, with no hook in the shipped code.
import { expect, test } from "@playwright/test";
import { STRINGS } from "../src/strings";
import { FIXTURES, STATES, VIEWPORTS, boxOf, maxPixelDistance, openScene, paletteColour, readScene } from "./scene-fixtures";
import type { Fixture } from "./scene-fixtures";

test.describe.configure({ mode: "parallel" });

type Row = {
  fixture: Fixture;
  flame: keyof typeof STRINGS.scene;
  phase: string;
  wax: number;
  drips: number;
  light: number;
  dawn: number;
  cooling: number;
  smoke: number;
  stub: number;
};

/** design 11.3: what each fixture must show. */
const ROWS: Row[] = [
  { fixture: FIXTURES.idle, flame: "unlit", phase: "idle", wax: 1, drips: 0, light: 0.2, dawn: 0, cooling: 0, smoke: 0, stub: 0 },
  { fixture: FIXTURES.litStart, flame: "steady", phase: "lit", wax: 1, drips: 0, light: 1, dawn: 0, cooling: 0, smoke: 0, stub: 0 },
  { fixture: FIXTURES.litHalf, flame: "steady", phase: "lit", wax: 0.5, drips: 2, light: 0.6, dawn: 0, cooling: 0, smoke: 0, stub: 0 },
  { fixture: FIXTURES.litLastMinute, flame: "guttering", phase: "lit", wax: 0.02, drips: 3, light: 0.216, dawn: 0, cooling: 0, smoke: 0, stub: 0 },
  { fixture: FIXTURES.paused, flame: "paused", phase: "paused", wax: 0.6, drips: 1, light: 0.68, dawn: 0, cooling: 0, smoke: 0, stub: 0 },
  { fixture: FIXTURES.burnedOut, flame: "smoke", phase: "burned-out", wax: 0, drips: 0, light: 0, dawn: 1, cooling: 1, smoke: 1, stub: 1 },
  { fixture: FIXTURES.burnedOutAfterBreak, flame: "smoke", phase: "burned-out", wax: 0, drips: 0, light: 0, dawn: 1, cooling: 0, smoke: 1, stub: 1 },
  { fixture: FIXTURES.snuffed, flame: "smoke", phase: "snuffed", wax: 0, drips: 0, light: 0, dawn: 0, cooling: 0, smoke: 1, stub: 1 },
];

test.describe("each state sets the custom properties and attributes it should", () => {
  for (const row of ROWS) {
    test(row.fixture.name, async ({ browser }) => {
      const scene = await openScene(browser, row.fixture);
      try {
        const r = await readScene(scene.page);
        expect(r.role).toBe("img");
        expect(r.ariaLabel).toBe(STRINGS.scene[row.flame]);
        expect(r.flame).toBe(row.flame);
        expect(r.phase).toBe(row.phase);
        expect(r.settled).toBe("true");
        // The last frame is drawn up to 40 ms after the instant: about 3e-5 of a 25-minute candle.
        expect(r.props["--wax-height"]).toBeCloseTo(row.wax, 4);
        expect(r.props["--drips"]).toBe(row.drips);
        expect(r.props["--light-radius"]).toBeCloseTo(row.light, 4);
        expect(r.props["--dawn"]).toBe(row.dawn);
        expect(r.props["--cooling"]).toBe(row.cooling);
        expect(r.props["--smoke"]).toBe(row.smoke);
        expect(r.props["--stub"]).toBe(row.stub);
      } finally {
        await scene.close();
      }
    });
  }
});

test.describe("the stored session is settled by the reload, as it would be on a real visit", () => {
  test("a lit session past its completion draws the dawn", async ({ browser }) => {
    const scene = await openScene(browser, FIXTURES.litPastCompletion);
    try {
      const r = await readScene(scene.page);
      expect(r.phase).toBe("burned-out");
      expect(r.flame).toBe("smoke");
      expect(r.props["--dawn"]).toBe(1);
      expect(r.props["--stub"]).toBe(1);
      expect(r.props["--cooling"]).toBe(0); // the break ended 10 minutes ago
    } finally {
      await scene.close();
    }
  });

  test("a paused session past the pause limit draws smoke and no dawn", async ({ browser }) => {
    const scene = await openScene(browser, FIXTURES.pausedPastLimit);
    try {
      const r = await readScene(scene.page);
      expect(r.phase).toBe("snuffed");
      expect(r.flame).toBe("smoke");
      expect(r.props["--dawn"]).toBe(0);
      expect(r.props["--smoke"]).toBe(1);
      expect(r.props["--stub"]).toBe(1);
    } finally {
      await scene.close();
    }
  });
});

test.describe("reduced motion shows the same state with the motion switched off", () => {
  for (const fixture of STATES) {
    test(fixture.name, async ({ browser }) => {
      const normal = await openScene(browser, fixture);
      const still = await openScene(browser, fixture, { reducedMotion: true });
      try {
        const n = await readScene(normal.page);
        const s = await readScene(still.page);
        expect(s.props["--flicker-lean"]).toBe(0);
        expect(s.props["--flicker-height"]).toBe(0);
        expect(s.props["--flicker-glow"]).toBe(0);
        expect(s.ease).toBe("false");
        expect(s.animateDrips).toBe("false");
        expect(s.animateSmoke).toBe("false");
        // Nothing that is not motion changes.
        expect(s.flame).toBe(n.flame);
        expect(s.phase).toBe(n.phase);
        for (const name of Object.keys(s.props).filter((k) => !k.startsWith("--flicker"))) {
          expect(s.props[name], name).toBe(n.props[name]);
        }
        expect(s.ariaLabel).toBe(n.ariaLabel);
      } finally {
        await normal.close();
        await still.close();
      }
    });
  }
});

test.describe("the room fits every viewport: no scrollbar, the candle and the flame inside", () => {
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    for (const fixture of [FIXTURES.litStart, FIXTURES.burnedOut]) {
      test(`${fixture.name} at ${name} (${viewport.width}x${viewport.height})`, async ({ browser }) => {
        const scene = await openScene(browser, fixture, { viewport });
        try {
          const scroll = await scene.page.evaluate(() => ({
            sw: document.documentElement.scrollWidth,
            cw: document.documentElement.clientWidth,
            sh: document.documentElement.scrollHeight,
            ch: document.documentElement.clientHeight,
          }));
          expect(scroll.sw).toBeLessThanOrEqual(scroll.cw);
          expect(scroll.sh).toBeLessThanOrEqual(scroll.ch);
          for (const selector of [".candle", ".flame-shape"]) {
            const box = await boxOf(scene.page, selector);
            expect(box.x, selector).toBeGreaterThanOrEqual(0);
            expect(box.y, selector).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width, selector).toBeLessThanOrEqual(viewport.width);
            expect(box.y + box.height, selector).toBeLessThanOrEqual(viewport.height);
          }
        } finally {
          await scene.close();
        }
      });
    }
  }
});

test.describe("the candle is exactly proportional to the wax (F6)", () => {
  test("the body's height over its height at the start equals the wax height, and the stub appears only after the end", async ({ browser }) => {
    const start = await openScene(browser, FIXTURES.litStart);
    let full: number;
    try {
      full = (await boxOf(start.page, ".body")).height;
    } finally {
      await start.close();
    }
    expect(full).toBeGreaterThan(300); // 420 units at 0.8
    for (const fixture of [FIXTURES.litStart, FIXTURES.litHalf, FIXTURES.litLastMinute, FIXTURES.paused]) {
      const scene = await openScene(browser, fixture);
      try {
        const r = await readScene(scene.page);
        const body = await boxOf(scene.page, ".body");
        expect(body.height / full, fixture.name).toBeCloseTo(r.props["--wax-height"] ?? NaN, 2);
        const stubOpacity = await scene.page.evaluate(() => Number(getComputedStyle(document.querySelector(".stub") as Element).opacity));
        expect(stubOpacity, fixture.name).toBe(0);
      } finally {
        await scene.close();
      }
    }
    for (const fixture of [FIXTURES.burnedOut, FIXTURES.snuffed]) {
      const scene = await openScene(browser, fixture);
      try {
        const body = await boxOf(scene.page, ".body");
        expect(body.height, fixture.name).toBeLessThan(1);
        const stubOpacity = await scene.page.evaluate(() => Number(getComputedStyle(document.querySelector(".stub") as Element).opacity));
        expect(stubOpacity, fixture.name).toBe(1);
      } finally {
        await scene.close();
      }
    }
  });
});

test.describe("the time-text zone stays clear of flame, halo and light pool (F5)", () => {
  const cases: [string, Fixture, keyof typeof VIEWPORTS, boolean][] = [
    ...ROWS.map((r): [string, Fixture, keyof typeof VIEWPORTS, boolean] => [`${r.fixture.name} at desktop`, r.fixture, "desktop", false]),
    ["lit-start at phone", FIXTURES.litStart, "phone", false],
    ["lit-last-minute at phone", FIXTURES.litLastMinute, "phone", false],
    ["burned-out at phone", FIXTURES.burnedOut, "phone", false],
    ["lit-last-minute at desktop, reduced motion", FIXTURES.litLastMinute, "desktop", true],
    ["lit-start at wide", FIXTURES.litStart, "wide", false],
  ];
  for (const [title, fixture, size, reducedMotion] of cases) {
    test(title, async ({ browser }) => {
      const scene = await openScene(browser, fixture, { viewport: VIEWPORTS[size], reducedMotion });
      try {
        const dawn = ["burned-out", "burned-out-after-break", "lit-past-completion"].includes(fixture.name);
        const colour = await paletteColour(scene.page, dawn ? "--zone-bg-brightest" : "--zone-bg-darkest");
        const area = await boxOf(scene.page, ".zone-text-area");
        expect(area.width).toBeGreaterThan(100);
        expect(area.height).toBeGreaterThan(40);
        const worst = await maxPixelDistance(scene.page, area, colour);
        expect(worst).toBeLessThanOrEqual(2);
      } finally {
        await scene.close();
      }
    });
  }
});
