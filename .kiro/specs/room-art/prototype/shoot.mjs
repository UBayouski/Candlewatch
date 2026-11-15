// Takes the prototype screenshots with the Playwright that is installed (JavaScript disabled, so it also proves that no script is needed).
//   node .kiro/specs/room-art/prototype/shoot.mjs [key]
// 20 pictures (nine states at two sizes, the ultrawide and the 4k) and 2 stub-card pictures. The warm pool tint is the default look. The ghost-size strip goes to
// a scratch folder that the caller deletes.
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, normalize } from "node:path";
import { chromium } from "@playwright/test";
import { layout } from "./source.mjs";

const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const here = fileURLToPath(new URL("./", import.meta.url));
const TYPES = { ".html": "text/html", ".css": "text/css", ".woff2": "font/woff2", ".json": "application/json" };

export function serve() {
  const server = createServer(async (req, res) => {
    try {
      const path = normalize(join(repo, decodeURIComponent(new URL(req.url, "http://x").pathname)));
      if (!path.startsWith(repo)) throw new Error("outside");
      const body = await readFile(path);
      res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, port: server.address().port })));
}

export const KEYS = ["idle", "lit-start", "lit-half", "last-minute", "paused", "burned-out", "snuffed", "graveyard-small", "graveyard-card"];
export const SIZES = { desktop: [1280, 800], phone: [360, 640] };
export const URL_PATH = "/.kiro/specs/room-art/prototype/index.html";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const only = process.argv[2];
  const { server, port } = await serve();
  const browser = await chromium.launch();
  const jobs = [];
  for (const key of KEYS) for (const [size, wh] of Object.entries(SIZES)) jobs.push([key, `proto-${key}-${size}.png`, wh]);
  jobs.push(["lit-half", "proto-lit-half-ultrawide.png", [2560, 1080]]);
  jobs.push(["lit-half", "proto-lit-half-4k.png", [3840, 2160]]);
  jobs.push(["graveyard-card-stub", "proto-graveyard-card-stub-desktop.png", SIZES.desktop]);
  jobs.push(["graveyard-card-stub", "proto-graveyard-card-stub-phone.png", SIZES.phone]);
  if (only === "ghost-sizes") {
    mkdirSync(join(here, "_scratch"), { recursive: true });
    jobs.length = 0;
    jobs.push(["ghost-sizes", "_scratch/ghost-sizes-desktop.png", SIZES.desktop], ["ghost-sizes", "_scratch/ghost-sizes-phone.png", SIZES.phone]);
  }
  for (const [key, file, [w, h]] of jobs) {
    if (only && only !== "ghost-sizes" && only !== "crops" && key !== only) continue;
    if (only === "crops") continue;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, javaScriptEnabled: false, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}${URL_PATH}#${key}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(here, file) });
    await ctx.close();
    console.log(file);
  }
  if (!only || only === "crops") {
    const CROPS = [["lit-half", ""]];
    for (const [key, name] of CROPS) for (const [size, [w, h]] of Object.entries(SIZES)) {
      const st = layout.stageBox(w, h);
      const clip = { x: st.ox + 160 * st.scale, y: st.oy + 850 * st.scale, width: 280 * st.scale, height: 70 * st.scale };
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, javaScriptEnabled: false, deviceScaleFactor: 3 });
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${port}${URL_PATH}#${key}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      const file = `proto-base-crop-${size}.png`;
      await page.screenshot({ path: join(here, file), clip });
      await ctx.close();
      console.log(file);
    }
  }
  await browser.close();
  server.close();
}
