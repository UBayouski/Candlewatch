import { describe, expect, it } from "vitest";
import { closeHide, openHide } from "./distraction";
import type { LitState } from "./types";

const T0 = 1_800_000_000_000;

const lit = (over: Partial<LitState> = {}): LitState => ({
  phase: "lit",
  history: [],
  litSince: T0,
  awaySince: null,
  session: {
    startedAt: T0,
    lengthMin: 25,
    intent: "write the report",
    pausedTotalMs: 120_000,
    distractions: 0,
    timeAwayMs: 0,
    awaySpansMs: [],
  },
  ...over,
});

describe("openHide", () => {
  it("opens at the given instant", () => {
    expect(openHide(lit(), T0 + 5000).awaySince).toBe(T0 + 5000);
  });

  it("clamps to litSince when the clock moved backwards", () => {
    expect(openHide(lit({ litSince: T0 + 10_000 }), T0 + 2000).awaySince).toBe(T0 + 10_000);
  });

  it("returns the same state when a hide is already open", () => {
    const open = openHide(lit(), T0 + 5000);
    expect(openHide(open, T0 + 9000)).toBe(open);
    expect(open.awaySince).toBe(T0 + 5000);
  });

  it("does not count anything yet", () => {
    const s = openHide(lit(), T0 + 5000);
    expect(s.session.distractions).toBe(0);
    expect(s.session.timeAwayMs).toBe(0);
    expect(s.session.awaySpansMs).toEqual([]);
  });
});

describe("closeHide", () => {
  const open = (at = T0 + 5000): LitState => openHide(lit(), at);

  it("returns the same state when no hide is open", () => {
    const s = lit();
    expect(closeHide(s, T0 + 9000)).toBe(s);
  });

  it("counts one distraction with its span, appends it and clears the open hide", () => {
    const s = closeHide(open(), T0 + 35_000);
    expect(s.awaySince).toBeNull();
    expect(s.session.distractions).toBe(1);
    expect(s.session.timeAwayMs).toBe(30_000);
    expect(s.session.awaySpansMs).toEqual([30_000]);
  });

  it("adds to earlier distractions in order", () => {
    const first = closeHide(open(T0 + 1000), T0 + 4000); // span 3000
    const second = closeHide(openHide(first, T0 + 10_000), T0 + 17_000); // span 7000
    expect(second.session.distractions).toBe(2);
    expect(second.session.timeAwayMs).toBe(10_000);
    expect(second.session.awaySpansMs).toEqual([3000, 7000]);
  });

  it("gives span 0 when the close is earlier than the open instant", () => {
    const s = closeHide(open(T0 + 20_000), T0 + 1000);
    expect(s.session.awaySpansMs).toEqual([0]);
    expect(s.session.timeAwayMs).toBe(0);
    expect(s.session.distractions).toBe(1);
  });

  it("counts a hide and show in the same millisecond, span 0", () => {
    const s = closeHide(open(T0 + 7000), T0 + 7000);
    expect(s.session.distractions).toBe(1);
    expect(s.session.awaySpansMs).toEqual([0]);
  });
});

describe("neither function touches a timer field", () => {
  const timerOf = (s: LitState) => ({
    startedAt: s.session.startedAt,
    lengthMin: s.session.lengthMin,
    intent: s.session.intent,
    pausedTotalMs: s.session.pausedTotalMs,
    litSince: s.litSince,
    phase: s.phase,
    history: s.history,
  });

  it("leaves startedAt, length, pause total, litSince, phase and history as they were", () => {
    const before = lit();
    const opened = openHide(before, T0 + 5000);
    const closed = closeHide(opened, T0 + 9000);
    expect(timerOf(opened)).toStrictEqual(timerOf(before));
    expect(timerOf(closed)).toStrictEqual(timerOf(before));
    expect(closed.history).toBe(before.history);
  });

  it("does not mutate its input", () => {
    const frozenSession = Object.freeze({ ...lit().session, awaySpansMs: Object.freeze([]) });
    const s = Object.freeze(lit({ session: frozenSession }));
    const opened = openHide(s, T0 + 5000);
    expect(() => closeHide(Object.freeze(opened), T0 + 9000)).not.toThrow();
    expect(s.awaySince).toBeNull();
    expect(s.session.awaySpansMs).toEqual([]);
  });
});
