/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect, test } from "@playwright/test";
import { placeGhost } from "../src/ghosts/place";
import { DOOR_RECT, GHOST_CELLS, KEEP_CLEAR_COLUMN_UNITS } from "../src/ui/layout";
import { doorState, ghostShotFixture, graveyardFixture, inside, openGraveyardApp, overlaps, readGhosts, stageOf, toPage } from "./graveyard-fixtures";
import { VIEWPORTS_ART, patch, roomToPx } from "./room-art-fixtures";

const cellOf = (slot: number) => GHOST_CELLS[slot % 2 === 0 ? slot / 2 : 6 + (slot - 1) / 2]!;

test.describe("room-art E5: ghost placement and still mode", () => {
  for (const viewport of [VIEWPORTS_ART[0], VIEWPORTS_ART[3]]) for (const n of [1, 5, 12, 21]) {
    test(`${viewport.name} ${n} distractions: ghosts rest and drift inside their cells`, async ({ browser }) => {
      const app = await openGraveyardApp(browser, { fixture: ghostShotFixture(n), viewport });
      try {
        const page = app.page, s = await stageOf(page);
        const clear = [KEEP_CLEAR_COLUMN_UNITS, DOOR_RECT].map((r) => toPage(r, s));
        const controls = await page.locator("#ui button:visible, #ui input:visible").evaluateAll((nodes) => nodes.map((el) => {
          const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height };
        }));
        const seen = await readGhosts(page);
        expect(seen.ghosts).toHaveLength(Math.min(n, 12));
        const columnXs = new Map<number, number[]>();
        for (const g of seen.ghosts) {
          const at = placeGhost(g.slot, g.index, g.size);
          expect(g.rest.x).toBeCloseTo(at.x, 6);
          expect(g.rest.y).toBeCloseTo(at.y, 6);
          expect(g.rest.tilt).toBeCloseTo(at.tilt, 6);
          const column = g.slot % 2;
          columnXs.set(column, [...(columnXs.get(column) ?? []), g.rest.x]);
        }
        for (const [column, xs] of columnXs) if (xs.length > 1) {
          console.log("E5", viewport.name, n, "column", column, "rest x", xs);
          expect(new Set(xs).size).toBeGreaterThan(1);
        }
        for (const fraction of [0, 0.5, 1]) {
          const boxes = await page.evaluate((f) => Array.from(document.querySelectorAll("#ghost-root .ghost"), (g) => {
            for (const a of g.querySelector(".drift")?.getAnimations() ?? []) {
              const duration = Number(a.effect?.getComputedTiming().duration ?? 0);
              a.pause(); a.currentTime = f * duration;
            }
            const r = g.getBoundingClientRect();
            return { slot: Number(g.getAttribute("data-slot")), rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
          }), fraction);
          for (const g of boxes) {
            const cell = toPage(cellOf(g.slot), s);
            expect(inside(g.rect, cell, 0.5), `E5 ${viewport.name} ${n} slot ${g.slot} at ${fraction}`).toBe(true);
            for (const forbidden of [...clear, ...controls]) expect(overlaps(g.rect, forbidden, 0.5)).toBe(false);
          }
        }
        expect((await page.locator("#scene").getAttribute("aria-label"))?.includes(`${n} distraction`)).toBe(true);
        console.log("E5", viewport.name, n, "ghosts", seen.ghosts.length, "drift fractions", [0, 0.5, 1]);
      } finally { await app.close(); }
    });
    test(`${viewport.name} ${n} distractions: reduced motion keeps the positions`, async ({ browser }) => {
      const app = await openGraveyardApp(browser, { fixture: ghostShotFixture(n), viewport, reducedMotion: true });
      try {
        const seen = await readGhosts(app.page);
        expect(seen.ghosts).toHaveLength(Math.min(n, 12));
        for (const g of seen.ghosts) {
          const at = placeGhost(g.slot, g.index, g.size);
          expect(g.rest.x).toBeCloseTo(at.x, 6);
          expect(g.rest.y).toBeCloseTo(at.y, 6);
        }
        const animations = await app.page.evaluate(() => document.querySelector("#ghost-root svg")?.getAnimations({ subtree: true }).length ?? -1);
        expect(animations).toBe(0);
        console.log("E5", viewport.name, n, "reduced ghosts", seen.ghosts.length, "animations", animations);
      } finally { await app.close(); }
    });
  }
  for (const viewport of [VIEWPORTS_ART[0], VIEWPORTS_ART[3]]) test(`${viewport.name}: ghosts off preserves the scene count`, async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: ghostShotFixture(5), viewport,
      settings: JSON.stringify({ v: 1, sound: false, ghosts: false, defaultLength: 25 }) });
    try {
      expect((await readGhosts(app.page)).ghosts).toHaveLength(0);
      expect(await app.page.locator("#scene").getAttribute("aria-label")).toContain("5 distractions");
    } finally { await app.close(); }
  });
});

