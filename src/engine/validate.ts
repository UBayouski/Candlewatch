import {
  BREAK_MS,
  MAX_LENGTH_MIN,
  MIN_LENGTH_MIN,
  PAUSE_LIMIT_MS,
  SESSION_SCHEMA_VERSION,
} from "./constants";
import { completionAt, lengthMs } from "./time";
import type { HistoryEntry, LitState, Outcome, Session, State } from "./types";

/** Session documents written before distraction-tracking (no spans, no open hide). */
const LEGACY_SESSION_VERSION = 1;

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

/**
 * Validates the `session` object of a stored current-session document.
 * `legacy` is true for version 1 documents, which have no `awaySpansMs` (it means `[]`).
 * Rules: spans are non-negative safe integers, their number equals `distractions` and their sum equals `timeAwayMs`.
 */
export function parseSession(v: unknown, legacy: boolean): Session | null {
  if (!isRecord(v)) return null;
  const { startedAt, lengthMin, intent, pausedTotalMs, distractions, timeAwayMs } = v;
  const rawSpans = v["awaySpansMs"] === undefined && legacy ? [] : v["awaySpansMs"];
  if (!Array.isArray(rawSpans)) return null;
  const awaySpansMs: number[] = [];
  for (const span of rawSpans as unknown[]) {
    if (!isNonNegInt(span)) return null;
    awaySpansMs.push(span);
  }
  const spansSum = awaySpansMs.reduce((a, b) => a + b, 0);
  if (
    !isNonNegInt(startedAt) ||
    !isLength(lengthMin) ||
    !isIntent(intent) ||
    !isNonNegInt(pausedTotalMs) ||
    pausedTotalMs > PAUSE_LIMIT_MS ||
    !isNonNegInt(distractions) ||
    !isNonNegInt(timeAwayMs) ||
    awaySpansMs.length !== distractions ||
    !Number.isSafeInteger(spansSum) ||
    spansSum !== timeAwayMs
  ) {
    return null;
  }
  return { startedAt, lengthMin, intent, pausedTotalMs, distractions, timeAwayMs, awaySpansMs };
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
  if (!isRecord(doc)) return null;
  const version = doc["v"];
  if (version !== LEGACY_SESSION_VERSION && version !== SESSION_SCHEMA_VERSION) return null;
  const session = parseSession(doc["session"], version === LEGACY_SESSION_VERSION);
  if (session === null) return null;
  const base = session.startedAt + session.pausedTotalMs;

  // An open hide exists only while lit (distraction-tracking R7.3, R10.3).
  const rawAwaySince = doc["awaySince"];
  let awaySince: number | null = null;
  if (rawAwaySince !== undefined && rawAwaySince !== null) {
    if (doc["phase"] !== "lit" || !isNonNegInt(rawAwaySince)) return null;
    awaySince = rawAwaySince;
  }

  switch (doc["phase"]) {
    case "lit": {
      const litSince = doc["litSince"];
      if (!isNonNegInt(litSince) || litSince < base) return null;
      const state: LitState = { phase: "lit", history, session, litSince, awaySince };
      const completion = completionAt(state);
      if (litSince >= completion) return null;
      if (awaySince !== null && (awaySince < litSince || awaySince >= completion)) return null;
      return state;
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
