import { describe, expect, it } from "vitest";
import { STRINGS } from "./strings";
import type { FlameMode } from "./scene/types";

describe("placeholder", () => {
  it("has the tagline", () => {
    expect(STRINGS.tagline).toBe("Keep the candle lit.");
  });
});

describe("scene accessible names (candle-scene R12)", () => {
  const modes: readonly FlameMode[] = ["unlit", "steady", "paused", "guttering", "smoke"];

  it("has one non-empty name for every flame mode, and no other keys", () => {
    expect(Object.keys(STRINGS.scene).sort()).toEqual([...modes].sort());
    for (const mode of modes) expect(STRINGS.scene[mode].length).toBeGreaterThan(0);
  });

  it("names the flame in words, with no digits, so the time can never be in the label", () => {
    for (const mode of modes) expect(STRINGS.scene[mode]).not.toMatch(/\d/);
  });

  it("gives each mode a different name", () => {
    expect(new Set(modes.map((m) => STRINGS.scene[m])).size).toBe(modes.length);
  });

  it("never uses the trademarked word", () => {
    for (const mode of modes) expect(STRINGS.scene[mode].toLowerCase()).not.toContain("pomodoro");
  });
});

describe("ghosts-and-graveyard strings (CR-ST)", () => {
  const groups = [STRINGS.count, STRINGS.ghosts, STRINGS.graveyard];

  const collect = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(collect);
    if (value !== null && typeof value === "object") return Object.values(value).flatMap(collect);
    return [];
  };
  const all = groups.flatMap(collect);

  it("collects a non-empty set of strings", () => {
    expect(all.length).toBeGreaterThan(20);
    for (const s of all) expect(s.length).toBeGreaterThan(0);
  });

  it("never uses the trademarked word", () => {
    for (const s of all) expect(s.toLowerCase()).not.toContain("pomo" + "doro");
  });

  it("has 12 month names", () => {
    expect(STRINGS.graveyard.months).toHaveLength(12);
  });

  it("uses only the known placeholders", () => {
    const allowed = new Set(["n", "day", "month", "intent", "date", "time"]);
    for (const s of all) {
      for (const m of s.matchAll(/\{([^}]*)\}/g)) expect(allowed.has(m[1] ?? "")).toBe(true);
    }
  });
});
