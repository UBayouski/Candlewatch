// sound-and-title R2 (design 3.1, D5, D29): which Cue a Transition plays.
import { describe, expect, it } from "vitest";
import { LATE_CUE_LIMIT_MS, cueFor } from "./cue";
import { PHASES, endOf, stateOf } from "./test-kit";
import type { Phase } from "./test-kit";
import type { Cue } from "./types";

const T0 = 1_800_000_000_000;
const MIN = 60_000;
const on = (now: number) => ({ eventType: "tick" as const, sound: true, now });

/** The table of design 3.1: rows are the previous phase, columns the next one. */
const TABLE: Readonly<Record<Phase, Readonly<Record<Phase, Cue | null>>>> = {
  idle: { idle: null, lit: "strike", paused: null, "burned-out": null, snuffed: null },
  lit: { idle: null, lit: null, paused: null, "burned-out": "chime", snuffed: "breath" },
  paused: { idle: null, lit: null, paused: null, "burned-out": "chime", snuffed: "breath" },
  "burned-out": { idle: null, lit: "strike", paused: null, "burned-out": null, snuffed: null },
  snuffed: { idle: null, lit: "strike", paused: null, "burned-out": null, snuffed: null },
};

describe("cueFor: the 25 ordered phase pairs (sound on, a live event, now equal to endedAt)", () => {
  for (const p of PHASES) {
    for (const n of PHASES) {
      it(`${p} to ${n} gives ${String(TABLE[p][n])}`, () => {
        const next = stateOf(n, T0);
        expect(cueFor(stateOf(p, T0), next, on(endOf(next, T0)))).toBe(TABLE[p][n]);
      });
    }
  }
});

describe("the Late_Cue_Limit (R2.11, D5)", () => {
  it("is 120000 ms", () => {
    expect(LATE_CUE_LIMIT_MS).toBe(120000);
  });

  for (const [phase, cue] of [["burned-out", "chime"], ["snuffed", "breath"]] as const) {
    it(`plays the ${cue} at 119999 and 120000 ms late and not at 120001`, () => {
      const next = stateOf(phase, T0);
      const end = endOf(next, T0);
      const lit = stateOf("lit", T0);
      expect(cueFor(lit, next, on(end + 119999))).toBe(cue);
      expect(cueFor(lit, next, on(end + 120000))).toBe(cue);
      expect(cueFor(lit, next, on(end + 120001))).toBeNull();
    });

    it(`plays the ${cue} when now is 1 ms and 200000 ms before endedAt (a negative lateness, not clamped and not made absolute, D29)`, () => {
      const next = stateOf(phase, T0);
      expect(cueFor(stateOf("paused", T0), next, on(endOf(next, T0) - 1))).toBe(cue);
      expect(cueFor(stateOf("paused", T0), next, on(endOf(next, T0) - 200000))).toBe(cue);
    });

    it(`gives no ${cue} and does not throw for a NaN or infinite now`, () => {
      const next = stateOf(phase, T0);
      for (const now of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expect(() => cueFor(stateOf("lit", T0), next, on(now))).not.toThrow();
        expect(cueFor(stateOf("lit", T0), next, on(now))).toBeNull();
      }
    });
  }

  it("never applies to strike: lighting 10 minutes after the previous idle state still strikes (R2.12)", () => {
    expect(cueFor(stateOf("idle", T0), stateOf("lit", T0 + 10 * MIN), on(T0 + 10 * MIN))).toBe("strike");
    expect(cueFor(stateOf("snuffed", T0), stateOf("lit", T0 + 10 * 3_600_000), on(T0 + 10 * 3_600_000))).toBe("strike");
  });
});

describe("no Cue", () => {
  it("from a reload, whatever the phases", () => {
    for (const p of PHASES) for (const n of PHASES) {
      const next = stateOf(n, T0);
      expect(cueFor(stateOf(p, T0), next, { eventType: "reload", sound: true, now: endOf(next, T0) })).toBeNull();
    }
  });

  it("with sound off, whatever the phases and the event", () => {
    for (const p of PHASES) for (const n of PHASES) {
      const next = stateOf(n, T0);
      expect(cueFor(stateOf(p, T0), next, { eventType: "light", sound: false, now: endOf(next, T0) })).toBeNull();
    }
  });

  it("from the break: burned-out to burned-out, at the dawn and after the break ended", () => {
    const bo = stateOf("burned-out", T0);
    const end = endOf(bo, T0);
    expect(cueFor(bo, bo, on(end))).toBeNull();
    expect(cueFor(bo, bo, on(end + 6 * MIN))).toBeNull();
  });
});
