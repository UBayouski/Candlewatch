// ghosts-and-graveyard R4.14, R9.14 (design L5, L11): the contrast figures are computed from the hex values.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OVERFLOW_MARK } from "../ghosts/slots";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const sceneCss = readFileSync(join(SRC, "scene", "scene.css"), "utf8");
const uiCss = readFileSync(join(SRC, "ui", "ui.css"), "utf8");

function token(source: string, name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(source);
  if (!m) throw new Error(`token ${name} not found`);
  return (m[1] ?? "").toLowerCase();
}

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const IVORY = "#efe6cf";
const FACE = "#1b2030"; // stone and door face
const PANEL = "#080b12"; // view panel and details card
const ROOM_BRIGHTEST = "#566683";
const ROOM_DARKEST = "#05070d";

describe("ivory text contrast from the hex values (R4.14, R9.14, L11)", () => {
  it("on the stone and door face #1b2030 is 13.0 and at least 4.5", () => {
    const c = contrast(IVORY, FACE);
    expect(c).toBeGreaterThanOrEqual(4.5);
    expect(c).toBeCloseTo(13.0, 1);
  });

  it("on the panel and card #080b12 is 15.83 and at least 4.5", () => {
    const c = contrast(IVORY, PANEL);
    expect(c).toBeGreaterThanOrEqual(4.5);
    expect(c).toBeCloseTo(15.83, 2);
  });

  it("on the room's brightest stop #566683 is 4.66 and at least 4.5", () => {
    const c = contrast(IVORY, ROOM_BRIGHTEST);
    expect(c).toBeGreaterThanOrEqual(4.5);
    expect(c).toBeCloseTo(4.66, 2);
  });

  it("on the room's darkest stop #05070d is 16.20 and at least 4.5", () => {
    const c = contrast(IVORY, ROOM_DARKEST);
    expect(c).toBeGreaterThanOrEqual(4.5);
    expect(c).toBeCloseTo(16.2, 2);
  });
});

describe("the palette the figures stand on is the real one (L11)", () => {
  it("scene.css still holds the room stops the design names", () => {
    expect(token(sceneCss, "--room-bg-brightest")).toBe(ROOM_BRIGHTEST);
    expect(token(sceneCss, "--room-bg-darkest")).toBe(ROOM_DARKEST);
    expect(token(sceneCss, "--zone-bg-darkest")).toBe(PANEL);
  });

  it("ui.css ivory focus colour is the ivory of the design", () => {
    expect(token(uiCss, "--ui-focus")).toBe(IVORY);
  });

  it("the contrast computed from the live scene.css stops keeps the floor", () => {
    const bright = token(sceneCss, "--room-bg-brightest");
    const dark = token(sceneCss, "--room-bg-darkest");
    expect(contrast(IVORY, bright)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(IVORY, dark)).toBeGreaterThan(contrast(IVORY, bright));
  });
});

describe("non-text outlines and focus rings (L11, R6.19)", () => {
  // L11 names the ivory outline: on the face, on the room (both stops) and as the focus ring.
  it.each([
    ["the face #1b2030", FACE],
    ["the room's brightest stop", ROOM_BRIGHTEST],
    ["the room's darkest stop", ROOM_DARKEST],
  ])("an ivory outline on %s is at least 3:1", (_name, bg) => {
    expect(contrast(IVORY, bg)).toBeGreaterThanOrEqual(3);
  });
});

describe("the Overflow_Mark (L5, R9.14)", () => {
  it("is ivory and sits in the room, below the floor band", () => {
    expect(OVERFLOW_MARK).toEqual({ x: 545, y: 860, fontSize: 24 });
  });

  it("is 4.66 on the brightest room stop and higher on the darkest", () => {
    const bright = contrast(IVORY, token(sceneCss, "--room-bg-brightest"));
    const dark = contrast(IVORY, token(sceneCss, "--room-bg-darkest"));
    expect(bright).toBeGreaterThanOrEqual(4.5);
    expect(bright).toBeCloseTo(4.66, 2);
    expect(dark).toBeGreaterThan(bright);
  });
});
