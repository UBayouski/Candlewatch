import { createServer, type Server } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join, sep } from "node:path";
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect, test } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
const reference = join(root, ".kiro", "specs", "room-art", "prototype");
const html = readFileSync(join(reference, "index.html"), "utf8");
const ids = [...html.matchAll(/<section\s+id="([^"]+)"\s+class="pic\b/g)].map((match) => match[1]!);
const shoot = readFileSync(join(reference, "shoot.mjs"), "utf8");
const shotKeys = JSON.parse(shoot.match(/export const KEYS = (\[[^;]+\]);/)?.[1] ?? "[]") as string[];
let server: Server;
let url: string;

test.describe("room-art E13: script-free Prototype", () => {
  test.skip(process.env["CANDLEWATCH_PROTOTYPE"] !== "1", "opt-in Prototype test");
  test.beforeAll(async () => {
    server = createServer((req, res) => {
      const path = resolve(root, "." + decodeURIComponent((req.url ?? "/").split("?")[0]!));
      if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      try { res.writeHead(200, { "Content-Type": path.endsWith(".html") ? "text/html" : path.endsWith(".css") ? "text/css" : "application/octet-stream" }).end(readFileSync(path)); }
      catch { res.writeHead(404).end(); }
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const info = server.address();
    if (!info || typeof info === "string") throw new Error("Prototype server did not bind");
    url = `http://127.0.0.1:${info.port}/.kiro/specs/room-art/prototype/index.html`;
  });
  test.afterAll(async () => { if (server) await new Promise<void>((done) => server.close(() => done())); });

  test("every HTML picture is reachable by its target; idle needs no hash", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 640 } });
    const page = await context.newPage();
    try {
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
      // shoot.mjs independently names the captured pictures, so renaming a target in index.html must fail.
      for (const key of shotKeys) expect(ids, `capture key ${key}`).toContain(key);
      expect(ids).toContain("graveyard-card-stub");
      expect(ids).toContain("ghost-sizes");
      await page.goto(url);
      expect(await page.locator("section.pic").count()).toBe(ids.length);
      expect(await page.evaluate(() => location.hash)).toBe("");
      expect(await page.locator("#idle").evaluate((el) => getComputedStyle(el).display)).toBe("block");
      for (const id of ids.filter((item) => item !== "idle")) {
        await page.goto(`${url}#${id}`);
        expect(await page.locator(`#${id}`).evaluate((el) => getComputedStyle(el).display), id).toBe("block");
        expect(await page.locator("#idle").evaluate((el) => getComputedStyle(el).display), `idle at ${id}`).toBe("none");
      }
      expect(await page.locator("script").count()).toBe(0);
    } finally { await context.close(); }
  });

  test("24 captures exist and tokens agree with linked stylesheets", () => {
    expect(readdirSync(reference).filter((name) => /^proto-.*\.png$/.test(name))).toHaveLength(24);
    const tokens = JSON.parse(readFileSync(join(reference, "tokens.json"), "utf8")) as { scene: Record<string, string> };
    const scene = readFileSync(join(root, "src", "scene", "scene.css"), "utf8");
    for (const [name, value] of Object.entries(tokens.scene))
      expect(scene.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim(), name).toBe(value);
  });
});
