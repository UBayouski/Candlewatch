// The candle scene in a real browser (candle-scene design 11.3, requirement R13.7).
// Each state is reached the way a real visit reaches it: a stored session and a frozen clock, with no hook in the shipped code.
import { expect, test } from "@playwright/test";
import { countWords } from "../src/ghosts/label";
import { STRINGS } from "../src/strings";
import { FIXTURES, STATES, VIEWPORTS, boxOf, colourAt, maxPixelDistance, openScene, paletteColour, readScene, stopColour } from "./scene-fixtures";
import type { Box, Fixture } from "./scene-fixtures";

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
        // The flame's name, then the engine's distraction count in words (ghosts-and-graveyard R10.1); no fixture here has a distraction.
        expect(r.ariaLabel).toBe(`${STRINGS.scene[row.flame]} ${countWords(0)}.`);
        expect(r.ariaLabel).toMatch(/ 0 distractions\.$/);
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
        // The interface draws the time text and the status line in this zone (controls-and-access R15.2): hide it, so the test
        // keeps checking the scene's own pixels.
        await scene.page.addStyleTag({ content: "#ui { visibility: hidden; }" });
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

    // With the interface shown, the same area holds only the zone colour, the interface's own colours, and blends of them
    // (anti-aliased text and borders): the layer cannot hide a leak of the scene's light into the zone.
    test(`${title}, with the interface shown`, async ({ browser }) => {
      const scene = await openScene(browser, fixture, { viewport: VIEWPORTS[size], reducedMotion });
      try {
        const dawn = ["burned-out", "burned-out-after-break", "lit-past-completion"].includes(fixture.name);
        const zone = await paletteColour(scene.page, dawn ? "--zone-bg-brightest" : "--zone-bg-darkest");
        const own = await scene.page.evaluate(() => {
          const style = getComputedStyle(document.querySelector("#ui") as Element);
          return ["--ui-text", "--ui-text-subtle", "--ui-error", "--ui-bg", "--ui-bg-selected", "--ui-border"].map((name) => style.getPropertyValue(name).trim());
        });
        const palette = [zone, ...own.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number])];
        const area = await boxOf(scene.page, ".zone-text-area");
        const stray = await offPalette(scene.page, area, palette);
        expect(stray, "pixels that are neither the zone, the interface nor a blend of them").toBe(0);
      } finally {
        await scene.close();
      }
    });
  }
});

/** How many pixels of the page region `box` are not, channel by channel, between two palette colours. */
async function offPalette(page: import("@playwright/test").Page, box: Box, palette: [number, number, number][]): Promise<number> {
  const png = await page.screenshot({ clip: box, animations: "disabled" });
  return page.evaluate(
    async ({ base64, colours }) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      // Text is anti-aliased per colour channel (sub-pixel), so a pixel is on palette when, in every channel, it lies between the
      // two colours of some pair (the zone colour and a text colour, or two interface colours), give or take 6.
      const between = (px: number[], a: number[], b: number[]): boolean =>
        [0, 1, 2].every((i) => (px[i] ?? 0) >= Math.min(a[i] ?? 0, b[i] ?? 0) - 6 && (px[i] ?? 0) <= Math.max(a[i] ?? 0, b[i] ?? 0) + 6);
      const seen = new Map<number, boolean>();
      let stray = 0;
      for (let i = 0; i < data.length; i += 4) {
        const key = ((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0);
        let ok = seen.get(key);
        if (ok === undefined) {
          const px = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
          ok = colours.some((a, ai) => colours.some((b, bi) => bi >= ai && between(px, a, b)));
          seen.set(key, ok);
        }
        if (!ok) stray++;
      }
      return stray;
    },
    { base64: png.toString("base64"), colours: palette },
  );
}

const near = (a: [number, number, number], b: [number, number, number], tolerance: number): boolean =>
  a.every((v, i) => Math.abs(v - (b[i] ?? 0)) <= tolerance);

