// The candle's base (fourth pass, part B): how much of the Table_Top and the Holder the zone's soft shadow covers, and what the
// shortened shadow does to the time text and the status line.   node .kiro/specs/room-art/prototype/base.mjs   (writes base-measurements.json)
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "@playwright/test";
import { serve, URL_PATH } from "./shoot.mjs";
import { layout } from "./source.mjs";

const require = createRequire(import.meta.url);
const { PNG } = require("playwright-core/lib/utilsBundle");
const SIZES = { desktop: [1280, 800], phone: [360, 640] };
const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return +((x + 0.05) / (y + 0.05)).toFixed(2); };
const round = (v, d = 2) => +v.toFixed(d);
const ZONE_REST = [8, 11, 18];
const { server, port } = await serve();
const browser = await chromium.launch();

async function shot(page, key, noShadow, hideUi) {
  await page.evaluate((k) => { location.hash = k; }, key);
  await page.waitForTimeout(120);
  const css = `${hideUi ? "#ui,.ghost-layer{display:none!important}" : ""}${noShadow ? ".zone-rest,.zone-dawn{filter:none!important}" : ""}`;
  const h = await page.addStyleTag({ content: css });
  const png = PNG.sync.read(await page.screenshot());
  await h.evaluate((el) => el.remove());
  return png;
}
const rgbRow = (png, x, y) => {
  let r = 0, g = 0, b = 0;
  for (let dx = -1; dx <= 1; dx++) { const i = (y * png.width + Math.round(x) + dx) * 4; r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; }
  return [r / 3, g / 3, b / 3];
};

const out = {};
// base B2 is the base (adopted on 2026-11-15); the coverage is read from the picture with and without the zone filter
const VARIANTS = [["default", "lit-half"]];
for (const [size, [w, h]] of Object.entries(SIZES)) {
  const st = layout.stageBox(w, h);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}${URL_PATH}#idle`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  out[size] = { scale: st.scale };
  for (const [name, key] of VARIANTS) {
    const S = await shot(page, key, false, true), P = await shot(page, key, true, true);
    const rows = [];
    for (let py = Math.round(st.oy + 878 * st.scale); py <= Math.round(st.oy + 899 * st.scale); py++) {
      const y = (py - st.oy) / st.scale;
      const alpha = (x) => {
        const s = rgbRow(S, st.ox + x * st.scale, py), p = rgbRow(P, st.ox + x * st.scale, py);
        const d = [0, 1, 2].map((c) => p[c] - ZONE_REST[c]);
        const k = [0, 1, 2].filter((c) => Math.abs(d[c]) > 4);
        return k.length ? Math.max(0, Math.min(1, k.reduce((a, c) => a + (p[c] - s[c]) / d[c], 0) / k.length)) : null;
      };
      rows.push({ y: round(y, 1), table: alpha(150), tableR: alpha(450), dish: alpha(252), dishR: alpha(348) });
    }
    const covered = (col, y0, y1) => {
      const r = rows.filter((q) => q.y >= y0 && q.y <= y1 && q[col] !== null);
      const unit = 1 / st.scale; // one pixel row in units
      const half = r.filter((q) => q[col] >= 0.5).length * unit;
      const weighted = r.reduce((a, q) => a + q[col], 0) * unit;
      const span = (y1 - y0);
      return { rowsRead: r.length, halfShadowUnits: round(Math.min(half, span), 1), halfShadowPx: round(Math.min(half, span) * st.scale, 1), weightedUnits: round(Math.min(weighted, span), 1), weightedPx: round(Math.min(weighted, span) * st.scale, 1), spanUnits: span, spanPx: round(span * st.scale, 1) };
    };
    // the unit where the shadow reaches one half going down (linear interpolation on the table column)
    let half = null;
    for (let i = 1; i < rows.length; i++) if (rows[i - 1].table !== null && rows[i].table !== null && rows[i - 1].table < 0.5 && rows[i].table >= 0.5) half = round(rows[i - 1].y + ((0.5 - rows[i - 1].table) / (rows[i].table - rows[i - 1].table)) * (rows[i].y - rows[i - 1].y), 1);
    out[size][name] = {
      tableTop: covered("table", 884, 900),
      holderLeft: covered("dish", 886, 900),
      holderRight: covered("dishR", 886, 900),
      halfShadowAtY: half,
      alphaByUnit: Object.fromEntries([884, 886, 888, 890, 892, 894, 896, 898].map((y) => { const q = rows.reduce((a, b) => (Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a)); return [y, [round(q.table ?? -1), round(q.dish ?? -1)]]; })),
    };
  }
  await ctx.close();
}

// the time text and the status line: their colour against the pixel beside them, at rest (lit half) and at the dawn (burned out), per variant
const TEXT = {};
for (const [size, [w, h]] of Object.entries(SIZES)) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}${URL_PATH}#idle`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  TEXT[size] = {};
  for (const [name, keys] of [["default", ["lit-half", "burned-out"]]]) {
    TEXT[size][name] = {};
    for (const [phase, key] of [["rest", keys[0]], ["dawn", keys[1]]]) {
      await page.evaluate((k) => { location.hash = k; }, key);
      await page.waitForTimeout(150);
      const info = await page.evaluate(() => {
        const ui = [...document.querySelectorAll(`#${location.hash.slice(1)} #ui`)].find((u) => u.getBoundingClientRect().width > 0);
        const rd = (id) => { const e = ui.querySelector(id); const r = e.getBoundingClientRect(); const c = getComputedStyle(e).color.match(/[\d.]+/g).map(Number); return { x: r.x, y: r.y, w: r.width, h: r.height, color: c.slice(0, 3) }; };
        return { time: rd("#time"), status: rd("#status") };
      });
      const png = PNG.sync.read(await page.screenshot({}));
      const res = {};
      for (const id of ["time", "status"]) {
        const e = info[id];
        // the background: a pixel just left of the text box, at its middle row (inside the zone band)
        const bg = rgbRow(png, Math.max(2, e.x - 6), Math.round(e.y + e.h / 2));
        res[id] = { text: e.color, bg: bg.map((v) => Math.round(v * 10) / 10), contrast: ratio(e.color, bg) };
      }
      TEXT[size][name][phase] = res;
    }
  }
  await ctx.close();
}
out.text = TEXT;
writeFileSync(new URL("base-measurements.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify(Object.fromEntries(Object.entries(out).filter(([k]) => k !== "text").map(([s, v]) => [s, Object.fromEntries(Object.entries(v).filter(([k]) => k !== "scale").map(([n, o]) => [n, { halfAtY: o.halfShadowAtY, table: [o.tableTop.halfShadowUnits, o.tableTop.halfShadowPx, o.tableTop.weightedUnits, o.tableTop.weightedPx], holderL: [o.holderLeft.halfShadowUnits, o.holderLeft.halfShadowPx, o.holderLeft.weightedUnits, o.holderLeft.weightedPx], alpha: o.alphaByUnit }]))])), null, 0));
console.log(JSON.stringify(TEXT));
await browser.close();
server.close();
