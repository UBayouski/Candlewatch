import { SCHEMA_VERSION } from "./constants";
import { appendEntry, entryOf } from "./history";
import { isRecord, parseEntry, parseSessionDoc } from "./validate";
import type { HistoryEntry, Session, State } from "./types";

/** Verdict on a stored text: nothing there, a readable v1 document, or text that cannot be read. */
export type ReadStatus = "absent" | "ok" | "unreadable";

function isAbsent(json: string | null | undefined): json is null | undefined | "" {
  return json === null || json === undefined || json === "";
}

function tryParse(json: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(json) as unknown };
  } catch {
    return { ok: false };
  }
}

function sessionFields(s: Session): Session {
  return {
    startedAt: s.startedAt,
    lengthMin: s.lengthMin,
    intent: s.intent,
    pausedTotalMs: s.pausedTotalMs,
    distractions: s.distractions,
    timeAwayMs: s.timeAwayMs,
  };
}

/** Serializes the current session. Returns null for idle (the adapter removes the key). */
export function serializeSession(state: State): string | null {
  switch (state.phase) {
    case "idle":
      return null;
    case "lit":
      return JSON.stringify({
        v: SCHEMA_VERSION,
        phase: "lit",
        session: sessionFields(state.session),
        litSince: state.litSince,
      });
    case "paused":
      return JSON.stringify({
        v: SCHEMA_VERSION,
        phase: "paused",
        session: sessionFields(state.session),
        pausedAt: state.pausedAt,
      });
    case "burned-out":
      return JSON.stringify({
        v: SCHEMA_VERSION,
        phase: "burned-out",
        session: sessionFields(state.session),
        endedAt: state.endedAt,
        breakEndsAt: state.breakEndsAt,
      });
    case "snuffed":
      return JSON.stringify({
        v: SCHEMA_VERSION,
        phase: "snuffed",
        session: sessionFields(state.session),
        endedAt: state.endedAt,
      });
  }
}

export function serializeHistory(history: readonly HistoryEntry[]): string {
  return JSON.stringify({
    v: SCHEMA_VERSION,
    entries: history.map((e) => ({
      startedAt: e.startedAt,
      endedAt: e.endedAt,
      lengthMin: e.lengthMin,
      intent: e.intent,
      outcome: e.outcome,
      distractions: e.distractions,
      timeAwayMs: e.timeAwayMs,
    })),
  });
}

/**
 * Reads a stored history text. Never throws.
 * Invalid entries are dropped one by one; valid entries are kept unchanged and in order (R10.5).
 */
export function readHistory(json: string | null | undefined): {
  entries: HistoryEntry[];
  status: ReadStatus;
} {
  if (isAbsent(json)) return { entries: [], status: "absent" };
  const parsed = tryParse(json);
  if (!parsed.ok) return { entries: [], status: "unreadable" };
  const doc = parsed.value;
  if (!isRecord(doc) || doc["v"] !== SCHEMA_VERSION) return { entries: [], status: "unreadable" };
  const raw = doc["entries"];
  if (!Array.isArray(raw)) return { entries: [], status: "unreadable" };
  const entries: HistoryEntry[] = [];
  for (const item of raw as unknown[]) {
    const entry = parseEntry(item);
    if (entry !== null) entries.push(entry);
  }
  return { entries, status: "ok" };
}

export function parseHistory(json: string | null | undefined): HistoryEntry[] {
  return readHistory(json).entries;
}

function readSessionWith(
  json: string | null | undefined,
  history: readonly HistoryEntry[],
): { state: State | null; status: ReadStatus } {
  if (isAbsent(json)) return { state: null, status: "absent" };
  const parsed = tryParse(json);
  if (!parsed.ok) return { state: null, status: "unreadable" };
  const state = parseSessionDoc(parsed.value, history);
  return state === null ? { state: null, status: "unreadable" } : { state, status: "ok" };
}

/** Reads a stored current-session text. The returned state has an empty history. Never throws. */
export function readSession(json: string | null | undefined): {
  state: State | null;
  status: ReadStatus;
} {
  return readSessionWith(json, []);
}

/**
 * Rebuilds the state from the two stored texts. Never throws (R9.4, R10.5).
 * Anything unreadable falls back to idle and/or an empty history.
 * A restored final session whose history entry is missing (a crash between the
 * two writes) gets it added; the append is idempotent, so normally nothing changes (R9.5).
 */
export function restoreState(
  sessionJson: string | null | undefined,
  historyJson: string | null | undefined,
): State {
  const history = readHistory(historyJson).entries;
  const { state } = readSessionWith(sessionJson, history);
  if (state === null) return { phase: "idle", history };
  if (state.phase === "burned-out" || state.phase === "snuffed") {
    const repaired = appendEntry(history, entryOf(state.session, state.endedAt, state.phase));
    return repaired === history ? state : { ...state, history: repaired };
  }
  return state;
}
