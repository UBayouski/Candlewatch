// Self-test of the FakeTimer (sound-and-title task 9.1).
import { describe, expect, it } from "vitest";
import { FakeTimer } from "./fake-timer";

describe("FakeTimer", () => {
  it("schedule returns incrementing ids and records the delay and the clock", () => {
    const t = new FakeTimer({ start: 100 });
    expect(t.schedule(() => undefined, 5)).toBe(1);
    expect(t.schedule(() => undefined, 7)).toBe(2);
    expect(t.scheduled).toEqual([
      { id: 1, ms: 5, at: 100 },
      { id: 2, ms: 7, at: 100 },
    ]);
    expect(t.live()).toBe(2);
    expect(t.nextDue()).toBe(105);
  });

  it("advance runs due timers in order with the clock at each due time, then reaches the target", () => {
    const t = new FakeTimer({ start: 0 });
    const log: [string, number][] = [];
    t.schedule(() => log.push(["b", t.clock()]), 20);
    t.schedule(() => log.push(["a", t.clock()]), 10);
    t.schedule(() => log.push(["c", t.clock()]), 20);
    t.advance(15);
    expect(log).toEqual([["a", 10]]);
    expect(t.clock()).toBe(15);
    t.advance(5);
    expect(log).toEqual([
      ["a", 10],
      ["b", 20],
      ["c", 20],
    ]);
    expect(t.live()).toBe(0);
  });

  it("a timer armed inside a callback runs in the same advance when it falls due", () => {
    const t = new FakeTimer();
    const at: number[] = [];
    const chain = (): void => {
      at.push(t.clock());
      if (at.length < 3) t.schedule(chain, 4);
    };
    t.schedule(chain, 4);
    t.advance(20);
    expect(at).toEqual([4, 8, 12]);
  });

  it("cancel removes a timer", () => {
    const t = new FakeTimer();
    let ran = false;
    const id = t.schedule(() => (ran = true), 5);
    t.cancel(id);
    t.advance(10);
    expect(ran).toBe(false);
    expect(t.live()).toBe(0);
    expect(t.cancelled).toEqual([id]);
  });

  it("with ignoreCancel a cancelled timer is not live but still runs", () => {
    const t = new FakeTimer({ ignoreCancel: true });
    let ran = false;
    const id = t.schedule(() => (ran = true), 5);
    t.cancel(id);
    expect(t.live()).toBe(0);
    expect(t.queued()).toBe(1);
    t.advance(5);
    expect(ran).toBe(true);
  });

  it("lateBy runs the next timer late and moves the clock there", () => {
    const t = new FakeTimer({ start: 1000 });
    let seen = 0;
    t.schedule(() => (seen = t.clock()), 1000);
    expect(t.lateBy(59_000)).toBe(true);
    expect(seen).toBe(61_000);
    expect(t.clock()).toBe(61_000);
    expect(t.lateBy(1)).toBe(false);
  });

  it("the clock is settable", () => {
    const t = new FakeTimer();
    t.setClock(42);
    expect(t.clock()).toBe(42);
  });
});
