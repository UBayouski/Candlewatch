/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect, test } from "@playwright/test";
import { graveyardFixture, largeHistory, openGraveyardApp, openView, scrolls } from "./graveyard-fixtures";
import { VIEWPORTS_ART, patch, rgbAt, ratio } from "./room-art-fixtures";

test("Q66: the Place art is hidden in forced colours", async ({ browser }) => {
  const app = await openGraveyardApp(browser, { fixture: graveyardFixture("idle-large", "idle", largeHistory), viewport: VIEWPORTS_ART[0] });
  try {
    await openView(app.page);
    await app.page.emulateMedia({ forcedColors: "active" });
    const display = await app.page.locator("#graveyard svg.place").evaluate((el) => getComputedStyle(el).display);
    console.log("Q66 forced Place display", display);
    expect(display).toBe("none");
  } finally { await app.close(); }
});

const leafSelector = "#graveyard .label,#graveyard .day-label,#graveyard .more,#graveyard .count,#graveyard .empty,#graveyard .stone-date,#graveyard .stone-intent,#graveyard .card-line";
const parse = (value: string): [number, number, number] => {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
  if (channels.length !== 3) throw new Error(`bad text colour: ${value}`);
  return [channels[0]!, channels[1]!, channels[2]!];
};
const distance = (a: readonly number[], b: readonly number[]): number =>
  a.reduce((sum, value, i) => sum + Math.abs(value - b[i]!), 0);
const maxChannel = (a: readonly number[], b: readonly number[]): number =>
  Math.max(...a.map((value, i) => Math.abs(value - b[i]!)));

