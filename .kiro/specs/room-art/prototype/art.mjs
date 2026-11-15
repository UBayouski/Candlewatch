// The new art of the room-art spec, as markup and CSS strings. Everything here is the DELTA over the real room: the candle, the
// flame, the halo and the pool come from src/scene/room.ts unchanged (build.mjs patches the real ROOM_SVG; it never redraws them).
// Room units: the stage is 600 x 1000, the floor line is y = 900. Every "random" choice is a fixed seed (R1.11): no Math.random, no Date.
import { sceneConstants, slots } from "./source.mjs";
import { stoneTileB } from "./wall-b.mjs";

const n = (v) => String(Math.round(v * 100) / 100);
const frac = (v) => v - Math.floor(v);
function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- the window (D6)
/** The window pane, from src/scene/constants.ts: x 240..360, y 50..260. The Frame is drawn inside it. */
export const PANE = sceneConstants.WINDOW;
/** Vertical mullion x 276..282, horizontal mullion y 110..116: off the centre lines, so the glass centre (300, 155) is glass (D6). */
export const MULLION = { vx: 276, vw: 6, hy: 110, hh: 6 };
export const PANES = [
  { x: 248, y: 58, w: 28, h: 52 },
  { x: 282, y: 58, w: 70, h: 52 },
  { x: 248, y: 116, w: 28, h: 134 },
  { x: 282, y: 116, w: 70, h: 134 },
];
/** At most 9 stars, 1.6 to 2 units across, all inside the panes (diameter = 2 r). */
export const STARS = [
  [262, 76, 0.9], [296, 70, 0.8], [322, 66, 1], [340, 92, 0.85], [310, 100, 0.8],
  [292, 140, 0.9], [330, 152, 1], [318, 190, 0.8], [340, 218, 0.9],
];
/** The Window_Light's centre, reach and profile. The levels (night, snuffed, dawn) are CSS custom properties. */
export const WINDOW_LIGHT = { cx: 300, cy: 155, r: 2600 };
export const WL_PROFILE = [[0, 1], [0.08, 0.92], [0.2, 0.78], [0.4, 0.66], [0.65, 0.52], [0.85, 0.4], [1, 0.3]];
export const WL_LEVELS = { night: 0.5, snuffed: 0.09, dawn: 1 };

// ---------------------------------------------------------------- the wall (D1): wall B, adopted. Its seeded generator is wall-b.mjs (8 courses, staircase joints, one path per tone class)

// ---------------------------------------------------------------- the periphery (third pass): wall veil and Window_Light edge shade
/** Both depend on the horizontal distance from the window's axis (x = 300) only: 0 up to EDGE_NEAR, full at EDGE_FAR, held beyond (an ultrawide page does not go black). */
export const EDGE_NEAR = 320;
export const EDGE_FAR = 800;
const edgeStops = (cls) =>
  [[-1500, 1], [-EDGE_FAR, 1], [-EDGE_NEAR, 0], [EDGE_NEAR, 0], [EDGE_FAR, 1], [1500, 1]]
    .map(([d, k]) => `<stop offset="${(300 + d + 2200) / 5000}" class="${cls}" data-k="${k}"/>`).join("");
const VEIL_DEFS = `<linearGradient id="cw-veil-grad" gradientUnits="userSpaceOnUse" x1="-2200" y1="0" x2="2800" y2="0">${edgeStops("st-veil")}</linearGradient>` +
  `<linearGradient id="cw-win-edge-grad" gradientUnits="userSpaceOnUse" x1="-2200" y1="0" x2="2800" y2="0">${edgeStops("st-wedge")}</linearGradient>`;

// ---------------------------------------------------------------- the table (D2): top surface, a lit front edge, a front face
const TABLE = { y: 884, h: 16, edgeY: 892.6 };
const tableSeams = (yEnd = TABLE.edgeY) => {
  const d = [];
  for (let x = -1900; x <= 2500; x += 150) d.push(`M${x} ${TABLE.y} L${n(x + (x - 300) * 0.035 * ((yEnd - TABLE.y) / (TABLE.edgeY - TABLE.y)))} ${yEnd}`);
  return d.join(" ");
};

