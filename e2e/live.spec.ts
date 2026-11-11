// The smoke test (hosting requirements R9, design 7). It runs against a base URL:
//   npm run smoke                                  the expected live URL
//   BASE_URL=http://localhost:4173 npm run smoke   a local preview
// It also runs under `npm run e2e` against `vite preview`, where groups B and C skip themselves.
// Only GET and HEAD requests are sent, nothing is written, no credentials are needed.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { headersFor, readBlueprint } from "../src/hosting/blueprint";

const isLocal = (baseURL: string | undefined): boolean => {
  const host = new URL(baseURL ?? "http://localhost").hostname;
  return host === "localhost" || host === "127.0.0.1";
};

interface Diagnostics {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
  readonly failedRequests: string[];
  readonly badResponses: string[];
  readonly requestUrls: string[];
  status: number;
}

/** Loads `/` with listeners attached first, and returns what the page did. */
async function loadPage(page: Page): Promise<Diagnostics> {
  const d: Diagnostics = { consoleErrors: [], pageErrors: [], failedRequests: [], badResponses: [], requestUrls: [], status: 0 };
  await page.addInitScript(() => {
    const w = window as unknown as { __violations: string[] };
    w.__violations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      w.__violations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  page.on("console", (message) => {
    if (message.type() === "error") d.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => d.pageErrors.push(error.message));
  page.on("requestfailed", (request) => d.failedRequests.push(`${request.url()} ${request.failure()?.errorText ?? ""}`));
  page.on("request", (request) => d.requestUrls.push(request.url()));
  page.on("response", (response) => {
    if (response.status() >= 400) d.badResponses.push(`${response.status()} ${response.url()}`);
  });
  const response = await page.goto("/");
  d.status = response?.status() ?? 0;
  await expect(page.locator("#scene")).toHaveAttribute("data-settled", "true");
  return d;
}

test.describe("A. page (any base URL)", () => {
  test("A1 the page answers 200 with lang en and the title Candlewatch", async ({ page }) => {
    const d = await loadPage(page);
    expect(d.status).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveTitle("Candlewatch");
  });

  test("A2 the scene is a labelled image and a fresh visit shows an unlit candle", async ({ page }) => {
    await loadPage(page);
    const scene = page.locator("#scene");
    await expect(scene).toHaveAttribute("role", "img");
    const label = await scene.getAttribute("aria-label");
    expect(label ?? "").not.toBe("");
    await expect(scene).toHaveAttribute("data-flame", "unlit");
  });

  test("A3 the heading Candlewatch is in the accessibility tree", async ({ page }) => {
    await loadPage(page);
    await expect(page.getByRole("heading", { name: "Candlewatch" })).toHaveCount(1);
  });

  test("A4 no console error, page error, policy violation, failed request or error response", async ({ page }) => {
    const d = await loadPage(page);
    const violations = await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);
    expect({ console: d.consoleErrors, page: d.pageErrors, failed: d.failedRequests, bad: d.badResponses, violations }).toEqual({
      console: [],
      page: [],
      failed: [],
      bad: [],
      violations: [],
    });
  });

  test("A5 every request the page makes goes to its own origin", async ({ page, baseURL }) => {
    const d = await loadPage(page);
    const origin = new URL(baseURL ?? "").origin;
    const foreign = d.requestUrls.filter((url) => !url.startsWith("data:") && !url.startsWith("blob:") && new URL(url).origin !== origin);
    expect(foreign).toEqual([]);
    expect(d.requestUrls.length).toBeGreaterThan(0);
  });
});

test.describe("B. headers (a live URL)", () => {
  test.beforeEach(({ baseURL }) => {
    test.skip(isLocal(baseURL), "there is no Render in front of localhost; header checks apply to a live URL");
  });

  /** The paths whose headers are compared: the page, index.html, and the real script and stylesheet the page loads. */
  async function pathsToCheck(page: Page): Promise<string[]> {
    await loadPage(page);
    const assets = await page.evaluate(() => {
      const script = document.querySelector("script[src]")?.getAttribute("src") ?? "";
      const sheet = document.querySelector('link[rel="stylesheet"][href]')?.getAttribute("href") ?? "";
      return { script, sheet };
    });
    expect(assets.script, "the page has a script with a src").not.toBe("");
    expect(assets.sheet, "the page has a stylesheet link").not.toBe("");
    return ["/", "/index.html", new URL(assets.script, "http://x").pathname, new URL(assets.sheet, "http://x").pathname];
  }

  test("B1 every header the Blueprint defines is present with exactly its value", async ({ page, request }) => {
    const blueprint = readBlueprint();
    for (const path of await pathsToCheck(page)) {
      const response = await request.get(path);
      expect(response.status(), `${path} status`).toBe(200);
      const live = response.headers();
      for (const [name, value] of Object.entries(headersFor(blueprint, path))) {
        expect(live[name.toLowerCase()], `${path} ${name}`).toBe(value);
      }
    }
  });

  test("B2 no header the Blueprint defines appears twice", async ({ page, request }) => {
    const blueprint = readBlueprint();
    for (const path of await pathsToCheck(page)) {
      const response = await request.get(path);
      const sent = response.headersArray().map((h) => h.name.toLowerCase());
      for (const name of Object.keys(headersFor(blueprint, path))) {
        expect(sent.filter((n) => n === name.toLowerCase()).length, `${path} sends ${name} more than once`).toBe(1);
      }
    }
  });

  test("B3 the hashed script is cached as immutable and the page is revalidated", async ({ page, request }) => {
    const [root, , script] = await pathsToCheck(page);
    expect((await request.get(root ?? "/")).headers()["cache-control"], "/ Cache-Control").toBe("no-cache");
    expect((await request.get(script ?? "/")).headers()["cache-control"], `${script} Cache-Control`).toBe("public, max-age=31536000, immutable");
  });

  // Render sets Strict-Transport-Security itself and the Blueprint does not (design Decision P10), so B1 cannot cover it.
  test("B4 Strict-Transport-Security is sent once, with a max-age of at least a year", async ({ request }) => {
    for (const path of ["/", "/index.html"]) {
      const response = await request.get(path);
      const sent = response.headersArray().filter((h) => h.name.toLowerCase() === "strict-transport-security");
      expect(sent.length, `${path} sends Strict-Transport-Security once`).toBe(1);
      const maxAge = /max-age=(\d+)/i.exec(sent[0]?.value ?? "");
      expect(maxAge, `${path} Strict-Transport-Security has a max-age`).not.toBeNull();
      expect(Number(maxAge?.[1]), `${path} max-age`).toBeGreaterThanOrEqual(31_536_000);
    }
  });
});

test.describe("C. live-only", () => {
  test.beforeEach(({ baseURL }) => {
    test.skip(isLocal(baseURL), "these checks describe Render's behaviour, not vite preview's");
  });

  test("C1 an unknown path answers 404", async ({ request }) => {
    expect((await request.get("/no-such-page")).status()).toBe(404);
  });

  test("C2 only dist/ is served: .env, package.json and render.yaml answer 404", async ({ request }) => {
    for (const path of ["/.env", "/package.json", "/render.yaml"]) {
      expect((await request.get(path)).status(), path).toBe(404);
    }
  });

  test("C3 http redirects to https", async ({ request, baseURL }) => {
    const url = new URL(baseURL ?? "");
    test.skip(url.protocol === "http:", "the base URL is already http");
    const response = await request.get(`http://${url.host}/`, { maxRedirects: 0 });
    expect([301, 302, 307, 308]).toContain(response.status());
    expect(response.headers()["location"] ?? "").toMatch(/^https:\/\//);
  });
});
