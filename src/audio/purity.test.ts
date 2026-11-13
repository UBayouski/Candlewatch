// Mechanical check of sound-and-title R1.2, R1.3, R1.10, R1.11 (task 4.1, design 2.2): the pure audio modules read no DOM, clock,
// randomness, storage or audio API, import only the engine's index, the strings and their pure siblings, and hold no visible text.
// Same technique as src/ui/purity.test.ts: strip comments, then match whole words.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const AUDIO_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(AUDIO_DIR, "..");

/** The pure files of src/audio (design 2.1). The test fails if one is missing. */
const PURE_AUDIO_FILES: readonly string[] = ["types.ts", "cue.ts", "specs.ts", "noise.ts"];

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

/** The only string literals a pure audio file may hold: cue ids, voice and filter kinds, waveforms, phase and event names. */
const ALLOWED_LITERALS = new Set([
  "strike", "chime", "breath",
  "osc", "noise",
  "sine", "triangle", "sawtooth", "square",
  "lowpass", "bandpass", "highpass",
  "idle", "lit", "paused", "burned-out", "snuffed",
  "light", "pause", "resume", "snuff", "tick", "hide", "show", "reload",
  // The key of an indexed-access type, `Event["type"]` in types.ts.
  "type",
]);

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

/** What a pure audio file may import (design 2.2): the engine's index, the strings and its pure siblings. */
function importAllowed(specifier: string): boolean {
  if (specifier === "../engine" || specifier === "../strings") return true;
  const sibling = /^\.\/([a-z-]+)$/.exec(specifier)?.[1];
  return sibling !== undefined && PURE_AUDIO_FILES.includes(`${sibling}.ts`);
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}
const isTestFile = (path: string): boolean => /\.(?:prop\.)?test\.ts$/.test(path) || /(?:^|[\\/])(?:test-kit|[a-z-]+-kit|fake-[a-z-]+)\.ts$/.test(path);

const sources = PURE_AUDIO_FILES.map((name) => {
  const path = join(AUDIO_DIR, name);
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
    expect(importAllowed("./cue")).toBe(true);
    expect(importAllowed("./audio-player")).toBe(false);
  });
});

describe("the pure audio modules are pure (R1.2, R1.3)", () => {
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

  it("holds no visible text: every string literal is a cue id, a kind, a waveform, a phase or an event name (R1.10)", () => {
    expect(sources.flatMap((s) => literalsOf(s.code).filter((l) => !ALLOWED_LITERALS.has(l)).map((l) => `${s.name}: ${JSON.stringify(l)}`))).toEqual([]);
  });

  it("no file of src/audio, comments included, contains the trademarked timer word (R1.11)", () => {
    const files = readdirSync(AUDIO_DIR).filter((n) => n.endsWith(".ts") && n !== "purity.test.ts");
    expect(files.filter((n) => TIMER_WORD.test(readFileSync(join(AUDIO_DIR, n), "utf8")))).toEqual([]);
  });
});

describe("test helpers stay in the tests", () => {
  it("no shipped file under src/ imports a test-kit or a fake-* file", () => {
    const offenders = walk(SRC_DIR)
      .filter((p) => p.endsWith(".ts") && !isTestFile(p))
      .flatMap((p) =>
        importsOf(stripComments(readFileSync(p, "utf8")))
          .filter((i) => /(?:^|\/)(?:test-kit|fake-[a-z-]+)$/.test(i))
          .map((i) => `${relative(SRC_DIR, p).split(sep).join("/")} imports ${i}`),
      );
    expect(offenders).toEqual([]);
  });
});

// --- the effect files (task 11.1, design 2.2; R1.4, R1.9, R4.15) ---------------------------------------------------------

const read = (name: string): string => {
  const path = join(AUDIO_DIR, name);
  return existsSync(path) ? stripComments(readFileSync(path, "utf8")) : "";
};

