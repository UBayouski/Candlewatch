import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CANDLE_H } from "./constants";

const CSS_PATH = join(dirname(fileURLToPath(import.meta.url)), "scene.css");
const RAW = readFileSync(CSS_PATH, "utf8");
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, "");

// --- parsing ---------------------------------------------------------------------------------

/** `--name: value;` declarations, in file order. */
const declarations = [...CSS.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => ({ name: m[1] ?? "", value: (m[2] ?? "").trim() }));

function palette(name: string): string {
  const found = declarations.filter((d) => d.name === name);
  if (found.length !== 1) throw new Error(`${name} is declared ${found.length} times`);
  return found[0]?.value ?? "";
}

/** `selector { body }` blocks that contain no braces (so nested at-rule contents are matched on their own). */
const blocks = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selectors: (m[1] ?? "").split(",").map((s) => s.trim()),
  body: (m[2] ?? "").trim(),
}));

const rule = (selector: string): string =>
  blocks
    .filter((b) => b.selectors.includes(selector))
    .map((b) => b.body)
    .join(" ");

const usesVar = (name: string): boolean => new RegExp(`var\\(${name}(?=[\\s,)])`).test(CSS);

// --- colour maths (WCAG 2.x relative luminance) -------------------------------------------------

function rgb(hex: string): [number, number, number] {
  const h = hex.trim().replace(/^#/, "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `fg` at `alpha` over an opaque `bg`, as a hex colour. */
function composite(fg: string, bg: string, alpha: number): string {
  const f = rgb(fg);
  const b = rgb(bg);
  return "#" + f.map((v, i) => Math.round(alpha * v + (1 - alpha) * (b[i] ?? 0)).toString(16).padStart(2, "0")).join("");
}

// --- tests -----------------------------------------------------------------------------------

describe("reduced motion (R9.5)", () => {
  it("has a prefers-reduced-motion block that switches off every animation and transition", () => {
    expect(CSS).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    const body = blocks.find((b) => b.selectors.includes(".candle-scene *"))?.body ?? "";
    expect(body).toMatch(/animation:\s*none/);
    expect(body).toMatch(/transition:\s*none/);
  });

  it("only switches motion on after the first paint (data-settled), outside the reduced-motion block", () => {
    const motion = blocks.filter((b) => /\b(transition|animation)\s*:/.test(b.body) && !/:\s*none\s*!important/.test(b.body));
    expect(motion.length).toBeGreaterThan(0);
    for (const b of motion) {
      expect(b.selectors.every((s) => s.includes('[data-settled="true"]')), b.selectors.join(",")).toBe(true);
    }
  });
});

describe("custom properties (design 6.2)", () => {
  const written = [
    "--wax-height",
    "--drips",
    "--flame-height",
    "--flame-blue",
    "--flame-ragged",
    "--flame-glow",
    "--smoke",
    "--stub",
    "--light-radius",
    "--dawn",
    "--cooling",
    "--flicker-lean",
    "--flicker-height",
    "--flicker-glow",
  ];

  it("every property the renderer writes is read by at least one rule", () => {
    for (const name of written) expect(usesVar(name), name).toBe(true);
  });

  it("every one of them has a default for the instant before the first model", () => {
    for (const name of written) expect(declarations.some((d) => d.name === name), name).toBe(true);
  });

  it("the pool and the head are sized from the 420-unit candle", () => {
    expect(rule(".pool")).toContain(`* ${CANDLE_H}px`);
    expect(rule(".head")).toContain(`* ${CANDLE_H}px`);
  });
});

describe("one thing per element (F4, F6)", () => {
  it(".pool has no opacity rule: its intensity is constant", () => {
    expect(rule(".pool")).not.toMatch(/opacity/);
    expect(rule(".pool")).not.toContain("--flame-glow");
  });

  it(".night is constant: no opacity, and it reads neither --dawn nor --flame-glow", () => {
    const body = rule(".night");
    expect(body).not.toMatch(/opacity/);
    expect(body).not.toContain("--dawn");
    expect(body).not.toContain("--flame-glow");
    expect(body).toContain("var(--room-night)");
  });

  it("the dawn is a wash above the night: window pane, wash and zone read --dawn", () => {
    expect(rule(".dawn-wash")).toContain("var(--dawn)");
    expect(rule(".window-dawn")).toContain("var(--dawn)");
    expect(rule(".zone-dawn")).toContain("var(--dawn)");
  });

  it(".halo is the only reader of the flame glow", () => {
    const readers = blocks.filter((b) => b.body.includes("--flame-glow") || b.body.includes("--flicker-glow"));
    const names = new Set(readers.flatMap((b) => b.selectors).filter((s) => !s.startsWith(".candle-scene {")));
    expect([...names].filter((s) => s !== ".candle-scene")).toEqual([".halo"]);
  });

  it(".stub takes its opacity from --stub, and .body is scaleY(--wax-height)", () => {
    expect(rule(".stub")).toContain("opacity: var(--stub)");
    expect(rule(".body")).toContain("scaleY(var(--wax-height))");
    expect(rule(".body")).toContain("transform-origin: 50% 100%");
  });

  it("the drips are scaled by the drip count", () => {
    expect(rule(".drip-1")).toContain("var(--drips) - 0");
    expect(rule(".drip-2")).toContain("var(--drips) - 1");
    expect(rule(".drip-3")).toContain("var(--drips) - 2");
  });

  it("the zone is two flat fills: rest and dawn", () => {
    expect(rule(".zone-rest")).toBe("fill: var(--zone-bg-darkest);");
    expect(rule(".zone-dawn")).toContain("fill: var(--zone-bg-brightest)");
  });

  it("has no table, dish or floor in the stylesheet (F1, F2)", () => {
    expect(CSS).not.toMatch(/--(table|dish|floor)\b|\.(table|dish|floor)\b/);
  });

  it("defines the visually-hidden class for the placeholder heading", () => {
    const body = rule(".visually-hidden");
    expect(body).toContain("width: 1px");
    expect(body).toContain("height: 1px");
    expect(body).not.toMatch(/display:\s*none/);
  });
});

describe("palette and contrast (R7.7, R7.8)", () => {
  const ivory = palette("--wax-ivory");
  const roomDark = palette("--room-bg-darkest");
  const roomBright = palette("--room-bg-brightest");
  const zoneDark = palette("--zone-bg-darkest");
  const zoneBright = palette("--zone-bg-brightest");
  const alpha = Number(palette("--dawn-alpha"));

  it("publishes the four handoff colours", () => {
    expect([roomDark, roomBright, zoneDark, zoneBright]).toEqual(["#05070d", "#566683", "#080b12", "#4b4358"]);
    expect(ivory).toBe("#efe6cf");
  });

  it("every background colour the scene paints above the floor lies between the room bounds", () => {
    const lo = luminance(roomDark);
    const hi = luminance(roomBright);
    const night = palette("--room-night");
    const stops: Record<string, string> = {
      "--room-night": night,
      "--wall-top": palette("--wall-top"),
      "--wall-low": palette("--wall-low"),
      "--window-night": palette("--window-night"),
      "--window-dawn": palette("--window-dawn"),
      "dawn-cool over night": composite(palette("--dawn-cool"), night, alpha),
      "dawn-warm over night": composite(palette("--dawn-warm"), night, alpha),
    };
    for (const [name, colour] of Object.entries(stops)) {
      expect(luminance(colour), name).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(luminance(colour), name).toBeLessThanOrEqual(hi + 1e-9);
    }
  });

  it("ivory against the room bounds and the zone is at least 4.5:1, with the documented figures", () => {
    const figures: [string, string, number][] = [
      ["room darkest", roomDark, 16.2],
      ["room brightest", roomBright, 4.66],
      ["zone darkest", zoneDark, 15.83],
      ["zone brightest", zoneBright, 7.53],
    ];
    for (const [name, colour, expected] of figures) {
      const ratio = contrast(ivory, colour);
      expect(ratio, name).toBeGreaterThanOrEqual(4.5);
      expect(Math.round(ratio * 100) / 100, name).toBe(expected);
    }
  });

  it("ivory on the dawn wash over the night layer stays at or above 4.5:1", () => {
    const night = palette("--room-night");
    expect(contrast(ivory, composite(palette("--dawn-cool"), night, alpha))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ivory, composite(palette("--dawn-warm"), night, alpha))).toBeGreaterThanOrEqual(4.5);
  });

  it("text at least as bright as ivory keeps 4.5:1 on the zone (the handoff rule)", () => {
    const brightest = "#ffffff";
    expect(luminance(ivory)).toBeCloseTo(0.7945, 3);
    expect(contrast(brightest, zoneBright)).toBeGreaterThan(contrast(ivory, zoneBright));
    expect(contrast(brightest, zoneDark)).toBeGreaterThan(contrast(ivory, zoneDark));
  });

  it("the window at rest is a single constant colour, visible against the night (F3)", () => {
    expect(contrast(palette("--window-night"), palette("--room-night"))).toBeGreaterThanOrEqual(1.4);
    expect(Math.round(contrast(palette("--window-night"), palette("--room-night")) * 100) / 100).toBe(1.57);
    expect(rule(".window-rest")).toBe("fill: var(--window-night);");
    expect(CSS.match(/--window-night\s*:/g)).toHaveLength(1);
  });
});
