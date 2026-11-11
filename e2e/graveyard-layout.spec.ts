// E3: the Graveyard_View's layout with a small and a large history (ghosts-and-graveyard R4.9 to R4.12, R8.8 to R8.11, R11.9; task 22.1).
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { HistoryEntry } from "../src/engine";
import { CARD_RIM_PX, DOOR_RECT, PANEL_FADE, PANEL_RECT, RING_CLEAR_PX, RING_PX, stoneRect, stubRect } from "../src/graveyard/geometry";
import { STRINGS } from "../src/strings";
import { fill } from "../src/ui/format";
import {
  GRAVEYARD_VIEWPORTS,
  graveyardFixture,
  inside,
  largeHistory,
  openGraveyardApp,
  openView,
  overlaps,
  scrolls,
  settle,
  smallHistory,
  stageOf,
  toPage,
  viewOf,
} from "./graveyard-fixtures";
import type { Rect, Stage } from "./graveyard-fixtures";

test.describe.configure({ mode: "parallel" });

/** The limits of decision L8, written out here: 10 stones, 3 days, 4 stubs a day. */
const S = 10;
const D = 3;
const K = 4;

interface Seen {
  readonly label: string;
  readonly rect: Rect;
}

/** Every visible box of the view, by kind (the card is read separately). */
async function readView(page: Page): Promise<{ stones: Rect[]; rows: Rect[][]; lines: Seen[]; ink: Seen[]; back: Rect; panel: Rect; settings: Rect | null }> {
  return page.evaluate(() => {
    const box = (el: Element | Range) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const shown = (el: Element) => el.checkVisibility();
    const stones = [...document.querySelectorAll("#graveyard-stones button.item")].map(box);
    const rows = [...document.querySelectorAll("#graveyard-shelf .day")].map((d) => [...d.querySelectorAll("button.item")].map(box));
    // The heading is read only and not seen (D19), so it has no place in the layout.
    const textEls = [...document.querySelectorAll("#graveyard .count, #graveyard .empty, #graveyard .more, #graveyard .day-label, #graveyard .label")].filter(shown);
    const lines = textEls.map((el) => ({ label: `${el.className}: ${el.textContent ?? ""}`, rect: box(el) }));
    // Where the text itself is drawn: the glyph boxes of each line, for the ring check.
    const ink = textEls.map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return { label: `${el.className}: ${el.textContent ?? ""}`, rect: box(range) };
    });
    const settingsEl = document.querySelector("#settings-button");
    return {
      stones,
      rows,
      lines,
      ink,
      back: box(document.querySelector("#graveyard-back") as Element),
      panel: box(document.querySelector("#graveyard .panel") as Element),
      settings: settingsEl !== null && shown(settingsEl) ? box(settingsEl) : null,
    };
  });
}

/** What the Count_Lines and "+n more" must say for this history, from the stored values and the browser's own calendar. */
async function expectedCounts(page: Page, history: readonly HistoryEntry[]): Promise<{ stones: string | null; days: string | null; more: (string | null)[] }> {
  const keys = await page.evaluate(
    (ends) =>
      ends.map((t) => {
        const d = new Date(t);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }),
    history.map((e) => e.endedAt),
  );
  const snuffed = history.filter((e) => e.outcome === "snuffed").length;
  const perDay = new Map<string, number>();
  history.forEach((e, i) => {
    if (e.outcome !== "burned-out") return;
    const key = keys[i] ?? "";
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  });
  const days = [...perDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const hiddenStones = Math.max(0, snuffed - S);
  const hiddenDays = Math.max(0, days.length - D);
  return {
    stones: hiddenStones === 0 ? null : fill(hiddenStones === 1 ? STRINGS.graveyard.olderStone : STRINGS.graveyard.olderStones, { n: hiddenStones }),
    days: hiddenDays === 0 ? null : fill(hiddenDays === 1 ? STRINGS.graveyard.olderDay : STRINGS.graveyard.olderDays, { n: hiddenDays }),
    more: days.slice(0, D).map(([, n]) => (n > K ? fill(STRINGS.graveyard.more, { n: n - K }) : null)),
  };
}

/** How far apart two rectangles are along their best axis: negative when they overlap on both axes. */
const separation = (a: Rect, b: Rect): number => Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), a.y - (b.y + b.h), b.y - (a.y + a.h));
const near = (a: Rect, b: Rect, tol = 1): boolean => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.w - b.w) <= tol && Math.abs(a.h - b.h) <= tol;
const stageRect = (s: Stage): Rect => ({ x: s.ox, y: s.oy, w: 600 * s.scale, h: 1000 * s.scale });

