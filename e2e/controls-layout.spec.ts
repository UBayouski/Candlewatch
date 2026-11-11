// Layout in a real browser (controls-and-access design 13.3, E3 and the status-line fit): the page's rectangles equal
// `placeControls`, nothing touches the flame, halo, candle or window, and everything fits at every size.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  FIXTURES,
  checkLayoutNow,
  desktop,
  huge,
  intersects,
  openApp,
  phone,
  press,
  rectOf,
  settle,
  tablet,
  wide,
} from "./controls-fixtures";
import type { Rect } from "./controls-fixtures";
import { expectedPlacement } from "./controls-fixtures";

test.describe.configure({ mode: "parallel" });

const VIEWPORT_CASES = [
  ["phone", phone],
  ["desktop", desktop],
  ["tablet", tablet],
  ["wide", wide],
] as const;

const PHASES = [
  FIXTURES.idle,
  FIXTURES.litStart,
  FIXTURES.litHalf,
  FIXTURES.litLastMinute,
  FIXTURES.paused,
  FIXTURES.burnedOut,
  FIXTURES.snuffed,
] as const;

const RUNNING = new Set(["lit-start", "lit-half", "lit-last-minute", "paused"]);

/** The scene's lit things and the window pane, as the page draws them. The halo stops at the floor line (the zone is below it). */
async function litRects(page: Page, floorY: number): Promise<Record<string, Rect | null>> {
  const read = async (selector: string): Promise<Rect | null> => rectOf(page, selector);
  const halo = await read(".halo");
  return {
    ".candle": await read(".candle"),
    ".flame-shape": await read(".flame-shape"),
    ".halo": halo ? { ...halo, h: Math.max(0, Math.min(halo.y + halo.h, floorY) - halo.y) } : null,
    ".window": await read(".window"),
  };
}

for (const [viewportName, viewport] of VIEWPORT_CASES) {
  for (const fixture of PHASES) {
    const running = RUNNING.has(fixture.name);
    const states: ("closed" | "dialog" | "settings")[] = running ? ["closed", "dialog", "settings"] : ["closed", "settings"];
    for (const overlay of states) {
      test(`E3: ${fixture.name} at ${viewportName} (${viewport.width} x ${viewport.height}), ${overlay}`, async ({ browser }) => {
        const app = await openApp(browser, { fixture, viewport });
        try {
          const { page } = app;
          if (overlay === "dialog") await press(page, "Escape");
          if (overlay === "settings") {
            await page.locator("#settings-button").click();
            await settle(page);
          }
          const reading = await checkLayoutNow(page, viewport.width, viewport.height);
          expect(reading.running).toBe(running);

          // No scrollbar.
          const scroll = await page.evaluate(() => ({ w: document.documentElement.scrollWidth - innerWidth, h: document.documentElement.scrollHeight - innerHeight }));
          expect(scroll.w).toBeLessThanOrEqual(0);
          expect(scroll.h).toBeLessThanOrEqual(0);

          // No control or text touches the flame, the halo (above the floor line), the candle or the window pane.
          const p = expectedPlacement(viewport.width, viewport.height);
          const lit = await litRects(page, p.floorY);
          for (const [selector, rect] of Object.entries(reading.seen)) {
            for (const [name, thing] of Object.entries(lit)) {
              if (thing === null || thing.h <= 0) continue;
              expect(intersects(rect, thing, 0.5), `${selector} meets ${name}`).toBe(false);
            }
          }

          // The compact snuff dialog leaves the flame and halo uncovered (the settings panel may cover the upper candle).
          if (overlay === "dialog" && p.mode === "compact") {
            const dialog = await rectOf(page, "#snuff-dialog");
            expect(dialog).not.toBeNull();
            if (dialog) {
              for (const name of [".flame-shape", ".halo"]) {
                const thing = lit[name];
                if (thing && thing.h > 0 && fixture.name !== "paused") expect(intersects(dialog, thing, 0.5), `the dialog meets ${name}`).toBe(false);
              }
            }
          }
          expect(app.errors).toEqual([]);
        } finally {
          await app.close();
        }
      });
    }
  }
}

