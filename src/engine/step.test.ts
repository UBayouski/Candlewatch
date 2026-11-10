import { describe, expect, it } from "vitest";
import { BREAK_MS, MS_PER_MINUTE, PAUSE_LIMIT_MS } from "./constants";
import { settle } from "./settle";
import { step } from "./step";
import { burnMs, completionAt, pauseLimitAt } from "./time";
import { INITIAL_STATE } from "./types";
import type { Event, LitState, PausedState, Session, State } from "./types";

const T0 = 1_800_000_000_000;
const MIN = MS_PER_MINUTE;

const session = (over: Partial<Session> = {}): Session => ({
  startedAt: T0,
  lengthMin: 25,
  intent: "write the report",
  pausedTotalMs: 0,
  distractions: 0,
  timeAwayMs: 0,
  ...over,
});

const lit = (over: Partial<Session> = {}, litSince: number = over.startedAt ?? T0): LitState => ({
  phase: "lit",
  history: [],
  session: session(over),
  litSince,
});

const paused = (over: Partial<Session> = {}, pausedAt: number = T0 + 5 * MIN): PausedState => ({
  phase: "paused",
  history: [],
  session: session(over),
  pausedAt,
});

describe("time formulas", () => {
  it("completes at start + paused total + length", () => {
    expect(completionAt(lit())).toBe(T0 + 25 * MIN);
    expect(completionAt(lit({ pausedTotalMs: 3 * MIN }, T0 + 8 * MIN))).toBe(T0 + 28 * MIN);
  });

  it("runs out of pause allowance at pause start + remaining allowance", () => {
    expect(pauseLimitAt(paused({}, T0 + 5 * MIN))).toBe(T0 + 5 * MIN + PAUSE_LIMIT_MS);
    expect(pauseLimitAt(paused({ pausedTotalMs: 4 * MIN }, T0 + 9 * MIN))).toBe(T0 + 9 * MIN + 6 * MIN);
  });

  it("burns from timestamps only while lit", () => {
    expect(burnMs(lit(), T0)).toBe(0);
    expect(burnMs(lit(), T0 + 10 * MIN)).toBe(10 * MIN);
    expect(burnMs(lit({ pausedTotalMs: 2 * MIN }, T0 + 4 * MIN), T0 + 10 * MIN)).toBe(8 * MIN);
  });

  it("freezes burn while paused", () => {
    const p = paused({}, T0 + 5 * MIN);
    expect(burnMs(p, T0 + 5 * MIN)).toBe(5 * MIN);
    expect(burnMs(p, T0 + 9 * MIN)).toBe(5 * MIN);
  });

  it("treats a clock that moved backwards as zero elapsed, never negative", () => {
    expect(burnMs(lit(), T0 - 10 * MIN)).toBe(0);
    const resumed = lit({ pausedTotalMs: 2 * MIN }, T0 + 12 * MIN);
    const atAnchor = burnMs(resumed, T0 + 12 * MIN);
    expect(atAnchor).toBe(10 * MIN);
    expect(burnMs(resumed, T0 + 1 * MIN)).toBe(atAnchor);
  });

  it("clamps burn to the session length", () => {
    expect(burnMs(lit(), T0 + 10 * 60 * MIN)).toBe(25 * MIN);
  });

  it("has no burn outside lit and paused", () => {
    expect(burnMs(INITIAL_STATE, T0)).toBe(0);
  });
});

