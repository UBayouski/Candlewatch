// sound-and-title R6 (design 3.5): the page title, one form per phase.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { INITIAL_STATE, step } from "../engine";
import type { State } from "../engine";
import { titleFor } from "./title";

const T0 = 1_800_000_000_000;
const MIN = 60_000;
const SEC = 1000;
const lit = step(INITIAL_STATE, { type: "light", length: 25 }, T0);
/** Lit at T0 with 12:31 left at `T0 + 12:29`. */
const AT_1231 = T0 + 12 * MIN + 29 * SEC;

describe("one form per phase (R6.1 to R6.5)", () => {
  it("idle is the product name, the same object as STRINGS.title", () => {
    expect(titleFor(INITIAL_STATE, T0)).toBe("Candlewatch");
  });

  it("lit shows the time left first", () => {
    expect(titleFor(lit, AT_1231)).toBe("12:31 · Candlewatch");
  });

  it("paused shows the time left at the pause, the word paused, and does not change while the pause lasts", () => {
    const paused = step(lit, { type: "pause" }, AT_1231);
    expect(titleFor(paused, AT_1231)).toBe("12:31 paused · Candlewatch");
    expect(titleFor(paused, AT_1231 + 4 * MIN)).toBe("12:31 paused · Candlewatch");
  });

  it("burned-out and snuffed show no time; a break and a finished dawn give one title", () => {
    const dawn = step(lit, { type: "tick" }, T0 + 25 * MIN);
    expect(dawn.phase).toBe("burned-out");
    expect(titleFor(dawn, T0 + 25 * MIN)).toBe("Morning · Candlewatch");
    expect(titleFor(dawn, T0 + 25 * MIN + 30 * MIN)).toBe("Morning · Candlewatch");
    expect(titleFor(step(lit, { type: "snuff" }, T0 + 7 * MIN), T0 + 8 * MIN)).toBe("Dark · Candlewatch");
  });
});

describe("edges", () => {
  it("a NaN or infinite now gives 00:00 while lit and does not throw", () => {
    for (const now of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => titleFor(lit, now)).not.toThrow();
      expect(titleFor(lit, now)).toBe("00:00 · Candlewatch");
    }
  });

  it("1 ms left reads 00:01, and 25 minutes exactly reads 25:00", () => {
    expect(titleFor(lit, T0 + 25 * MIN - 1)).toBe("00:01 · Candlewatch");
    expect(titleFor(lit, T0)).toBe("25:00 · Candlewatch");
  });

  it("never shows the intent, long or distinctive, in any phase", () => {
    const intent = "zq-marker-" + "w".repeat(70);
    const s = step(INITIAL_STATE, { type: "light", length: 25, intent }, T0);
    const states: State[] = [s, step(s, { type: "pause" }, T0 + MIN), step(s, { type: "tick" }, T0 + 25 * MIN), step(s, { type: "snuff" }, T0 + MIN)];
    for (const state of states) expect(titleFor(state, T0 + 2 * MIN)).not.toContain("zq-marker");
  });
});

describe("index.html (R6.16)", () => {
  it("holds <title>Candlewatch</title> exactly, the title before any script runs", () => {
    const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "index.html"), "utf8");
    expect(html).toContain("<title>Candlewatch</title>");
    expect(html.match(/<title>/g)).toHaveLength(1);
  });
});