test.describe("room-art E7: Q78 visible leaf backing", () => {
  for (const viewport of VIEWPORTS_ART) for (const [historyName, history] of [["large", largeHistory], ["empty", []]] as const) {
    test(`${viewport.name} ${historyName}: each text line has 4.5 contrast`, async ({ browser }) => {
      test.setTimeout(90_000);
      const app = await openGraveyardApp(browser, { fixture: graveyardFixture(`idle-${historyName}`, "idle", history), viewport });
      try {
        const page = app.page;
        await openView(page);
        expect(await scrolls(page)).toBe(false);
        // The approved fixed Doorway pool keeps its 760-unit radius (Q28).
        // This also catches an enlarged pool that leaves the 4.5 text floor intact.
        expect(await page.locator("#cw-place-mask .doorway").getAttribute("r")).toBe("760");
        const itemRects = await page.locator("#graveyard button.item").evaluateAll((nodes) => nodes.map((el) => {
          const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height };
        }));
        for (const r of itemRects) {
          expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w).toBeLessThanOrEqual(viewport.width);
          expect(r.y + r.h).toBeLessThanOrEqual(viewport.height);
        }
        // Graveyard copy normally has pointer-events:none. Enable hit testing on
        // its leaves for this read without changing the rendered page.
        const hitStyle = await page.addStyleTag({ content: `${leafSelector}{pointer-events:auto!important}` });
        const texts = await page.locator(leafSelector).evaluateAll((nodes) => nodes.filter((el) => el.checkVisibility()).map((el) => {
          const range = document.createRange(); range.selectNodeContents(el);
          const ink = range.getBoundingClientRect();
          const own = el.closest("#graveyard-card")?.getBoundingClientRect() ?? el.closest("button.item")?.getBoundingClientRect() ?? el.getBoundingClientRect();
          const top = document.elementFromPoint(ink.x + ink.width / 2, ink.y + ink.height / 2);
          const rect = (r: DOMRect) => ({ x: r.x, y: r.y, w: r.width, h: r.height });
          return { name: el.textContent?.trim() ?? "", colour: getComputedStyle(el).color, ink: rect(ink), own: rect(own), line: rect(el.getBoundingClientRect()),
            covered: top !== el && !el.contains(top), cardLine: !!el.closest("#graveyard-card"), stoneDate: el.matches(".stone-date"),
            stoneText: el.matches(".stone-date,.stone-intent") };
        }));
        await hitStyle.evaluate((el) => el.parentNode?.removeChild(el));
        const skipped = texts.filter((t) => t.covered).map((t) => t.name);
        const measured = texts.filter((t) => !t.covered);
        const cardLocator = page.locator("#graveyard-card");
        const cardOpen = await cardLocator.isVisible();
        console.log("E7 Q78", viewport.name, historyName, "skipped", skipped.length, skipped);
        if (historyName === "large")
          expect(measured.filter((t) => t.stoneDate).length, "visible Stone dates outside the card are measured").toBeGreaterThanOrEqual(1);
        if (cardOpen) {
          expect(texts.filter((t) => t.cardLine).length, "the open card has text lines").toBeGreaterThan(0);
          expect(measured.filter((t) => t.cardLine).length, "every open-card line is measured").toBe(texts.filter((t) => t.cardLine).length);
        }
        const original = await page.screenshot({ animations: "disabled" });
        const noRoomStyle = await page.addStyleTag({ content: ".candle,.flame,.halo,.ghost-layer{display:none!important}" });
        const noRoom = await page.screenshot({ animations: "disabled" });
        await noRoomStyle.evaluate((el) => el.parentNode?.removeChild(el));
        const noPlaceStyle = await page.addStyleTag({ content: "#ui .graveyard svg.place{display:none!important}" });
        const noPlace = await page.screenshot({ animations: "disabled" });
        await noPlaceStyle.evaluate((el) => el.parentNode?.removeChild(el));
        const hidden = await page.addStyleTag({ content: `${leafSelector}{visibility:hidden!important}` });
        const twoFrames = page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        await page.clock.runFor(64);
        await twoFrames;
        const backing = await page.screenshot({ animations: "disabled" });
        await hidden.evaluate((el) => el.parentNode?.removeChild(el));
        let worst = { ratio: Infinity, name: "", point: [0, 0] as number[], rgb: [0, 0, 0] as number[] };
        const sparse: string[] = [];
        for (const t of measured) {
          const { ink, own } = t;
          const right = ink.x + ink.w + 3, left = ink.x - 3;
          const side = right < own.x + own.w - 1 ? right : left > own.x + 1 ? left : null;
          const bottom = ink.y + ink.h + 3, top = ink.y - 3;
          const row = bottom < own.y + own.h - 1 ? bottom : top > own.y + 1 ? top : null;
          const x0 = Math.max(own.x + 2, ink.x), x1 = Math.min(own.x + own.w - 2, ink.x + ink.w);
          const y0 = Math.max(ink.y + 1, own.y + 2), y1 = Math.min(ink.y + ink.h - 1, own.y + own.h - 2);
          // The engraved text is clipped to its own line, which is narrower
          // than the hit target and backed by the inset face.
          const candidates = t.stoneText
            ? Array.from({ length: 8 }, (_, i) => [
              t.line.x + t.line.w * ((i % 4) + .5) / 4,
              t.line.y + t.line.h * (i < 4 ? .25 : .75),
            ] as const)
            : side !== null
            ? Array.from({ length: 8 }, (_, i) => [side, y0 + (y1 - y0) * (i + 0.5) / 8] as const)
            : row !== null ? Array.from({ length: 8 }, (_, i) => [x0 + (x1 - x0) * (i + 0.5) / 8, row] as const) : [];
          const points = candidates.filter(([x, y]) => x > own.x + 1 && x < own.x + own.w - 1 && y > own.y + 1 && y < own.y + own.h - 1 &&
            x >= 1 && x < viewport.width - 1 && y >= 1 && y < viewport.height - 1);
          if (points.length < 8) sparse.push(`${t.name}: ${points.length} points`);
          for (const [x, y] of points) {
            const rgb = rgbAt(backing, x, y);
            const reading = ratio(parse(t.colour), rgb);
            if (reading < worst.ratio) worst = { ratio: reading, name: t.name, point: [x, y], rgb };
          }
        }
        console.log("E7 Q78", viewport.name, historyName, "worst", worst, "sparse", sparse, "Prototype subtle-text estimate about 4.7");
        expect(sparse).toEqual([]);
        expect(worst.ratio, `${viewport.name} ${historyName} ${worst.name} at ${worst.point}`).toBeGreaterThanOrEqual(4.5);
        let roomPixels = 0;
        const roomChanges: Array<{ name: string; x: number; y: number; before: number[]; after: number[] }> = [];
        for (const t of measured) {
          const r = t.line;
          for (let y = Math.max(0, Math.ceil(r.y)); y < Math.min(viewport.height, r.y + r.h); y++)
            for (let x = Math.max(0, Math.ceil(r.x)); x < Math.min(viewport.width, r.x + r.w); x++)
              if (maxChannel(rgbAt(original, x, y), rgbAt(noRoom, x, y)) > 2) {
                roomPixels++;
                if (roomChanges.length < 12) roomChanges.push({ name: t.name, x, y, before: rgbAt(original, x, y), after: rgbAt(noRoom, x, y) });
              }
        }
        console.log("E7 Q78", viewport.name, historyName, "room pixels in text rectangles", roomPixels, roomChanges);
        expect(roomPixels).toBe(0);
        const edgeReads = [0.3, 0.8].flatMap((f) => [2, viewport.width - 3].map((x) =>
          distance(patch(original, x, f * viewport.height), patch(noPlace, x, f * viewport.height))));
        console.log("E7 Q78", viewport.name, historyName, "Place edge differences", edgeReads);
        for (const value of edgeReads) expect(value).toBeGreaterThanOrEqual(8);
        const card = await cardLocator.isVisible() ? await cardLocator.boundingBox() : null;
        if (card) {
          expect(card.x).toBeGreaterThanOrEqual(0); expect(card.y).toBeGreaterThanOrEqual(0);
          expect(card.x + card.width).toBeLessThanOrEqual(viewport.width);
          expect(card.y + card.height).toBeLessThanOrEqual(viewport.height);
        }
      } finally { await app.close(); }
    });
  }
});

