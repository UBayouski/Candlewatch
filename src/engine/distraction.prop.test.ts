// Property tests for distraction tracking: D1, D2, D3, D4, D5, D7 (distraction-tracking design.md section 10.4).
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MS_PER_MINUTE, PAUSE_LIMIT_MS } from "./constants";
import { restoreState, serializeHistory, serializeSession } from "./serialize";
import { isBreak, timeLeftMs, waxFraction } from "./selectors";
import { step } from "./step";
import {
  PROP_PARAMS,
  arbLength,
  arbSignedVisibilityScript,
  arbT0,
  arbVisibilityScript,
  assertInvariants,
  assertMatchesReference,
  referenceTrace,
  runScript,
} from "./test-kit";
import type { ScriptStep, TraceEntry } from "./test-kit";
import { INITIAL_STATE } from "./types";
import type { Event, HistoryEntry, State } from "./types";

const MIN = MS_PER_MINUTE;
const HOUR = 3_600_000;
const TICK: Event = { type: "tick" };

function at<T>(items: readonly T[], i: number): T {
  const item = items[i];
  if (item === undefined) throw new Error(`index ${i} out of range`);
  return item;
}

function roundTrip(s: State): State {
  return restoreState(serializeSession(s), serializeHistory(s.history));
}

/** Every field a timer reads or writes, and nothing about distractions. */
function timerFields(s: State): unknown {
  if (s.phase === "idle") return { phase: s.phase };
  const base = {
    phase: s.phase,
    startedAt: s.session.startedAt,
    lengthMin: s.session.lengthMin,
    intent: s.session.intent,
    pausedTotalMs: s.session.pausedTotalMs,
  };
  switch (s.phase) {
    case "lit":
      return { ...base, litSince: s.litSince };
    case "paused":
      return { ...base, pausedAt: s.pausedAt };
    case "burned-out":
      return { ...base, endedAt: s.endedAt, breakEndsAt: s.breakEndsAt };
    case "snuffed":
      return { ...base, endedAt: s.endedAt };
  }
}

const withoutDistractions = (history: readonly HistoryEntry[]): unknown[] =>
  history.map((e) => ({
    startedAt: e.startedAt,
    endedAt: e.endedAt,
    lengthMin: e.lengthMin,
    intent: e.intent,
    outcome: e.outcome,
  }));

describe("D1: distractions never change the timer", () => {
  it("a run equals the same run with every hide and show replaced by a tick, apart from the distraction fields", () => {
    fc.assert(
      fc.property(arbT0, arbVisibilityScript, (t0, script) => {
        const asTicks: ScriptStep[] = script.map((s) =>
          s.kind === "hide" || s.kind === "show" ? { ...s, kind: "tick" } : s,
        );
        const withVisibility = runScript(script, t0);
        const withTicks = runScript(asTicks, t0);
        withVisibility.forEach((a, i) => {
          const b = at(withTicks, i);
          expect(a.now).toBe(b.now);
          expect(timerFields(a.after)).toStrictEqual(timerFields(b.after));
          expect(timeLeftMs(a.after, a.now)).toBe(timeLeftMs(b.after, b.now));
          expect(waxFraction(a.after, a.now)).toBe(waxFraction(b.after, b.now));
          expect(isBreak(a.after, a.now)).toBe(isBreak(b.after, b.now));
          expect(withoutDistractions(a.after.history)).toStrictEqual(withoutDistractions(b.after.history));
        });
      }),
      PROP_PARAMS,
    );
  });
});

describe("D2: the count equals the completed hide-show pairs while lit", () => {
  it("the engine agrees with the independent reference interpreter at every step", () => {
    fc.assert(
      fc.property(arbT0, arbVisibilityScript, (t0, script) => {
        assertMatchesReference(runScript(script, t0), referenceTrace(script, t0));
      }),
      PROP_PARAMS,
    );
  });
});

