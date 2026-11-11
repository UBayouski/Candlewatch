// The settings document and its store (controls-and-access R11.1, R11.3 to R11.6; design 11.1).
// Pure apart from the `KeyValueStore` it is given. Reading never throws. The store follows the session and history adapter
// (./storage.ts): in memory without a store, try/catch on every read and write, and the unreadable text copied to a backup key
// before the first write over it.
import { MAX_LENGTH_MIN, MIN_LENGTH_MIN } from "../engine";
import type { KeyValueStore } from "./storage";

export interface Settings {
  /** "Sound on" means sound is allowed; nothing plays before the first user gesture. */
  readonly sound: boolean;
  /** Ghosts on or off. The distraction count is untouched by it. */
  readonly ghosts: boolean;
  /** Whole minutes, MIN_LENGTH_MIN to MAX_LENGTH_MIN. */
  readonly defaultLength: number;
}

export const DEFAULT_SETTINGS: Settings = { sound: true, ghosts: true, defaultLength: 25 };
export const SETTINGS_KEY = "candlewatch:settings";
/** Where unreadable settings text is copied before the first write over it (as for the session and history keys). */
export const SETTINGS_BACKUP_KEY = "candlewatch:settings:unreadable";
export const SETTINGS_SCHEMA_VERSION = 1;

export type SettingsReadStatus = "absent" | "ok" | "unreadable";

const isLength = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= MIN_LENGTH_MIN && n <= MAX_LENGTH_MIN;

/** One field at a time: a valid value is kept, anything else falls back to the default. */
function normalize(source: { readonly sound?: unknown; readonly ghosts?: unknown; readonly defaultLength?: unknown }): Settings {
  return {
    sound: typeof source.sound === "boolean" ? source.sound : DEFAULT_SETTINGS.sound,
    ghosts: typeof source.ghosts === "boolean" ? source.ghosts : DEFAULT_SETTINGS.ghosts,
    defaultLength: isLength(source.defaultLength) ? source.defaultLength : DEFAULT_SETTINGS.defaultLength,
  };
}

/**
 * Reads a stored text. `absent`: nothing stored. `unreadable`: text that is not JSON, not an object, or not version 1 (including a
 * newer version): the settings are the defaults and the text is worth keeping. `ok`: a version 1 object, each field read on its own.
 * Never throws.
 */
export function readSettings(text: string | null): { status: SettingsReadStatus; settings: Settings } {
  if (text === null) return { status: "absent", settings: DEFAULT_SETTINGS };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: "unreadable", settings: DEFAULT_SETTINGS };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { status: "unreadable", settings: DEFAULT_SETTINGS };
  const doc = parsed as Record<string, unknown>;
  if (doc["v"] !== SETTINGS_SCHEMA_VERSION) return { status: "unreadable", settings: DEFAULT_SETTINGS };
  const own = (key: string): unknown => (Object.prototype.hasOwnProperty.call(doc, key) ? doc[key] : undefined);
  return { status: "ok", settings: normalize({ sound: own("sound"), ghosts: own("ghosts"), defaultLength: own("defaultLength") }) };
}

/** The settings of a stored text, or the defaults. Never throws. */
export function parseSettings(text: string | null): Settings {
  return readSettings(text).settings;
}

/**
 * The document, with a fixed key order. A field that is not valid (a default length outside 5 to 90, a non-integer, a non-boolean)
 * is written as its default, so an invalid value is never stored.
 */
export function serializeSettings(settings: Settings): string {
  const s = normalize(settings);
  return JSON.stringify({ v: SETTINGS_SCHEMA_VERSION, sound: s.sound, ghosts: s.ghosts, defaultLength: s.defaultLength });
}

export interface SettingsStore {
  /** The stored settings, or the defaults. Never throws. */
  load(): Settings;
  /** Stores the settings at once. Never throws; without a working store they are kept in memory for the page's life. */
  save(settings: Settings): void;
}

export function createSettingsStore(kv: KeyValueStore | null): SettingsStore {
  /** What was last saved: what `load` returns when the store cannot be read, or could not be written. */
  let memory: Settings | null = null;
  let memoryWins = false;
  /** The unreadable raw text, to be copied before the first write to the key. */
  let pendingRaw: string | null = null;

  /** True when it is safe to write the key: nothing to back up, a backup already there (never overwritten), or one just made. */
  function backedUp(store: KeyValueStore): boolean {
    if (pendingRaw === null) return true;
    try {
      const existing = store.getItem(SETTINGS_BACKUP_KEY);
      if (existing === null || existing === "") store.setItem(SETTINGS_BACKUP_KEY, pendingRaw);
      pendingRaw = null;
      return true;
    } catch {
      return false;
    }
  }

  return {
    load(): Settings {
      if (kv === null || memoryWins) return memory ?? DEFAULT_SETTINGS;
      let raw: string | null;
      try {
        raw = kv.getItem(SETTINGS_KEY);
      } catch {
        return memory ?? DEFAULT_SETTINGS;
      }
      const read = readSettings(raw);
      pendingRaw = read.status === "unreadable" ? raw : null;
      memory = read.settings;
      return read.settings;
    },

    save(settings: Settings): void {
      memory = normalize(settings);
      if (kv === null) return;
      if (!backedUp(kv)) {
        memoryWins = true; // the original stays untouched; the new value lives in memory and the write is tried again next time
        return;
      }
      try {
        kv.setItem(SETTINGS_KEY, serializeSettings(memory));
        memoryWins = false;
      } catch {
        // Storage unavailable or full: the settings work for the rest of the page's life, in memory (R11.6).
        memoryWins = true;
      }
    },
  };
}