describe("settle", () => {
  it("leaves a running candle alone before its completion instant", () => {
    const s = lit();
    expect(settle(s, T0 + 25 * MIN - 1)).toBe(s);
  });

  it("burns out exactly at the completion instant and dates the end to it", () => {
    const out = settle(lit(), T0 + 25 * MIN);
    expect(out.phase).toBe("burned-out");
    if (out.phase !== "burned-out") return;
    expect(out.endedAt).toBe(T0 + 25 * MIN);
    expect(out.breakEndsAt).toBe(T0 + 25 * MIN + BREAK_MS);
  });

  it("dates a late discovery to the true instant, not to now", () => {
    const out = settle(lit(), T0 + 3 * 60 * MIN);
    expect(out.phase).toBe("burned-out");
    if (out.phase !== "burned-out") return;
    expect(out.endedAt).toBe(T0 + 25 * MIN);
    expect(out.breakEndsAt).toBe(T0 + 25 * MIN + BREAK_MS);
  });

  it("counts closed pauses in the completion instant", () => {
    const out = settle(lit({ pausedTotalMs: 4 * MIN }, T0 + 9 * MIN), T0 + 60 * MIN);
    expect(out.phase === "burned-out" && out.endedAt).toBe(T0 + 29 * MIN);
  });

  it("allows exactly 10 minutes of pause and snuffs one millisecond later", () => {
    const p = paused({}, T0 + 5 * MIN);
    const limit = T0 + 5 * MIN + PAUSE_LIMIT_MS;
    expect(settle(p, limit)).toBe(p);
    const out = settle(p, limit + 1);
    expect(out.phase).toBe("snuffed");
    expect(out.phase === "snuffed" && out.endedAt).toBe(limit);
  });

  it("dates a late snuff to the limit instant", () => {
    const out = settle(paused({}, T0 + 5 * MIN), T0 + 5 * 60 * MIN);
    expect(out.phase === "snuffed" && out.endedAt).toBe(T0 + 5 * MIN + PAUSE_LIMIT_MS);
  });

  it("adds exactly one history entry when it ends a session", () => {
    const out = settle(lit(), T0 + 26 * MIN);
    expect(out.history).toHaveLength(1);
    expect(out.history[0]).toEqual({
      startedAt: T0,
      endedAt: T0 + 25 * MIN,
      lengthMin: 25,
      intent: "write the report",
      outcome: "burned-out",
      distractions: 0,
      timeAwayMs: 0,
    });
  });

  it("is idempotent", () => {
    const once = settle(lit(), T0 + 26 * MIN);
    expect(settle(once, T0 + 99 * MIN)).toBe(once);
    expect(once.history).toHaveLength(1);
  });

  it("does nothing to idle and final phases", () => {
    expect(settle(INITIAL_STATE, T0)).toBe(INITIAL_STATE);
    const burned = settle(lit(), T0 + 26 * MIN);
    expect(settle(burned, T0 + 1000 * MIN)).toBe(burned);
  });

  it("does not mutate its input", () => {
    const s = Object.freeze(lit());
    expect(() => settle(s, T0 + 26 * MIN)).not.toThrow();
    expect(s.phase).toBe("lit");
  });
});

const LIGHT = (length: number, intent?: string): Event =>
  intent === undefined ? { type: "light", length } : { type: "light", length, intent };
const PAUSE: Event = { type: "pause" };
const RESUME: Event = { type: "resume" };
const SNUFF: Event = { type: "snuff" };
const TICK: Event = { type: "tick" };
const HIDE: Event = { type: "hide" };
const SHOW: Event = { type: "show" };

/** An idle state lit at T0 for 25 minutes. */
const litAtT0 = (): State => step(INITIAL_STATE, LIGHT(25, "write the report"), T0);

