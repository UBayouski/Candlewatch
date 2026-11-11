// Property tests for `step`: P1, P2, P3, P4, P7, P10 (design.md section 8.2). P9 was replaced by D1 and D5 (distraction-tracking).
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MS_PER_MINUTE, PAUSE_LIMIT_MS } from "./constants";
import { restoreState, serializeHistory, serializeSession } from "./serialize";
import { timeLeftMs } from "./selectors";
import { step } from "./step";
import {
  PROP_PARAMS,
  arbLength,
  arbScript,
  arbT0,
  arbWildScript,
  assertInvariants,
  runScript,
} from "./test-kit";
import type { TraceEntry } from "./test-kit";
import { INITIAL_STATE } from "./types";
import type { Event, State } from "./types";

const TICK: Event = { type: "tick" };
const HOUR = 3_600_000;

function at<T>(items: readonly T[], i: number): T {
  const item = items[i];
  if (item === undefined) throw new Error(`index ${i} out of range`);
  return item;
}

function roundTrip(s: State): State {
  return restoreState(serializeSession(s), serializeHistory(s.history));
}

const isRunning = (s: State): boolean => s.phase === "lit" || s.phase === "paused";
const isFinal = (s: State): boolean => s.phase === "burned-out" || s.phase === "snuffed";

describe("P1: time left never increases while lit", () => {
  it("holds between consecutive states of the same session", () => {
    fc.assert(
      fc.property(arbT0, arbScript, (t0, script) => {
        const trace = runScript(script, t0);
        for (let i = 1; i < trace.length; i++) {
          const prev = at(trace, i - 1);
          const cur = at(trace, i);
          const a = prev.after;
          const b = cur.after;
          if (!isRunning(a) || !isRunning(b)) continue;
          if (a.phase === "idle" || b.phase === "idle") continue;
          if (a.session.startedAt !== b.session.startedAt) continue;
          expect(timeLeftMs(b, cur.now)).toBeLessThanOrEqual(timeLeftMs(a, prev.now));
        }
      }),
      PROP_PARAMS,
    );
  });
});

describe("P2: pausing never changes total burn time", () => {
  const arbPairs = arbLength.chain((len) => {
    const maxBurn = Math.floor((len * MS_PER_MINUTE - 1) / 10);
    return fc.record({
      len: fc.constant(len),
      pairs: fc.array(
        fc.record({ burn: fc.integer({ min: 1, max: maxBurn }), pause: fc.integer({ min: 0, max: 60_000 }) }),
        { maxLength: 10 },
      ),
    });
  });

  it("completion moves later by exactly the total paused time", () => {
    fc.assert(
      fc.property(arbT0, arbPairs, (t0, { len, pairs }) => {
        const L = len * MS_PER_MINUTE;
        let t = t0;
        let s = step(INITIAL_STATE, { type: "light", length: len }, t);
        let total = 0;
        for (const { burn, pause } of pairs) {
          t += burn;
          s = step(s, { type: "pause" }, t);
          expect(s.phase).toBe("paused");
          t += pause;
          s = step(s, { type: "resume" }, t);
          expect(s.phase).toBe("lit");
          total += pause;
        }
        const completion = t0 + L + total;
        s = step(s, TICK, completion - 1);
        expect(s.phase).toBe("lit");
        expect(timeLeftMs(s, completion - 1)).toBe(1);
        s = step(s, TICK, completion);
        expect(s.phase).toBe("burned-out");
        if (s.phase !== "burned-out") return;
        expect(s.endedAt).toBe(completion);
        expect(s.session.pausedTotalMs).toBe(total);
        // Burn time at completion equals the session length.
        expect(s.endedAt - s.session.startedAt - s.session.pausedTotalMs).toBe(L);
        // A pause-free run of the same length ends at t0 + L.
        const free = step(step(INITIAL_STATE, { type: "light", length: len }, t0), TICK, t0 + L);
        expect(free.phase === "burned-out" && free.endedAt).toBe(t0 + L);
      }),
      PROP_PARAMS,
    );
  });
});

