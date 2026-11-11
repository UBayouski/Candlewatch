// Settings in a real browser (controls-and-access R11, E7).
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { SETTINGS_KEY } from "../src/storage/settings";
import { FIXTURES, openApp, phaseOf, press, rawSession, settle, timeText } from "./controls-fixtures";

const stored = (page: Page): Promise<unknown> => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null") as unknown, SETTINGS_KEY);
const checked = (page: Page, id: "sound" | "ghosts"): Promise<string | null> => page.locator(`#${id}`).getAttribute("aria-checked");

async function openPanel(page: Page): Promise<void> {
  await page.locator("#settings-button").click();
  await settle(page);
}
async function closePanel(page: Page): Promise<void> {
  await page.locator("#close").click();
  await settle(page);
}

test("each setting is kept across a reload", async ({ browser }) => {
  const app = await openApp(browser);
  try {
    const { page } = app;
    expect(await stored(page)).toBeNull();
    await openPanel(page);
    expect(await checked(page, "sound")).toBe("true");
    expect(await checked(page, "ghosts")).toBe("true");
    await page.locator("#sound").click();
    await page.locator("#ghosts").click();
    await page.locator("#default-length .cell[data-minutes='50']").click();
    await settle(page);
    expect(await stored(page)).toEqual({ v: 1, sound: false, ghosts: false, defaultLength: 50 });
    await closePanel(page);
    await page.reload();
    await settle(page);
    await openPanel(page);
    expect(await checked(page, "sound")).toBe("false");
    expect(await checked(page, "ghosts")).toBe("false");
    await expect(page.locator("#sound")).toContainText("Off");
    await expect(page.locator("#default-length .cell[data-minutes='50']")).toHaveAttribute("aria-checked", "true");
    // A custom default length.
    await page.locator("#default-length-custom").fill("40");
    await settle(page);
    expect(await stored(page)).toEqual({ v: 1, sound: false, ghosts: false, defaultLength: 40 });
    await closePanel(page);
    await page.reload();
    await settle(page);
    expect(await timeText(page)).toBe("40:00");
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test("the default length is the chooser's first selection, and a change while idle updates the main chooser until the user chooses", async ({ browser }) => {
  let app = await openApp(browser, { settings: JSON.stringify({ v: 1, sound: true, ghosts: true, defaultLength: 50 }) });
  try {
    const { page } = app;
    await expect(page.getByRole("radio", { name: "50 minutes" })).toHaveAttribute("aria-checked", "true");
    expect(await timeText(page)).toBe("50:00");
  } finally {
    await app.close();
  }
  app = await openApp(browser, { settings: JSON.stringify({ v: 1, sound: true, ghosts: true, defaultLength: 40 }) });
  try {
    const { page } = app;
    expect(await timeText(page)).toBe("40:00");
    expect(await page.locator("#length-custom").inputValue()).toBe("40");
  } finally {
    await app.close();
  }
  app = await openApp(browser);
  try {
    const { page } = app;
    expect(await timeText(page)).toBe("25:00");
    await openPanel(page);
    await page.locator("#default-length .cell[data-minutes='15']").click();
    await settle(page);
    await closePanel(page);
    expect(await timeText(page)).toBe("15:00");
    await expect(page.getByRole("radio", { name: "15 minutes" })).toHaveAttribute("aria-checked", "true");
    // After the user has chosen a length, a new default no longer moves it.
    await page.getByRole("radio", { name: "50 minutes" }).click();
    await settle(page);
    await openPanel(page);
    await page.locator("#default-length .cell[data-minutes='25']").click();
    await settle(page);
    await closePanel(page);
    expect(await timeText(page)).toBe("50:00");
  } finally {
    await app.close();
  }
});

test("invalid stored settings give the defaults", async ({ browser }) => {
  for (const text of ["garbage", "[]", JSON.stringify({ v: 2, sound: false }), JSON.stringify({ v: 1, sound: "no", ghosts: 3, defaultLength: 4 })]) {
    const app = await openApp(browser, { settings: text });
    try {
      const { page } = app;
      await openPanel(page);
      expect(await checked(page, "sound"), text).toBe("true");
      expect(await checked(page, "ghosts"), text).toBe("true");
      await expect(page.locator("#default-length .cell[data-minutes='25']"), text).toHaveAttribute("aria-checked", "true");
      expect(await timeText(page), text).toBe("25:00");
      expect(app.errors, text).toEqual([]);
    } finally {
      await app.close();
    }
  }
  // A field that is valid is kept; the others fall back.
  const app = await openApp(browser, { settings: JSON.stringify({ v: 1, sound: false, ghosts: "x", defaultLength: 90 }) });
  try {
    const { page } = app;
    await openPanel(page);
    expect(await checked(page, "sound")).toBe("false");
    expect(await checked(page, "ghosts")).toBe("true");
    expect(await page.locator("#default-length-custom").inputValue()).toBe("90");
  } finally {
    await app.close();
  }
});

test("a localStorage that throws on read and on write leaves the page and the settings working in memory", async ({ browser }) => {
  const app = await openApp(browser, {
    initScripts: [
      `Storage.prototype.getItem = function () { throw new Error("blocked"); };
       Storage.prototype.setItem = function () { throw new Error("full"); };
       Storage.prototype.removeItem = function () { throw new Error("blocked"); };`,
    ],
  });
  try {
    const { page } = app;
    await expect(page.locator("#light")).toBeVisible();
    await openPanel(page);
    await page.locator("#sound").click();
    await settle(page);
    expect(await checked(page, "sound")).toBe("false");
    await closePanel(page);
    await openPanel(page);
    expect(await checked(page, "sound")).toBe("false"); // kept in memory for the page's life
    await closePanel(page);
    // A candle can still be lit and burns, though nothing is saved.
    await page.locator("#light").focus();
    await press(page, "Enter");
    expect(await phaseOf(page)).toBe("lit");
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test("changing a setting during a lit session changes neither the timer, the phase nor the stored session", async ({ browser }) => {
  const app = await openApp(browser, { fixture: FIXTURES.litHalf });
  try {
    const { page } = app;
    const raw = await rawSession(page);
    expect(raw).not.toBeNull();
    const phase = await phaseOf(page);
    await openPanel(page);
    await page.locator("#sound").click();
    await page.locator("#ghosts").click();
    await page.locator("#default-length .cell[data-minutes='50']").click();
    await settle(page);
    expect(await phaseOf(page)).toBe(phase);
    expect(await rawSession(page)).toBe(raw);
    await closePanel(page);
    expect(await phaseOf(page)).toBe("lit");
    expect(await rawSession(page)).toBe(raw);
    // The timer follows the clock only: the same clock, the same text.
    expect(await timeText(page)).toBe("12:30");
    expect(await stored(page)).toEqual({ v: 1, sound: false, ghosts: false, defaultLength: 50 });
  } finally {
    await app.close();
  }
});