describe("D3: time away is the sum of the spans and never negative", () => {
  it("spans are non-negative integers whose number and sum match the count and total, even with a backward clock", () => {
    fc.assert(
      fc.property(arbT0, arbVisibilityScript, arbSignedVisibilityScript, (t0, increasing, signed) => {
        for (const { after } of [...runScript(increasing, t0), ...runScript(signed, t0)]) {
          assertInvariants(after);
          if (after.phase === "idle") continue;
          const spans = after.session.awaySpansMs;
          expect(spans.every((x) => Number.isSafeInteger(x) && x >= 0)).toBe(true);
          expect(spans.length).toBe(after.session.distractions);
          expect(spans.reduce((a, b) => a + b, 0)).toBe(after.session.timeAwayMs);
        }
      }),
      PROP_PARAMS,
    );
  });

  it("when now does not decrease, a final session's time away fits inside its wall-clock duration and length", () => {
    fc.assert(
      fc.property(arbT0, arbVisibilityScript, (t0, script) => {
        for (const { after } of runScript(script, t0)) {
          if (after.phase !== "burned-out" && after.phase !== "snuffed") continue;
          expect(after.session.timeAwayMs).toBeLessThanOrEqual(after.endedAt - after.session.startedAt);
          if (after.phase === "burned-out") {
            expect(after.session.timeAwayMs).toBeLessThanOrEqual(after.session.lengthMin * MIN);
          }
        }
      }),
      PROP_PARAMS,
    );
  });
});

describe("D4: distractions are dated to the true instant", () => {
  const NOTICERS = ["tick", "show", "hide", "resume", "light", "reload", "snuff", "pause"] as const;

  /** A candle lit at t0 with a hide opened at t0 + h. */
  const arbHidden = arbLength.chain((len) => {
    const L = len * MIN;
    return fc.record({
      len: fc.constant(len),
      h: fc.integer({ min: 0, max: L - 1 }),
      late: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 3 * HOUR })),
      noticer: fc.constantFrom(...NOTICERS),
      xFrac: fc.double({ min: 0, max: 1, noNaN: true }),
      afterShow: fc.integer({ min: 0, max: HOUR }),
    });
  });

  function eventFor(noticer: (typeof NOTICERS)[number], state: State): Event {
    switch (noticer) {
      case "light":
        return { type: "light", length: 25 };
      case "reload":
        return { type: "reload", state: roundTrip(state) };
      default:
        return { type: noticer };
    }
  }

  it("completion: one more distraction of exactly C - h, whatever event notices it and however late", () => {
    fc.assert(
      fc.property(arbT0, arbHidden, (t0, c) => {
        const L = c.len * MIN;
        const completion = t0 + L;
        let s = step(INITIAL_STATE, { type: "light", length: c.len }, t0);
        s = step(s, { type: "hide" }, t0 + c.h);
        const out = step(s, eventFor(c.noticer, s), completion + c.late);
        assertInvariants(out);
        expect(out.history).toHaveLength(1);
        expect(out.history[0]).toMatchObject({
          outcome: "burned-out",
          endedAt: completion,
          distractions: 1,
          timeAwayMs: completion - (t0 + c.h),
        });
        // A show after the end leaves the entry (and a burned-out state) unchanged. (After a `light`
        // the new session may itself end meanwhile and add its own entry, so only the first is compared.)
        const later = step(out, { type: "show" }, completion + c.late + c.afterShow);
        expect(later.history.slice(0, out.history.length)).toStrictEqual(out.history);
        if (out.phase === "burned-out") expect(later).toBe(out);
      }),
      PROP_PARAMS,
    );
  });

  it("snuff: the span runs up to the snuff instant", () => {
    fc.assert(
      fc.property(arbT0, arbHidden, (t0, c) => {
        const L = c.len * MIN;
        const x = c.h + Math.floor(c.xFrac * (L - 1 - c.h)); // h <= x <= L - 1
        let s = step(INITIAL_STATE, { type: "light", length: c.len }, t0);
        s = step(s, { type: "hide" }, t0 + c.h);
        const out = step(s, { type: "snuff" }, t0 + x);
        expect(out.phase).toBe("snuffed");
        expect(out.history).toHaveLength(1);
        expect(out.history[0]).toMatchObject({
          outcome: "snuffed",
          endedAt: t0 + x,
          distractions: 1,
          timeAwayMs: x - c.h,
        });
      }),
      PROP_PARAMS,
    );
  });

  it("pause: the span runs up to the pause instant, and a later pause-limit snuff adds nothing", () => {
    fc.assert(
      fc.property(arbT0, arbHidden, (t0, c) => {
        const L = c.len * MIN;
        const x = c.h + Math.floor(c.xFrac * (L - 1 - c.h));
        let s = step(INITIAL_STATE, { type: "light", length: c.len }, t0);
        s = step(s, { type: "hide" }, t0 + c.h);
        s = step(s, { type: "pause" }, t0 + x);
        expect(s.phase).toBe("paused");
        expect(s.phase === "paused" && s.pausedAt).toBe(t0 + x);
        expect(s.phase === "paused" ? s.session.awaySpansMs : []).toEqual([x - c.h]);
        const out = step(s, TICK, t0 + x + PAUSE_LIMIT_MS + 1 + c.late);
        expect(out.phase).toBe("snuffed");
        expect(out.history).toHaveLength(1);
        expect(out.history[0]).toMatchObject({
          outcome: "snuffed",
          endedAt: t0 + x + PAUSE_LIMIT_MS,
          distractions: 1,
          timeAwayMs: x - c.h,
        });
      }),
      PROP_PARAMS,
    );
  });
});

