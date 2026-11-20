// Proof for candle-scene task 1 (design P6): Playwright specs can import the engine and the
// storage adapter, build a stored session in Node, and put it in localStorage before the page loads.
import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { INITIAL_STATE, serializeHistory, serializeSession, step } from "../src/engine";
import { HISTORY_KEY, SESSION_KEY } from "../src/storage/storage";

const T0 = Date.UTC(2026, 10, 10, 20, 0, 0);

test("no shipped file imports the room-art browser fixture", () => {
  const visit = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? visit(join(dir, entry.name)) : [join(dir, entry.name)]);
  for (const file of visit(join(process.cwd(), "src"))) {
    if (!/\.(?:ts|css)$/.test(file) || /\.(?:test|spec)\.ts$/.test(file)) continue;
    expect(readFileSync(file, "utf8"), file).not.toContain("room-art-fixtures");
  }
});

// Guard for the pause-first clock order (tech.md, e2e clock rule). The docs recommend install, load, pauseAt; the fixtures call pauseAt first
// and rely on it installing the fake clock (Playwright 1.65.0). If this fails after an upgrade, move the fixtures to the documented order.
test("pauseAt as the first clock call installs the clock: Date.now is the paused time and stays put", async ({ page }) => {
  const paused = Date.UTC(2026, 10, 10, 20, 0, 0);
  await page.clock.pauseAt(paused);
  await page.goto("/");
  const first = await page.evaluate(() => Date.now());
  await new Promise((resolve) => setTimeout(resolve, 300)); // a real wait: a running clock would move
  const second = await page.evaluate(() => Date.now());
  const message = "pauseAt no longer installs the clock when it is the first clock call; the fixtures need the documented order (install slightly early, load, then pauseAt)";
  expect(first, message).toBe(paused);
  expect(second, message).toBe(paused);
});

test("fixtures can be built in Node from the engine and storage modules", async ({ page }) => {
  const state = step(INITIAL_STATE, { type: "light", length: 25 }, T0);
  const session = serializeSession(state);
  const history = serializeHistory(state.history);
  expect(session).not.toBeNull();
  expect(SESSION_KEY).toBe("candlewatch:session");
  expect(HISTORY_KEY).toBe("candlewatch:history");

  await page.addInitScript(
    ({ sessionKey, historyKey, sessionText, historyText }) => {
      localStorage.setItem(sessionKey, sessionText);
      localStorage.setItem(historyKey, historyText);
    },
    { sessionKey: SESSION_KEY, historyKey: HISTORY_KEY, sessionText: session ?? "", historyText: history },
  );
  await page.clock.install({ time: T0 }); // the page sees the same instant the session started
  await page.goto("/");

  const stored = await page.evaluate(
    ([sessionKey, historyKey]) => [localStorage.getItem(sessionKey), localStorage.getItem(historyKey)],
    [SESSION_KEY, HISTORY_KEY] as const,
  );
  expect(stored[0]).toBe(session);
  expect(stored[1]).toBe(history);
  expect(JSON.parse(stored[0] ?? "null")).toMatchObject({ v: 2, phase: "lit", session: { lengthMin: 25 } });
});
