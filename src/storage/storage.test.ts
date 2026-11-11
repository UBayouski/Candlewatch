import { describe, expect, it } from "vitest";
import {
  INITIAL_STATE,
  MS_PER_MINUTE,
  serializeHistory,
  serializeSession,
  step,
} from "../engine";
import type { State } from "../engine";
import {
  HISTORY_BACKUP_KEY,
  HISTORY_KEY,
  SESSION_BACKUP_KEY,
  SESSION_KEY,
  createStorage,
} from "./storage";
import type { KeyValueStore } from "./storage";

const T0 = 1_800_000_000_000;
const MIN = MS_PER_MINUTE;

interface FakeOptions {
  initial?: Record<string, string>;
  throwOnGet?: (key: string) => boolean;
  throwOnSet?: (key: string) => boolean;
  throwOnRemove?: boolean;
}

function fakeStore(opts: FakeOptions = {}) {
  const data = new Map<string, string>(Object.entries(opts.initial ?? {}));
  const log: string[] = [];
  const store: KeyValueStore = {
    getItem(key) {
      log.push(`get ${key}`);
      if (opts.throwOnGet?.(key)) throw new Error("get failed");
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      log.push(`set ${key}`);
      if (opts.throwOnSet?.(key)) throw new DOMException("quota", "QuotaExceededError");
      data.set(key, value);
    },
    removeItem(key) {
      log.push(`remove ${key}`);
      if (opts.throwOnRemove) throw new Error("remove failed");
      data.delete(key);
    },
  };
  return { store, data, log };
}

const lit = (): State => step(INITIAL_STATE, { type: "light", length: 25, intent: "x" }, T0);
const burned = (): State => step(lit(), { type: "tick" }, T0 + 25 * MIN);
const snuffed = (): State => step(lit(), { type: "snuff" }, T0 + MIN);

describe("storage: round trip", () => {
  it("loads idle from an empty store", () => {
    const { store } = fakeStore();
    expect(createStorage(store).load()).toStrictEqual(INITIAL_STATE);
  });

  it("saves and loads a running session", () => {
    const { store } = fakeStore();
    const s = lit();
    createStorage(store).save(INITIAL_STATE, s);
    expect(createStorage(store).load()).toStrictEqual(s);
  });

  it("saves and loads a burned-out session with its history and break window", () => {
    const { store } = fakeStore();
    const b = burned();
    createStorage(store).save(lit(), b);
    expect(createStorage(store).load()).toStrictEqual(b);
  });

  it("removes the session key when the state is idle", () => {
    const { store, data } = fakeStore({ initial: { [SESSION_KEY]: serializeSession(lit()) ?? "" } });
    createStorage(store).save(lit(), INITIAL_STATE);
    expect(data.has(SESSION_KEY)).toBe(false);
  });

  it("writes the history key only when the history reference changed", () => {
    const { store, log } = fakeStore();
    const storage = createStorage(store);
    const s = lit();
    storage.save(INITIAL_STATE, s);
    expect(log).not.toContain(`set ${HISTORY_KEY}`);
    storage.save(s, step(s, { type: "pause" }, T0 + MIN));
    expect(log).not.toContain(`set ${HISTORY_KEY}`);
    storage.save(s, burned());
    expect(log).toContain(`set ${HISTORY_KEY}`);
  });

  it("writes history before the session", () => {
    const { store, log } = fakeStore();
    createStorage(store).save(lit(), burned());
    expect(log.indexOf(`set ${HISTORY_KEY}`)).toBeLessThan(log.indexOf(`set ${SESSION_KEY}`));
  });
});

describe("storage: unavailable or failing store", () => {
  it("works with a null store: load gives idle and save does nothing", () => {
    const storage = createStorage(null);
    expect(storage.load()).toStrictEqual(INITIAL_STATE);
    expect(() => storage.save(null, lit())).not.toThrow();
  });

  it("does not throw when getItem throws; load gives idle", () => {
    const { store } = fakeStore({ throwOnGet: () => true });
    const storage = createStorage(store);
    expect(storage.load()).toStrictEqual(INITIAL_STATE);
  });

  it("does not throw when setItem throws a quota error", () => {
    const { store } = fakeStore({ throwOnSet: () => true });
    expect(() => createStorage(store).save(null, burned())).not.toThrow();
  });

  it("does not throw when removeItem throws", () => {
    const { store } = fakeStore({ throwOnRemove: true });
    expect(() => createStorage(store).save(lit(), INITIAL_STATE)).not.toThrow();
  });

  it("still writes the session when the history write fails", () => {
    const { store, data } = fakeStore({ throwOnSet: (k) => k === HISTORY_KEY });
    createStorage(store).save(lit(), burned());
    expect(data.has(SESSION_KEY)).toBe(true);
  });
});

