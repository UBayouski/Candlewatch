// Measures the prototype in Chromium (JavaScript enabled here only to read pixels and boxes). Writes measurements.json.
//   node .kiro/specs/room-art/prototype/measure.mjs           every figure of design D1, D3, D5, D9, D15
//   node .kiro/specs/room-art/prototype/measure.mjs --cards   only the size of the two details cards, into card-sizes.json
// Floors checked: R3.2, R3.15, R3.17, R3.19, R3.20, R4.10, R7.6, R7.7, R9 (zone paddings), and the new pool-against-window ratio.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "@playwright/test";
import { serve, URL_PATH } from "./shoot.mjs";
import { layout, geometry } from "./source.mjs";
import * as WB from "./wall-b.mjs"; // wall B is the wall (adopted on 2026-11-15)

const require = createRequire(import.meta.url);
const { PNG } = require("playwright-core/lib/utilsBundle");
const VIEWPORTS_ART = [[360, 640], [375, 667], [768, 1024], [1280, 800], [1920, 1080], [2560, 1440], [3840, 2160]];
const NIGHT = [5, 7, 13];
const CEILING = 0.13120; // luminance of #566683
const FLOOR = 0.00213; // luminance of #05070d
const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return +((x + 0.05) / (y + 0.05)).toFixed(3); };
const round = (v, d = 3) => +v.toFixed(d);
const { server, port } = await serve();
const browser = await chromium.launch();
const cardsOnly = process.argv.includes("--cards");

async function open(w, h, hideUi = true, extraCss = "") {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}${URL_PATH}#idle`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  if (hideUi) await page.addStyleTag({ content: "#ui,.ghost-layer{display:none!important}body.nohalo .halo,body.nohalo .ember{display:none!important}" + extraCss });
  return { ctx, page };
}
async function shotOf(page, key) {
  await page.evaluate((k) => { location.hash = k; }, key);
  await page.waitForTimeout(120);
  return PNG.sync.read(await page.screenshot());
}
const px = (png, x, y) => {
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const xx = Math.min(png.width - 1, Math.max(0, Math.round(x) + dx)), yy = Math.min(png.height - 1, Math.max(0, Math.round(y) + dy));
    const i = (yy * png.width + xx) * 4; r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; n++;
  }
  return [r / n, g / n, b / n].map((v) => Math.round(v * 10) / 10);
};