/** The text of the function `name` in `code` (its signature and its balanced body), or "" when it is not there. */
function functionText(code: string, name: string): string {
  const start = code.indexOf(`function ${name}(`);
  if (start === -1) return "";
  const open = code.indexOf("{", code.indexOf(")", start));
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code.charAt(i) === "{") depth++;
    else if (code.charAt(i) === "}" && --depth === 0) return code.slice(start, i + 1);
  }
  return code.slice(start);
}

/** What the player must never use: no sound file, no element audio, no network, no prefixed constructor, no timer. */
const FORBIDDEN_IN_PLAYER: readonly { name: string; pattern: RegExp }[] = [
  { name: "Audio(", pattern: /\bAudio\s*\(/ },
  { name: "<audio>", pattern: /<audio\b/i },
  { name: "fetch", pattern: /\bfetch\b/ },
  { name: "XMLHttpRequest", pattern: /\bXMLHttpRequest\b/ },
  { name: "webkitAudioContext", pattern: /\bwebkitAudioContext\b/ },
  { name: "setTimeout", pattern: /\bsetTimeout\b/ },
  { name: ".mp3", pattern: /\.mp3\b/i },
  { name: ".wav", pattern: /\.wav\b/i },
  { name: ".ogg", pattern: /\.ogg\b/i },
];

/** The only string literals an effect file of src/audio may hold: ids, kinds, states and event names (no visible text, R1.10). */
const ALLOWED_EFFECT_LITERALS = new Set([
  ...ALLOWED_LITERALS,
  "locked", "unlocked", "failed",
  "suspended", "running", "closed",
  "undefined", "function",
  "keydown", "pointerdown", "touchend",
]);

describe("the effect files of src/audio", () => {
  const player = read("audio-player.ts");
  const gesture = read("gesture.ts");

  it("the scanner finds a function's body", () => {
    expect(functionText("function a() { if (x) { y(); } } function b() {}", "a")).toBe("function a() { if (x) { y(); } }");
    expect(functionText("const z = 1;", "a")).toBe("");
  });

  it("both files exist", () => {
    expect(player).not.toBe("");
    expect(gesture).not.toBe("");
  });

  for (const { name, pattern } of FORBIDDEN_IN_PLAYER) {
    it(`audio-player.ts never uses ${name}`, () => {
      expect(pattern.test(player)).toBe(false);
    });
  }

  it("audio-player.ts names window and AudioContext only inside browserAudioFactory (R1.4)", () => {
    const factory = functionText(player, "browserAudioFactory");
    expect(factory).toMatch(/\bwindow\.AudioContext\b/);
    const rest = player.replace(factory, "");
    expect(/\bwindow\b/.test(rest)).toBe(false);
    expect(/\bAudioContext\b/.test(rest)).toBe(false);
  });

  it("audio-player.ts imports only the pure audio files", () => {
    expect(importsOf(player).filter((i) => !importAllowed(i) || i === "../engine" || i === "../strings")).toEqual([]);
  });

  it("gesture.ts names neither window nor document, and imports nothing", () => {
    expect(/\bwindow\b/.test(gesture)).toBe(false);
    expect(/\bdocument\b/.test(gesture)).toBe(false);
    expect(importsOf(gesture)).toEqual([]);
  });

  it("every shipped file of src/audio holds no visible text (R1.10)", () => {
    const shipped = readdirSync(AUDIO_DIR).filter((n) => n.endsWith(".ts") && !isTestFile(join(AUDIO_DIR, n)));
    expect(shipped).toEqual(expect.arrayContaining(["audio-player.ts", "gesture.ts", ...PURE_AUDIO_FILES]));
    expect(shipped.flatMap((n) => literalsOf(read(n)).filter((l) => !ALLOWED_EFFECT_LITERALS.has(l)).map((l) => `${n}: ${JSON.stringify(l)}`))).toEqual([]);
  });
});