test.describe("the tables of design 6.5", () => {
  const near = (actual: Rect | null, expected: [number, number, number, number]): void => {
    expect(actual).not.toBeNull();
    if (!actual) return;
    [actual.x, actual.y, actual.w, actual.h].forEach((value, i) => expect(Math.abs(value - (expected[i] ?? 0))).toBeLessThanOrEqual(1));
  };

  test("360 x 640 at rest", async ({ browser }) => {
    const app = await openApp(browser, { fixture: FIXTURES.idle, viewport: phone });
    try {
      const { page } = app;
      near(await rectOf(page, "#length"), [8, 4, 344, 44]);
      near(await rectOf(page, "#intent-box"), [8, 56, 128, 44]);
      near(await rectOf(page, "#light"), [236, 56, 116, 52]);
      near(await rectOf(page, "#time"), [124, 560, 112, 36]);
      near(await rectOf(page, "#status"), [60, 596, 240, 36]);
      near(await rectOf(page, "#settings-button"), [308, 578, 44, 44]);
    } finally {
      await app.close();
    }
  });

  test("360 x 640 while a session runs", async ({ browser }) => {
    const app = await openApp(browser, { fixture: FIXTURES.litStart, viewport: phone });
    try {
      const { page } = app;
      near(await rectOf(page, "#pause"), [8, 578, 44, 44]);
      near(await rectOf(page, "#snuff"), [256, 578, 44, 44]);
      near(await rectOf(page, "#settings-button"), [308, 578, 44, 44]);
      near(await rectOf(page, "#status"), [112, 596, 136, 20]);
      near(await rectOf(page, "#time"), [124, 560, 112, 36]);
      expect(await rectOf(page, "#light")).toBeNull();
      await press(page, "Escape");
      near(await rectOf(page, "#snuff-dialog"), [8, 8, 344, 138]); // the heading is 26 px high in the display serif
    } finally {
      await app.close();
    }
  });

  test("1280 x 800 at rest and while a session runs", async ({ browser }) => {
    let app = await openApp(browser, { fixture: FIXTURES.idle, viewport: desktop });
    try {
      const { page } = app;
      near(await rectOf(page, "#length"), [904, 96, 352, 44]);
      near(await rectOf(page, "#intent-box"), [904, 180, 352, 44]);
      near(await rectOf(page, "#light"), [904, 240, 352, 52]);
      near(await rectOf(page, "#time"), [572, 720, 136, 44]);
      near(await rectOf(page, "#status"), [312, 764, 656, 20]);
      near(await rectOf(page, "#settings-button"), [976, 738, 96, 44]);
    } finally {
      await app.close();
    }
    app = await openApp(browser, { fixture: FIXTURES.litStart, viewport: desktop });
    try {
      const { page } = app;
      near(await rectOf(page, "#pause"), [344, 738, 128, 44]);
      near(await rectOf(page, "#snuff"), [808, 738, 160, 44]);
      near(await rectOf(page, "#settings-button"), [976, 738, 96, 44]);
      near(await rectOf(page, "#status"), [488, 764, 304, 20]);
    } finally {
      await app.close();
    }
  });
});

