// P7 (controls-and-access R9.3, R9.4, R9.5): the announcer says the same state changes whatever the call times,
// never repeats a milestone, never talks while paused, and is bounded.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { INITIAL_STATE, step, timeLeftMs } from "../engine";
import type { State } from "../engine";
import { arbScript, arbT0, makeArbScript, runScript } from "../engine/test-kit";
import type { ScriptStep, StepKind, TraceEntry } from "../engine/test-kit";
import { STRINGS } from "../strings";
import { INITIAL_ANNOUNCER, nextAnnouncement, textOf } from "./announcer";
import type { AnnouncementKey, AnnouncerMemory } from "./announcer";
import { PROP_PARAMS } from "./test-kit";

const MIN = 60_000;
const MILESTONE_KEYS: readonly AnnouncementKey[] = ["q75", "q50", "q25", "lastMinute"];
const STATE_CHANGE_KEYS: readonly AnnouncementKey[] = ["lit", "restored", "paused", "resumed", "burnedOut", "snuffed"];
const KEYS_BY_PHASE: Record<State["phase"], readonly AnnouncementKey[]> = {
  idle: [],
  lit: ["lit", "restored", "resumed", ...MILESTONE_KEYS],
  paused: ["paused"],
  "burned-out": ["burnedOut"],
  snuffed: ["snuffed"],
};

const running = (s: State): boolean => s.phase === "lit" || s.phase === "paused";

/** Thresholds written out again here, not taken from the code under test. */
const thresholds = (lengthMin: number): number[] => [lengthMin * MIN * 0.75, lengthMin * MIN * 0.5, lengthMin * MIN * 0.25, 60_000];

interface Call {
  /** Index of the engine event this call follows (-1: the idle page before any event). */
  readonly index: number;
  readonly at: number;
}

interface Said {
  readonly key: AnnouncementKey;
  readonly call: Call;
  readonly state: State;
  readonly sessionId: number | null;
  readonly epoch: number;
  readonly text: string;
}

interface Run {
  readonly said: Said[];
  readonly calls: number;
  /** Distinct (session, load) pairs that were running at some call: the segments in which milestones can be said. */
  readonly segments: number;
}

/** A session id per trace entry: a new one at each light that starts a candle, and at a reload that restores another one. */
function sessionIds(trace: readonly TraceEntry[]): (number | null)[] {
  let n = 0;
  let last: number | null = null;
  return trace.map((e) => {
    const after = e.after;
    if (after.phase === "idle") return (last = null);
    const before = e.before;
    const sameCandle = "session" in before && before.session.startedAt === after.session.startedAt && !(e.event.type === "light" && !running(before));
    if (!sameCandle || last === null) last = ++n;
    return last;
  });
}

/** Plays the announcer over a call schedule. A `reload` event resets the memory, as a page load does. */
function announceAll(trace: readonly TraceEntry[], calls: readonly Call[], t0: number): Run {
  const ids = sessionIds(trace);
  const said: Said[] = [];
  const segments = new Set<string>();
  let mem: AnnouncerMemory = INITIAL_ANNOUNCER;
  let epoch = 0;
  let lastIndex = -1;
  for (const call of calls) {
    for (let i = lastIndex + 1; i <= call.index; i++) if (trace[i]?.event.type === "reload") { mem = INITIAL_ANNOUNCER; epoch++; }
    lastIndex = call.index;
    const state = call.index < 0 ? INITIAL_STATE : (trace[call.index]?.after ?? INITIAL_STATE);
    const r = nextAnnouncement(mem, state, call.index < 0 ? t0 : call.at);
    mem = r.mem;
    const sessionId = call.index < 0 ? null : (ids[call.index] ?? null);
    if (running(state)) segments.add(`${sessionId}:${epoch}`);
    if (r.announcement) said.push({ key: r.announcement.key, call, state, sessionId, epoch, text: textOf(r.announcement) });
  }
  return { said, calls: calls.length, segments: segments.size };
}

type Planner = (start: number, end: number, fractions: readonly number[]) => number[];