test.describe("room-art E6: the Door tells usable from shut", () => {
  for (const [phase, usable] of [["idle", true], ["lit", false]] as const) {
    test(`${phase}: handle or bar, hit target and keyboard state`, async ({ browser }) => {
      const viewport = VIEWPORTS_ART[0];
      const app = await openGraveyardApp(browser, { fixture: graveyardFixture(`${phase}-door`, phase, []), viewport });
      try {
        const page = app.page;
        expect(await doorState(page)).toEqual({ buttonShown: usable, shutShown: !usable });
        const info = await page.evaluate(() => {
          const button = document.querySelector("#graveyard button.door") as HTMLElement;
          const shut = document.querySelector("#graveyard .door-shut") as HTMLElement;
          const b = button.getBoundingClientRect(), s = shut.getBoundingClientRect();
          const before = getComputedStyle(button, "::before"), handle = getComputedStyle(button, "::after"), bar = getComputedStyle(shut, "::after");
          return { button: { w: b.width, h: b.height }, shut: { w: s.width, h: s.height },
            before: before.display, handle: handle.content, handleBackground: handle.backgroundColor,
            bar: bar.content, barBackground: bar.backgroundColor };
        });
        console.log("E6", phase, info);
        const box = usable ? info.button : info.shut;
        expect(box.w).toBeGreaterThanOrEqual(44);
        expect(box.h).toBeGreaterThanOrEqual(44);
        expect(info.before).toBe("none");
        expect(info.handle).not.toBe("none");
        expect(info.bar).not.toBe("none");
        if (usable) {
          const png = await page.screenshot({ animations: "disabled" });
          const at = roomToPx(viewport.width, viewport.height, 80.5, 850.5);
          const beside = roomToPx(viewport.width, viewport.height, 70, 850.5);
          const handle = patch(png, at.x, at.y), wood = patch(png, beside.x, beside.y);
          const difference = Math.max(...handle.map((v, i) => Math.abs(v - wood[i]!)));
          console.log("E6 handle/wood pixel difference", difference, handle, wood);
          expect(difference).toBeGreaterThan(20);
        } else {
          for (let i = 0; i < 20; i++) {
            await page.keyboard.press("Tab");
            expect(await page.evaluate(() => document.activeElement?.id)).not.toBe("door");
          }
        }
        await page.emulateMedia({ forcedColors: "active" });
        const forced = await page.evaluate(() => ({
          wood: getComputedStyle(document.querySelector(".door-wood") as Element).display,
          border: getComputedStyle(document.querySelector("#graveyard .door-shut") as Element).borderTopColor,
          bar: getComputedStyle(document.querySelector("#graveyard .door-shut") as Element, "::after").backgroundColor,
        }));
        console.log("E6 forced colours", phase, forced);
        expect(forced.wood).toBe("none");
        expect(forced.border).not.toBe("transparent");
        expect(forced.bar).not.toBe("transparent");
      } finally { await app.close(); }
    });
  }
});

test("Q66: forced colours hide room artwork and ghost glow, while eyes use Canvas", async ({ browser }) => {
  const app = await openGraveyardApp(browser, { fixture: ghostShotFixture(5), viewport: VIEWPORTS_ART[0] });
  try {
    await app.page.emulateMedia({ forcedColors: "active" });
    const styles = await app.page.evaluate(() => {
      const display = (selector: string) => getComputedStyle(document.querySelector(selector) as Element).display;
      return { setting: display(".setting"), tint: display(".warm-tint"), wood: display(".door-wood"), stars: display(".stars"),
        glow: display(".ghost-layer .inner-glow"), eyeFill: getComputedStyle(document.querySelector(".ghost-layer .eye") as Element).fill };
    });
    console.log("Q66 forced room/ghost styles", styles);
    for (const key of ["setting", "tint", "wood", "stars", "glow"] as const) expect(styles[key], key).toBe("none");
    expect(styles.eyeFill).not.toBe("none");
  } finally { await app.close(); }
});
