// The static markup of the room (candle-scene design section 5). No logic and no text: every number the
// scene changes with state is a CSS custom property read by scene.css. IDs are prefixed `cw-`.
//
// Room units: the stage is 600 x 1000 (viewBox); the backdrop is drawn far beyond it, x -2200..2800.
// The floor line is y = 900: the candle's base, the clip line for everything lit, and the top of the zone.
// Layers: wall, setting, tints, night mask, glass, stars, candle, lit and the topmost zone.

import { DRIPS, DRIP_TOP_Y, EMBER, WINDOW, FLOOR_Y, LIGHT_FULL_UNITS } from "./constants";

import { BACKDROP } from "./backdrop";
import { DAWN_FIELD, DOOR_WOOD, EDGE, HOLDER, PANES, PANE_FRAME, STARS, TABLE, WALL, WINDOW_LIGHT, wallTile } from "./setting";

const num = (n: number): string => String(Math.round(n * 100) / 100);

/**
 * The outline of one drip: a narrow runnel from the rim that flares into a rounded bead (design 5.5).
 * Pure geometry, computed once; every point is an `x y` pair, so a test can read the extent.
 */
export function dripPath(cx: number, length: number, width: number): string {
  const r = width / 2;
  const neck = width * 0.34;
  const y0 = DRIP_TOP_Y;
  const flare = y0 + length - width * 1.1;
  const waist = y0 + length - width * 0.85;
  const shoulder = y0 + length - width * 0.75;
  const bead = y0 + length - r;
  const low = y0 + length + r * 0.4;
  const p = [
    `M${num(cx - neck)} ${num(y0)}`,
    `L${num(cx - neck)} ${num(flare)}`,
    `C${num(cx - neck)} ${num(waist)} ${num(cx - r)} ${num(shoulder)} ${num(cx - r)} ${num(bead)}`,
    `C${num(cx - r)} ${num(low)} ${num(cx + r)} ${num(low)} ${num(cx + r)} ${num(bead)}`,
    `C${num(cx + r)} ${num(shoulder)} ${num(cx + neck)} ${num(waist)} ${num(cx + neck)} ${num(flare)}`,
    `L${num(cx + neck)} ${num(y0)} Z`,
  ];
  return p.join(" ");
}

const DRIPS_SVG = DRIPS.map(
  (d, i) => `<g class="drip drip-${i + 1}"><path d="${dripPath(d.x, d.length, d.width)}"/></g>`,
).join("\n");

// One contour for the front of the landscape dish and its lighting mask.
const DISH_FRONT = "M229 872 A71 8 0 0 0 371 872 C366 883 357 887 340 887 H260 C243 887 234 883 229 872 Z";

const WINDOW_RECT = `x="${WINDOW.x}" y="${WINDOW.y}" width="${WINDOW.width}" height="${WINDOW.height}"`;
const ABOVE_FLOOR = `x="${BACKDROP.x0}" y="${BACKDROP.y0}" width="${BACKDROP.x1-BACKDROP.x0}" height="${FLOOR_Y-BACKDROP.y0}"`;