// ---------------------------------------------------------------- the door wood (D8), inside DOOR_RECT x 20..100, y 805..890
const archPath = (i, bottom = 890) => `M${20 + i} ${bottom} V845 A${40 - i} ${40 - i} 0 0 1 ${100 - i} 845 V${bottom} Z`;
const doorWood = () => {
  const planks = [0, 1, 2, 3].map((k) => `<rect class="${k % 2 ? "w-plank-b" : "w-plank-a"}" x="${24 + k * 18}" y="805" width="18" height="85"/>`).join("");
  const joints = [1, 2, 3].map((k) => `M${24 + k * 18} 806 V890`).join(" ");
  const fibre = "M29 818 V846 M33 832 V872 M47 812 V838 M51 852 V884 M65 820 V858 M69 842 V878 M83 816 V848 M87 854 V884";
  const hinge = (y) => `<path class="w-iron" d="M24 ${y} h26 l6 3 l-6 3 h-26 z"/><circle class="w-pin" cx="28" cy="${y + 3}" r="2.6"/><circle class="w-rivet" cx="40" cy="${y + 3}" r="1.2"/><circle class="w-rivet" cx="47" cy="${y + 3}" r="1.2"/>`;
  return (
    `<g class="door-wood">` +
    `<path class="w-surround" d="${archPath(0)}"/>` +
    `<g clip-path="url(#cw-door-clip)">${planks}<path class="w-joint" d="${joints}"/><path class="w-fibre" d="${fibre}"/>` +
    hinge(826) + hinge(866) +
    `<rect class="w-iron" x="72" y="842" width="18" height="17" rx="2"/><circle class="w-rivet" cx="75" cy="845" r="1.1"/><circle class="w-rivet" cx="87" cy="845" r="1.1"/><circle class="w-rivet" cx="75" cy="856" r="1.1"/><circle class="w-rivet" cx="87" cy="856" r="1.1"/>` +
    `</g>` +
    `<path class="w-recess" d="M24 890 V845 A36 36 0 0 1 60 809"/>` +
    `<rect class="w-threshold" x="20" y="885.5" width="80" height="4.5"/><path class="w-threshold-hi" d="M20 886.2 H100"/>` +
    `</g>`
  );
};

// ---------------------------------------------------------------- the pieces of the room's SVG
export const defsArt = () => [
  stoneTileB(),
  VEIL_DEFS,
  `<radialGradient id="cw-win-hole">` + WL_PROFILE.map(([o, k]) => `<stop offset="${o}" stop-color="#000" class="st-wl" data-k="${k}"/>`).join("") + `</radialGradient>`,
  `<mask id="cw-panes" maskUnits="userSpaceOnUse" x="236" y="46" width="128" height="218">${PANES.map((p) => `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="1.5" fill="#fff"/>`).join("")}</mask>`,
  `<clipPath id="cw-door-clip"><path d="M24 890 V845 A36 36 0 0 1 96 845 V890 Z"/></clipPath>`,
  `<linearGradient id="cw-table-grad" x1="0" y1="0" x2="0" y2="1"><stop class="st-table-back" offset="0"/><stop class="st-table-front" offset="1"/></linearGradient>`,
].join("\n");
export const DEFS_ART = defsArt();

export const MASK_ART = `<circle class="win-light" cx="${WINDOW_LIGHT.cx}" cy="${WINDOW_LIGHT.cy}" r="${WINDOW_LIGHT.r}" fill="url(#cw-win-hole)"/>
<rect class="win-edge" x="-2200" y="-600" width="5000" height="1500" fill="url(#cw-win-edge-grad)"/>`;

export const settingGroup = () => [
  `<g class="setting">`,
  `<rect class="wall-stone" x="-2200" y="-600" width="5000" height="${TABLE.y + 600}" fill="url(#cw-stone)"/>`,
  `<rect class="wall-veil" x="-2200" y="-600" width="5000" height="${TABLE.y + 600}" fill="url(#cw-veil-grad)"/>`,
  `<g class="table">`,
  // the lit front edge is high on the table, above the zone's (short) shadow: top 884..889, lit lip 889..891.4, a dark under-line, front face 892.4..900.
  // The table is 16 high and its front face ends on the floor line.
  `<rect class="t-top" x="-2200" y="${TABLE.y}" width="5000" height="5" fill="url(#cw-table-grad)"/>`,
  `<path class="t-seam" d="${tableSeams(889)}"/>`,
  `<path class="t-back" d="M-2200 ${TABLE.y + 0.5} H2800"/>`,
  `<rect class="t-lip" x="-2200" y="889" width="5000" height="2.4"/>`,
  `<path class="t-under" d="M-2200 891.9 H2800"/>`,
  `<rect class="t-face" x="-2200" y="892.4" width="5000" height="7.6"/>`,
  `</g>`,
  // the holder: a pewter dish at the candle's base, behind the candle (x 238..362, y 886..900: 124 by 14), its rim at full depth
  `<g class="holder"><path class="h-body" d="M238 891.5 Q240 899.8 252 899.8 L348 899.8 Q360 899.8 362 891.5 Z"/><ellipse class="h-rim" cx="300" cy="890.8" rx="62" ry="4.8"/><ellipse class="h-in" cx="300" cy="891.5" rx="50" ry="2.6"/><path class="h-lip" d="M241.5 890.9 A58.5 4.1 0 0 1 358.5 890.9"/></g>`,
  `<g class="frame"><rect class="f-wood" x="${PANE.x}" y="${PANE.y}" width="${PANE.width}" height="${PANE.height}"/>` +
    `<path class="f-hi" d="M${PANE.x} ${PANE.y + 0.8} H${PANE.x + PANE.width} M${PANE.x + 0.8} ${PANE.y} V${PANE.y + PANE.height}"/>` +
    `<rect class="f-sill" x="${PANE.x}" y="250" width="${PANE.width}" height="10"/><path class="f-sill-hi" d="M${PANE.x} 250.8 H${PANE.x + PANE.width}"/></g>`,
  doorWood(),
  `</g>`,
].join("\n");
export const SETTING_GROUP = settingGroup();

