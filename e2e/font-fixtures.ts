// Font helpers for the browser tests (controls-and-access design 17.1, costume review second pass, finding 2).
// Web fonts load after the page does: a test that measures or photographs text must wait for them, or it sees the fallback serif.
// Nothing here is imported by shipped code.
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/** One load request per face: the display serif at the time text's weight, the text face in both weights. */
export const FONT_REQUESTS = ['700 36px "Cormorant Garamond"', '400 16px "Alegreya Sans"', '700 16px "Alegreya Sans"'] as const;

/** The faces `ui.css` declares, as `family weight: status`, sorted. */
export const FONT_FACES_LOADED = ["Alegreya Sans 400: loaded", "Alegreya Sans 700: loaded", "Cormorant Garamond 700: loaded"] as const;

/**
 * Waits until both families are loaded and confirms it: every face has status "loaded" and `document.fonts.check` is true for each
 * request. `document.fonts.ready` alone can resolve before a face has started loading (nothing has asked for it yet), so each face is
 * requested explicitly first. The clock is not touched: a font load is network work, not a timer.
 */
export async function fontsLoaded(page: Page): Promise<void> {
  const reading = await page.evaluate(async (requests) => {
    await Promise.all(requests.map((r) => document.fonts.load(r)));
    await document.fonts.ready;
    return {
      faces: [...document.fonts].map((f) => `${f.family.replace(/"/g, "")} ${f.weight}: ${f.status}`).sort(),
      checks: requests.map((r) => document.fonts.check(r)),
    };
  }, [...FONT_REQUESTS]);
  expect(reading.faces, "both font families are loaded").toEqual([...FONT_FACES_LOADED]);
  expect(reading.checks).toEqual([true, true, true]);
}

export interface PlatformFont {
  readonly family: string;
  /** True for a web font (a @font-face), false for a system font. */
  readonly custom: boolean;
  readonly glyphs: number;
}

/**
 * The fonts the browser really painted the text of `selector` with (Chromium's CSS.getPlatformFontsForNode). This tells the web font
 * from the fallback serif, which `getComputedStyle` cannot: the computed family is the same list in both cases.
 */
export async function platformFonts(page: Page, selector: string): Promise<PlatformFont[]> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    return fonts.map((f) => ({ family: f.familyName, custom: f.isCustomFont, glyphs: f.glyphCount }));
  } finally {
    await cdp.detach();
  }
}

export interface DigitInk {
  readonly char: string;
  /** First and last row of the glyph's ink, in pixels from the top of the element's box; null when the glyph left no ink. */
  readonly top: number | null;
  readonly bottom: number | null;
}

export interface FigureReading {
  readonly fontPx: number;
  readonly digits: readonly DigitInk[];
}

/**
 * Measures the figures of an element's text from its pixels. The element is photographed; for every digit its x-range comes from a
 * DOM Range, and the ink is the pixels in that range which are nearer the text colour than the background (the pixel at the box's
 * top-left corner). The result is the first and last row of ink for each digit. Old-style figures show as digits whose ink ends
 * far below the others (3, 4, 5, 7 and 9 descend) and as 0, 1 and 2 that are only as tall as a lower-case letter; lining figures
 * share one top and one bottom. The photograph is decoded in the page (createImageBitmap and a canvas), test code only.
 */
export async function readFigures(page: Page, selector: string): Promise<FigureReading> {
  const target = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!(el instanceof HTMLElement)) throw new Error(`no element ${s}`);
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const chars: { char: string; x0: number; x1: number }[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      for (let i = 0; i < text.length; i++) {
        const char = text.charAt(i);
        if (!/[0-9]/.test(char)) continue;
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        chars.push({ char, x0: r.left - Math.floor(box.left), x1: r.right - Math.floor(box.left) });
      }
    }
    const rgb = (style.color.match(/[\d.]+/g) ?? ["255", "255", "255"]).slice(0, 3).map(Number);
    return {
      clip: { x: Math.floor(box.left), y: Math.floor(box.top), width: Math.ceil(box.right) - Math.floor(box.left), height: Math.ceil(box.bottom) - Math.floor(box.top) },
      fontPx: parseFloat(style.fontSize),
      textLum: 0.299 * (rgb[0] ?? 255) + 0.587 * (rgb[1] ?? 255) + 0.114 * (rgb[2] ?? 255),
      chars,
    };
  }, selector);
  const png = await page.screenshot({ clip: target.clip, animations: "disabled" });
  const digits = await page.evaluate(
    async ({ base64, chars, textLum }) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(bitmap, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const lum = (x: number, y: number): number => {
        const i = (y * width + x) * 4;
        return 0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0);
      };
      const threshold = (lum(0, 0) + textLum) / 2;
      return chars.map(({ char, x0, x1 }) => {
        let top: number | null = null;
        let bottom: number | null = null;
        for (let y = 0; y < height; y++) {
          for (let x = Math.max(0, Math.floor(x0)); x < Math.min(width, Math.ceil(x1)); x++) {
            if (lum(x, y) > threshold) {
              top ??= y;
              bottom = y;
              break;
            }
          }
        }
        return { char, top, bottom };
      });
    },
    { base64: png.toString("base64"), chars: target.chars, textLum: target.textLum },
  );
  return { fontPx: target.fontPx, digits };
}

export interface FigureVerdict {
  readonly lining: boolean;
  /** Distance between the lowest and the highest ink bottom among the digits, in em. Lining figures: about 0.01. */
  readonly bottomSpreadEm: number;
  /** Height of the shortest digit, in em. Lining figures: at least 0.63. Old-style 0, 1 and 2: about 0.4. */
  readonly shortestEm: number;
  readonly count: number;
}

/** Limits between the two kinds, set from the fonts' own outlines (lining 0.63 to 0.66 em tall, old-style 0.39 to 0.41 em and up to 0.28 em below the baseline). */
export const LINING_MAX_BOTTOM_SPREAD_EM = 0.06;
export const LINING_MIN_HEIGHT_EM = 0.55;

/** Lining when every digit ends on the same row (within 0.06 em) and none is shorter than 0.55 em. */
export function judgeFigures(reading: FigureReading): FigureVerdict {
  const inked = reading.digits.filter((d): d is DigitInk & { top: number; bottom: number } => d.top !== null && d.bottom !== null);
  if (inked.length === 0) return { lining: false, bottomSpreadEm: Number.NaN, shortestEm: Number.NaN, count: 0 };
  const bottoms = inked.map((d) => d.bottom);
  const bottomSpreadEm = (Math.max(...bottoms) - Math.min(...bottoms)) / reading.fontPx;
  const shortestEm = Math.min(...inked.map((d) => d.bottom - d.top + 1)) / reading.fontPx;
  return {
    lining: inked.length === reading.digits.length && bottomSpreadEm <= LINING_MAX_BOTTOM_SPREAD_EM && shortestEm >= LINING_MIN_HEIGHT_EM,
    bottomSpreadEm,
    shortestEm,
    count: inked.length,
  };
}