const edgeStops = (cls: string) => [[-1500,1],[-EDGE.far,1],[-EDGE.near,0],[EDGE.near,0],[EDGE.far,1],[1500,1]].map(([d,k]) => `<stop offset="${(WINDOW_LIGHT.cx+(d ?? 0)-BACKDROP.x0)/(BACKDROP.x1-BACKDROP.x0)}" class="${cls}" data-k="${k}"/>`).join("");
const veilDefs = `<linearGradient id="cw-veil-grad" gradientUnits="userSpaceOnUse" x1="${BACKDROP.x0}" y1="0" x2="${BACKDROP.x1}" y2="0">${edgeStops("st-veil")}</linearGradient>`;
const lightDefs = `<radialGradient id="cw-win-hole">${WINDOW_LIGHT.profile.map(([o,k])=>`<stop offset="${o}" stop-color="#000" class="st-wl" data-k="${k}"/>`).join("")}</radialGradient><linearGradient id="cw-win-edge-grad" gradientUnits="userSpaceOnUse" x1="${BACKDROP.x0}" y1="0" x2="${BACKDROP.x1}" y2="0">${edgeStops("st-wedge")}</linearGradient><mask id="cw-panes" maskUnits="userSpaceOnUse" x="236" y="46" width="128" height="218">${PANES.map(p=>`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="1.5" fill="#fff"/>`).join("")}</mask>`;
const tintDefs = `<radialGradient id="cw-tint-hole"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.6" stop-color="#fff" stop-opacity="0.75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="cw-tint-mask" maskUnits="userSpaceOnUse" x="${BACKDROP.x0}" y="${BACKDROP.y0}" width="${BACKDROP.x1-BACKDROP.x0}" height="${FLOOR_Y-BACKDROP.y0}"><rect x="${BACKDROP.x0}" y="${BACKDROP.y0}" width="${BACKDROP.x1-BACKDROP.x0}" height="${FLOOR_Y-BACKDROP.y0}" fill="#000"/><circle class="pool-tint" cx="0" cy="0" r="${LIGHT_FULL_UNITS}" fill="url(#cw-tint-hole)"/></mask>`;
const dawnGradient = (kind: "light" | "tint") =>
  `<radialGradient id="cw-dawn-${kind}" fy="${DAWN_FIELD.focusY}">${DAWN_FIELD.profile.map(([offset, strength]) =>
    `<stop offset="${offset}" stop-opacity="${strength}"${kind === "tint" ? ' class="st-dawn-tint"' : ""}/>`).join("")}</radialGradient>`;
const tableSeams = (yEnd: number) => {
  const d = [];
  for (let x = -1900; x <= 2500; x += 150) d.push(`M${x} ${TABLE.y} L${num(x + (x - 300) * 0.035 * ((yEnd - TABLE.y) / (892.6 - TABLE.y)))} ${yEnd}`);
  return d.join(" ");
};

// The door wood stays inside its arched rectangle.
const archPath = (i: number, bottom = DOOR_WOOD.arch.y + DOOR_WOOD.arch.h) => `M${20 + i} ${bottom} V845 A${40 - i} ${40 - i} 0 0 1 ${100 - i} 845 V${bottom} Z`;
const doorWood = () => {
  const planks = DOOR_WOOD.planks.map((p, k) => `<rect class="${k % 2 ? "w-plank-b" : "w-plank-a"}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"/>`).join("");
  const joints = [1, 2, 3].map((k) => `M${24+k*18} 806 V890`).join(" ");
  const fibre = "M29 818 V846 M33 832 V872 M47 812 V838 M51 852 V884 M65 820 V858 M69 842 V878 M83 816 V848 M87 854 V884";
  const hinge = (y: number) => `<path class="w-iron" d="M24 ${y} h26 l6 3 l-6 3 h-26 z"/><circle class="w-pin" cx="28" cy="${y + 3}" r="2.6"/><circle class="w-rivet" cx="40" cy="${y + 3}" r="1.2"/><circle class="w-rivet" cx="47" cy="${y + 3}" r="1.2"/>`;
  return (
    `<g class="door-wood">` +
    `<path class="w-surround" d="${archPath(0)}"/>` +
    `<g clip-path="url(#cw-door-clip)">${planks}<path class="w-joint" d="${joints}"/><path class="w-fibre" d="${fibre}"/>` +
    DOOR_WOOD.hinges.map(hinge).join("") +
    `<rect class="w-iron" x="72" y="842" width="18" height="17" rx="2"/><circle class="w-rivet" cx="75" cy="845" r="1.1"/><circle class="w-rivet" cx="87" cy="845" r="1.1"/><circle class="w-rivet" cx="75" cy="856" r="1.1"/><circle class="w-rivet" cx="87" cy="856" r="1.1"/>` +
    `</g>` +
    `<path class="w-recess" d="M24 890 V845 A36 36 0 0 1 60 809"/>` +
    `<rect class="w-threshold" x="20" y="885.5" width="80" height="4.5"/><path class="w-threshold-hi" d="M20 886.2 H100"/>` +
    `</g>`
  );
};

