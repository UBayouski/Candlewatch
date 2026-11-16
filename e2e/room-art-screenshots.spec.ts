import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { SCREENSHOT_FILES } from "./screenshot-list";

test("E11: every listed screenshot has one case and one file, with no extras", () => {
  const expected = [...SCREENSHOT_FILES].sort();
  expect(expected).toHaveLength(62);
  expect(new Set(expected).size).toBe(62);

  // Ask Playwright for its registered cases, so removing a test case is visible
  // even when its old PNG remains in docs/screenshots/.
  const listing = execFileSync(process.execPath, [
    join(process.cwd(), "node_modules", "@playwright", "test", "cli.js"),
    "test", "e2e/screenshots.spec.ts", "e2e/controls-screenshots.spec.ts", "--list",
  ], { cwd: process.cwd(), encoding: "utf8" });
  const cases = listing.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/› ([\w-]+\.png)/);
    return match?.[1] ? [match[1]] : [];
  }).sort();
  expect(cases, "screenshot cases must match the 62-name list").toEqual(expected);

  const files = readdirSync(join(process.cwd(), "docs", "screenshots"), { withFileTypes: true })
    .filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  expect(files, "docs/screenshots files must match the 62-name list").toEqual(expected);
});
