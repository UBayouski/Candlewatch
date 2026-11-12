// The graveyard and the Door in a real browser (ghosts-and-graveyard R3, R5, R6, R11.5 to R11.8; tasks 19.1, 20.1, 21.1).
// Every state is a stored session and history written before the page loads, with the clock frozen (R11.3, R11.4).
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { HistoryEntry } from "../src/engine";
import { STRINGS } from "../src/strings";
import { fill, spokenTime } from "../src/ui/format";
import {
  MIN,
  T0,
  VIEWPORTS,
  doorState,
  focused,
  graveyardFixture,
  historyWith,
  itemIds,
  liveTexts,
  openGraveyardApp,
  openView,
  press,
  rawSession,
  settle,
  smallHistory,
  stageOf,
  storedState,
  toPage,
  viewOf,
} from "./graveyard-fixtures";
import type { Fixture } from "./graveyard-fixtures";

test.describe.configure({ mode: "parallel" });

// --- helpers of this file ------------------------------------------------------

/** The ids of every stop Tab reaches from the start of the page, in order, until the order repeats (at most 40 presses). */
async function tabWalk(page: Page): Promise<string[]> {
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  const seen: string[] = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const id = await page.evaluate(() => {
      const el = document.activeElement;
      return el === null || el === document.body ? "" : el.id || el.getAttribute("aria-label") || el.tagName;
    });
    if (id === "" || seen.includes(id)) break;
    seen.push(id);
  }
  return seen;
}

/** The lines of the Details_Card, or null when it is hidden. */
const cardLines = (page: Page): Promise<string[] | null> =>
  page.evaluate(() => {
    const card = document.querySelector<HTMLElement>("#graveyard-card");
    if (card === null || card.hidden) return null;
    return [...card.querySelectorAll(".card-line")].map((l) => l.textContent ?? "");
  });

/**
 * The five card lines for an entry, built from the stored values (not from src/graveyard): the intent or the placeholder, the end
 * day as "<day> <month>" in the browser's own calendar, the planned length, the distractions as digits, the time away in words.
 */
async function expectedLines(page: Page, entry: HistoryEntry): Promise<string[]> {
  const { day, month } = await page.evaluate((t) => {
    const d = new Date(t);
    return { day: d.getDate(), month: d.getMonth() };
  }, entry.endedAt);
  const planned = fill(entry.lengthMin === 1 ? STRINGS.time.minute : STRINGS.time.minutes, { n: entry.lengthMin });
  return [
    entry.intent === null || entry.intent === "" ? STRINGS.graveyard.noIntent : entry.intent,
    `${day} ${STRINGS.graveyard.months[month] ?? ""}`,
    fill(STRINGS.graveyard.card.planned, { time: planned }),
    fill(STRINGS.graveyard.card.distractions, { n: entry.distractions }),
    fill(STRINGS.graveyard.card.away, { time: spokenTime(entry.timeAwayMs) }),
  ];
}

/** The stored entry an Item id names (`startedAt:endedAt:index`, the index in the whole history). */
function entryOfId(history: readonly HistoryEntry[], id: string): HistoryEntry {
  const [started, ended, index] = id.split(":").map(Number);
  const entry = history[index ?? -1];
  if (entry === undefined || entry.startedAt !== started || entry.endedAt !== ended) throw new Error(`no stored entry for item ${id}`);
  return entry;
}

/** A touch tap on an empty corner of the opaque panel (room x 590, y 795): not on an Item, so a tap-away (R5.8). */
async function tapAway(page: Page): Promise<void> {
  const at = toPage({ x: 590, y: 795, w: 0, h: 0 }, await stageOf(page));
  await page.touchscreen.tap(at.x, at.y);
  await settle(page);
}

const activeId = async (page: Page): Promise<string> => (await focused(page)).id;
const groupOf = (page: Page, id: string): Promise<string | null> => page.locator(`[id="${id}"]`).getAttribute("data-group");

