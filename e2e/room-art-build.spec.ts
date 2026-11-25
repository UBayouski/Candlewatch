import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "@playwright/test";
import { MAX_BUILT_CODE_BYTES } from "../src/scene/constants";
import { graveyardFixture, openGraveyardApp, openView, smallHistory } from "./graveyard-fixtures";
import { FIXTURES, openApp } from "./room-art-fixtures";

const root = join(process.cwd(), "dist");
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? files(full) : [full];
  });
}

test.describe("room-art E10: built art stays local and within budget", () => {
  test("dist has no Prototype, forbidden filters or excess JS and CSS", () => {
    const built = files(root);
    const names = built.map((p) => relative(root, p).replaceAll("\\", "/"));
    const prototype = names.filter((name) => /prototype|proto-|wall-b\.mjs/i.test(name));
    expect(prototype).toEqual([]);
    const code = built.filter((p) => /\.(?:js|css)$/.test(p));
    const bytes = code.reduce((sum, p) => sum + statSync(p).size, 0);
    const forbidden = code.flatMap((p) => {
      const text = readFileSync(p, "utf8");
      return ["feTurbulence", "feDisplacementMap", "feMorphology", "feConvolveMatrix"].filter((name) => text.includes(name)).map((name) => `${relative(root, p)}:${name}`);
    });
    console.log("E10 built JS+CSS bytes", bytes, "files", names.length, "forbidden", forbidden);
    expect(bytes).toBeLessThanOrEqual(MAX_BUILT_CODE_BYTES);
    expect(forbidden).toEqual([]);
  });
  test("served HTML has no inline style attribute", async ({ request }) => {
    const html = await (await request.get("/")).text();
    expect(html).not.toMatch(/\sstyle\s*=/i);
  });
  for (const fixture of [FIXTURES.idle, FIXTURES.litStart]) test(`${fixture.name}: no CSP violation`, async ({ browser }) => {
    const app = await openApp(browser, { fixture });
    try {
      const violations = app.errors.filter((message) => /content security policy|csp violation|refused to (?:load|execute|apply)/i.test(message));
      console.log("E10", fixture.name, "CSP violations", violations);
      expect(violations).toEqual([]);
    } finally { await app.close(); }
  });
  test("graveyard view: no CSP violation", async ({ browser }) => {
    const app = await openGraveyardApp(browser, { fixture: graveyardFixture("idle-small", "idle", smallHistory) });
    try {
      await openView(app.page);
      const violations = app.errors.filter((message) => /content security policy|csp violation|refused to (?:load|execute|apply)/i.test(message));
      console.log("E10 graveyard CSP violations", violations);
      expect(violations).toEqual([]);
    } finally { await app.close(); }
  });
});
