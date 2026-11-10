import {
  BREAK_MS,
  MAX_LENGTH_MIN,
  MIN_LENGTH_MIN,
  PAUSE_LIMIT_MS,
  SCHEMA_VERSION,
} from "./constants";
import { completionAt, lengthMs } from "./time";
import type { HistoryEntry, LitState, Outcome, Session, State } from "./types";

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isNonNegInt(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}

function isLength(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= MIN_LENGTH_MIN && v <= MAX_LENGTH_MIN;
}

function isIntent(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

/** Validates the `session` object of a stored current-session document. */
export function parseSession(v: unknown): Session | null {
  if (!isRecord(v)) return null;
  const { startedAt, lengthMin, intent, pausedTotalMs, distractions, timeAwayMs } = v;
  if (
    !isNonNegInt(startedAt) ||
    !isLength(lengthMin) ||
    !isIntent(intent) ||
    !isNonNegInt(pausedTotalMs) ||
    pausedTotalMs > PAUSE_LIMIT_MS ||
    !isNonNegInt(distractions) ||
    !isNonNegInt(timeAwayMs)
  ) {
    return null;
  }
  return { startedAt, lengthMin, intent, pausedTotalMs, distractions, timeAwayMs };
}

function isOutcome(v: unknown): v is Outcome {
  return v === "burned-out" || v === "snuffed";
}

/** Validates one history entry. Returns a fresh object with the same values, or null. */
export function parseEntry(v: unknown): HistoryEntry | null {
  if (!isRecord(v)) return null;
  const { startedAt, endedAt, lengthMin, intent, outcome, distractions, timeAwayMs } = v;
  if (
    !isNonNegInt(startedAt) ||
    !isNonNegInt(endedAt) ||
    endedAt < startedAt ||
    !isLength(lengthMin) ||
    !isIntent(intent) ||
    !isOutcome(outcome) ||
    !isNonNegInt(distractions) ||
    !isNonNegInt(timeAwayMs)
  ) {
    return null;
  }
  return { startedAt, endedAt, lengthMin, intent, outcome, distractions, timeAwayMs };
}

/**
 * Validates a stored current-session document and builds the state, with the
 * given history. Checks the version, the fields and the per-phase consistency
 * (design 5.3). Returns null when anything fails.
 */
export function parseSessionDoc(doc: unknown, history: readonly HistoryEntry[]): State | null {
  if (!isRecord(doc) || doc["v"] !== SCHEMA_VERSION) return null;
  const session = parseSession(doc["session"]);
  if (session === null) return null;
  const base = session.startedAt + session.pausedTotalMs;

  switch (doc["phase"]) {
    case "lit": {
      const litSince = doc["litSince"];
      if (!isNonNegInt(litSince) || litSince < base) return null;
      const state: LitState = { phase: "lit", history, session, litSince };
      return litSince < completionAt(state) ? state : null;
    }
    case "paused": {
      const pausedAt = doc["pausedAt"];
      if (!isNonNegInt(pausedAt) || pausedAt < base) return null;
      if (pausedAt - base >= lengthMs(session)) return null;
      return { phase: "paused", history, session, pausedAt };
    }
    case "burned-out": {
      const endedAt = doc["endedAt"];
      const breakEndsAt = doc["breakEndsAt"];
      if (!isNonNegInt(endedAt) || endedAt < session.startedAt) return null;
      if (breakEndsAt !== endedAt + BREAK_MS) return null;
      return { phase: "burned-out", history, session, endedAt, breakEndsAt };
    }
    case "snuffed": {
      const endedAt = doc["endedAt"];
      if (!isNonNegInt(endedAt) || endedAt < session.startedAt) return null;
      return { phase: "snuffed", history, session, endedAt };
    }
    default:
      return null;
  }
}