export const STARS_GROUP = `<g class="stars">${STARS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}</g>`;

// ---------------------------------------------------------------- the pool's warm tint (F16, adopted by the owner: the default look)
export const TINT_DEFS =
  `<radialGradient id="cw-tint-hole"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.6" stop-color="#fff" stop-opacity="0.75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
  `<mask id="cw-tint-mask" maskUnits="userSpaceOnUse" x="-2200" y="-600" width="5000" height="1500"><rect x="-2200" y="-600" width="5000" height="1500" fill="#000"/><circle class="pool-tint" cx="0" cy="0" r="700" fill="url(#cw-tint-hole)"/></mask>`;
export const TINT_RECT = `<rect class="warm-tint" x="-2200" y="-600" width="5000" height="1500" mask="url(#cw-tint-mask)"/>`;

// ---------------------------------------------------------------- the ghosts (D7): three shapes of their own, 70 by 75 box
const GB = slots.GHOST_BOX;
/** Narrow shoulders (half width 16 to 24), a body that tapers into a wisp trailing to one side, asymmetric by variant. */
export const GHOST_SHAPES = [
  // 0: the wisp trails down and to the right, a short flick hangs on the left
  "M -3 -37.5 C 10 -37.5 21 -28 21 -14 C 21 -2 18 8 24 18 C 29 26 35 30 35 37.5 C 26 33 14 36 7 27 C 0 20 -10 28 -17 19 C -23 12 -22 4 -22 -4 C -22 -10 -21 -14 -21 -16 C -21 -28 -12 -37.5 -3 -37.5 Z",
  // 1: ragged little hem on the right, the long wisp sweeps to the left and down
  "M 4 -37.5 C 16 -37.5 24 -28 24 -13 C 24 -2 23 8 20 16 L 16 22 L 13 17 L 9 26 L 4 20 C -4 26 -18 33 -35 37.5 C -27 28 -24 16 -22 4 C -20 -4 -19 -9 -19 -13 C -19 -28 -9 -37.5 4 -37.5 Z",
  // 2: a hooked tail curling to the right and one arm lifted on the left
  "M -6 -37.5 C 6 -37.5 16 -29 16 -16 C 16 -4 14 6 18 16 C 22 26 30 26 30 37.5 C 24 32 12 28 6 22 C -2 14 -8 12 -14 6 C -22 0 -35 -4 -35 -12 C -35 -15 -29 -15 -23 -13 C -20 -14 -20 -20 -19 -24 C -17 -32 -13 -37.5 -6 -37.5 Z",
];
/** Where the eyes sit on each shape, relative to the body: identical on every ghost of a variant (R5.3). */
export const GHOST_EYES = [
  [[-8, -19], [5, -19]],
  [[-4, -19], [9, -19]],
  [[-11, -21], [2, -21]],
];
export const hemPath = (variant) => GHOST_SHAPES[variant];
/** The look of one ghost, from its index only (R5.5, R1.12): variant, a tilt of 0 to 3 degrees (at most 6 allowed), and two fractions in [-1, 1]. */
export function ghostLook(index) {
  return { variant: index % 3, tilt: (frac(index * 0.7548776662466927) * 2 - 1) * 3, fx: frac(index * 0.6180339887498949) * 2 - 1, fy: frac(index * 0.4142135623730951 + 0.3) * 2 - 1 };
}
const CELL = { w: 90, h: 95 };
/** Where the ghost rests: the slot centre plus an offset bounded by the cell's spare room at this size, with the drift (8) and a 3-degree tilt kept (R5.6, R5.7). */
export function placeGhost(slot, index, size) {
  const t = (3 * Math.PI) / 180;
  const spareX = Math.max(0, CELL.w / 2 - slots.DRIFT_UNITS - size * ((GB.w / 2) * Math.cos(t) + (GB.h / 2) * Math.sin(t)));
  const spareY = Math.max(0, CELL.h / 2 - slots.DRIFT_UNITS - size * ((GB.h / 2) * Math.cos(t) + (GB.w / 2) * Math.sin(t)));
  const look = ghostLook(index);
  const c = slots.GHOST_SLOTS[slot];
  return { x: c.cx + look.fx * spareX, y: c.cy + look.fy * spareY, tilt: look.tilt, variant: look.variant };
}
export function ghostGroup(placed) {
  const [e1, e2] = GHOST_EYES[placed.variant];
  return (
    `<g class="drift"><path class="body" d="${hemPath(placed.variant)}"/><ellipse class="inner-glow" cx="0" cy="-12" rx="17" ry="24"/>` +
    `<ellipse class="eye" cx="${e1[0]}" cy="${e1[1]}" rx="3.7" ry="5.3"/><ellipse class="eye" cx="${e2[0]}" cy="${e2[1]}" rx="3.7" ry="5.3"/></g>`
  );
}
export function ghostSvg(list, withMark) {
  const g = list.map(({ index, size }) => {
    const slot = index % 12;
    const p = placeGhost(slot, index, size);
    return `<g class="ghost" data-slot="${slot}" data-index="${index}" transform="translate(${n(p.x)} ${n(p.y)}) rotate(${n(p.tilt)}) scale(${size})">${ghostGroup(p)}</g>`;
  });
  return `<svg class="ghost-layer" viewBox="0 0 600 1000" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" data-reduced="true"><defs><radialGradient id="cw-ghost-glow"><stop offset="0" stop-color="#fff" stop-opacity="0.85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>${g.join("")}${withMark ?? ""}</svg>`;
}
/** A strip of the three shapes at 1, 0.5 and 0.25 (the smallest drawn size), for the legibility check. */
export function ghostStrip() {
  const row = (size, y) => [0, 1, 2].map((v, i) => `<g class="ghost" transform="translate(${90 + i * 100} ${y}) scale(${size})">${ghostGroup({ variant: v })}</g>`).join("");
  return `<svg class="ghost-layer ghost-strip" viewBox="0 0 600 1000" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" data-reduced="true"><defs><radialGradient id="cw-ghost-glow"><stop offset="0" stop-color="#fff" stop-opacity="0.85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>${row(1, 300)}${row(0.5, 420)}${row(0.25, 500)}</svg>`;
}

