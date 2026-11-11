// E6: the accessibility tree, the focus indicator and the text contrast of the ghosts and the graveyard
// (ghosts-and-graveyard R4.14, R6.19, R7, R9.14, R10.1, R11.15 to R11.17; tasks 25.1 and 25.2).
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { STRINGS } from "../src/strings";
import {
  DAY,
  T0,
  graveyardFixture,
  largeHistory,
  liveTexts,
  openGraveyardApp,
  openView,
  press,
  readGhosts,
  settle,
  smallHistory,
  stageOf,
  storedState,
  toPage,
  viewOf,
  withDistractions,
} from "./graveyard-fixtures";
import type { Rect } from "./graveyard-fixtures";
import { colourAt } from "./scene-fixtures";

test.describe.configure({ mode: "parallel" });

/** "<day> <month>" of an instant in the browser's own calendar. */
const dateOf = (page: Page, t: number): Promise<string> =>
  page.evaluate(
    ({ t, months }) => {
      const d = new Date(t);
      return `${d.getDate()} ${months[d.getMonth()] ?? ""}`;
    },
    { t, months: [...STRINGS.graveyard.months] },
  );

// The small history's two days end at noon, two days and one day before the session of the fixtures (see graveyard-fixtures.ts).
const NOON = T0 - 8 * 60 * 60_000;

// --- 25.1: the tree ----------------------------------------------------------------

