// Static Place geometry and seeded dart throwing. Items retain geometry.ts rectangles.
import type { Rect, StoneFace } from "./geometry";

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
/** The same contour drives the drawn face and its shaded side. */
export function stoneOutline({ rect: { w, h }, crown, lean, shoulder }: StoneFace): Point[] {
  const points: Point[] = [[3 + Math.max(0, -lean * 2), h], [0, shoulder]];
  for (let i = 1; i < 16; i++) {
    const t = i / 16;
    const rise = crown === 0 ? Math.sin(t * Math.PI) ** .72
      : crown === 1 ? Math.min(.36, Math.min(t, 1 - t) * 3) + Math.max(0, (Math.min(t, 1 - t) - .12) / .38) * .64
        : Math.min(1, Math.sqrt(Math.min(t, 1 - t) * 8));
    const x = t * w + lean * rise;
    const chip = i === (lean < 0 ? 4 : 12) ? 2.4 : 0;
    points.push([Math.max(0, Math.min(w, x)), shoulder * (1 - rise) + chip]);
  }
  const rightFoot = w - 2 - Math.max(0, lean * 2);
  points.push([w, shoulder + 2], [rightFoot, h - 2], [w * .67, h - 1], [w * .35, h - 4]);
  return points;
}
/** Quadratic outline: start, left control, peak, right control, end; then close. */
export function stoneMound(r: Rect): readonly Point[] {
  const f = r.y + r.h;
  return [[r.x - 16, f + 8], [r.x + 7, f - 5], [r.x + r.w * .43, f - 2], [r.x + r.w - 6, f - 1], [r.x + r.w + 16, f + 9]];
}
export function stoneShadow(r: Rect): readonly Point[] {
  const dx = r.x + r.w / 2 - DOORWAY.cx, dy = r.y + r.h / 2 - DOORWAY.cy;
  const len = Math.hypot(dx, dy);
  const ux = len === 0 ? 0 : dx / len, uy = len === 0 ? 0 : dy / len * .45;
  const f = r.y + r.h;
  return [[r.x - 5, f], [r.x + 7, f - 5], [r.x + r.w + ux * 31, f + uy * 25], [r.x + r.w + 10, f + 5], [r.x + 8, f + 4]];
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
