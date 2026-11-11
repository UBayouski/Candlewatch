// Mechanical check of controls-and-access R1.5 and R1.7 (design 13.1): the pure modules of the interface do not
// touch the DOM, the clock, randomness or storage, import only what design 1.4 allows, and nothing in src/ui builds
// markup from text. Same technique as the engine's and the scene's purity tests: strip comments, match whole words.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const UI_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(UI_DIR, "..");

/**
 * The pure modules of src/ui (design 3). A task adds its file here when it creates it; the test fails if a listed file is
 * missing. Files: format, length, light, keys, ui-state, announcer, layout, view (tasks 4, 6, 8, 10, 12, 16, 18, 22).
 */
const PURE_UI_FILES: readonly string[] = ["format.ts", "length.ts", "light.ts", "keys.ts", "ui-state.ts"];

/** The one pure module outside src/ui: the settings document (task 20 adds "settings.ts"). */
const PURE_STORAGE_FILES: readonly string[] = [];

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

/** Calls that build markup or styles from text (design 4.1, R1.7): banned in every non-test file of src/ui. */
const BANNED_CALLS: readonly { name: string; pattern: RegExp }[] = [
  { name: "innerHTML", pattern: /\binnerHTML\b/ },
  { name: "insertAdjacentHTML", pattern: /\binsertAdjacentHTML\b/ },
  { name: "document.write", pattern: /\bdocument\s*\.\s*write(?:ln)?\b/ },
  { name: 'setAttribute("style"', pattern: /\bsetAttribute\s*\(\s*(?:"style"|'style'|`style`)/ },
  { name: "style.cssText", pattern: /\bstyle\s*\.\s*cssText\b/ },
];

const IMPORT_FROM = /\b(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT = /\bimport\s*["']([^"']+)["']/g;
const TEST_ONLY_IMPORT = /(?:^|\/)(?:test-kit|scene-kit|fake-document)(?:\.[a-z]+)?$/;
const FORBIDDEN_LAYER = /^(?:\.\.\/)+(?:scene|distraction|audio)(?:\/|$)/;

/** What a pure module may import: the engine's public index, the strings, the settings type, and its pure siblings. */
function importAllowed(specifier: string, siblings: readonly string[]): boolean {
  if (specifier === "../engine" || specifier === "../strings" || specifier === "../storage/settings") return true;
  const sibling = /^\.\/([a-z-]+)$/.exec(specifier)?.[1];
  return sibling !== undefined && siblings.includes(`${sibling}.ts`);
}

/** Removes // and block comments, leaving string contents alone. */
export function stripComments(source: string): string {
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

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const isTestFile = (path: string): boolean => /\.(?:prop\.)?test\.ts$/.test(path) || /(?:^|[\\/])test-kit\.ts$/.test(path);

/** Every non-test TypeScript or CSS source under src/ui, with its code (comments stripped). */
function uiSources(): { name: string; code: string }[] {
  return walk(UI_DIR)
    .filter((p) => /\.(?:ts|css)$/.test(p) && !isTestFile(p))
    .map((p) => ({ name: relative(UI_DIR, p).split(sep).join("/"), code: stripComments(readFileSync(p, "utf8")) }));
}

function pureSources(): { name: string; path: string; code: string }[] {
  return [
    ...PURE_UI_FILES.map((f) => ({ name: f, path: join(UI_DIR, f) })),
    ...PURE_STORAGE_FILES.map((f) => ({ name: `../storage/${f}`, path: join(SRC_DIR, "storage", f) })),
  ].map((f) => ({ ...f, code: existsSync(f.path) ? stripComments(readFileSync(f.path, "utf8")) : "" }));
}

describe("the scanner itself", () => {
  it("removes comments but keeps code and strings", () => {
    const out = stripComments('const a = 1; // the window\n/* document\nlocalStorage */ const b = "Date";');
    expect(out).not.toMatch(/window|document|localStorage/);
    expect(out).toContain('const b = "Date";');
  });

  it("catches forbidden identifiers as whole words only", () => {
    const bad = stripComments("const n = Date.now(); Math.random(); window.x; document.y; matchMedia('q');");
    expect(FORBIDDEN_IN_PURE.filter((f) => f.pattern.test(bad)).map((f) => f.name)).toEqual([
      "window",
      "document",
      "Date",
      "Math.random",
      "matchMedia",
    ]);
    expect(FORBIDDEN_IN_PURE.some((f) => f.pattern.test(stripComments("const updated = windowed + documentation;")))).toBe(false);
  });

  it("catches each banned call", () => {
    const bad = stripComments(
      'el.innerHTML = x; el.insertAdjacentHTML("beforeend", x); document.write(x); el.setAttribute("style", "a"); el.setAttribute(\'style\', "a"); el.style.cssText = "a";',
    );
    expect(BANNED_CALLS.filter((b) => b.pattern.test(bad)).map((b) => b.name)).toEqual([
      "innerHTML",
      "insertAdjacentHTML",
      "document.write",
      'setAttribute("style"',
      "style.cssText",
    ]);
    // Setting a custom property, text or another attribute is fine.
    const fine = stripComments('el.style.setProperty("--x", "1"); el.textContent = t; el.setAttribute("aria-label", t);');
    expect(BANNED_CALLS.some((b) => b.pattern.test(fine))).toBe(false);
  });

  it("reads import specifiers, including side-effect imports and re-exports", () => {
    const code = stripComments('import { a } from "../engine";\nimport type { B } from "./b";\nimport "./c.css";\nexport { d } from "../strings";');
    expect(importsOf(code)).toEqual(["../engine", "./b", "../strings", "./c.css"]);
  });

  it("allows only the engine index, the strings, the settings type and pure siblings", () => {
    const siblings = ["format.ts", "length.ts", "light.ts", "keys.ts", "ui-state.ts"];
    for (const ok of ["../engine", "../strings", "../storage/settings", "./format", "./length"]) expect(importAllowed(ok, siblings), ok).toBe(true);
    for (const bad of ["../engine/step", "../scene", "../scene/index", "../storage/storage", "../distraction/visibility", "./view", "./test-kit", "vitest"]) {
      expect(importAllowed(bad, siblings), bad).toBe(false);
    }
  });

  it("recognizes test-only and forbidden-layer imports", () => {
    for (const s of ["./test-kit", "../engine/test-kit", "../scene/scene-kit", "../distraction/fake-document"]) expect(TEST_ONLY_IMPORT.test(s), s).toBe(true);
    for (const s of ["./format", "../engine", "./test-kitchen"]) expect(TEST_ONLY_IMPORT.test(s), s).toBe(false);
    for (const s of ["../scene", "../scene/index", "../distraction/visibility", "../audio/cues"]) expect(FORBIDDEN_LAYER.test(s), s).toBe(true);
    for (const s of ["../engine", "../strings", "../storage/settings", "./format"]) expect(FORBIDDEN_LAYER.test(s), s).toBe(false);
  });

  it("walks src/ui and treats test-kit.ts and *.test.ts as test files", () => {
    const names = walk(UI_DIR).map((p) => relative(UI_DIR, p).split(sep).join("/"));
    expect(names).toEqual(expect.arrayContaining(["purity.test.ts", "test-kit.ts"]));
    expect(isTestFile(join(UI_DIR, "test-kit.ts"))).toBe(true);
    expect(isTestFile(join(UI_DIR, "format.prop.test.ts"))).toBe(true);
    expect(isTestFile(join(UI_DIR, "format.ts"))).toBe(false);
  });
});

describe("the pure modules are pure (R1.5)", () => {
  const sources = pureSources();

  it("every listed file exists", () => {
    const missing = sources.filter((s) => !existsSync(s.path)).map((s) => s.name);
    expect(missing).toEqual([]);
  });

  for (const { name, pattern } of FORBIDDEN_IN_PURE) {
    it(`no pure module uses ${name}`, () => {
      expect(sources.filter((s) => pattern.test(s.code)).map((s) => s.name)).toEqual([]);
    });
  }

  it("each pure module imports only the engine index, the strings, the settings type and pure siblings (design 1.4)", () => {
    const offenders = sources.flatMap((s) =>
      importsOf(s.code)
        .filter((spec) => !importAllowed(spec, PURE_UI_FILES))
        .map((spec) => `${s.name} imports ${spec}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe("the interface keeps its layers apart (design 1.4, R1.7)", () => {
  const sources = uiSources();

  it("no shipped file anywhere in src imports a test helper (test-kit, scene-kit, fake-document)", () => {
    const shipped = walk(SRC_DIR).filter(
      (p) => /\.ts$/.test(p) && !isTestFile(p) && !/(?:^|[\\/])(?:scene-kit|fake-document)\.ts$/.test(p) && !p.includes(`${sep}hosting${sep}`),
    );
    const offenders = shipped.flatMap((p) =>
      importsOf(stripComments(readFileSync(p, "utf8")))
        .filter((spec) => TEST_ONLY_IMPORT.test(spec))
        .map((spec) => `${relative(SRC_DIR, p)} imports ${spec}`),
    );
    expect(offenders).toEqual([]);
  });

  it("no non-test file in src/ui imports a test helper", () => {
    const offenders = sources.flatMap((s) => importsOf(s.code).filter((spec) => TEST_ONLY_IMPORT.test(spec)).map((spec) => `${s.name} imports ${spec}`));
    expect(offenders).toEqual([]);
  });

  it("no file in src/ui imports the scene, the distraction wiring or audio", () => {
    const offenders = sources.flatMap((s) => importsOf(s.code).filter((spec) => FORBIDDEN_LAYER.test(spec)).map((spec) => `${s.name} imports ${spec}`));
    expect(offenders).toEqual([]);
  });

  for (const { name, pattern } of BANNED_CALLS) {
    it(`no file in src/ui uses ${name}`, () => {
      expect(sources.filter((s) => pattern.test(s.code)).map((s) => s.name)).toEqual([]);
    });
  }
});
