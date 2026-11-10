// Mechanical check of R11.1 and R4.2: the engine touches no DOM, storage, clock or randomness.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ENGINE_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(ENGINE_DIR, "..");

/** Identifiers the engine must never use, matched as whole words. */
const FORBIDDEN: readonly { name: string; pattern: RegExp }[] = [
  { name: "window", pattern: /\bwindow\b/ },
  { name: "document", pattern: /\bdocument\b/ },
  { name: "localStorage", pattern: /\blocalStorage\b/ },
  { name: "Date.now", pattern: /\bDate\.now\b/ },
  { name: "performance", pattern: /\bperformance\b/ },
  { name: "Math.random", pattern: /\bMath\.random\b/ },
];

/** Engine files may not import from these layers. */
const FORBIDDEN_IMPORT = /\b(?:from|import)\s*\(?\s*["'][^"']*\/(?:storage|ui|scene|audio)(?:\/[^"']*)?["']/;
const TEST_KIT_IMPORT = /\b(?:from|import)\s*\(?\s*["'][^"']*\/test-kit(?:\.[a-z]+)?["']/;

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

const isTestFile = (name: string): boolean => /\.(?:prop\.)?test\.ts$/.test(name) || name === "test-kit.ts";

function engineSources(): { name: string; code: string }[] {
  return readdirSync(ENGINE_DIR)
    .filter((n) => n.endsWith(".ts") && !isTestFile(n))
    .map((name) => ({ name, code: stripComments(readFileSync(join(ENGINE_DIR, name), "utf8")) }));
}

function allSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? allSourceFiles(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : [],
  );
}

describe("stripComments (the scanner itself)", () => {
  it("removes line and block comments", () => {
    const out = stripComments("const a = 1; // stored document\n/* window\nlocalStorage */ const b = 2;");
    expect(out).not.toMatch(/document|window|localStorage/);
    expect(out).toContain("const a = 1;");
    expect(out).toContain("const b = 2;");
  });

  it("keeps code and string contents, including a // inside a string", () => {
    expect(stripComments('const u = "http://x"; const w = window;')).toBe('const u = "http://x"; const w = window;');
    expect(stripComments("const s = 'it\\'s // fine'; // gone")).toBe("const s = 'it\\'s // fine'; ");
  });

  it("catches forbidden identifiers in code but not words inside longer identifiers", () => {
    const bad = stripComments("const x = window.innerWidth; Date.now(); Math.random();");
    expect(FORBIDDEN.filter((f) => f.pattern.test(bad)).map((f) => f.name)).toEqual(["window", "Date.now", "Math.random"]);
    const ok = stripComments("const windowed = documentation + performanceBudget; // window");
    expect(FORBIDDEN.some((f) => f.pattern.test(ok))).toBe(false);
  });

  it("catches forbidden imports", () => {
    expect(FORBIDDEN_IMPORT.test('import { x } from "../storage/storage";')).toBe(true);
    expect(FORBIDDEN_IMPORT.test("import { x } from '../ui';")).toBe(true);
    expect(FORBIDDEN_IMPORT.test('import { x } from "./history";')).toBe(false);
  });
});

describe("engine purity", () => {
  const sources = engineSources();

  it("finds the engine sources", () => {
    const names = sources.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(["step.ts", "settle.ts", "serialize.ts", "selectors.ts"]));
    expect(names).not.toContain("test-kit.ts");
  });

  for (const { name, pattern } of FORBIDDEN) {
    it(`no non-test engine file uses ${name}`, () => {
      const offenders = sources.filter((s) => pattern.test(s.code)).map((s) => s.name);
      expect(offenders).toEqual([]);
    });
  }

  it("no non-test engine file imports from storage, ui, scene or audio", () => {
    const offenders = sources.filter((s) => FORBIDDEN_IMPORT.test(s.code)).map((s) => s.name);
    expect(offenders).toEqual([]);
  });
});

describe("test-kit is test-only", () => {
  it("no non-test source file in src imports it", () => {
    const offenders = allSourceFiles(SRC_DIR)
      .filter((file) => !isTestFile(file.split(/[\\/]/).pop() ?? ""))
      .filter((file) => TEST_KIT_IMPORT.test(stripComments(readFileSync(file, "utf8"))))
      .map((file) => file.slice(SRC_DIR.length + 1));
    expect(offenders).toEqual([]);
  });
});
