import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { headersFor, readBlueprint } from "../src/hosting/blueprint";
import { FAKE_AUDIO_SCRIPT, audioLog, cuesPlayed } from "./sound-fixtures";

const blueprint = readBlueprint();

interface Traffic {
  readonly violations: string[];
  readonly errors: string[];
  readonly failed: string[];
  readonly requests: { url: string; type: string }[];
}

async function serve(page: Page, blockScripts = false): Promise<Traffic> {
  const traffic: Traffic = { violations: [], errors: [], failed: [], requests: [] };
  await page.addInitScript(FAKE_AUDIO_SCRIPT);
  await page.addInitScript(() => {
    const w = window as unknown as { __violations: string[] };
    w.__violations = [];
    document.addEventListener("securitypolicyviolation", (event) => w.__violations.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  await page.route("**/*", async (route) => {
    const response = await route.fetch();
    const path = new URL(route.request().url()).pathname;
    const headers: Record<string, string> = { ...response.headers() };
    for (const [name, value] of Object.entries(headersFor(blueprint, path))) {
      headers[name.toLowerCase()] = blockScripts && name === "Content-Security-Policy" ? value.replace("script-src 'self'", "script-src 'none'") : value;
    }
    await route.fulfill({ response, headers });
  });
  page.on("console", (message) => { if (message.type() === "error") traffic.errors.push(message.text()); });
  page.on("pageerror", (error) => traffic.errors.push(error.message));
  page.on("requestfailed", (request) => traffic.failed.push(request.url()));
  page.on("request", (request) => traffic.requests.push({ url: request.url(), type: request.resourceType() }));
  return traffic;
}

const violations = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);

test.describe("sound E10: the real build under Blueprint headers", () => {
  test.setTimeout(90_000);
  test("a short keyboard session plays strike and chime with no policy or request failure", async ({ page }) => {
    const traffic = await serve(page);
    // The current Playwright docs recommend `install` slightly early, load, then `pauseAt`. This repo pauses first because that order failed
    // on loads over 4.9 s, and it relies on `pauseAt` installing the clock itself (true in 1.65.0; re-check on any Playwright upgrade; the
    // guard test is in e2e/fixtures-imports.spec.ts).
    await page.clock.pauseAt(Date.UTC(2026, 10, 10, 20, 0, 0));
    await page.goto("/");
    await page.clock.runFor(48);
    await page.locator("#length-custom").fill("5");
    await page.locator("#light").focus();
    await page.keyboard.press("Enter");
    await page.clock.runFor(5 * 60_000 + 1000);
    expect(cuesPlayed(await audioLog(page))).toEqual(["strike", "chime"]);
    traffic.violations.push(...await violations(page));
    expect(traffic.violations).toEqual([]);
    expect(traffic.errors).toEqual([]);
    expect(traffic.failed).toEqual([]);
    const origin = new URL(page.url()).origin;
    expect(traffic.requests.every((request) => new URL(request.url).origin === origin)).toBe(true);
    expect(traffic.requests.some((request) => request.type === "media")).toBe(false);
  });

  test("negative control: script-src none records a violation", async ({ page }) => {
    await serve(page, true);
    await page.goto("/");
    await expect.poll(() => violations(page)).not.toEqual([]);
    expect((await violations(page)).some((v) => v.startsWith("script-src"))).toBe(true);
    await expect(page.locator("#scene")).toHaveCount(0);
  });
});