const burnedOutSmall = graveyardFixture("burned-out-small", "burned-out", smallHistory);

// --- 19.1: the helpers ----------------------------------------------------------

test.describe("the helpers (task 19.1)", () => {
  test("a stored burned-out session shows the usable Door, and no Item is drawn in the room", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: burnedOutSmall });
    try {
      const { page } = app;
      expect(await doorState(page)).toEqual({ buttonShown: true, shutShown: false });
      await expect(page.getByRole("button", { name: STRINGS.graveyard.door })).toBeVisible();
      expect(await itemIds(page)).toEqual([]);
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test("a stored lit session shows the shut door and no Door button", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: graveyardFixture("lit-small", "lit", smallHistory) });
    try {
      expect(await doorState(app.page)).toEqual({ buttonShown: false, shutShown: true });
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  });
});

// --- E1: the Door ---------------------------------------------------------------

test.describe("E1: the Door follows the phase", () => {
  for (const phase of ["lit", "paused"] as const) {
    test(`${phase}: the Door is shut, Tab never reaches it and g does nothing`, async ({ browser }) => {
      const app = await openGraveyardApp(browser, { fixture: graveyardFixture(`${phase}-small`, phase, smallHistory) });
      try {
        const { page } = app;
        expect(await doorState(page)).toEqual({ buttonShown: false, shutShown: true });
        const stops = await tabWalk(page);
        expect(stops.length).toBeGreaterThanOrEqual(2);
        expect(stops).not.toContain("door");
        expect(await page.locator("#door").isVisible()).toBe(false);
        const session = await rawSession(page);
        const live = await liveTexts(page);
        // From every place a key can be pressed in the room: the body, and each control Tab reaches.
        await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
        await press(page, "g");
        for (const id of stops) {
          await page.locator(`[id="${id}"]`).focus();
          await press(page, "g");
          await press(page, "G");
        }
        expect(await viewOf(page)).toBe("room");
        expect(await itemIds(page)).toEqual([]);
        expect(await liveTexts(page)).toEqual(live);
        expect(await rawSession(page)).toBe(session);
        expect(await doorState(page)).toEqual({ buttonShown: false, shutShown: true });
        expect(app.errors).toEqual([]);
      } finally {
        await app.close();
      }
    });
  }

  for (const phase of ["idle", "burned-out", "snuffed"] as const) {
    test(`${phase}: the Door is a button in the Tab order, between Light and Settings, and opens and closes the view`, async ({ browser }) => {
      const app = await openGraveyardApp(browser, { fixture: graveyardFixture(`${phase}-small`, phase, smallHistory) });
      try {
        const { page } = app;
        expect(await doorState(page)).toEqual({ buttonShown: true, shutShown: false });
        const stops = await tabWalk(page);
        expect(stops.slice(-3)).toEqual(["light", "door", "settings-button"]);
        // A click opens the view; one line is announced; g leaves and the focus is back on the Door.
        const before = (await liveTexts(page)).length;
        await page.locator("#door").click();
        await settle(page);
        expect(await viewOf(page)).toBe("graveyard");
        expect(await doorState(page)).toEqual({ buttonShown: false, shutShown: false });
        expect((await liveTexts(page)).slice(before)).toEqual([STRINGS.graveyard.announceOpen]);
        await press(page, "g");
        expect(await viewOf(page)).toBe("room");
        expect(await activeId(page)).toBe("door");
        expect((await liveTexts(page)).slice(before)).toEqual([STRINGS.graveyard.announceOpen, STRINGS.graveyard.announceLeave]);
        expect(app.errors).toEqual([]);
      } finally {
        await app.close();
      }
    });
  }

  test("the Door opens in the very frame the candle burns out, and the Shelf then shows the new Stub", async ({ browser }) => {
    const lit = graveyardFixture("lit-small", "lit", smallHistory);
    const end = T0 + 25 * MIN;
    const app = await openGraveyardApp(browser, { fixture: lit, now: end - 300 });
    try {
      const { page } = app;
      const frames: { phase: string | null; door: { buttonShown: boolean; shutShown: boolean } }[] = [];
      for (let i = 0; i < 40; i++) {
        await page.clock.runFor(16);
        // One read per frame: the phase the scene shows and the Door flags, taken together between two frames.
        frames.push(
          await page.evaluate(() => {
            const button = document.querySelector<HTMLElement>("#door");
            const shut = document.querySelector<HTMLElement>("#graveyard .door-shut");
            return {
              phase: document.querySelector("#scene")?.getAttribute("data-phase") ?? null,
              door: { buttonShown: button !== null && !button.hidden, shutShown: shut !== null && !shut.hidden },
            };
          }),
        );
      }
      expect(frames.some((f) => f.phase === "lit")).toBe(true);
      expect(frames.some((f) => f.phase === "burned-out")).toBe(true);
      for (const f of frames) {
        if (f.phase === "lit") expect(f.door).toEqual({ buttonShown: false, shutShown: true });
        else expect(f.door).toEqual({ buttonShown: true, shutShown: false });
      }
      // The new entry is the last of the stored history; its Stub is in the Shelf when the view opens with g.
      const history = (await storedState(page)).history;
      const last = history.at(-1);
      expect(last?.outcome).toBe("burned-out");
      expect(last?.endedAt).toBe(end);
      await openView(page);
      expect(await viewOf(page)).toBe("graveyard");
      const newId = `${last?.startedAt}:${last?.endedAt}:${history.length - 1}`;
      expect(await itemIds(page)).toContain(newId);
      expect(await groupOf(page, newId)).toBe("shelf");
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  });
});

// --- E7: the view is UI state only ------------------------------------------------

test.describe("E7: the view is never stored", () => {
  test("a reload with a stored lit session opens in the room", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: graveyardFixture("lit-small", "lit", smallHistory) });
    try {
      const { page } = app;
      expect(await viewOf(page)).toBe("room");
      expect(await itemIds(page)).toEqual([]);
      await expect(page.locator("#graveyard .view")).toBeHidden();
    } finally {
      await app.close();
    }
  });

  test("opening the view writes nothing to storage, and a reload from the open view comes back to the room", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: burnedOutSmall });
    try {
      const { page } = app;
      const storage = (): Promise<Record<string, string>> =>
        page.evaluate(() => Object.fromEntries(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? "").map((k) => [k, localStorage.getItem(k) ?? ""])));
      const before = await storage();
      await openView(page);
      expect(await viewOf(page)).toBe("graveyard");
      await press(page, "ArrowRight");
      expect(await storage()).toEqual(before);
      await page.reload();
      await page.clock.runFor(100);
      await expect(page.locator("#scene")).toHaveAttribute("data-settled", "true");
      expect(await viewOf(page)).toBe("room");
      expect(await itemIds(page)).toEqual([]);
      expect(await doorState(page)).toEqual({ buttonShown: true, shutShown: false });
    } finally {
      await app.close();
    }
  });

  test("a new session cannot be lit while the view is open, and once lit from the room the view stays shut", async ({ browser }) => {
    // The view hides the setup controls and takes the room keys, so the phase change "lit while the view is open" cannot be made from
    // the page; its rule (a lit or paused phase forces the room) is Property 5 (view.prop.test.ts). Here: the way to it is closed.
    const app = await openGraveyardApp(browser, { fixture: burnedOutSmall });
    try {
      const { page } = app;
      await openView(page);
      await expect(page.locator("#light")).toBeHidden();
      expect(await tabWalk(page)).not.toContain("light");
      for (const key of ["Enter", "Space", "t"]) await press(page, key);
      expect((await storedState(page)).phase).toBe("burned-out");
      await press(page, "Escape"); // hides the card of the focused item
      await press(page, "Escape"); // leaves
      expect(await viewOf(page)).toBe("room");
      await page.locator("#light").click();
      await settle(page);
      expect((await storedState(page)).phase).toBe("lit");
      expect(await doorState(page)).toEqual({ buttonShown: false, shutShown: true });
      await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
      await press(page, "g");
      expect(await viewOf(page)).toBe("room");
    } finally {
      await app.close();
    }
  });
});