test.describe("E6: the accessibility tree of the view (ariaSnapshot)", () => {
  test("small history: heading, two named groups, each Item a button with its name and its description, the return button", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: graveyardFixture("idle-small", "idle", smallHistory) });
    try {
      const { page } = app;
      const d0 = await dateOf(page, NOON - 2 * DAY);
      const d1 = await dateOf(page, NOON - DAY);
      await openView(page);
      // Hand-written from the fixture: stones are the two snuffed entries, newest first; the Shelf has one stub per day, newest day first.
      const expected = [
        "- /children: deep-equal",
        `- heading "${STRINGS.graveyard.title}" [level=2]`,
        `- group "${STRINGS.graveyard.graveyardLabel}":`,
        `  - button "No intent, ${d1}": ${d1} No intent`,
        `  - text: "No intent. ${d1}. Planned: 15 minutes. Distractions: 0. Time away: 0 seconds"`,
        `  - button "Write the report, ${d0}": ${d0} Write the report`,
        `  - text: "Write the report. ${d0}. Planned: 25 minutes. Distractions: 2. Time away: 1 minute 30 seconds"`,
        `- group "${STRINGS.graveyard.shelfLabel}":`,
        `  - paragraph: ${d1}`,
        `  - button "No intent, ${d1}"`,
        `  - text: "No intent. ${d1}. Planned: 25 minutes. Distractions: 0. Time away: 0 seconds"`,
        `  - paragraph: ${d0}`,
        `  - button "Review the draft, ${d0}"`,
        `  - text: "Review the draft. ${d0}. Planned: 50 minutes. Distractions: 1. Time away: 20 seconds"`,
        `- button "${STRINGS.graveyard.back}"`,
      ].join("\n");
      await expect(page.locator("#graveyard")).toMatchAriaSnapshot(expected);
      // The description is in the tree whether or not a card is shown: the card itself is aria-hidden and changes nothing.
      expect(await page.locator("#graveyard-card").isVisible()).toBe(true);
      await press(page, "Escape");
      expect(await page.locator("#graveyard-card").isVisible()).toBe(false);
      await expect(page.locator("#graveyard")).toMatchAriaSnapshot(expected);
      // Each Item names its description with aria-describedby.
      for (const item of await page.locator("#graveyard button.item").all()) {
        const descId = await item.getAttribute("aria-describedby");
        expect(descId).not.toBeNull();
        await expect(page.locator(`[id="${descId ?? ""}"]`)).toHaveCount(1);
      }
    } finally {
      await app.close();
    }
  });

  test("large history: ten stones, three days, the Count_Lines as text, no listbox, option or grid", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: graveyardFixture("idle-large", "idle", largeHistory) });
    try {
      const { page } = app;
      await openView(page);
      const snuffed = largeHistory.filter((e) => e.outcome === "snuffed").length;
      const tree = await page.locator("#graveyard").ariaSnapshot();
      for (const role of ["listbox", "option", "grid", "gridcell", "row"]) expect(tree).not.toMatch(new RegExp(`^\\s*- ${role}\\b`, "m"));
      const stonesTree = await page.getByRole("group", { name: STRINGS.graveyard.graveyardLabel }).ariaSnapshot();
      const shelfTree = await page.getByRole("group", { name: STRINGS.graveyard.shelfLabel }).ariaSnapshot();
      expect(stonesTree.match(/^\s*- button /gm)).toHaveLength(10);
      expect(stonesTree.match(/^\s*- text: /gm)).toHaveLength(10);
      expect(stonesTree).toContain(`- paragraph: ${snuffed - 10} older stones not shown`);
      expect(shelfTree.match(/^\s*- paragraph: \d+ \w+$/gm)).toHaveLength(3);
      expect(shelfTree).toMatch(/- paragraph: \d+ older days not shown/);
      await expect(page.locator("#graveyard")).toMatchAriaSnapshot(
        [`- heading "${STRINGS.graveyard.title}" [level=2]`, `- group "${STRINGS.graveyard.graveyardLabel}"`, `- group "${STRINGS.graveyard.shelfLabel}"`, `- button "${STRINGS.graveyard.back}"`].join("\n"),
      );
    } finally {
      await app.close();
    }
  });

  test("empty history: the two empty-state lines and no button but the return control", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: graveyardFixture("idle-empty", "idle", []) });
    try {
      const { page } = app;
      await openView(page);
      await expect(page.locator("#graveyard")).toMatchAriaSnapshot(
        [
          "- /children: deep-equal",
          `- heading "${STRINGS.graveyard.title}" [level=2]`,
          `- group "${STRINGS.graveyard.graveyardLabel}":`,
          `  - paragraph: ${STRINGS.graveyard.noStones}`,
          `- group "${STRINGS.graveyard.shelfLabel}":`,
          `  - paragraph: ${STRINGS.graveyard.noStubs}`,
          `- button "${STRINGS.graveyard.back}"`,
        ].join("\n"),
      );
    } finally {
      await app.close();
    }
  });

  for (const phase of ["idle", "lit", "paused", "burned-out", "snuffed"] as const) {
    const usable = phase === "idle" || phase === "burned-out" || phase === "snuffed";
    test(`${phase}: the Door is ${usable ? "a button" : "absent from the tree"} in the room`, async ({ browser }) => {
      const app = await openGraveyardApp(browser, { fixture: graveyardFixture(`${phase}-small`, phase, smallHistory) });
      try {
        const { page } = app;
        const tree = await page.locator("#graveyard").ariaSnapshot();
        if (usable) expect(tree.trim()).toBe(`- button "${STRINGS.graveyard.door}"`);
        else expect(tree.trim()).toBe("");
      } finally {
        await app.close();
      }
    });
  }

  test("the live log gets exactly one line on open and one on leave", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: graveyardFixture("snuffed-small", "snuffed", smallHistory) });
    try {
      const { page } = app;
      const before = (await liveTexts(page)).length;
      await openView(page);
      await press(page, "ArrowRight");
      await press(page, "Tab");
      expect((await liveTexts(page)).slice(before)).toEqual([STRINGS.graveyard.announceOpen]);
      await page.locator("#graveyard-back").click();
      await settle(page);
      expect(await viewOf(page)).toBe("room");
      expect((await liveTexts(page)).slice(before)).toEqual([STRINGS.graveyard.announceOpen, STRINGS.graveyard.announceLeave]);
    } finally {
      await app.close();
    }
  });

  const LABEL_CASES = [
    { name: "0", n: 0, settings: undefined },
    { name: "1", n: 1, settings: undefined },
    { name: "3", n: 3, settings: undefined },
    { name: "14 (over G)", n: 14, settings: undefined },
    { name: "3 with ghosts off", n: 3, settings: JSON.stringify({ v: 1, sound: true, ghosts: false, defaultLength: 25 }) },
    { name: "21 with ghosts off (over G)", n: 21, settings: JSON.stringify({ v: 1, sound: true, ghosts: false, defaultLength: 25 }) },
  ] as const;
  for (const c of LABEL_CASES) {
    test(`the scene label gives the exact count: ${c.name}`, async ({ browser }) => {
      const app = await openGraveyardApp(browser, { fixture: withDistractions(c.n, "lit"), ...(c.settings === undefined ? {} : { settings: c.settings }) });
      try {
        const { page } = app;
        const words = c.n === 1 ? "1 distraction" : `${c.n} distractions`;
        await expect(page.locator("#scene")).toHaveAttribute("aria-label", `${STRINGS.scene.steady} ${words}.`);
        const drawn = (await readGhosts(page)).ghosts.length;
        expect(drawn).toBe(c.settings === undefined ? Math.min(c.n, 12) : 0);
        const state = await storedState(page);
        expect(state.phase === "lit" ? state.session.distractions : -1).toBe(c.n);
      } finally {
        await app.close();
      }
    });
  }
});

