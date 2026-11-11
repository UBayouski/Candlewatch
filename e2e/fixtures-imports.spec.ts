// Proof for candle-scene task 1 (design P6): Playwright specs can import the engine and the
// storage adapter, build a stored session in Node, and put it in localStorage before the page loads.
import { expect, test } from "@playwright/test";
import { INITIAL_STATE, serializeHistory, serializeSession, step } from "../src/engine";
import { HISTORY_KEY, SESSION_KEY } from "../src/storage/storage";

const T0 = Date.UTC(2026, 10, 10, 20, 0, 0);

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
