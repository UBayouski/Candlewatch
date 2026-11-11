// The real build, served the way Render will serve it as far as headers go (hosting R5.3, R8.3, design 6.2).
// Every response gets the headers that render.yaml defines for its path, and the page must still work under
// the Content-Security-Policy: no violation, no console error, no failed request, and the candle still draws.
// A negative control (script-src 'none') proves the test can fail.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { serializeHistory, serializeSession } from "../src/engine";
import { headersFor, readBlueprint } from "../src/hosting/blueprint";
import { HISTORY_KEY, SESSION_KEY } from "../src/storage/storage";
import { FIXTURES } from "./scene-fixtures";

const blueprint = readBlueprint();

interface Seen {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
  readonly failedRequests: string[];
  readonly responses: Map<string, Record<string, string>>;
}

/** Serves every request with the Blueprint's headers added; `change` may rewrite a header value (the negative control). */
async function serveWithHeaders(page: Page, change: (name: string, value: string) => string = (_n, v) => v): Promise<Seen> {
  const seen: Seen = { consoleErrors: [], pageErrors: [], failedRequests: [], responses: new Map() };
  await page.addInitScript(() => {
    const w = window as unknown as { __violations: string[] };
    w.__violations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      w.__violations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  await page.route("**/*", async (route) => {
    const response = await route.fetch();
    const pathname = new URL(route.request().url()).pathname;
    const headers: Record<string, string> = { ...response.headers() };
    for (const [name, value] of Object.entries(headersFor(blueprint, pathname))) headers[name.toLowerCase()] = change(name, value);
    await route.fulfill({ response, headers });
  });
  page.on("console", (message) => {
    if (message.type() === "error") seen.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => seen.pageErrors.push(error.message));
  page.on("requestfailed", (request) => seen.failedRequests.push(`${request.url()} ${request.failure()?.errorText ?? ""}`));
  page.on("response", (response) => {
    seen.responses.set(new URL(response.url()).pathname, response.headers());
  });
  return seen;
}

const violations = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);

test.describe("the real build under the Blueprint's headers", () => {
  test("a fresh page draws the idle scene with no policy violation, console error or failed request", async ({ page }) => {
    const seen = await serveWithHeaders(page);
    await page.goto("/");
    const scene = page.locator("#scene");
    await expect(scene).toHaveAttribute("data-settled", "true");
    await expect(scene).toHaveAttribute("data-flame", "unlit");
    expect(await scene.evaluate((el) => getComputedStyle(el).getPropertyValue("--wax-height").trim())).toBe("1");

    expect(await violations(page)).toEqual([]);
    expect({ console: seen.consoleErrors, page: seen.pageErrors, failed: seen.failedRequests }).toEqual({ console: [], page: [], failed: [] });

    // The cache rules, against the real hashed file names Vite produced.
    const script = [...seen.responses.keys()].find((p) => /^\/assets\/.+\.js$/.test(p));
    expect(script, "the page loaded a hashed script").toBeDefined();
    expect(seen.responses.get(script ?? "")?.["cache-control"]).toBe(headersFor(blueprint, script ?? "")["Cache-Control"]);
    expect(seen.responses.get(script ?? "")?.["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(seen.responses.get("/")?.["cache-control"]).toBe("no-cache");
    expect(seen.responses.get("/")?.["content-security-policy"]).toBe(headersFor(blueprint, "/")["Content-Security-Policy"]);
  });

  test("a lit session draws a steady flame under the policy (style.setProperty and animation frames still work)", async ({ page }) => {
    const fixture = FIXTURES.litHalf;
    if (fixture.state === null) throw new Error("the lit fixture has a state");
    const seen = await serveWithHeaders(page);
    await page.addInitScript(
      ({ sessionKey, historyKey, session, history }) => {
        if (session !== null) localStorage.setItem(sessionKey, session);
        localStorage.setItem(historyKey, history);
      },
      {
        sessionKey: SESSION_KEY,
        historyKey: HISTORY_KEY,
        session: serializeSession(fixture.state),
        history: serializeHistory(fixture.state.history),
      },
    );
    // The clock starts paused at the load instant (pauseAt is the first clock call, so no wall time is counted between installing and pausing):
    // the page loads at exactly that instant however long the load takes, and the frames keep the 16 ms grid from it. Nothing then
    // depends on the machine's speed (the old `install` let the clock run during the load and failed when the load took over 4.9 s).
    await page.clock.pauseAt(fixture.now - 5000);
    await page.goto("/");
    // Run, not jump: every timer and frame of the 5 s after the load fires at its own instant, as when the clock ran during the load.
    await page.clock.runFor(5040);

    const scene = page.locator("#scene");
    await expect(scene).toHaveAttribute("data-settled", "true");
    await expect(scene).toHaveAttribute("data-flame", "steady");
    expect(await scene.evaluate((el) => Number(getComputedStyle(el).getPropertyValue("--drips")))).toBe(2);

    expect(await violations(page)).toEqual([]);
    expect({ console: seen.consoleErrors, page: seen.pageErrors, failed: seen.failedRequests }).toEqual({ console: [], page: [], failed: [] });
  });

  test("negative control: with script-src 'none' the same page records a violation and draws no scene", async ({ page }) => {
    await serveWithHeaders(page, (name, value) => (name === "Content-Security-Policy" ? value.replace("script-src 'self'", "script-src 'none'") : value));
    await page.goto("/");
    await expect.poll(() => violations(page)).not.toEqual([]);
    expect((await violations(page)).some((v) => v.startsWith("script-src"))).toBe(true);
    await expect(page.locator("#scene")).toHaveCount(0);
  });
});
