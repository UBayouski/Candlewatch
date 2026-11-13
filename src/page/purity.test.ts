// Mechanical check of sound-and-title R1.2, R1.3, R1.10, R1.11, R6.6 (task 4.1, design 2.2): the pure page modules read no DOM,
// clock, randomness, storage or audio API, import only the engine's index, the strings, the time text and their pure siblings, and
// hold no visible text; the title's words and separator live in strings.ts.
// Same technique as src/ui/purity.test.ts: strip comments, then match whole words.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PAGE_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(PAGE_DIR, "..");

/** The pure files of src/page (design 2.1). The test fails if one is missing. */
const PURE_PAGE_FILES: readonly string[] = ["title.ts", "wake.ts"];

const FORBIDDEN_IN_PURE: readonly { name: string; pattern: RegExp }[] = [
  { name: "window", pattern: /\bwindow\b/ },
  { name: "document", pattern: /\bdocument\b/ },
  { name: "localStorage", pattern: /\blocalStorage\b/ },
  { name: "Date", pattern: /\bDate\b/ },
  { name: "performance", pattern: /\bperformance\b/ },
  { name: "Math.random", pattern: /\bMath\.random\b/ },
  { name: "matchMedia", pattern: /\bmatchMedia\b/ },
  { name: "setTimeout", pattern: /\bsetTimeout\b/ },
  { name: "setInterval", pattern: /\bsetInterval\b/ },
  { name: "requestAnimationFrame", pattern: /\brequestAnimationFrame\b/ },
  { name: "AudioContext", pattern: /\bAudioContext\b/ },
];

/** The only string literals a pure page file may hold: the phase names (the `switch` cases). */
const ALLOWED_LITERALS = new Set(["idle", "lit", "paused", "burned-out", "snuffed"]);

/** The trademarked timer word, built from fragments so this file does not contain it (R1.11). */
const TIMER_WORD = new RegExp(["pomo", "doro"].join(""), "i");

