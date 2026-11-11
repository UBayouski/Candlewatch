// ghosts-and-graveyard R1.1, R1.3, R9.1, R9.2, R9.6, R9.9, R9.10, R9.13, R9.16, R9.17 (design 3.9): which ghosts are drawn.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ghostSize } from "../engine";
import { GHOST_SLOTS } from "./slots";
import { PROP_PARAMS, arbGhostSpans } from "./test-kit";
import { visibleGhosts } from "./visible";

const G = GHOST_SLOTS.length;
const spansOf = (n: number): number[] => Array.from({ length: n }, (_, i) => (i + 1) * 10_000);

describe("visibleGhosts with G = 12", () => {
  it("draws nothing for 0 spans and shows no mark", () => {
    expect(visibleGhosts([], G)).toEqual({ drawn: [], hidden: 0 });
  });

  it("draws the one ghost of one span in slot 0, at the size of its span", () => {
    const { drawn, hidden } = visibleGhosts([60_000], G);
    expect(hidden).toBe(0);
    expect(drawn).toEqual([{ index: 0, slot: 0, size: ghostSize(60_000) }]);
  });

  it("draws all 12 for 12 spans, in slots 0 to 11, and shows no mark (R9.9)", () => {
    const { drawn, hidden } = visibleGhosts(spansOf(12), G);
    expect(hidden).toBe(0);
    expect(drawn.map((d) => d.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(drawn.map((d) => d.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("hides the oldest of 13 and gives the new ghost the freed slot 0 (R9.10, R9.11, R9.12)", () => {
    const { drawn, hidden } = visibleGhosts(spansOf(13), G);
    expect(hidden).toBe(1);
    expect(drawn.map((d) => d.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(drawn.find((d) => d.index === 12)?.slot).toBe(0);
    // No other ghost moved: indices 1 to 11 keep the slots they had with 12 spans.
    const before = visibleGhosts(spansOf(12), G).drawn;
    for (const d of drawn.filter((x) => x.index <= 11)) expect(d.slot).toBe(before.find((b) => b.index === d.index)?.slot);
  });

  it("hides the 9 oldest of 21 and draws the newest 12, oldest first, in 12 different slots", () => {
    const { drawn, hidden } = visibleGhosts(spansOf(21), G);
    expect(hidden).toBe(9);
    expect(drawn.map((d) => d.index)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(drawn.map((d) => d.slot)).toEqual([9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(drawn.map((d) => d.slot)).size).toBe(12);
  });

  it("gives each ghost the size of its own span (R9.2)", () => {
    const spans = [0, 150_000, 300_000, 900_000];
    expect(visibleGhosts(spans, G).drawn.map((d) => d.size)).toEqual(spans.map(ghostSize));
  });
});

describe("visibleGhosts with another G", () => {
  const spans = spansOf(5);

  it("draws nothing and hides the full count for G = 0", () => {
    expect(visibleGhosts(spans, 0)).toEqual({ drawn: [], hidden: 5 });
  });

  it("reads a negative G as 0", () => {
    expect(visibleGhosts(spans, -3)).toEqual({ drawn: [], hidden: 5 });
    expect(visibleGhosts(spans, Number.NEGATIVE_INFINITY)).toEqual({ drawn: [], hidden: 5 });
  });

  it("reads NaN as 0", () => {
    expect(visibleGhosts(spans, Number.NaN)).toEqual({ drawn: [], hidden: 5 });
  });

  it("floors a fractional G", () => {
    const { drawn, hidden } = visibleGhosts(spans, 2.9);
    expect(hidden).toBe(3);
    expect(drawn.map((d) => [d.index, d.slot])).toEqual([[3, 1], [4, 0]]);
    expect(visibleGhosts(spans, 0.9)).toEqual({ drawn: [], hidden: 5 });
  });

  it("uses G as the slot count: G = 3 cycles 0, 1, 2", () => {
    expect(visibleGhosts(spansOf(7), 3).drawn.map((d) => [d.index, d.slot])).toEqual([[4, 1], [5, 2], [6, 0]]);
  });
});

describe("visibleGhosts on odd spans", () => {
  it("keeps every size in [0.25, 1] for zero, negative, NaN and infinite spans (R9.2)", () => {
    const odd = [0, -5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e15];
    const { drawn } = visibleGhosts(odd, G);
    expect(drawn).toHaveLength(odd.length);
    for (const d of drawn) {
      expect(d.size).toBeGreaterThanOrEqual(0.25);
      expect(d.size).toBeLessThanOrEqual(1);
    }
    expect(drawn.map((d) => d.size)).toEqual([0.25, 0.25, 0.25, 1, 0.25, 1]);
  });

  it("does not change its input, and returns a fresh result each time", () => {
    const spans = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    const a = visibleGhosts(spans, G);
    const b = visibleGhosts(spans, G);
    expect(spans).toHaveLength(14);
    expect(a).toEqual(b);
    expect(a.drawn).not.toBe(b.drawn);
  });

  it("counts every span exactly once: drawn plus hidden is the number of spans, for any spans and G", () => {
    fc.assert(
      fc.property(arbGhostSpans, fc.integer({ min: -2, max: 15 }), (spans, g) => {
        const { drawn, hidden } = visibleGhosts(spans, g);
        expect(drawn.length + hidden).toBe(spans.length);
      }),
      PROP_PARAMS,
    );
  });
});
