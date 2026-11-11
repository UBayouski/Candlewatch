// The costume review's findings on the interface (controls-and-access design 17.1): fonts, warm palette, gear icon, touch line,
// the primary button, the length message under the chooser, the custom-field cue, the floor strip and the phone settings panel.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { colourAt, paletteColour } from "./scene-fixtures";
import { FIXTURES, desktop, expectedPlacement, fontsLoaded, intersects, judgeFigures, openApp, phone, platformFonts, press, readFigures, rectOf, settle, tablet, wide } from "./controls-fixtures";
import type { Rect } from "./controls-fixtures";

const rgb = (text: string): number[] => (text.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);

/** Rendered widths of texts set in the font of `#time` (family, weight, numeric variant), by a hidden probe. The font must be loaded. */
async function widthsInTimeFont(page: Page, texts: readonly string[], selector = "#time"): Promise<number[]> {
  return page.locator(selector).evaluate((time, list) => {
    const style = getComputedStyle(time);
    return list.map((text) => {
      const probe = document.createElement("span");
      probe.textContent = text;
      probe.style.setProperty("position", "absolute");
      probe.style.setProperty("visibility", "hidden");
      probe.style.setProperty("white-space", "nowrap");
      probe.style.setProperty("font-family", style.fontFamily);
      probe.style.setProperty("font-size", style.fontSize);
      probe.style.setProperty("font-weight", style.fontWeight);
      probe.style.setProperty("font-variant-numeric", style.fontVariantNumeric);
      probe.style.setProperty("font-feature-settings", style.fontFeatureSettings);
      time.parentElement?.append(probe);
      const w = probe.getBoundingClientRect().width;
      probe.remove();
      return w;
    });
  }, [...texts]);
}

/**
 * Puts a large copy of the figures 0 to 9 on the page in the font of `#time` (the computed family, weight and the numeric variant
 * given, or `#time`'s own when `variant` is null), white on black, and returns its selector. Large, so the ink rows are measured
 * to a small fraction of an em; letter-spaced, so neighbouring digits never share a pixel column.
 */
async function putFigureProbe(page: Page, variant: string | null, selector = "#time"): Promise<string> {
  await page.locator(selector).evaluate((time, v) => {
    document.getElementById("figure-probe")?.remove();
    const style = getComputedStyle(time);
    const probe = document.createElement("div");
    probe.id = "figure-probe";
    probe.textContent = "0123456789";
    const set = (name: string, value: string): void => probe.style.setProperty(name, value);
    set("position", "fixed");
    set("left", "0");
    set("top", "0");
    set("z-index", "2147483647");
    set("padding", "20px");
    set("background", "#000");
    set("color", "#fff");
    set("white-space", "nowrap");
    set("font-family", style.fontFamily);
    set("font-weight", style.fontWeight);
    set("font-size", "100px");
    set("line-height", "1.6");
    set("letter-spacing", "0.3em");
    set("font-variant-numeric", v ?? style.fontVariantNumeric);
    set("font-feature-settings", style.fontFeatureSettings);
    document.body.append(probe);
  }, variant);
  return "#figure-probe";
}