test.describe("the status lines fit their boxes", () => {
  /** True when the element's text is not cut: it fits its box in both directions. */
  const fits = (page: Page): Promise<{ text: string; cutX: boolean; cutY: boolean; width: number }> =>
    page.evaluate(() => {
      const el = document.querySelector("#status") as HTMLElement;
      return { text: el.textContent ?? "", cutX: el.scrollWidth > el.clientWidth, cutY: el.scrollHeight > el.clientHeight, width: el.getBoundingClientRect().width };
    });

  test("at 360 x 640 the lines shown with Pause and Let it go dark fit 136 px without being cut", async ({ browser }) => {
    for (const fixture of [FIXTURES.litStart, FIXTURES.litLastMinute, FIXTURES.paused]) {
      const app = await openApp(browser, { fixture, viewport: phone });
      try {
        const seen = await fits(app.page);
        expect(Math.round(seen.width), fixture.name).toBe(136);
        expect(seen.cutX, `${fixture.name}: "${seen.text}" is cut`).toBe(false);
        expect(seen.cutY, fixture.name).toBe(false);
      } finally {
        await app.close();
      }
    }
  });

  test("at 360 x 640 the lines shown at rest fit their 240 px box", async ({ browser }) => {
    for (const fixture of [FIXTURES.idle, FIXTURES.burnedOut, FIXTURES.burnedOutAfterBreak, FIXTURES.snuffed]) {
      const app = await openApp(browser, { fixture, viewport: phone });
      try {
        const seen = await fits(app.page);
        expect(seen.cutX, `${fixture.name}: "${seen.text}"`).toBe(false);
        expect(seen.cutY, `${fixture.name}: "${seen.text}" needs more than two lines`).toBe(false);
      } finally {
        await app.close();
      }
    }
  });

  test("a long intent is cut with an ellipsis and its full text stays in the page", async ({ browser }) => {
    const { INITIAL_STATE, step } = await import("../src/engine");
    const intent = "Write the long, long report about the lighthouse keeper and his last candle";
    const state = step(INITIAL_STATE, { type: "light", length: 25, intent }, FIXTURES.litStart.now - 40);
    const app = await openApp(browser, { fixture: { name: "lit-intent", state, now: FIXTURES.litStart.now }, viewport: phone });
    try {
      const seen = await fits(app.page);
      expect(seen.text).toBe(intent.slice(0, 80));
      expect(seen.cutX).toBe(true);
      expect(await app.page.locator("#status").evaluate((el) => getComputedStyle(el).textOverflow)).toBe("ellipsis");
    } finally {
      await app.close();
    }
  });
});

test.describe("a very wide viewport", () => {
  for (const fixture of [FIXTURES.idle, FIXTURES.litHalf, FIXTURES.paused, FIXTURES.snuffed]) {
    test(`3840 x 1860: every control is inside the viewport and visible (${fixture.name})`, async ({ browser }) => {
      const app = await openApp(browser, { fixture, viewport: huge });
      try {
        const { page } = app;
        const reading = await checkLayoutNow(page, huge.width, huge.height);
        for (const [selector, rect] of Object.entries(reading.seen)) {
          expect(rect.x, selector).toBeGreaterThanOrEqual(0);
          expect(rect.y, selector).toBeGreaterThanOrEqual(0);
          expect(rect.x + rect.w, selector).toBeLessThanOrEqual(huge.width);
          expect(rect.y + rect.h, selector).toBeLessThanOrEqual(huge.height);
          await expect(page.locator(selector), selector).toBeVisible();
        }
        const controls = reading.running ? ["#pause", "#snuff", "#settings-button"] : ["#length", "#intent-box", "#light", "#settings-button"];
        for (const selector of controls) expect(reading.seen[selector], selector).toBeDefined();
        // Nothing is clipped or hidden by the scrolling box: no scrollbar either.
        const scroll = await page.evaluate(() => ({ w: document.documentElement.scrollWidth - innerWidth, h: document.documentElement.scrollHeight - innerHeight }));
        expect(scroll).toEqual({ w: 0, h: 0 });
        // The settings panel and the dialog fit as well.
        await page.locator("#settings-button").click();
        await settle(page);
        const panel = await rectOf(page, "#settings-dialog");
        expect(panel).not.toBeNull();
        if (panel) {
          expect(panel.x).toBeGreaterThanOrEqual(0);
          expect(panel.x + panel.w).toBeLessThanOrEqual(huge.width);
          expect(panel.y + panel.h).toBeLessThanOrEqual(huge.height);
        }
        expect(app.errors).toEqual([]);
      } finally {
        await app.close();
      }
    });
  }
});

