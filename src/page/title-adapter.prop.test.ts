// Property test of the title adapter (sound-and-title task 8.2, design 3.8). Property 13.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { step, timeLeftMs } from "../engine";
import type { Event } from "../engine";
import { STRINGS } from "../strings";
import { PROP_PARAMS, arbLitState, arbNonDecreasingTimes } from "./test-kit";
import { titleFor } from "./title";
import { createTitleAdapter } from "./title-adapter";
import type { TitleTarget } from "./title-adapter";

/** A document stand-in that records every write. */
function recordingDoc(initial: string): { doc: TitleTarget; writes: string[] } {
  let value = initial;
  const writes: string[] = [];
  return {
    doc: {
      get title() {
        return value;
      },
      set title(v: string) {
        writes.push(v);
        value = v;
      },
    },
    writes,
  };
}

/** Titles from a small set, so a sequence repeats itself often. */
const arbTitle = fc.constantFrom(STRINGS.title, "25:00 · Candlewatch", "24:59 · Candlewatch", "24:59 paused · Candlewatch", "Dark · Candlewatch", "");

describe("Feature: sound-and-title, Property 13: The title adapter writes only changes", () => {
  it("writes exactly at each change from the last known title, plus once when the first differs from the page's", () => {
    fc.assert(
      fc.property(arbTitle, fc.array(arbTitle, { maxLength: 40 }), (start, titles) => {
        const d = recordingDoc(start);
        const adapter = createTitleAdapter(d.doc);
        const expected: string[] = [];
        let prev = start;
        for (const t of titles) {
          adapter.write(t);
          if (t !== prev) expected.push(t);
          prev = t;
          expect(adapter.last()).toBe(t);
        }
        expect(d.writes).toEqual(expected);
      }),
      PROP_PARAMS,
    );
  });

  it("titles of a lit session over monotone times write at most once per whole second of time left, plus the phase change", () => {
    let wrote = 0;
    const ends = fc.constantFrom<Event | null>(null, { type: "pause" }, { type: "snuff" }, { type: "tick" });
    fc.assert(
      fc.property(
        arbLitState.chain(({ state, at }) => fc.record({ state: fc.constant(state), times: arbNonDecreasingTimes(at), end: ends })),
        ({ state, times, end }) => {
          const d = recordingDoc(STRINGS.title);
          const adapter = createTitleAdapter(d.doc);
          for (const t of times) adapter.write(titleFor(state, t));
          const first = times[0] ?? 0;
          const last = times[times.length - 1] ?? 0;
          const secondsCrossed = Math.ceil(timeLeftMs(state, first) / 1000) - Math.ceil(timeLeftMs(state, last) / 1000);
          let phaseChanges = 0;
          if (end !== null) {
            const next = step(state, end, last);
            if (next.phase !== state.phase) phaseChanges++;
            adapter.write(titleFor(next, last));
          }
          // The first write differs from the page's "Candlewatch" (a lit title carries a time): that is the "+ 1".
          expect(d.writes.length).toBeLessThanOrEqual(1 + secondsCrossed + phaseChanges);
          if (d.writes.length > 1) wrote++;
        },
      ),
      PROP_PARAMS,
    );
    expect(wrote).toBeGreaterThanOrEqual(100);
  });
});