test.describe("fonts", () => {
  test("three self-hosted woff2 faces are loaded from /assets/ under the strict policy, with no error", async ({ browser }) => {
    const app = await openApp(browser, { fixture: FIXTURES.idle });
    try {
      const { page } = app;
      const urls: string[] = [];
      page.on("response", (r) => {
        if (/\.woff2$/.test(r.url())) urls.push(r.url());
      });
      await page.reload();
      await settle(page);
      await fontsLoaded(page);
      const faces = await page.evaluate(() => [...document.fonts].map((f) => ({ family: f.family.replace(/"/g, ""), weight: f.weight, status: f.status })));
      expect(faces.filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight}`).sort()).toEqual(["Alegreya Sans 400", "Alegreya Sans 700", "Cormorant Garamond 700"]);
      expect(urls.length).toBeGreaterThanOrEqual(3);
      for (const url of urls) expect(url).toMatch(/\/assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]+\.woff2$/);
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test("the time text and the dialog headings are the display serif; buttons, status and settings are the text face", async ({ browser }) => {
    const app = await openApp(browser, { fixture: FIXTURES.litStart });
    try {
      const { page } = app;
      await press(page, "Escape");
      const family = (selector: string): Promise<string> => page.locator(selector).evaluate((el) => getComputedStyle(el).fontFamily);
      expect(await family("#time")).toBe('"Cormorant Garamond", serif');
      expect(await family("#snuff-dialog h2")).toBe('"Cormorant Garamond", serif');
      for (const selector of ["#status", "#pause", "#keep", "#settings-button"]) expect(await family(selector), selector).toBe('"Alegreya Sans", sans-serif');
      expect(await page.locator("#time").evaluate((el) => getComputedStyle(el).fontVariantNumeric)).toBe("lining-nums tabular-nums");
    } finally {
      await app.close();
    }
  });

  test("with the web font loaded, every figure of the time text is as wide as every other, and 11:11 is as wide as 00:00", async ({ browser }) => {
    const app = await openApp(browser, { fixture: FIXTURES.litStart });
    try {
      const { page } = app;
      await fontsLoaded(page);
      // The text is painted with the web font, not the fallback serif (the computed family is the same list in both cases).
      const painted = await platformFonts(page, "#time");
      expect(painted.length).toBeGreaterThan(0);
      for (const font of painted) expect(font).toMatchObject({ family: expect.stringMatching(/^Cormorant Garamond/), custom: true });
      const size = parseFloat(await page.locator("#time").evaluate((el) => getComputedStyle(el).fontSize));
      const digits = await widthsInTimeFont(page, ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
      digits.forEach((w, d) => expect(Math.abs(w - (digits[0] ?? 0)), `digit ${d}: ${w} px against ${digits[0]} px`).toBeLessThanOrEqual(0.5));
      // The tabular lining advance of the font is 491 units of 1000: the digits are that wide, which only the web font gives.
      for (const w of digits) expect(Math.abs(w - 0.491 * size)).toBeLessThanOrEqual(0.5);
      const [zeros, ones, eights] = await widthsInTimeFont(page, ["00:00", "11:11", "88:88"]) as [number, number, number];
      expect(Math.abs(ones - zeros), `11:11 is ${ones} px, 00:00 is ${zeros} px`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(eights - zeros)).toBeLessThanOrEqual(0.5);
    } finally {
      await app.close();
    }
  });

  test("the figures are lining, not old-style: measured from the ink rows of a large copy set in the same font", async ({ browser }) => {
    // How it is measured: the ten figures are set 100 px high in the computed font of #time (family, weight, numeric variant), white
    // on black, and photographed; the first and last row of ink of each figure is read from the pixels. Lining figures end on one
    // row (the spread of the ends is about 0.02 em) and none is shorter than 0.63 em. Old-style figures are 0.39 to 0.41 em tall
    // for 0, 1 and 2 and 3, 4, 5, 7 and 9 reach 0.28 em below the baseline. The limits sit between: spread <= 0.06 em, height >= 0.55 em.
    const app = await openApp(browser, { fixture: FIXTURES.litStart, viewport: desktop });
    try {
      const { page } = app;
      await fontsLoaded(page);
      expect(await page.locator("#time").evaluate((el) => getComputedStyle(el).fontVariantNumeric)).toBe("lining-nums tabular-nums");

      const own = judgeFigures(await readFigures(page, await putFigureProbe(page, null)));
      expect(own.lining, `the shipped variant: ${JSON.stringify(own)}`).toBe(true);
      expect(own.count).toBe(10);
      expect(own.bottomSpreadEm).toBeLessThan(0.06);
      expect(own.shortestEm).toBeGreaterThan(0.55);

      // The check can fail: what the stylesheet had before (tabular figures only) gives the font's old-style tabular figures, and
      // the font's default (no variant) gives its old-style proportional ones. Both are caught.
      const tabularOnly = judgeFigures(await readFigures(page, await putFigureProbe(page, "tabular-nums")));
      expect(tabularOnly.lining, `tabular-nums alone: ${JSON.stringify(tabularOnly)}`).toBe(false);
      expect(tabularOnly.bottomSpreadEm).toBeGreaterThan(0.2);
      expect(tabularOnly.shortestEm).toBeLessThan(0.45);
      const normal = judgeFigures(await readFigures(page, await putFigureProbe(page, "normal")));
      expect(normal.lining, `no variant: ${JSON.stringify(normal)}`).toBe(false);

      // lining-nums does the work (the font keeps its lnum feature); tabular-nums only fixes the width.
      const liningOnly = judgeFigures(await readFigures(page, await putFigureProbe(page, "lining-nums")));
      expect(liningOnly.lining).toBe(true);

      // And the figures of the real time text, from its own pixels.
      await page.evaluate(() => document.getElementById("figure-probe")?.remove());
      const real = judgeFigures(await readFigures(page, "#time"));
      expect(real.count).toBe(4);
      expect(real.lining, `#time itself: ${JSON.stringify(real)}`).toBe(true);
    } finally {
      await app.close();
    }
  });});

test.describe("the status line figures (costume review, third pass, finding 2)", () => {
  // "Pause left 09:00" changes every second and stands directly under the time text, so its figures are lining and of one width.
  test("with the text face loaded, every figure of the status line is as wide as every other, and the numeric variant is lining tabular", async ({ browser }) => {
    const app = await openApp(browser, { fixture: FIXTURES.paused });
    try {
      const { page } = app;
      await fontsLoaded(page);
      expect(await page.locator("#status").textContent()).toMatch(/\d\d:\d\d/);
      expect(await page.locator("#status").evaluate((el) => getComputedStyle(el).fontVariantNumeric)).toBe("lining-nums tabular-nums");
      const painted = await platformFonts(page, "#status");
      expect(painted.length).toBeGreaterThan(0);
      for (const font of painted) expect(font).toMatchObject({ family: expect.stringMatching(/^Alegreya Sans/), custom: true });
      const digits = await widthsInTimeFont(page, ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"], "#status");
      digits.forEach((w, d) => expect(Math.abs(w - (digits[0] ?? 0)), `digit ${d}: ${w} px against ${digits[0]} px`).toBeLessThanOrEqual(0.5));
      const [zeros, ones, eights] = (await widthsInTimeFont(page, ["00:00", "11:11", "88:88"], "#status")) as [number, number, number];
      expect(Math.abs(ones - zeros), `11:11 is ${ones} px, 00:00 is ${zeros} px`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(eights - zeros)).toBeLessThanOrEqual(0.5);
    } finally {
      await app.close();
    }
  });

  test("the figures are lining by the measure used for #time: a large copy in the status font, and the real status line", async ({ browser }) => {
    const app = await openApp(browser, { fixture: FIXTURES.paused, viewport: desktop });
    try {
      const { page } = app;
      await fontsLoaded(page);
      const own = judgeFigures(await readFigures(page, await putFigureProbe(page, null, "#status")));
      expect(own.count).toBe(10);
      expect(own.lining, `the shipped variant: ${JSON.stringify(own)}`).toBe(true);
      expect(own.bottomSpreadEm).toBeLessThan(0.06);
      expect(own.shortestEm).toBeGreaterThan(0.55);
      // The check can fail: without the variant the text face's figures are not lining.
      const normal = judgeFigures(await readFigures(page, await putFigureProbe(page, "normal", "#status")));
      expect(normal.lining, `no variant: ${JSON.stringify(normal)}`).toBe(false);
      // And the figures of the real status line, from its own pixels.
      await page.evaluate(() => document.getElementById("figure-probe")?.remove());
      const real = judgeFigures(await readFigures(page, "#status"));
      expect(real.count).toBe(4);
      expect(real.lining, `#status itself: ${JSON.stringify(real)}`).toBe(true);
    } finally {
      await app.close();
    }
  });

  test("numbers in buttons and counters keep the font's default figures", async ({ browser }) => {
    const app = await openApp(browser, { fixture: FIXTURES.idle });
    try {
      const { page } = app;
      for (const selector of ["#light", "#length .cell", "#settings-button"]) {
        expect(await page.locator(selector).first().evaluate((el) => getComputedStyle(el).fontVariantNumeric), selector).toBe("normal");
      }
    } finally {
      await app.close();
    }
  });
});

test("the palette is warm: the border is amber wax, the fill a warm black, and the control reads against the brightest room", async ({ browser }) => {
  const app = await openApp(browser, { fixture: FIXTURES.idle });
  try {
    const style = await app.page.locator("#light").evaluate((el) => {
      const s = getComputedStyle(el);
      return { border: s.borderTopColor, bg: s.backgroundColor };
    });
    expect(rgb(style.border)).toEqual([230, 194, 122]);
    expect(rgb(style.bg)).toEqual([58, 42, 28]); // Light is a primary button: the selected fill
    const cell = await app.page.locator("#length .cell").first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(rgb(cell)).toEqual([26, 19, 13]);
  } finally {
    await app.close();
  }
});

test("the settings button is a gear: one closed toothed outline and a hub, no rays", async ({ browser }) => {
  const app = await openApp(browser, { fixture: FIXTURES.idle });
  try {
    const icon = await app.page.locator("#settings-button svg").evaluate((svg) => ({
      paths: [...svg.querySelectorAll("path")].map((p) => p.getAttribute("d") ?? ""),
      circles: svg.querySelectorAll("circle").length,
      lines: svg.querySelectorAll("line").length,
    }));
    expect(icon.paths).toHaveLength(1);
    expect(icon.paths[0]).toMatch(/Z$/);
    expect(icon.paths[0]?.match(/L/g)?.length ?? 0).toBeGreaterThanOrEqual(30); // eight teeth
    expect(icon.paths[0]).not.toMatch(/[VH]/); // the sun's rays were drawn with V and H strokes
    expect(icon.circles).toBe(1);
    expect(icon.lines).toBe(0);
  } finally {
    await app.close();
  }
});

test.describe("the first-visit line", () => {
  test("a touch-only device is told to tap, not to press keys", async ({ browser }) => {
    const app = await openApp(browser, { viewport: phone, mobile: true });
    try {
      const fine = await app.page.evaluate(() => matchMedia("(any-pointer: fine)").matches);
      expect(fine).toBe(false);
      await expect(app.page.locator("#status")).toHaveText("Tap Light to begin. Tap pause to rest.");
    } finally {
      await app.close();
    }
  });

  test("the touch line, which wraps to two lines, ends at least 8 px above the bottom edge at 360 x 640", async ({ browser }) => {
    const app = await openApp(browser, { viewport: phone, mobile: true });
    try {
      const { page } = app;
      await fontsLoaded(page);
      expect(await page.evaluate(() => matchMedia("(any-pointer: fine)").matches)).toBe(false);
      await expect(page.locator("#status")).toHaveText("Tap Light to begin. Tap pause to rest.");
      // The glyph rows of the text, not the box: a Range gives one rectangle per line box of the text.
      const reading = await page.locator("#status").evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const lines = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
        return { bottoms: lines.map((r) => r.bottom), tops: lines.map((r) => r.top), cut: el.scrollHeight > el.clientHeight, innerHeight: window.innerHeight };
      });
      expect(reading.innerHeight).toBe(640);
      expect(reading.bottoms.length).toBeGreaterThan(0);
      expect(new Set(reading.tops.map((y) => Math.round(y))).size, "at most two lines").toBeLessThanOrEqual(2);
      const lastLineBottom = Math.max(...reading.bottoms);
      expect(lastLineBottom, `the last line ends at ${lastLineBottom} px of 640`).toBeLessThanOrEqual(640 - 8);
      expect(reading.cut, "no line is cut off by the box").toBe(false);
    } finally {
      await app.close();
    }
  });

  test("a device with a mouse is told the keys", async ({ browser }) => {
    const app = await openApp(browser, { viewport: phone });
    try {
      await expect(app.page.locator("#status")).toHaveText("Enter lights. Space pauses. Esc lets it go dark.");
    } finally {
      await app.close();
    }
  });

  test("the page covers the whole screen and the zone keeps clear of the safe areas, 8 px above the bottom edge at 360 x 640", async ({ browser }) => {
    const app = await openApp(browser, { fixture: FIXTURES.idle, viewport: phone });
    try {
      const { page } = app;
      expect(await page.locator('meta[name="viewport"]').getAttribute("content")).toContain("viewport-fit=cover");
      const status = await rectOf(page, "#status");
      const time = await rectOf(page, "#time");
      expect((status?.y ?? 0) + (status?.h ?? 0)).toBeLessThanOrEqual(640 - 8);
      expect((time?.y ?? 0) + (time?.h ?? 0)).toBeLessThanOrEqual(640 - 8);
      // The line is drawn: its two lines fit the box, so no glyph is nearer the bottom edge than the box.
      const cut = await page.locator("#status").evaluate((el) => el.scrollHeight > el.clientHeight);
      expect(cut).toBe(false);
    } finally {
      await app.close();
    }
  });
});

test("Keep burning is the primary button, with the initial focus; Snuff it is not", async ({ browser }) => {
  const app = await openApp(browser, { fixture: FIXTURES.litStart });
  try {
    const { page } = app;
    await press(page, "Escape");
    const read = (selector: string): Promise<{ bg: string; weight: string; border: string }> =>
      page.locator(selector).evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, weight: getComputedStyle(el).fontWeight, border: getComputedStyle(el).borderTopWidth }));
    const keep = await read("#keep");
    const confirm = await read("#confirm");
    expect(rgb(keep.bg)).toEqual([58, 42, 28]);
    expect(keep.weight).toBe("700");
    expect(keep.border).toBe("3px");
    expect(rgb(confirm.bg)).toEqual([26, 19, 13]);
    expect(confirm.weight).not.toBe("700");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("keep");
  } finally {
    await app.close();
  }
});

test.describe("the length message", () => {
  async function refuse(page: Page): Promise<void> {
    await page.locator("#length-custom").focus();
    await page.keyboard.type("4");
    await press(page, "Enter");
  }

  test("stands directly under the chooser in the side column of a wide layout, and the error border shows next to the ring", async ({ browser }) => {
    const app = await openApp(browser, { fixture: FIXTURES.idle, viewport: desktop });
    try {
      const { page } = app;
      expect(await rectOf(page, "#length-error")).toBeNull();
      await refuse(page);
      const chooser = await rectOf(page, "#length");
      const message = await rectOf(page, "#length-error");
      expect(message).not.toBeNull();
      expect(await page.locator("#length-error").textContent()).toBe("Choose 5 to 90 minutes.");
      if (chooser && message) {
        expect(message.y - (chooser.y + chooser.h)).toBeGreaterThanOrEqual(0);
        expect(message.y - (chooser.y + chooser.h)).toBeLessThanOrEqual(8);
        expect(message.x).toBeCloseTo(chooser.x, 0);
      }
      expect(await page.locator("#status").textContent()).toBe("Enter lights. Space pauses. Esc lets it go dark.");
      expect(await page.locator("#length-custom").getAttribute("aria-describedby")).toBe("length-error");
      const field = await page.locator("#length-custom").evaluate((el) => ({ style: getComputedStyle(el).borderTopStyle, colour: getComputedStyle(el).borderTopColor, offset: getComputedStyle(el).outlineOffset, focus: document.activeElement === el }));
      expect(field).toEqual({ style: "double", colour: "rgb(255, 180, 163)", offset: "6px", focus: true });
    } finally {
      await app.close();
    }
  });

  test("stays in the status line in the compact layout", async ({ browser }) => {
    const app = await openApp(browser, { fixture: FIXTURES.idle, viewport: phone });
    try {
      const { page } = app;
      await refuse(page);
      expect(await rectOf(page, "#length-error")).toBeNull();
      expect(await page.locator("#status").textContent()).toBe("Choose 5 to 90 minutes.");
      expect(await page.locator("#length-custom").getAttribute("aria-describedby")).toBe("status");
    } finally {
      await app.close();
    }
  });
});

test("the empty custom field says where to type, in a cue that fits every chooser cell", async ({ browser }) => {
  for (const [name, viewport] of [["phone", phone], ["left-region", { width: 480, height: 800 }], ["tablet", tablet], ["desktop", desktop]] as const) {
    const app = await openApp(browser, { fixture: FIXTURES.idle, viewport });
    try {
      await fontsLoaded(app.page);
      const reading = await app.page.evaluate(() => {
        const input = document.querySelector("#length-custom") as HTMLInputElement;
        const style = getComputedStyle(input, "::placeholder");
        const own = getComputedStyle(input);
        const ctx = document.createElement("canvas").getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const room = input.getBoundingClientRect().width - parseFloat(own.borderLeftWidth) - parseFloat(own.borderRightWidth) - parseFloat(own.paddingLeft) - parseFloat(own.paddingRight);
        return { placeholder: input.placeholder, width: ctx.measureText(input.placeholder).width, room, value: input.value };
      });
      expect(reading.placeholder).toBe("__ min");
      expect(reading.value).toBe("");
      expect(reading.width, `${name}: ${Math.round(reading.width)} px in ${Math.round(reading.room)} px`).toBeLessThanOrEqual(reading.room);
    } finally {
      await app.close();
    }
  }
});

test("the top edge of the zone band melts into the room instead of ending in a line", async ({ browser }) => {
  const app = await openApp(browser, { fixture: FIXTURES.burnedOut, viewport: desktop });
  try {
    const { page } = app;
    const zone = await paletteColour(page, "--zone-bg-brightest");
    const floorY = 720;
    const distance = async (y: number): Promise<number> => {
      const c = await colourAt(page, 100, y);
      return Math.max(...c.map((v, i) => Math.abs(v - (zone[i] ?? 0))));
    };
    const [near, middle, far] = [await distance(floorY - 2), await distance(floorY - 8), await distance(floorY - 30)];
    expect(near).toBeLessThan(middle);
    expect(middle).toBeLessThan(far);
    expect(near).toBeLessThan(8); // the band's own colour at the edge: no line
  } finally {
    await app.close();
  }
});

test("the phone settings panel covers the whole chooser row underneath, with no sliver above or beside it", async ({ browser }) => {
  for (const viewport of [phone, { width: 375, height: 667 }, { width: 480, height: 800 }, tablet]) {
    const app = await openApp(browser, { fixture: FIXTURES.idle, viewport });
    try {
      const { page } = app;
      await page.locator("#settings-button").click();
      await settle(page);
      const chooser = await rectOf(page, "#length");
      const panel = await rectOf(page, "#settings-dialog");
      expect(chooser && panel).toBeTruthy();
      if (!chooser || !panel) continue;
      expect(panel.y).toBeLessThanOrEqual(0.5);
      expect(panel.x).toBeLessThanOrEqual(chooser.x + 0.5);
      expect(panel.x + panel.w).toBeGreaterThanOrEqual(chooser.x + chooser.w - 0.5);
      expect(panel.y + panel.h).toBeGreaterThanOrEqual(chooser.y + chooser.h);
      // Everything drawn over the chooser's box belongs to the panel.
      const strangers = await page.evaluate(
        ({ x, y, w, h }) => {
          const out: string[] = [];
          for (let px = x; px <= x + w; px += 10) for (let py = 0; py <= y + h; py += 6) {
            const el = document.elementFromPoint(px, py);
            if (el && !el.closest("#settings-dialog")) out.push(`${Math.round(px)},${py}`);
          }
          return out;
        },
        { x: chooser.x + 1, y: chooser.y, w: chooser.w - 2, h: chooser.h },
      );
      expect(strangers, `${viewport.width} x ${viewport.height}`).toEqual([]);
    } finally {
      await app.close();
    }
  }
});

test.describe("the length message stands on a fill", () => {
  async function refuse(page: Page): Promise<void> {
    await page.locator("#length-custom").focus();
    await page.keyboard.type("4");
    await press(page, "Enter");
  }

  test("is the control fill with 4 px of padding, 28 px tall, and clears the intent field, the Door and every ghost cell", async ({ browser }) => {
    for (const viewport of [desktop, wide, { width: 1366, height: 768 }, { width: 2560, height: 1440 }]) {
      const app = await openApp(browser, { fixture: FIXTURES.idle, viewport });
      try {
        const { page } = app;
        await refuse(page);
        const style = await page.locator("#length-error").evaluate((el) => {
          const s = getComputedStyle(el);
          return { bg: s.backgroundColor, colour: s.color, padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft], radius: s.borderTopLeftRadius };
        });
        const label = `${viewport.width} x ${viewport.height}`;
        expect(rgb(style.bg), label).toEqual([26, 19, 13]); // --ui-bg, the control fill
        expect(rgb(style.colour), label).toEqual([255, 180, 163]); // --ui-error
        expect(style.padding, label).toEqual(["4px", "4px", "4px", "4px"]);
        const message = (await rectOf(page, "#length-error")) as Rect;
        const placement = expectedPlacement(viewport.width, viewport.height);
        expect(message.h, label).toBeCloseTo(28, 0);
        // The line fits the padded box: 20 px of line inside 4 + 4 of padding, no overflow.
        expect(await page.locator("#length-error").evaluate((el) => el.scrollHeight <= el.clientHeight), label).toBe(true);
        // What the page shows clears what must stay clear (P10 on the real page).
        for (const selector of ["#length", "#intent-box", "#light"]) {
          const other = (await rectOf(page, selector)) as Rect;
          expect(intersects(message, other), `${label}: the message and ${selector}`).toBe(false);
        }
        const toRect = (r: { x: number; y: number; w: number; h: number }): Rect => ({ x: r.x, y: r.y, w: r.w, h: r.h });
        expect(intersects(message, toRect(placement.keepClear.door)), `${label}: the Door`).toBe(false);
        placement.keepClear.ghostCells.forEach((cell, i) => expect(intersects(message, toRect(cell)), `${label}: ghost cell ${i}`).toBe(false));
        expect(intersects(message, toRect(placement.keepClear.column)), `${label}: the candle column`).toBe(false);
        expect(app.errors).toEqual([]);
      } finally {
        await app.close();
      }
    }
  });
});

