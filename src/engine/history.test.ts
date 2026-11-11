import { describe, expect, it } from "vitest";
import { appendEntry, entryOf } from "./history";
import type { Session } from "./types";

const session = (startedAt: number): Session => ({
  startedAt,
  lengthMin: 25,
  intent: "write the report",
  pausedTotalMs: 0,
  distractions: 0,
  timeAwayMs: 0,
  awaySpansMs: [],
});

describe("entryOf", () => {
  it("copies the session fields and adds end time and outcome", () => {
    expect(entryOf(session(1000), 5000, "snuffed")).toEqual({
      startedAt: 1000,
      endedAt: 5000,
      lengthMin: 25,
      intent: "write the report",
      outcome: "snuffed",
      distractions: 0,
      timeAwayMs: 0,
    });
  });
});

describe("appendEntry", () => {
  const a = entryOf(session(1000), 2000, "burned-out");
  const b = entryOf(session(3000), 4000, "snuffed");

  it("appends oldest first", () => {
    const h = appendEntry(appendEntry([], a), b);
    expect(h).toEqual([a, b]);
  });

  it("returns the same array for an entry that already exists", () => {
    const h = appendEntry([], a);
    expect(appendEntry(h, { ...a })).toBe(h);
  });

  it("keeps earlier entries as the same objects in the same positions", () => {
    const h1 = appendEntry([], a);
    const h2 = appendEntry(h1, b);
    expect(h2[0]).toBe(a);
    expect(h2[1]).toBe(b);
  });

  it("does not mutate its input", () => {
    const input = Object.freeze([a]);
    const out = appendEntry(input, b);
    expect(input).toEqual([a]);
    expect(out).not.toBe(input);
  });

  it("treats a different end time as a different entry", () => {
    const h = appendEntry([], a);
    expect(appendEntry(h, { ...a, endedAt: a.endedAt + 1 })).toHaveLength(2);
  });
});