describe("storage: unreadable history (R11.4)", () => {
  const unreadableHistories = [
    ["invalid JSON", "{not json"],
    ["wrong version", '{"v":9,"entries":[]}'],
    ["missing version", '{"entries":[]}'],
    ["no entries array", '{"v":1}'],
  ] as const;

  for (const [name, raw] of unreadableHistories) {
    it(`copies ${name} unchanged to the backup key before the first history write`, () => {
      const { store, data, log } = fakeStore({ initial: { [HISTORY_KEY]: raw } });
      const storage = createStorage(store);
      const loaded = storage.load();
      expect(loaded.history).toEqual([]);
      storage.save(loaded, burned());
      expect(data.get(HISTORY_BACKUP_KEY)).toBe(raw);
      expect(log.indexOf(`set ${HISTORY_BACKUP_KEY}`)).toBeGreaterThanOrEqual(0);
      expect(log.indexOf(`set ${HISTORY_BACKUP_KEY}`)).toBeLessThan(log.indexOf(`set ${HISTORY_KEY}`));
      expect(data.get(HISTORY_KEY)).toBe(serializeHistory(burned().history));
    });
  }

  it("writes the backup once: a second history write does not copy again", () => {
    const { store, log } = fakeStore({ initial: { [HISTORY_KEY]: "{oops" } });
    const storage = createStorage(store);
    const loaded = storage.load();
    storage.save(loaded, burned());
    storage.save(burned(), snuffed());
    expect(log.filter((l) => l === `set ${HISTORY_BACKUP_KEY}`)).toHaveLength(1);
    expect(log.filter((l) => l === `get ${HISTORY_BACKUP_KEY}`)).toHaveLength(1);
  });

  it("does not overwrite an existing backup, and the write still goes ahead", () => {
    const { store, data, log } = fakeStore({
      initial: { [HISTORY_KEY]: "{newer", [HISTORY_BACKUP_KEY]: "older backup" },
    });
    const storage = createStorage(store);
    storage.save(storage.load(), burned());
    expect(data.get(HISTORY_BACKUP_KEY)).toBe("older backup");
    expect(log).not.toContain(`set ${HISTORY_BACKUP_KEY}`);
    expect(data.get(HISTORY_KEY)).toBe(serializeHistory(burned().history));
  });

  it("leaves the original untouched when the backup write fails, and retries on the next save", () => {
    let failing = true;
    const { store, data, log } = fakeStore({
      initial: { [HISTORY_KEY]: "{oops" },
      throwOnSet: (k) => failing && k === HISTORY_BACKUP_KEY,
    });
    const storage = createStorage(store);
    const loaded = storage.load();
    storage.save(loaded, burned());
    expect(data.get(HISTORY_KEY)).toBe("{oops");
    expect(data.has(HISTORY_BACKUP_KEY)).toBe(false);
    failing = false;
    storage.save(burned(), snuffed());
    expect(data.get(HISTORY_BACKUP_KEY)).toBe("{oops");
    expect(data.get(HISTORY_KEY)).toBe(serializeHistory(snuffed().history));
    expect(log.filter((l) => l === `set ${HISTORY_BACKUP_KEY}`)).toHaveLength(2);
  });

  it("still writes the session key when only the history backup failed", () => {
    const { store, data } = fakeStore({
      initial: { [HISTORY_KEY]: "{oops" },
      throwOnSet: (k) => k === HISTORY_BACKUP_KEY,
    });
    const storage = createStorage(store);
    storage.save(storage.load(), burned());
    expect(data.get(SESSION_KEY)).toBe(serializeSession(burned()));
  });
});