test("E7: Stone edges contrast with their drawn ground", async ({ browser }) => {
  const viewport = VIEWPORTS_ART[3];
  const app = await openGraveyardApp(browser, { fixture: graveyardFixture("idle-large", "idle", largeHistory), viewport });
  try {
    const page = app.page;
    await openView(page);
    const stones = await page.locator("#graveyard button.item.stone").evaluateAll((nodes) => nodes.map((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el, "::before");
      const px = (value: string) => Number.parseFloat(value);
      return { x: r.x + px(style.left), y: r.y + px(style.top), w: px(style.width), h: px(style.height),
        stops: style.backgroundImage.match(/rgb\([^)]+\)/g) ?? [] };
    }));
    const shown = await page.screenshot({ animations: "disabled" });
    const hide = await page.addStyleTag({ content: "#graveyard button.item.stone{visibility:hidden!important}" });
    const ground = await page.screenshot({ animations: "disabled" });
    await hide.evaluate((el) => el.parentNode?.removeChild(el));
    let found = 0, worst = Infinity;
    for (const stone of stones) {
      const edges = stone.stops.map(parse);
      expect(edges).toHaveLength(2);
      const tones = Array.from({ length: 9 }, (_, i) => edges[0]!.map((channel, c) =>
        channel + (edges[1]![c]! - channel) * i / 8));
      let pixels = 0;
      for (let y = Math.ceil(stone.y); y < stone.y + stone.h; y++)
        for (let x = Math.ceil(stone.x); x < stone.x + stone.w; x++) {
          const drawnEdge = rgbAt(shown, x, y);
          if (tones.every(tone => distance(drawnEdge, tone) > 10)) continue;
          found++;
          pixels++;
          worst = Math.min(worst, ratio(drawnEdge, rgbAt(ground, x, y)));
        }
      expect(pixels).toBeGreaterThan(0);
    }
    console.log("E7 Stone edge / drawn ground", { found, worst, stones: stones.length, first: stones[0], firstPixel: stones[0] ? rgbAt(shown, stones[0].x + 1, stones[0].y + stones[0].h * .5) : null });
    expect(found).toBeGreaterThan(0);
    expect(worst).toBeGreaterThanOrEqual(3);
  } finally { await app.close(); }
});

