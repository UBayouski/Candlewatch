/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Shared room-art browser readings. The stored states and clock setup come from the existing fixtures.
import { inflateSync } from "node:zlib";
import type { Page } from "@playwright/test";
import { LANDSCAPE_WINDOW, WINDOW } from "../src/scene/constants";
import { WALL, WALL_ORIGIN_X, WALL_ORIGIN_Y, wallBlocks, wallHeights } from "../src/scene/setting";
import { LANDSCAPE_WINDOW_GUARD, placeControls, stageBox } from "../src/ui/layout";
import { FIXTURES, STATES, openScene } from "./scene-fixtures";
import { openApp, settle } from "./controls-fixtures";
import { setVisibility, smallHistory, largeHistory } from "./graveyard-fixtures";

export { FIXTURES, STATES, openScene, openApp, settle, setVisibility, smallHistory, largeHistory };

export const VIEWPORTS_ART = [
  { name: "phone", width: 360, height: 640 },
  { name: "phone375", width: 375, height: 667 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "wide", width: 1920, height: 1080 },
  { name: "wider", width: 2560, height: 1440 },
  { name: "4k", width: 3840, height: 2160 },
] as const;

export const WALL_SAMPLES = [[200, 150], [400, 150], [120, 500], [480, 500]] as const;

export function roomToPx(w: number, h: number, x: number, y: number): { x: number; y: number } {
  const s = stageBox(w, h);
  return { x: s.ox + x * s.scale, y: s.oy + y * s.scale };
}

/** Project a known point on the compact window through the current composition. */
export function windowPoint(w: number, h: number, x: number, y: number): { x: number; y: number } {
  if (!placeControls(w, h).landscapeScene) return { x, y };
  return {
    x: LANDSCAPE_WINDOW.x + x - WINDOW.x,
    y: LANDSCAPE_WINDOW.y + (y - WINDOW.y) * LANDSCAPE_WINDOW.height / WINDOW.height,
  };
}

export interface WallSample {
  readonly board: { readonly x: number; readonly y: number };
  readonly joint: { readonly x: number; readonly y: number; readonly width: number };
  readonly course: number;
  readonly block: number;
}

/** The nearest sampleable board centre and its own stepped joint. Null joints are skipped (Q44). */
export function wallSample(sx: number, sy: number, viewport?: { width: number; height: number }): WallSample {
  const tileH = wallHeights(WALL.seed).reduce((a, b) => a + b, 0);
  const guard = viewport && placeControls(viewport.width, viewport.height).landscapeScene ? LANDSCAPE_WINDOW_GUARD : null;
  const nearWindow = (x: number, y: number) => guard && x > guard.x - 5 && x < guard.x + guard.w + 5 &&
    y > guard.y - 5 && y < guard.y + guard.h + 5;
  let best: WallSample | null = null;
  let distance = Infinity;
  for (const b of wallBlocks(WALL.seed)) {
    if (!b.joint) continue;
    for (let dx = -4; dx <= 4; dx++) for (let dy = -3; dy <= 4; dy++) {
      const x = WALL_ORIGIN_X + b.cx + dx * WALL.tileW;
      const y = WALL_ORIGIN_Y + b.cy + dy * tileH;
      const joint = { x: b.joint.x + dx * WALL.tileW, y: b.joint.y + dy * tileH, width: b.joint.width };
      // The approved sampler excludes the window, door and off-stage centres.
      if (x <= 20 || x >= 580 || y <= 20 || y >= 870 ||
          (x > 226 && x < 374 && y < 300) || (x < 120 && y > 780) ||
          nearWindow(x, y) || nearWindow(joint.x, joint.y)) continue;
      const d = (x - sx) ** 2 + (y - sy) ** 2;
      if (d >= distance) continue;
      distance = d;
      best = { board: { x, y }, joint, course: b.c, block: b.i };
    }
  }
  if (!best) throw new Error(`no wall joint near ${sx},${sy}`);
  return best;
}

export type Colour = [number, number, number];
interface PngPixels { readonly width: number; readonly height: number; readonly channels: number; readonly rows: Uint8Array[] }
const cache = new WeakMap<Buffer, PngPixels>();

/** Decodes the 8-bit RGB/RGBA PNG returned by Playwright, without a new dependency. */
function pixels(png: Buffer): PngPixels {
  const found = cache.get(png);
  if (found) return found;
  if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("not a PNG");
  let width = 0, height = 0, channels = 0;
  const idat: Buffer[] = [];
  for (let at = 8; at < png.length;) {
    const len = png.readUInt32BE(at);
    const kind = png.toString("ascii", at + 4, at + 8);
    const data = png.subarray(at + 8, at + 8 + len);
    if (kind === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data[8] !== 8 || ![2, 6].includes(data[9] ?? -1)) throw new Error("unsupported PNG format");
      channels = data[9] === 6 ? 4 : 3;
    }
    if (kind === "IDAT") idat.push(data);
    at += len + 12;
    if (kind === "IEND") break;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows: Uint8Array[] = [];
  let at = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[at++] ?? -1;
    const row = new Uint8Array(stride);
    const prev = rows[y - 1];
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? row[i - channels] ?? 0 : 0;
      const up = prev?.[i] ?? 0;
      const upperLeft = i >= channels ? prev?.[i - channels] ?? 0 : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upperLeft;
        const dl = Math.abs(p - left), du = Math.abs(p - up), dul = Math.abs(p - upperLeft);
        predictor = dl <= du && dl <= dul ? left : du <= dul ? up : upperLeft;
      } else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`);
      row[i] = ((raw[at++] ?? 0) + predictor) & 255;
    }
    rows.push(row);
  }
  const result = { width, height, channels, rows };
  cache.set(png, result);
  return result;
}

/** Mean RGB of a 3 by 3 patch centred on page coordinates (x,y). */
export function patch(png: Buffer, x: number, y: number): Colour {
  const image = pixels(png);
  const cx = Math.round(x), cy = Math.round(y);
  if (cx < 1 || cy < 1 || cx >= image.width - 1 || cy >= image.height - 1) throw new Error(`patch outside ${image.width}x${image.height}: ${cx},${cy}`);
  const sum: Colour = [0, 0, 0];
  for (let yy = cy - 1; yy <= cy + 1; yy++) for (let xx = cx - 1; xx <= cx + 1; xx++) {
    const row = image.rows[yy] as Uint8Array;
    for (let c = 0; c < 3; c++) sum[c] = (sum[c] ?? 0) + (row[xx * image.channels + c] ?? 0);
  }
  return sum.map((v) => v / 9) as Colour;
}

/** Exact pixel for column averages; use patch for local contrast readings. */
export function rgbAt(png: Buffer, x: number, y: number): Colour {
  const image = pixels(png);
  const xx = Math.round(x), yy = Math.round(y);
  if (xx < 0 || yy < 0 || xx >= image.width || yy >= image.height) throw new Error(`pixel outside ${image.width}x${image.height}: ${xx},${yy}`);
  const row = image.rows[yy] as Uint8Array;
  return [row[xx * image.channels]!, row[xx * image.channels + 1]!, row[xx * image.channels + 2]!];
}

export function luminance(rgb: Colour): number {
  const linear = rgb.map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return (linear[0] ?? 0) * 0.2126 + (linear[1] ?? 0) * 0.7152 + (linear[2] ?? 0) * 0.0722;
}
export function ratio(a: Colour, b: Colour): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export const hideInterface = (page: Page): Promise<unknown> => page.addStyleTag({ content: "#ui, .ghost-layer { display: none !important }" });