describe("P3: the tick rate does not matter", () => {
  /** Runs the base events again, with extra ticks at the given (slot, time) positions. */
  function replay(
    trace: readonly TraceEntry[],
    extras: readonly { slot: number; time: number }[],
  ): void {
    let state: State = INITIAL_STATE;
    for (let k = 0; k < trace.length; k++) {
      const entry = at(trace, k);
      state = step(state, entry.event, entry.now);
      // hide and show settle like every other event, so the states agree strictly (the earlier
      // hide/show exception, found at seed -507689219, is gone with the exemption).
      expect(state).toStrictEqual(entry.after);
      const slotTicks = extras.filter((x) => x.slot === k).sort((x, y) => x.time - y.time);
      for (const x of slotTicks) state = step(state, TICK, x.time);
    }
  }

  const arbExtras = fc.array(
    fc.record({ at: fc.nat(1000), frac: fc.double({ min: 0, max: 1, noNaN: true }) }),
    { maxLength: 40 },
  );

  it("extra ticks at random times between events give the same state after every event", () => {
    fc.assert(
      fc.property(arbT0, arbScript, arbExtras, (t0, script, extras) => {
        const trace = runScript(script, t0);
        if (trace.length === 0) return;
        const placed = extras.map(({ at: a, frac }) => {
          const k = a % trace.length;
          const here = at(trace, k).now;
          const next = k + 1 < trace.length ? at(trace, k + 1).now : here + HOUR;
          return { slot: k, time: here + Math.floor(frac * (next - here)) };
        });
        replay(trace, placed);
      }),
      PROP_PARAMS,
    );
  });

  it("a fixed tick period between events gives the same state after every event", () => {
    fc.assert(
      fc.property(arbT0, arbScript, fc.integer({ min: 1, max: 60_000 }), (t0, script, period) => {
        const trace = runScript(script, t0);
        const placed: { slot: number; time: number }[] = [];
        for (let k = 0; k < trace.length && placed.length < 500; k++) {
          const here = at(trace, k).now;
          const next = k + 1 < trace.length ? at(trace, k + 1).now : here + HOUR;
          for (let time = here + period; time < next && placed.length < 500; time += period) {
            placed.push({ slot: k, time });
          }
        }
        replay(trace, placed);
      }),
      PROP_PARAMS,
    );
  });
});

describe("P4: no illegal states or transitions", () => {
  type Phase = State["phase"];
  const ALLOWED: Record<Phase, readonly Phase[]> = {
    idle: ["idle", "lit"],
    lit: ["lit", "paused", "burned-out", "snuffed"],
    paused: ["paused", "lit", "snuffed"],
    "burned-out": ["burned-out", "lit"],
    snuffed: ["snuffed", "lit"],
  };

  it("never throws, keeps the invariants, and only makes allowed moves", () => {
    fc.assert(
      fc.property(arbT0, arbWildScript, (t0, script) => {
        for (const { event, now, before, after } of runScript(script, t0)) {
          assertInvariants(after);
          if (event.type === "reload") continue; // a restore may land in any phase it describes
          expect(ALLOWED[before.phase]).toContain(after.phase);
          if (after.phase === "lit" && (before.phase === "idle" || isFinal(before))) {
            // A new session: it starts now.
            expect(after.litSince).toBe(now);
            expect(after.session.startedAt).toBe(now);
          }
          if (after.phase === "lit" && before.phase === "paused") {
            const resumed = after.session.startedAt === before.session.startedAt;
            const fresh = after.litSince === now && after.session.startedAt === now;
            expect(resumed || fresh).toBe(true);
          }
        }
      }),
      PROP_PARAMS,
    );
  });
});

