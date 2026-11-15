// Wall B (the fourth pass's A/B alternative, ADOPTED by the owner on 2026-11-15: it is the wall): fewer courses and larger, uneven stones, tone classes
// that differ less, joints that are neither one width nor continuous straight lines. Every choice is from a fixed seed (no Math.random, no Date).
// Light, veil and edge shade are the current wall's, untouched; only the tile differs. The geometry is kept as data so measure.mjs reads the
// same blocks and joint lines that the picture draws.
const n = (v) => String(Math.round(v * 100) / 100);
function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const B_SEED = 20261204;
export const TILE_W = 960;
export const COURSE_COUNT = 8;
/** Course heights 64 to 96 units (the current wall: five courses of 60). */
export const HEIGHTS = (() => {
  const r = mulberry32(B_SEED);
  return Array.from({ length: COURSE_COUNT }, () => Math.round(64 + r() * 32));
})();
export const TILE_H = HEIGHTS.reduce((a, b) => a + b, 0);
const NOM_TOP = HEIGHTS.map((_, c) => HEIGHTS.slice(0, c).reduce((a, b) => a + b, 0));
/** Joint width: each block is inset on every side by 2.1 to 3.3 units, so a joint is 4.2 to 6.6 units wide before the corner jitter. */
const INSET = [2.1, 3.3];
/** Tone weights as the current wall: three cool classes, a neutral and a muted warm one; the accents touch no other accent. */
const TONE_WEIGHTS = [0.3, 0.3, 0.22, 0.12, 0.06];
/** The courses' bottom edges step by up to this many units from block to block: a horizontal joint is never one straight line. */
const STEP = 6;