test("hover changes the border only: a switch under the pointer is not read as switched on, and a selected one stays selected", async ({ browser }) => {
  const SELECTED = [58, 42, 28];
  const PLAIN = [26, 19, 13];
  const app = await openApp(browser, { fixture: FIXTURES.idle, viewport: desktop });
  try {
    const { page } = app;
    expect(await page.evaluate(() => matchMedia("(hover: hover)").matches)).toBe(true);
    await page.locator("#settings-button").click();
    await settle(page);
    const read = (selector: string): Promise<{ bg: string; border: string; width: string; checked: string | null }> =>
      page.locator(selector).evaluate((el) => {
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, border: s.borderTopColor, width: s.borderTopWidth, checked: el.getAttribute("aria-checked") };
      });
    // The switch fades its fill over 120 ms and a button its border over 80 ms (real time, the page clock does not move them):
    // wait until both have arrived before reading.
    const settled = async (selector: string, border: number[], fill: number[]): Promise<void> => {
      await expect.poll(async () => { const r = await read(selector); return [...rgb(r.border), ...rgb(r.bg)]; }, { message: `${selector} border and fill` }).toEqual([...border, ...fill]);
    };

    // Ghosts Off (the setting is on by default: switch it off).
    await page.locator("#ghosts").click();
    await settle(page);
    await page.mouse.move(1, 1);
    await settled("#ghosts", [230, 194, 122], PLAIN); // amber wax
    const off = await read("#ghosts");
    expect(off.checked).toBe("false");
    expect(rgb(off.bg)).toEqual(PLAIN);
    expect(off.width).toBe("2px");

    await page.locator("#ghosts").hover();
    await settled("#ghosts", [239, 230, 207], PLAIN); // ivory
    const hovered = await read("#ghosts");
    expect(rgb(hovered.bg), "hover does not use the selected fill").toEqual(PLAIN);
    expect(rgb(hovered.bg)).not.toEqual(SELECTED);
    expect(hovered.width).toBe("3px");
    expect(hovered.checked).toBe("false");

    // Ghosts On: selected. Hovering it changes the border colour and nothing else.
    await page.locator("#ghosts").click();
    await settle(page);
    await page.mouse.move(1, 1);
    await settled("#ghosts", [230, 194, 122], SELECTED);
    const on = await read("#ghosts");
    expect(on.checked).toBe("true");
    expect(rgb(on.bg)).toEqual(SELECTED);
    expect(on.width).toBe("4px");
    await page.locator("#ghosts").hover();
    await settled("#ghosts", [239, 230, 207], SELECTED);
    const onHovered = await read("#ghosts");
    expect(rgb(onHovered.bg)).toEqual(SELECTED);
    expect(onHovered.width).toBe("4px");

    // Every button of the panel: the selected fill is on exactly the selected ones, hovered or not. Close is the panel's primary
    // answer (bold, 3 px) but on the plain fill, so it does not read as switched on (costume review, third pass, finding 1).
    const buttons = page.locator("#settings-dialog button");
    expect(await buttons.count()).toBeGreaterThanOrEqual(5); // Sound, Ghosts, three presets, Close
    let selectedCount = 0;
    for (let i = 0; i < (await buttons.count()); i++) {
      const button = buttons.nth(i);
      await button.hover();
      const state = await button.evaluate((el) => ({
        name: el.id || el.textContent,
        bg: getComputedStyle(el).backgroundColor,
        selected: el.getAttribute("aria-checked") === "true" || el.classList.contains("custom-cell") && el.getAttribute("tabindex") === "0",
        primary: el.classList.contains("primary"),
        weight: getComputedStyle(el).fontWeight,
        width: getComputedStyle(el).borderTopWidth,
      }));
      expect(rgb(state.bg).join() === SELECTED.join(), `${state.name} under the pointer`).toBe(state.selected);
      if (state.selected) selectedCount++;
      if (state.primary) {
        expect(state.name).toBe("close");
        expect(state.weight, "Close keeps the bold text").toBe("700");
        expect(state.width, "Close keeps the 3 px border (hovered)").toBe("3px");
      }
    }
    expect(selectedCount, "Sound or Ghosts On, plus the selected length").toBeGreaterThanOrEqual(2);
    await page.mouse.move(1, 1);
    await expect(page.locator("#ui button:hover, #ui input:hover")).toHaveCount(0);
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test("in the settings panel the selected fill appears only on selected controls: Sound and Ghosts in every On/Off combination, Close never", async ({ browser }) => {
  const SELECTED = [58, 42, 28];
  const app = await openApp(browser, { fixture: FIXTURES.idle, viewport: desktop });
  try {
    const { page } = app;
    await page.locator("#settings-button").click();
    await settle(page);
    await page.mouse.move(1, 1);
    for (const [sound, ghosts] of [[true, true], [false, false], [true, false], [false, true]] as const) {
      for (const [id, wanted] of [["#sound", sound], ["#ghosts", ghosts]] as const) {
        if (((await page.locator(id).getAttribute("aria-checked")) === "true") !== wanted) await page.locator(id).click();
      }
      await settle(page);
      await page.mouse.move(1, 1);
      // The fill fades over 120 ms of real time: wait until it has arrived on every switch.
      await expect.poll(
        async () => page.locator("#sound, #ghosts").evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor)),
        { message: `Sound ${sound}, Ghosts ${ghosts}` },
      ).toEqual([sound, ghosts].map((on) => `rgb(${(on ? SELECTED : [26, 19, 13]).join(", ")})`));
      const readings = await page.locator("#settings-dialog button").evaluateAll((els) =>
        els.map((el) => ({
          name: el.id || el.textContent || "",
          bg: getComputedStyle(el).backgroundColor,
          selected: el.getAttribute("aria-checked") === "true" || (el.classList.contains("custom-cell") && el.getAttribute("tabindex") === "0"),
        })),
      );
      for (const r of readings) expect(rgb(r.bg).join() === SELECTED.join(), `Sound ${sound}, Ghosts ${ghosts}: ${r.name}`).toBe(r.selected);
      expect(readings.find((r) => r.name === "close")?.selected).toBe(false);
      expect(rgb(readings.find((r) => r.name === "close")?.bg ?? "")).toEqual([26, 19, 13]);
    }
    // Light and Keep burning keep the selected fill.
    await page.locator("#close").click();
    await settle(page);
    expect(rgb(await page.locator("#light").evaluate((el) => getComputedStyle(el).backgroundColor))).toEqual(SELECTED);
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});
test("a touch-only phone keeps no hover look: the stylesheet asks for a pointer that can hover", async ({ browser }) => {
  const app = await openApp(browser, { fixture: FIXTURES.idle, viewport: phone, mobile: true });
  try {
    const { page } = app;
    expect(await page.evaluate(() => matchMedia("(hover: hover)").matches)).toBe(false);
    await page.locator("#settings-button").click();
    await settle(page);
    await page.locator("#sound").hover();
    await settle(page);
    const border = await page.locator("#sound").evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(rgb(border), "the border stays amber under a pointer that cannot hover").toEqual([230, 194, 122]);
  } finally {
    await app.close();
  }
});

test("no text stands directly on the room: each is on a control fill or inside the zone", async ({ browser }, testInfo) => {
  interface Row {
    readonly where: string;
    readonly text: string;
    readonly on: "fill" | "zone";
  }
  const rows: Row[] = [];
  const offenders: string[] = [];
  const scenarios = [
    { name: "first visit, refused length", fixture: FIXTURES.idle, prepare: async (page: Page) => { await page.locator("#length-custom").focus(); await page.keyboard.type("4"); await press(page, "Enter"); } },
    { name: "settings open", fixture: FIXTURES.idle, prepare: async (page: Page) => { await page.locator("#settings-button").click(); await settle(page); } },
    { name: "lit, snuff dialog open", fixture: FIXTURES.litHalf, prepare: (page: Page) => press(page, "Escape") },
    { name: "paused", fixture: FIXTURES.paused, prepare: async () => undefined },
    { name: "burned out", fixture: FIXTURES.burnedOut, prepare: async () => undefined },
    { name: "snuffed", fixture: FIXTURES.snuffed, prepare: async () => undefined },
  ];
  for (const viewport of [phone, { width: 480, height: 800 }, tablet, desktop, wide]) {
    for (const scenario of scenarios) {
      const app = await openApp(browser, { fixture: scenario.fixture, viewport });
      try {
        const { page } = app;
        await scenario.prepare(page);
        const floorY = expectedPlacement(viewport.width, viewport.height).floorY;
        const found = await page.evaluate((zoneTop) => {
          const out: { where: string; text: string; on: "fill" | "zone" | "room" }[] = [];
          const ui = document.getElementById("ui");
          if (!ui) throw new Error("no #ui");
          // A computed colour is "rgb(r, g, b)" when opaque and "rgba(r, g, b, a)" otherwise; a transparent one is not a fill.
          const hasFill = (el: Element): boolean => {
            const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g) ?? [];
            return m.length === 3 || Number(m[3]) === 1;
          };
          // Covered when the element or an ancestor has a fill, or a visible element with a fill has the middle of the text inside its
          // box (the intent counter is a sibling laid over the field, not a child of it). A dialog counts only for text inside it.
          // Geometry, not hit testing: an open modal dialog answers for the whole page in hit testing and hides the controls under it.
          const covered = (el: Element): boolean => {
            for (let e: Element | null = el; e && e !== ui; e = e.parentElement) if (hasFill(e)) return true;
            const r = el.getBoundingClientRect();
            const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2];
            return [...ui.querySelectorAll("*")].some((e) => {
              if (e === el || !hasFill(e) || e.getClientRects().length === 0) return false;
              if (e instanceof HTMLDialogElement && !e.contains(el)) return false;
              const b = e.getBoundingClientRect();
              return b.width > 1 && b.height > 1 && cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom;
            });
          };
          for (const el of ui.querySelectorAll("*")) {
            if (el.closest(".sr-only") || el.closest("#live")) continue;
            const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "");
            const placeholder = el instanceof HTMLInputElement && el.value === "" && el.placeholder !== "" && getComputedStyle(el, "::placeholder").color !== "";
            const content = ["::before", "::after"].some((p) => {
              const c = getComputedStyle(el, p).content;
              return c !== "none" && c !== "normal" && c !== '""';
            });
            if (!own && !placeholder && !content) continue;
            const r = el.getBoundingClientRect();
            if (r.width <= 1 || r.height <= 1 || el.getClientRects().length === 0 || getComputedStyle(el).visibility === "hidden") continue;
            const label = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.classList.length ? `.${[...el.classList].join(".")}` : ""}`;
            const text = (own ? (el.textContent ?? "").trim() : placeholder ? (el as HTMLInputElement).placeholder : "(content)").slice(0, 40);
            const on = covered(el) ? "fill" : r.top >= zoneTop - 0.5 ? "zone" : "room";
            out.push({ where: label, text, on });
          }
          return out;
        }, floorY);
        for (const row of found) {
          if (row.on === "room") offenders.push(`${viewport.width}x${viewport.height} ${scenario.name}: ${row.where} "${row.text}"`);
          else rows.push({ where: row.where, text: row.text, on: row.on });
        }
        expect(found.length, `${viewport.width}x${viewport.height} ${scenario.name}: some text is on the page`).toBeGreaterThan(0);
      } finally {
        await app.close();
      }
    }
  }
  await testInfo.attach("texts-by-background", { body: JSON.stringify([...new Set(rows.map((r) => `${r.on}: ${r.where}`))].sort(), null, 2), contentType: "application/json" });
  expect(offenders, "texts with only the room behind them").toEqual([]);
});
