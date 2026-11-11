// E4 and E5: the ghosts in the room (ghosts-and-graveyard R9, R10, R11.10; tasks 23.1 and 24.1).
// Distractions are made two ways: stored in the session before the page loads (the counts 0, 1, 12 and 21), and live, by hiding and
// showing the page through its own visibilitychange listener while a candle burns (see `setVisibility` for why it is overridden).
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { ghostSize } from "../src/engine";
import { DOOR_RECT, GHOST_CELLS, KEEP_CLEAR_COLUMN_UNITS } from "../src/ui/layout";
import {
  distract,
  graveyardFixture,
  openGraveyardApp,
  openView,
  overlaps,
  inside,
  press,
  rawSession,
  readGhosts,
  settle,
  smallHistory,
  stageOf,
  storedState,
  toPage,
  viewOf,
  withDistractions,
} from "./graveyard-fixtures";
import type { Rect, Stage } from "./graveyard-fixtures";

test.describe.configure({ mode: "parallel" });

const G = 12;

/** The scene label's count, written out: "1 distraction", "21 distractions" (R10.1). */
const countText = (n: number): string => (n === 1 ? "1 distraction" : `${n} distractions`);
const sceneLabel = (page: Page): Promise<string | null> => page.locator("#scene").getAttribute("aria-label");

/** The boxes the ghosts and the mark must keep clear of: the candle column, the Floor_Band (room y 900 down), the Door. */
function keepClear(s: Stage, vh: number): { label: string; rect: Rect }[] {
  const floorTop = s.oy + 900 * s.scale;
  return [
    { label: "candle column", rect: toPage(KEEP_CLEAR_COLUMN_UNITS, s) },
    { label: "Floor_Band", rect: { x: 0, y: floorTop, w: 100_000, h: Math.max(0, vh - floorTop) } },
    { label: "Door", rect: toPage(DOOR_RECT, s) },
  ];
}

/** The visible setup controls (length chooser, intent, Light) in the ended phases. */
const setupRects = (page: Page): Promise<{ label: string; rect: Rect }[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll("#setup button, #setup input, #setup label, #light")]
      .filter((el) => el.checkVisibility())
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { label: el.id || el.tagName, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
      })
      .filter((b) => b.rect.w > 0 && b.rect.h > 0),
  );

/** The ghost layer's running animations and transitions. */
const layerAnimations = (page: Page): Promise<number> => page.evaluate(() => document.querySelector("#ghost-root svg")?.getAnimations({ subtree: true }).length ?? -1);

// --- E4 --------------------------------------------------------------------------------

