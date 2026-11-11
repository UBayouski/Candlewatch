// Mechanical check of ghosts-and-graveyard R1.1, R1.3 to R1.5, R1.7 to R1.9 (task 11.2): the pure graveyard modules do not touch
// the DOM, the clock, randomness or storage, import only what design 2.2 allows, and nothing in src/graveyard builds markup from
// text. Same technique as src/ui/purity.test.ts: strip comments, match whole words.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const GRAVEYARD_DIR = dirname(fileURLToPath(import.meta.url));
const UI_DIR = join(GRAVEYARD_DIR, "..", "ui");

/**
 * The pure modules of src/graveyard (design 2.1). A task adds its file here when it creates it; the test fails if a listed file
 * is missing. The later task that creates "day-key.ts" adds it here too: it is pure except for reading `Date`, see below.
 */
const PURE_GRAVEYARD_FILES: readonly string[] = [
  "days.ts",
  "visible.ts",
  "text.ts",
  "geometry.ts",
  "focus.ts",
  "card.ts",
  "view.ts",
  "keys.ts",
  "day-key.ts",
  "plan.ts",
  "tap-guard.ts",
];

/**
 * The DOM layer of src/graveyard: exempt from the identifier scan and the import allow-list, but still subject to the folder-wide
 * scans (banned calls, the trademark word, test helpers). A later task adds "view-dom.ts" and "graveyard.css" here; the test fails if a listed file is missing.
 */
const DOM_GRAVEYARD_FILES: readonly string[] = ["view-dom.ts", "graveyard.css"];

/**
 * The only files allowed to read `Date` (R1.9): the one place that turns a timestamp into a local day key. Empty until the task
 * that creates "day-key.ts" adds it, and it must also be added to PURE_GRAVEYARD_FILES. Nothing else is excluded, and only from the `Date` scan.
 */
const EXCLUDED_FROM_DATE_SCAN: readonly string[] = ["day-key.ts"];
/** The pure files a pure file may import: not the one that reads Date, whose result reaches the others only as an argument. */
const IMPORTABLE_SIBLINGS: readonly string[] = PURE_GRAVEYARD_FILES.filter((f) => !EXCLUDED_FROM_DATE_SCAN.includes(f));

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

/** Calls that build markup or styles from text (R1.7): banned in every non-test file of src/graveyard. */
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

/**
 * Declarations that remove the focus indicator (task 15.3): `outline: none`, `outline: 0`, `outline-style: none` and `outline-width: 0`.
 * The graveyard's stylesheet draws a 3 px ring and never takes it away, so it must contain none of them.
 */
const OUTLINE_REMOVAL = /\boutline(?:-style|-width)?\s*:\s*(?:none|0(?:px)?)\s*(?:!important\s*)?(?:;|}|$)/im;

