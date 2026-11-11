// controls-and-access R1.8, R14 (design 8.9, 13.1): the strings file is the one home of visible text.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STRINGS } from "../strings";
import { fill } from "./format";

const UI_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(UI_DIR, "..");

/** On since task 24, when the DOM layer exists: every new key must be used by some file in src/ui/. */
const ENFORCE_ALL_USED = true;

/** Groups of keys that other specs own and that this spec's files need not use. */
const NOT_THIS_SPEC = new Set(["title", "tagline", "scene", "count", "ghosts", "graveyard"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const isTestFile = (path: string): boolean => /\.(?:prop\.)?test\.ts$/.test(path) || /(?:^|[\\/])test-kit\.ts$/.test(path) || /(?:^|[\\/])fake-document\.ts$/.test(path);

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

function uiSources(): { name: string; code: string }[] {
  return walk(UI_DIR)
    .filter((p) => p.endsWith(".ts") && !isTestFile(p))
    .map((p) => ({ name: relative(UI_DIR, p).split(sep).join("/"), code: stripComments(readFileSync(p, "utf8")) }));
}

/** Every `group.key` leaf of STRINGS that this spec owns. */
function newKeys(): string[] {
  return Object.entries(STRINGS)
    .filter(([group]) => !NOT_THIS_SPEC.has(group))
    .flatMap(([group, value]) => (typeof value === "string" ? [group] : Object.keys(value).map((key) => `${group}.${key}`)));
}

/** Every text under one `group.key` of STRINGS: the string itself, or each entry of an array or nested group (months, card). */
function textsOf(key: string): string[] {
  const [group, name] = key.split(".") as [keyof typeof STRINGS, string | undefined];
  const root: unknown = name === undefined ? STRINGS[group] : (STRINGS[group] as Record<string, unknown>)[name];
  const collect = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(collect);
    if (value !== null && typeof value === "object") return Object.values(value).flatMap(collect);
    return [];
  };
  return collect(root);
}

/** The keys a source mentions as `STRINGS.group.key`, and the groups it indexes dynamically as `STRINGS.group[...]`. */
function usedBy(code: string): { keys: string[]; groups: string[] } {
  const keys = [...code.matchAll(/STRINGS\.([A-Za-z]+)\.([A-Za-z0-9]+)/g)].map((m) => `${m[1]}.${m[2]}`);
  const groups = [...code.matchAll(/STRINGS\.([A-Za-z]+)\[/g)].map((m) => m[1] ?? "");
  return { keys, groups };
}

/** A string literal that reads as text for a person: two words, or a sentence end. */
function looksVisible(literal: string): boolean {
  return /[A-Za-z]{2,}\s+[A-Za-z]/.test(literal) || /[A-Za-z]{3,}[.!?…]$/.test(literal);
}

function literalsOf(code: string): string[] {
  const noImports = code.replace(/^\s*(?:import|export)\b[^;]*?\bfrom\s+["'][^"']*["'];?/gm, "");
  const out: string[] = [];
  for (const m of noImports.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

describe("the strings file", () => {
  it("looksVisible and literalsOf find text and skip identifiers (the scanner itself)", () => {
    expect(looksVisible("Let it go dark")).toBe(true);
    expect(looksVisible("Done.")).toBe(true);
    for (const quiet of ["custom-length", "ArrowLeft", "burned-out", "mm:ss", "", "--:--", " "]) expect(looksVisible(quiet), quiet).toBe(false);
    expect(literalsOf('import { a } from "../x y";\nconst b = "two words"; const c = \'it\'; const d = `t ${1} u`;')).toEqual(["two words", "it", "t ${1} u"]);
  });

  it("holds every key that src/ui/ uses", () => {
    const known = new Set(newKeys());
    const missing: string[] = [];
    for (const { name, code } of uiSources()) {
      const { keys, groups } = usedBy(code);
      for (const key of keys) if (!known.has(key)) missing.push(`${name}: ${key}`);
      for (const group of groups) if (!(group in STRINGS)) missing.push(`${name}: ${group}[...]`);
    }
    expect(missing).toEqual([]);
  });

  it("is used by src/ui/ (the keys still to be used are listed until the DOM layer exists)", () => {
    const used = new Set<string>();
    const groups = new Set<string>();
    for (const { code } of uiSources()) {
      const u = usedBy(code);
      u.keys.forEach((k) => used.add(k));
      u.groups.forEach((g) => groups.add(g));
    }
    const unused = newKeys().filter((key) => !used.has(key) && !groups.has(key.split(".")[0] ?? ""));
    if (ENFORCE_ALL_USED) expect(unused).toEqual([]);
    else expect(unused.every((key) => newKeys().includes(key))).toBe(true);
  });

  it("has a non-empty text for every key, and the same placeholders in related keys", () => {
    for (const key of newKeys()) {
      const texts = textsOf(key);
      expect(texts.length > 0 && texts.every((s) => s.length > 0), key).toBe(true);
    }
    // The refusal is said and shown with the same numbers.
    expect(STRINGS.status.lengthRange).toBe(STRINGS.announce.refused);
  });

  it("keeps visible text out of src/ui/ (no literal reads as a sentence)", () => {
    const found: string[] = [];
    for (const { name, code } of uiSources()) for (const literal of literalsOf(code)) if (looksVisible(literal)) found.push(`${name}: ${literal}`);
    expect(found).toEqual([]);
  });

  it("never uses the trademarked word anywhere in src/ (say: focus session)", () => {
    const word = new RegExp(["pomo", "doro"].join(""), "i");
    const hits = walk(SRC_DIR)
      .filter((p) => /\.(?:ts|css|svg|md)$/.test(p))
      // src/strings.test.ts (the scene names) asserts the absence of the word, so it has to spell it.
      .filter((p) => relative(SRC_DIR, p) !== "strings.test.ts")
      .filter((p) => word.test(readFileSync(p, "utf8")))
      .map((p) => relative(SRC_DIR, p));
    expect(hits).toEqual([]);
    // It reads every file under src/: quick alone (about 350 ms) but slow while dozens of test files run at once, and the number of files grows.
  }, 30_000);

  it("fills its templates with the placeholders they name", () => {
    expect(fill(STRINGS.status.pauseLeft, { time: "09:12" })).toBe("Pause left 09:12");
    expect(fill(STRINGS.announce.lit, { time: "15 minutes" })).toBe("The wick catches. 15 minutes left.");
    expect(fill(STRINGS.status.lengthRange, { min: 5, max: 90 })).toBe("Choose 5 to 90 minutes.");
    expect(fill(STRINGS.intent.count, { n: 3, max: 80 })).toBe("3 of 80");
    // No template has a placeholder that no value in this list supplies.
    const known = new Set(["n", "max", "min", "time", "day", "month", "intent", "date"]);
    for (const key of newKeys()) {
      for (const value of textsOf(key)) for (const m of value.matchAll(/\{([A-Za-z0-9_]+)\}/g)) expect(known.has(m[1] ?? ""), `${key} {${m[1]}}`).toBe(true);
    }
  });

  it("keeps the status lines shown while Pause and Let it go dark are on screen short", () => {
    // Design 7.2: the running status line is one line 136 px wide at 360 x 640. 24 characters is the cap this test enforces;
    // the intent (user text) and any line longer than about 17 characters at 16 px may be cut with an ellipsis, which is allowed.
    const running = [STRINGS.status.lit, STRINGS.status.guttering, fill(STRINGS.status.pauseLeft, { time: "10:00" })];
    for (const text of running) expect(text.length, text).toBeLessThanOrEqual(24);
  });
});
