import { describe, expect, it } from "vitest";
import { CANDLE_H, DRIPS, DRIP_TOP_Y, FLOOR_Y, STUB_H, WINDOW } from "./constants";
import { ROOM_SVG, dripPath } from "./room";

/** Attributes of the first element whose class attribute is exactly `className` (or contains it as a token). */
function element(svg: string, tag: string, className: string): { attrs: Record<string, string>; raw: string } {
  const re = new RegExp(`<${tag}\\b[^>]*\\bclass="([^"]*)"[^>]*>`, "g");
  for (const m of svg.matchAll(re)) {
    if ((m[1] ?? "").split(/\s+/).includes(className)) {
      const attrs: Record<string, string> = {};
      for (const a of m[0].matchAll(/([a-zA-Z-:]+)="([^"]*)"/g)) attrs[a[1] ?? ""] = a[2] ?? "";
      return { attrs, raw: m[0] };
    }
  }
  throw new Error(`no <${tag}> with class ${className}`);
}

const num = (e: { attrs: Record<string, string> }, name: string): number => Number(e.attrs[name]);

/** The inner markup of the first `<g class="...">` with this class token, found by counting nested groups. */
function groupInner(svg: string, className: string): string {
  const start = element(svg, "g", className).raw;
  const from = svg.indexOf(start) + start.length;
  let depth = 1;
  const token = /<g\b|<\/g>/g;
  token.lastIndex = from;
  for (let m = token.exec(svg); m !== null; m = token.exec(svg)) {
    depth += m[0] === "</g>" ? -1 : 1;
    if (depth === 0) return svg.slice(from, m.index);
  }
  throw new Error(`unclosed group ${className}`);
}

describe("ROOM_SVG: the stage", () => {
  it("is one SVG with the 600 x 1000 viewBox, and nothing but markup", () => {
    expect(typeof ROOM_SVG).toBe("string");
    expect(ROOM_SVG.startsWith("<svg")).toBe(true);
    expect(ROOM_SVG.trimEnd().endsWith("</svg>")).toBe(true);
    expect(ROOM_SVG).toContain('viewBox="0 0 600 1000"');
    expect(ROOM_SVG.match(/<svg\b/g)).toHaveLength(1);
  });

  it("shows no text (R11.4)", () => {
    expect(ROOM_SVG).not.toMatch(/<text\b|<tspan\b|<title\b|<desc\b/);
    expect(ROOM_SVG.replace(/<[^>]*>/g, "").trim()).toBe("");
  });

  it("uses no raster, image, canvas or external reference (R11.1)", () => {
    expect(ROOM_SVG).not.toMatch(/<img\b|<canvas\b|<image\b|<foreignObject\b|<video\b|<use\b/);
    const urls = [...ROOM_SVG.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u).toMatch(/^#cw-[a-z-]+$/);
    expect(ROOM_SVG).not.toMatch(/href=|\.png|\.jpg|\.svg|data:/);
  });

  it("prefixes every id with cw- and defines every id it references", () => {
    const ids = [...ROOM_SVG.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1] ?? "");
    for (const id of ids) expect(id).toMatch(/^cw-/);
    for (const u of ROOM_SVG.matchAll(/url\(#([^)]+)\)/g)) expect(ids).toContain(u[1]);
  });
});

describe("ROOM_SVG: layers (design 5.2)", () => {
  const order = ["wall", "night", "window", "dawn-wash", "candle", "lit", "zone"];

  it("has the seven layers in the documented order, with .zone last", () => {
    const at = order.map((name) => ROOM_SVG.indexOf(`class="${name}"`));
    for (const i of at) expect(i).toBeGreaterThan(-1);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // Nothing is painted after the zone's group closes.
    const zoneEnd = ROOM_SVG.indexOf("</g>", ROOM_SVG.indexOf('class="zone"'));
    expect(ROOM_SVG.slice(zoneEnd).replace(/<\/g>|<\/svg>|\s/g, "")).toBe("");
  });

  it("has no table, dish or floor element (F1, F2)", () => {
    expect(ROOM_SVG).not.toMatch(/class="[^"]*\b(table|dish|floor)\b/);
  });

  it(".wall and .night end at the floor line, y = 900", () => {
    for (const name of ["wall", "night"]) {
      const e = element(ROOM_SVG, "rect", name);
      expect(num(e, "y") + num(e, "height")).toBe(FLOOR_Y);
    }
    expect(FLOOR_Y).toBe(900);
  });

  it(".night uses the pool mask, and the mask also ends at the floor line", () => {
    expect(element(ROOM_SVG, "rect", "night").attrs["mask"]).toBe("url(#cw-pool-mask)");
    const mask = ROOM_SVG.match(/<mask id="cw-pool-mask"([^>]*)>/);
    expect(mask).not.toBeNull();
    const attrs = Object.fromEntries([...(mask?.[1] ?? "").matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
    expect(Number(attrs["y"]) + Number(attrs["height"])).toBe(FLOOR_Y);
    const all = element(ROOM_SVG, "rect", "mask-all");
    expect(num(all, "y") + num(all, "height")).toBe(FLOOR_Y);
  });
});

describe("ROOM_SVG: the lit group and the clip (F5)", () => {
  it(".lit carries the clip, and the clip covers the stage only above y = 900", () => {
    expect(element(ROOM_SVG, "g", "lit").attrs["clip-path"]).toBe("url(#cw-above-floor)");
    const clip = ROOM_SVG.match(/<clipPath id="cw-above-floor"><rect ([^>]*)\/><\/clipPath>/);
    expect(clip).not.toBeNull();
    const attrs = Object.fromEntries([...(clip?.[1] ?? "").matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1], Number(a[2])]));
    expect((attrs["y"] ?? 0) + (attrs["height"] ?? 0)).toBe(FLOOR_Y);
    expect(attrs["x"]).toBeLessThanOrEqual(-600);
    expect((attrs["x"] ?? 0) + (attrs["width"] ?? 0)).toBeGreaterThanOrEqual(1200);
  });

  it("the halo, the flame, the drips, the ember and the smoke are inside .lit", () => {
    const inner = groupInner(ROOM_SVG, "lit");
    for (const part of ["halo", "flame", "drip-1", "drip-2", "drip-3", "ember", "smoke-wisp", "wick", "rim"]) {
      expect(inner, part).toContain(part);
    }
  });

  it(".head, which moves down the candle, is inside .lit and not the other way round", () => {
    expect(groupInner(ROOM_SVG, "lit")).toContain('class="head"');
    expect(groupInner(ROOM_SVG, "head")).toContain('class="halo"');
    expect(element(ROOM_SVG, "g", "head").attrs["clip-path"]).toBeUndefined();
  });

  it("nothing but the zone is painted below the floor line", () => {
    const outside = ROOM_SVG.replace(groupInner(ROOM_SVG, "zone"), "");
    for (const m of outside.matchAll(/<rect\b[^>]*>/g)) {
      const y = /\by="([^"]+)"/.exec(m[0]);
      const h = /\bheight="([^"]+)"/.exec(m[0]);
      if (y && h) expect(Number(y[1]) + Number(h[1]), m[0]).toBeLessThanOrEqual(FLOOR_Y);
    }
  });
});

