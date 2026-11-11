// Property test P4: the flicker is deterministic, bounded, smooth, zero when there is no flame, and independent of the session
// (candle-scene design.md section 13). Runs PROP_PARAMS, which is 300 runs.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { INITIAL_STATE, MS_PER_MINUTE, step } from "../engine";
import { PROP_PARAMS, arbLength, arbT0 } from "../engine/test-kit";
import {
  DIP_DEPTH_MIN,
  DIP_DEPTH_SPAN,
  DIP_GLOW_FACTOR,
  DIP_WIDTH_MS,
  FLICKER_AMPLITUDE,
  FLICKER_STEP_MS,
  GUTTER_MS,
} from "./constants";
import { flicker } from "./flicker";
import { sceneModel } from "./model";
import { arbNow, arbSeed } from "./scene-kit";
import { RANGES } from "./types";
import type { FlameMode } from "./types";

const MIN = MS_PER_MINUTE;
const arbMode = fc.constantFrom<FlameMode>("unlit", "steady", "paused", "guttering", "smoke");
const arbBurning = fc.constantFrom<FlameMode>("steady", "paused", "guttering");
/** Finite moments only: realistic epoch milliseconds, small, negative and huge. */
const arbFiniteNow = arbNow.filter(Number.isFinite);

describe("P4: the flicker", () => {
  it("gives equal values for the same (seed, now, mode), always finite and inside the documented ranges", () => {
    fc.assert(
      fc.property(arbSeed, arbNow, arbMode, (seed, now, mode) => {
        const a = flicker(seed, now, mode);
        const b = flicker(seed, now, mode);
        expect(b).toEqual(a);
        for (const [value, [lo, hi]] of [
          [a.lean, RANGES.flickerLean],
          [a.height, RANGES.flickerHeight],
          [a.glow, RANGES.flickerGlow],
        ] as const) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(lo);
          expect(value).toBeLessThanOrEqual(hi);
        }
      }),
      PROP_PARAMS,
    );
  });

  it("is exactly 0 for unlit and smoke", () => {
    fc.assert(
      fc.property(arbSeed, arbNow, fc.constantFrom<FlameMode>("unlit", "smoke"), (seed, now, mode) => {
        const f = flicker(seed, now, mode);
        expect(Object.is(f.lean, 0)).toBe(true);
        expect(Object.is(f.height, 0)).toBe(true);
        expect(Object.is(f.glow, 0)).toBe(true);
      }),
      PROP_PARAMS,
    );
  });

  it("does not depend on the state: two different states of the same flame mode give the same flicker fields", () => {
    fc.assert(
      fc.property(
        arbT0,
        arbLength,
        arbLength,
        fc.constantFrom<"steady" | "guttering">("steady", "guttering"),
        fc.integer({ min: 1, max: GUTTER_MS }),
        fc.integer({ min: 0, max: 20 * MIN }),
        arbSeed,
        (t0, lenA, lenB, wanted, lastMs, earlier, seed) => {
          // Two candles with different lengths and intents that end at the same instant, so one `now` gives both the same mode.
          const [long, short] = lenA >= lenB ? [lenA, lenB] : [lenB, lenA];
          const end = t0 + long * MIN;
          const a = step(INITIAL_STATE, { type: "light", length: long, intent: "the first" }, t0);
          const b = step(INITIAL_STATE, { type: "light", length: short, intent: "another one" }, end - short * MIN);
          // steady: more than a minute left on both; guttering: a minute or less on both.
          const now = wanted === "guttering" ? end - lastMs : end - GUTTER_MS - 1 - Math.min(earlier, (short - 2) * MIN);
          const ma = sceneModel(a, now, { seed });
          const mb = sceneModel(b, now, { seed });
          expect(ma.flameMode).toBe(wanted);
          expect(mb.flameMode).toBe(wanted);
          expect([mb.flickerLean, mb.flickerHeight, mb.flickerGlow]).toEqual([ma.flickerLean, ma.flickerHeight, ma.flickerGlow]);
          // And a paused state with a different history flickers the same as any other paused state.
          const pa = step(a, { type: "pause" }, t0 + MIN);
          const pb = step(b, { type: "pause" }, b.phase === "lit" ? b.session.startedAt + 1000 : t0);
          if (pa.phase === "paused" && pb.phase === "paused") {
            const x = sceneModel(pa, now, { seed });
            const y = sceneModel(pb, now, { seed });
            expect([y.flickerLean, y.flickerHeight, y.flickerGlow]).toEqual([x.flickerLean, x.flickerHeight, x.flickerGlow]);
          }
        },
      ),
      PROP_PARAMS,
    );
  });

  it("is smooth: two instants a few ms apart differ by at most the Lipschitz bound of the noise and the dip", () => {
    const dipSlope = ((DIP_DEPTH_MIN + DIP_DEPTH_SPAN) * Math.PI) / DIP_WIDTH_MS; // per ms, the steepest the sputter can be
    fc.assert(
      fc.property(arbSeed, arbFiniteNow, arbBurning, fc.integer({ min: 1, max: 5 }), (seed, now, mode, d) => {
        const a = flicker(seed, now, mode);
        const b = flicker(seed, now + d, mode);
        const amp = FLICKER_AMPLITUDE[mode];
        const eps = 1e-9;
        expect(Math.abs(b.lean - a.lean)).toBeLessThanOrEqual((3 * amp.lean * d) / FLICKER_STEP_MS.lean + eps);
        const dip = amp.sputter ? dipSlope * d : 0;
        expect(Math.abs(b.height - a.height)).toBeLessThanOrEqual((3 * amp.height * d) / FLICKER_STEP_MS.height + dip + eps);
        expect(Math.abs(b.glow - a.glow)).toBeLessThanOrEqual(
          (3 * amp.glow * d) / FLICKER_STEP_MS.glow + (amp.sputter ? DIP_GLOW_FACTOR * dipSlope * d : 0) + eps,
        );
      }),
      PROP_PARAMS,
    );
  });

  it("different seeds give different flicker at most instants, on a fixed grid of 200", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        arbBurning,
        (seed, delta, mode) => {
          const other = seed + delta;
          let differing = 0;
          for (let i = 0; i < 200; i++) {
            const now = 1_788_000_000_000 + i * 53;
            const a = flicker(seed, now, mode);
            const b = flicker(other, now, mode);
            if (a.lean !== b.lean || a.height !== b.height || a.glow !== b.glow) differing++;
          }
          expect(differing).toBeGreaterThanOrEqual(180);
        },
      ),
      PROP_PARAMS,
    );
  });
});
