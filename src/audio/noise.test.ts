// sound-and-title R3.4, R3.5 (design 3.2, D2): seeded noise.
import { describe, expect, it } from "vitest";
import { noiseSamples } from "./noise";

describe("noiseSamples", () => {
  it("gives equal arrays for equal inputs", () => {
    expect(noiseSamples(0x5ca7c4, 500)).toEqual(noiseSamples(0x5ca7c4, 500));
  });

  it("keeps a prefix stable: the first n of a longer array are the n-sample array", () => {
    const long = noiseSamples(0xb2ea71, 2000);
    expect(long.slice(0, 300)).toEqual(noiseSamples(0xb2ea71, 300));
    expect(long).toHaveLength(2000);
  });

  it("stays in [-1, 1) and is not constant", () => {
    const s = noiseSamples(0x0d15ea, 10000);
    for (const v of s) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThan(1);
    }
    expect(new Set(s).size).toBeGreaterThan(9000);
    expect(Math.min(...s)).toBeLessThan(-0.9);
    expect(Math.max(...s)).toBeGreaterThan(0.9);
  });

  it("floors the count and gives an empty array for bad counts", () => {
    expect(noiseSamples(1, 10.9)).toHaveLength(10);
    expect(noiseSamples(1, 10.9)).toEqual(noiseSamples(1, 10));
    for (const bad of [-1, -0.5, 0, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(noiseSamples(1, bad), String(bad)).toEqual([]);
    }
  });

  it("gives different streams for different seeds, and reads the seed as an unsigned 32-bit integer", () => {
    expect(noiseSamples(1, 50)).not.toEqual(noiseSamples(2, 50));
    expect(noiseSamples(-1, 50)).toEqual(noiseSamples(0xffffffff, 50));
    expect(noiseSamples(2 ** 32 + 7, 50)).toEqual(noiseSamples(7, 50));
  });
});