describe("ROOM_SVG: the window (F3)", () => {
  it("is only its two pane rects, with no frame, sill or curtain", () => {
    const inner = groupInner(ROOM_SVG, "window");
    expect(inner.match(/<rect\b/g)).toHaveLength(2);
    expect(inner.replace(/<rect\b[^>]*\/>/g, "").trim()).toBe("");
    expect(inner).toContain("window-rest");
    expect(inner).toContain("window-dawn");
  });

  it("the two panes cover the same area: portrait, x 240..360, y 50..260", () => {
    for (const name of ["window-rest", "window-dawn"]) {
      const e = element(ROOM_SVG, "rect", name);
      expect([num(e, "x"), num(e, "y"), num(e, "width"), num(e, "height")]).toEqual([240, 50, 120, 210]);
    }
    expect(WINDOW.height).toBeGreaterThan(WINDOW.width); // taller than wide
  });

  it("the window has soft edges (a blur filter on the group) and a constant vertical moonlight gradient", () => {
    expect(element(ROOM_SVG, "g", "window").attrs["filter"]).toBe("url(#cw-soft-edge)");
    expect(ROOM_SVG).toMatch(/<filter id="cw-soft-edge"[^>]*><feGaussianBlur stdDeviation="5"\/><\/filter>/);
    const grad = ROOM_SVG.match(/<linearGradient id="cw-window-grad" x1="0" y1="0" x2="0" y2="1">([\s\S]*?)<\/linearGradient>/);
    expect(grad?.[1]).toContain("st-window-moon");
    expect(grad?.[1]).toContain("st-window-night");
    expect(element(ROOM_SVG, "rect", "window-rest").attrs["fill"]).toBeUndefined(); // the colour comes from the stylesheet
  });

  it("the window stays well above the flame at a whole candle (flame tip y = 340)", () => {
    expect(WINDOW.y + WINDOW.height).toBeLessThan(340);
  });
});

