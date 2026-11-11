import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
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

describe("ghosts-and-graveyard strings are all used (task 17.1)", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  const isTest = (p: string): boolean => /\.(?:prop\.)?test\.ts$/.test(p) || /(?:^|[\\/])(?:test-kit|fake-document)\.ts$/.test(p);
  const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  // The new folders, and main.ts, which announces the view change.
  const sources = [...walk(join(dir, "ghosts")), ...walk(join(dir, "graveyard")), join(dir, "main.ts")]
    .filter((p) => p.endsWith(".ts") && !isTest(p))
    .map((p) => ({ name: relative(dir, p).split(sep).join("/"), code: strip(readFileSync(p, "utf8")) }));
  const leaves = (prefix: string, value: unknown): string[] =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value).flatMap(([k, v]) => leaves(`${prefix}.${k}`, v))
      : [prefix];
  const owned = [["count", STRINGS.count], ["ghosts", STRINGS.ghosts], ["graveyard", STRINGS.graveyard]].flatMap(([g, v]) => leaves(String(g), v));

  it("uses every key of count, ghosts and graveyard somewhere in src/ghosts, src/graveyard or main.ts", () => {
    const all = sources.map((s) => s.code).join("\n");
    expect(owned.filter((key) => !all.includes(`STRINGS.${key}`))).toEqual([]);
  });

  it("uses only keys that exist", () => {
    const known = new Set(owned);
    const missing: string[] = [];
    for (const { name, code } of sources) {
      for (const m of code.matchAll(/STRINGS\.(count|ghosts|graveyard)((?:\.[A-Za-z0-9]+)+)/g)) {
        const key = `${m[1]}${m[2]}`;
        if (!known.has(key) && ![...known].some((k) => k.startsWith(`${key}.`))) missing.push(`${name}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("keeps visible text out of the new folders (no literal reads as a sentence)", () => {
    const visible = (s: string): boolean => !/^[a-z][A-Za-z0-9-]*(?: [a-z][A-Za-z0-9-]*)*$/.test(s) && (/[A-Za-z]{2,}\s+[A-Za-z]/.test(s) || /[A-Za-z]{3,}[.!?…]$/.test(s));
    const found: string[] = [];
    for (const { name, code } of sources) {
      const noImports = code.replace(/^\s*(?:import|export)\b[^;]*?\bfrom\s+["'][^"']*["'];?/gm, "");
      for (const m of noImports.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
        const literal = m[1] ?? m[2] ?? m[3] ?? "";
        if (visible(literal)) found.push(`${name}: ${literal}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("never uses the trademarked word in the new folders", () => {
    const word = new RegExp(["pomo", "doro"].join(""), "i");
    expect(sources.filter((s) => word.test(s.code)).map((s) => s.name)).toEqual([]);
  });
});
