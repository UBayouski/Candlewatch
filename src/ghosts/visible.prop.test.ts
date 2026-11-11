// Property tests for the ghost selection (ghosts-and-graveyard design 8.4). Properties 19 and 20.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ghostSize } from "../engine";
import { PROP_PARAMS, arbGhostSpans } from "./test-kit";
import { visibleGhosts } from "./visible";

/** Any G: whole numbers around the real value 12, fractions, negatives, `NaN` and the infinities. */
const arbG: fc.Arbitrary<number> = fc.oneof(
  { weight: 6, arbitrary: fc.integer({ min: -3, max: 20 }) },
  { weight: 2, arbitrary: fc.double({ min: -3, max: 20, noNaN: true }) },
  { weight: 1, arbitrary: fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY) },
);

/** G as the module must read it: `max(0, floor(G))`, `NaN` as 0 (design section 7). */
const slotsOf = (g: number): number => (Number.isNaN(g) ? 0 : Math.max(0, Math.floor(g)));

describe("Feature: ghosts-and-graveyard, Property 19: Visible ghosts are the newest, with the right size", () => {
  it("draws the newest min(length, G) ghosts, oldest first, each at the size of its span, and hides the rest", () => {
    fc.assert(
      fc.property(arbGhostSpans, arbG, (spans, g) => {
        const { drawn, hidden } = visibleGhosts(spans, g);
        const slots = slotsOf(g);
        const n = spans.length;

        expect(drawn.length + hidden).toBe(n);
        expect(drawn.length).toBeLessThanOrEqual(slots);
        expect(drawn.length).toBe(Math.min(n, slots));

        // The newest ones: the last `drawn.length` indices, in order (a range written out, not the module's own arithmetic).
        const expected: number[] = [];
        for (let i = n - drawn.length; i < n; i++) expected.push(i);
        expect(drawn.map((d) => d.index)).toEqual(expected);
        expect(hidden).toBe(n - drawn.length);

        for (const d of drawn) {
          expect(d.size).toBe(ghostSize(spans[d.index] as number));
          expect(d.size).toBeGreaterThanOrEqual(0.25);
          expect(d.size).toBeLessThanOrEqual(1);
        }

        if (n <= slots) expect(hidden).toBe(0);
      }),
      PROP_PARAMS,
    );
  });

  it("never changes its input", () => {
    fc.assert(
      fc.property(arbGhostSpans, arbG, (spans, g) => {
        const copy = [...spans];
        visibleGhosts(spans, g);
        expect(spans).toEqual(copy);
      }),
      PROP_PARAMS,
    );
  });
});

describe("Feature: ghosts-and-graveyard, Property 20: Ghost slots are unique and stable", () => {
  /** A real G: at least 1, up to a little more than the 12 slots. */
  const arbSlotCount = fc.integer({ min: 1, max: 15 });
  /**
   * Spans and a G for them. Often G is made equal to the number of spans, one less or one more, so that "exactly G drawn", "one past G" and
   * "one below G" are met often and not by luck.
   */
  const arbSpansAndG: fc.Arbitrary<[number[], number]> = arbGhostSpans.chain((spans) =>
    fc.tuple(
      fc.constant(spans),
      fc.oneof({ weight: 4, arbitrary: arbSlotCount }, { weight: 1, arbitrary: fc.constant(Math.max(1, spans.length)) }, { weight: 1, arbitrary: fc.constant(Math.max(1, spans.length - 1)) }, { weight: 1, arbitrary: fc.constant(spans.length + 1) }),
    ),
  );

  it("gives the drawn ghosts different slots, all below G", () => {
    fc.assert(
      fc.property(arbSpansAndG, ([spans, g]) => {
        const { drawn } = visibleGhosts(spans, g);
        const slots = drawn.map((d) => d.slot);
        expect(new Set(slots).size).toBe(slots.length);
        for (const slot of slots) {
          expect(Number.isInteger(slot)).toBe(true);
          expect(slot).toBeGreaterThanOrEqual(0);
          expect(slot).toBeLessThan(g);
        }
      }),
      PROP_PARAMS,
    );
  });

  it("keeps the slot of every ghost still drawn when a span is added, and gives the new ghost the slot that was freed, or the next free one", () => {
    fc.assert(
      fc.property(arbSpansAndG, fc.integer({ min: 0, max: 3_600_000 }), ([spans, g], added) => {
        const before = visibleGhosts(spans, g);
        const after = visibleGhosts([...spans, added], g);
        const slotBefore = new Map(before.drawn.map((d) => [d.index, d.slot]));

        // Every ghost drawn before and still drawn keeps its slot, and its size.
        const stayed = after.drawn.filter((d) => slotBefore.has(d.index));
        for (const d of stayed) expect(d.slot, `ghost ${d.index}`).toBe(slotBefore.get(d.index));

        // The new ghost is the newest and last, and nothing else is new.
        const newcomer = after.drawn[after.drawn.length - 1];
        expect(newcomer?.index).toBe(spans.length);
        expect(after.drawn.filter((d) => !slotBefore.has(d.index))).toHaveLength(1);

        if (before.drawn.length < g) {
          // Fewer than G drawn: nobody leaves, and the new ghost takes the lowest slot nobody uses.
          expect(stayed).toHaveLength(before.drawn.length);
          const used = new Set(before.drawn.map((d) => d.slot));
          let nextFree = 0;
          while (used.has(nextFree)) nextFree++;
          expect(newcomer?.slot).toBe(nextFree);
          expect(after.hidden).toBe(0);
        } else {
          // G drawn: exactly the oldest one leaves, and the new ghost takes its slot.
          const oldest = before.drawn[0];
          expect(stayed).toHaveLength(before.drawn.length - 1);
          expect(after.drawn.some((d) => d.index === oldest?.index)).toBe(false);
          expect(newcomer?.slot).toBe(oldest?.slot);
          expect(after.hidden).toBe(before.hidden + 1);
        }
      }),
      PROP_PARAMS,
    );
  });

  it("is exercised both below G and past G, and on the very edge", () => {
    let below = 0;
    let edge = 0;
    let past = 0;
    fc.assert(
      fc.property(arbSpansAndG, ([spans, g]) => {
        if (spans.length < g) below++;
        else if (spans.length === g) edge++;
        else past++;
      }),
      PROP_PARAMS,
    );
    expect(below).toBeGreaterThan(20);
    expect(edge).toBeGreaterThan(20);
    expect(past).toBeGreaterThan(20);
  });
});
