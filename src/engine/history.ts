import type { HistoryEntry, Outcome, Session } from "./types";

/** Builds the history entry for a session that ended at `endedAt` (R10.1). */
export function entryOf(session: Session, endedAt: number, outcome: Outcome): HistoryEntry {
  return {
    startedAt: session.startedAt,
    endedAt,
    lengthMin: session.lengthMin,
    intent: session.intent,
    outcome,
    distractions: session.distractions,
    timeAwayMs: session.timeAwayMs,
  };
}

/**
 * Appends an entry, oldest first. Idempotent on (startedAt, endedAt): when such
 * an entry already exists the same array is returned. Existing entries are
 * never edited or reordered (R10.2, R9.5).
 */
export function appendEntry(
  history: readonly HistoryEntry[],
  entry: HistoryEntry,
): readonly HistoryEntry[] {
  const exists = history.some((e) => e.startedAt === entry.startedAt && e.endedAt === entry.endedAt);
  return exists ? history : [...history, entry];
}
