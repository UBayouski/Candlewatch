import { describe, expect, it } from "vitest";
import { BREAK_MS, MS_PER_MINUTE } from "./constants";
import {
  parseHistory,
  readHistory,
  readSession,
  restoreState,
  serializeHistory,
  serializeSession,
} from "./serialize";
import { step } from "./step";
import { INITIAL_STATE } from "./types";
import type { Event, HistoryEntry, State } from "./types";

const T0 = 1_800_000_000_000;
const MIN = MS_PER_MINUTE;
const LIGHT = (length: number, intent?: string): Event =>
  intent === undefined ? { type: "light", length } : { type: "light", length, intent };

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  startedAt: T0,
  endedAt: T0 + 25 * MIN,
  lengthMin: 25,
  intent: "write the report",
  outcome: "burned-out",
  distractions: 0,
  timeAwayMs: 0,
  ...over,
});

const roundTrip = (s: State): State => restoreState(serializeSession(s), serializeHistory(s.history));

describe("history serialization", () => {
  it("writes the documented versioned format", () => {
    const text = serializeHistory([entry({ intent: null })]);
    expect(JSON.parse(text)).toEqual({
      v: 1,
      entries: [
        {
          startedAt: T0,
          endedAt: T0 + 25 * MIN,
          lengthMin: 25,
          intent: null,
          outcome: "burned-out",
          distractions: 0,
          timeAwayMs: 0,
        },
      ],
    });
  });

  it("round-trips, including awkward intents", () => {
    const h = [
      entry({ intent: 'say "hi"' }),
      entry({ startedAt: T0 + 1, intent: "back\\slash" }),
      entry({ startedAt: T0 + 2, intent: "\u{1F600} \u65E5\u672C\u8A9E", outcome: "snuffed" }),
      entry({ startedAt: T0 + 3, intent: null }),
      entry({ startedAt: T0 + 4, intent: "lone \uD800 surrogate" }),
    ];
    expect(parseHistory(serializeHistory(h))).toStrictEqual(h);
  });

  it("round-trips an empty history", () => {
    expect(parseHistory(serializeHistory([]))).toStrictEqual([]);
  });
});

describe("readHistory status", () => {
  it("reports absent for null, undefined and empty text", () => {
    for (const j of [null, undefined, ""]) {
      expect(readHistory(j)).toEqual({ entries: [], status: "absent" });
    }
  });

  it("reports unreadable for invalid JSON, wrong or missing version, and no entries array", () => {
    for (const j of [
      "{",
      "not json",
      "null",
      "[]",
      "42",
      '{"v":2,"entries":[]}',
      '{"entries":[]}',
      '{"v":1}',
      '{"v":1,"entries":{}}',
      '{"v":"1","entries":[]}',
    ]) {
      expect(readHistory(j)).toEqual({ entries: [], status: "unreadable" });
    }
  });

  it("reports ok and drops only invalid entries, keeping valid ones intact and in order", () => {
    const a = entry();
    const b = entry({ startedAt: T0 + 100, endedAt: T0 + 200, outcome: "snuffed" });
    const text = JSON.stringify({
      v: 1,
      entries: [a, { nope: true }, 5, null, { ...a, lengthMin: 4 }, { ...a, endedAt: 0 }, { ...a, outcome: "x" }, b],
    });
    const out = readHistory(text);
    expect(out.status).toBe("ok");
    expect(out.entries).toStrictEqual([a, b]);
  });

  it("rejects non-integer and negative numbers in entries", () => {
    const bad = [
      { ...entry(), startedAt: 1.5 },
      { ...entry(), startedAt: -1 },
      { ...entry(), distractions: -1 },
      { ...entry(), timeAwayMs: 0.5 },
      { ...entry(), intent: 5 },
    ];
    expect(parseHistory(JSON.stringify({ v: 1, entries: bad }))).toEqual([]);
  });
});

describe("session serialization", () => {
  const lit = step(INITIAL_STATE, LIGHT(25, "write the report"), T0);

  it("returns null for idle", () => {
    expect(serializeSession(INITIAL_STATE)).toBeNull();
  });

  it("writes the documented lit format", () => {
    expect(JSON.parse(serializeSession(lit) ?? "")).toEqual({
      v: 1,
      phase: "lit",
      session: {
        startedAt: T0,
        lengthMin: 25,
        intent: "write the report",
        pausedTotalMs: 0,
        distractions: 0,
        timeAwayMs: 0,
      },
      litSince: T0,
    });
  });

  it("writes the phase-specific fields", () => {
    const paused = step(lit, { type: "pause" }, T0 + 5 * MIN);
    expect(JSON.parse(serializeSession(paused) ?? "")).toMatchObject({ phase: "paused", pausedAt: T0 + 5 * MIN });
    const burned = step(lit, { type: "tick" }, T0 + 25 * MIN);
    expect(JSON.parse(serializeSession(burned) ?? "")).toMatchObject({
      phase: "burned-out",
      endedAt: T0 + 25 * MIN,
      breakEndsAt: T0 + 25 * MIN + BREAK_MS,
    });
    const snuffed = step(lit, { type: "snuff" }, T0 + MIN);
    const doc = JSON.parse(serializeSession(snuffed) ?? "") as Record<string, unknown>;
    expect(doc).toMatchObject({ phase: "snuffed", endedAt: T0 + MIN });
    expect("breakEndsAt" in doc).toBe(false);
  });

  it("round-trips every phase with its history", () => {
    const paused = step(lit, { type: "pause" }, T0 + 5 * MIN);
    const resumed = step(paused, { type: "resume" }, T0 + 8 * MIN);
    const burned = step(lit, { type: "tick" }, T0 + 25 * MIN);
    const snuffed = step(lit, { type: "snuff" }, T0 + MIN);
    for (const s of [lit, paused, resumed, burned, snuffed]) {
      expect(roundTrip(s)).toStrictEqual(s);
    }
  });

  it("round-trips idle with a history", () => {
    const burned = step(lit, { type: "tick" }, T0 + 25 * MIN);
    const next = step(burned, LIGHT(15), T0 + 26 * MIN);
    const back = step(next, { type: "snuff" }, T0 + 27 * MIN);
    expect(back.history).toHaveLength(2);
    expect(roundTrip(back)).toStrictEqual(back);
    const idleWithHistory: State = { phase: "idle", history: back.history };
    expect(roundTrip(idleWithHistory)).toStrictEqual(idleWithHistory);
  });
});

