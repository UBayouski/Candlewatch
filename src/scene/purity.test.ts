// Mechanical check of R1 and R2: the scene model is pure and reads the engine only through its public surface.
// Same technique as the engine's purity test: strip comments, match whole words.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCENE_DIR = dirname(fileURLToPath(import.meta.url));

/** The model files: strictly pure (design 12.2). */
const MODEL_FILES = ["types.ts", "constants.ts", "flicker.ts", "model.ts"] as const;

const FORBIDDEN_IN_MODEL: readonly { name: string; pattern: RegExp }[] = [
  { name: "window", pattern: /\bwindow\b/ },
  { name: "document", pattern: /\bdocument\b/ },
  { name: "localStorage", pattern: /\blocalStorage\b/ },
  { name: "Date.now", pattern: /\bDate\.now\b/ },
  { name: "performance", pattern: /\bperformance\b/ },
  { name: "Math.random", pattern: /\bMath\.random\b/ },
  { name: "matchMedia", pattern: /\bmatchMedia\b/ },
  { name: "setTimeout", pattern: /\bsetTimeout\b/ },
  { name: "setInterval", pattern: /\bsetInterval\b/ },
  { name: "requestAnimationFrame", pattern: /\brequestAnimationFrame\b/ },
];

/** Forbidden in every non-test file of src/scene (R1.3): the clock and the redraw loop belong to main.ts. */
const FORBIDDEN_EVERYWHERE: readonly { name: string; pattern: RegExp }[] = [
  { name: "Date.now", pattern: /\bDate\.now\b/ },
  { name: "performance.now", pattern: /\bperformance\.now\b/ },
  { name: "setTimeout", pattern: /\bsetTimeout\b/ },
  { name: "setInterval", pattern: /\bsetInterval\b/ },
  { name: "requestAnimationFrame", pattern: /\brequestAnimationFrame\b/ },
];

/** State fields the model must not read (R1.2). */
const FORBIDDEN_STATE_FIELDS: readonly { name: string; pattern: RegExp }[] = [
  { name: ".session", pattern: /\.session\b/ },
  { name: ".litSince", pattern: /\.litSince\b/ },
  { name: ".pausedAt", pattern: /\.pausedAt\b/ },
  { name: ".history", pattern: /\.history\b/ },
  { name: ".endedAt", pattern: /\.endedAt\b/ },
  { name: ".breakEndsAt", pattern: /\.breakEndsAt\b/ },
];

