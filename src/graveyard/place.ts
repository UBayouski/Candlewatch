// Static Place geometry and seeded dart throwing. Items retain geometry.ts rectangles.
import type { Rect } from "./geometry";

export type Point = readonly [number, number];
export const HORIZON_Y = 224;
export const HAZE = 60;
export const DOORWAY = { cx: 60, cy: 847.5, r: 760, sx: 1.7 };
export const PLACE_CLIP_Y = 900;
export const GROUND_RECT: Rect = { x: -2200, y: HORIZON_Y, w: 5000, h: PLACE_CLIP_Y - HORIZON_Y };
export const SKY_RECT: Rect = { x: -2200, y: -600, w: 5000, h: HORIZON_Y + HAZE + 600 };

export function shelfBoard(rowY: number, count: number): Rect {
  return { x: 109, y: rowY + 69, w: count * 84 + 8, h: 12 };
}
export function stoneSide(rect: Rect): readonly (Rect & { radius: number })[] {
  return [1, 2, 3, 4].map(k => ({ ...rect, x: rect.x + k * 9 / 4, y: rect.y - k * 6 / 4, radius: 44 }));
}
/** Quadratic outline: start, left control, peak, right control, end; then close. */
export function stoneMound(r: Rect): readonly Point[] {
  const f = r.y + r.h;
  return [[r.x - 26, f + 12], [r.x + 6, f - 2], [r.x + r.w / 2, f - 3], [r.x + r.w - 6, f - 2], [r.x + r.w + 26, f + 12]];
}
export function stoneShadow(r: Rect): readonly Point[] {
  const dx = r.x + r.w / 2 - DOORWAY.cx, dy = r.y + r.h / 2 - DOORWAY.cy;
  const len = Math.hypot(dx, dy);
  const ux = len === 0 ? 0 : dx / len, uy = len === 0 ? 0 : dy / len * .45;
  const f = r.y + r.h + 1;
  return [[r.x + 6, f], [r.x + r.w, f], [r.x + r.w + ux * 46, f + uy * 46], [r.x + 6 + ux * 46, f + uy * 46]];
}
export function textRects(rowYs: readonly number[]): Rect[] {
  return [{ x:14,y:213,w:572,h:32 },{ x:14,y:461,w:572,h:32 },{ x:14,y:427,w:572,h:32 },{ x:14,y:759,w:572,h:32 },
    ...rowYs.flatMap(y => [{x:14,y,w:90,h:76},{x:450,y,w:110,h:76}])];
}
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function scatter(seed: number, box: { x0: number; x1: number; y0: number; y1: number }, count: number, gap: number, avoid: readonly Rect[]): Point[] {
  const rnd = mulberry32(seed), pts: Point[] = [];
  let tries = 0;
  while (pts.length < count && tries++ < count * 60) {
    const x = box.x0 + rnd() * (box.x1 - box.x0), y = box.y0 + rnd() * (box.y1 - box.y0);
    if (avoid.some(r => x > r.x - 5 && x < r.x + r.w + 5 && y > r.y - 5 && y < r.y + r.h + 5)) continue;
    if (pts.every(([px,py]) => Math.hypot(px - x, py - y) >= gap)) pts.push([x,y]);
  }
  return pts;
}
export function groundMarks(seed = 7741, avoid: readonly Rect[] = []): { pebbles: Point[]; blades: Point[] } {
  const box = { x0:-1100, x1:1700, y0:HORIZON_Y + 30, y1:890 };
  return { pebbles:scatter(seed,box,150,26,avoid), blades:scatter(seed + (9173 - 7741),box,90,40,avoid) };
}
