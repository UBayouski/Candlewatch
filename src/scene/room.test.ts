import { describe, expect, it } from "vitest";
import { CANDLE_H, FLOOR_Y, STUB_H } from "./constants";
import { ROOM_SVG } from "./room";

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

  it("the two panes cover the same area, x 190..410, y 70..250", () => {
    for (const name of ["window-rest", "window-dawn"]) {
      const e = element(ROOM_SVG, "rect", name);
      expect([num(e, "x"), num(e, "y"), num(e, "width"), num(e, "height")]).toEqual([190, 70, 220, 180]);
    }
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