const HISTORIES = [
  { name: "small", history: smallHistory },
  { name: "large", history: largeHistory },
] as const;

for (const { name, history } of HISTORIES) {
  for (const viewport of GRAVEYARD_VIEWPORTS) {
    test(`${name} history at ${viewport.width} x ${viewport.height}: no scroll, no overlap, inside the stage, the geometry and the Count_Lines`, async ({ browser }) => {
      const app = await openGraveyardApp(browser, { fixture: graveyardFixture(`idle-${name}`, "idle", history), viewport });
      try {
        const { page } = app;
        await openView(page);
        expect(await viewOf(page)).toBe("graveyard");
        const stage = await stageOf(page);
        const vp: Rect = { x: 0, y: 0, w: viewport.width, h: viewport.height };
        const seen = await readView(page);

        expect(await scrolls(page), "no scroll in either direction").toBe(false);

        // Item rectangles are the geometry values scaled by the stage box, within 1 px.
        seen.stones.forEach((r, i) => expect(near(r, toPage(stoneRect(i), stage)), `stone ${i} ${JSON.stringify(r)}`).toBe(true));
        seen.rows.forEach((row, ri) => row.forEach((r, j) => expect(near(r, toPage(stubRect(ri, j), stage)), `stub ${ri}.${j} ${JSON.stringify(r)}`).toBe(true)));
        expect(near(seen.back, toPage(DOOR_RECT, stage)), "the return control is at the Door's rectangle").toBe(true);
        // The backdrop: the opaque core and its fading margin above and to the sides (D18).
        const backdrop = { x: PANEL_RECT.x - PANEL_FADE, y: PANEL_RECT.y - PANEL_FADE, w: PANEL_RECT.w + 2 * PANEL_FADE, h: PANEL_RECT.h + PANEL_FADE };
        expect(near(seen.panel, toPage(backdrop, stage)), "the backdrop").toBe(true);
        const core = toPage(PANEL_RECT, stage);

        // No two static boxes overlap; all lie inside the viewport and inside the stage box.
        const boxes: Seen[] = [
          ...seen.stones.map((rect, i) => ({ label: `stone ${i}`, rect })),
          ...seen.rows.flatMap((row, ri) => row.map((rect, j) => ({ label: `stub ${ri}.${j}`, rect }))),
          ...seen.lines,
          { label: "return control", rect: seen.back },
        ];
        for (const [i, a] of boxes.entries()) {
          expect(inside(a.rect, vp), `${a.label} inside the viewport`).toBe(true);
          expect(inside(a.rect, stageRect(stage)), `${a.label} inside the stage box`).toBe(true);
          for (const b of boxes.slice(i + 1)) expect(overlaps(a.rect, b.rect, 0.5), `${a.label} and ${b.label} overlap`).toBe(false);
        }
        // The focus ring (D14): every item and the return control, grown by the ring (3 px offset and 3 px width, checked in E6), keeps
        // 2 px from the drawn text of every label, count line, empty line, date label and "+n more".
        for (const b of boxes.filter((x) => /^(stone|stub|return)/.test(x.label))) {
          const ring = { x: b.rect.x - RING_PX, y: b.rect.y - RING_PX, w: b.rect.w + 2 * RING_PX, h: b.rect.h + 2 * RING_PX };
          for (const t of seen.ink) expect(separation(ring, t.rect), `the ring of ${b.label} and ${t.label}`).toBeGreaterThanOrEqual(RING_CLEAR_PX - 0.01);
        }
        // Every text of the view lies on the opaque core (contrast, D8, D18).
        for (const t of seen.lines) expect(inside(t.rect, core), `${t.label} on the core`).toBe(true);
        // Everything of the view is above the Floor_Band (room y 900), and the visible Settings control is clear of the view.
        const floorTop = stage.oy + 900 * stage.scale;
        for (const b of [...boxes, { label: "backdrop", rect: seen.panel }]) expect(b.rect.y + b.rect.h, `${b.label} above the Floor_Band`).toBeLessThanOrEqual(floorTop + 0.5);
        if (seen.settings !== null) for (const b of [...boxes, { label: "panel", rect: seen.panel }]) expect(overlaps(seen.settings, b.rect, 0.5), `Settings and ${b.label}`).toBe(false);

        // Hit sizes: at least 44 px on the smallest stage.
        if (viewport.width === 360) {
          for (const b of boxes.filter((x) => /^(stone|stub|return)/.test(x.label))) {
            expect(b.rect.w, `${b.label} width`).toBeGreaterThanOrEqual(44);
            expect(b.rect.h, `${b.label} height`).toBeGreaterThanOrEqual(44);
          }
        }

        // The Count_Lines and the "+n more" texts say the exact numbers of the stored history.
        const want = await expectedCounts(page, history);
        const stonesCount = await page.locator("#graveyard-stones-count").count();
        const shelfCount = await page.locator("#graveyard-shelf-count").count();
        expect(stonesCount === 0 ? null : await page.locator("#graveyard-stones-count").textContent()).toBe(want.stones);
        expect(shelfCount === 0 ? null : await page.locator("#graveyard-shelf-count").textContent()).toBe(want.days);
        const more = await page.evaluate(() => [...document.querySelectorAll("#graveyard-shelf .day")].map((d) => d.querySelector(".more")?.textContent ?? null));
        expect(more).toEqual(want.more);
        if (name === "large") {
          expect(want.stones).not.toBeNull();
          expect(want.days).not.toBeNull();
          expect(seen.stones).toHaveLength(S);
          expect(seen.rows).toHaveLength(D);
        }

        // Each Item's card stays inside the panel and the stage, never covers its own Item, the return control or the Settings control.
        const items: Rect[] = [...seen.stones, ...seen.rows.flat()];
        const ids = await page.evaluate(() => [...document.querySelectorAll("#graveyard button.item")].map((el) => el.id));
        for (const [i, id] of ids.entries()) {
          await page.locator(`[id="${id}"]`).focus();
          await settle(page);
          const card = await page.evaluate(() => {
            const el = document.querySelector<HTMLElement>("#graveyard-card");
            if (el === null || el.hidden) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
          });
          expect(card, `card of ${id}`).not.toBeNull();
          if (card === null) continue;
          const own = items[i];
          if (own !== undefined) {
            expect(overlaps(card, own, 0.5), `card covers its own Item ${id}`).toBe(false);
            // Nor, with its 4 px rim, the Item's focus ring (D16).
            expect(separation(card, own), `card of ${id} and its Item's ring`).toBeGreaterThanOrEqual(RING_PX + CARD_RIM_PX - 0.01);
          }
          expect(overlaps(card, seen.back, 0.5), `card of ${id} and the return control`).toBe(false);
          expect(inside(card, seen.panel), `card of ${id} inside the panel`).toBe(true);
          expect(inside(card, vp), `card of ${id} inside the viewport`).toBe(true);
          if (seen.settings !== null) expect(overlaps(card, seen.settings, 0.5), `card of ${id} and Settings`).toBe(false);
        }
        expect(await scrolls(page), "no scroll with a card shown").toBe(false);
        expect(app.errors).toEqual([]);
      } finally {
        await app.close();
      }
    });
  }
}

test("an empty history shows both empty-state lines and no Tab stop in the Groups", async ({ browser }) => {
  const app = await openGraveyardApp(browser, { fixture: graveyardFixture("idle-empty", "idle", []) });
  try {
    const { page } = app;
    await openView(page);
    await expect(page.locator("#graveyard-stones .empty")).toHaveText(STRINGS.graveyard.noStones);
    await expect(page.locator("#graveyard-shelf .empty")).toHaveText(STRINGS.graveyard.noStubs);
    expect(await page.locator("#graveyard button.item").count()).toBe(0);
    // The view opens on the return control (no Group has a stop); Tab goes to Settings and back.
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("graveyard-back");
    const stops: string[] = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      stops.push(await page.evaluate(() => document.activeElement?.id ?? ""));
    }
    // "" is the focus leaving the page between two cycles of the Tab order.
    expect(new Set(stops.filter((id) => id !== "")), JSON.stringify(stops)).toEqual(new Set(["graveyard-back", "settings-button"]));
    expect(await scrolls(page)).toBe(false);
  } finally {
    await app.close();
  }
});