describe("step: light", () => {
  it("lights from idle with the length, intent and start time", () => {
    const s = litAtT0();
    expect(s.phase).toBe("lit");
    if (s.phase !== "lit") return;
    expect(s.session).toEqual({
      startedAt: T0,
      lengthMin: 25,
      intent: "write the report",
      pausedTotalMs: 0,
      distractions: 0,
      timeAwayMs: 0,
    });
    expect(s.litSince).toBe(T0);
  });

  it("normalizes the intent", () => {
    const s = step(INITIAL_STATE, LIGHT(15, "  a\nb  "), T0);
    expect(s.phase === "lit" && s.session.intent).toBe("a b");
    const none = step(INITIAL_STATE, LIGHT(15), T0);
    expect(none.phase === "lit" && none.session.intent).toBeNull();
  });

  it("accepts the presets and the boundaries 5 and 90", () => {
    for (const len of [5, 15, 25, 50, 90]) {
      expect(step(INITIAL_STATE, LIGHT(len), T0).phase).toBe("lit");
    }
  });

  it("ignores lengths 4, 91, 25.5, NaN, Infinity and negatives", () => {
    for (const len of [4, 91, 25.5, NaN, Infinity, -Infinity, -25, 0]) {
      expect(step(INITIAL_STATE, LIGHT(len), T0)).toBe(INITIAL_STATE);
    }
  });

  it("is ignored while lit or paused", () => {
    const l = litAtT0();
    expect(step(l, LIGHT(50), T0 + MIN)).toBe(l);
    const p = step(l, PAUSE, T0 + MIN);
    expect(step(p, LIGHT(50), T0 + 2 * MIN)).toBe(p);
  });

  it("starts a new session from burned-out, keeping history (R1.5)", () => {
    const burned = step(litAtT0(), TICK, T0 + 30 * MIN);
    expect(burned.phase).toBe("burned-out");
    const next = step(burned, LIGHT(15, "again"), T0 + 31 * MIN);
    expect(next.phase).toBe("lit");
    expect(next.history).toEqual(burned.history);
    expect(next.phase === "lit" && next.session.startedAt).toBe(T0 + 31 * MIN);
  });

  it("starts a new session from burned-out while the break is in progress (skipping the break)", () => {
    const burned = step(litAtT0(), TICK, T0 + 25 * MIN);
    expect(step(burned, LIGHT(25), T0 + 26 * MIN).phase).toBe("lit");
  });

  it("starts a new session from snuffed (R1.5)", () => {
    const snuffed = step(litAtT0(), SNUFF, T0 + 2 * MIN);
    expect(snuffed.phase).toBe("snuffed");
    const next = step(snuffed, LIGHT(50), T0 + 3 * MIN);
    expect(next.phase).toBe("lit");
    expect(next.history).toHaveLength(1);
  });

  it("after a late completion records the old session once, then starts the new one", () => {
    const next = step(litAtT0(), LIGHT(15, "next"), T0 + 3 * 60 * MIN);
    expect(next.phase).toBe("lit");
    expect(next.history).toHaveLength(1);
    expect(next.history[0]?.outcome).toBe("burned-out");
    expect(next.history[0]?.endedAt).toBe(T0 + 25 * MIN);
    expect(next.phase === "lit" && next.session.intent).toBe("next");
  });

  it("an invalid light after a late completion still settles the old session", () => {
    const out = step(litAtT0(), LIGHT(4), T0 + 3 * 60 * MIN);
    expect(out.phase).toBe("burned-out");
    expect(out.history).toHaveLength(1);
  });
});

describe("step: pause and resume", () => {
  it("pauses a lit candle and records the pause start", () => {
    const p = step(litAtT0(), PAUSE, T0 + 5 * MIN);
    expect(p.phase).toBe("paused");
    expect(p.phase === "paused" && p.pausedAt).toBe(T0 + 5 * MIN);
  });

  it("resumes and adds the closed span to the paused total", () => {
    const p = step(litAtT0(), PAUSE, T0 + 5 * MIN);
    const r = step(p, RESUME, T0 + 7 * MIN);
    expect(r.phase).toBe("lit");
    if (r.phase !== "lit") return;
    expect(r.session.pausedTotalMs).toBe(2 * MIN);
    expect(r.litSince).toBe(T0 + 7 * MIN);
    expect(burnMs(r, T0 + 7 * MIN)).toBe(5 * MIN);
  });

  it("pausing and resuming does not change burn time", () => {
    const r = step(step(litAtT0(), PAUSE, T0 + 5 * MIN), RESUME, T0 + 8 * MIN);
    expect(burnMs(r, T0 + 8 * MIN)).toBe(5 * MIN);
    expect(burnMs(r, T0 + 18 * MIN)).toBe(15 * MIN);
    expect(completionAt(r as LitState)).toBe(T0 + 28 * MIN);
  });

  it("ignores pause outside lit and resume outside paused", () => {
    expect(step(INITIAL_STATE, PAUSE, T0)).toBe(INITIAL_STATE);
    expect(step(INITIAL_STATE, RESUME, T0)).toBe(INITIAL_STATE);
    const l = litAtT0();
    expect(step(l, RESUME, T0 + MIN)).toBe(l);
    const p = step(l, PAUSE, T0 + MIN);
    expect(step(p, PAUSE, T0 + 2 * MIN)).toBe(p);
  });

  it("allows exactly 10 minutes of pause", () => {
    const p = step(litAtT0(), PAUSE, T0 + 5 * MIN);
    const r = step(p, RESUME, T0 + 5 * MIN + PAUSE_LIMIT_MS);
    expect(r.phase).toBe("lit");
    expect(r.phase === "lit" && r.session.pausedTotalMs).toBe(PAUSE_LIMIT_MS);
  });

  it("snuffs 10 minutes plus 1 ms at the limit instant", () => {
    const p = step(litAtT0(), PAUSE, T0 + 5 * MIN);
    const out = step(p, TICK, T0 + 5 * MIN + PAUSE_LIMIT_MS + 1);
    expect(out.phase).toBe("snuffed");
    expect(out.phase === "snuffed" && out.endedAt).toBe(T0 + 5 * MIN + PAUSE_LIMIT_MS);
  });

  it("snuffs instead of resuming when resume arrives after the limit (R3.6)", () => {
    const p = step(litAtT0(), PAUSE, T0 + 5 * MIN);
    const out = step(p, RESUME, T0 + 60 * MIN);
    expect(out.phase).toBe("snuffed");
    expect(out.phase === "snuffed" && out.endedAt).toBe(T0 + 5 * MIN + PAUSE_LIMIT_MS);
    expect(out.history).toHaveLength(1);
    expect(out.history[0]?.outcome).toBe("snuffed");
  });

  it("counts several pauses against one 10-minute allowance", () => {
    let s = litAtT0();
    s = step(s, PAUSE, T0 + 1 * MIN);
    s = step(s, RESUME, T0 + 7 * MIN); // 6 min used
    s = step(s, PAUSE, T0 + 8 * MIN);
    const limit = T0 + 8 * MIN + 4 * MIN;
    expect(step(s, TICK, limit).phase).toBe("paused");
    const out = step(s, TICK, limit + 1);
    expect(out.phase === "snuffed" && out.endedAt).toBe(limit);
  });

  it("treats a clock that moved backwards as a zero-length span", () => {
    const p = step(litAtT0(), PAUSE, T0 + 5 * MIN);
    const r = step(p, RESUME, T0 + 2 * MIN);
    expect(r.phase === "lit" && r.session.pausedTotalMs).toBe(0);
    expect(r.phase === "lit" && r.litSince).toBe(T0 + 5 * MIN);
    const early = step(litAtT0(), PAUSE, T0 - 5 * MIN);
    expect(early.phase === "paused" && early.pausedAt).toBe(T0);
  });
});