const settingGroup = () => [
  `<g class="setting"><defs>${wallTile(WALL.seed)}${veilDefs}<clipPath id="cw-door-clip"><path d="${archPath(4)}"/></clipPath><linearGradient id="cw-table-grad" x1="0" y1="0" x2="0" y2="1"><stop class="st-table-back" offset="0"/><stop class="st-table-front" offset="1"/></linearGradient></defs>`,
  `<rect class="wall-stone" x="${BACKDROP.x0}" y="${BACKDROP.y0}" width="${BACKDROP.x1-BACKDROP.x0}" height="${TABLE.y + 600}" fill="url(#cw-stone)"/>`,
  `<rect class="wall-veil" x="${BACKDROP.x0}" y="${BACKDROP.y0}" width="${BACKDROP.x1-BACKDROP.x0}" height="${TABLE.y + 600}" fill="url(#cw-veil-grad)"/>`,
  `<g class="table">`,
  // the lit front edge is high on the table, above the zone's (short) shadow: top 884..889, lit lip 889..891.4, a dark under-line, front face 892.4..900.
  // The table is 16 high and its front face ends on the floor line.
  `<rect class="t-top" x="${BACKDROP.x0}" y="${TABLE.y}" width="${BACKDROP.x1-BACKDROP.x0}" height="5" fill="url(#cw-table-grad)"/>`,
  `<path class="t-seam" d="${tableSeams(TABLE.topEnd)}"/>`,
  `<path class="t-back" d="M-2200 ${TABLE.y + 0.5} H2800"/>`,
  `<rect class="t-lip" x="${BACKDROP.x0}" y="${TABLE.topEnd}" width="${BACKDROP.x1-BACKDROP.x0}" height="${num(TABLE.lipEnd-TABLE.topEnd)}"/>`,
  `<path class="t-under" d="M${BACKDROP.x0} ${TABLE.underY} H${BACKDROP.x1}"/>`,
  `<rect class="t-face" x="${BACKDROP.x0}" y="${TABLE.faceY}" width="${BACKDROP.x1-BACKDROP.x0}" height="${num(FLOOR_Y-TABLE.faceY)}"/>`,
  `</g>`,
  // the holder: a pewter dish at the candle's base, behind the candle (x 238..362, y 886..900: 124 by 14), its rim at full depth
  `<g class="holder"><ellipse class="h-shadow" cx="300" cy="885" rx="75" ry="2"/><path class="h-body" d="M238 891.5 Q240 899.8 252 899.8 L348 899.8 Q360 899.8 362 891.5 Z"/><ellipse class="h-rim" cx="${HOLDER.x+HOLDER.w/2}" cy="${HOLDER.rim.cy}" rx="${HOLDER.rim.rx}" ry="${HOLDER.rim.ry}"/><ellipse class="h-in" cx="${HOLDER.x+HOLDER.w/2}" cy="${HOLDER.inside.cy}" rx="${HOLDER.inside.rx}" ry="${HOLDER.inside.ry}"/><path class="h-lip" d="M241.5 890.9 A58.5 4.1 0 0 1 358.5 890.9"/></g>`,
  `<g class="frame"><rect class="f-wood" x="${WINDOW.x}" y="${WINDOW.y}" width="${WINDOW.width}" height="${WINDOW.height}"/>` +
    `<path class="f-hi" d="M${WINDOW.x} ${WINDOW.y + 0.8} H${WINDOW.x + WINDOW.width} M${WINDOW.x + 0.8} ${WINDOW.y} V${WINDOW.y + WINDOW.height}"/>` +
    `<rect class="f-sill" x="${WINDOW.x}" y="${PANE_FRAME.sillY}" width="${WINDOW.width}" height="${PANE_FRAME.sillH}"/><path class="f-sill-hi" d="M${WINDOW.x} 250.8 H${WINDOW.x + WINDOW.width}"/></g>`,
  doorWood(),
  `</g>`,
].join("\n");

