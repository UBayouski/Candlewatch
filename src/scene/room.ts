// The static markup of the room (candle-scene design section 5). No logic and no text: every number the
// scene changes with state is a CSS custom property read by scene.css. IDs are prefixed `cw-`.
//
// Room units: the stage is 600 x 1000 (viewBox); the backdrop is drawn far beyond it, x -2200..2800.
// The floor line is y = 900: the candle's base, the clip line for everything lit, and the top of the zone.
// Layers, back to front: wall, night, window, dawn-wash, candle, lit (clipped), zone (topmost).

import { DRIPS, DRIP_TOP_Y, WINDOW } from "./constants";

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

const WINDOW_RECT = `x="${WINDOW.x}" y="${WINDOW.y}" width="${WINDOW.width}" height="${WINDOW.height}"`;

export const ROOM_SVG = `<svg class="room" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 1000" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
<defs>
<linearGradient id="cw-wall-grad" gradientUnits="userSpaceOnUse" x1="0" y1="-600" x2="0" y2="900"><stop class="st-wall-top" offset="0"/><stop class="st-wall-low" offset="1"/></linearGradient>
<linearGradient id="cw-window-grad" x1="0" y1="0" x2="0" y2="1"><stop class="st-window-moon" offset="0"/><stop class="st-window-night" offset="1"/></linearGradient>
<filter id="cw-soft-edge" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${WINDOW.blur}"/></filter>
<linearGradient id="cw-dawn-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="900"><stop class="st-dawn-top" offset="0"/><stop class="st-dawn-low" offset="1"/></linearGradient>
<linearGradient id="cw-wax-grad" x1="0" y1="0" x2="1" y2="0"><stop class="st-wax-shade" offset="0"/><stop class="st-wax-ivory" offset="0.4"/><stop class="st-wax-ivory" offset="0.7"/><stop class="st-wax-shade" offset="1"/></linearGradient>
<radialGradient id="cw-flame-amber" cx="0.5" cy="0.78" r="0.62"><stop class="st-flame-core" offset="0"/><stop class="st-amber-mid" offset="0.45"/><stop class="st-amber-outer" offset="1"/></radialGradient>
<radialGradient id="cw-flame-blue" cx="0.5" cy="0.78" r="0.62"><stop class="st-blue-core" offset="0"/><stop class="st-blue-outer" offset="1"/></radialGradient>
<radialGradient id="cw-halo-grad"><stop class="st-halo-in" offset="0"/><stop class="st-halo-out" offset="1"/></radialGradient>
<radialGradient id="cw-ember-grad"><stop class="st-ember-in" offset="0"/><stop class="st-ember-out" offset="1"/></radialGradient>
<radialGradient id="cw-pool-hole"><stop offset="0" stop-color="#000" stop-opacity="1"/><stop offset="0.6" stop-color="#000" stop-opacity="0.75"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<mask id="cw-pool-mask" maskUnits="userSpaceOnUse" x="-2200" y="-600" width="5000" height="1500">
<rect class="mask-all" x="-2200" y="-600" width="5000" height="1500" fill="#fff"/>
<circle class="pool" cx="0" cy="0" r="700" fill="url(#cw-pool-hole)"/>
</mask>
<clipPath id="cw-above-floor"><rect x="-2200" y="-600" width="5000" height="1500"/></clipPath>
</defs>
<rect class="wall" x="-2200" y="-600" width="5000" height="1500" fill="url(#cw-wall-grad)"/>
<rect class="night" x="-2200" y="-600" width="5000" height="1500" mask="url(#cw-pool-mask)"/>
<g class="window" filter="url(#cw-soft-edge)"><rect class="window-rest" ${WINDOW_RECT}/><rect class="window-dawn" ${WINDOW_RECT}/></g>
<rect class="dawn-wash" x="-2200" y="-600" width="5000" height="1500" fill="url(#cw-dawn-grad)"/>
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
<circle class="ember" cx="300" cy="458" r="8" fill="url(#cw-ember-grad)"/>
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
<g class="zone">
<rect class="zone-rest" x="-2200" y="900" width="5000" height="700"/>
<rect class="zone-dawn" x="-2200" y="900" width="5000" height="700"/>
<rect class="zone-text-area" x="110" y="900" width="380" height="100" fill="none"/>
</g>
</svg>`;
