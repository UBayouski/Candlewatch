// Unit tests of the Hidden_Tick with the FakeTimer (sound-and-title task 9.2, design 3.7, D27).
import { describe, expect, it } from "vitest";
import { INITIAL_STATE, step } from "../engine";
import type { Event, State } from "../engine";
import { FakeTimer } from "./fake-timer";
import { createHiddenTick } from "./hidden-tick";
import type { HiddenTickDeps } from "./hidden-tick";
import { WAKE_MAX_MS } from "./wake";

const T0 = 1_700_000_000_000;
const MIN = 60_000;

/** A page with a lit session, hidden at `T0 + hideAfter`; dispatch runs the engine like main.ts. */
function setup(options: { length?: number; hideAfter?: number; ignoreCancel?: boolean; start?: State } = {}) {
  const lit = step(INITIAL_STATE, { type: "light", length: options.length ?? 25 }, T0);
  const hideAt = T0 + (options.hideAfter ?? 1000);
  const timer = new FakeTimer({ start: hideAt, ignoreCancel: options.ignoreCancel === true });
  let state: State = options.start ?? step(lit, { type: "hide" }, hideAt);
  const sent: { event: Event; now: number; clock: number }[] = [];
  const flags = { throwDispatch: false, throwGetState: false };
  const deps: HiddenTickDeps = {
    schedule: timer.schedule,
    cancel: timer.cancel,
    clock: timer.clock,
    dispatch: (event, now) => {
      sent.push({ event, now, clock: timer.clock() });
      state = step(state, event, now);
      if (flags.throwDispatch) throw new Error("sink");
    },
    getState: () => {
      if (flags.throwGetState) throw new Error("state");
      return state;
    },
  };
  const hidden = createHiddenTick(deps);
  return { timer, hidden, sent, flags, hideAt, state: () => state, setState: (s: State) => (state = s) };
}