export const ROOM_SVG = `<svg class="room" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 1000" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
<defs>
${lightDefs}${tintDefs}${dawnGradient("light")}${dawnGradient("tint")}
<linearGradient id="cw-wall-grad" gradientUnits="userSpaceOnUse" x1="0" y1="-600" x2="0" y2="900"><stop class="st-wall-top" offset="0"/><stop class="st-wall-low" offset="1"/></linearGradient>
<linearGradient id="cw-window-grad" x1="0" y1="0" x2="0" y2="1"><stop class="st-window-moon" offset="0"/><stop class="st-window-night" offset="1"/></linearGradient>
<linearGradient id="cw-dawn-pane" x1="0" y1="0" x2="0" y2="1"><stop class="st-dawn-pane-top" offset="0"/><stop class="st-dawn-pane-sill" offset="0.65"/></linearGradient>
<filter id="cw-soft-edge" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${WINDOW.blur}"/></filter>
<linearGradient id="cw-wax-grad" x1="0" y1="0" x2="1" y2="0"><stop class="st-wax-shade" offset="0"/><stop class="st-wax-ivory" offset="0.4"/><stop class="st-wax-ivory" offset="0.7"/><stop class="st-wax-shade" offset="1"/></linearGradient>
<radialGradient id="cw-flame-amber" cx="0.5" cy="0.78" r="0.62"><stop class="st-flame-core" offset="0"/><stop class="st-amber-mid" offset="0.45"/><stop class="st-amber-outer" offset="1"/></radialGradient>
<radialGradient id="cw-flame-blue" cx="0.5" cy="0.78" r="0.62"><stop class="st-blue-core" offset="0"/><stop class="st-blue-outer" offset="1"/></radialGradient>
<radialGradient id="cw-halo-grad"><stop class="st-halo-in" offset="0"/><stop class="st-halo-out" offset="1"/></radialGradient>
<radialGradient id="cw-ember-grad"><stop class="st-ember-in" offset="0"/><stop class="st-ember-mid" offset="0.55"/><stop class="st-ember-out" offset="1"/></radialGradient>
<radialGradient id="cw-pool-hole"><stop offset="0" stop-color="#000" stop-opacity="1"/><stop offset="0.6" stop-color="#000" stop-opacity="0.75"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<mask id="cw-pool-mask" maskUnits="userSpaceOnUse" x="${BACKDROP.x0}" y="${BACKDROP.y0}" width="${BACKDROP.x1-BACKDROP.x0}" height="${FLOOR_Y-BACKDROP.y0}">
<rect class="mask-all" x="${BACKDROP.x0}" y="${BACKDROP.y0}" width="${BACKDROP.x1-BACKDROP.x0}" height="${FLOOR_Y-BACKDROP.y0}" fill="#fff"/>
<circle class="win-light" cx="${WINDOW_LIGHT.cx}" cy="${WINDOW_LIGHT.cy}" r="${WINDOW_LIGHT.r}" fill="url(#cw-win-hole)"/>
<rect class="win-edge" x="${BACKDROP.x0}" y="${BACKDROP.y0}" width="${BACKDROP.x1-BACKDROP.x0}" height="${FLOOR_Y-BACKDROP.y0}" fill="url(#cw-win-edge-grad)"/>
<circle class="dawn-field dawn-light" r="1" fill="url(#cw-dawn-light)"/>
<circle class="pool" cx="0" cy="0" r="700" fill="url(#cw-pool-hole)"/>
</mask>
<clipPath id="cw-dawn-floor"><rect ${ABOVE_FLOOR}/></clipPath>
<clipPath id="cw-above-floor"><rect ${ABOVE_FLOOR}/></clipPath>
</defs>
<rect class="wall" ${ABOVE_FLOOR} fill="url(#cw-wall-grad)"/>
${settingGroup()}
<rect class="warm-tint" x="${BACKDROP.x0}" y="${BACKDROP.y0}" width="${BACKDROP.x1-BACKDROP.x0}" height="${FLOOR_Y-BACKDROP.y0}" mask="url(#cw-tint-mask)"/>
<g class="dawn-tint" clip-path="url(#cw-dawn-floor)"><circle class="dawn-field" r="1" fill="url(#cw-dawn-tint)"/></g>
<rect class="night" x="${BACKDROP.x0}" y="${BACKDROP.y0}" width="${BACKDROP.x1-BACKDROP.x0}" height="${FLOOR_Y-BACKDROP.y0}" mask="url(#cw-pool-mask)"/>
<g class="window" mask="url(#cw-panes)" filter="url(#cw-soft-edge)"><rect class="window-rest" ${WINDOW_RECT}/><rect class="window-dawn" ${WINDOW_RECT}/></g>
<g class="stars">${STARS.map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}</g>
<g class="candle">
<rect class="body" x="268" y="480" width="64" height="420" fill="url(#cw-wax-grad)"/>
<rect class="stub" x="268" y="872" width="64" height="28" rx="3" fill="url(#cw-wax-grad)"/>
</g>
<g class="lit" clip-path="url(#cw-above-floor)">
<g class="head">
<circle class="halo" cx="300" cy="410" r="120" fill="url(#cw-halo-grad)"/>
<ellipse class="rim" cx="300" cy="480" rx="32" ry="6"/>
<ellipse class="melt" cx="300" cy="480" rx="22" ry="3.5"/>
${DRIPS_SVG}
<rect class="wick" x="298" y="460" width="4" height="20"/>
<circle class="ember" cx="${EMBER.cx}" cy="${EMBER.cy}" r="${EMBER.r}" fill="url(#cw-ember-grad)"/>
<g class="flame"><g class="flame-flicker"><g class="flame-shape">
<g class="flame-amber">
<path class="teardrop" d="M300 340 C322 380 330 432 300 460 C270 432 278 380 300 340 Z" fill="url(#cw-flame-amber)"/>
<path class="teardrop core" d="M300 386 C309 406 311 436 300 456 C289 436 291 406 300 386 Z"/>
<path class="ragged" d="M309 346 L304 360 L314 366 L312 384 C328 414 326 440 300 460 C274 440 272 408 286 384 L286 370 L294 374 Z" fill="url(#cw-flame-amber)"/>
</g>
<g class="flame-blue">
<path class="teardrop" d="M300 340 C322 380 330 432 300 460 C270 432 278 380 300 340 Z" fill="url(#cw-flame-blue)"/>
<path class="teardrop core" d="M300 386 C309 406 311 436 300 456 C289 436 291 406 300 386 Z"/>
<path class="ragged" d="M309 346 L304 360 L314 366 L312 384 C328 414 326 440 300 460 C274 440 272 408 286 384 L286 370 L294 374 Z" fill="url(#cw-flame-blue)"/>
</g>
</g></g></g>
<path class="smoke-wisp" d="M300 456 C288 438 314 426 301 408 C290 392 312 380 303 360"/>
</g>
</g>
<g class="holder-foreground">
<path class="h-front" d="${DISH_FRONT}"/>
<path class="h-front-night" d="${DISH_FRONT}" mask="url(#cw-pool-mask)"/>
</g>
<g class="zone">
<rect class="zone-rest" x="${BACKDROP.x0}" y="900" width="${BACKDROP.x1-BACKDROP.x0}" height="${BACKDROP.y1-FLOOR_Y}"/>
<rect class="zone-dawn" x="${BACKDROP.x0}" y="900" width="${BACKDROP.x1-BACKDROP.x0}" height="${BACKDROP.y1-FLOOR_Y}"/>
<rect class="zone-text-area" x="110" y="900" width="380" height="100" fill="none"/>
</g>
</svg>`;