// ---------------------------------------------------------------- the details cards (units), written for build.mjs
if (cardsOnly) {
  const sizes = {};
  for (const [name, key] of [["stone", "graveyard-card"], ["stub", "graveyard-card-stub"]]) {
    const { ctx, page } = await open(360, 640, false);
    await page.evaluate((k) => { location.hash = k; }, key);
    await page.waitForTimeout(150);
    const box = await page.evaluate(() => {
      const el = [...document.querySelectorAll(".card")].find((c) => c.getBoundingClientRect().width > 0);
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    sizes[name] = { w: Math.ceil(box.w / 0.6), h: Math.ceil(box.h / 0.6) };
    await ctx.close();
  }
  writeFileSync(new URL("card-sizes.json", import.meta.url), JSON.stringify(sizes) + "\n");
  console.log("cards", JSON.stringify(sizes));
  await browser.close();
  server.close();
  process.exit(0);
}

// ---------------------------------------------------------------- the wall's blocks (from the same constants as the picture)
const ALL_BLOCKS = WB.blocksIn(0, 880);
const usable = (b) => b.cx > 20 && b.cx < 580 && b.cy > 20 && b.cy < 870 && !(b.cx > 226 && b.cx < 374 && b.cy < 300) && !(b.cx < 120 && b.cy > 780);
const usableWide = (b) => b.cx > 10 && b.cx < 590 && b.cy > 5 && b.cy < 870 && !(b.cx > 226 && b.cx < 374 && b.cy < 300) && !(b.cx < 120 && b.cy > 780);
function nearestBlock(t, tx, ty, ok) {
  return ALL_BLOCKS.filter((b) => b.t === t && usableWide(b) && ok(b)).sort((p, q) => Math.hypot(p.cx - tx, p.cy - ty) - Math.hypot(q.cx - tx, q.cy - ty))[0];
}

const STATES = ["idle", "lit-start", "lit-half", "last-minute", "paused", "burned-out", "snuffed"];
// the earlier positions (second and third passes): block tone class, the two points, and their distances from the flame
const REF_POOL = { "lit-half": { tone: 0, inside: [71, 570], dIn: 234, outside: [23, 30], dOut: 652 }, "last-minute": { tone: 1, inside: [323, 750], dIn: 67, outside: [397, 510], dOut: 318 } };
const POOLS = { "lit-start": { wax: 1, r: 1 }, "lit-half": { wax: 0.5, r: 0.6 }, "last-minute": { wax: 0.04, r: 0.232 } };
const out = { definitions: {}, viewports: {}, pool: {}, zone: {}, columns: {}, cards: {} };
out.definitions = {
  patch: "3 by 3 pixels, mean of the channels, read from a screenshot with the interface and the room ghosts hidden",
  ratio: "(L1 + 0.05) / (L2 + 0.05) with L1 the larger relative luminance (WCAG contrast), 3 decimals",
  poolRatio: "poolRatioWcag = (L_in + 0.05) / (L_out + 0.05); poolRatioLum = L_in / L_out; both for two blocks of the SAME tone class (class 0, the commonest cool tone): 'in' is the nearest such block to the pool, outside the halo (centre 125 units or more from the flame, so the halo's amber glow does not add), inside half the pool radius or 125 units whichever is larger; 'out' is the nearest such block to 140 units beyond the pool's edge, at the same distance from the window within about 30 percent. Also read with the halo hidden.",
};

for (const [w, h] of VIEWPORTS_ART) {
  const st = layout.stageBox(w, h);
  const room = (x, y) => [st.ox + x * st.scale, st.oy + y * st.scale];
  const { ctx, page } = await open(w, h);
  const row = {};
  for (const key of STATES) {
    const png = await shotOf(page, key);
    const edge = [];
    for (const fy of [0.3, 0.6, 0.8]) for (const x of [2, w - 3]) {
      const c = px(png, x, h * fy);
      edge.push(round(c.reduce((s, v, i) => s + Math.abs(v - NIGHT[i]), 0), 1));
    }
    const samples = {};
    for (const [sx, sy] of [[200, 150], [400, 150], [120, 500], [480, 500]]) {
      const near = ALL_BLOCKS.filter(usable).sort((p, q) => Math.hypot(p.cx - sx, p.cy - sy) - Math.hypot(q.cx - sx, q.cy - sy))[0];
      const board = px(png, ...room(near.cx, near.cy));
      const joint = px(png, ...room(near.joint.x, near.joint.y));
      samples[`${sx},${sy}`] = { block: [near.cx, near.cy], board, joint, jointWidth: round(near.joint.width, 2), wallPatch: board, boardToNight: ratio(board, NIGHT), jointVsBoard: ratio(board, joint) };
    }
    row[key] = {
      edgeMin: Math.min(...edge), edge, samples,
      parts: { table: px(png, ...room(100, 888)), frame: px(png, ...room(244, 150)), doorWood: px(png, ...room(50, 860)), glass: px(png, ...room(300, 155)), wall: px(png, ...room(200, 150)) },
    };
    row[key].partsToNight = Object.fromEntries(Object.entries(row[key].parts).map(([k, v]) => [k, ratio(v, NIGHT)]));
    row[key].frameVsGlass = ratio(row[key].parts.frame, row[key].parts.glass);
    // the room's colours stay under the ceiling: scan the wall outside the candle column and the halo (state elements are exempt)
    if (key === "lit-half" || key === "last-minute" || key === "lit-start") {
      let max = 0;
      const flameY = 400 + (1 - POOLS[key].wax) * 420 + 10;
      for (let y = Math.round(room(0, 30)[1]); y < room(0, 870)[1]; y += 3) for (let x = 0; x < w; x += 3) {
        const [rx, ry] = [(x - st.ox) / st.scale, (y - st.oy) / st.scale];
        if ((rx > 150 && rx < 450 && ry > 250) || Math.hypot(rx - 300, ry - flameY) < 150 || (rx > 226 && rx < 374 && ry < 300) || (rx < 120 && ry > 780)) continue;
        const i = (y * png.width + x) * 4;
        max = Math.max(max, lum([png.data[i], png.data[i + 1], png.data[i + 2]]));
      }
      row[key].maxWallLuminance = round(max, 4);
    }
  }
  // snuffed against idle, and against every state (R7.7)
  row.idleOverSnuffed = Object.fromEntries(Object.keys(row.idle.samples).map((k) => [k, ratio(row.idle.samples[k].wallPatch, row.snuffed.samples[k].wallPatch)]));
  row.snuffedNotBrighter = Object.fromEntries(STATES.filter((s) => s !== "snuffed").map((s) => [s, Object.keys(row.snuffed.samples).every((k) => lum(row.snuffed.samples[k].wallPatch) <= lum(row[s].samples[k].wallPatch) + 0.0004)]));
  out.viewports[`${w}x${h}`] = row;

  // the candle's light against the window's light, LIKE FOR LIKE with the second and third passes: the same tone class, the same distance from the flame and
  // the same direction (nearest angle) as the earlier positions, read inside a block of that tone at least 4 units from its edges (wall B's blocks are large)
  if ([[1280, 800], [360, 640], [1920, 1080]].some(([a, b]) => a === w && b === h)) {
    out.pool[`${w}x${h}`] = {};
    for (const key of ["lit-half", "last-minute"]) {
      const { wax } = POOLS[key];
      const ref = REF_POOL[key];
      const C = { x: 300, y: 400 + (1 - wax) * 420 + 10 };
      const dist = (p) => Math.hypot(p[0] - C.x, p[1] - C.y);
      const ok = (p, edge = 20) => p[0] > edge && p[0] < 600 - edge && p[1] > edge && p[1] < 870 && Math.abs(p[0] - 300) >= 20 && !(p[0] > 226 && p[0] < 374 && p[1] < 300) && !(p[0] < 120 && p[1] > 780);
      // the same tone, the same direction (nearest angle) and the same distance from the flame; where the stage has no such point (a block of the tone, 4 units from its
      // edges, on the circle of that distance inside the 600 by 870 stage) the distance is moved by 10 units at a time, up to 120, and the distance read is reported
      const find = (target, d) => {
        const th0 = Math.atan2(target[1] - C.y, target[0] - C.x);
        for (let step = 0; step <= 12; step++) for (const sign of step === 0 ? [1] : [1, -1]) {
          const dd = d + sign * step * 10;
          const cands = [];
          for (let deg = 0; deg < 360; deg += 0.5) {
            const th = (deg * Math.PI) / 180;
            const p = [C.x + dd * Math.cos(th), C.y + dd * Math.sin(th)];
            if (!ok(p)) continue;
            const b = WB.locate(p[0], p[1]);
            if (!b || b.t !== ref.tone || b.margin < 4) continue;
            cands.push({ p, margin: b.margin, dTheta: Math.abs(Math.atan2(Math.sin(th - th0), Math.cos(th - th0))) });
          }
          if (cands.length) return cands.sort((a, b) => a.dTheta - b.dTheta)[0];
        }
      };
      const inside = find(ref.inside, ref.dIn), outside = find(ref.outside, ref.dOut);      const pair = {};
      for (const [label, css] of [["withHalo", ""], ["haloHidden", ".halo,.ember{display:none!important}"]]) {
        await page.evaluate((hide) => document.body.classList.toggle("nohalo", hide), css !== "");
        const png = await shotOf(page, key);
        const pin = px(png, ...room(...inside.p)), pout = px(png, ...room(...outside.p));
        pair[label] = { toneClass: ref.tone, earlier: { inside: ref.inside, outside: ref.outside, dIn: ref.dIn, dOut: ref.dOut }, inside: { at: inside.p.map((v) => round(v, 1)), distFromFlame: round(dist(inside.p), 0), edgeMargin: round(inside.margin, 1), rgb: pin }, outside: { at: outside.p.map((v) => round(v, 1)), distFromFlame: round(dist(outside.p), 0), edgeMargin: round(outside.margin, 1), rgb: pout }, poolRatioWcag: ratio(pin, pout), poolRatioLum: round(lum(pin) / lum(pout), 2) };
      }
      out.pool[`${w}x${h}`][key] = pair;
    }
  }
  await ctx.close();
}

// ---------------------------------------------------------------- the tile (wall B): accents never touch another accent; the longest vertical run of one tone at one x
// (the repeat itself is read by stripes.mjs, with the edge fade removed)
{
  const COURSES = WB.COURSES, TILE_W = WB.TILE_W, N = WB.COURSE_COUNT;
  let stackedAccent = 0, longestRun = 0;
  for (let x = 0; x < TILE_W; x += 2) {
    const col = COURSES.map((c) => c.find((b) => (((x - b.x) % TILE_W) + TILE_W) % TILE_W < b.w).t);
    for (let i = 0; i < N; i++) if (col[i] >= 3 && col[(i + 1) % N] >= 3) stackedAccent++;
    let run = 1;
    for (let i = 1; i < N * 2; i++) { run = col[i % N] === col[(i - 1) % N] ? run + 1 : 1; longestRun = Math.max(longestRun, Math.min(run, N)); }
  }
  const counts = [0, 0, 0, 0, 0];
  COURSES.flat().forEach((b) => counts[b.t]++);
  out.columns.tile = { width: TILE_W, height: WB.TILE_H, courses: N, blocks: COURSES.flat().length, toneCounts: counts, accentShare: round((counts[3] + counts[4]) / COURSES.flat().length, 2), stackedAccentColumns: stackedAccent, longestVerticalRunOfOneTone: longestRun };
}

// ---------------------------------------------------------------- the zone buttons (R9)
for (const [w, h] of [[1280, 800], [1920, 1080]]) {
  for (const key of ["lit-start", "paused"]) {
    const { ctx, page } = await open(w, h, false);
    await page.evaluate((k) => { location.hash = k; }, key);
    await page.waitForTimeout(150);
    out.zone[`${w}x${h}/${key}`] = await page.evaluate(() => {
      const ui = [...document.querySelectorAll(`#${location.hash.slice(1)} #ui`)].find((u) => u.getBoundingClientRect().width > 0);
      const res = {};
      for (const id of ["pause", "snuff", "settings-button"]) {
        const b = ui.querySelector(`#${id}`);
        const bb = b.getBoundingClientRect(), ic = b.querySelector(".icon:not([data-off])").getBoundingClientRect(), lab = b.querySelector(".label");
        const r = document.createRange(); r.selectNodeContents(lab); const lb = r.getBoundingClientRect();
        res[id] = { x: bb.x, w: bb.width, h: bb.height, iconEdge: +(ic.x - bb.x).toFixed(2), labelEdge: +(bb.right - lb.right).toFixed(2), labelW: +lb.width.toFixed(2) };
      }
      const t = ui.querySelector("#time").getBoundingClientRect();
      res.timeBox = { x: t.x, right: t.right };
      return res;
    });
    await ctx.close();
  }
}

// ---------------------------------------------------------------- the periphery (third pass): edges at the ultrawide, and how sharp the wall is at the edges against beside the candle
{
  // R7.6 patches at 2560 by 1080 (not in VIEWPORTS_ART; read for the record)
  const { ctx, page } = await open(2560, 1080);
  out.ultrawide = {};
  for (const key of STATES.filter((k) => k !== "snuffed")) {
    const png = await shotOf(page, key);
    const edge = [];
    for (const fy of [0.3, 0.6, 0.8]) for (const x of [2, 2560 - 3]) edge.push(round(px(png, x, 1080 * fy).reduce((s, v, i) => s + Math.abs(v - NIGHT[i]), 0), 1));
    out.ultrawide[key] = { edgeMin: Math.min(...edge) };
  }
  await ctx.close();
}
{
  // Sharpness: mean absolute luminance step between neighbouring pixels (2 px apart), divided by the mean luminance of the box.
  // "candle" box: room x 20..180 and 420..580, y 300..700 (beside the candle, outside the column). "edge" boxes: the outer 12 percent of the page width, rows 20..85 percent.
  out.sharpness = {};
  for (const [w, h] of [[1280, 800], [1920, 1080], [2560, 1440], [3840, 2160]]) {
    const st = layout.stageBox(w, h);
    const { ctx, page } = await open(w, h);
    out.sharpness[`${w}x${h}`] = {};
    for (const key of ["idle", "lit-half"]) {
      const png = await shotOf(page, key);
      const L = (x, y) => { const i = (y * png.width + x) * 4; return lum([png.data[i], png.data[i + 1], png.data[i + 2]]); };
      const box = (x0, x1, y0, y1) => {
        let d = 0, m = 0, c = 0;
        for (let y = Math.max(0, Math.round(y0)); y < Math.min(h - 3, y1); y += 2) for (let x = Math.max(0, Math.round(x0)); x < Math.min(w - 3, x1); x += 2) {
          const l = L(x, y); d += Math.abs(l - L(x + 2, y)) + Math.abs(l - L(x, y + 2)); m += l; c++;
        }
        return { step: d / c / 2, mean: m / c, normalised: d / c / 2 / (m / c) };
      };
      const near = [box(st.ox + 20 * st.scale, st.ox + 180 * st.scale, st.oy + 300 * st.scale, st.oy + 700 * st.scale), box(st.ox + 420 * st.scale, st.ox + 580 * st.scale, st.oy + 300 * st.scale, st.oy + 700 * st.scale)];
      const edges = [box(0, w * 0.12, h * 0.2, h * 0.85), box(w * 0.88, w, h * 0.2, h * 0.85)];
      const avg = (a, k) => (a[0][k] + a[1][k]) / 2;
      out.sharpness[`${w}x${h}`][key] = { nearStep: round(avg(near, "step"), 5), edgeStep: round(avg(edges, "step"), 5), stepRatioEdgeOverNear: round(avg(edges, "step") / avg(near, "step"), 3), nearNormalised: round(avg(near, "normalised"), 4), edgeNormalised: round(avg(edges, "normalised"), 4), normalisedRatioEdgeOverNear: round(avg(edges, "normalised") / avg(near, "normalised"), 3) };
    }
    await ctx.close();
  }
}
out.ceiling = { luminance: CEILING, floor: FLOOR };
writeFileSync(new URL("measurements.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
await browser.close();
server.close();
console.log("done");




