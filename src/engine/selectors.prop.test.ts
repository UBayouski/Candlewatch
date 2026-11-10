// Property tests for the selectors: P5 and P11 (design.md section 8.2).
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BREAK_MS, MS_PER_MINUTE, PAUSE_LIMIT_MS } from "./constants";
import { isBreak, waxFraction } from "./selectors";
import { step } from "./step";
import { PROP_PARAMS, arbLength, arbScript, arbSignedScript, arbT0, runScript } from "./test-kit";
import { INITIAL_STATE } from "./types";
import type { State } from "./types";

const HOUR = 3_600_000;

function anchorOf(s: State): number | null {
  if (s.phase === "lit") return s.litSince;
  if (s.phase === "paused") return s.pausedAt;
  return null;
}

describe("P5: wax fraction bounds and anchor clamp", () => {
  // Half the probes sit at or before the anchor, where the clamp matters; the rest run to 4 hours after it.
  const arbProbes = fc.array(
    fc.oneof(
      fc.integer({ min: -120_000, max: 0 }),
      fc.integer({ min: -1, max: 1 }),
      fc.integer({ min: 0, max: 4 * HOUR }),
    ),
    { minLength: 2, maxLength: 6 },
  );

  it("is in [0, 1]; equals the anchor value at or before the anchor; never exceeds it after", () => {
    fc.assert(
      fc.property(arbT0, arbSignedScript, arbProbes, (t0, script, offsets) => {
        for (const { after, now } of runScript(script, t0)) {
          // The fraction is in [0, 1] at the step's own time, whatever the clock did.
          const own = waxFraction(after, now);
          expect(own).toBeGreaterThanOrEqual(0);
          expect(own).toBeLessThanOrEqual(1);

          const anchor = anchorOf(after);
          if (anchor === null) continue;
          const atAnchor = waxFraction(after, anchor);
          for (const offset of offsets) {
            const probe = anchor + offset;
            const f = waxFraction(after, probe);
            expect(f).toBeGreaterThanOrEqual(0);
            expect(f).toBeLessThanOrEqual(1);
            if (probe <= anchor) expect(f).toBe(atAnchor);
            else expect(f).toBeLessThanOrEqual(atAnchor);
          }
        }
      }),
      PROP_PARAMS,
    );
  });
});

describe("P11: the break selector", () => {
  const arbProbes = fc.array(fc.integer({ min: -HOUR, max: HOUR }), { minLength: 1, maxLength: 6 });

  it("is true exactly when the phase is burned-out and now < breakEndsAt, for any run", () => {
    fc.assert(
      fc.property(arbT0, arbScript, arbProbes, (t0, script, offsets) => {
        for (const { after } of runScript(script, t0)) {
          expect("breakEndsAt" in after).toBe(after.phase === "burned-out");
          const probes =
            after.phase === "burned-out"
              ? [
                  after.endedAt - 1,
                  after.endedAt,
                  after.breakEndsAt - 1,
                  after.breakEndsAt,
                  after.breakEndsAt + 1,
                  ...offsets.map((o) => after.endedAt + o),
                ]
              : offsets.map((o) => t0 + o);
          for (const p of probes) {
            const expected = after.phase === "burned-out" && p < after.breakEndsAt;
            expect(isBreak(after, p)).toBe(expected);
          }
        }
      }),
      PROP_PARAMS,
    );
  });

  // The independent reference: the end time comes from the script's own arithmetic t0 + L + P.
  const arbPauses = fc.array(
    fc.record({ burn: fc.integer({ min: 1, max: 29_999 }), pause: fc.integer({ min: 0, max: 60_000 }) }),
    { maxLength: 10 },
  );

  it("the break window is [end, end + 5 min) where end = t0 + length + total pause, even when noticed late", () => {
    fc.assert(
      fc.property(arbT0, arbLength, arbPauses, fc.integer({ min: 0, max: 2 * HOUR }), (t0, len, pauses, late) => {
        let t = t0;
        let s = step(INITIAL_STATE, { type: "light", length: len }, t);
        let total = 0;
        for (const { burn, pause } of pauses) {
          t += burn;
          s = step(s, { type: "pause" }, t);
          t += pause;
          s = step(s, { type: "resume" }, t);
          total += pause;
        }
        expect(total).toBeLessThanOrEqual(PAUSE_LIMIT_MS);
        const end = t0 + len * MS_PER_MINUTE + total;
        const noticedAt = end + late;
        const out = step(s, { type: "tick" }, noticedAt);
        expect(out.phase).toBe("burned-out");
        if (out.phase !== "burned-out") return;
        expect(out.breakEndsAt).toBe(end + BREAK_MS);
        expect(isBreak(out, end)).toBe(true);
        expect(isBreak(out, end + BREAK_MS - 1)).toBe(true);
        expect(isBreak(out, end + BREAK_MS)).toBe(false);
        expect(isBreak(out, end - 1)).toBe(true); // R7.2 has no lower bound: phase burned-out and now < breakEndsAt
      }),
      PROP_PARAMS,
    );
  });
});
