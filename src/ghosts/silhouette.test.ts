import { describe, expect, it } from "vitest";
import { silhouettePath } from "./silhouette";
import { GHOST_BOX } from "./slots";

describe("silhouettePath", () => {
  const d = silhouettePath();
  const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

  it("is one closed subpath", () => {
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/M/g)?.length).toBe(1);
  });

  it("uses finite numbers that come in x, y pairs", () => {
    expect(numbers.length).toBeGreaterThan(0);
    expect(numbers.length % 2).toBe(0);
    expect(numbers.every(Number.isFinite)).toBe(true);
  });

  it("fits the 70 by 75 box centred on the origin", () => {
    for (let i = 0; i < numbers.length; i += 2) {
      expect(Math.abs(numbers[i] ?? Number.NaN)).toBeLessThanOrEqual(GHOST_BOX.w / 2);
      expect(Math.abs(numbers[i + 1] ?? Number.NaN)).toBeLessThanOrEqual(GHOST_BOX.h / 2);
    }
  });

  it("touches the box on all four sides", () => {
    const xs = numbers.filter((_, i) => i % 2 === 0);
    const ys = numbers.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBe(-35);
    expect(Math.max(...xs)).toBe(35);
    expect(Math.min(...ys)).toBe(-37.5);
    expect(Math.max(...ys)).toBe(37.5);
  });
});
