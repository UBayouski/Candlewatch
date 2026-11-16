// Static room setting and seeded stone geometry. No session or rendering state is read here.
/* eslint-disable @typescript-eslint/no-non-null-assertion -- Fixed construction bounds in the seeded tile algorithms. */
export type Point = [number, number];
export interface Block { x: number; w: number; t: number; off: number; j: number[]; ins: number[] }
interface JointBlock { cx: number; cy: number; t: number; w: number; joint: { x: number; y: number; width: number } }
export const TABLE = { y: 884, h: 16, topEnd: 889, lipEnd: 891.4, underY: 891.9, faceY: 892.4 };
export const HOLDER = { x: 238, w: 124, y: 886, h: 14, rim: { cy: 890.8, rx: 62, ry: 4.8 }, inside: { cy: 891.5, rx: 50, ry: 2.6 } };
export const PANE_FRAME = { x: 240, y: 50, w: 120, h: 210, frame: 8, vx: 276, vw: 6, hy: 110, hh: 6, sillY: 250, sillH: 10 };
export const PANES = [{ x:248,y:58,w:28,h:52 },{ x:282,y:58,w:70,h:52 },{ x:248,y:116,w:28,h:134 },{ x:282,y:116,w:70,h:134 }];
export const STARS: readonly Point3[] = [[262,76,.9],[296,70,.8],[322,66,1],[340,92,.85],[310,100,.8],[292,140,.9],[330,152,1],[318,190,.8],[340,218,.9]];
type Point3 = readonly [number, number, number];
export const WINDOW_LIGHT = { cx: 300, cy: 155, r: 2600, profile: [[0,1],[.08,.92],[.2,.78],[.4,.66],[.65,.52],[.85,.4],[1,.3]] as readonly Point[], night: .5, snuffed: .09, dawn: 1 };
export const EDGE = { near: 320, far: 800, windowShade: .82, veil: .75 };
export const WARM_TINT = { token: "--set-warm-tint", alpha: .42 };
export const WALL = { seed: 20261204, tileW: 960, courses: 8, minWidth: 105, maxWidth: 240, inset: [2.1,3.3] as const, step: 6, gap: 30 };
export const WALL_ORIGIN_X = -2195;
export const WALL_ORIGIN_Y = -600;
export const starOpacity = (dawn: number): number => 1 - dawn;
export const DOOR_WOOD = {
 arch: { x:20,y:805,w:80,h:85,r:40 }, recess: { inset:4,width:3.4 },
 planks: [0,1,2,3].map(k=>({x:24+k*18,y:805,w:18,h:85,tone:k%2})),
 hinges: [826,866], latch: {x:72,y:842,w:18,h:17,rx:2}, threshold:{x:20,y:885.5,w:80,h:4.5,highlightY:886.2}
};
export const SETTING_TOKENS = ["--set-joint", "--set-stone-0", "--set-stone-1", "--set-stone-2", "--set-stone-3", "--set-stone-4", "--set-veil", "--set-table-back", "--set-table-front", "--set-table-seam", "--set-table-edge", "--set-table-face", "--set-dish", "--set-dish-rim", "--set-dish-in", "--set-frame", "--set-frame-hi", "--set-sill", "--set-sill-hi", "--set-plank-a", "--set-plank-b", "--set-plank-joint", "--set-grain", "--set-surround", "--set-recess", "--set-threshold", "--set-iron", "--set-iron-hi", "--set-rivet", "--set-warm-tint", "--set-earth-a", "--set-earth-b", "--set-pebble", "--set-blade", "--set-mound", "--set-stone-side", "--set-shadow", "--set-board-top", "--set-board-front", "--set-board-grain", "--set-sky-low", "--set-hill-far", "--set-hill-mid", "--set-hill-near"] as const;