test.describe("the intent hint and the settings panel fit (screenshot review, batch 4)", () => {
  test("the placeholder of the intent field is shown, in the subtle colour, and fits the field without being cut", async ({ browser }) => {
    for (const [name, viewport] of [["phone", phone], ["375", { width: 375, height: 667 }], ["left-region", { width: 480, height: 800 }], ["tablet", tablet], ["desktop", desktop], ["wide", wide]] as const) {
      const app = await openApp(browser, { fixture: FIXTURES.idle, viewport });
      try {
        const reading = await app.page.evaluate(() => {
          const input = document.querySelector("#intent") as HTMLInputElement;
          const style = getComputedStyle(input, "::placeholder");
          const own = getComputedStyle(input);
          const ctx = document.createElement("canvas").getContext("2d");
          if (!ctx) throw new Error("no 2d context");
          ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          // The room for text: the border box less both borders and both paddings.
          const available = input.getBoundingClientRect().width - parseFloat(own.borderLeftWidth) - parseFloat(own.borderRightWidth) - parseFloat(own.paddingLeft) - parseFloat(own.paddingRight);
          return { placeholder: input.placeholder, name: input.getAttribute("aria-label"), colour: style.color, size: style.fontSize, textWidth: ctx.measureText(input.placeholder).width, available, value: input.value };
        });
        expect(reading.value).toBe("");
        expect(reading.placeholder.length, name).toBeGreaterThan(0);
        expect(reading.name, "the accessible name stays as it is").toBe("What is this candle for? (optional)");
        expect(reading.colour, name).toBe("rgb(207, 194, 162)"); // --ui-text-subtle, 10.4:1 on the field fill
        expect(reading.textWidth, `${name}: "${reading.placeholder}" needs ${Math.round(reading.textWidth)} px of ${Math.round(reading.available)}`).toBeLessThanOrEqual(reading.available);
      } finally {
        await app.close();
      }
    }
  });

  test("the settings panel's content does not overflow, so Close is fully visible without scrolling", async ({ browser }) => {
    for (const [name, viewport] of [["phone", phone], ["375", { width: 375, height: 667 }], ["left-region", { width: 480, height: 800 }], ["desktop", desktop], ["tablet", tablet]] as const) {
      for (const fixture of [FIXTURES.idle, FIXTURES.litHalf]) {
        const app = await openApp(browser, { fixture, viewport });
        try {
          const { page } = app;
          await page.locator("#settings-button").click();
          await settle(page);
          const box = await page.evaluate(() => {
            const dialog = document.querySelector("#settings-dialog") as HTMLElement;
            const close = document.querySelector("#close") as HTMLElement;
            const d = dialog.getBoundingClientRect();
            const c = close.getBoundingClientRect();
            const border = parseFloat(getComputedStyle(dialog).borderBottomWidth);
            const zone = (document.querySelector(".zone-text-area") as Element).getBoundingClientRect();
            return { scroll: dialog.scrollHeight, client: dialog.clientHeight, closeBottom: c.bottom, dialogBottom: d.bottom - border, dialogTop: d.top, zoneTop: zone.top };
          });
          expect(box.scroll, `${name} ${fixture.name}`).toBeLessThanOrEqual(box.client);
          expect(box.closeBottom, `${name}: Close is inside the panel`).toBeLessThanOrEqual(box.dialogBottom + 0.5);
          expect(box.dialogBottom, `${name}: the panel stays clear of the zone`).toBeLessThanOrEqual(box.zoneTop);
          await expect(page.locator("#close")).toBeInViewport({ ratio: 1 });
        } finally {
          await app.close();
        }
      }
    }
  });
});