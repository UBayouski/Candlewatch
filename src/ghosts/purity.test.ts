// Mechanical check of ghosts-and-graveyard R1.1, R1.3 to R1.5, R1.7 and R1.8 (task 11.1): the pure ghost modules do not touch
// the DOM, the clock, randomness or storage, import only what design 2.2 allows, and nothing in src/ghosts builds markup from
// text. Same technique as src/ui/purity.test.ts: strip comments, match whole words.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const GHOSTS_DIR = dirname(fileURLToPath(import.meta.url));

/** The pure modules of src/ghosts (design 2.1). A task adds its file here when it creates it; the test fails if a listed file is missing. */
const PURE_GHOST_FILES: readonly string[] = ["slots.ts", "visible.ts", "label.ts", "silhouette.ts"];

/**
 * The DOM layer of src/ghosts: exempt from the identifier scan and the import allow-list, but still subject to the folder-wide
 * scans (banned calls, the trademark word, test helpers). Task 14 adds "layer.ts" and "ghosts.css" here; the test fails if a listed file is missing.
 */
const DOM_GHOST_FILES: readonly string[] = ["layer.ts", "ghosts.css"];

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
];

/** Calls that build markup or styles from text (R1.7): banned in every non-test file of src/ghosts. */
const BANNED_CALLS: readonly { name: string; pattern: RegExp }[] = [
  { name: "innerHTML", pattern: /\binnerHTML\b/ },
  { name: "insertAdjacentHTML", pattern: /\binsertAdjacentHTML\b/ },
  { name: "document.write", pattern: /\bdocument\s*\.\s*write(?:ln)?\b/ },
  { name: 'setAttribute("style"', pattern: /\bsetAttribute\s*\(\s*(?:"style"|'style'|`style`)/ },
  { name: "style.cssText", pattern: /\bstyle\s*\.\s*cssText\b/ },
];

// The trademark word (R1.8), built from fragments so this file does not contain it.
const TRADEMARK = "Pomo" + "doro";
const TRADEMARK_PATTERN = new RegExp(`\\b${TRADEMARK}\\b`, "i");

const IMPORT_FROM = /\b(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT = /\bimport\s*["']([^"']+)["']/g;
const TEST_ONLY_IMPORT = /(?:^|\/)(?:test-kit|fake-[a-z-]+)(?:\.[a-z]+)?$|\.test(?:\.[a-z]+)?$/;
const OTHER_FEATURE_IMPORT = /^(?:\.\.\/)+graveyard(?:\/|$)/;

/** What a pure ghost module may import: the engine's public index, the strings, the time text and its pure siblings (R1.4). */
function importAllowed(specifier: string, siblings: readonly string[]): boolean {
  if (specifier === "../engine" || specifier === "../strings" || specifier === "../ui/format") return true;
  const sibling = /^\.\/([a-z-]+)$/.exec(specifier)?.[1];
  return sibling !== undefined && siblings.includes(`${sibling}.ts`);
}

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

function importsOf(code: string): string[] {
  return [...code.matchAll(IMPORT_FROM), ...code.matchAll(SIDE_EFFECT_IMPORT)].map((m) => m[1] ?? "");
}

const isTestFile = (name: string): boolean => /\.(?:prop\.)?test\.ts$/.test(name) || name === "test-kit.ts" || /^fake-[a-z-]+\.ts$/.test(name);

/** Every non-test .ts or .css file of the folder, with raw text and code (comments stripped). */
function folderSources(): { name: string; raw: string; code: string }[] {
  return readdirSync(GHOSTS_DIR)
    .filter((n) => /\.(?:ts|css)$/.test(n) && !isTestFile(n))
    .map((name) => {
      const raw = readFileSync(join(GHOSTS_DIR, name), "utf8");
      return { name, raw, code: stripComments(raw) };
    });
}

function listed(names: readonly string[]): { name: string; path: string; code: string }[] {
  return names.map((name) => {
    const path = join(GHOSTS_DIR, name);
    return { name, path, code: existsSync(path) ? stripComments(readFileSync(path, "utf8")) : "" };
  });
}

describe("the scanner itself", () => {
  it("removes comments but keeps code and strings", () => {
    const out = stripComments('const a = 1; // the window\n/* document\nlocalStorage */ const b = "Date";');
    expect(out).not.toMatch(/window|document|localStorage/);
    expect(out).toContain('const b = "Date";');
  });

  it("catches every forbidden identifier as a whole word, and nothing else", () => {
    const bad = stripComments(
      "window.a; document.b; localStorage.c; Date.now(); performance.now(); Math.random(); matchMedia('q'); setTimeout(f); setInterval(f); requestAnimationFrame(f);",
    );
    expect(FORBIDDEN_IN_PURE.filter((f) => f.pattern.test(bad)).map((f) => f.name)).toEqual(FORBIDDEN_IN_PURE.map((f) => f.name));
    expect(FORBIDDEN_IN_PURE.some((f) => f.pattern.test(stripComments("const updated = windowed + documentation + Dated;")))).toBe(false);
  });

  it("catches each banned call and lets safe calls through", () => {
    const bad = stripComments(
      'el.innerHTML = x; el.insertAdjacentHTML("beforeend", x); document.write(x); el.setAttribute("style", "a"); el.setAttribute(\'style\', "a"); el.style.cssText = "a";',
    );
    expect(BANNED_CALLS.filter((b) => b.pattern.test(bad)).map((b) => b.name)).toEqual(BANNED_CALLS.map((b) => b.name));
    const fine = stripComments('el.style.setProperty("--x", "1"); el.textContent = t; el.setAttribute("aria-label", t);');
    expect(BANNED_CALLS.some((b) => b.pattern.test(fine))).toBe(false);
  });

  it("catches the trademark word in any case, as a whole word only", () => {
    expect(TRADEMARK_PATTERN.test(`a ${TRADEMARK} b`)).toBe(true);
    expect(TRADEMARK_PATTERN.test(`// ${TRADEMARK.toLowerCase()}`)).toBe(true);
    expect(TRADEMARK_PATTERN.test(`x ${TRADEMARK.toUpperCase()}.`)).toBe(true);
    expect(TRADEMARK_PATTERN.test("a focus session")).toBe(false);
  });

  it("reads import specifiers, including side-effect imports and re-exports", () => {
    const code = stripComments('import { a } from "../engine";\nimport type { B } from "./b";\nimport "./c.css";\nexport { d } from "../strings";');
    expect(importsOf(code)).toEqual(["../engine", "./b", "../strings", "./c.css"]);
  });

  it("allows only the engine index, the strings, the time text and pure siblings", () => {
    const siblings = ["slots.ts", "visible.ts", "label.ts"];
    for (const ok of ["../engine", "../strings", "../ui/format", "./slots", "./label"]) expect(importAllowed(ok, siblings), ok).toBe(true);
    for (const bad of ["../engine/step", "../graveyard", "../ui/layout", "../scene", "../storage/settings", "./layer", "./test-kit", "vitest", "node:fs"]) {
      expect(importAllowed(bad, siblings), bad).toBe(false);
    }
  });

  it("recognizes test-only and other-feature imports", () => {
    for (const s of ["./test-kit", "../engine/test-kit", "../distraction/fake-document", "./fake-thing", "./slots.test", "./slots.prop.test"]) {
      expect(TEST_ONLY_IMPORT.test(s), s).toBe(true);
    }
    for (const s of ["./slots", "../engine", "./test-kitchen", "./fake"]) expect(TEST_ONLY_IMPORT.test(s), s).toBe(false);
    for (const s of ["../graveyard", "../graveyard/days"]) expect(OTHER_FEATURE_IMPORT.test(s), s).toBe(true);
    for (const s of ["../engine", "./slots"]) expect(OTHER_FEATURE_IMPORT.test(s), s).toBe(false);
  });

  it("treats test-kit.ts, fake-*.ts and *.test.ts as test files", () => {
    for (const n of ["test-kit.ts", "fake-x.ts", "slots.test.ts", "slots.prop.test.ts"]) expect(isTestFile(n), n).toBe(true);
    for (const n of ["slots.ts", "layer.ts", "ghosts.css"]) expect(isTestFile(n), n).toBe(false);
  });
});

describe("the pure ghost modules are pure (R1.4, R1.5)", () => {
  const sources = listed(PURE_GHOST_FILES);

  it("every listed file exists", () => {
    const missing = listed([...PURE_GHOST_FILES, ...DOM_GHOST_FILES]).filter((s) => !existsSync(s.path)).map((s) => s.name);
    expect(missing).toEqual([]);
  });

  for (const { name, pattern } of FORBIDDEN_IN_PURE) {
    it(`no pure module uses ${name}`, () => {
      expect(sources.filter((s) => pattern.test(s.code)).map((s) => s.name)).toEqual([]);
    });
  }

  it("each pure module imports only the engine index, the strings, the time text and pure siblings", () => {
    const offenders = sources.flatMap((s) =>
      importsOf(s.code)
        .filter((spec) => !importAllowed(spec, PURE_GHOST_FILES))
        .map((spec) => `${s.name} imports ${spec}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe("the whole folder keeps its layers apart (R1.1, R1.3, R1.7, R1.8)", () => {
  const sources = folderSources();

  it("the scan sees the listed files", () => {
    const names = sources.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining([...PURE_GHOST_FILES, ...DOM_GHOST_FILES]));
  });

  it("no source file imports a test helper or a test file", () => {
    const offenders = sources.flatMap((s) => importsOf(s.code).filter((spec) => TEST_ONLY_IMPORT.test(spec)).map((spec) => `${s.name} imports ${spec}`));
    expect(offenders).toEqual([]);
  });

  it("no source file imports src/graveyard", () => {
    const offenders = sources.flatMap((s) => importsOf(s.code).filter((spec) => OTHER_FEATURE_IMPORT.test(spec)).map((spec) => `${s.name} imports ${spec}`));
    expect(offenders).toEqual([]);
  });

  for (const { name, pattern } of BANNED_CALLS) {
    it(`no file uses ${name}`, () => {
      expect(sources.filter((s) => pattern.test(s.code)).map((s) => s.name)).toEqual([]);
    });
  }

  it("no file, comments included, contains the trademark word", () => {
    expect(sources.filter((s) => TRADEMARK_PATTERN.test(s.raw)).map((s) => s.name)).toEqual([]);
  });
});