function widths(r) {
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
const cd = (p, q) => Math.min(Math.abs(p - q), TILE_W - Math.abs(p - q));
const staggered = (a, b, gap) => a.every((p) => b.every((q) => cd(p.x, q.x) >= gap));

function build() {
  const r = mulberry32(B_SEED ^ 0x2545f491);
  const courses = [];
  for (let guard = 0; courses.length < COURSE_COUNT; guard++) {
    if (guard > 50000) throw new Error("wall B: no staggered courses");
    const ws = widths(r);
    let x = Math.floor(r() * TILE_W);
    const c = ws.map((w) => { const b = { x: x % TILE_W, w }; x += w; return b; });
    if (courses.length > 0 && !staggered(courses[courses.length - 1], c, 30)) continue;
    if (courses.length === COURSE_COUNT - 1 && !staggered(c, courses[0], 30)) continue;
    courses.push(c);
  }
  // tones
  const tr = mulberry32(B_SEED ^ 0x9e3779b9);
  const pick = () => { const q = tr(); let acc = 0; for (let i = 0; i < TONE_WEIGHTS.length; i++) { acc += TONE_WEIGHTS[i]; if (q < acc) return i; } return 0; };
  const overlaps = (a, b) => { const d = (x0, w0, x1, w1) => x0 < x1 + w1 && x1 < x0 + w0; return d(a.x, a.w, b.x, b.w) || d(a.x, a.w, b.x + TILE_W, b.w) || d(a.x + TILE_W, a.w, b.x, b.w); };
  courses.forEach((c, ci) => c.forEach((b, bi) => {
    let t = pick();
    if (t >= 3) {
      const near = [...(bi > 0 ? [c[bi - 1]] : []), ...courses[(ci + COURSE_COUNT - 1) % COURSE_COUNT], ...courses[(ci + 1) % COURSE_COUNT]];
      if (near.some((o) => o.t >= 3 && overlaps(b, o)) || (bi === c.length - 1 && c[0].t >= 3)) t = Math.floor(tr() * 3);
    }
    b.t = t;
  }));
  // bottom offsets: neighbours in a course differ by at least 3 units, so the joint steps at every vertical joint
  const orr = mulberry32(B_SEED ^ 0x7f4a7c15);
  courses.forEach((c, ci) => {
    c.forEach((b, bi) => {
      for (let g = 0; ; g++) {
        const v = Math.round((orr() * 2 - 1) * STEP * 2) / 2;
        const prev = bi > 0 ? c[bi - 1].off : null;
        const first = bi === c.length - 1 ? c[0].off : null;
        if ((prev === null || Math.abs(v - prev) >= 3) && (first === null || Math.abs(v - first) >= 3) || g > 200) { b.off = v; break; }
      }
    });
  });
  // shapes: insets and jitters per block, twelve fixed draws each
  const jr = mulberry32(B_SEED ^ 0x51ed270b);
  courses.forEach((c) => c.forEach((b) => {
    b.j = Array.from({ length: 16 }, () => jr() * 2 - 1);
    b.ins = [0, 1, 2, 3].map(() => INSET[0] + jr() * (INSET[1] - INSET[0])); // left, right, top, bottom
  }));
  return courses;
}
export const COURSES = build();

/** The nominal boundary below course c at tile x (a number in 0..TILE_W), as a tile y. For c = -1 it is the top of course 0 (the previous tile's last course). */
function bottomAt(c, xt) {
  const cc = ((c % COURSE_COUNT) + COURSE_COUNT) % COURSE_COUNT;
  const nom = c < 0 ? 0 : NOM_TOP[cc] + HEIGHTS[cc];
  const course = COURSES[cc];
  const b = course.find((q) => ((xt - q.x + TILE_W) % TILE_W) < q.w);
  return nom + b.off;
}
/** Steps of course c (x positions inside (x0, x1), in the block's unwrapped coordinates) */
function stepsIn(c, x0, x1) {
  const cc = ((c % COURSE_COUNT) + COURSE_COUNT) % COURSE_COUNT;
  const out = [];
  for (const q of COURSES[cc]) for (const m of [-1, 0, 1, 2]) { const s = q.x + m * TILE_W; if (s > x0 + 0.5 && s < x1 - 0.5) out.push(s); }
  return out.sort((a, b) => a - b);
}

/** One block's polygon in unwrapped tile coordinates: {top: [[x, y]...] left to right, bottom: [[x, y]...] right to left, cx, cy}. */
function shape(ci, bi) {
  const b = COURSES[ci][bi];
  const [iL, iR, iT, iB] = b.ins;
  const j = b.j, J = 1.3;
  const x0 = b.x + iL, x1 = b.x + b.w - iR;
  const yb = NOM_TOP[ci] + HEIGHTS[ci] + b.off - iB;
  const top = [];
  const xsStart = x0 + j[0] * J, xsEnd = x1 + j[1] * J;
  // the top edge of course 0 follows the previous tile's last course: its boundary is at y = off (tile y 0 + off)
  const topY = (x) => (ci === 0 ? bottomAt(-1, ((x % TILE_W) + TILE_W) % TILE_W) : bottomAt(ci - 1, ((x % TILE_W) + TILE_W) % TILE_W)) + iT;
  const xs = [x0, ...stepsIn(ci - 1, x0, x1), x1];
  top.push([xsStart, topY(x0 + 0.25) + j[2] * 0.9]);
  xs.slice(1, -1).forEach((s, k) => {
    top.push([s - 1.4 - Math.abs(j[3 + (k % 3)]) * 0.8, topY(s - 1) + j[6 + (k % 3)] * 0.5]);
    top.push([s + 1.4 + Math.abs(j[3 + (k % 3)]) * 0.8, topY(s + 1) + j[9 + (k % 3)] * 0.5]);
  });
  top.push([xsEnd, topY(x1 - 0.25) + j[12] * 0.9]);
  const mx = (x0 + x1) / 2 + j[13] * 8;
  const bottom = [
    [x1 + j[14] * J, yb + j[15] * 0.6],
    [mx, yb + j[2] * 0.7],
    [x0 + j[0] * J * -1, yb + j[5] * 0.6],
  ];
  const cx = (x0 + x1) / 2;
  // the block's centre is where the picture is read: top and bottom at that x
  const topAtC = interp(top, cx), botAtC = interp([...bottom].reverse(), cx);
  return { top, bottom, cx, cy: (topAtC + botAtC) / 2, topAtC, botAtC, t: b.t, w: b.w, c: ci, i: bi, x: b.x };
}
function interp(poly, x) {
  for (let k = 0; k + 1 < poly.length; k++) {
    const [xa, ya] = poly[k], [xb, yb] = poly[k + 1];
    if (x >= xa && x <= xb && xb > xa) return ya + ((yb - ya) * (x - xa)) / (xb - xa);
  }
  return poly[poly.length - 1][1];
}
export const SHAPES = COURSES.map((c, ci) => c.map((_, bi) => shape(ci, bi)));

// ---------------------------------------------------------------- the tile
export const WALL_Y0 = -600;
export const WALL_X0 = -2195;
const pathOf = (s, dx, dy) => `M${s.top.map(([x, y]) => `${n(x + dx)} ${n(y + dy)}`).join("L")}L${s.bottom.map(([x, y]) => `${n(x + dx)} ${n(y + dy)}`).join("L")}Z`;
export function stoneTileB() {
  const parts = [`<rect class="s-joint" x="0" y="0" width="${TILE_W}" height="${TILE_H}"/>`];
  const byTone = ["", "", "", "", ""];
  SHAPES.forEach((course) => course.forEach((s) => {
    // a block that crosses the tile's side is drawn twice; the first and last courses spill over the tile's top and bottom by their joint steps, so they are drawn once more one tile away
    const dys = s.c === 0 ? [0, TILE_H] : s.c === COURSE_COUNT - 1 ? [0, -TILE_H] : [0];
    for (const dx of s.x + s.w > TILE_W ? [0, -TILE_W] : [0]) for (const dy of dys) byTone[s.t] += pathOf(s, dx, dy);
  }));
  byTone.forEach((d, t) => parts.push(`<path class="s-b s-b${t}" d="${d}"/>`));
  return `<pattern id="cw-stone" patternUnits="userSpaceOnUse" x="${WALL_X0}" y="${WALL_Y0}" width="${TILE_W}" height="${TILE_H}">${parts.join("")}</pattern>`;
}

// ---------------------------------------------------------------- what measure.mjs reads: blocks, and the joint below a block, in room units
/** Every block that has its centre in the room rectangle y0..y1, as {cx, cy, t, w, joint: {x, y, width}} (the joint is read below the block, at the block's centre x). */
export function blocksIn(y0, y1) {
  const out = [];
  const k0 = Math.floor((y0 - WALL_Y0) / TILE_H) - 1, k1 = Math.floor((y1 - WALL_Y0) / TILE_H) + 1;
  for (let k = k0; k <= k1; k++) {
    SHAPES.forEach((course, ci) => course.forEach((s) => {
      for (let m = -4; m <= 4; m++) {
        const cxT = s.cx + m * TILE_W;
        // the block below, at this x
        const below = ci + 1 < COURSE_COUNT ? SHAPES[ci + 1] : SHAPES[0];
        const dy = ci + 1 < COURSE_COUNT ? 0 : TILE_H;
        const xt = ((cxT % TILE_W) + TILE_W) % TILE_W;
        let topBelow = null;
        for (const q of below) for (const sh of [0, -TILE_W, TILE_W]) {
          const lo = q.top[0][0] + sh, hi = q.top[q.top.length - 1][0] + sh;
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

/** The block that contains the room point (x, y) and the distance from the point to that block's nearest edge (units), or null on a joint. */
export function locate(x, y) {
  const xt = (((x - WALL_X0) % TILE_W) + TILE_W) % TILE_W;
  const k = Math.floor((y - WALL_Y0) / TILE_H);
  const yt = y - WALL_Y0 - k * TILE_H;
  let best = null;
  for (const course of SHAPES) for (const s of course) for (const dx of [0, -TILE_W, TILE_W]) for (const dy of [0, TILE_H, -TILE_H]) {
    const lo = s.top[0][0] + dx, hi = s.top[s.top.length - 1][0] + dx;
    if (xt < lo || xt > hi) continue;
    const topY = interp(s.top.map(([px, py]) => [px + dx, py]), xt) + dy;
    const botY = interp([...s.bottom].reverse().map(([px, py]) => [px + dx, py]), xt) + dy;
    if (yt < topY || yt > botY) continue;
    const margin = Math.min(yt - topY, botY - yt, xt - lo, hi - xt);
    if (!best || margin > best.margin) best = { t: s.t, c: s.c, margin };
  }
  return best;
}