test.describe("the ember reads as a warm glow on the stub's rim (review, task 23)", () => {
  for (const [title, size] of [["desktop", "desktop"], ["phone", "phone"]] as const) {
    test(`burned-out inside the break at ${title}`, async ({ browser }) => {
      const scene = await openScene(browser, FIXTURES.burnedOut, { viewport: VIEWPORTS[size] });
      try {
        const ember = await boxOf(scene.page, ".ember");
        const stub = await boxOf(scene.page, ".stub");
        // Big enough to see: close to half the stub's width (30 units against 64).
        expect(ember.width / stub.width).toBeGreaterThan(0.44);
        // Beside the wick (the smoke wisp is drawn over its centre) the stub's rim is warm orange, not ivory wax.
        const [r, g, b] = await colourAt(scene.page, ember.x + ember.width / 2 - ember.width * 0.2, ember.y + ember.height / 2 + 2);
        expect(r).toBeGreaterThan(235);
        expect(g).toBeGreaterThan(100);
        expect(g).toBeLessThan(175);
        expect(b).toBeLessThan(110);
        // And it sits on the stub: its centre is within the stub's box, near the rim.
        expect(ember.y + ember.height / 2).toBeGreaterThanOrEqual(stub.y - 2);
        expect(ember.y + ember.height / 2).toBeLessThanOrEqual(stub.y + stub.height / 2);
      } finally {
        await scene.close();
      }
    });
  }

  test("after the break the same spot is plain ivory wax, not a glow", async ({ browser }) => {
    const scene = await openScene(browser, FIXTURES.burnedOutAfterBreak);
    try {
      const ember = await boxOf(scene.page, ".ember");
      const [, , b] = await colourAt(scene.page, ember.x + ember.width / 2 - ember.width * 0.2, ember.y + ember.height / 2 + 2);
      expect(b).toBeGreaterThan(180);
    } finally {
      await scene.close();
    }
  });

  test("the glow is still there with reduced motion", async ({ browser }) => {
    const scene = await openScene(browser, FIXTURES.burnedOut, { reducedMotion: true });
    try {
      const ember = await boxOf(scene.page, ".ember");
      const [r, , b] = await colourAt(scene.page, ember.x + ember.width / 2 - ember.width * 0.2, ember.y + ember.height / 2 + 2);
      expect(r).toBeGreaterThan(235);
      expect(b).toBeLessThan(110);
    } finally {
      await scene.close();
    }
  });
});

test.describe("the window lights up at dawn, above the wash (review, task 23)", () => {
  test("at dawn the pane is clearly lighter than the wash beside it", async ({ browser }) => {
    const dawn = await openScene(browser, FIXTURES.burnedOut);
    try {
      const pane = await boxOf(dawn.page, ".window-dawn");
      const cx = pane.x + pane.width / 2;
      const cy = pane.y + pane.height / 2;
      const inside = await colourAt(dawn.page, cx, cy);
      const beside = await colourAt(dawn.page, pane.x - 60, cy);
      const sum = (c: [number, number, number]): number => c[0] + c[1] + c[2];
      expect(sum(inside) - sum(beside)).toBeGreaterThan(30);
      // The pane's colour is the dawn pane colour, undimmed by the wash.
      expect(near(inside, await paletteColour(dawn.page, "--window-dawn"), 6)).toBe(true);
    } finally {
      await dawn.close();
    }
  });
});

test.describe("the halo is the flame's colour (review, task 23)", () => {
  const cases = [
    { fixture: FIXTURES.paused, colour: "--flame-blue-outer" },
    { fixture: FIXTURES.litStart, colour: "--halo" },
    { fixture: FIXTURES.litLastMinute, colour: "--halo" },
  ];
  for (const { fixture, colour } of cases) {
    test(`${fixture.name}: the halo stops use ${colour}`, async ({ browser }) => {
      const scene = await openScene(browser, fixture);
      try {
        const want = await paletteColour(scene.page, colour);
        expect(near(await stopColour(scene.page, ".st-halo-in"), want, 2)).toBe(true);
        expect(near(await stopColour(scene.page, ".st-halo-out"), want, 2)).toBe(true);
      } finally {
        await scene.close();
      }
    });
  }
});