describe("step: tick and completion", () => {
  it("returns the same reference when nothing is due", () => {
    const l = litAtT0();
    expect(step(l, TICK, T0 + 10 * MIN)).toBe(l);
    expect(step(INITIAL_STATE, TICK, T0)).toBe(INITIAL_STATE);
  });

  it("burns out at completion with the true end instant and a break window", () => {
    const out = step(litAtT0(), TICK, T0 + 25 * MIN);
    expect(out.phase).toBe("burned-out");
    if (out.phase !== "burned-out") return;
    expect(out.endedAt).toBe(T0 + 25 * MIN);
    expect(out.breakEndsAt).toBe(T0 + 25 * MIN + 300_000);
  });

  it("dates a late discovery to the true instant", () => {
    const out = step(litAtT0(), TICK, T0 + 5 * 60 * MIN);
    expect(out.phase === "burned-out" && out.endedAt).toBe(T0 + 25 * MIN);
  });

  it("is safe to send any number of times", () => {
    const a = step(litAtT0(), TICK, T0 + 30 * MIN);
    expect(step(a, TICK, T0 + 30 * MIN)).toBe(a);
    expect(step(a, TICK, T0 + 99 * MIN)).toBe(a);
    expect(a.history).toHaveLength(1);
  });

  it("settles before handling other events, so pause after completion is ignored (R5.4)", () => {
    const out = step(litAtT0(), PAUSE, T0 + 26 * MIN);
    expect(out.phase).toBe("burned-out");
  });

  it("settles before resume handling", () => {
    const l = step(step(litAtT0(), PAUSE, T0 + MIN), RESUME, T0 + 2 * MIN);
    const out = step(l, RESUME, T0 + 90 * MIN);
    expect(out.phase).toBe("burned-out");
  });
});

