import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  SETTINGS_BACKUP_KEY,
  SETTINGS_KEY,
  SETTINGS_SCHEMA_VERSION,
  createSettingsStore,
  parseSettings,
  readSettings,
  serializeSettings,
} from "./settings";
import type { Settings } from "./settings";
import type { KeyValueStore } from "./storage";

/** A fake localStorage that can be told to fail. */
class FakeStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  readonly writes: string[] = [];
  failGet = false;
  failSet: (key: string) => boolean = () => false;
  getItem(key: string): string | null {
    if (this.failGet) throw new Error("blocked");
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failSet(key)) throw new Error("quota");
    this.writes.push(key);
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const doc = (extra: Record<string, unknown> = {}): string => JSON.stringify({ v: 1, sound: false, ghosts: false, defaultLength: 40, ...extra });

describe("the settings document (R11.1, R11.4)", () => {
  it("has the defaults sound on, ghosts on, default length 25", () => {
    expect(DEFAULT_SETTINGS).toEqual({ sound: true, ghosts: true, defaultLength: 25 });
    expect(SETTINGS_KEY).toBe("candlewatch:settings");
    expect(SETTINGS_SCHEMA_VERSION).toBe(1);
  });

  it("writes one JSON object with a version and a fixed key order", () => {
    expect(serializeSettings({ sound: false, ghosts: true, defaultLength: 50 })).toBe('{"v":1,"sound":false,"ghosts":true,"defaultLength":50}');
  });

  it("reads back what it wrote", () => {
    const s: Settings = { sound: false, ghosts: true, defaultLength: 5 };
    expect(parseSettings(serializeSettings(s))).toEqual(s);
    expect(parseSettings(serializeSettings({ ...s, defaultLength: 90 })).defaultLength).toBe(90);
  });
});