for (const viewport of [VIEWPORTS_ART[0], VIEWPORTS_ART[3], VIEWPORTS_ART[4]]) {
  test(`visual-polish D4 ${viewport.name}: distinct stones stay inside their targets`, async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: graveyardFixture("idle-large", "idle", largeHistory), viewport });
    try {
      const { page } = app;
      await openView(page);
      await page.keyboard.press("Escape");
      await page.evaluate(() => document.fonts.ready);
      const scale = Math.min(viewport.width / 600, viewport.height / 1000);
      const stones = await page.locator("#graveyard button.stone").evaluateAll(nodes => nodes.map(el => {
        const target = el.getBoundingClientRect(), art = getComputedStyle(el, "::before");
        const read = (v: string) => Number.parseFloat(v);
        const x = target.x + read(art.left), y = target.y + read(art.top);
        const w = read(art.width), h = read(art.height);
        const lines = [...el.querySelectorAll("span")].map(line => {
          const box = line.getBoundingClientRect();
          return box.x > x && box.right < x + w && box.y > y && box.bottom <= y + h + .1 &&
            getComputedStyle(line).transform === "none";
        });
        const corner = document.elementFromPoint(target.x + 1, target.y + 1);
        const inscription = el.querySelector(".stone-intent")!;
        const range = document.createRange();
        range.selectNodeContents(inscription);
        const letters = [...range.getClientRects()];
        const inscriptionBox = inscription.getBoundingClientRect();
        range.setEnd(inscription.firstChild!, inscription.textContent!.split(" ")[0]!.length);
        const intent = { text: inscription.textContent, date: el.querySelector(".stone-date")?.textContent,
          fits: letters.every(line => line.width <= inscriptionBox.width + .01 &&
            line.top + line.height / 2 < inscriptionBox.bottom),
          firstWordIntact: range.getClientRects().length === 1,
          wraps: getComputedStyle(inscription).whiteSpace === "normal", overflow: getComputedStyle(inscription).textOverflow };
        const background = getComputedStyle(el, "::after");
        const repeats = background.backgroundRepeat.split(", ");
        const tiledTexture = background.backgroundSize.split(", ").some((size, i) => size.includes("%") && repeats[i] !== "no-repeat");
        return { target: { x: target.x, y: target.y, w: target.width, h: target.height },
          face: { x, y, w, h }, shape: art.clipPath, lines, corner: corner === el || el.contains(corner), intent, tiledTexture };
      }));
      expect(stones).toHaveLength(10);
      expect(new Set(stones.map(({ shape }) => shape)).size).toBeGreaterThanOrEqual(8);
      expect(new Set(stones.map(({ face }) => face.h)).size).toBeGreaterThanOrEqual(6);
      expect(stones[0]!.target.x).toBeGreaterThan(stones[5]!.target.x);
      expect(stones[0]!.target.y).toBeLessThan(stones[5]!.target.y);
      for (const { target, face, lines, corner, intent, tiledTexture } of stones) {
        expect(target.w).toBeCloseTo(100 * scale, 1);
        expect(target.h).toBeCloseTo(74 * scale, 1);
        expect(face.x).toBeGreaterThanOrEqual(target.x);
        expect(face.y).toBeGreaterThanOrEqual(target.y);
        expect(face.x + face.w).toBeLessThanOrEqual(target.x + target.w + .1);
        expect(face.y + face.h).toBeLessThanOrEqual(target.y + target.h + .1);
        expect(lines).toEqual([true, true]);
        expect(corner).toBe(true);
        expect(tiledTexture).toBe(false);
        expect(intent.overflow).toBe("ellipsis");
        if (viewport.name !== "phone" && /^Task \d+$/.test(intent.text ?? "")) {
          expect(intent.fits, intent.text ?? "").toBe(true);
        }
      }
      const long = stones.find(({ intent }) => intent.text?.startsWith("Finish the quarterly"));
      expect(long!.intent.fits).toBe(false);
      const unnamed = stones.find(({ intent }) => intent.date === "5 Nov");
      if (viewport.name !== "phone") {
        expect(unnamed!.intent).toMatchObject({ text: "Unnamed watch", fits: true, wraps: true });
        for (const { intent } of stones.filter(({ intent }) => intent.text === "Unnamed watch")) {
          expect(intent).toMatchObject({ fits: true, firstWordIntact: true });
        }
      }
      const wax = await page.locator(".stub-wax").first().boundingBox();
      expect(wax?.width).toBeCloseTo((viewport.name === "phone" ? 28 : 40) * scale, 1);
      expect(wax?.height).toBeCloseTo((viewport.name === "phone" ? 30 : 42) * scale, 1);
      const tower = page.locator(".p-tower");
      await expect(tower.locator("path").first()).toHaveAttribute("d", "M681 224 L688 102 H712 L719 224 Z");
      expect(await tower.evaluate(node => node.previousElementSibling?.getAttribute("class"))).toBe("p-hill-mid");
      expect(await tower.evaluate(node => node.nextElementSibling?.getAttribute("class"))).toBe("p-hill-near");
      if (viewport.name === "wide") {
        const box = await tower.boundingBox();
        expect(box!.x + box!.width).toBeLessThan(viewport.width);
      }
    } finally { await app.close(); }
  });
}