// --- E2: items by keyboard, cards by tap ----------------------------------------------

/** A history over several shelf rows and two stone rows: 14 entries over 3 days. */
const mediumHistory = historyWith(14);

const E2_FIXTURES: readonly Fixture[] = [burnedOutSmall, graveyardFixture("snuffed-medium", "snuffed", mediumHistory)];

test.describe("E2: every Item by keyboard alone, and its card", () => {
  for (const fixture of E2_FIXTURES) {
    test(`${fixture.name}: Tab, arrows, Home and End reach every drawn Item, and each focus shows its card with the stored values`, async ({ browser }) => {
      const app = await openGraveyardApp(browser, { fixture });
      try {
        const { page } = app;
        const history = (await storedState(page)).history;
        await openView(page);
        const drawn = await itemIds(page);
        expect(drawn.length).toBeGreaterThan(0);
        // The view opens with the focus on the first Group's stop.
        const reached = new Set<string>();
        const visit = async (): Promise<void> => {
          const id = await activeId(page);
          if (!drawn.includes(id)) return;
          if (!reached.has(id)) {
            reached.add(id);
            expect(await cardLines(page), `card of ${id}`).toEqual(await expectedLines(page, entryOfId(history, id)));
          }
        };
        const explore = async (): Promise<void> => {
          // Every item of the Group with the focus: from each one reached, every navigation key (a search over the key graph).
          const queue = [await activeId(page)];
          const done = new Set<string>();
          while (queue.length > 0) {
            const from = queue.shift() ?? "";
            if (done.has(from)) continue;
            done.add(from);
            for (const key of ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"]) {
              await page.locator(`[id="${from}"]`).focus();
              await settle(page);
              await press(page, key);
              await visit();
              const now = await activeId(page);
              expect(await groupOf(page, now), `${key} from ${from} stays in the Group`).toBe(await groupOf(page, from));
              if (!done.has(now)) queue.push(now);
            }
          }
        };
        await visit();
        await explore();
        // Tab moves to the other Group's single stop.
        await page.locator(`[id="${[...reached][0] ?? ""}"]`).focus();
        await press(page, "Tab");
        await visit();
        if (drawn.includes(await activeId(page))) await explore();
        expect([...reached].sort()).toEqual([...drawn].sort());
        expect(app.errors).toEqual([]);
      } finally {
        await app.close();
      }
    });
  }

  test("Escape with a card open hides the card and stays in the view; a second Escape leaves and focuses the Door", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: burnedOutSmall });
    try {
      const { page } = app;
      await openView(page);
      const item = await activeId(page);
      expect((await itemIds(page)).includes(item)).toBe(true);
      expect(await cardLines(page)).not.toBeNull();
      const before = (await liveTexts(page)).length;

      await press(page, "Escape");
      expect(await cardLines(page)).toBeNull();
      expect(await viewOf(page)).toBe("graveyard");
      expect(await activeId(page)).toBe(item);
      expect((await liveTexts(page)).slice(before)).toEqual([]);

      await press(page, "Escape");
      expect(await viewOf(page)).toBe("room");
      expect(await activeId(page)).toBe("door");
      expect((await liveTexts(page)).slice(before)).toEqual([STRINGS.graveyard.announceLeave]);
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test("Enter on an Item shows its card only; Enter, Space and t do nothing to the session in the view", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: burnedOutSmall });
    try {
      const { page } = app;
      await openView(page);
      const item = await activeId(page);
      await press(page, "Escape");
      expect(await cardLines(page)).toBeNull();
      const session = await rawSession(page);
      const before = (await liveTexts(page)).length;
      await press(page, "Enter");
      expect(await cardLines(page)).toEqual(await expectedLines(page, entryOfId((await storedState(page)).history, item)));
      expect(await activeId(page)).toBe(item);
      expect(await viewOf(page)).toBe("graveyard");
      await press(page, "Space");
      await press(page, "t");
      await press(page, "T");
      expect(await viewOf(page)).toBe("graveyard");
      expect(await rawSession(page)).toBe(session);
      expect((await liveTexts(page)).slice(before)).toEqual([]);
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test("hover shows a card without moving the focus, and leaving falls back to the focused Item's card", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: burnedOutSmall });
    try {
      const { page } = app;
      const history = (await storedState(page)).history;
      await openView(page);
      const focusedItem = await activeId(page);
      const other = (await itemIds(page)).find((id) => id !== focusedItem) ?? "";
      await page.locator(`[id="${other}"]`).hover();
      await settle(page);
      expect(await cardLines(page)).toEqual(await expectedLines(page, entryOfId(history, other)));
      expect(await activeId(page)).toBe(focusedItem);
      await page.mouse.move(1, 1);
      await settle(page);
      expect(await cardLines(page)).toEqual(await expectedLines(page, entryOfId(history, focusedItem)));
      expect(await activeId(page)).toBe(focusedItem);
    } finally {
      await app.close();
    }
  });
});