describe("D5: what does not count", () => {
  const arbProbes = fc.array(fc.integer({ min: 0, max: 3 * HOUR }), { minLength: 60, maxLength: 60 });

  const distractionFields = (s: State): unknown =>
    s.phase === "idle"
      ? null
      : [s.session.distractions, s.session.timeAwayMs, s.session.awaySpansMs, s.phase === "lit" ? s.awaySince : null];

  it("hide outside lit, a second hide, and a show with nothing open leave the distraction fields unchanged", () => {
    fc.assert(
      fc.property(arbT0, arbVisibilityScript, arbProbes, (t0, script, offsets) => {
        runScript(script, t0).forEach(({ after, now }: TraceEntry, i) => {
          const probe = now + at(offsets, i);
          const settled = step(after, TICK, probe);
          const nothingDue = settled === after;

          // hide where the settled phase is not lit: ignored
          // second hide where one is open: ignored (open implies lit and nothing due)
          // show where nothing is open (any phase): ignored
          const hide = step(after, { type: "hide" }, probe);
          const show = step(after, { type: "show" }, probe);
          const hideIgnored = settled.phase !== "lit" || settled.awaySince !== null;
          const showIgnored = settled.phase !== "lit" || settled.awaySince === null;

          if (hideIgnored) {
            expect(hide).toStrictEqual(settled);
            if (nothingDue) expect(hide).toBe(after);
            expect(distractionFields(hide)).toStrictEqual(distractionFields(settled));
          }
          if (showIgnored) {
            expect(show).toStrictEqual(settled);
            if (nothingDue) expect(show).toBe(after);
            expect(distractionFields(show)).toStrictEqual(distractionFields(settled));
          }
        });
      }),
      PROP_PARAMS,
    );
  });
});

describe("D7: history matches the session", () => {
  it("every added entry equals the ended session's totals, stays unchanged, and fits the wall-clock time", () => {
    fc.assert(
      fc.property(arbT0, arbVisibilityScript, (t0, script) => {
        const trace = runScript(script, t0);
        const ref = referenceTrace(script, t0);
        const added: string[] = []; // each entry as it was when added
        trace.forEach(({ event, before, after }, i) => {
          const r = at(ref, i);
          // earlier entries are untouched: same objects, or equal values after a reload (which rebuilds from text)
          before.history.forEach((e, k) => {
            if (event.type === "reload") expect(after.history[k]).toStrictEqual(e);
            else expect(after.history[k]).toBe(e);
          });
          for (let k = before.history.length; k < after.history.length; k++) {
            const entry = at(after.history, k);
            const expected = at(r.entries, k);
            expect(entry.distractions).toBe(expected.distractions);
            expect(entry.timeAwayMs).toBe(expected.timeAwayMs);
            added.push(JSON.stringify(entry));
          }
        });
        const last = trace.length === 0 ? INITIAL_STATE : at(trace, trace.length - 1).after;
        expect(last.history.map((e) => JSON.stringify(e))).toStrictEqual(added);
        for (const e of last.history) expect(e.timeAwayMs).toBeLessThanOrEqual(e.endedAt - e.startedAt);
      }),
      PROP_PARAMS,
    );
  });
});