describe("parseSettings falls back (R11.5)", () => {
  it("gives the defaults for no document, text that is not JSON, and JSON that is not an object", () => {
    for (const text of [null, "", "{", "not json", "null", "[]", "42", '"x"', "true"]) expect(parseSettings(text), String(text)).toEqual(DEFAULT_SETTINGS);
  });

  it("gives the defaults for a missing or wrong version", () => {
    for (const v of [undefined, 0, 2, "1", null, 1.5, true]) {
      expect(parseSettings(doc({ v })), String(v)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it("keeps each valid field and defaults only the others", () => {
    expect(parseSettings(doc({ sound: "yes" }))).toEqual({ sound: true, ghosts: false, defaultLength: 40 });
    expect(parseSettings(doc({ ghosts: 1 }))).toEqual({ sound: false, ghosts: true, defaultLength: 40 });
    expect(parseSettings(doc({ defaultLength: "oops" }))).toEqual({ sound: false, ghosts: false, defaultLength: 25 });
    expect(parseSettings(JSON.stringify({ v: 1 }))).toEqual(DEFAULT_SETTINGS);
  });

  it("defaults a default length that is not a whole number from 5 to 90", () => {
    for (const defaultLength of [4, 91, 0, -25, 25.5, "25", null, true, NaN, 1e9]) {
      expect(parseSettings(doc({ defaultLength })).defaultLength, String(defaultLength)).toBe(25);
    }
    for (const defaultLength of [5, 90, 15, 50]) expect(parseSettings(doc({ defaultLength })).defaultLength).toBe(defaultLength);
  });

  it("drops unknown fields", () => {
    const read = parseSettings(doc({ volume: 11, theme: "light", __proto__: { sound: true } }));
    expect(Object.keys(read).sort()).toEqual(["defaultLength", "ghosts", "sound"]);
    expect(read).toEqual({ sound: false, ghosts: false, defaultLength: 40 });
    expect(serializeSettings(read)).not.toContain("volume");
  });

  it("reads a newer version as defaults and calls it unreadable, so it can be kept", () => {
    expect(readSettings(doc({ v: 2 }))).toEqual({ status: "unreadable", settings: DEFAULT_SETTINGS });
    expect(readSettings(null).status).toBe("absent");
    expect(readSettings(doc()).status).toBe("ok");
    expect(readSettings(doc({ defaultLength: 3 })).status).toBe("ok"); // a field defaulted is not an unreadable document
  });

  it("never writes an invalid value", () => {
    const bad = { sound: "x", ghosts: 0, defaultLength: 4 } as unknown as Settings;
    expect(serializeSettings(bad)).toBe('{"v":1,"sound":true,"ghosts":true,"defaultLength":25}');
  });
});

describe("the store (R11.3, R11.6)", () => {
  it("loads the defaults from an empty store and saves at once", () => {
    const kv = new FakeStore();
    const store = createSettingsStore(kv);
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
    store.save({ sound: false, ghosts: true, defaultLength: 15 });
    expect(kv.data.get(SETTINGS_KEY)).toBe('{"v":1,"sound":false,"ghosts":true,"defaultLength":15}');
    expect(createSettingsStore(kv).load()).toEqual({ sound: false, ghosts: true, defaultLength: 15 });
  });

  it("works in memory when there is no store", () => {
    const store = createSettingsStore(null);
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
    store.save({ sound: false, ghosts: false, defaultLength: 50 });
    expect(store.load()).toEqual({ sound: false, ghosts: false, defaultLength: 50 });
  });

  it("does not throw when getItem and setItem throw, and keeps the settings in memory", () => {
    const kv = new FakeStore();
    kv.failGet = true;
    kv.failSet = () => true;
    const store = createSettingsStore(kv);
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
    expect(() => store.save({ sound: false, ghosts: true, defaultLength: 30 })).not.toThrow();
    expect(store.load()).toEqual({ sound: false, ghosts: true, defaultLength: 30 });
  });

  it("keeps the new value in memory when the write fails, then writes again on the next save", () => {
    const kv = new FakeStore();
    let full = true;
    kv.failSet = () => full;
    const store = createSettingsStore(kv);
    store.load();
    store.save({ sound: false, ghosts: true, defaultLength: 30 });
    expect(store.load().defaultLength).toBe(30);
    full = false;
    store.save({ sound: false, ghosts: true, defaultLength: 35 });
    expect(kv.data.get(SETTINGS_KEY)).toContain('"defaultLength":35');
    expect(store.load().defaultLength).toBe(35);
  });

  it("does not write anything on load", () => {
    const kv = new FakeStore();
    kv.data.set(SETTINGS_KEY, doc({ v: 3 }));
    createSettingsStore(kv).load();
    expect(kv.writes).toEqual([]);
  });
});

describe("unreadable settings (R11.5, the adapter's backup pattern)", () => {
  it("leaves a newer version alone until a setting changes, then copies it to the backup key first", () => {
    const kv = new FakeStore();
    const newer = doc({ v: 2, sound: false });
    kv.data.set(SETTINGS_KEY, newer);
    const store = createSettingsStore(kv);
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
    expect(kv.data.get(SETTINGS_KEY)).toBe(newer);
    expect(kv.data.has(SETTINGS_BACKUP_KEY)).toBe(false);
    store.save({ sound: false, ghosts: true, defaultLength: 25 });
    expect(kv.data.get(SETTINGS_BACKUP_KEY)).toBe(newer);
    expect(kv.writes).toEqual([SETTINGS_BACKUP_KEY, SETTINGS_KEY]);
    expect(parseSettings(kv.data.get(SETTINGS_KEY) ?? null).sound).toBe(false);
  });

  it("backs up text that is not JSON, once, and never overwrites an existing backup", () => {
    const kv = new FakeStore();
    kv.data.set(SETTINGS_KEY, "{broken");
    const store = createSettingsStore(kv);
    store.load();
    store.save({ sound: true, ghosts: true, defaultLength: 20 });
    store.save({ sound: true, ghosts: true, defaultLength: 21 });
    expect(kv.writes.filter((k) => k === SETTINGS_BACKUP_KEY)).toHaveLength(1);
    expect(kv.data.get(SETTINGS_BACKUP_KEY)).toBe("{broken");

    const kv2 = new FakeStore();
    kv2.data.set(SETTINGS_KEY, "also broken");
    kv2.data.set(SETTINGS_BACKUP_KEY, "older backup");
    const s2 = createSettingsStore(kv2);
    s2.load();
    s2.save({ sound: true, ghosts: true, defaultLength: 20 });
    expect(kv2.data.get(SETTINGS_BACKUP_KEY)).toBe("older backup");
    expect(kv2.data.get(SETTINGS_KEY)).toContain('"defaultLength":20');
  });

  it("leaves the original untouched when the backup cannot be written, and tries again on the next save", () => {
    const kv = new FakeStore();
    kv.data.set(SETTINGS_KEY, "{broken");
    let backupBlocked = true;
    kv.failSet = (key) => key === SETTINGS_BACKUP_KEY && backupBlocked;
    const store = createSettingsStore(kv);
    store.load();
    store.save({ sound: false, ghosts: true, defaultLength: 30 });
    expect(kv.data.get(SETTINGS_KEY)).toBe("{broken");
    expect(store.load().defaultLength).toBe(30); // in memory
    backupBlocked = false;
    store.save({ sound: false, ghosts: true, defaultLength: 31 });
    expect(kv.data.get(SETTINGS_BACKUP_KEY)).toBe("{broken");
    expect(kv.data.get(SETTINGS_KEY)).toContain('"defaultLength":31');
  });

  it("makes no backup for no document, a valid document, or a document with a field defaulted", () => {
    for (const text of [null, doc(), doc({ defaultLength: 3 }), doc({ sound: 5 })]) {
      const kv = new FakeStore();
      if (text !== null) kv.data.set(SETTINGS_KEY, text);
      const store = createSettingsStore(kv);
      store.load();
      store.save({ sound: true, ghosts: true, defaultLength: 25 });
      expect(kv.data.has(SETTINGS_BACKUP_KEY), String(text)).toBe(false);
    }
  });
});