test.describe("a tap leaves the styled colours alone (D20)", () => {
  test("no button or field of the interface has a tap highlight, and a tapped Stone and Stub look the same after the tap", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: burnedOutSmall, viewport: VIEWPORTS.phone, mobile: true });
    try {
      const { page } = app;
      const highlights = (): Promise<string[]> =>
        page.evaluate(() => [...document.querySelectorAll("#ui button, #ui input")].map((el) => `${el.id || el.className}: ${getComputedStyle(el).getPropertyValue("-webkit-tap-highlight-color")}`));
      const room = await highlights();
      expect(room.length).toBeGreaterThan(5);
      for (const h of room) expect(h, h).toMatch(/: rgba\(0, 0, 0, 0\)$/);
      await page.locator("#door").tap();
      await settle(page);
      expect(await viewOf(page)).toBe("graveyard");
      for (const h of await highlights()) expect(h, h).toMatch(/: rgba\(0, 0, 0, 0\)$/);
      await tapAway(page);
      for (const selector of ["#graveyard-stones button.item", "#graveyard-shelf button.item"]) {
        const item = page.locator(selector).first();
        const box = await item.boundingBox();
        expect(box).not.toBeNull();
        if (box === null) continue;
        // The item's own surface: the middle half across and the lower half down (the face below the arch, the stub's wax). The
        // marker ring of the open card (D22) is drawn outside the item and along the Stone's arch, so it is left out.
        const clip = { x: Math.ceil(box.x + box.width / 4), y: Math.ceil(box.y + box.height / 2), width: Math.floor(box.width / 2), height: Math.floor(box.height / 2) - 1 };
        const before = await page.screenshot({ clip, animations: "disabled" });
        await item.tap();
        await settle(page);
        expect(await cardLines(page), `${selector}: the tap showed the card`).not.toBeNull();
        const after = await page.screenshot({ clip, animations: "disabled" });
        expect(after.equals(before), `${selector}: the tapped item's pixels are unchanged`).toBe(true);
        await tapAway(page);
      }
    } finally {
      await app.close();
    }
  });
});