const PLANNERS: Record<string, Planner> = {
  one: (start) => [start],
  late: (_start, end) => [end],
  fine: (start, end) => {
    const step = Math.max(1000, Math.ceil((end - start) / 200));
    const out: number[] = [];
    for (let t = start; t < end; t += step) out.push(t);
    out.push(end);
    return out;
  },
  random: (start, end, fractions) => (fractions.length === 0 ? [start] : [...fractions].sort((a, b) => a - b).map((f) => Math.floor(start + f * (end - start)))),
};

function schedule(trace: readonly TraceEntry[], tail: number, fractions: readonly (readonly number[])[], plan: Planner): Call[] {
  const calls: Call[] = [{ index: -1, at: 0 }];
  trace.forEach((e, i) => {
    const end = trace[i + 1]?.now ?? e.now + tail;
    for (const at of plan(e.now, end, fractions[i] ?? [])) calls.push({ index: i, at });
  });
  return calls;
}

const arbFractions = fc.array(fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 6 }), { minLength: 61, maxLength: 61 });
const arbTail = fc.integer({ min: 0, max: 40 * MIN });

const sorted = (keys: readonly AnnouncementKey[]): AnnouncementKey[] => [...keys].sort();
const stateChanges = (run: Run): AnnouncementKey[] => sorted(run.said.map((s) => s.key).filter((k) => STATE_CHANGE_KEYS.includes(k)));

/**
 * A candle that is lit first and then burns for a while with pauses, resumes and reloads between ticks, so that milestones are
 * crossed before and after them. (Random scripts from `arbScript` rarely stay lit long enough to cross one before a pause.)
 */
const arbBurningScript: fc.Arbitrary<ScriptStep[]> = makeArbScript({
  gap: fc.integer({ min: 0, max: 400_000 }),
  maxLength: 30,
  kinds: fc.constantFrom<StepKind>("tick", "tick", "tick", "tick", "pause", "resume", "resume", "reload", "hide", "show"),
}).chain((rest) => fc.integer({ min: 5, max: 90 }).map((length): ScriptStep[] => [{ kind: "light", gap: 0, length, intent: undefined, junk: undefined }, ...rest]));

const arbCase = fc.tuple(arbT0, fc.oneof(arbScript, arbBurningScript), arbTail, arbFractions);