// ---------------------------------------------------------------- the Place (D9)
/** The Doorway_Light: an ellipse 1292 by 760 units (radius 760, stretched 1.7 in x), peak 0.95, on the return control. */
export const DOORWAY = { cx: 60, cy: 847.5, r: 760, sx: 1.7 };
export const HORIZON = 224;
const HAZE = 60;
const STAR_SEED = 4417;
/** Fixed-seed dart throwing: points at least `gap` apart inside a box, skipping the given rectangles. No grid, no Math.random. */
function scatter(seed, box, count, gap, avoid) {
  const rnd = mulberry32(seed);
  const pts = [];
  let tries = 0;
  while (pts.length < count && tries++ < count * 60) {
    const x = box.x0 + rnd() * (box.x1 - box.x0), y = box.y0 + rnd() * (box.y1 - box.y0);
    if (avoid.some((r) => x > r.x - 5 && x < r.x + r.w + 5 && y > r.y - 5 && y < r.y + r.h + 5)) continue;
    if (pts.every(([px, py]) => Math.hypot(px - x, py - y) >= gap)) pts.push([x, y]);
  }
  return pts;
}
/** Text lines of the view that the ground marks stay off (labels, date labels, "+n more", count lines). */
export function textRects(rowYs) {
  const rects = [{ x: 14, y: 213, w: 572, h: 32 }, { x: 14, y: 461, w: 572, h: 32 }, { x: 14, y: 427, w: 572, h: 32 }, { x: 14, y: 759, w: 572, h: 32 }];
  for (const y of rowYs) { rects.push({ x: 14, y, w: 90, h: 76 }); rects.push({ x: 450, y, w: 110, h: 76 }); }
  return rects;
}
const skyStars = () => {
  const pts = scatter(STAR_SEED, { x0: -1100, x1: 1700, y0: -420, y1: HORIZON - 40 }, 30, 70, []);
  return pts.map(([x, y], i) => `<circle cx="${n(x)}" cy="${n(y)}" r="${i % 3 === 0 ? 1.1 : 0.8}"/>`).join("");
};
const hills = (base, amp, seed, cls) => {
  let d = `M-2200 ${HORIZON + 6}`;
  for (let x = -2200; x <= 2800; x += 70) d += ` L${x} ${n(base - amp * (0.5 + 0.5 * Math.sin(x * 0.0113 + seed) * Math.cos(x * 0.0041 + seed * 2) + 0.25 * Math.sin(x * 0.027 + seed * 3)))}`;
  return `<path class="${cls}" d="${d} L2800 ${HORIZON + 6} Z"/>`;
};
const stoneArch = (r, ox = 0, oy = 0) => `M${n(r.x + ox)} ${n(r.y + r.h + oy)} V${n(r.y + 44 + oy)} A44 44 0 0 1 ${n(r.x + 44 + ox)} ${n(r.y + oy)} H${n(r.x + r.w - 44 + ox)} A44 44 0 0 1 ${n(r.x + r.w + ox)} ${n(r.y + 44 + oy)} V${n(r.y + r.h + oy)} Z`;
export function placeSvg({ stones, rows, suffix = "" }) {
  const rowYs = rows.map((r) => r.y);
  const avoid = textRects(rowYs);
  const box = { x0: -1100, x1: 1700, y0: HORIZON + 30, y1: 890 };
  const pebbles = scatter(7741, box, 150, 26, avoid);
  const blades = scatter(9173, box, 90, 40, avoid);
  const pebblePath = pebbles.map(([x, y]) => `M${n(x)} ${n(y)}h0`).join("");
  const bladePath = blades.map(([x, y], i) => `M${n(x)} ${n(y)}l${i % 2 ? 1.4 : -1.4} -6M${n(x + 3.5)} ${n(y + 0.6)}l${i % 3 ? -0.8 : 1.2} -5`).join("");
  // per stone: a thick side (4 stacked copies of the arch, offset up and to the right), a shadow cast away from the doorway, a mound with tufts
  const sideOf = (r) => [1, 2, 3, 4].map((k) => stoneArch(r, (k * 9) / 4, -(k * 6) / 4)).join(" ");
  const shadowOf = (r) => {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const dx = cx - DOORWAY.cx, dy = cy - DOORWAY.cy; const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = (dy / len) * 0.45; // away from the light, flattened onto the ground plane
    const L = 46, f = r.y + r.h;
    return `M${n(r.x + 6)} ${f + 1} L${n(r.x + r.w)} ${f + 1} L${n(r.x + r.w + ux * L)} ${n(f + 1 + uy * L)} L${n(r.x + 6 + ux * L)} ${n(f + 1 + uy * L)} Z`;
  };
  const stoneParts = stones
    .map((r) => {
      const f = r.y + r.h;
      return (
        `<path class="p-shadow" d="${shadowOf(r)}"/>` +
        `<path class="p-mound" d="M${r.x - 26} ${f + 17} Q${n(r.x + 6)} ${f - 2} ${n(r.x + r.w / 2)} ${f - 3} Q${n(r.x + r.w - 6)} ${f - 2} ${r.x + r.w + 26} ${f + 17} Z"/>` +
        `<path class="p-side" d="${sideOf(r)}"/>` +
        `<path class="p-tuft" d="M${r.x - 12} ${f + 3} l-1 -6 M${r.x - 6} ${f + 4} l2 -7 M${r.x + r.w + 4} ${f + 4} l-1 -6 M${r.x + r.w + 10} ${f + 3} l2 -7"/>`
      );
    })
    .join("");
  const boards = rows
    .map((r) => {
      const x0 = 109;
      const w = r.count * 84 + 8;
      return `<g class="p-board"><rect class="b-top" x="${x0}" y="${r.y + 69}" width="${w}" height="12" rx="1.5"/><rect class="b-front" x="${x0}" y="${r.y + 75}" width="${w}" height="6" rx="1"/><path class="b-grain" d="M${x0 + 8} ${r.y + 72} H${n(x0 + w * 0.4)} M${n(x0 + w * 0.5)} ${r.y + 74} H${x0 + w - 8}"/><rect class="b-iron" x="${x0 + 6}" y="${r.y + 81}" width="5" height="10"/><rect class="b-iron" x="${x0 + w - 11}" y="${r.y + 81}" width="5" height="10"/></g>`;
    })
    .join("");
  const hole = `M${HORIZON}`; // (unused marker)
  return (
    `<svg class="place" viewBox="0 0 600 1000" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">` +
    `<defs>` +
    `<clipPath id="cw-place-clip"><rect x="-2200" y="-600" width="5000" height="1500"/></clipPath>` +
    `<linearGradient id="cw-place-sky" gradientUnits="userSpaceOnUse" x1="0" y1="-600" x2="0" y2="${HORIZON + HAZE}"><stop class="ps-0" offset="0"/><stop class="ps-1" offset="0.7"/><stop class="ps-2" offset="1"/></linearGradient>` +
    `<linearGradient id="cw-place-ground" gradientUnits="userSpaceOnUse" x1="0" y1="${HORIZON}" x2="0" y2="900"><stop class="pg-h" offset="0" stop-opacity="0"/><stop class="pg-0" offset="${HAZE / (900 - HORIZON)}"/><stop class="pg-1" offset="1"/></linearGradient>` +
    `<linearGradient id="cw-haze-ramp" gradientUnits="userSpaceOnUse" x1="0" y1="${HORIZON}" x2="0" y2="${HORIZON + HAZE}"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>` +
    `<radialGradient id="cw-doorway-hole"><stop offset="0" stop-color="#000" stop-opacity="0.95"/><stop offset="0.6" stop-color="#000" stop-opacity="0.7"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>` +
    `<mask id="cw-place-mask" maskUnits="userSpaceOnUse" x="-2200" y="${HORIZON}" width="5000" height="${900 - HORIZON}"><rect x="-2200" y="${HORIZON}" width="5000" height="${HAZE}" fill="url(#cw-haze-ramp)"/><rect x="-2200" y="${HORIZON + HAZE}" width="5000" height="${900 - HORIZON - HAZE}" fill="#fff"/><circle class="doorway" cx="${DOORWAY.cx}" cy="${DOORWAY.cy}" r="${DOORWAY.r}" fill="url(#cw-doorway-hole)" transform="translate(${DOORWAY.cx} ${DOORWAY.cy}) scale(${DOORWAY.sx} 1) translate(${-DOORWAY.cx} ${-DOORWAY.cy})"/></mask>` +
    `</defs>` +
    `<g clip-path="url(#cw-place-clip)">` +
    `<rect class="p-sky" x="-2200" y="-600" width="5000" height="${HORIZON + HAZE + 600}" fill="url(#cw-place-sky)"/>` +
    `<g class="p-stars">${skyStars()}</g>` +
    hills(HORIZON - 30, 46, 2.2, "p-hill-far") +
    hills(HORIZON - 16, 34, 1.3, "p-hill-mid") +
    `<g class="p-tower"><path d="M681 ${HORIZON} L688 ${HORIZON - 122} H712 L719 ${HORIZON} Z"/><rect x="683" y="${HORIZON - 130}" width="34" height="8"/><rect x="691" y="${HORIZON - 154}" width="18" height="24"/><path d="M689 ${HORIZON - 154} Q700 ${HORIZON - 170} 711 ${HORIZON - 154} Z"/><rect x="699" y="${HORIZON - 176}" width="2" height="8"/></g>` +
    hills(HORIZON - 4, 26, 4.1, "p-hill-near") +
    `<g class="p-setting"><rect class="p-ground" x="-2200" y="${HORIZON}" width="5000" height="${900 - HORIZON}" fill="url(#cw-place-ground)"/>` +
    `<path class="e-pebble" d="${pebblePath}"/><path class="e-blade" d="${bladePath}"/>${stoneParts}${boards}</g>` +
    `<rect class="p-night" x="-2200" y="${HORIZON}" width="5000" height="${900 - HORIZON}" mask="url(#cw-place-mask)"/>` +
    `</g></svg>`
  );
}