/** The ids of the items that carry the open card's marker, with each one's computed outline. */
const markers = (page: Page): Promise<{ id: string; outline: string }[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll("#graveyard button.item[data-card-open]")].map((el) => {
      const cs = getComputedStyle(el);
      return { id: el.id, outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor} ${cs.outlineOffset}` };
    }),
  );
const RING = "3px solid rgb(239, 230, 207) 3px";

test.describe("the open card's item carries the marker (D22, costume review finding)", () => {
  test("on the phone: a tapped item shows the ivory ring while its card is open, and loses it when the card hides", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: burnedOutSmall, viewport: VIEWPORTS.phone, mobile: true });
    try {
      const { page } = app;
      await page.locator("#door").tap();
      await settle(page);
      await tapAway(page);
      expect(await markers(page)).toEqual([]);
      const ids = await itemIds(page);
      expect(ids.length).toBeGreaterThanOrEqual(2);
      for (const id of ids) {
        await page.locator(`[id="${id}"]`).tap();
        await settle(page);
        expect(await cardLines(page)).not.toBeNull();
        // Exactly the tapped item, drawn with the same ring as the keyboard focus; the tap's own focus draws no ring.
        expect(await markers(page)).toEqual([{ id, outline: RING }]);
        expect(await page.evaluate((i) => document.getElementById(i)?.matches(":focus-visible"), id)).toBe(false);
      }
      const last = ids.at(-1) ?? "";
      await page.locator(`[id="${last}"]`).tap(); // a second tap hides the card
      await settle(page);
      expect(await cardLines(page)).toBeNull();
      expect(await markers(page)).toEqual([]);
      await page.locator(`[id="${ids[0] ?? ""}"]`).tap();
      await settle(page);
      expect(await markers(page)).toHaveLength(1);
      await tapAway(page); // a tap elsewhere hides it
      expect(await cardLines(page)).toBeNull();
      expect(await markers(page)).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test("by keyboard and by hover the marker follows the card, one item at most, and Escape clears it", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: burnedOutSmall });
    try {
      const { page } = app;
      await openView(page);
      const focusedItem = await activeId(page);
      expect(await markers(page)).toEqual([{ id: focusedItem, outline: RING }]);
      const other = (await itemIds(page)).find((id) => id !== focusedItem) ?? "";
      await page.locator(`[id="${other}"]`).hover();
      await settle(page);
      expect((await markers(page)).map((m) => m.id)).toEqual([other]);
      await page.mouse.move(1, 1);
      await settle(page);
      expect((await markers(page)).map((m) => m.id)).toEqual([focusedItem]);
      await press(page, "ArrowRight");
      expect((await markers(page)).map((m) => m.id)).toEqual([await activeId(page)]);
      await press(page, "Escape");
      expect(await cardLines(page)).toBeNull();
      expect(await markers(page)).toEqual([]);
    } finally {
      await app.close();
    }
  });
});

test.describe("E2: every card by tap alone", () => {
  for (const fixture of E2_FIXTURES) {
    test(`${fixture.name}: a tap shows the card, a second tap hides it, a tap elsewhere hides it`, async ({ browser }) => {
      const app = await openGraveyardApp(browser, { fixture, viewport: VIEWPORTS.phone, mobile: true });
      try {
        const { page } = app;
        const history = (await storedState(page)).history;
        await page.locator("#door").tap();
        await settle(page);
        expect(await viewOf(page)).toBe("graveyard");
        // Opening moved the focus to the first stop and showed its card: a tap on the panel clears it, so every card below is a tap's.
        await tapAway(page);
        expect(await cardLines(page)).toBeNull();
        const drawn = await itemIds(page);
        expect(drawn.length).toBeGreaterThan(0);
        for (const id of drawn) {
          await page.locator(`[id="${id}"]`).tap();
          await settle(page);
          expect(await cardLines(page), `tap on ${id}`).toEqual(await expectedLines(page, entryOfId(history, id)));
        }
        const last = drawn.at(-1) ?? "";
        await page.locator(`[id="${last}"]`).tap();
        await settle(page);
        expect(await cardLines(page), "a second tap hides").toBeNull();
        const first = drawn[0] ?? "";
        await page.locator(`[id="${first}"]`).tap();
        await settle(page);
        expect(await cardLines(page)).not.toBeNull();
        await tapAway(page);
        expect(await cardLines(page), "a tap elsewhere hides").toBeNull();
        expect(await viewOf(page)).toBe("graveyard");
        expect(app.errors).toEqual([]);
      } finally {
        await app.close();
      }
    });
  }
});