describe("P7: the pause limit", () => {
  const NOTICERS = ["tick", "resume", "snuff", "pause", "light", "reload"] as const;

  const arbSetup = arbLength.chain((len) => {
    const quarter = Math.floor((len * MS_PER_MINUTE) / 4);
    return fc.record({
      len: fc.constant(len),
      b0: fc.integer({ min: 0, max: quarter }),
      prior: fc.option(fc.integer({ min: 0, max: PAUSE_LIMIT_MS }), { nil: null }),
      b1: fc.integer({ min: 0, max: quarter }),
      noticer: fc.constantFrom(...NOTICERS),
      within: fc.boolean(),
      edge: fc.constantFrom("exact", "frac"),
      frac: fc.double({ min: 0, max: 1, noNaN: true }),
      late: fc.oneof(fc.constant(1), fc.integer({ min: 1, max: HOUR })),
    });
  });

  it("resumes within the allowance and snuffs at the limit instant beyond it, however late it is noticed", () => {
    fc.assert(
      fc.property(arbT0, arbSetup, (t0, c) => {
        let t = t0;
        let s = step(INITIAL_STATE, { type: "light", length: c.len }, t);
        let priorTotal = 0;
        if (c.prior !== null) {
          t += c.b0;
          s = step(s, { type: "pause" }, t);
          t += c.prior;
          s = step(s, { type: "resume" }, t);
          priorTotal = c.prior;
          expect(s.phase).toBe("lit");
        }
        t += c.b1;
        const pausedAt = t;
        s = step(s, { type: "pause" }, pausedAt);
        expect(s.phase).toBe("paused");
        const allowance = PAUSE_LIMIT_MS - priorTotal;
        const limit = pausedAt + allowance;
        const historyBefore = s.history.length;

        if (c.within) {
          const d = c.edge === "exact" ? allowance : Math.floor(c.frac * allowance);
          expect(step(s, TICK, pausedAt + d)).toBe(s); // still paused, nothing due
          const resumed = step(s, { type: "resume" }, pausedAt + d);
          expect(resumed.phase).toBe("lit");
          if (resumed.phase !== "lit") return;
          expect(resumed.session.pausedTotalMs).toBe(priorTotal + d);
          expect(resumed.session.pausedTotalMs).toBeLessThanOrEqual(PAUSE_LIMIT_MS);
          return;
        }

        const noticedAt = limit + c.late;
        const event: Event =
          c.noticer === "light"
            ? { type: "light", length: 25 }
            : c.noticer === "reload"
              ? { type: "reload", state: roundTrip(s) }
              : { type: c.noticer };
        const out = step(s, event, noticedAt);
        assertInvariants(out);
        expect(out.history).toHaveLength(historyBefore + 1);
        const entry = out.history[historyBefore];
        expect(entry?.outcome).toBe("snuffed");
        expect(entry?.endedAt).toBe(limit);
        if (c.noticer === "light") {
          expect(out.phase).toBe("lit"); // the old candle is settled first, then the new one is lit
        } else {
          expect(out.phase).toBe("snuffed");
          expect(out.phase === "snuffed" && out.endedAt).toBe(limit);
        }
      }),
      PROP_PARAMS,
    );
  });

  it("the paused total never exceeds 10 minutes in any state of any run", () => {
    fc.assert(
      fc.property(arbT0, arbWildScript, (t0, script) => {
        for (const { after } of runScript(script, t0)) {
          if (after.phase !== "idle") {
            expect(after.session.pausedTotalMs).toBeLessThanOrEqual(PAUSE_LIMIT_MS);
          }
        }
      }),
      PROP_PARAMS,
    );
  });
});

describe("P10: one history entry per ended session", () => {
  it("history only grows, by exactly one entry when a session ends", () => {
    fc.assert(
      fc.property(arbT0, arbScript, (t0, script) => {
        for (const { event, before, after } of runScript(script, t0)) {
          expect(after.history.length).toBeGreaterThanOrEqual(before.history.length);
          before.history.forEach((e, i) => {
            // A reload restores entries from text: equal values, fresh objects. Any other event keeps them.
            if (event.type === "reload") expect(after.history[i]).toStrictEqual(e);
            else expect(after.history[i]).toBe(e);
          });
          const growth = after.history.length - before.history.length;
          expect([0, 1]).toContain(growth);
          if (growth === 1) {
            expect(isRunning(before)).toBe(true);
            const added = at(after.history, after.history.length - 1);
            if (before.phase === "lit" || before.phase === "paused") {
              expect(added.startedAt).toBe(before.session.startedAt);
            }
          } else if (before.phase === "lit" || before.phase === "paused") {
            // No entry: the same session must still be running.
            expect(isRunning(after)).toBe(true);
            if (after.phase === "lit" || after.phase === "paused") {
              expect(after.session.startedAt).toBe(before.session.startedAt);
            }
          }
          if (isFinal(after) && !isFinal(before)) expect(growth).toBe(1);
          if (!isRunning(before)) expect(growth).toBe(0);
        }
      }),
      PROP_PARAMS,
    );
  });

  it("has no duplicate entries, and one entry per session that ended", () => {
    fc.assert(
      fc.property(arbT0, arbScript, (t0, script) => {
        const trace = runScript(script, t0);
        const grown = trace.filter((e) => e.after.history.length > e.before.history.length).length;
        const last = trace.length === 0 ? INITIAL_STATE : at(trace, trace.length - 1).after;
        expect(last.history).toHaveLength(grown);
        const keys = new Set(last.history.map((e) => `${e.startedAt}:${e.endedAt}`));
        expect(keys.size).toBe(last.history.length);
      }),
      PROP_PARAMS,
    );
  });

  it("reloading a running session twice at a late time adds exactly one entry in total", () => {
    fc.assert(
      fc.property(arbT0, arbScript, (t0, script) => {
        for (const { after, now } of runScript(script, t0)) {
          if (!isRunning(after)) continue;
          const late = now + 3 * HOUR; // far beyond any completion or pause limit
          const r1 = step(after, { type: "reload", state: roundTrip(after) }, late);
          expect(r1.history).toHaveLength(after.history.length + 1);
          const r2 = step(r1, { type: "reload", state: roundTrip(r1) }, late + HOUR);
          expect(r2.history).toHaveLength(r1.history.length);
        }
      }),
      PROP_PARAMS,
    );
  });
});
