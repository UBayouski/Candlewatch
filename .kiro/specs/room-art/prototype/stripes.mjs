// The repeat check (design D1, test E3): is there a vertical stripe in the wall at 1280, 1920 or 2560 wide?
// Reads the IDLE wall (window light only: a smooth light, so what is left after removing the slow trend is the stones), takes the mean
// luminance of every pixel column over the wall rows outside the candle column and the window, smooths it over one block width (130 units)
// and subtracts the same profile smoothed over 600 units. A stripe (stones of one tone stacked over many courses) would show as a residual
// that repeats down the whole height.
//
// Fourth pass: the third pass's edge fade (the Wall_Veil and the Window_Light edge shade, both intentional) is a slope across the page
// and used to be counted as "repeat". The repeat is now read in two ways that do not contain the fade, and the limit stays 6 percent:
//   fadeRemoved   the same picture with `.wall-veil` and `.win-edge` switched off, over the whole page width (the wall as the tile draws it)
//   within320     the real picture (fade on), only the columns within 320 units of the window's axis (|x - 300| <= 320, where the fade is 0)
// and, for the record, withFade (the real picture over the whole page: includes the fade, not a repeat figure).
//   node stripes.mjs            writes "stripes" into measurements.json (the wall is wall B, adopted on 2026-11-15)
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "@playwright/test";
import { serve, URL_PATH } from "./shoot.mjs";
import { layout } from "./source.mjs";

const { PNG } = createRequire(import.meta.url)("playwright-core/lib/utilsBundle");
const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const { server, port } = await serve();
const browser = await chromium.launch();
const file = new URL("measurements.json", import.meta.url);
const out = JSON.parse(readFileSync(file, "utf8"));
const ma = (xs, win) => xs.map((_, i) => { const seg = xs.slice(Math.max(0, i - win / 2), i + win / 2).filter(Number.isFinite); return seg.length > win / 3 ? seg.reduce((a, b) => a + b, 0) / seg.length : NaN; });
out.stripes = {};
for (const [w, h] of [[1280, 800], [1920, 1080], [2560, 1440]]) {
  const st = layout.stageBox(w, h);
  const read = async (hideFade) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}${URL_PATH}#idle`, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: "#ui,.ghost-layer{display:none!important}" + (hideFade ? ".wall-veil,.win-edge{display:none!important}" : "") });
    const png = PNG.sync.read(await page.screenshot());
    await ctx.close();
    const y0 = Math.round(st.oy + 330 * st.scale), y1 = Math.round(st.oy + 860 * st.scale); // below the window
    const col = [];
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let y = y0; y < y1; y += 2) {
        const rx = (x - st.ox) / st.scale, ry = (y - st.oy) / st.scale;
        if ((rx > 250 && rx < 350) || (rx < 120 && ry > 780)) continue;
        const i = (y * png.width + x) * 4;
        s += lum(png.data[i], png.data[i + 1], png.data[i + 2]); n++;
      }
      col.push(n ? s / n : NaN);
    }
    return col;
  };
  const figure = (col, keep) => {
    const fine = ma(col, Math.round(130 * st.scale)), slow = ma(col, Math.round(600 * st.scale));
    const idx = col.map((_, x) => x).filter((x) => keep(x) && Number.isFinite(fine[x]) && Number.isFinite(slow[x]));
    const res = idx.map((x) => fine[x] - slow[x]);
    const vals = idx.map((x) => col[x]).filter(Number.isFinite);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(res.reduce((a, b) => a + b * b, 0) / res.length);
    return { columns: idx.length, meanLuminance: +mean.toFixed(4), residualStdOverMean: +(sd / mean).toFixed(3), residualPeakToPeakOverMean: +((Math.max(...res) - Math.min(...res)) / mean).toFixed(3) };
  };
  const real = await read(false), plain = await read(true);
  const inAxis = (x) => Math.abs((x - st.ox) / st.scale - 300) <= 320;
  out.stripes[`${w}x${h}`] = {
    fadeRemoved: figure(plain, () => true),
    within320: figure(real, inAxis),
    withFade: figure(real, () => true),
    limit: 0.06,
    method: "idle wall rows 330..860 units, column means, 130-unit average minus 600-unit average; fadeRemoved: veil and edge shade switched off; within320: |x - 300| <= 320 units; the smoothing windows read the whole page and the figure keeps only the stated columns",
  };
}
writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify(Object.fromEntries(Object.entries(out.stripes).map(([k, v]) => [k, [v.fadeRemoved.residualStdOverMean, v.fadeRemoved.residualPeakToPeakOverMean, v.within320.residualStdOverMean, v.within320.residualPeakToPeakOverMean, v.withFade.residualStdOverMean]]))));
await browser.close();
server.close();
