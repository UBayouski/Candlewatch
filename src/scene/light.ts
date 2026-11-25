// Pure mask and colour model, in room coordinates and linear sRGB channel interpolation.
import { FLOOR_Y, LIGHT_FULL_UNITS } from "./constants";
import { DAWN_FIELD, EDGE, WARM_TINT, WINDOW_LIGHT } from "./setting";
import type { Point } from "./setting";

export type Colour = readonly [number, number, number];
const NIGHT: Colour = [5, 7, 13];
const VEIL: Colour = [63, 74, 98];
const TINT: Colour = [125, 90, 52];
const finite = (...values: number[]): boolean => values.every(Number.isFinite);
const clamp = (n: number): number => Math.max(0, Math.min(1, n));
export function poolLight(dx: number, dy: number, r: number): number {
  if (!finite(dx, dy, r) || r <= 0) return 0;
  const d = Math.hypot(dx, dy) / (LIGHT_FULL_UNITS * r);
  if (d >= 1) return 0;
  return d <= 0.6 ? 1 - d * (0.25 / 0.6) : 0.75 * (1 - d) / 0.4;
}
export function poolRadiusDrawn(phase: string, r: number): number {
  return phase === "idle" || !finite(r) ? 0 : r;
}
export function edgeShade(x: number): number {
  if (!finite(x)) return 0;
  return EDGE.windowShade * clamp((Math.abs(x - WINDOW_LIGHT.cx) - EDGE.near) / (EDGE.far - EDGE.near));
}
export function veilAt(x: number): number {
  if (!finite(x)) return 0;
  return EDGE.veil * clamp((Math.abs(x - WINDOW_LIGHT.cx) - EDGE.near) / (EDGE.far - EDGE.near));
}
export function windowLight(r: number, dawn: number): number {
  if (!finite(r, dawn)) return 0;
  const level = r > 0 ? WINDOW_LIGHT.night : WINDOW_LIGHT.snuffed;
  return level + (WINDOW_LIGHT.dawn - level) * clamp(dawn);
}
function radialProfile(d: number, profile: readonly Point[]): number {
  if (!finite(d) || d > 1) return 0;
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1], b = profile[i];
    if (a && b && d <= b[0]) return a[1] + (b[1] - a[1]) * (d - a[0]) / (b[0] - a[0]);
  }
  return profile.at(-1)?.[1] ?? 0;
}
export function windowProfile(distance: number): number {
  if (!finite(distance)) return 0;
  return radialProfile(Math.max(0, distance) / WINDOW_LIGHT.r, WINDOW_LIGHT.profile);
}
export function dawnFieldAt(x: number, y: number, landscape = false): number {
  if (y >= FLOOR_Y) return 0;
  const field = landscape ? DAWN_FIELD.landscape : DAWN_FIELD.compact;
  const v = (y - field.y) / field.ry;
  const u = (x - field.x - v * field.shift) / field.rx;
  // Solve for the first interpolated circle that reaches this point.
  const focus = 2 * DAWN_FIELD.focusY - 1;
  const delta = v - focus;
  const slope = 1 - focus * focus;
  const along = focus * delta;
  const radius = (along + Math.sqrt(along * along + slope * (u * u + delta * delta))) / slope;
  return radialProfile(radius, DAWN_FIELD.profile);
}
export function windowLightAt(x: number, y: number, r: number, dawn: number): number {
  if (!finite(x, y, r, dawn)) return 0;
  return windowLight(r, dawn) * windowProfile(Math.hypot(x - WINDOW_LIGHT.cx, y - WINDOW_LIGHT.cy)) * (1 - edgeShade(x));
}
export function lightAt(x: number, y: number, flameY: number, rDrawn: number, r: number, dawn: number, landscape = false): number {
  if (!finite(x, y, flameY, rDrawn, r, dawn)) return 0;
  const a = poolLight(x - WINDOW_LIGHT.cx, y - flameY, rDrawn), b = windowLightAt(x, y, r, dawn);
  const c = dawnFieldAt(x, y, landscape) * DAWN_FIELD.exposure * clamp(dawn);
  return 1 - (1 - a) * (1 - b) * (1 - c);
}
export function tintAt(x: number, y: number, flameY: number, rDrawn: number): number {
  if (!finite(x, y, flameY, rDrawn)) return 0;
  return WARM_TINT.alpha * poolLight(x - WINDOW_LIGHT.cx, y - flameY, rDrawn);
}
const mix = (a: Colour, b: Colour, k: number): Colour => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
export function settingColour(token: Colour, isWall: boolean, x: number, y: number, flameY: number, rDrawn: number, dawn = 0, landscape = false): Colour {
  const candlelit = mix(mix(token, VEIL, isWall ? veilAt(x) : 0), TINT, tintAt(x, y, flameY, rDrawn));
  return mix(candlelit, DAWN_FIELD.warmth, dawnFieldAt(x, y, landscape) * DAWN_FIELD.tint * clamp(dawn));
}
export function litColour(token: Colour, isWall: boolean, x: number, y: number, flameY: number, rDrawn: number, r: number, dawn: number, landscape = false): Colour {
  return mix(NIGHT, settingColour(token, isWall, x, y, flameY, rDrawn, dawn, landscape), lightAt(x, y, flameY, rDrawn, r, dawn, landscape));
}