describe("restoreState", () => {
  const lit = step(INITIAL_STATE, LIGHT(25, "x"), T0);
  const doc = JSON.parse(serializeSession(lit) ?? "") as Record<string, unknown>;
  const session = doc["session"] as Record<string, unknown>;
  const withDoc = (over: Record<string, unknown>): string => JSON.stringify({ ...doc, ...over });
  const withSession = (over: Record<string, unknown>): string =>
    JSON.stringify({ ...doc, session: { ...session, ...over } });

  it("falls back to idle with no history for missing text", () => {
    expect(restoreState(null, null)).toStrictEqual(INITIAL_STATE);
    expect(restoreState(undefined, undefined)).toStrictEqual(INITIAL_STATE);
    expect(restoreState("", "")).toStrictEqual(INITIAL_STATE);
  });

  it("falls back to idle for corrupt or inconsistent session text, without throwing", () => {
    const bad = [
      "{",
      "null",
      "[]",
      "123",
      withDoc({ v: 2 }),
      withDoc({ v: undefined }),
      withDoc({ phase: "dancing" }),
      withDoc({ phase: undefined }),
      withDoc({ litSince: "x" }),
      withDoc({ litSince: T0 - 1 }),
      withDoc({ litSince: T0 + 25 * MIN }),
      withDoc({ session: null }),
      withSession({ lengthMin: 4 }),
      withSession({ lengthMin: 25.5 }),
      withSession({ pausedTotalMs: 600_001 }),
      withSession({ startedAt: -1 }),
      withSession({ intent: 7 }),
      withDoc({ phase: "paused", litSince: undefined, pausedAt: T0 - 5 }),
      withDoc({ phase: "paused", litSince: undefined, pausedAt: T0 + 25 * MIN }),
      withDoc({ phase: "burned-out", litSince: undefined, endedAt: T0 + 25 * MIN, breakEndsAt: T0 }),
      withDoc({ phase: "burned-out", litSince: undefined, endedAt: T0 - 1, breakEndsAt: T0 - 1 + BREAK_MS }),
      withDoc({ phase: "snuffed", litSince: undefined, endedAt: T0 - 1 }),
    ];
    for (const text of bad) {
      expect(() => restoreState(text, null)).not.toThrow();
      expect(restoreState(text, null)).toStrictEqual(INITIAL_STATE);
    }
  });

  it("keeps the history when only the session is unreadable", () => {
    const h = [entry()];
    expect(restoreState("{", serializeHistory(h))).toStrictEqual({ phase: "idle", history: h });
  });

  it("restores a valid session when the history is unreadable, with an empty history", () => {
    const out = restoreState(serializeSession(lit), "{");
    expect(out.phase).toBe("lit");
    expect(out.history).toEqual([]);
  });

  it("ignores unknown extra properties", () => {
    const out = restoreState(withDoc({ extra: 1 }), null);
    expect(out).toStrictEqual(lit);
  });

  it("adds the history entry of a restored final session when it is missing, exactly once", () => {
    const burned = step(lit, { type: "tick" }, T0 + 25 * MIN);
    const sessionText = serializeSession(burned);
    const repaired = restoreState(sessionText, null);
    expect(repaired.history).toHaveLength(1);
    expect(repaired).toStrictEqual(burned);
    const again = restoreState(serializeSession(repaired), serializeHistory(repaired.history));
    expect(again.history).toHaveLength(1);
  });

  it("does not add a second entry when the history already has it", () => {
    const snuffed = step(lit, { type: "snuff" }, T0 + MIN);
    const out = restoreState(serializeSession(snuffed), serializeHistory(snuffed.history));
    expect(out.history).toHaveLength(1);
  });
});

describe("readSession status", () => {
  const lit = step(INITIAL_STATE, LIGHT(25), T0);

  it("reports absent, ok and unreadable", () => {
    expect(readSession(null)).toEqual({ state: null, status: "absent" });
    expect(readSession("")).toEqual({ state: null, status: "absent" });
    expect(readSession(serializeSession(lit))).toStrictEqual({ state: lit, status: "ok" });
    expect(readSession("{")).toEqual({ state: null, status: "unreadable" });
    expect(readSession('{"v":1,"phase":"lit"}')).toEqual({ state: null, status: "unreadable" });
    expect(readSession('{"v":9,"phase":"lit"}')).toEqual({ state: null, status: "unreadable" });
  });
});
