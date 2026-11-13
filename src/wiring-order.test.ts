// A static scan of src/main.ts (sound-and-title task 13.1; design 3.9, D18, D31): the wiring order that no DOM-free test can run.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function mainSource(): string {
  const raw = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
  return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("main.ts wiring order", () => {
  it("arms the first-gesture listener before the interface exists", () => {
    const src = mainSource();
    const armed = src.indexOf("armFirstGesture(");
    const ui = src.indexOf("createInterface(");
    expect(armed).toBeGreaterThan(-1);
    expect(ui).toBeGreaterThan(-1);
    expect(armed).toBeLessThan(ui);
  });

  it("calls afterStep after storage.save, inside dispatch", () => {
    const src = mainSource();
    const saved = src.indexOf("storage.save(");
    const after = src.search(/\bafterStep\(/);
    expect(saved).toBeGreaterThan(-1);
    expect(after).toBeGreaterThan(-1);
    expect(after).toBeGreaterThan(saved);
  });

  it("does not choose a Cue itself", () => {
    expect(mainSource()).not.toMatch(/\bcueFor\(/);
  });

  it("reads the settings before the player and the dispatch use them", () => {
    const src = mainSource();
    const loaded = src.indexOf("settingsStore.load()");
    expect(loaded).toBeGreaterThan(-1);
    expect(loaded).toBeLessThan(src.indexOf("createAudioPlayer("));
    expect(loaded).toBeLessThan(src.indexOf("const dispatch"));
  });
});