describe("storage: unreadable session (R11.4)", () => {
  it("copies unreadable session text to its backup key before the first session write", () => {
    const raw = '{"v":1,"phase":"lit"}';
    const { store, data, log } = fakeStore({ initial: { [SESSION_KEY]: raw } });
    const storage = createStorage(store);
    const loaded = storage.load();
    expect(loaded).toStrictEqual(INITIAL_STATE);
    storage.save(loaded, lit());
    expect(data.get(SESSION_BACKUP_KEY)).toBe(raw);
    expect(log.indexOf(`set ${SESSION_BACKUP_KEY}`)).toBeLessThan(log.indexOf(`set ${SESSION_KEY}`));
    expect(data.get(SESSION_KEY)).toBe(serializeSession(lit()));
  });

  it("backs up before the removeItem used for idle", () => {
    const raw = "garbage";
    const { store, data, log } = fakeStore({ initial: { [SESSION_KEY]: raw } });
    const storage = createStorage(store);
    const loaded = storage.load();
    storage.save(loaded, { ...INITIAL_STATE });
    expect(data.get(SESSION_BACKUP_KEY)).toBe(raw);
    expect(log.indexOf(`set ${SESSION_BACKUP_KEY}`)).toBeLessThan(log.indexOf(`remove ${SESSION_KEY}`));
  });

  it("leaves the session text untouched when its backup write fails", () => {
    const { store, data } = fakeStore({
      initial: { [SESSION_KEY]: "garbage" },
      throwOnSet: (k) => k === SESSION_BACKUP_KEY,
    });
    const storage = createStorage(store);
    storage.save(storage.load(), lit());
    expect(data.get(SESSION_KEY)).toBe("garbage");
  });

  it("does not overwrite an existing session backup", () => {
    const { store, data } = fakeStore({
      initial: { [SESSION_KEY]: "garbage", [SESSION_BACKUP_KEY]: "kept" },
    });
    const storage = createStorage(store);
    storage.save(storage.load(), lit());
    expect(data.get(SESSION_BACKUP_KEY)).toBe("kept");
    expect(data.get(SESSION_KEY)).toBe(serializeSession(lit()));
  });
});

describe("storage: readable or absent text makes no backup", () => {
  it("absent text: no backup keys are read or written", () => {
    const { store, log } = fakeStore();
    const storage = createStorage(store);
    storage.save(storage.load(), burned());
    expect(log.some((l) => l.includes("unreadable"))).toBe(false);
  });

  it("valid text: no backup", () => {
    const b = burned();
    const { store, log } = fakeStore({
      initial: { [SESSION_KEY]: serializeSession(b) ?? "", [HISTORY_KEY]: serializeHistory(b.history) },
    });
    const storage = createStorage(store);
    const loaded = storage.load();
    expect(loaded).toStrictEqual(b);
    storage.save(loaded, step(b, { type: "light", length: 15 }, T0 + 30 * MIN));
    expect(log.some((l) => l.includes("unreadable"))).toBe(false);
  });

  it("a history document with some invalid entries dropped is readable: no backup", () => {
    const entry = burned().history[0];
    const raw = JSON.stringify({ v: 1, entries: [entry, { nope: 1 }] });
    const { store, log } = fakeStore({ initial: { [HISTORY_KEY]: raw } });
    const storage = createStorage(store);
    const loaded = storage.load();
    expect(loaded.history).toHaveLength(1);
    storage.save(loaded, burned());
    expect(log.some((l) => l.includes("unreadable"))).toBe(false);
  });
});

describe("storage: session document version 2 (distraction-tracking)", () => {
  it("backs up a session text that is unreadable under the version 2 rules before the first session write", () => {
    const doc = JSON.parse(serializeSession(lit()) ?? "") as { session: Record<string, unknown> };
    const raw = JSON.stringify({ ...doc, session: { ...doc.session, distractions: 2, awaySpansMs: [1000] } });
    const { store, data, log } = fakeStore({ initial: { [SESSION_KEY]: raw } });
    const storage = createStorage(store);
    const loaded = storage.load();
    expect(loaded).toStrictEqual(INITIAL_STATE);
    storage.save(loaded, lit());
    expect(data.get(SESSION_BACKUP_KEY)).toBe(raw);
    expect(log.indexOf(`set ${SESSION_BACKUP_KEY}`)).toBeLessThan(log.indexOf(`set ${SESSION_KEY}`));
    expect(data.get(SESSION_KEY)).toBe(serializeSession(lit()));
  });

  it("saves and loads a lit session with spans and an open hide", () => {
    const { store } = fakeStore();
    let s = step(lit(), { type: "hide" }, T0 + MIN);
    s = step(s, { type: "show" }, T0 + 2 * MIN);
    s = step(s, { type: "hide" }, T0 + 4 * MIN); // still open
    createStorage(store).save(lit(), s);
    expect(createStorage(store).load()).toStrictEqual(s);
  });

  it("loads a version 1 session text without a backup", () => {
    const l = lit();
    const doc = JSON.parse(serializeSession(l) ?? "") as { v: number; session: Record<string, unknown> };
    delete doc.session["awaySpansMs"];
    const v1 = JSON.stringify({ ...doc, v: 1, awaySince: undefined });
    const { store, log } = fakeStore({ initial: { [SESSION_KEY]: v1 } });
    const storage = createStorage(store);
    const loaded = storage.load();
    expect(loaded).toStrictEqual(l);
    storage.save(loaded, step(l, { type: "pause" }, T0 + MIN));
    expect(log.some((entry) => entry.includes("unreadable"))).toBe(false);
  });
});