test.describe("E4: one ghost per distraction, the newest G, and the mark", () => {
  for (const n of [0, 1, 12, 21]) {
    for (const phase of ["lit", "burned-out", "snuffed"] as const) {
      test(`${n} distractions, ${phase}: ${Math.min(n, G)} ghosts, ${n > G ? `the mark +${n - G}` : "no mark"}, the label, and nothing overlaps`, async ({ browser }) => {
        const app = await openGraveyardApp(browser, { fixture: withDistractions(n, phase, smallHistory) });
        try {
          const { page } = app;
          const state = await storedState(page);
          expect(state.phase).toBe(phase);
          const spans = state.phase === "idle" ? [] : state.session.awaySpansMs;
          expect(spans).toHaveLength(n);

          const seen = await readGhosts(page);
          expect(seen.ghosts).toHaveLength(Math.min(n, G));
          expect(seen.mark.shown).toBe(n > G);
          if (n > G) expect(seen.mark.text).toBe(`+${n - G}`);
          // The newest G are drawn, each with the size of its own span.
          expect(seen.ghosts.map((g) => g.index).sort((a, b) => a - b)).toEqual(Array.from({ length: Math.min(n, G) }, (_, i) => Math.max(0, n - G) + i));
          for (const g of seen.ghosts) expect(g.size).toBeCloseTo(ghostSize(spans[g.index] ?? NaN), 6);
          expect(new Set(seen.ghosts.map((g) => g.slot)).size).toBe(seen.ghosts.length);

          const label = await sceneLabel(page);
          expect(label?.endsWith(` ${countText(n)}.`), `${label}`).toBe(true);

          const s = await stageOf(page);
          const vh = await page.evaluate(() => window.innerHeight);
          const boxes = [...seen.ghosts.map((g) => ({ label: `ghost ${g.index} (slot ${g.slot})`, rect: g.rect })), ...(seen.mark.rect ? [{ label: "mark", rect: seen.mark.rect }] : [])];
          const clear = [...keepClear(s, vh), ...(phase === "lit" ? [] : await setupRects(page))];
          if (phase !== "lit") expect(clear.length).toBeGreaterThan(3);
          for (const [i, a] of boxes.entries()) {
            for (const c of clear) expect(overlaps(a.rect, c.rect, 0.5), `${a.label} overlaps ${c.label}`).toBe(false);
            for (const b of boxes.slice(i + 1)) expect(overlaps(a.rect, b.rect, 0.5), `${a.label} overlaps ${b.label}`).toBe(false);
          }
          expect(app.errors).toEqual([]);
        } finally {
          await app.close();
        }
      });
    }
  }

  test("idle: no ghost and no mark, and the label says 0 distractions", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: graveyardFixture("idle-small", "idle", smallHistory) });
    try {
      const seen = await readGhosts(app.page);
      expect(seen.ghosts).toHaveLength(0);
      expect(seen.leaving).toBe(0);
      expect(seen.mark.shown).toBe(false);
      expect((await sceneLabel(app.page))?.endsWith(` ${countText(0)}.`)).toBe(true);
    } finally {
      await app.close();
    }
  });

  test("live hide and show: each distraction adds a ghost, sized by its time away, and the label follows", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: withDistractions(0, "lit") });
    try {
      const { page } = app;
      const aways = [2_000, 30_000, 120_000];
      for (const [i, away] of aways.entries()) {
        await distract(page, away);
        const seen = await readGhosts(page);
        expect(seen.ghosts).toHaveLength(i + 1);
        expect((await sceneLabel(page))?.endsWith(` ${countText(i + 1)}.`)).toBe(true);
      }
      const state = await storedState(page);
      expect(state.phase === "lit" ? state.session.awaySpansMs : []).toEqual(aways);
      const sizes = [...(await readGhosts(page)).ghosts].sort((a, b) => a.index - b.index).map((g) => g.size);
      expect(sizes[0]).toBeLessThan(sizes[1] ?? 0);
      expect(sizes[1]).toBeLessThan(sizes[2] ?? 0);
      // A hidden page that comes back to a paused candle adds nothing (the engine counts distractions only while lit).
      await press(page, "Space");
      expect((await storedState(page)).phase).toBe("paused");
      await distract(page, 10_000);
      expect((await readGhosts(page)).ghosts).toHaveLength(3);
      expect((await sceneLabel(page))?.endsWith(` ${countText(3)}.`)).toBe(true);
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test("live: from 12 to 22 distractions every other ghost keeps its slot; past G the oldest fades and the new one takes its slot", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: withDistractions(11, "lit") });
    try {
      const { page } = app;
      await setLayerProbe(page);
      for (let target = 12; target <= 22; target++) {
        await page.clock.runFor(1_000); // the fade's safety timer of the previous step has run
        await settle(page);
        const before = await readGhosts(page);
        await page.evaluate(() => ((window as unknown as { __ghostLeaving: number[] }).__ghostLeaving.length = 0));
        await distract(page, 5_000);
        const after = await readGhosts(page);
        const state = await storedState(page);
        expect(state.phase === "lit" ? state.session.distractions : -1).toBe(target);
        expect(after.ghosts).toHaveLength(Math.min(target, G));
        expect(after.mark.shown).toBe(target > G);
        if (target > G) expect(after.mark.text).toBe(`+${target - G}`);
        const slotOf = new Map(before.ghosts.map((g) => [g.index, g.slot]));
        for (const g of after.ghosts) if (slotOf.has(g.index)) expect(g.slot, `ghost ${g.index} kept its slot`).toBe(slotOf.get(g.index));
        const leaving = await page.evaluate(() => (window as unknown as { __ghostLeaving: number[] }).__ghostLeaving);
        if (target > G) {
          const oldest = Math.min(...before.ghosts.map((g) => g.index));
          expect(after.ghosts.some((g) => g.index === oldest)).toBe(false);
          expect(after.ghosts.find((g) => g.index === target - 1)?.slot, "the new ghost takes the oldest's slot").toBe(slotOf.get(oldest));
          expect(leaving, "the oldest, and only it, fades out").toEqual([oldest]);
        } else {
          expect(leaving).toEqual([]);
        }
        expect((await sceneLabel(page))?.endsWith(` ${countText(target)}.`)).toBe(true);
      }
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
// --- E5 --------------------------------------------------------------------------------

test.describe("E5: reduced motion, the drift, ghosts off and the view", () => {
  test("reduced motion: no animation on the layer; a ghost appears and the oldest leaves at once", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: withDistractions(12, "lit"), reducedMotion: true });
    try {
      const { page } = app;
      expect(await layerAnimations(page)).toBe(0);
      await setLayerProbe(page);
      await distract(page, 5_000);
      const seen = await readGhosts(page);
      expect(seen.ghosts).toHaveLength(G);
      expect(seen.leaving, "the oldest is gone, not fading").toBe(0);
      expect(await page.evaluate(() => (window as unknown as { __ghostLeaving: number[] }).__ghostLeaving), "no fade out").toEqual([]);
      expect(seen.mark.text).toBe("+1");
      expect(await layerAnimations(page)).toBe(0);
      // Every ghost added was fully opaque the moment it was inserted: no fade in (read by the probe at insertion time).
      expect(await page.evaluate(() => (window as unknown as { __ghostOpacity: string[] }).__ghostOpacity)).toEqual(["1"]);
    } finally {
      await app.close();
    }
  });

  test("the still version shows the same ghosts, sizes, slots and mark as the moving one", async ({ browser }) => {
    const read = async (reducedMotion: boolean) => {
      const app = await openGraveyardApp(browser, { fixture: withDistractions(21, "lit"), reducedMotion });
      try {
        const seen = await readGhosts(app.page);
        return { ghosts: seen.ghosts.map((g) => ({ slot: g.slot, index: g.index, size: g.size })), mark: seen.mark.text, label: await sceneLabel(app.page), moving: await layerAnimations(app.page) };
      } finally {
        await app.close();
      }
    };
    const moving = await read(false);
    const still = await read(true);
    expect(moving.moving).toBeGreaterThan(0);
    expect(still.moving).toBe(0);
    expect(still.ghosts).toEqual(moving.ghosts);
    expect(still.mark).toBe(moving.mark);
    expect(still.label).toBe(moving.label);
  });

  test("with motion, every ghost drifts inside its own cell over the whole drift cycle, clear of the candle and the floor", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: withDistractions(12, "lit") });
    try {
      const { page } = app;
      const s = await stageOf(page);
      const vh = await page.evaluate(() => window.innerHeight);
      // The drift is a CSS animation, not run by page.clock: each one is paused and set to 24 points of its cycle in turn.
      for (let k = 0; k <= 24; k++) {
        const boxes = await page.evaluate((f) => {
          const out: { slot: number; rect: { x: number; y: number; w: number; h: number } }[] = [];
          for (const g of document.querySelectorAll("#ghost-root .ghost")) {
            const drift = g.querySelector(".drift");
            for (const a of drift?.getAnimations() ?? []) {
              const timing = a.effect?.getComputedTiming();
              const duration = Number(timing?.duration ?? 0);
              a.pause();
              a.currentTime = f * duration * 2; // alternate: two durations are one full cycle
            }
            const r = g.getBoundingClientRect();
            out.push({ slot: Number(g.getAttribute("data-slot")), rect: { x: r.x, y: r.y, w: r.width, h: r.height } });
          }
          return out;
        }, k / 24);
        expect(boxes).toHaveLength(G);
        for (const b of boxes) {
          const cell = GHOST_CELLS[b.slot === undefined ? -1 : b.slot % 2 === 0 ? b.slot / 2 : 6 + (b.slot - 1) / 2];
          expect(cell, `slot ${b.slot}`).toBeDefined();
          if (cell === undefined) continue;
          expect(inside(b.rect, toPage(cell, s), 0.5), `slot ${b.slot} at ${k}/24 inside its cell`).toBe(true);
          for (const c of keepClear(s, vh)) expect(overlaps(b.rect, c.rect, 0.5), `slot ${b.slot} and ${c.label}`).toBe(false);
        }
      }
    } finally {
      await app.close();
    }
  });

  test("ghosts off: no ghost and no mark, the label keeps the count, and switching sends no engine event", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: withDistractions(14, "burned-out") });
    try {
      const { page } = app;
      expect((await readGhosts(page)).ghosts).toHaveLength(G);
      const session = await rawSession(page);
      await page.locator("#settings-button").click();
      await settle(page);
      await page.locator("#ghosts").click();
      await settle(page);
      const off = await readGhosts(page);
      expect(off.ghosts).toHaveLength(0);
      expect(off.leaving).toBe(0);
      expect(off.mark.shown).toBe(false);
      expect((await sceneLabel(page))?.endsWith(` ${countText(14)}.`)).toBe(true);
      await page.locator("#ghosts").click();
      await settle(page);
      const on = await readGhosts(page);
      expect(on.ghosts).toHaveLength(G);
      expect(on.mark.text).toBe("+2");
      expect(await rawSession(page)).toBe(session);
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test("ghosts off during a session: a live distraction is still counted in the label and drawn once the setting is back on", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: withDistractions(2, "lit"), settings: JSON.stringify({ v: 1, sound: false, ghosts: false, defaultLength: 25 }) });
    try {
      const { page } = app;
      expect((await readGhosts(page)).ghosts).toHaveLength(0);
      await distract(page, 20_000);
      expect((await readGhosts(page)).ghosts).toHaveLength(0);
      expect((await sceneLabel(page))?.endsWith(` ${countText(3)}.`)).toBe(true);
      await page.locator("#settings-button").click();
      await settle(page);
      await page.locator("#ghosts").click();
      await settle(page);
      expect((await readGhosts(page)).ghosts).toHaveLength(3);
    } finally {
      await app.close();
    }
  });

  for (const reducedMotion of [false, true]) {
    test(`the ghost layer draws nothing while the view is open, and the view opens and closes with no transition (${reducedMotion ? "reduced" : "motion"})`, async ({ browser }) => {
      const app = await openGraveyardApp(browser, { fixture: withDistractions(3, "snuffed", smallHistory), reducedMotion });
      try {
        const { page } = app;
        expect((await readGhosts(page)).ghosts).toHaveLength(3);
        await openView(page);
        expect(await viewOf(page)).toBe("graveyard");
        expect((await readGhosts(page)).ghosts).toHaveLength(0);
        expect(await page.evaluate(() => document.querySelector("#graveyard")?.getAnimations({ subtree: true }).length)).toBe(0);
        await press(page, "g");
        expect(await viewOf(page)).toBe("room");
        expect(await page.evaluate(() => document.querySelector("#graveyard")?.getAnimations({ subtree: true }).length)).toBe(0);
        expect((await readGhosts(page)).ghosts).toHaveLength(3);
      } finally {
        await app.close();
      }
    });
  }
});

/**
 * Records, as they happen, the computed opacity of every ghost group the moment it is inserted (`window.__ghostOpacity`) and the
 * index of every group that gets the class `leaving`, the start of its fade (`window.__ghostLeaving`). The fade itself runs on the
 * compositor's clock, not page.clock, so it is read by its start, not by waiting.
 */
async function setLayerProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __ghostOpacity: string[]; __ghostLeaving: number[] };
    w.__ghostOpacity = [];
    w.__ghostLeaving = [];
    const svg = document.querySelector("#ghost-root svg");
    if (svg === null) return;
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) if (n instanceof SVGGElement && n.classList.contains("ghost")) w.__ghostOpacity.push(getComputedStyle(n).opacity);
        if (r.type === "attributes" && r.target instanceof SVGGElement && r.target.classList.contains("leaving") && !(r.oldValue ?? "").includes("leaving")) {
          w.__ghostLeaving.push(Number(r.target.getAttribute("data-index")));
        }
      }
    }).observe(svg, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"], attributeOldValue: true });
  });
}