function wallData(seed: number) {
const n = (v: number) => String(Math.round(v * 100) / 100);
function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const B_SEED = seed;
const TILE_W = 960;
const COURSE_COUNT = 8;
/** Course heights 64 to 96 units (the current wall: five courses of 60). */
const HEIGHTS = (() => {
  const r = mulberry32(B_SEED);
  return Array.from({ length: COURSE_COUNT }, () => Math.round(64 + r() * 32));
})();
const TILE_H = HEIGHTS.reduce((a, b) => a + b, 0);
const NOM_TOP = HEIGHTS.map((_, c) => HEIGHTS.slice(0, c).reduce((a, b) => a + b, 0));
/** Joint width: each block is inset on every side by 2.1 to 3.3 units, so a joint is 4.2 to 6.6 units wide before the corner jitter. */
const INSET = WALL.inset;
/** Tone weights as the current wall: three cool classes, a neutral and a muted warm one; the accents touch no other accent. */
const TONE_WEIGHTS = [0.3, 0.3, 0.22, 0.12, 0.06];
/** The courses' bottom edges step by up to this many units from block to block: a horizontal joint is never one straight line. */
const STEP = WALL.step;

function widths(r: () => number): number[] {
  for (;;) {
    const w = [];
    let sum = 0;
    while (sum < TILE_W - 240) {
      const next = Math.round((105 + r() * 135) / 5) * 5;
      w.push(next);
      sum += next;
    }
    const last = TILE_W - sum;
    if (last >= 105 && last <= 240) return [...w, last];
  }
}
const cd = (p: number, q: number) => Math.min(Math.abs(p - q), TILE_W - Math.abs(p - q));
const staggered = (a: Block[], b: Block[], gap: number) => a.every((p) => b.every((q) => cd(p.x, q.x) >= gap));

function build() {
  const r = mulberry32(B_SEED ^ 0x2545f491);
  const courses: Block[][] = [];
  for (let guard = 0; courses.length < COURSE_COUNT; guard++) {
    if (guard > 50000) throw new Error("wall B: no staggered courses");
    const ws = widths(r);
    let x = Math.floor(r() * TILE_W);
    const c = ws.map((w) => { const b: Block = { x: x % TILE_W, w, t: 0, off: 0, j: [], ins: [] }; x += w; return b; });
    if (courses.length > 0 && !staggered(courses[courses.length - 1]!, c, 30)) continue;
    if (courses.length === COURSE_COUNT - 1 && !staggered(c, courses[0]!, 30)) continue;
    courses.push(c);
  }
  // tones
  const tr = mulberry32(B_SEED ^ 0x9e3779b9);
  const pick = () => { const q = tr(); let acc = 0; for (let i = 0; i < TONE_WEIGHTS.length; i++) { acc += TONE_WEIGHTS[i]!; if (q < acc) return i; } return 0; };
  const overlaps = (a: Block, b: Block) => { const d = (x0: number, w0: number, x1: number, w1: number) => x0 < x1 + w1 && x1 < x0 + w0; return d(a.x, a.w, b.x, b.w) || d(a.x, a.w, b.x + TILE_W, b.w) || d(a.x + TILE_W, a.w, b.x, b.w); };
  courses.forEach((c, ci) => c.forEach((b, bi) => {
    let t = pick();
    if (t >= 3) {
      const near = [...(bi > 0 ? [c[bi - 1]!] : []), ...courses[(ci + COURSE_COUNT - 1) % COURSE_COUNT]!, ...courses[(ci + 1) % COURSE_COUNT]!];
      if (near.some((o) => o.t >= 3 && overlaps(b, o)) || (bi === c.length - 1 && c[0]!.t >= 3)) t = Math.floor(tr() * 3);
    }
    b.t = t;
  }));
  // bottom offsets: neighbours in a course differ by at least 3 units, so the joint steps at every vertical joint
  const orr = mulberry32(B_SEED ^ 0x7f4a7c15);
  courses.forEach((c) => {
    c.forEach((b, bi) => {
      for (let g = 0; ; g++) {
        const v = Math.round((orr() * 2 - 1) * STEP * 2) / 2;
        const prev = bi > 0 ? c[bi - 1]!.off : null;
        const first = bi === c.length - 1 ? c[0]!.off : null;
        if ((prev === null || Math.abs(v - prev) >= 3) && (first === null || Math.abs(v - first) >= 3) || g > 200) { b.off = v; break; }
      }
    });
  });
  // shapes: insets and jitters per block, twelve fixed draws each
  const jr = mulberry32(B_SEED ^ 0x51ed270b);
  courses.forEach((c) => c.forEach((b) => {
    b.j = Array.from({ length: 16 }, () => jr() * 2 - 1);
    b.ins = [0, 1, 2, 3].map(() => INSET[0]! + jr() * (INSET[1]! - INSET[0]!)); // left, right, top, bottom
  }));
  return courses;
}
const COURSES = build();

/** The nominal boundary below course c at tile x (a number in 0..TILE_W), as a tile y. For c = -1 it is the top of course 0 (the previous tile's last course). */
function bottomAt(c: number, xt: number): number {
  const cc = ((c % COURSE_COUNT) + COURSE_COUNT) % COURSE_COUNT;
  const nom = c < 0 ? 0 : NOM_TOP[cc]! + HEIGHTS[cc]!;
  const course = COURSES[cc]!;
  const b = course.find((q) => ((xt - q.x + TILE_W) % TILE_W) < q.w);
  if (!b) throw new Error("No block at tile coordinate");
  return nom + b.off;
}
/** Steps of course c (x positions inside (x0, x1), in the block's unwrapped coordinates) */
function stepsIn(c: number, x0: number, x1: number): number[] {
  const cc = ((c % COURSE_COUNT) + COURSE_COUNT) % COURSE_COUNT;
  const out: number[] = [];
  for (const q of COURSES[cc]!) for (const m of [-1, 0, 1, 2]) { const s = q.x + m * TILE_W; if (s > x0 + 0.5 && s < x1 - 0.5) out.push(s); }
  return out.sort((a, b) => a - b);
}

/** One block's polygon in unwrapped tile coordinates: {top: [[x, y]...] left to right, bottom: [[x, y]...] right to left, cx, cy}. */
function shape(ci: number, bi: number) {
  const b = COURSES[ci]![bi]!;
  const [iL = 0, iR = 0, iT = 0, iB = 0] = b.ins;
  const j = b.j, J = 1.3;
  const x0 = b.x + iL, x1 = b.x + b.w - iR;
  const yb = NOM_TOP[ci]! + HEIGHTS[ci]! + b.off - iB;
  const top: Point[] = [];
  const xsStart = x0 + j[0]! * J, xsEnd = x1 + j[1]! * J;
  // the top edge of course 0 follows the previous tile's last course: its boundary is at y = off (tile y 0 + off)
  const topY = (x: number) => (ci === 0 ? bottomAt(-1, ((x % TILE_W) + TILE_W) % TILE_W) : bottomAt(ci - 1, ((x % TILE_W) + TILE_W) % TILE_W)) + iT;
  const xs = [x0, ...stepsIn(ci - 1, x0, x1), x1];
  top.push([xsStart, topY(x0 + 0.25) + j[2]! * 0.9]);
  xs.slice(1, -1).forEach((s, k) => {
    top.push([s - 1.4 - Math.abs(j[3 + (k % 3)]!) * 0.8, topY(s - 1) + j[6 + (k % 3)]! * 0.5]);
    top.push([s + 1.4 + Math.abs(j[3 + (k % 3)]!) * 0.8, topY(s + 1) + j[9 + (k % 3)]! * 0.5]);
  });
  top.push([xsEnd, topY(x1 - 0.25) + j[12]! * 0.9]);
  const mx = (x0 + x1) / 2 + j[13]! * 8;
  const bottom: Point[] = [
    [x1 + j[14]! * J, yb + j[15]! * 0.6],
    [mx, yb + j[2]! * 0.7],
    [x0 + j[0]! * J * -1, yb + j[5]! * 0.6],
  ];
  const cx = (x0 + x1) / 2;
  // the block's centre is where the picture is read: top and bottom at that x
  const topAtC = interp(top, cx), botAtC = interp([...bottom].reverse(), cx);
  return { top, bottom, cx, cy: (topAtC + botAtC) / 2, topAtC, botAtC, t: b.t, w: b.w, c: ci, i: bi, x: b.x };
}
function interp(poly: Point[], x: number): number {
  for (let k = 0; k + 1 < poly.length; k++) {
    const [xa, ya] = poly[k]!, [xb, yb] = poly[k + 1]!;
    if (x >= xa && x <= xb && xb > xa) return ya + ((yb - ya) * (x - xa)) / (xb - xa);
  }
  return poly[poly.length - 1]![1];
}
type Shape = ReturnType<typeof shape>;
const SHAPES = COURSES.map((c, ci) => c.map((_, bi) => shape(ci, bi)));

// ---------------------------------------------------------------- the tile
const WALL_Y0 = -600;
const WALL_X0 = -2195;
const pathOf = (s: Shape, dx: number, dy: number) => `M${s.top.map(([x, y]) => `${n(x + dx)} ${n(y + dy)}`).join("L")}L${s.bottom.map(([x, y]) => `${n(x + dx)} ${n(y + dy)}`).join("L")}Z`;
function stoneTileB() {
  const parts = [`<rect class="s-joint" x="0" y="0" width="${TILE_W}" height="${TILE_H}"/>`];
  const byTone = ["", "", "", "", ""];
  SHAPES.forEach((course) => course.forEach((s) => {
    // a block that crosses the tile's side is drawn twice; the first and last courses spill over the tile's top and bottom by their joint steps, so they are drawn once more one tile away
    const dys = s.c === 0 ? [0, TILE_H] : s.c === COURSE_COUNT - 1 ? [0, -TILE_H] : [0];
    for (const dx of s.x + s.w > TILE_W ? [0, -TILE_W] : [0]) for (const dy of dys) byTone[s.t]! += pathOf(s, dx, dy);
  }));
  byTone.forEach((d, t) => parts.push(`<path class="s-b s-b${t}" d="${d}"/>`));
  return `<pattern id="cw-stone" patternUnits="userSpaceOnUse" x="${WALL_X0}" y="${WALL_Y0}" width="${TILE_W}" height="${TILE_H}">${parts.join("")}</pattern>`;
}

// ---------------------------------------------------------------- what measure.mjs reads: blocks, and the joint below a block, in room units
/** Every block that has its centre in the room rectangle y0..y1, as {cx, cy, t, w, joint: {x, y, width}} (the joint is read below the block, at the block's centre x). */
function blocksIn(y0: number, y1: number) {
  const out: JointBlock[] = [];
  const k0 = Math.floor((y0 - WALL_Y0) / TILE_H) - 1, k1 = Math.floor((y1 - WALL_Y0) / TILE_H) + 1;
  for (let k = k0; k <= k1; k++) {
    SHAPES.forEach((course, ci) => course.forEach((s) => {
      for (let m = -4; m <= 4; m++) {
        const cxT = s.cx + m * TILE_W;
        // the block below, at this x
        const below = ci + 1 < COURSE_COUNT ? SHAPES[ci + 1]! : SHAPES[0]!;
        const dy = ci + 1 < COURSE_COUNT ? 0 : TILE_H;
        const xt = ((cxT % TILE_W) + TILE_W) % TILE_W;
        let topBelow = null;
        for (const q of below) for (const sh of [0, -TILE_W, TILE_W]) {
          const lo = q.top[0]![0] + sh, hi = q.top[q.top.length - 1]![0] + sh;
          if (xt >= lo && xt <= hi) topBelow = interp(q.top.map(([x, y]) => [x + sh, y]), xt) + dy;
        }
        if (topBelow === null) continue;
        const cy = WALL_Y0 + k * TILE_H + s.cy;
        if (cy < y0 - 100 || cy > y1 + 100) continue;
        const bot = WALL_Y0 + k * TILE_H + s.botAtC;
        const top2 = WALL_Y0 + k * TILE_H + topBelow;
        out.push({ cx: WALL_X0 + cxT, cy, t: s.t, w: s.w, joint: { x: WALL_X0 + cxT, y: (bot + top2) / 2, width: top2 - bot } });
      }
    }));
  }
  return out;
}


return { courses: COURSES, heights: HEIGHTS, shapes: SHAPES, tile: stoneTileB(), blocksIn };
}
export const wallCoursesB = (seed: number) => wallData(seed).courses;
export const wallHeights = (seed: number) => wallData(seed).heights;
export const wallTile = (seed: number) => wallData(seed).tile;
export const wallBlocks = (seed: number) => {
  const data = wallData(seed);
  const joints = data.blocksIn(WALL_ORIGIN_Y, WALL_ORIGIN_Y + data.heights.reduce((a,b)=>a+b,0));
  return data.shapes.flat().map(s => ({...s, joint: joints.find(b=> Math.abs(b.cx-(WALL_ORIGIN_X+s.cx))<.001 && Math.abs(b.cy-(WALL_ORIGIN_Y+s.cy))<.001)?.joint ?? null}));
};