describe("ROOM_SVG: the candle (F6)", () => {
  it(".body is the full candle height, standing on the floor line", () => {
    const body = element(ROOM_SVG, "rect", "body");
    expect(num(body, "height")).toBe(CANDLE_H);
    expect(num(body, "y") + num(body, "height")).toBe(FLOOR_Y);
    expect([num(body, "x"), num(body, "width")]).toEqual([268, 64]);
  });

  it(".stub is the fixed stub on the floor line", () => {
    const stub = element(ROOM_SVG, "rect", "stub");
    expect(num(stub, "height")).toBe(STUB_H);
    expect(num(stub, "y") + num(stub, "height")).toBe(FLOOR_Y);
    expect([num(stub, "x"), num(stub, "width")]).toEqual([268, 64]);
  });

  it("has three drips, hanging from the rim inside .head", () => {
    const head = groupInner(ROOM_SVG, "head");
    for (const n of [1, 2, 3]) expect(head).toContain(`drip-${n}`);
    expect(ROOM_SVG.match(/class="drip drip-\d"/g)).toHaveLength(3);
    for (const n of [1, 2, 3]) expect(groupInner(ROOM_SVG, `drip-${n}`).match(/<path\b/g)).toHaveLength(1);
  });

  it("the drips have different lengths, so each one reads on its own", () => {
    const lengths = DRIPS.map((d) => d.length);
    expect(new Set(lengths).size).toBe(3);
    expect(Math.min(...lengths)).toBeGreaterThanOrEqual(50); // long enough to read at 360 x 640 (scale 0.6)
    expect(Math.max(...lengths)).toBeLessThanOrEqual(120);
    // The longest drip, on the right, stays above the floor line even on a whole candle.
    expect(DRIP_TOP_Y + Math.max(...lengths)).toBeLessThan(FLOOR_Y);
  });

  it("the two side drips sit on the edges of the candle, their beads bulging out of its outline; the third runs down the front", () => {
    const [left, right, front] = DRIPS;
    expect(left.x - left.width / 2).toBeLessThan(268); // the bead leaves the body on the left
    expect(left.x).toBeGreaterThan(268); // while the runnel stays on the wax
    expect(right.x + right.width / 2).toBeGreaterThan(332);
    expect(right.x).toBeLessThan(332);
    expect(left.width).toBeGreaterThanOrEqual(18);
    expect(right.width).toBeGreaterThanOrEqual(18);
    expect(front.x - front.width / 2).toBeGreaterThan(268);
    expect(front.x + front.width / 2).toBeLessThan(332);
  });

  it("the window filter works in sRGB, so the dark gradient does not band", () => {
    expect(ROOM_SVG).toContain('color-interpolation-filters="sRGB"');
  });

  it("the rim and the wick sit at the top of a whole candle, y = 480", () => {
    expect(num(element(ROOM_SVG, "ellipse", "rim"), "cy")).toBe(480);
    const wick = element(ROOM_SVG, "rect", "wick");
    expect(num(wick, "y") + num(wick, "height")).toBe(480);
  });
});

describe("ROOM_SVG: the zone (F2, F5)", () => {
  it("is an opaque band from the floor line down, with a rest rect and a dawn rect", () => {
    const rest = element(ROOM_SVG, "rect", "zone-rest");
    const dawn = element(ROOM_SVG, "rect", "zone-dawn");
    for (const e of [rest, dawn]) {
      expect(num(e, "y")).toBe(FLOOR_Y);
      expect(num(e, "x")).toBeLessThanOrEqual(-600);
      expect(num(e, "x") + num(e, "width")).toBeGreaterThanOrEqual(1200);
      expect(num(e, "y") + num(e, "height")).toBeGreaterThanOrEqual(1000);
    }
  });

  it("has the invisible text-area marker at x 110..490, y 900..1000", () => {
    const area = element(ROOM_SVG, "rect", "zone-text-area");
    expect([num(area, "x"), num(area, "y"), num(area, "width"), num(area, "height")]).toEqual([110, 900, 380, 100]);
    expect(area.attrs["fill"]).toBe("none");
  });
});

describe("ROOM_SVG: the pool", () => {
  it("is a circle of radius 700 at the origin, moved and scaled by CSS only", () => {
    const pool = element(ROOM_SVG, "circle", "pool");
    expect([num(pool, "cx"), num(pool, "cy"), num(pool, "r")]).toEqual([0, 0, 700]);
    expect(pool.attrs["transform"]).toBeUndefined();
    expect(pool.attrs["opacity"]).toBeUndefined();
  });
});

describe("dripPath", () => {
  /** All coordinates of the path as (x, y) pairs, control points included. */
  function points(d: string): [number, number][] {
    const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const out: [number, number][] = [];
    for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i] ?? 0, n[i + 1] ?? 0]);
    return out;
  }

  it("hangs from the rim and ends in a bead at the drip's length", () => {
    for (const d of DRIPS) {
      const pts = points(dripPath(d.x, d.length, d.width));
      const ys = pts.map((p) => p[1]);
      expect(Math.min(...ys)).toBe(DRIP_TOP_Y);
      expect(Math.max(...ys)).toBeGreaterThanOrEqual(DRIP_TOP_Y + d.length);
      expect(Math.max(...ys)).toBeLessThanOrEqual(DRIP_TOP_Y + d.length + d.width * 0.2 + 0.01);
    }
  });

  it("is a closed, symmetric shape around its centre, as wide as its bead", () => {
    for (const d of DRIPS) {
      const pts = points(dripPath(d.x, d.length, d.width));
      const xs = pts.map((p) => p[0]);
      expect(Math.min(...xs)).toBeCloseTo(d.x - d.width / 2, 5);
      expect(Math.max(...xs)).toBeCloseTo(d.x + d.width / 2, 5);
      expect(dripPath(d.x, d.length, d.width).trim().endsWith("Z")).toBe(true);
    }
  });

  it("is narrower at the neck than at the bead", () => {
    const d = DRIPS[1];
    const pts = points(dripPath(d.x, d.length, d.width));
    const neck = pts[0]?.[0] ?? 0;
    expect(Math.abs(d.x - neck)).toBeLessThan(d.width / 2);
  });
});