/** Removes // and block comments, leaving string contents alone. */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const c = source.charAt(i);
    const next = source.charAt(i + 1);
    if (c === "/" && next === "/") {
      while (i < source.length && source.charAt(i) !== "\n") i++;
    } else if (c === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source.charAt(i) === "*" && source.charAt(i + 1) === "/")) i++;
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < source.length && source.charAt(i) !== quote) {
        if (source.charAt(i) === "\\") {
          out += source.charAt(i);
          i++;
        }
        out += source.charAt(i);
        i++;
      }
      out += quote;
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const IMPORT_FROM = /\b(?:import|export)(?:\s+type)?\b[^;]*?\bfrom\s*["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT = /\bimport\s*["']([^"']+)["']/g;
const importsOf = (code: string): string[] => [...[...code.matchAll(IMPORT_FROM)].map((m) => m[1] ?? ""), ...[...code.matchAll(SIDE_EFFECT_IMPORT)].map((m) => m[1] ?? "")];

/** The string literals of a file, import specifiers left out. */
function literalsOf(code: string): string[] {
  const noImports = code.replace(/^\s*(?:import|export)\b[^;]*?\bfrom\s+["'][^"']*["'];?/gm, "");
  return [...noImports.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
}

/** What a pure page file may import (design 2.2): the engine's index, the strings, the time text and its pure siblings. */
function importAllowed(specifier: string): boolean {
  if (specifier === "../engine" || specifier === "../strings" || specifier === "../ui/format") return true;
  const sibling = /^\.\/([a-z-]+)$/.exec(specifier)?.[1];
  return sibling !== undefined && PURE_PAGE_FILES.includes(`${sibling}.ts`);
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}
const isTestFile = (path: string): boolean => /\.(?:prop\.)?test\.ts$/.test(path) || /(?:^|[\\/])(?:test-kit|[a-z-]+-kit|fake-[a-z-]+)\.ts$/.test(path);

const sources = PURE_PAGE_FILES.map((name) => {
  const path = join(PAGE_DIR, name);
  const raw = existsSync(path) ? readFileSync(path, "utf8") : "";
  return { name, path, raw, code: stripComments(raw) };
});

describe("the scanner itself", () => {
  it("strips comments and finds forbidden words, literals and imports", () => {
    const code = stripComments('// window\nimport { b } from "../engine";\nconst a = "x"; /* Date */');
    expect(FORBIDDEN_IN_PURE.some((f) => f.pattern.test(code))).toBe(false);
    expect(literalsOf(code)).toEqual(["x"]);
    expect(importsOf(code)).toEqual(["../engine"]);
    expect(FORBIDDEN_IN_PURE.filter((f) => f.pattern.test("new AudioContext(); Date.now(); Math.random()")).map((f) => f.name)).toEqual(["Date", "Math.random", "AudioContext"]);
    expect(importAllowed("../scene")).toBe(false);
    expect(importAllowed("../ui/format")).toBe(true);
    expect(importAllowed("../ui/view")).toBe(false);
    expect(importAllowed("./wake")).toBe(true);
    expect(importAllowed("./hidden-tick")).toBe(false);
  });
});

describe("the pure page modules are pure (R1.2, R1.3)", () => {
  it("every listed file exists", () => {
    expect(sources.filter((s) => s.raw === "").map((s) => s.name)).toEqual([]);
  });

  for (const { name, pattern } of FORBIDDEN_IN_PURE) {
    it(`no pure module uses ${name}`, () => {
      expect(sources.filter((s) => pattern.test(s.code)).map((s) => s.name)).toEqual([]);
    });
  }

  it("imports only the engine's index, the strings and pure siblings", () => {
    expect(sources.flatMap((s) => importsOf(s.code).filter((i) => !importAllowed(i)).map((i) => `${s.name} imports ${i}`))).toEqual([]);
  });

  it("holds no visible text: every string literal is a phase name (R1.10)", () => {
    expect(sources.flatMap((s) => literalsOf(s.code).filter((l) => !ALLOWED_LITERALS.has(l)).map((l) => `${s.name}: ${JSON.stringify(l)}`))).toEqual([]);
  });

  it("no file of src/page, comments included, contains the trademarked timer word (R1.11)", () => {
    const files = readdirSync(PAGE_DIR).filter((n) => n.endsWith(".ts") && n !== "purity.test.ts");
    expect(files.filter((n) => TIMER_WORD.test(readFileSync(join(PAGE_DIR, n), "utf8")))).toEqual([]);
  });
});

describe("the title's words live in strings.ts (R6.6)", () => {
  it("title.ts holds no copy of Morning, Dark or the separator, and paused only as the phase name", () => {
    const title = sources.find((s) => s.name === "title.ts")?.code ?? "";
    expect(title).not.toMatch(/morning|dark|\u00b7/i);
    expect(literalsOf(title).filter((l) => /paused/i.test(l))).toEqual(["paused"]);
  });
});

// --- the effect files (task 11.1, design 2.2; R1.4, R1.5, R1.9, R1.10, R5.23) ------------------------------------------------

const readCode = (path: string): string => (existsSync(path) ? stripComments(readFileSync(path, "utf8")) : "");
const rel = (path: string): string => relative(SRC_DIR, path).split(sep).join("/");
const shippedSources = walk(SRC_DIR)
  .filter((p) => p.endsWith(".ts") && !isTestFile(p))
  .map((p) => ({ name: rel(p), code: readCode(p) }));

/** Files that used the browser's timer functions before this spec (the ghosts layer's fade safety). main.ts is the wiring. */
const TIMER_USERS_BEFORE = new Set(["main.ts", "ghosts/layer.ts"]);

/** The only string literals an effect file of src/page may hold: phase and event names, the `typeof` result. */
const ALLOWED_EFFECT_LITERALS = new Set([...ALLOWED_LITERALS, "tick", "hide", "show", "string"]);

describe("the effect files of src/page and after-step.ts", () => {
  const hiddenTick = readCode(join(PAGE_DIR, "hidden-tick.ts"));
  const adapter = readCode(join(PAGE_DIR, "title-adapter.ts"));
  const afterStep = readCode(join(SRC_DIR, "after-step.ts"));

  it("the three files exist", () => {
    expect([hiddenTick, adapter, afterStep].filter((c) => c === "")).toEqual([]);
  });

  for (const word of ["Date", "requestAnimationFrame", "AudioContext", "window", "document"]) {
    it(`hidden-tick.ts never names ${word} (R1.5, R5.23)`, () => {
      expect(new RegExp(`\\b${word}\\b`).test(hiddenTick)).toBe(false);
    });
  }

  for (const word of ["window", "setTimeout", "requestAnimationFrame"]) {
    it(`title-adapter.ts never names ${word}`, () => {
      expect(new RegExp(`\\b${word}\\b`).test(adapter)).toBe(false);
    });
  }

  it("hidden-tick.ts sends only tick: its one event literal is the tick", () => {
    expect([...hiddenTick.matchAll(/\btype:\s*"([a-z-]+)"/g)].map((m) => m[1])).toEqual(["tick"]);
  });

  it("after-step.ts imports only ./audio/cue, ./audio/types, ./page/title and ./engine (no effect file)", () => {
    const allowed = new Set(["./audio/cue", "./audio/types", "./page/title", "./engine"]);
    expect(importsOf(afterStep).filter((i) => !allowed.has(i))).toEqual([]);
  });

  it("every shipped file of src/page holds no visible text (R1.10)", () => {
    const shipped = readdirSync(PAGE_DIR).filter((n) => n.endsWith(".ts") && !isTestFile(join(PAGE_DIR, n)));
    expect(shipped).toEqual(expect.arrayContaining(["hidden-tick.ts", "title-adapter.ts", ...PURE_PAGE_FILES]));
    expect(shipped.flatMap((n) => literalsOf(readCode(join(PAGE_DIR, n))).filter((l) => !ALLOWED_EFFECT_LITERALS.has(l)).map((l) => `${n}: ${JSON.stringify(l)}`))).toEqual([]);
  });
});

describe("across every shipped file of src/", () => {
  it("only title-adapter.ts assigns a title (R1.4)", () => {
    expect(shippedSources.filter((s) => /\.title\s*=(?!=)/.test(s.code)).map((s) => s.name)).toEqual(["page/title-adapter.ts"]);
  });

  it("only audio-player.ts names AudioContext (R1.4)", () => {
    expect(shippedSources.filter((s) => /\bAudioContext\b/.test(s.code)).map((s) => s.name)).toEqual(["audio/audio-player.ts"]);
  });

  it("setTimeout and clearTimeout appear only in main.ts and in files that used them before this spec (R1.5)", () => {
    expect(shippedSources.filter((s) => /\b(?:setTimeout|clearTimeout)\b/.test(s.code) && !TIMER_USERS_BEFORE.has(s.name)).map((s) => s.name)).toEqual([]);
  });
});

describe("test helpers stay in the tests", () => {
  it("no shipped file under src/ imports a test-kit, fake-audio-context or fake-timer file", () => {
    const offenders = walk(SRC_DIR)
      .filter((p) => p.endsWith(".ts") && !isTestFile(p))
      .flatMap((p) =>
        importsOf(stripComments(readFileSync(p, "utf8")))
          .filter((i) => /(?:^|\/)(?:test-kit|fake-audio-context|fake-timer)$/.test(i))
          .map((i) => `${relative(SRC_DIR, p).split(sep).join("/")} imports ${i}`),
      );
    expect(offenders).toEqual([]);
  });
});