const TEST_ONLY_IMPORT = /\b(?:from|import)\s*\(?\s*["'][^"']*\/(?:test-kit|scene-kit|fake-document)(?:\.[a-z]+)?["']/;
const FORBIDDEN_LAYER_IMPORT = /\b(?:from|import)\s*\(?\s*["'][^"']*\/(?:storage|ui|audio|distraction)(?:\/[^"']*)?["']/;
const ENGINE_IMPORT = /\bimport\b[^;]*?\bfrom\s*["']((?:\.\.\/)+engine(?:\/[^"']*)?)["']/g;

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

const isTestFile = (name: string): boolean =>
  /\.(?:prop\.)?test\.ts$/.test(name) || name === "scene-kit.ts";

function read(name: string): string {
  return stripComments(readFileSync(join(SCENE_DIR, name), "utf8"));
}

function sceneSources(): { name: string; code: string }[] {
  return readdirSync(SCENE_DIR)
    .filter((n) => n.endsWith(".ts") && !isTestFile(n))
    .map((name) => ({ name, code: read(name) }));
}

/** The engine imports of a file: the module path and the imported names. */
function engineImports(code: string): { path: string; text: string }[] {
  return [...code.matchAll(ENGINE_IMPORT)].map((m) => ({ path: m[1] ?? "", text: m[0] }));
}

describe("stripComments (the scanner itself)", () => {
  it("removes line and block comments but keeps code and strings", () => {
    const out = stripComments('const a = 1; // the window\n/* document\nlocalStorage */ const b = "http://x";');
    expect(out).not.toMatch(/window|document|localStorage/);
    expect(out).toContain('const b = "http://x";');
  });

  it("catches forbidden identifiers as whole words only", () => {
    const bad = stripComments("const w = window.innerWidth; Math.random(); matchMedia('x');");
    expect(FORBIDDEN_IN_MODEL.filter((f) => f.pattern.test(bad)).map((f) => f.name)).toEqual([
      "window",
      "Math.random",
      "matchMedia",
    ]);
    expect(FORBIDDEN_IN_MODEL.some((f) => f.pattern.test(stripComments("const windowed = documentation;")))).toBe(false);
  });

  it("recognizes engine imports and test-only imports", () => {
    expect(engineImports('import { isBreak } from "../engine";')[0]?.path).toBe("../engine");
    expect(engineImports('import { x } from "../engine/step";')[0]?.path).toBe("../engine/step");
    expect(engineImports('import { x } from "./other";')).toHaveLength(0);
    expect(TEST_ONLY_IMPORT.test('import { x } from "../engine/test-kit";')).toBe(true);
    expect(TEST_ONLY_IMPORT.test('import { x } from "./scene-kit";')).toBe(true);
    expect(TEST_ONLY_IMPORT.test('import { x } from "./model";')).toBe(false);
    expect(FORBIDDEN_LAYER_IMPORT.test('import { x } from "../storage/storage";')).toBe(true);
  });
});

describe("the scene model is pure (R2.1)", () => {
  const present = MODEL_FILES.filter((f) => readdirSync(SCENE_DIR).includes(f));

  it("finds the model files that exist so far", () => {
    expect(present).toEqual(expect.arrayContaining(["types.ts", "constants.ts"]));
  });

  for (const { name, pattern } of FORBIDDEN_IN_MODEL) {
    it(`no model file uses ${name}`, () => {
      const offenders = present.filter((f) => pattern.test(read(f)));
      expect(offenders).toEqual([]);
    });
  }

  it("no model file imports from storage, ui, audio or distraction", () => {
    expect(present.filter((f) => FORBIDDEN_LAYER_IMPORT.test(read(f)))).toEqual([]);
  });

  it("the only engine import of a model file is the public index", () => {
    for (const f of present) {
      for (const imp of engineImports(read(f))) expect(imp.path, f).toBe("../engine");
    }
  });

  it("model.ts imports only timeLeftMs, waxFraction, isBreak and the State type from the engine", () => {
    if (!present.includes("model.ts")) return;
    const imports = engineImports(read("model.ts"));
    expect(imports.length).toBeGreaterThan(0);
    for (const imp of imports) {
      const names = (imp.text.match(/\{([^}]*)\}/)?.[1] ?? "").split(",").map((s) => s.trim().replace(/^type\s+/, ""));
      for (const n of names.filter(Boolean)) {
        expect(["timeLeftMs", "waxFraction", "isBreak", "State"], `${n} in model.ts`).toContain(n);
      }
    }
  });

  it("model.ts does not read state fields other than phase (R1.2)", () => {
    if (!present.includes("model.ts")) return;
    const code = read("model.ts");
    expect(FORBIDDEN_STATE_FIELDS.filter((f) => f.pattern.test(code)).map((f) => f.name)).toEqual([]);
  });
});

describe("no file in src/scene owns time or imports a test helper (R1.3)", () => {
  const sources = sceneSources();

  it("finds the non-test sources", () => {
    expect(sources.map((s) => s.name)).toEqual(expect.arrayContaining(["types.ts", "constants.ts"]));
    expect(sources.map((s) => s.name)).not.toContain("scene-kit.ts");
  });

  for (const { name, pattern } of FORBIDDEN_EVERYWHERE) {
    it(`no non-test file uses ${name}`, () => {
      expect(sources.filter((s) => pattern.test(s.code)).map((s) => s.name)).toEqual([]);
    });
  }

  it("no non-test file imports test-kit or scene-kit", () => {
    expect(sources.filter((s) => TEST_ONLY_IMPORT.test(s.code)).map((s) => s.name)).toEqual([]);
  });
});

describe("the renderer does not touch the engine (design 1.2)", () => {
  it("render.ts has no import from the engine", () => {
    if (!readdirSync(SCENE_DIR).includes("render.ts")) return;
    expect(engineImports(read("render.ts"))).toEqual([]);
  });
});