// Group 1: "type" when the statement is a type-only import or export; group 2: the specifier.
const IMPORT_FROM = /\b(?:import|export)(\s+type)?\b[^;]*?\bfrom\s*["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT = /\bimport\s*["']([^"']+)["']/g;
const TEST_ONLY_IMPORT = /(?:^|\/)(?:test-kit|fake-[a-z-]+)(?:\.[a-z]+)?$|\.test(?:\.[a-z]+)?$/;
const GHOSTS_IMPORT = /^(?:\.\.\/)+ghosts(?:\/|$)/;
const GRAVEYARD_IMPORT = /^(?:\.\.\/)+graveyard(?:\/|$)/;

interface ImportRef {
  specifier: string;
  typeOnly: boolean;
}

/**
 * What a pure graveyard module may import (R1.4): the engine's public index, the strings, the time text, the layout rectangles,
 * its pure siblings, and (in keys.ts only, as a type-only import) the room key map.
 */
function importAllowed(ref: ImportRef, file: string, siblings: readonly string[]): boolean {
  const { specifier } = ref;
  if (specifier === "../engine" || specifier === "../strings" || specifier === "../ui/format" || specifier === "../ui/layout") return true;
  if (specifier === "../ui/keys") return file === "keys.ts" && ref.typeOnly;
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

function importsOf(code: string): ImportRef[] {
  const named = [...code.matchAll(IMPORT_FROM)].map((m) => ({ specifier: m[2] ?? "", typeOnly: m[1] !== undefined }));
  const bare = [...code.matchAll(SIDE_EFFECT_IMPORT)].map((m) => ({ specifier: m[1] ?? "", typeOnly: false }));
  return [...named, ...bare];
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

const isTestFile = (name: string): boolean => /\.(?:prop\.)?test\.ts$/.test(name) || name === "test-kit.ts" || /^fake-[a-z-]+\.ts$/.test(name);

/** Every non-test .ts or .css file of the folder, with raw text and code (comments stripped). */
function folderSources(): { name: string; raw: string; code: string }[] {
  return readdirSync(GRAVEYARD_DIR)
    .filter((n) => /\.(?:ts|css)$/.test(n) && !isTestFile(n))
    .map((name) => {
      const raw = readFileSync(join(GRAVEYARD_DIR, name), "utf8");
      return { name, raw, code: stripComments(raw) };
    });
}

function listed(names: readonly string[]): { name: string; path: string; code: string }[] {
  return names.map((name) => {
    const path = join(GRAVEYARD_DIR, name);
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

  it("catches every way of removing the focus outline, and lets a drawn ring through", () => {
    for (const bad of ["a { outline: none; }", "a { outline:0 }", "a{outline: 0px !important;}", "a { outline-style: none; }", "a { OUTLINE: NONE }", "a { outline-width: 0; }"]) {
      expect(OUTLINE_REMOVAL.test(stripComments(bad)), bad).toBe(true);
    }
    for (const fine of ["a:focus-visible { outline: 3px solid #efe6cf; outline-offset: 3px; }", "a { outline-color: Highlight; }", "/* outline: none */ a { color: red; }"]) {
      expect(OUTLINE_REMOVAL.test(stripComments(fine)), fine).toBe(false);
    }
  });

  it("catches the trademark word in any case, as a whole word only", () => {
    expect(TRADEMARK_PATTERN.test(`a ${TRADEMARK} b`)).toBe(true);
    expect(TRADEMARK_PATTERN.test(`// ${TRADEMARK.toLowerCase()}`)).toBe(true);
    expect(TRADEMARK_PATTERN.test(`x ${TRADEMARK.toUpperCase()}.`)).toBe(true);
    expect(TRADEMARK_PATTERN.test("a focus session")).toBe(false);
  });

  it("reads import specifiers and whether they are type-only", () => {
    const code = stripComments('import { a } from "../engine";\nimport type { B } from "../ui/keys";\nimport "./c.css";\nexport type { d } from "../strings";');
    expect(importsOf(code)).toEqual([
      { specifier: "../engine", typeOnly: false },
      { specifier: "../ui/keys", typeOnly: true },
      { specifier: "../strings", typeOnly: true },
      { specifier: "./c.css", typeOnly: false },
    ]);
  });

  it("allows only the engine index, strings, time text, layout, pure siblings and (keys.ts, types only) the room keys", () => {
    const siblings = ["days.ts", "keys.ts", "view.ts"];
    const ref = (specifier: string, typeOnly = false): ImportRef => ({ specifier, typeOnly });
    for (const ok of ["../engine", "../strings", "../ui/format", "../ui/layout", "./days", "./view"]) {
      expect(importAllowed(ref(ok), "view.ts", siblings), ok).toBe(true);
    }
    for (const bad of ["../engine/step", "../ghosts", "../ghosts/slots", "../scene", "../storage/settings", "../ui/view", "./day-key", "./test-kit", "vitest", "node:fs"]) {
      expect(importAllowed(ref(bad), "view.ts", siblings), bad).toBe(false);
    }
    expect(importAllowed(ref("../ui/keys", true), "keys.ts", siblings)).toBe(true);
    expect(importAllowed(ref("../ui/keys", false), "keys.ts", siblings)).toBe(false);
    expect(importAllowed(ref("../ui/keys", true), "view.ts", siblings)).toBe(false);
  });

  it("recognizes test-only and other-feature imports", () => {
    for (const s of ["./test-kit", "../engine/test-kit", "../distraction/fake-document", "./fake-thing", "./days.test", "./days.prop.test"]) {
      expect(TEST_ONLY_IMPORT.test(s), s).toBe(true);
    }
    for (const s of ["./days", "../engine", "./test-kitchen", "./fake"]) expect(TEST_ONLY_IMPORT.test(s), s).toBe(false);
    for (const s of ["../ghosts", "../ghosts/slots"]) expect(GHOSTS_IMPORT.test(s), s).toBe(true);
    for (const s of ["../graveyard", "../graveyard/days"]) expect(GRAVEYARD_IMPORT.test(s), s).toBe(true);
    for (const s of ["../engine", "./days", "../ui/keys"]) {
      expect(GHOSTS_IMPORT.test(s) || GRAVEYARD_IMPORT.test(s), s).toBe(false);
    }
  });

  it("treats test-kit.ts, fake-*.ts and *.test.ts as test files", () => {
    for (const n of ["test-kit.ts", "fake-x.ts", "days.test.ts", "days.prop.test.ts"]) expect(isTestFile(n), n).toBe(true);
    for (const n of ["days.ts", "view-dom.ts", "graveyard.css"]) expect(isTestFile(n), n).toBe(false);
  });
});

describe("the pure graveyard modules are pure (R1.4, R1.5, R1.9)", () => {
  const sources = listed(PURE_GRAVEYARD_FILES);

  it("every listed file exists", () => {
    const missing = listed([...PURE_GRAVEYARD_FILES, ...DOM_GRAVEYARD_FILES, ...EXCLUDED_FROM_DATE_SCAN]).filter((s) => !existsSync(s.path)).map((s) => s.name);
    expect(missing).toEqual([]);
  });

  it("only listed pure files may be excluded from the Date scan", () => {
    expect(EXCLUDED_FROM_DATE_SCAN.filter((f) => !PURE_GRAVEYARD_FILES.includes(f))).toEqual([]);
  });

  for (const { name, pattern } of FORBIDDEN_IN_PURE) {
    it(`no pure module uses ${name}`, () => {
      const scanned = name === "Date" ? sources.filter((s) => !EXCLUDED_FROM_DATE_SCAN.includes(s.name)) : sources;
      expect(scanned.filter((s) => pattern.test(s.code)).map((s) => s.name)).toEqual([]);
    });
  }

  it("each pure module imports only what design 2.2 allows", () => {
    const offenders = sources.flatMap((s) =>
      importsOf(s.code)
        .filter((ref) => !importAllowed(ref, s.name, IMPORTABLE_SIBLINGS))
        .map((ref) => `${s.name} imports ${ref.specifier}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe("the whole folder keeps its layers apart (R1.1, R1.3, R1.7, R1.8)", () => {
  const sources = folderSources();

  it("the scan sees the listed files", () => {
    const names = sources.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining([...PURE_GRAVEYARD_FILES, ...DOM_GRAVEYARD_FILES]));
  });

  it("no source file imports a test helper or a test file", () => {
    const offenders = sources.flatMap((s) => importsOf(s.code).filter((r) => TEST_ONLY_IMPORT.test(r.specifier)).map((r) => `${s.name} imports ${r.specifier}`));
    expect(offenders).toEqual([]);
  });

  it("no source file imports src/ghosts", () => {
    const offenders = sources.flatMap((s) => importsOf(s.code).filter((r) => GHOSTS_IMPORT.test(r.specifier)).map((r) => `${s.name} imports ${r.specifier}`));
    expect(offenders).toEqual([]);
  });

  for (const { name, pattern } of BANNED_CALLS) {
    it(`no file uses ${name}`, () => {
      expect(sources.filter((s) => pattern.test(s.code)).map((s) => s.name)).toEqual([]);
    });
  }

  it("no stylesheet removes the focus outline (task 15.3)", () => {
    const css = sources.filter((s) => s.name.endsWith(".css"));
    expect(css.map((s) => s.name)).toContain("graveyard.css");
    expect(css.filter((s) => OUTLINE_REMOVAL.test(s.code)).map((s) => s.name)).toEqual([]);
  });

  it("the stylesheet draws the 3 px ivory ring and sets no transition or animation", () => {
    const css = sources.find((s) => s.name === "graveyard.css")?.code ?? "";
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid/);
    expect(css).not.toMatch(/\b(?:transition|animation)\b/);
  });

  it("no file, comments included, contains the trademark word", () => {
    expect(sources.filter((s) => TRADEMARK_PATTERN.test(s.raw)).map((s) => s.name)).toEqual([]);
  });

  it("src/ui imports neither src/ghosts nor src/graveyard", () => {
    const offenders = walk(UI_DIR)
      .filter((p) => /\.ts$/.test(p) && !isTestFile(p.split(/[\\/]/).pop() ?? ""))
      .flatMap((p) =>
        importsOf(stripComments(readFileSync(p, "utf8")))
          .filter((r) => GHOSTS_IMPORT.test(r.specifier) || GRAVEYARD_IMPORT.test(r.specifier))
          .map((r) => `${p} imports ${r.specifier}`),
      );
    expect(offenders).toEqual([]);
  });
});

describe("the one reader of local time", () => {
  it("is imported by no pure module: the day function reaches them only as an argument", () => {
    const importers = listed(PURE_GRAVEYARD_FILES)
      .filter((s) => !EXCLUDED_FROM_DATE_SCAN.includes(s.name))
      .filter((s) => importsOf(s.code).some((ref) => ref.specifier === "./day-key"))
      .map((s) => s.name);
    expect(importers).toEqual([]);
    expect(IMPORTABLE_SIBLINGS).not.toContain("day-key.ts");
    expect(IMPORTABLE_SIBLINGS).toContain("days.ts");
  });
});
