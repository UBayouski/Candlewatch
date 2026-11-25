/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect, test } from "@playwright/test";
import { ghostArea, ghostGuards, placeGhost, planGhosts } from "../src/ghosts/place";
import { placeControls } from "../src/ui/layout";
import { doorState, ghostShotFixture, graveyardFixture, inside, openGraveyardApp, overlaps, readGhosts, settle, stageOf, toPage } from "./graveyard-fixtures";
import { VIEWPORTS_ART, patch, ratio, rgbAt, roomToPx } from "./room-art-fixtures";
import type { Colour } from "./room-art-fixtures";

const references = [VIEWPORTS_ART[0], VIEWPORTS_ART[3], VIEWPORTS_ART[4], VIEWPORTS_ART[6]];

const composite = (top: Colour, alpha: number, under: Colour): Colour =>
  top.map((channel, i) => channel * alpha + under[i]! * (1 - alpha)) as Colour;

test.describe("room-art E5: ghost placement and still mode", () => {
  for (const viewport of [VIEWPORTS_ART[0], VIEWPORTS_ART[3]]) for (const n of [1, 5, 12, 21]) {
    test(`${viewport.name} ${n} distractions: ghosts rest and drift inside their cells`, async ({ browser }) => {
      const app = await openGraveyardApp(browser, { fixture: ghostShotFixture(n), viewport });
      try {
        const page = app.page, s = await stageOf(page);
        const layout = placeControls(viewport.width, viewport.height);
        const plan = planGhosts(layout);
        const clear = ghostGuards(layout).guards.map(r => toPage(r, s));
        const controls = await page.locator("#ui button:visible, #ui input:visible").evaluateAll((nodes) => nodes.map((el) => {
          const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height };
        }));
        const seen = await readGhosts(page);
        expect(seen.ghosts).toHaveLength(Math.min(n, 12));
        for (const g of seen.ghosts) {
          const at = placeGhost(plan, g.slot, g.index, g.size)!;
          expect(g.rest.x).toBeCloseTo(at.x, 6);
          expect(g.rest.y).toBeCloseTo(at.y, 6);
          expect(g.rest.tilt).toBeCloseTo(at.tilt, 6);
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
            const cell = toPage(ghostArea(plan.anchors[g.slot]!, plan.halfWidth, plan.halfHeight), s);
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
        const plan = planGhosts(placeControls(viewport.width, viewport.height));
        const seen = await readGhosts(app.page);
        expect(seen.ghosts).toHaveLength(Math.min(n, 12));
        for (const g of seen.ghosts) {
          const at = placeGhost(plan, g.slot, g.index, g.size)!;
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

test.describe("visual polish: full-size ghosts and compact modal layering", () => {
  for (const viewport of references) for (const n of [12, 21]) {
    test(`${viewport.name}: ${n} full-size distractions`, async ({ browser }, testInfo) => {
      const app = await openGraveyardApp(browser, { fixture: ghostShotFixture(n, 300_000), viewport, reducedMotion: true });
      try {
        const { page } = app;
        const stage = await stageOf(page);
        const layout = placeControls(viewport.width, viewport.height);
        const plan = planGhosts(layout);
        const { ghosts, mark } = await readGhosts(page);
        const scales = await page.locator("#ghost-root .drift").evaluateAll(nodes =>
          nodes.map(node => Number(node.getAttribute("transform")?.match(/scale\(([^)]+)\)/)?.[1])),
        );
        expect(scales).toEqual(Array.from({ length: 12 }, () => plan.maximum));
        expect(ghosts).toHaveLength(12);
        expect(mark.shown).toBe(n > 12);
        if (n > 12) expect(mark.text).toBe("+9");
        const guards = ghostGuards(layout).guards.map(guard => toPage(guard, stage));
        for (const g of ghosts) {
          const area = toPage(ghostArea(plan.anchors[g.slot]!, plan.halfWidth, plan.halfHeight), stage);
          expect(inside(g.rect, area)).toBe(true);
          for (const guard of guards) expect(overlaps(g.rect, guard, 0.5)).toBe(false);
        }
        if (layout.landscapeScene) {
          const span = (axis: "x" | "y") => {
            const sorted = ghosts.map(g => g.rest[axis]).sort((a, b) => a - b);
            return Math.min(...sorted.slice(2).map((value, i) => value - sorted[i]!));
          };
          console.log("D1 resting triple spans", viewport.name, n, span("x"), span("y"));
          expect(span("x")).toBeGreaterThan(60);
          expect(span("y")).toBeGreaterThan(60);
        }
        await page.screenshot({ path: testInfo.outputPath(`full-size-${viewport.name}-${n}.png`) });
      } finally { await app.close(); }
    });
  }

  for (const viewport of references) {
    test(`${viewport.name}: the minimum-size ghost retains its face`, async ({ browser }, testInfo) => {
      const app = await openGraveyardApp(browser, { fixture: ghostShotFixture(1, 0), viewport, reducedMotion: true });
      try {
        const { page } = app;
        const { ghosts } = await readGhosts(page);
        expect(ghosts).toHaveLength(1);
        expect(ghosts[0]!.size).toBe(0.25);
        await expect(page.locator("#ghost-root .eye")).toHaveCount(2);
        await page.screenshot({ path: testInfo.outputPath(`minimum-ghost-${viewport.name}.png`) });
      } finally { await app.close(); }
    });
  }

  for (const [button, panel] of [["settings-button", "settings-dialog"], ["snuff", "snuff-dialog"]] as const) {
    test(`phone: ${panel} covers ghosts in place`, async ({ browser }, testInfo) => {
      const app = await openGraveyardApp(browser, { fixture: ghostShotFixture(21, 300_000), viewport: references[0]! });
      try {
        const { page } = app;
        const ghosts = page.locator("#ghost-root .ghost");
        const nodes = await ghosts.elementHandles();
        const read = () => ghosts.evaluateAll(elements => elements.map(node => [
          node.getAttribute("transform"), node.firstElementChild?.getAttribute("transform"),
          node.getAttribute("data-index"), node.firstElementChild?.getAnimations().length,
        ]));
        const before = await read();
        const unchanged = async () => {
          expect(await read()).toEqual(before);
          expect(await page.evaluate(saved => saved.every((node, i) => node === document.querySelectorAll("#ghost-root .ghost")[i]), nodes)).toBe(true);
          await expect(page.locator("#ghost-root .overflow")).toHaveText("+9");
          await expect(page.locator("#scene")).toHaveAttribute("aria-label", /21 distractions/);
        };
        expect(nodes).toHaveLength(12);
        expect(before.every(g => g[3] === 1)).toBe(true);
        await unchanged();
        await page.locator("#" + button).click();
        await settle(page);
        const dialog = page.locator("#" + panel);
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveCSS("opacity", "1");
        await unchanged();
        const cover = await dialog.evaluate(node => {
          const panelRect = node.getBoundingClientRect();
          const background = getComputedStyle(node).backgroundColor;
          const covered = [...document.querySelectorAll("#ghost-root .ghost")].some(ghost => {
            const rect = ghost.getBoundingClientRect();
            const x = (Math.max(rect.left, panelRect.left) + Math.min(rect.right, panelRect.right)) / 2;
            const y = (Math.max(rect.top, panelRect.top) + Math.min(rect.bottom, panelRect.bottom)) / 2;
            return rect.left < panelRect.right && panelRect.left < rect.right && rect.top < panelRect.bottom &&
              panelRect.top < rect.bottom && node.contains(document.elementFromPoint(x, y));
          });
          return { background, covered };
        });
        expect(cover.background).toMatch(/^rgb\(/);
        expect(cover.covered).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(panel + ".png") });
        await page.keyboard.press("Escape");
        await settle(page);
        await expect(dialog).toBeHidden();
        await unchanged();
      } finally { await app.close(); }
    });
  }

  test("resizing replans for the viewport and returns to the same desktop geometry", async ({ browser }) => {
    const desktop = VIEWPORTS_ART[3], phone = VIEWPORTS_ART[0];
    const app = await openGraveyardApp(browser, { fixture: ghostShotFixture(21, 300_000), viewport: desktop, reducedMotion: true });
    try {
      const { page } = app;
      const read = async () => (await readGhosts(page)).ghosts.map(g => ({ index: g.index, rest: g.rest }));
      const original = await read();
      await page.setViewportSize(phone);
      await expect.poll(async () => {
        await settle(page);
        return page.locator("#scene").getAttribute("data-landscape");
      }).toBeNull();
      const compact = await read();
      expect(compact.map(g => g.index)).toEqual(original.map(g => g.index));
      expect(compact.map(g => g.rest)).not.toEqual(original.map(g => g.rest));
      await page.setViewportSize(desktop);
      await expect.poll(async () => {
        await settle(page);
        return read();
      }).toEqual(original);
      await expect(page.locator("#ghost-root .overflow")).toHaveText("+9");
    } finally { await app.close(); }
  });

  for (const viewport of references) for (const phase of ["lit", "burned-out", "snuffed"] as const) {
    test(`${viewport.name}: ${phase} ghost contrast across the swept areas`, async ({ browser }) => {
      const fixture = phase === "lit" ? ghostShotFixture(21, 300_000) : graveyardFixture(phase, phase, [], 21);
      const app = await openGraveyardApp(browser, { fixture, viewport, reducedMotion: true });
      try {
        const { page } = app;
        const { mark } = await readGhosts(page);
        expect(mark.text).toBe("+9");
        const markRect = mark.rect!;
        const markFill = await page.locator("#ghost-root .overflow").evaluate(node =>
          getComputedStyle(node).fill.match(/\d+/g)?.map(Number) as Colour,
        );
        const before = await page.locator("#ghost-root .body").first().evaluate(body => {
          const rgb = (value: string) => value.match(/\d+/g)?.map(Number) as Colour;
          const style = getComputedStyle(body);
          const eye = body.parentElement!.querySelector(".eye")!;
          return {
            stroke: rgb(style.stroke), strokeAlpha: Number(style.strokeOpacity),
            fill: rgb(style.fill), fillAlpha: Number(style.fillOpacity), eye: rgb(getComputedStyle(eye).fill),
          };
        });
        await page.locator("#ghost-root svg").evaluate(node => node.setAttribute("visibility", "hidden"));
        const bare = await page.screenshot();
        const stage = await stageOf(page);
        const plan = planGhosts(placeControls(viewport.width, viewport.height));
        let outline = Infinity;
        let eyes = Infinity;
        for (const anchor of plan.anchors) {
          const area = toPage(ghostArea(anchor, plan.halfWidth, plan.halfHeight), stage);
          for (let y = Math.ceil(area.y); y < area.y + area.h; y++) {
            for (let x = Math.ceil(area.x); x < area.x + area.w; x++) {
              const room = rgbAt(bare, x, y);
              outline = Math.min(outline, ratio(composite(before.stroke, before.strokeAlpha, room), room));
              eyes = Math.min(eyes, ratio(before.eye, composite(before.fill, before.fillAlpha, room)));
            }
          }
        }
        let overflow = Infinity;
        for (let y = Math.ceil(markRect.y); y < markRect.y + markRect.h; y++) {
          for (let x = Math.ceil(markRect.x); x < markRect.x + markRect.w; x++) {
            overflow = Math.min(overflow, ratio(markFill, rgbAt(bare, x, y)));
          }
        }
        console.log("D1 contrast floors", viewport.name, phase, outline.toFixed(2), eyes.toFixed(2), overflow.toFixed(2));
        expect(outline).toBeGreaterThanOrEqual(3);
        expect(eyes).toBeGreaterThanOrEqual(3);
        expect(overflow).toBeGreaterThanOrEqual(4.5);
      } finally { await app.close(); }
    });
  }
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