describe("P7: the announcer", () => {
  it("says the same state changes whatever the call times (R9.3)", () => {
    fc.assert(
      fc.property(arbCase, ([t0, script, tail, fractions]) => {
        const trace = runScript(script, t0);
        const runs = Object.values(PLANNERS).map((plan) => announceAll(trace, schedule(trace, tail, fractions, plan), t0));
        const [first, ...others] = runs;
        for (const other of others) expect(stateChanges(other)).toEqual(stateChanges(first as Run));
      }),
      PROP_PARAMS,
    );
  });

  it("is bounded: at most the state changes plus four milestones for each session and load (R9.3)", () => {
    fc.assert(
      fc.property(arbCase, ([t0, script, tail, fractions]) => {
        const trace = runScript(script, t0);
        for (const plan of Object.values(PLANNERS)) {
          const run = announceAll(trace, schedule(trace, tail, fractions, plan), t0);
          const changes = run.said.filter((s) => STATE_CHANGE_KEYS.includes(s.key)).length;
          expect(run.said.length).toBeLessThanOrEqual(changes + 4 * run.segments);
        }
      }),
      PROP_PARAMS,
    );
  });

  it("says each milestone at most once per candle, in order, and never after a pause, resume or reload (R9.3)", () => {
    fc.assert(
      fc.property(arbCase, ([t0, script, tail, fractions]) => {
        const trace = runScript(script, t0);
        for (const plan of Object.values(PLANNERS)) {
          const run = announceAll(trace, schedule(trace, tail, fractions, plan), t0);
          const lastIndexOf = new Map<number, number>();
          for (const s of run.said) {
            const m = MILESTONE_KEYS.indexOf(s.key);
            if (m < 0 || s.sessionId === null) continue;
            expect(m, `${s.key} after a later or equal milestone in candle ${s.sessionId}`).toBeGreaterThan(lastIndexOf.get(s.sessionId) ?? -1);
            lastIndexOf.set(s.sessionId, m);
          }
        }
      }),
      PROP_PARAMS,
    );
  });

  it("says only the latest milestone reached, and only when it is reached (R9.3)", () => {
    fc.assert(
      fc.property(arbCase, ([t0, script, tail, fractions]) => {
        const trace = runScript(script, t0);
        for (const plan of Object.values(PLANNERS)) {
          for (const s of announceAll(trace, schedule(trace, tail, fractions, plan), t0).said) {
            const m = MILESTONE_KEYS.indexOf(s.key);
            if (m < 0) continue;
            if (!("session" in s.state)) throw new Error("milestone without a session");
            const left = timeLeftMs(s.state, s.call.at);
            const limits = thresholds(s.state.session.lengthMin);
            expect(left).toBeGreaterThan(0);
            expect(left).toBeLessThanOrEqual(limits[m] ?? -1);
            // None of the later milestones had been reached yet: this one is the latest.
            for (let j = m + 1; j < limits.length; j++) expect(left).toBeGreaterThan(limits[j] ?? 0);
            expect(s.state.phase).toBe("lit");
          }
        }
      }),
      PROP_PARAMS,
    );
  });

  it("says nothing while paused except the pause, and a message fits the state it was said for (R9.4)", () => {
    fc.assert(
      fc.property(arbCase, ([t0, script, tail, fractions]) => {
        const trace = runScript(script, t0);
        for (const plan of Object.values(PLANNERS)) {
          for (const s of announceAll(trace, schedule(trace, tail, fractions, plan), t0).said) {
            expect(KEYS_BY_PHASE[s.state.phase], `${s.key} said while ${s.state.phase}`).toContain(s.key);
          }
        }
      }),
      PROP_PARAMS,
    );
  });

  it("gives no message for hide and show: the state they change is not one the announcer reads (R9.4)", () => {
    fc.assert(
      fc.property(arbT0, fc.array(fc.constantFrom(0, 1, 7 * MIN, 19 * MIN), { minLength: 1, maxLength: 4 }), arbScript, (t0, offsets, script) => {
        const trace = runScript(script, t0);
        let mem: AnnouncerMemory = INITIAL_ANNOUNCER;
        for (const e of trace) {
          if (e.event.type === "hide" || e.event.type === "show") {
            for (const offset of offsets) {
              const withEvent = nextAnnouncement(mem, e.after, e.now + offset);
              // What time alone does: a hide or show at the end of the candle settles it, like a tick.
              const without = nextAnnouncement(mem, step(e.before, { type: "tick" }, e.now), e.now + offset);
              expect(withEvent.announcement?.key ?? null).toBe(without.announcement?.key ?? null);
              expect(withEvent.mem).toEqual(without.mem);
            }
          }
          mem = e.event.type === "reload" ? INITIAL_ANNOUNCER : nextAnnouncement(mem, e.after, e.now).mem;
        }
      }),
      PROP_PARAMS,
    );
  });

  it("is a pure function, and every text comes from strings.ts (R9.4)", () => {
    const patterns = (Object.keys(STRINGS.announce) as AnnouncementKey[]).map((key) => ({
      key,
      pattern: new RegExp(`^${STRINGS.announce[key].replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{[A-Za-z0-9_]+\}/g, ".+?")}$`),
    }));
    fc.assert(
      fc.property(arbCase, ([t0, script, tail, fractions]) => {
        const trace = runScript(script, t0);
        const calls = schedule(trace, tail, fractions, PLANNERS.random as Planner);
        const run = announceAll(trace, calls, t0);
        expect(announceAll(trace, calls, t0)).toEqual(run);
        for (const s of run.said) {
          expect(s.text).not.toMatch(/[{}]/);
          const rule = patterns.find((p) => p.key === s.key);
          expect(rule?.pattern.test(s.text), `${s.key}: ${s.text}`).toBe(true);
        }
      }),
      PROP_PARAMS,
    );
  });
});
