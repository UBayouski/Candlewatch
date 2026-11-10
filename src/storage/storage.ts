import {
  INITIAL_STATE,
  readHistory,
  readSession,
  restoreState,
  serializeHistory,
  serializeSession,
} from "../engine";
import type { State } from "../engine";

/** The part of `localStorage` the adapter uses, so tests can supply a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SESSION_KEY = "candlewatch:session";
export const HISTORY_KEY = "candlewatch:history";
export const SESSION_BACKUP_KEY = "candlewatch:session:unreadable";
export const HISTORY_BACKUP_KEY = "candlewatch:history:unreadable";

export interface Storage {
  /** Reads both keys and rebuilds the state. Never throws. */
  load(): State;
  /** Writes what changed. Call only when `next !== prev`. Never throws. */
  save(prev: State | null, next: State): void;
}

/** `window.localStorage`, or null when it is missing or access throws (private mode, blocked). */
export function browserStore(): KeyValueStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

interface Pending {
  /** The unreadable raw text, to be copied before the first write to the key. */
  raw: string | null;
}

export function createStorage(kv: KeyValueStore | null): Storage {
  const pendingSession: Pending = { raw: null };
  const pendingHistory: Pending = { raw: null };

  function read(key: string): string | null {
    if (kv === null) return null;
    try {
      return kv.getItem(key);
    } catch {
      return null;
    }
  }

  /**
   * Makes sure unreadable raw text has been backed up (R11.4). Returns true when
   * it is safe to write the key: there was nothing to back up, a backup already
   * exists (never overwritten), or the backup was just written. Returns false
   * when the backup could not be written; the key must then be left untouched.
   */
  function backedUp(pending: Pending, backupKey: string): boolean {
    if (kv === null) return false;
    if (pending.raw === null) return true;
    try {
      const existing = kv.getItem(backupKey);
      if (existing === null || existing === "") kv.setItem(backupKey, pending.raw);
      pending.raw = null;
      return true;
    } catch {
      return false;
    }
  }

  function write(pending: Pending, backupKey: string, action: () => void): void {
    if (!backedUp(pending, backupKey)) return;
    try {
      action();
    } catch {
      // Storage unavailable or full: the app keeps working without persistence (R11.2).
    }
  }

  return {
    load(): State {
      if (kv === null) return INITIAL_STATE;
      const sessionRaw = read(SESSION_KEY);
      const historyRaw = read(HISTORY_KEY);
      pendingSession.raw = readSession(sessionRaw).status === "unreadable" ? sessionRaw : null;
      pendingHistory.raw = readHistory(historyRaw).status === "unreadable" ? historyRaw : null;
      return restoreState(sessionRaw, historyRaw);
    },

    save(prev: State | null, next: State): void {
      const store = kv;
      if (store === null) return;
      if (next.history !== prev?.history) {
        write(pendingHistory, HISTORY_BACKUP_KEY, () => {
          store.setItem(HISTORY_KEY, serializeHistory(next.history));
        });
      }
      write(pendingSession, SESSION_BACKUP_KEY, () => {
        const text = serializeSession(next);
        if (text === null) store.removeItem(SESSION_KEY);
        else store.setItem(SESSION_KEY, text);
      });
    },
  };
}
