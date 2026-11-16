import { expect, test } from "@playwright/test";
import { DEFAULT_LIMITS } from "../src/graveyard/visible";
import { DAY, MIN, T0, entryAt, graveyardFixture, largeHistory, liveTexts, openGraveyardApp, openView, press, settle, smallHistory } from "./graveyard-fixtures";

const carvedDates = (page: import("@playwright/test").Page, times: readonly number[]): Promise<string[]> =>
  page.evaluate((values) => values.map((value) => {
    const date = new Date(value);
    return `${date.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()]}`;
  }), times);

test.describe("sound E9: final graveyard wording", () => {
  test("empty view, heading, controls and announcements", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: graveyardFixture("idle-empty", "idle", []) });
    try {
      const { page } = app;
      await expect(page.getByRole("button", { name: "Walk out to the graveyard" })).toBeVisible();
      const before = (await liveTexts(page)).length;
      await openView(page);
      await expect(page.locator("#graveyard")).toMatchAriaSnapshot([
        '- heading "The graveyard" [level=2]',
        '- group "Graveyard":',
        '  - paragraph: Nothing is buried here.',
        '- group "Shelf":',
        '  - paragraph: The shelf is bare.',
        '- button "Back to the room"',
      ].join("\n"));
      await page.locator("#graveyard-back").click();
      await settle(page);
      expect((await liveTexts(page)).slice(before)).toEqual(["The graveyard. Quiet.", "Back in the room."]);
    } finally { await app.close(); }
  });

  test("small history has carved dates and five kind-specific card lines", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: graveyardFixture("idle-small", "idle", smallHistory) });
    try {
      const { page } = app;
      await openView(page);
      const snapshot = await page.locator("#graveyard").ariaSnapshot();
      const dates = await carvedDates(page, smallHistory.map((entry) => entry.endedAt));
      for (const date of dates) expect(snapshot).toContain(date);
      expect(snapshot).not.toMatch(/\b0[1-9] [A-Z][a-z]{2}\b|\b20\d\d\b/);
      expect(snapshot).not.toContain("out of sight");
      for (const item of await page.locator("#graveyard button.item").all()) {
        const name = await item.getAttribute("aria-label");
        expect(name).not.toMatch(/Here lies|Burned to the end/);
        await item.click();
        const lines = await page.locator("#graveyard-card .card-line").allTextContents();
        expect(lines).toHaveLength(5);
        if (await item.evaluate((el) => Boolean(el.closest("#graveyard-stones")))) expect(lines[0]).toMatch(/^Here lies /);
        else expect(lines[0]).toMatch(/^Burned to the end: /);
        expect(lines[1]).toMatch(/^\d{1,2} [A-Z][a-z]{2}$/);
        expect(lines[2]).toMatch(/^Length: /);
        expect(lines[3]).toMatch(/^Distractions: \d+$/);
        expect(lines[4]).toMatch(/^Time away: /);
      }
      expect(snapshot).toContain("an unnamed watch");
    } finally { await app.close(); }
  });

  test("one hidden stone and day use singular count lines", async ({ browser }) => {
    const noon = T0 - 8 * 60 * MIN;
    const history = [
      ...Array.from({ length: DEFAULT_LIMITS.S + 1 }, (_, i) => entryAt({ endedAt: noon - i * MIN, outcome: "snuffed" })),
      ...Array.from({ length: DEFAULT_LIMITS.D + 1 }, (_, i) => entryAt({ endedAt: noon - (i + 1) * DAY })),
    ];
    const app = await openGraveyardApp(browser, { fixture: graveyardFixture("idle-singular", "idle", history) });
    try {
      const { page } = app;
      await openView(page);
      await press(page, "Escape");
      expect(await page.locator("#graveyard-stones").ariaSnapshot()).toContain("1 older stone out of sight");
      expect(await page.locator("#graveyard-shelf").ariaSnapshot()).toContain("1 older day out of sight");
    } finally { await app.close(); }
  });

  test("200 sessions show exact hidden counts, overflow and no zero-padded date", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: graveyardFixture("idle-large", "idle", largeHistory) });
    try {
      const { page } = app;
      await openView(page);
      await press(page, "Escape");
      const snuffed = largeHistory.filter((entry) => entry.outcome === "snuffed").length;
      const stones = await page.locator("#graveyard-stones").ariaSnapshot();
      const shelf = await page.locator("#graveyard-shelf").ariaSnapshot();
      expect(stones).toContain(`${snuffed - 10} older stones out of sight`);
      expect(shelf).toContain("42 older days out of sight");
      expect(stones).not.toMatch(/\b0[1-9] Nov\b/);
    } finally { await app.close(); }
  });

  test("dense day shows exact overflow and both day-width formats", async ({ browser }) => {
    const noon = T0 - 8 * 60 * MIN;
    const hidden = 2;
    const dense = [
      ...Array.from({ length: DEFAULT_LIMITS.K + hidden }, (_, i) => entryAt({ endedAt: noon - 3 * DAY + i * MIN, intent: `Dense ${i}` })),
      entryAt({ endedAt: noon, intent: "Later day" }),
    ];
    const app = await openGraveyardApp(browser, { fixture: graveyardFixture("idle-dense", "idle", dense) });
    try {
      const { page } = app;
      await openView(page);
      const snapshot = await page.locator("#graveyard-shelf").ariaSnapshot();
      const dates = await carvedDates(page, dense.map((entry) => entry.endedAt));
      expect(dates.some((date) => /^\d [A-Z][a-z]{2}$/.test(date))).toBe(true);
      expect(dates.some((date) => /^\d{2} [A-Z][a-z]{2}$/.test(date))).toBe(true);
      for (const date of dates) expect(snapshot).toContain(date);
      expect(snapshot).toContain(`+${hidden} more`);
      expect(snapshot).not.toMatch(/\b0\d [A-Z][a-z]{2}\b|\b20\d\d\b/);
    } finally { await app.close(); }
  });
});