describe("step: snuff", () => {
  it("snuffs a lit candle with end time now", () => {
    const out = step(litAtT0(), SNUFF, T0 + 7 * MIN);
    expect(out.phase).toBe("snuffed");
    expect(out.phase === "snuffed" && out.endedAt).toBe(T0 + 7 * MIN);
    expect(out.history).toHaveLength(1);
    expect(out.history[0]).toMatchObject({ outcome: "snuffed", endedAt: T0 + 7 * MIN });
  });

  it("snuffs a paused candle with end time now", () => {
    const p = step(litAtT0(), PAUSE, T0 + 5 * MIN);
    const out = step(p, SNUFF, T0 + 8 * MIN);
    expect(out.phase === "snuffed" && out.endedAt).toBe(T0 + 8 * MIN);
  });

  it("is ignored after the session already completed (R6.1)", () => {
    const out = step(litAtT0(), SNUFF, T0 + 26 * MIN);
    expect(out.phase).toBe("burned-out");
    expect(out.history).toHaveLength(1);
  });

  it("is ignored after the pause limit already passed (R6.1)", () => {
    const p = step(litAtT0(), PAUSE, T0 + 5 * MIN);
    const out = step(p, SNUFF, T0 + 5 * MIN + PAUSE_LIMIT_MS + 1000);
    expect(out.phase === "snuffed" && out.endedAt).toBe(T0 + 5 * MIN + PAUSE_LIMIT_MS);
  });

  it("is ignored in idle and in final phases", () => {
    expect(step(INITIAL_STATE, SNUFF, T0)).toBe(INITIAL_STATE);
    const s = step(litAtT0(), SNUFF, T0 + MIN);
    expect(step(s, SNUFF, T0 + 2 * MIN)).toBe(s);
  });
});

describe("step: hide, show and non-finite now", () => {
  it("returns the same reference for hide and show in every phase", () => {
    const states: State[] = [
      INITIAL_STATE,
      litAtT0(),
      step(litAtT0(), PAUSE, T0 + MIN),
      step(litAtT0(), TICK, T0 + 25 * MIN),
      step(litAtT0(), SNUFF, T0 + MIN),
    ];
    for (const s of states) {
      expect(step(s, HIDE, T0 + 50 * MIN)).toBe(s);
      expect(step(s, SHOW, T0 + 50 * MIN)).toBe(s);
    }
  });

  it("does not settle on hide or show", () => {
    const l = litAtT0();
    expect(step(l, HIDE, T0 + 90 * MIN)).toBe(l);
  });

  it("returns the same reference for a non-finite now", () => {
    const l = litAtT0();
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(step(l, TICK, bad)).toBe(l);
      expect(step(INITIAL_STATE, LIGHT(25), bad)).toBe(INITIAL_STATE);
    }
  });

  it("floors now to an integer", () => {
    const s = step(INITIAL_STATE, LIGHT(25), T0 + 0.9);
    expect(s.phase === "lit" && s.session.startedAt).toBe(T0);
  });
});

describe("step: reload", () => {
  it("settles the restored state at now", () => {
    const restored = litAtT0();
    const out = step(INITIAL_STATE, { type: "reload", state: restored }, T0 + 40 * MIN);
    expect(out.phase).toBe("burned-out");
    expect(out.phase === "burned-out" && out.endedAt).toBe(T0 + 25 * MIN);
    expect(out.history).toHaveLength(1);
  });

  it("carries on a running session as if the page had never closed", () => {
    const restored = litAtT0();
    const out = step(INITIAL_STATE, { type: "reload", state: restored }, T0 + 10 * MIN);
    expect(out).toBe(restored);
  });

  it("snuffs a pause that lapsed while the page was closed", () => {
    const p = step(litAtT0(), PAUSE, T0 + 5 * MIN);
    const out = step(INITIAL_STATE, { type: "reload", state: p }, T0 + 3 * 60 * MIN);
    expect(out.phase === "snuffed" && out.endedAt).toBe(T0 + 5 * MIN + PAUSE_LIMIT_MS);
  });
});

describe("step: totality and purity", () => {
  it("returns the state for an unknown event instead of throwing", () => {
    const l = litAtT0();
    const weird = { type: "explode" } as unknown as Event;
    expect(step(l, weird, T0 + MIN)).toBe(l);
  });

  it("does not mutate a frozen state or event", () => {
    const l = Object.freeze(litAtT0());
    const light = Object.freeze(LIGHT(25, "x"));
    expect(() => step(l, PAUSE, T0 + MIN)).not.toThrow();
    expect(() => step(INITIAL_STATE, light, T0)).not.toThrow();
    expect(() => step(l, TICK, T0 + 99 * MIN)).not.toThrow();
  });
});
