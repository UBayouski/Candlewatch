// Unit tests of the title adapter (sound-and-title task 8.1, design 3.8).
import { describe, expect, it } from "vitest";
import { createTitleAdapter } from "./title-adapter";
import type { TitleTarget } from "./title-adapter";

/** A document stand-in that counts reads and writes and can be told to throw. */
function fakeDoc(initial: string) {
  let value = initial;
  const stats = { reads: 0, writes: [] as string[], throwOnRead: false, throwOnWrite: false };
  const doc: TitleTarget = {
    get title() {
      stats.reads++;
      if (stats.throwOnRead) throw new Error("read");
      return value;
    },
    set title(v: string) {
      if (stats.throwOnWrite) throw new Error("write");
      stats.writes.push(v);
      value = v;
    },
  };
  return { doc, stats, shown: () => value };
}

describe("createTitleAdapter (design 3.8)", () => {
  it("last() is null before the first write", () => {
    expect(createTitleAdapter(fakeDoc("Candlewatch").doc).last()).toBeNull();
  });

  it("a first write equal to the page's title does not write, and keeps it as known", () => {
    const d = fakeDoc("Candlewatch");
    const a = createTitleAdapter(d.doc);
    a.write("Candlewatch");
    expect(d.stats.writes).toEqual([]);
    expect(a.last()).toBe("Candlewatch");
  });

  it("the write count after a reload of a lit session is one (R6.14)", () => {
    const d = fakeDoc("Candlewatch");
    const a = createTitleAdapter(d.doc);
    a.write("12:31 · Candlewatch");
    expect(d.stats.writes).toEqual(["12:31 · Candlewatch"]);
  });

  it("equal writes are dropped and the document is read once, at the first write (R6.10)", () => {
    const d = fakeDoc("Candlewatch");
    const a = createTitleAdapter(d.doc);
    a.write("25:00 · Candlewatch");
    a.write("25:00 · Candlewatch");
    a.write("25:00 · Candlewatch");
    expect(d.stats.writes).toEqual(["25:00 · Candlewatch"]);
    expect(d.stats.reads).toBe(1);
  });

  it("a changed string writes", () => {
    const d = fakeDoc("Candlewatch");
    const a = createTitleAdapter(d.doc);
    a.write("25:00 · Candlewatch");
    a.write("24:59 · Candlewatch");
    a.write("24:59 paused · Candlewatch");
    expect(d.stats.writes).toEqual(["25:00 · Candlewatch", "24:59 · Candlewatch", "24:59 paused · Candlewatch"]);
    expect(d.shown()).toBe("24:59 paused · Candlewatch");
    expect(a.last()).toBe("24:59 paused · Candlewatch");
  });

  it("a throwing setter keeps known and the next call retries", () => {
    const d = fakeDoc("Candlewatch");
    const a = createTitleAdapter(d.doc);
    a.write("25:00 · Candlewatch");
    d.stats.throwOnWrite = true;
    expect(() => a.write("24:59 · Candlewatch")).not.toThrow();
    expect(a.last()).toBe("25:00 · Candlewatch");
    d.stats.throwOnWrite = false;
    a.write("24:59 · Candlewatch");
    expect(d.shown()).toBe("24:59 · Candlewatch");
    expect(a.last()).toBe("24:59 · Candlewatch");
  });

  it("a throwing getter at the first write keeps last() null and the next call retries", () => {
    const d = fakeDoc("Candlewatch");
    const a = createTitleAdapter(d.doc);
    d.stats.throwOnRead = true;
    expect(() => a.write("Dark · Candlewatch")).not.toThrow();
    expect(a.last()).toBeNull();
    d.stats.throwOnRead = false;
    a.write("Dark · Candlewatch");
    expect(d.stats.writes).toEqual(["Dark · Candlewatch"]);
  });

  it("a value that is not a string is ignored", () => {
    const d = fakeDoc("Candlewatch");
    const a = createTitleAdapter(d.doc);
    (a.write as (t: unknown) => void)(undefined);
    (a.write as (t: unknown) => void)(42);
    expect(d.stats.writes).toEqual([]);
    expect(a.last()).toBeNull();
  });
});