describe("createHiddenTick (design 3.7)", () => {
  it("start after hide arms one timer at the wake delay", () => {
    const h = setup();
    h.hidden.start(h.hideAt);
    expect(h.timer.scheduled).toEqual([{ id: 1, ms: 1000, at: h.hideAt }]);
    expect(h.timer.live()).toBe(1);
    expect(h.hidden.isRunning()).toBe(true);
    expect(h.hidden.hasPending()).toBe(true);
  });

  it("the callback dispatches one tick with the clock when it runs, then re-arms", () => {
    const h = setup();
    h.hidden.start(h.hideAt);
    h.timer.advance(1000);
    expect(h.sent).toEqual([{ event: { type: "tick" }, now: h.hideAt + 1000, clock: h.hideAt + 1000 }]);
    expect(h.timer.scheduled.map((s) => s.ms)).toEqual([1000, 1000]);
    expect(h.timer.live()).toBe(1);
  });

  it("the delay shrinks to the time left, and the tick that finds the end stops the chain", () => {
    const h = setup({ length: 5, hideAfter: 5 * MIN - 2500 });
    h.hidden.start(h.hideAt);
    h.timer.advance(10_000);
    expect(h.timer.scheduled.map((s) => s.ms)).toEqual([1000, 1000, 500]);
    expect(h.sent.map((s) => s.now - T0)).toEqual([5 * MIN - 1500, 5 * MIN - 500, 5 * MIN]);
    expect(h.state().phase).toBe("burned-out");
    expect(h.hidden.isRunning()).toBe(false);
    expect(h.hidden.hasPending()).toBe(false);
    expect(h.timer.live()).toBe(0);
  });

  it("a paused session ticks until the pause allowance runs out", () => {
    const lit = step(INITIAL_STATE, { type: "light", length: 25 }, T0);
    const paused = step(lit, { type: "pause" }, T0 + MIN);
    const h = setup({ start: paused, hideAfter: MIN + 10 * MIN - 1200 });
    h.hidden.start(h.hideAt);
    h.timer.advance(5000);
    expect(h.timer.scheduled.map((s) => s.ms)).toEqual([1000, 200, 1]);
    expect(h.state().phase).toBe("snuffed");
    expect(h.hidden.isRunning()).toBe(false);
  });

  it("stop cancels the pending timer; stop twice and before start are safe", () => {
    const h = setup();
    h.hidden.stop();
    h.hidden.start(h.hideAt);
    h.hidden.stop();
    h.hidden.stop();
    expect(h.timer.cancelled).toEqual([1]);
    expect(h.timer.live()).toBe(0);
    h.timer.advance(5000);
    expect(h.sent).toEqual([]);
    expect(h.hidden.isRunning()).toBe(false);
  });

  it("a callback that runs after stop does nothing (a task already queued)", () => {
    const h = setup({ ignoreCancel: true });
    h.hidden.start(h.hideAt);
    h.hidden.stop();
    h.timer.advance(1000);
    expect(h.timer.runs).toBe(1);
    expect(h.sent).toEqual([]);
    expect(h.timer.scheduled).toHaveLength(1);
  });

  it("start twice arms once", () => {
    const h = setup();
    h.hidden.start(h.hideAt);
    h.hidden.start(h.hideAt);
    expect(h.timer.scheduled).toHaveLength(1);
  });

  it("start in idle, burned-out or snuffed arms nothing", () => {
    for (const start of [INITIAL_STATE, step(step(INITIAL_STATE, { type: "light", length: 5 }, T0), { type: "snuff" }, T0 + 1)]) {
      const h = setup({ start });
      h.hidden.start(h.hideAt);
      expect(h.timer.scheduled).toEqual([]);
      expect(h.hidden.isRunning()).toBe(false);
    }
  });

  it("a throwing dispatch is swallowed and the next timer is still armed at the Wake_Delay (D27)", () => {
    const h = setup({ length: 5, hideAfter: 5 * MIN - 1500 });
    h.flags.throwDispatch = true;
    h.hidden.start(h.hideAt);
    expect(() => h.timer.advance(1000)).not.toThrow();
    expect(h.timer.scheduled.map((s) => s.ms)).toEqual([1000, 500]);
    expect(h.hidden.isRunning()).toBe(true);
  });

  it("a throwing getState arms the next timer at exactly WAKE_MAX_MS", () => {
    const h = setup({ length: 5, hideAfter: 5 * MIN - 1500 });
    h.hidden.start(h.hideAt);
    h.flags.throwGetState = true;
    h.timer.advance(1000);
    expect(h.timer.scheduled.map((s) => s.ms)).toEqual([1000, WAKE_MAX_MS]);
    h.timer.advance(1000);
    expect(h.timer.scheduled.map((s) => s.ms)).toEqual([1000, WAKE_MAX_MS, WAKE_MAX_MS]);
    // The session burned out on the way; once the state reads again, the chain ends.
    h.flags.throwGetState = false;
    h.timer.advance(1000);
    expect(h.hidden.isRunning()).toBe(false);
    expect(h.timer.live()).toBe(0);
  });

  it("a late timer dispatches with the later now (throttling)", () => {
    const h = setup();
    h.hidden.start(h.hideAt);
    h.timer.lateBy(59_000);
    expect(h.sent.map((s) => s.now)).toEqual([h.hideAt + 60_000]);
  });

  it("an early timer re-arms with a shorter delay", () => {
    const lit = step(INITIAL_STATE, { type: "light", length: 5 }, T0);
    const hideAt = T0 + 5 * MIN - 1000;
    let state: State = step(lit, { type: "hide" }, hideAt);
    let now = hideAt;
    const armed: { fn: () => void; ms: number }[] = [];
    const hidden = createHiddenTick({
      schedule: (fn, ms) => armed.push({ fn, ms }),
      cancel: () => undefined,
      clock: () => now,
      dispatch: (event, at) => (state = step(state, event, at)),
      getState: () => state,
    });
    hidden.start(hideAt);
    expect(armed.map((a) => a.ms)).toEqual([1000]);
    now = hideAt + 700; // 300 ms early
    armed[0]?.fn();
    expect(state.phase).toBe("lit");
    expect(armed.map((a) => a.ms)).toEqual([1000, 300]);
  });

  it("only tick is ever sent", () => {
    const h = setup({ length: 5 });
    h.hidden.start(h.hideAt);
    h.timer.advance(10 * MIN);
    expect(h.sent.length).toBeGreaterThan(0);
    expect(h.sent.every((s) => s.event.type === "tick")).toBe(true);
  });
});
