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
      v: 2,
      phase: "lit",
      session: {
        startedAt: T0,
        lengthMin: 25,
        intent: "write the report",
        pausedTotalMs: 0,
        distractions: 0,
        timeAwayMs: 0,
        awaySpansMs: [],
      },
      litSince: T0,
      awaySince: null,
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
      withDoc({ v: 3 }),
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

describe("session document version 2 (distraction-tracking)", () => {
  /** Lit at T0 with two completed distractions (30 s and 65 s) and an open hide. */
  const withGhosts = (): State => {
    let s = step(INITIAL_STATE, LIGHT(25, "write the report"), T0);
    s = step(s, { type: "hide" }, T0 + 1 * MIN);
    s = step(s, { type: "show" }, T0 + 1 * MIN + 30_000);
    s = step(s, { type: "hide" }, T0 + 3 * MIN);
    s = step(s, { type: "show" }, T0 + 3 * MIN + 65_000);
    return step(s, { type: "hide" }, T0 + 6 * MIN); // open
  };

  const doc = (s: State): Record<string, unknown> => JSON.parse(serializeSession(s) ?? "") as Record<string, unknown>;
  const text = (d: Record<string, unknown>): string => JSON.stringify(d);
  const withSession = (d: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> => ({
    ...d,
    session: { ...(d["session"] as Record<string, unknown>), ...over },
  });

  it("writes version 2 with the spans and, for lit, the open hide", () => {
    const d = doc(withGhosts());
    expect(d).toMatchObject({
      v: 2,
      phase: "lit",
      session: { distractions: 2, timeAwayMs: 95_000, awaySpansMs: [30_000, 65_000] },
      awaySince: T0 + 6 * MIN,
    });
  });

  it("round-trips a lit state with spans and an open hide", () => {
    const s = withGhosts();
    expect(restoreState(serializeSession(s), serializeHistory(s.history))).toStrictEqual(s);
  });

  it("round-trips spans through paused, burned-out and snuffed", () => {
    const base = withGhosts();
    const paused = step(base, { type: "pause" }, T0 + 7 * MIN); // closes and counts the open hide
    const burned = step(base, { type: "tick" }, T0 + 40 * MIN);
    const snuffed = step(base, { type: "snuff" }, T0 + 8 * MIN);
    for (const s of [paused, burned, snuffed]) {
      expect(s.phase === "idle" ? 0 : s.session.distractions).toBe(3);
      expect(roundTrip(s)).toStrictEqual(s);
      expect("awaySince" in doc(s)).toBe(false);
    }
  });

  it("keeps an open hide open across a reload that settles nothing", () => {
    const s = withGhosts();
    const out = step(INITIAL_STATE, { type: "reload", state: roundTrip(s) }, T0 + 10 * MIN);
    expect(out.phase === "lit" && out.awaySince).toBe(T0 + 6 * MIN);
    expect(out).toStrictEqual(s);
  });

  it("closes an open hide at the true completion instant when the reload finds the candle done", () => {
    const out = step(INITIAL_STATE, { type: "reload", state: roundTrip(withGhosts()) }, T0 + 90 * MIN);
    expect(out.phase).toBe("burned-out");
    expect(out.history[0]).toMatchObject({ distractions: 3, timeAwayMs: 95_000 + 19 * MIN });
  });

  describe("version 1 migration", () => {
    const lit = step(INITIAL_STATE, LIGHT(25, "x"), T0);
    const v1 = (s: State): string => {
      const d = doc(s);
      const session = { ...(d["session"] as Record<string, unknown>) };
      delete session["awaySpansMs"];
      const out: Record<string, unknown> = { ...d, v: 1, session };
      delete out["awaySince"];
      return text(out);
    };

    it("reads a version 1 lit document as a state with no spans and no open hide", () => {
      expect(restoreState(v1(lit), null)).toStrictEqual(lit);
    });

    it("reads version 1 paused, burned-out and snuffed documents", () => {
      const paused = step(lit, { type: "pause" }, T0 + 5 * MIN);
      const snuffed = step(lit, { type: "snuff" }, T0 + MIN);
      const burned = step(lit, { type: "tick" }, T0 + 25 * MIN);
      for (const s of [paused, snuffed, burned]) {
        expect(restoreState(v1(s), serializeHistory(s.history))).toStrictEqual(s);
      }
    });

    it("reports version 1 text as ok, and writes version 2 afterwards", () => {
      expect(readSession(v1(lit)).status).toBe("ok");
      expect(doc(restoreState(v1(lit), null))["v"]).toBe(2);
    });

    it("rejects a version 1 document that claims distractions it has no spans for", () => {
      const d = JSON.parse(v1(lit)) as Record<string, unknown>;
      const bad = text(withSession(d, { distractions: 1, timeAwayMs: 5000 }));
      expect(readSession(bad)).toEqual({ state: null, status: "unreadable" });
      expect(restoreState(bad, null)).toStrictEqual(INITIAL_STATE);
    });
  });

  describe("validation of the new fields", () => {
    const s = withGhosts();
    const d = doc(s);
    const paused = doc(step(s, { type: "pause" }, T0 + 7 * MIN));

    it("requires awaySpansMs in a version 2 document, even when there are no distractions", () => {
      const session = { ...(d["session"] as Record<string, unknown>) };
      delete session["awaySpansMs"];
      expect(readSession(text({ ...d, session })).status).toBe("unreadable");
      const none = doc(step(INITIAL_STATE, LIGHT(25), T0)); // zero distractions: [] and a missing list would otherwise agree
      const noneSession = { ...(none["session"] as Record<string, unknown>) };
      delete noneSession["awaySpansMs"];
      expect(readSession(text({ ...none, session: noneSession })).status).toBe("unreadable");
      expect(readSession(text({ ...none, v: 1, session: noneSession })).status).toBe("ok"); // version 1: absent means []
    });

    const bad: [string, Record<string, unknown>][] = [
      ["a negative span", withSession(d, { awaySpansMs: [30_000, -1], timeAwayMs: 29_999 })],
      ["a fractional span", withSession(d, { awaySpansMs: [30_000.5, 64_999.5] })],
      ["a non-number span", withSession(d, { awaySpansMs: ["30000", 65_000] })],
      ["spans that are not an array", withSession(d, { awaySpansMs: 95_000 })],
      ["a span count that differs from distractions", withSession(d, { distractions: 3 })],
      ["a span sum that differs from timeAwayMs", withSession(d, { timeAwayMs: 95_001 })],
      ["awaySince on a paused document", { ...paused, awaySince: T0 + 6 * MIN }],
      ["awaySince before litSince", { ...d, awaySince: T0 - 1 }],
      ["awaySince at the completion instant", { ...d, awaySince: T0 + 25 * MIN }],
      ["awaySince after the completion instant", { ...d, awaySince: T0 + 26 * MIN }],
      ["a non-integer awaySince", { ...d, awaySince: T0 + 6 * MIN + 0.5 }],
      ["a string awaySince", { ...d, awaySince: "soon" }],
    ];

    for (const [name, document] of bad) {
      it(`falls back to idle with the history intact for ${name}`, () => {
        const history = [entry()];
        expect(readSession(text(document))).toEqual({ state: null, status: "unreadable" });
        expect(() => restoreState(text(document), serializeHistory(history))).not.toThrow();
        expect(restoreState(text(document), serializeHistory(history))).toStrictEqual({ phase: "idle", history });
      });
    }

    it("accepts a missing or null awaySince on a lit document", () => {
      const noKey = { ...d };
      delete noKey["awaySince"];
      expect(readSession(text(noKey)).status).toBe("ok");
      expect(readSession(text({ ...d, awaySince: null })).status).toBe("ok");
    });

    it("accepts awaySince at litSince", () => {
      expect(readSession(text({ ...d, awaySince: d["litSince"] })).status).toBe("ok");
    });
  });
});