// ---------------------------------------------------------------- the CSS delta
export const ART_CSS = `
/* ===== the new art: the delta over scene.css, ghosts.css, graveyard.css and ui.css (their tokens are linked, never copied) ===== */

/* --- Setting_Tokens (D5): each between --room-bg-darkest #05070d and --room-bg-brightest #566683 in luminance --- */
.candle-scene {
  --set-joint: #2b354b;
  --set-stone-0: #566683; --set-stone-1: #51607e; --set-stone-2: #4c5a78; --set-stone-3: #58607a; --set-stone-4: #5e5c6e;
  --set-veil: #3f4a62; --veil: 0.75; --wl-edge: 0.82;
  --set-table-back: #3b2c1d; --set-table-front: #54402c; --set-table-seam: #20170f; --set-table-edge: #7d6040; --set-table-face: #3a2b1d;
  --set-dish: #3a3d45; --set-dish-rim: #5f636d; --set-dish-in: #07090e;
  --set-frame: #3c4660; --set-frame-hi: #566683; --set-sill: #4f5b78; --set-sill-hi: #566683;
  --set-plank-a: #7a5a38; --set-plank-b: #4a3724; --set-plank-joint: #140e09; --set-grain: #33261a;
  --set-surround: #3b4358; --set-recess: #0c0906; --set-threshold: #52607c;
  --set-iron: #2c313f; --set-iron-hi: #4a5268; --set-rivet: #566683;
  --sky-star: #dfe8ff;
  --set-warm-tint: #7d5a34; /* the pool's warm tint (F16, adopted) */
  /* the Window_Light (D3): levels of the hole in the night mask. Read: --dawn, and whether --light-radius is 0. Never the amount. */
  --wl-night: 0.5;
  --wl-snuffed: 0.09;
  --wl-dawn: 1;
  --wl-k: var(--dawn);
  --wl-now: calc(var(--wl-snuffed) + (var(--wl-night) - var(--wl-snuffed)) * min(1, calc(var(--light-radius) * 1000)));
  --wl: calc(var(--wl-now) + (var(--wl-dawn) - var(--wl-now)) * var(--wl-k));
}
/* The level eases with the dawn: 3 s, like .dawn-wash; 0 s with reduced motion (the scene's own reduced-motion rule). */
@property --wl-k { syntax: "<number>"; inherits: true; initial-value: 0; }
.candle-scene[data-settled="true"][data-ease="true"] { transition: --wl-k 3s ease; }
${WL_PROFILE.map(([, k]) => `.st-wl[data-k="${k}"] { --k: ${k}; }`).join("\n")}
.st-wl { stop-opacity: calc(var(--wl) * var(--k, 1)); }

/* In idle no light comes from the candle: the pool (at its minimum size) is not drawn. Read from the existing data-phase only. */
.candle-scene[data-phase="idle"] .pool,
.candle-scene[data-phase="idle"] .pool-tint { display: none; }

/* --- the setting: static fills only, no animation, no transition, no model property --- */
.s-joint { fill: var(--set-joint); fill-opacity: var(--joint-opacity, 0.6); }
.st-veil { stop-color: var(--set-veil); stop-opacity: calc(var(--veil) * var(--k, 1)); }
.st-wedge { stop-color: #fff; stop-opacity: calc(var(--wl-edge) * var(--k, 1)); }
.s-b { fill-opacity: 0.55; }
[data-k="0"] { --k: 0; } [data-k="1"] { --k: 1; }
.s-b0 { fill: var(--set-stone-0); fill-opacity: 0.8; } .s-b1 { fill: var(--set-stone-1); fill-opacity: 0.8; }
.s-b2 { fill: var(--set-stone-2); fill-opacity: 0.8; } .s-b3 { fill: var(--set-stone-3); fill-opacity: 0.78; }
.s-b4 { fill: var(--set-stone-4); fill-opacity: 0.78; }
/* The base: a lit lip high on the table, an under-line, a brighter pewter rim and a darker inside of the dish; the zone's soft shadow is short (change request F20 to candle-scene: 2 units up and 3 of blur, scene.css lines 177 and 178) */
.t-lip { fill: var(--set-table-edge); } .t-under { stroke: var(--set-table-seam); stroke-width: 1.1; fill: none; }
.candle-scene .zone-rest { filter: drop-shadow(0 -2px 3px color-mix(in srgb, var(--zone-bg-darkest) calc((1 - var(--dawn)) * 100%), transparent)); }
.candle-scene .zone-dawn { filter: drop-shadow(0 -2px 3px var(--zone-bg-brightest)); }
.st-table-back { stop-color: var(--set-table-back); } .st-table-front { stop-color: var(--set-table-front); }
.t-seam { stroke: var(--set-table-seam); stroke-width: 1.1; stroke-opacity: 0.7; fill: none; }
.t-back { stroke: var(--set-table-seam); stroke-width: 1.4; fill: none; }
.t-face { fill: var(--set-table-face); }
.h-body { fill: var(--set-dish); } .h-rim { fill: var(--set-dish-rim); } .h-in { fill: var(--set-dish-in); }
.h-lip { stroke: var(--set-dish-rim); stroke-width: 1; fill: none; stroke-opacity: 0.8; }
.f-wood { fill: var(--set-frame); } .f-hi { stroke: var(--set-frame-hi); stroke-width: 1.4; fill: none; }
.f-sill { fill: var(--set-sill); } .f-sill-hi { stroke: var(--set-sill-hi); stroke-width: 1.4; fill: none; }
.w-surround { fill: var(--set-surround); } .w-plank-a { fill: var(--set-plank-a); } .w-plank-b { fill: var(--set-plank-b); }
.w-joint { stroke: var(--set-plank-joint); stroke-width: 1.8; fill: none; } .w-fibre { stroke: var(--set-grain); stroke-width: 1.1; fill: none; stroke-opacity: 0.85; }
.w-iron { fill: var(--set-iron); } .w-pin { fill: var(--set-iron-hi); } .w-rivet { fill: var(--set-rivet); }
.w-recess { stroke: var(--set-recess); stroke-width: 3.4; fill: none; stroke-opacity: 0.8; }
.w-threshold { fill: var(--set-threshold); } .w-threshold-hi { stroke: var(--set-sill-hi); stroke-width: 1; fill: none; }
.warm-tint { fill: var(--set-warm-tint); fill-opacity: 0.42; }
.pool-tint { transform: translate(300px, calc(400px + (1 - var(--wax-height)) * 420px)) scale(var(--light-radius)); }

/* the glass lies above the frame, in the four panes only; the stars change only with the dawn (D6) */
.stars circle { fill: var(--sky-star); }
.stars { opacity: calc(1 - var(--dawn)); }

/* --- the ghosts (D7) --- */
.ghost-layer .ghost, .ghost-layer .drift { animation: none !important; transition: none !important; }
.ghost-layer .eye { fill: #0b1020; }

/* --- the Door (D8): the face is transparent, the wood is the room's --- */
#ui .graveyard button.door, #ui .graveyard .door-shut { background: transparent; }
#ui .graveyard button.door::before { display: none; }
#ui .graveyard .door-shut { border-color: var(--g-text); }
#ui .graveyard .door-shut::after { top: calc(36 * var(--u)); height: calc(7 * var(--u)); background: var(--g-text-subtle); box-shadow: 0 0 0 1px #05070d; }
#ui .graveyard button.door::after { top: calc(40 * var(--u)); right: calc(14 * var(--u)); width: calc(11 * var(--u)); height: calc(11 * var(--u)); box-shadow: 0 0 0 1px #05070d; }

/* --- the Place (D9) --- */
#ui .graveyard { --u: min(calc(100vw / 600), calc(100vh / 1000)); --ox: calc((100vw - 600 * var(--u)) / 2); --oy: calc((100vh - 1000 * var(--u)) / 2); }
#ui .graveyard .panel { display: none; }
#ui .graveyard .stone::after, #ui .graveyard .stub::after { display: none; }
#ui .graveyard svg.place { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; display: block; }
.place { --set-earth-a: #5b4a3e; --set-earth-b: #3a2f28; --set-pebble: #6a5a4c; --set-blade: #566650; --set-mound: #745e4c; --set-stone-side: #566683; --set-shadow: #05070d;
  --set-board-top: #7a5c3c; --set-board-front: #6a4e30; --set-board-grain: #33261a; --set-iron: #2c313f;
  --set-sky-low: #2f3f66; --set-hill-far: #121a2e; --set-hill-mid: #0c1222; --set-hill-near: #070a11; --sky-star: #dfe8ff; }
.ps-0 { stop-color: color-mix(in srgb, var(--window-dawn) calc(var(--dawn) * 100%), var(--window-night)); }
.ps-1 { stop-color: color-mix(in srgb, var(--dawn-cool) calc(var(--dawn) * 100%), var(--window-moon)); }
.ps-2 { stop-color: color-mix(in srgb, var(--dawn-warm) calc(var(--dawn) * 100%), var(--set-sky-low)); }
.pg-h { stop-color: var(--set-earth-a); } .pg-0 { stop-color: var(--set-earth-a); } .pg-1 { stop-color: var(--set-earth-b); }
.p-stars { opacity: calc(1 - var(--dawn)); } .p-stars circle { fill: var(--sky-star); }
.p-tower { fill: var(--set-hill-near); } .p-hill-far { fill: var(--set-hill-far); } .p-hill-mid { fill: var(--set-hill-mid); } .p-hill-near { fill: var(--set-hill-near); }
.e-pebble { stroke: var(--set-pebble); stroke-width: 4; stroke-linecap: round; stroke-opacity: 0.6; fill: none; }
.e-blade { stroke: var(--set-blade); stroke-width: 1.3; stroke-linecap: round; fill: none; stroke-opacity: 0.7; }
.p-mound { fill: var(--set-mound); } .p-tuft { stroke: var(--set-blade); stroke-width: 1.6; stroke-linecap: round; fill: none; }
.p-side { fill: var(--set-stone-side); } .p-shadow { fill: var(--set-shadow); fill-opacity: 0.6; }
.b-top { fill: var(--set-board-top); } .b-front { fill: var(--set-board-front); } .b-grain { stroke: var(--set-board-grain); stroke-width: 1; fill: none; } .b-iron { fill: var(--set-iron); }
.p-night { fill: var(--room-night, #05070d); }
@media (forced-colors: active) { .place, .setting, .door-wood { display: none; } }
`;






