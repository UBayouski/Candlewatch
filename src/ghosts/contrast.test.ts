// ghosts-and-graveyard R9.3, R9.14 (design L11, first costume review advisory): a ghost's outline is a non-text graphic that shows a
// distraction, so its stroke, at its opacity, needs 3:1 against the room behind it at the room's brightest and darkest backgrounds.
// The colours come from ghosts.css and scene.css; the stroke is blended over the room as the browser does, in sRGB.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const ghostsCss = readFileSync(join(SRC, "ghosts", "ghosts.css"), "utf8");
const sceneCss = readFileSync(join(SRC, "scene", "scene.css"), "utf8");

type Rgb = readonly [number, number, number];

function value(source: string, name: string): string {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(source);
  if (!m) throw new Error(`token ${name} not found`);
  return (m[1] ?? "").trim();
}
const hex = (h: string): Rgb => {
  const m = /^#([0-9a-f]{6})$/i.exec(h);
  if (!m) throw new Error(`not a hex colour: ${h}`);
  const s = m[1] ?? "";
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
const luminance = ([r, g, b]: Rgb): number => {
  const c = (v: number): number => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};
const contrast = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
/** `top` at `alpha` over `under`, blended per channel in sRGB (what the browser paints). */
const over = (top: Rgb, alpha: number, under: Rgb): Rgb => [0, 1, 2].map((i) => alpha * (top[i] ?? 0) + (1 - alpha) * (under[i] ?? 0)) as unknown as Rgb;

const STROKE = hex(value(ghostsCss, "--ghost-stroke"));
const STROKE_OPACITY = Number(value(ghostsCss, "--ghost-stroke-opacity"));
const FILL = hex(value(ghostsCss, "--ghost-fill"));
const FILL_OPACITY = Number(value(ghostsCss, "--ghost-opacity"));
const ROOM: readonly [string, Rgb][] = [
  ["the room's brightest background", hex(value(sceneCss, "--room-bg-brightest"))],
  ["the room's darkest background", hex(value(sceneCss, "--room-bg-darkest"))],
];

describe("the ghost's outline against the room (non-text, 3:1)", () => {
  it("reads the tokens it checks", () => {
    expect([STROKE_OPACITY, FILL_OPACITY]).toEqual([0.8, 0.55]);
    expect(ROOM.map(([, c]) => c)).toEqual([hex("#566683"), hex("#05070d")]);
  });

  it.each(ROOM)("the stroke at its opacity is at least 3:1 on %s", (_name, room) => {
    expect(contrast(over(STROKE, STROKE_OPACITY, room), room)).toBeGreaterThanOrEqual(3);
  });

  it("is 4.01 on the brightest background and 11.51 on the darkest", () => {
    const [bright, dark] = ROOM.map(([, room]) => contrast(over(STROKE, STROKE_OPACITY, room), room));
    expect(bright).toBeCloseTo(4.01, 2);
    expect(dark).toBeCloseTo(11.51, 2);
  });

  it.each(ROOM)("the stroke also stands out from the ghost's own fill on %s", (_name, room) => {
    const fill = over(FILL, FILL_OPACITY, room);
    expect(contrast(over(STROKE, STROKE_OPACITY, fill), room)).toBeGreaterThanOrEqual(3);
  });
});
