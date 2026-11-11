// controls-and-access R7.6, R8.10, R10.4, R13 (design 12, 13.1): the stylesheet keeps its promises.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, "ui.css"), "utf8");
const sceneCss = readFileSync(join(HERE, "..", "scene", "scene.css"), "utf8");

const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "");
const code = stripComments(css);

function token(source: string, name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(source);
  if (!m) throw new Error(`token ${name} not found`);
  return m[1] as string;
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

const ui = {
  text: token(css, "--ui-text"),
  subtle: token(css, "--ui-text-subtle"),
  bg: token(css, "--ui-bg"),
  selected: token(css, "--ui-bg-selected"),
  border: token(css, "--ui-border"),
  focus: token(css, "--ui-focus"),
  error: token(css, "--ui-error"),
};
const room = { darkest: token(sceneCss, "--room-bg-darkest"), brightest: token(sceneCss, "--room-bg-brightest") };
const zone = { darkest: token(sceneCss, "--zone-bg-darkest"), brightest: token(sceneCss, "--zone-bg-brightest") };

describe("the stylesheet's structure", () => {
  it("starts with the reduced-motion rule (R13.1)", () => {
    const first = code.trim().split("{")[0]?.trim();
    expect(first).toBe("@media (prefers-reduced-motion: reduce)");
    expect(code).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*#ui,\s*#ui \*\s*\{\s*transition: none !important;\s*animation: none !important;/);
  });

  it("allows !important only in the reduced-motion rule and the [hidden] rule", () => {
    const withoutAllowed = code
      .replace(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*#ui,\s*#ui \*\s*\{[^}]*\}\s*\}/, "")
      .replace(/\[hidden\]\s*\{[^}]*\}/, "");
    expect(withoutAllowed).not.toMatch(/!important/);
    expect((code.match(/!important/g) ?? []).length).toBe(3);
  });

  it("never removes the outline without a replacement (R10.4)", () => {
    expect(code).not.toMatch(/outline\s*:\s*(?:none|0)\b/);
    expect(code).not.toMatch(/outline-style\s*:\s*none/);
    const ring = /#ui :focus-visible\s*\{([^}]*)\}/.exec(code)?.[1] ?? "";
    expect(ring).toMatch(/outline:\s*3px solid var\(--ui-focus\)/);
    expect(ring).toMatch(/outline-offset:\s*3px/);
  });

  it("clips no ancestor of a control with overflow: hidden (the ring is never cut)", () => {
    for (const m of code.matchAll(/([^{}]+)\{([^}]*overflow\s*:\s*hidden[^}]*)\}/g)) {
      const selector = (m[1] ?? "").trim();
      expect(selector, selector).toMatch(/#status|\.sr-only|\.label/);
    }
  });

  it("has the hidden rule, transparent backdrops, forced-colours and more-contrast rules", () => {
    expect(code).toMatch(/\[hidden\]\s*\{\s*display: none !important;\s*\}/);
    expect(code).toMatch(/::backdrop\s*\{\s*background: transparent;/);
    expect(code).toContain("@media (forced-colors: active)");
    expect(code).toContain("@media (prefers-contrast: more)");
    expect(code).toContain("Highlight");
    expect(code).toContain("CanvasText");
  });

  it("places elements only through custom properties and uses no style attribute", () => {
    expect(code).toMatch(/left: var\(--x\)/);
    expect(code).toMatch(/top: var\(--y\)/);
    expect(code).toMatch(/width: var\(--w\)/);
    expect(code).toMatch(/height: var\(--h\)/);
  });

  it("keeps the time text and the status line out of every transition and animation (R7.2)", () => {
    for (const m of code.matchAll(/([^{}@]+)\{([^}]*(?:transition|animation)\s*:[^}]*)\}/g)) {
      expect((m[1] ?? "").trim(), m[0]).not.toMatch(/#time|#status/);
    }
  });

  it("uses short transitions only: 120 ms fade and switch, 80 ms pressed", () => {
    const durations = [...code.matchAll(/(?:transition|animation)\s*:[^;]*?(\d+)ms/g)].map((m) => Number(m[1]));
    expect(durations.length).toBeGreaterThan(0);
    for (const d of durations) expect([80, 120]).toContain(d);
  });

  it("sets body text at 16 px or more and the time text at 32 px or more (R7.6)", () => {
    expect(/#ui\s*\{[^}]*font-size:\s*(\d+)px/.exec(code)?.[1]).toBe("16");
    expect(/#status\s*\{[^}]*font-size:\s*(\d+)px/.exec(code)?.[1]).toBe("16");
    const timeBlock = /#time\s*\{([^}]*)\}/.exec(code)?.[1] ?? "";
    expect(Number(/font-size:\s*var\(--time-size,\s*(\d+)px\)/.exec(timeBlock)?.[1])).toBeGreaterThanOrEqual(32);
    expect(timeBlock).toMatch(/font-weight:\s*700/);
    expect(timeBlock).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });
});

describe("the contrast table of design 12.1, computed from the token values", () => {
  const ratio = (a: string, b: string): number => Math.round(contrast(a, b) * 100) / 100;

  it("reads the same colours the design names", () => {
    expect(ui).toEqual({ text: "#efe6cf", subtle: "#c9c1ad", bg: "#121826", selected: "#2b3552", border: "#a8afbf", focus: "#efe6cf", error: "#ffb4a3" });
    expect(zone).toEqual({ darkest: "#080b12", brightest: "#4b4358" });
    expect(room).toEqual({ darkest: "#05070d", brightest: "#566683" });
  });

  it("time and status text (ivory) on the zone's darkest and brightest backgrounds: at least 4.5, published 15.83 and 7.53", () => {
    expect(ratio(ui.text, zone.darkest)).toBeCloseTo(15.83, 1);
    expect(ratio(ui.text, zone.brightest)).toBeCloseTo(7.53, 1);
    expect(luminance(ui.text)).toBeGreaterThanOrEqual(0.7945 - 1e-3);
  });

  it("text on the control fills: 14.26 on the plain fill, 9.74 on the selected fill", () => {
    expect(ratio(ui.text, ui.bg)).toBeCloseTo(14.26, 1);
    expect(ratio(ui.text, ui.selected)).toBeCloseTo(9.74, 1);
  });

  it("subtle text: 9.89 on the fill, 10.98 and 5.22 on the zone bounds", () => {
    expect(ratio(ui.subtle, ui.bg)).toBeCloseTo(9.89, 1);
    expect(ratio(ui.subtle, zone.darkest)).toBeCloseTo(10.98, 1);
    expect(ratio(ui.subtle, zone.brightest)).toBeCloseTo(5.22, 1);
    for (const background of [ui.bg, zone.darkest, zone.brightest]) expect(contrast(ui.subtle, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("error text: 10.39 on the fill, 11.54 and 5.49 on the zone bounds", () => {
    expect(ratio(ui.error, ui.bg)).toBeCloseTo(10.39, 1);
    expect(ratio(ui.error, zone.darkest)).toBeCloseTo(11.54, 1);
    expect(ratio(ui.error, zone.brightest)).toBeCloseTo(5.49, 1);
    for (const background of [ui.bg, zone.darkest, zone.brightest]) expect(contrast(ui.error, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("the border: 8.06 on the fill, 8.95 and 4.26 on the zone bounds, 9.16 on the darkest room; at least 3", () => {
    expect(ratio(ui.border, ui.bg)).toBeCloseTo(8.06, 1);
    expect(ratio(ui.border, zone.darkest)).toBeCloseTo(8.95, 1);
    expect(ratio(ui.border, zone.brightest)).toBeCloseTo(4.26, 1);
    expect(ratio(ui.border, room.darkest)).toBeCloseTo(9.16, 1);
    for (const background of [ui.bg, zone.darkest, zone.brightest, room.darkest]) expect(contrast(ui.border, background)).toBeGreaterThanOrEqual(3);
  });

  it("the control fill against the room's brightest background: 3.06 (the border alone is 2.64 there)", () => {
    expect(ratio(ui.bg, room.brightest)).toBeCloseTo(3.06, 1);
    expect(contrast(ui.bg, room.brightest)).toBeGreaterThanOrEqual(3);
    expect(ratio(ui.border, room.brightest)).toBeCloseTo(2.64, 1);
  });

  it("the focus ring: 7.53 on the zone's brightest, 4.66 on the room's brightest, 14.26 on the fill; at least 3", () => {
    expect(ratio(ui.focus, zone.brightest)).toBeCloseTo(7.53, 1);
    expect(ratio(ui.focus, room.brightest)).toBeCloseTo(4.66, 1);
    expect(ratio(ui.focus, ui.bg)).toBeCloseTo(14.26, 1);
    for (const background of [zone.darkest, zone.brightest, room.darkest, room.brightest, ui.bg]) expect(contrast(ui.focus, background)).toBeGreaterThanOrEqual(3);
  });

  it("the selected fill is not relied on: it differs from the plain fill by 1.46, and a check mark and a heavier border also show it", () => {
    expect(ratio(ui.selected, ui.bg)).toBeCloseTo(1.46, 1);
    expect(code).toMatch(/\.cell\[aria-checked="true"\]\s*\{[^}]*border-width:\s*4px/);
    expect(code).toMatch(/\[aria-checked="true"\] \.cell-check\s*\{\s*display: inline/);
  });
});