// --- 25.2: the focus indicator and the contrast ------------------------------------------

type Rgb = [number, number, number];
const luminance = ([r, g, b]: Rgb): number => {
  const ch = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
const contrast = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
const parseRgb = (css: string): Rgb => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css);
  if (m === null) throw new Error(`not a colour: ${css}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};
const IVORY: Rgb = [0xef, 0xe6, 0xcf];

/** The computed outline of the focused element, and its rectangle. */
const focusRing = (page: Page): Promise<{ id: string; width: string; style: string; color: string; offset: string; rect: Rect }> =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { id: el.id, width: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor, offset: cs.outlineOffset, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
  });

/**
 * The ring against what is next to it, below the element's lower edge at its middle: a 1 px column of 8 single pixels from the edge.
 * Rows 0 to 2 are the 3 px gap of the offset (the background the ring stands on), rows 3 to 5 the 3 px ring. Returns the contrast of
 * the brightest ring pixel against the gap pixel next to the element (row 1), with both read as single pixels, not averaged.
 */
async function ringContrast(page: Page, rect: Rect): Promise<{ ratio: number; ring: Rgb; gap: Rgb }> {
  const x = Math.round(rect.x + rect.w / 2);
  const y = Math.round(rect.y + rect.h);
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 8 }, animations: "disabled" });
  const px = await page.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0);
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return Array.from({ length: canvas.height }, (_, i) => [d[4 * i] ?? 0, d[4 * i + 1] ?? 0, d[4 * i + 2] ?? 0]);
  }, png.toString("base64"));
  const rows = px as Rgb[];
  const gap = rows[1] ?? [0, 0, 0];
  const ring = rows.slice(3, 6).reduce((a, b) => (luminance(b) > luminance(a) ? b : a));
  return { ratio: contrast(ring, gap), ring, gap };
}
test.describe("E6: the focus indicator", () => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 360, height: 640 },
  ]) {
    test(`an Item, the Door and the return control show the 3 px ivory ring with a 3 px offset, at least 3:1 (${viewport.width} x ${viewport.height})`, async ({ browser }) => {
      const app = await openGraveyardApp(browser, { fixture: graveyardFixture("idle-small", "idle", smallHistory), viewport });
      try {
        const { page } = app;
        const check = async (id: string): Promise<void> => {
          await page.mouse.move(0, 0);
          const ring = await focusRing(page);
          expect(ring.id).toBe(id);
          expect(await page.evaluate(() => document.activeElement?.matches(":focus-visible"))).toBe(true);
          expect({ width: ring.width, style: ring.style, offset: ring.offset }, id).toEqual({ width: "3px", style: "solid", offset: "3px" });
          expect(parseRgb(ring.color), id).toEqual(IVORY);
          const measured = await ringContrast(page, ring.rect);
          expect(measured.ratio, `${id}: ring ${JSON.stringify(measured.ring)} against the gap ${JSON.stringify(measured.gap)}`).toBeGreaterThanOrEqual(3);
          console.log(`RING ${viewport.width} ${id} ${measured.ratio.toFixed(2)} ring ${JSON.stringify(measured.ring)} gap ${JSON.stringify(measured.gap)}`);
        };
        // The Door, by Tab from the start of the page (length, intent, Light, the Door).
        for (let i = 0; i < 4; i++) await press(page, "Tab");
        await check("door");
        // An Item: the view opens on the first stone (with g: Enter is the room's Light key).
        await openView(page);
        expect(await viewOf(page)).toBe("graveyard");
        const first = await page.evaluate(() => document.activeElement?.id ?? "");
        await press(page, "Escape"); // the card covers what lies above the stone; hide it to read the ring's surroundings
        await check(first);
        // A Stub, then the return control.
        await press(page, "Tab");
        await check(await page.evaluate(() => document.activeElement?.id ?? ""));
        await press(page, "Tab");
        await check("graveyard-back");
      } finally {
        await app.close();
      }
    });
  }
});

test.describe("E6: text contrast from the computed colours against the real backgrounds", () => {
  test("Item text, Count_Lines, empty lines and card text meet 4.5:1 and match the figures of contrast.test.ts (L11 as amended by D15, D16)", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: graveyardFixture("idle-large", "idle", largeHistory) });
    try {
      const { page } = app;
      await openView(page);
      const read = (selector: string) =>
        page.evaluate((s) => {
          const el = document.querySelector(s);
          if (el === null) throw new Error(`no ${s}`);
          const r = el.getBoundingClientRect();
          return { color: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
        }, selector);
      // The real backgrounds, by pixel: the backdrop's opaque core (an empty corner, room x 590, y 795) and a stone's face.
      const corner = toPage({ x: 590, y: 795, w: 0, h: 0 }, await stageOf(page));
      const panelPx = await colourAt(page, corner.x, corner.y);
      expect(panelPx).toEqual([0x08, 0x0b, 0x12]);
      const stone = await read("#graveyard-stones button.item");
      const facePx = await colourAt(page, stone.rect.x + stone.rect.w / 2, stone.rect.y + stone.rect.h * 0.85); // below the two text lines
      expect(facePx).toEqual([0x14, 0x19, 0x2a]);

      const stoneText = contrast(parseRgb((await read("#graveyard-stones .stone-date")).color), facePx);
      expect(stoneText).toBeGreaterThanOrEqual(4.5);
      expect(stoneText).toBeCloseTo(14.05, 1);
      const countLine = contrast(parseRgb((await read("#graveyard-stones-count")).color), panelPx);
      expect(countLine).toBeGreaterThanOrEqual(4.5);
      const dayLabel = contrast(parseRgb((await read("#graveyard-shelf .day-label")).color), panelPx);
      expect(dayLabel).toBeCloseTo(15.83, 1);
      // The card: ivory on the interface's warm fill, opaque (D16).
      await press(page, "ArrowRight");
      const card = await read("#graveyard-card");
      expect(parseRgb(card.bg)).toEqual([0x1a, 0x13, 0x0d]);
      const cardText = contrast(parseRgb(card.color), parseRgb(card.bg));
      expect(cardText).toBeCloseTo(14.78, 1);
      // The return control: the same warm fill (D17).
      expect(parseRgb((await read("#graveyard-back")).bg)).toEqual([0x1a, 0x13, 0x0d]);
      console.log(`CONTRAST stone text ${stoneText.toFixed(2)} | Count_Line ${countLine.toFixed(2)} | day label ${dayLabel.toFixed(2)} | card ${cardText.toFixed(2)}`);
    } finally {
      await app.close();
    }
    // The empty-state lines.
    const empty = await openGraveyardApp(browser, { fixture: graveyardFixture("idle-empty", "idle", []) });
    try {
      const { page } = empty;
      await openView(page);
      const color = await page.evaluate(() => getComputedStyle(document.querySelector("#graveyard-stones .empty") as Element).color);
      const box = toPage({ x: 590, y: 795, w: 0, h: 0 }, await stageOf(page));
      const c = contrast(parseRgb(color), await colourAt(page, box.x, box.y));
      expect(c).toBeGreaterThanOrEqual(4.5);
      console.log(`CONTRAST empty line ${c.toFixed(2)}`);
    } finally {
      await empty.close();
    }
  });

  for (const phase of ["lit", "burned-out", "snuffed"] as const) {
    test(`the Overflow_Mark is ivory and at least 4.5:1 against the room around it (${phase})`, async ({ browser }) => {
      const app = await openGraveyardApp(browser, { fixture: withDistractions(21, phase) });
      try {
        const { page } = app;
        const mark = (await readGhosts(page)).mark;
        expect(mark.shown).toBe(true);
        const fill = await page.evaluate(() => getComputedStyle(document.querySelector("#ghost-root .overflow") as Element).fill);
        expect(parseRgb(fill)).toEqual(IVORY);
        const r = mark.rect;
        expect(r).not.toBeNull();
        if (r === null) return;
        // The room just left, right, above and below the text box; the lowest contrast of the four counts.
        const around = [
          await colourAt(page, r.x - 3, r.y + r.h / 2),
          await colourAt(page, r.x + r.w + 3, r.y + r.h / 2),
          await colourAt(page, r.x + r.w / 2, r.y - 3),
          await colourAt(page, r.x + r.w / 2, r.y + r.h + 3),
        ];
        const worst = Math.min(...around.map((px) => contrast(IVORY, px)));
        console.log(`CONTRAST Overflow_Mark (${phase}) worst ${worst.toFixed(2)} against ${JSON.stringify(around)}`);
        expect(worst).toBeGreaterThanOrEqual(4.5);
      } finally {
        await app.close();
      }
    });
  }
});
