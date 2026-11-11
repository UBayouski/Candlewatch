// controls-and-access R7.6, R8.10, R10.4, R13 (design 12, 13.1): the stylesheet keeps its promises.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
    expect(timeBlock).toMatch(/font-variant-numeric:\s*lining-nums tabular-nums/);
  });
});

describe("the fonts (tech.md rule 7)", () => {
  const FONTS = join(HERE, "fonts");
  const faces = [...code.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");

  it("declares three self-hosted woff2 faces with font-display: swap, each a file next to the stylesheet", () => {
    expect(faces).toHaveLength(3);
    for (const face of faces) {
      expect(face).toMatch(/font-display:\s*swap/);
      const file = /url\("\.\/fonts\/([a-z0-9-]+\.woff2)"\)\s*format\("woff2"\)/.exec(face)?.[1];
      expect(file, face).toBeDefined();
      expect(existsSync(join(FONTS, file ?? "missing"))).toBe(true);
    }
    expect(faces.filter((f) => f.includes("Cormorant Garamond"))).toHaveLength(1);
    expect(faces.filter((f) => f.includes("Alegreya Sans"))).toHaveLength(2);
  });

  it("keeps the font files small Latin subsets (under 30 KB each) and ships their licences", () => {
    for (const name of readdirSync(FONTS).filter((n) => n.endsWith(".woff2"))) expect(statSync(join(FONTS, name)).size, name).toBeLessThan(30_000);
    for (const name of ["OFL-cormorant-garamond.txt", "OFL-alegreya-sans.txt"]) {
      const text = readFileSync(join(FONTS, name), "utf8");
      expect(text, name).toContain("SIL Open Font License, Version 1.1");
    }
  });

  it("uses no system font by name and keeps a generic fallback in each stack", () => {
    expect(code).not.toMatch(/Segoe UI|Helvetica Neue|system-ui|-apple-system|Roboto|Arial/);
    expect(/--ui-font:\s*([^;]+);/.exec(code)?.[1]).toBe('"Alegreya Sans", sans-serif');
    expect(/--ui-font-display:\s*([^;]+);/.exec(code)?.[1]).toBe('"Cormorant Garamond", serif');
  });

  it("sets the time text and the dialog headings in the display serif, with tabular figures on the time", () => {
    const timeBlock = /#time\s*\{([^}]*)\}/.exec(code)?.[1] ?? "";
    expect(timeBlock).toMatch(/font-family:\s*var\(--ui-font-display\)/);
    expect(timeBlock).toMatch(/font-variant-numeric:\s*lining-nums tabular-nums/);
    expect(/#ui dialog h2\s*\{([^}]*)\}/.exec(code)?.[1]).toMatch(/font-family:\s*var\(--ui-font-display\)/);
    expect(/#ui\s*\{[^}]*font-family:\s*var\(--ui-font\)/.test(code)).toBe(true);
  });

  it("sets the status line in the text face with lining, tabular figures, like the time text above it (costume review, third pass)", () => {
    const statusBlock = /#status\s*\{([^}]*)\}/.exec(code)?.[1] ?? "";
    expect(statusBlock).toMatch(/font-variant-numeric:\s*lining-nums tabular-nums/);
    expect(statusBlock).not.toMatch(/font-family/); // inherits the text face from #ui
  });
});

describe("hover and the selected look (costume review, second pass, finding 4)", () => {
  /** Every rule of the stylesheet as [selector, body], @media wrappers flattened (the stylesheet nests at most one level). */
  const rules = [...code.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [(m[1] ?? "").trim(), m[2] ?? ""] as const);

  it("keeps Close, the settings panel's primary button, on the plain fill: bold and 3 px like any primary, but not selected (third pass, finding 1)", () => {
    const override = rules.find(([selector]) => selector === "#settings-dialog .primary");
    expect(override, "a #settings-dialog .primary rule").toBeDefined();
    expect(override?.[1]).toMatch(/background:\s*var\(--ui-bg\)\s*;/);
    expect(override?.[1]).not.toMatch(/--ui-bg-selected/);
    // It does not drop the bold type or the 3 px border: the override sets the fill and nothing else.
    expect([...(override?.[1] ?? "").matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])).toEqual(["background"]);
    const primary = rules.find(([selector]) => selector === "#ui .primary")?.[1] ?? "";
    expect(primary).toMatch(/border-width:\s*3px/);
    expect(primary).toMatch(/font-weight:\s*700/);
    // Same specificity as `#ui .primary` (1,1,0), so the override must come after it.
    expect(rules.findIndex(([s]) => s === "#settings-dialog .primary")).toBeGreaterThan(rules.findIndex(([s]) => s === "#ui .primary"));
    // And no rule that applies inside the settings panel gives the selected fill to anything but a selected control.
    const insidePanel = rules.filter(([selector, body]) => /var\(--ui-bg-selected\)/.test(body) && selector.includes("#settings-dialog"));
    expect(insidePanel).toEqual([]);
  });

  it("uses the selected fill only under selectors that mean selected (or the one primary answer of a screen)", () => {
    const allowed = ["#ui .primary", '.cell[aria-checked="true"]', '.custom-cell[tabindex="0"]', '.switch[aria-checked="true"]'];
    const users = rules.filter(([, body]) => /var\(--ui-bg-selected\)/.test(body)).map(([selector]) => selector);
    expect(users.length).toBeGreaterThan(0);
    for (const selector of users) expect(allowed.some((a) => selector.endsWith(a)), `${selector} must not use the selected fill`).toBe(true);
  });

  it("changes only the border on hover and on press, and puts hover behind (hover: hover) so a tap leaves nothing behind", () => {
    const hover = rules.filter(([selector]) => selector.includes(":hover"));
    const active = rules.filter(([selector]) => selector.includes(":active"));
    expect(hover).toHaveLength(1);
    expect(active).toHaveLength(1);
    for (const [selector, body] of [...hover, ...active]) {
      const properties = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      expect(properties.sort(), selector).toEqual(["border-color", "border-width"]);
      expect(body, selector).toMatch(/border-color:\s*var\(--ui-text\)/);
    }
    expect(code).toMatch(/@media \(hover: hover\)\s*\{\s*#ui button:hover/);
  });

  it("keeps a selected control selected under the pointer: its selector is more specific than hover, so fill and heavy border stay", () => {
    // `#ui .cell[aria-checked="true"]` and `#ui .switch[aria-checked="true"]` (1,2,0) beat `#ui button:hover` (1,1,1) on border-width.
    expect(code).toMatch(/#ui \.cell\[aria-checked="true"\]\s*\{[^}]*background:\s*var\(--ui-bg-selected\);[^}]*border-width:\s*4px/);
    expect(code).toMatch(/#ui \.switch\[aria-checked="true"\]\s*\{[^}]*background:\s*var\(--ui-bg-selected\);[^}]*border-width:\s*4px/);
  });
});

describe("the contrast table of design 12.1, computed from the token values", () => {
  const ratio = (a: string, b: string): number => Math.round(contrast(a, b) * 100) / 100;

  it("reads the same colours the design names", () => {
    expect(ui).toEqual({ text: "#efe6cf", subtle: "#cfc2a2", bg: "#1a130d", selected: "#3a2a1c", border: "#e6c27a", focus: "#efe6cf", error: "#ffb4a3" });
    expect(zone).toEqual({ darkest: "#080b12", brightest: "#4b4358" });
    expect(room).toEqual({ darkest: "#05070d", brightest: "#566683" });
  });

  it("time and status text (ivory) on the zone's darkest and brightest backgrounds: at least 4.5, published 15.83 and 7.53", () => {
    expect(ratio(ui.text, zone.darkest)).toBeCloseTo(15.83, 1);
    expect(ratio(ui.text, zone.brightest)).toBeCloseTo(7.53, 1);
    expect(luminance(ui.text)).toBeGreaterThanOrEqual(0.7945 - 1e-3);
  });

  it("text on the control fills: 14.78 on the plain fill, 11.05 on the selected fill", () => {
    expect(ratio(ui.text, ui.bg)).toBeCloseTo(14.78, 1);
    expect(ratio(ui.text, ui.selected)).toBeCloseTo(11.05, 1);
  });

  it("subtle text: 10.40 on the fill, 7.78 on the selected fill, 11.15 and 5.30 on the zone bounds", () => {
    expect(ratio(ui.subtle, ui.bg)).toBeCloseTo(10.4, 1);
    expect(ratio(ui.subtle, ui.selected)).toBeCloseTo(7.78, 1);
    expect(ratio(ui.subtle, zone.darkest)).toBeCloseTo(11.15, 1);
    expect(ratio(ui.subtle, zone.brightest)).toBeCloseTo(5.3, 1);
    for (const background of [ui.bg, ui.selected, zone.darkest, zone.brightest]) expect(contrast(ui.subtle, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("error text and border: 10.77 on the fill, 8.06 on the selected fill (the invalid custom cell), 11.54 and 5.49 on the zone bounds", () => {
    expect(ratio(ui.error, ui.bg)).toBeCloseTo(10.77, 1);
    expect(ratio(ui.error, ui.selected)).toBeCloseTo(8.06, 1);
    expect(contrast(ui.error, ui.selected)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(ui.error, zone.darkest)).toBeCloseTo(11.54, 1);
    expect(ratio(ui.error, zone.brightest)).toBeCloseTo(5.49, 1);
    for (const background of [ui.bg, ui.selected, zone.darkest, zone.brightest]) expect(contrast(ui.error, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("the length message (#length-error) stands on the room, so it carries the control fill: 10.77 on the fill where it was 3.39 on the brightest room", () => {
    // The old pair, kept as the reason for the fill: the error colour straight on the room's brightest background fails AA.
    expect(ratio(ui.error, room.brightest)).toBeCloseTo(3.39, 1);
    expect(contrast(ui.error, room.brightest)).toBeLessThan(4.5);
    // The pair that ships: the error colour on the fill, at every light level of the room behind it (the fill is opaque).
    expect(ratio(ui.error, ui.bg)).toBeCloseTo(10.77, 1);
    expect(contrast(ui.error, ui.bg)).toBeGreaterThanOrEqual(4.5);
    const block = /#length-error\s*\{([^}]*)\}/.exec(code)?.[1] ?? "";
    expect(block).toMatch(/background:\s*var\(--ui-bg\)/);
    expect(block).toMatch(/padding:\s*4px\s*;/);
    expect(block).toMatch(/color:\s*var\(--ui-error\)/);
  });

  it("the placeholder hint of the intent field (subtle text on the field fill): at least 4.5, published 10.40", () => {
    expect(code).toMatch(/#intent-box input::placeholder\s*\{\s*color:\s*var\(--ui-text-subtle\);/);
    expect(ratio(ui.subtle, ui.bg)).toBeCloseTo(10.4, 1);
    expect(contrast(ui.subtle, ui.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("the border alone: 10.82 on the fill, 8.09 on the selected fill, 11.59 and 5.51 on the zone bounds, 11.86 on the darkest room and 3.41 on the brightest; at least 3 everywhere", () => {
    expect(ratio(ui.border, ui.bg)).toBeCloseTo(10.82, 1);
    expect(ratio(ui.border, ui.selected)).toBeCloseTo(8.09, 1);
    expect(ratio(ui.border, zone.darkest)).toBeCloseTo(11.59, 1);
    expect(ratio(ui.border, zone.brightest)).toBeCloseTo(5.51, 1);
    expect(ratio(ui.border, room.darkest)).toBeCloseTo(11.86, 1);
    expect(ratio(ui.border, room.brightest)).toBeCloseTo(3.41, 1);
    for (const background of [ui.bg, ui.selected, zone.darkest, zone.brightest, room.darkest, room.brightest]) expect(contrast(ui.border, background)).toBeGreaterThanOrEqual(3);
  });

  it("the control fill is no longer what carries a control against the brightest room (3.17); the border does", () => {
    expect(ratio(ui.bg, room.brightest)).toBeCloseTo(3.17, 1);
    expect(contrast(ui.border, room.brightest)).toBeGreaterThanOrEqual(3);
  });

  it("the focus ring: 7.53 on the zone's brightest, 4.66 on the room's brightest, 14.78 on the fill; at least 3", () => {
    expect(ratio(ui.focus, zone.brightest)).toBeCloseTo(7.53, 1);
    expect(ratio(ui.focus, room.brightest)).toBeCloseTo(4.66, 1);
    expect(ratio(ui.focus, ui.bg)).toBeCloseTo(14.78, 1);
    for (const background of [zone.darkest, zone.brightest, room.darkest, room.brightest, ui.bg]) expect(contrast(ui.focus, background)).toBeGreaterThanOrEqual(3);
  });

  it("the selected fill is not relied on: it differs from the plain fill by 1.34, and a check mark and a heavier border also show it", () => {
    expect(ratio(ui.selected, ui.bg)).toBeCloseTo(1.34, 1);
    expect(code).toMatch(/\.cell\[aria-checked="true"\]\s*\{[^}]*border-width:\s*4px/);
    expect(code).toMatch(/\[aria-checked="true"\] \.cell-check\s*\{\s*display: inline/);
  });
});
