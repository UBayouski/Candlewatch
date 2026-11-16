import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { INITIAL_STATE, step } from "./engine";
import { indexHistory } from "./graveyard/days";
import { cardLines } from "./graveyard/text";
import { titleFor } from "./page/title";
import { STRINGS } from "./strings";
import { fill } from "./ui/format";
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
    const allowed = new Set(["n", "day", "month", "intent", "date", "time", "text"]);
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
    const visible = (s: string): boolean => !/^[a-z][A-Za-z0-9-]*(?: [a-z][A-Za-z0-9-]*)*$/.test(s) && (/[A-Za-z]{2,}\s+[A-Za-z]/.test(s) || /[A-Za-z]{3,}[.!?�]$/.test(s));
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

// ---------------------------------------------------------------------------------------------------------------------------
// sound-and-title task 17.1 (design 4.4): the checks that hold the whole strings file honest. Every failure names the key.

/** The trademarked timer word, built from fragments so this file passes its own scan. */
const TIMER_WORD = ["pomo", "doro"].join("");
const MIDDLE_DOT = "\u00b7";

describe("the strings file as a whole (sound-and-title design 4.4)", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const walkAll = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walkAll(join(d, n)) : [join(d, n)]));
  const isTestOnly = (p: string): boolean => {
    const rel = relative(dir, p).split(sep).join("/");
    return (
      rel === "strings.ts" ||
      rel.startsWith("hosting/") ||
      /\.(?:prop\.)?test\.ts$/.test(rel) ||
      /(?:^|\/)test-kit\.ts$/.test(rel) ||
      /(?:^|\/)fake-[^/]*\.ts$/.test(rel) ||
      /-kit\.ts$/.test(rel)
    );
  };
  const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  /** Every shipped source file under src/ (not strings.ts, not a test, kit or fake), comments removed. */
  const shipped = walkAll(dir)
    .filter((p) => p.endsWith(".ts") && !isTestOnly(p))
    .map((p) => ({ name: relative(dir, p).split(sep).join("/"), code: strip(readFileSync(p, "utf8")) }));

  /** Every leaf of STRINGS: a string, or an array (`graveyard.months`) taken as one leaf. */
  const leafOf = (prefix: string, value: unknown): { key: string; value: string | readonly string[] }[] => {
    if (typeof value === "string") return [{ key: prefix, value }];
    if (Array.isArray(value)) return [{ key: prefix, value: value as readonly string[] }];
    if (value !== null && typeof value === "object") {
      return Object.entries(value).flatMap(([k, v]) => leafOf(prefix === "" ? k : `${prefix}.${k}`, v));
    }
    return [];
  };
  const leaves = leafOf("", STRINGS);
  const textsOfLeaf = (leaf: { value: string | readonly string[] }): readonly string[] => (typeof leaf.value === "string" ? [leaf.value] : leaf.value);
  const valueOf = (key: string): string => {
    const leaf = leaves.find((l) => l.key === key);
    if (leaf === undefined || typeof leaf.value !== "string") throw new Error(`no string leaf ${key}`);
    return leaf.value;
  };

  // ---- every key is used ----------------------------------------------------------------------------------------------

  /** The groups that shipped code reads with a computed key, `STRINGS.<group>[...]`: the whole group counts as used. Listed on purpose: a new one must be added here. */
  const COMPUTED_READS = ["announce", "graveyard.months", "scene"];

  it("reads only the groups of the explicit list with a computed key", () => {
    const found = new Set<string>();
    for (const { code } of shipped) for (const m of code.matchAll(/STRINGS((?:\.[A-Za-z0-9]+)*)\[/g)) found.add((m[1] ?? "").slice(1));
    expect([...found].sort()).toEqual(COMPUTED_READS);
  });

  it("uses every leaf key of STRINGS in some shipped file, whole or through a computed group read", () => {
    const all = shipped.map((s) => s.code).join("\n");
    const unused = leaves
      .map((l) => l.key)
      .filter((key) => {
        const whole = new RegExp(`STRINGS\\.${key.replace(/\./g, "\\.")}(?![A-Za-z0-9])`);
        if (whole.test(all)) return false;
        return !COMPUTED_READS.some((group) => key.startsWith(`${group}.`));
      });
    expect(unused, `unused keys: ${unused.join(", ")}`).toEqual([]);
  });

  // ---- no timer word, no product name ---------------------------------------------------------------------------------

  it("has no leaf value with the trademarked timer word", () => {
    const bad = leaves.filter((l) => textsOfLeaf(l).some((s) => s.toLowerCase().includes(TIMER_WORD))).map((l) => l.key);
    expect(bad, `keys with the timer word: ${bad.join(", ")}`).toEqual([]);
  });

  it("has no leaf value that names a trademark or a logo (the product name is allowed)", () => {
    const names = ["google", "apple", "microsoft", "amazon", "facebook", "meta", "spotify", "todoist", "notion", "slack", "tiktok", "youtube", "kiro"];
    const bad = leaves
      .filter((l) => textsOfLeaf(l).some((s) => names.some((n) => new RegExp(`\\b${n}\\b`, "i").test(s.replace(/candlewatch/gi, "")))))
      .map((l) => l.key);
    expect(bad, `keys naming a trademark: ${bad.join(", ")}`).toEqual([]);
  });

  // ---- placeholders ---------------------------------------------------------------------------------------------------

  /** The balanced-parenthesis argument text of every `fill(...)` call in a source. */
  const fillCalls = (code: string): string[] => {
    const calls: string[] = [];
    for (const m of code.matchAll(/\bfill\(/g)) {
      let depth = 1;
      let i = (m.index ?? 0) + m[0].length;
      const start = i;
      for (; i < code.length && depth > 0; i++) {
        if (code[i] === "(") depth++;
        else if (code[i] === ")") depth--;
      }
      calls.push(code.slice(start, i - 1));
    }
    return calls;
  };
  /** The names a call gives to `fill`: the keys of its object literal, `{ n }` and `{ n: 1 }` alike. */
  const namesGiven = (call: string): Set<string> => new Set([...call.matchAll(/[{,]\s*([A-Za-z0-9_]+)\s*(?=[:,}])/g)].map((m) => m[1] ?? ""));

  /** The placeholder table of design 4.4: each template, its placeholders and the files that fill it. */
  const FILLERS: Record<string, { names: string[]; files: string[] }> = {
    "pageTitle.lit": { names: ["time", "name"], files: ["page/title.ts"] },
    "pageTitle.paused": { names: ["time", "name"], files: ["page/title.ts"] },
    "pageTitle.burnedOut": { names: ["name"], files: ["page/title.ts"] },
    "pageTitle.snuffed": { names: ["name"], files: ["page/title.ts"] },
    "graveyard.carvedDate": { names: ["day", "month"], files: ["graveyard/days.ts"] },
    "graveyard.itemName": { names: ["intent", "date"], files: ["graveyard/text.ts"] },
    "graveyard.olderStone": { names: ["n"], files: ["graveyard/text.ts"] },
    "graveyard.olderStones": { names: ["n"], files: ["graveyard/text.ts"] },
    "graveyard.olderDay": { names: ["n"], files: ["graveyard/text.ts"] },
    "graveyard.olderDays": { names: ["n"], files: ["graveyard/text.ts"] },
    "graveyard.more": { names: ["n"], files: ["graveyard/text.ts"] },
    "ghosts.overflow": { names: ["n"], files: ["ghosts/layer.ts"] },
    "graveyard.card.stoneLine": { names: ["intent"], files: ["graveyard/text.ts"] },
    "graveyard.card.stubLine": { names: ["intent"], files: ["graveyard/text.ts"] },
    "graveyard.card.quoted": { names: ["text"], files: ["graveyard/text.ts"] },
    "graveyard.card.planned": { names: ["time"], files: ["graveyard/text.ts"] },
    "graveyard.card.distractions": { names: ["n"], files: ["graveyard/text.ts"] },
    "graveyard.card.away": { names: ["time"], files: ["graveyard/text.ts"] },
    "count.distraction": { names: ["n"], files: ["ghosts/label.ts"] },
    "count.distractions": { names: ["n"], files: ["ghosts/label.ts"] },
    // The existing keys, filled in src/ui/ (their callers as they are today).
    "time.minute": { names: ["n"], files: ["ui/format.ts"] },
    "time.minutes": { names: ["n"], files: ["ui/format.ts"] },
    "time.second": { names: ["n"], files: ["ui/format.ts"] },
    "time.seconds": { names: ["n"], files: ["ui/format.ts"] },
    "time.timeLeft": { names: ["time"], files: ["ui/view.ts"] },
    "status.pauseLeft": { names: ["time"], files: ["ui/view.ts"] },
    "status.lengthRange": { names: ["min", "max"], files: ["ui/view.ts"] },
    "length.preset": { names: ["n"], files: ["ui/view.ts", "ui/dom/build.ts"] },
    "intent.hint": { names: ["max"], files: ["ui/view.ts"] },
    "intent.count": { names: ["n", "max"], files: ["ui/view.ts"] },
    "intent.overLimit": { names: ["max"], files: ["ui/view.ts"] },
    "announce.lit": { names: ["time"], files: ["ui/announcer.ts"] },
    "announce.restored": { names: ["time"], files: ["ui/announcer.ts"] },
    "announce.q75": { names: ["time"], files: ["ui/announcer.ts"] },
    "announce.q50": { names: ["time"], files: ["ui/announcer.ts"] },
    "announce.q25": { names: ["time"], files: ["ui/announcer.ts"] },
    "announce.refused": { names: ["min", "max"], files: ["ui/announcer.ts"] },
    "announce.timeOnRequest": { names: ["time"], files: ["ui/announcer.ts"] },
    "announce.timeOnRequestPaused": { names: ["time"], files: ["ui/announcer.ts"] },
    "announce.limit": { names: ["max"], files: ["ui/announcer.ts"] },
  };
  const placeholdersOf = (text: string): string[] => [...new Set([...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1] ?? ""))].sort();

  it("lists, in the placeholder table, exactly the placeholders each template holds, and lists no key that is not there", () => {
    const problems: string[] = [];
    for (const leaf of leaves) {
      const found = textsOfLeaf(leaf).flatMap(placeholdersOf);
      const row = FILLERS[leaf.key];
      if (found.length > 0 && row === undefined) problems.push(`${leaf.key}: placeholder ${found.join(", ")} has no caller in the table`);
      else if (row !== undefined && [...row.names].sort().join(",") !== [...new Set(found)].sort().join(",")) {
        problems.push(`${leaf.key}: the table says {${row.names.join(", ")}}, the value holds {${found.join(", ")}}`);
      }
    }
    for (const key of Object.keys(FILLERS)) if (!leaves.some((l) => l.key === key)) problems.push(`${key}: in the table, not in STRINGS`);
    expect(problems).toEqual([]);
  });

  it("fills every placeholder of every template in the file the table names", () => {
    const problems: string[] = [];
    for (const [key, row] of Object.entries(FILLERS)) {
      const direct = new RegExp(`STRINGS\\.${key.replace(/\./g, "\\.")}(?![A-Za-z0-9])`);
      for (const file of row.files) {
        const source = shipped.find((s) => s.name === file);
        if (source === undefined) {
          problems.push(`${key}: filler file ${file} does not exist`);
          continue;
        }
        const calls = fillCalls(source.code);
        const reading = calls.filter((c) => direct.test(c));
        if (reading.length > 0) {
          // The template is named in a fill call: that very call must give every placeholder.
          for (const call of reading) for (const name of row.names) if (!namesGiven(call).has(name)) problems.push(`${key}: ${file} fills it without {${name}}`);
        } else if (!COMPUTED_READS.some((group) => key.startsWith(`${group}.`))) {
          problems.push(`${key}: ${file} has no fill() call that names it`);
        } else {
          // A computed read (the announcer picks the template by key): the file must give each name somewhere in a fill call.
          for (const name of row.names) if (!calls.some((c) => namesGiven(c).has(name))) problems.push(`${key}: ${file} never fills {${name}}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  // ---- tone: state lines and data labels ------------------------------------------------------------------------------

  /** Worst-case values for the placeholders, so the length of a filled line is measured, not the template. */
  const WORST = { time: "90 minutes 59 seconds", n: "99", min: 5, max: 90 };

  it("keeps every state line and announcement at most 60 characters and ends it with a full stop", () => {
    const stateKeys = [
      "graveyard.noStones",
      "graveyard.noStubs",
      "graveyard.announceOpen",
      "graveyard.announceLeave",
      ...leaves.map((l) => l.key).filter((k) => (k.startsWith("status.") && k !== "status.pauseLeft") || k.startsWith("announce.")),
    ];
    const problems: string[] = [];
    for (const key of stateKeys) {
      const filled = fill(valueOf(key), WORST);
      if (filled.length > 60) problems.push(`${key}: ${filled.length} characters`);
      if (!filled.endsWith(".")) problems.push(`${key}: does not end with a full stop`);
    }
    expect(problems).toEqual([]);
    expect(stateKeys.length).toBeGreaterThan(20);
  });

  it("has no exclamation mark in any data label, and no page title template that holds the intent", () => {
    const labelKeys = leaves.map((l) => l.key).filter((k) => /^(graveyard|count|ghosts|pageTitle)\./.test(k));
    const bang = labelKeys.filter((k) => textsOfLeaf(leaves.find((l) => l.key === k) ?? { value: "" }).some((s) => s.includes("!")));
    expect(bang, `labels with "!": ${bang.join(", ")}`).toEqual([]);
    for (const key of ["pageTitle.lit", "pageTitle.paused", "pageTitle.burnedOut", "pageTitle.snuffed"]) {
      expect(valueOf(key), key).not.toMatch(/intent/i);
    }
  });

  // ---- rendered text through the real code ----------------------------------------------------------------------------

  it("renders the four first card lines of R8.13 through the real cardLines", () => {
    const base = { startedAt: Date.UTC(2026, 10, 7, 9), endedAt: Date.UTC(2026, 10, 7, 10), lengthMin: 25, distractions: 0, timeAwayMs: 0 } as const;
    const first = (outcome: "snuffed" | "burned-out", intent: string | null): string | undefined => {
      const [item] = indexHistory([{ ...base, outcome, intent }], () => "2026-11-07");
      if (!item) throw new Error("no item");
      const lines = cardLines(item);
      expect(lines, `${outcome} ${String(intent)}`).toHaveLength(5);
      return lines[0];
    };
    expect(first("snuffed", "write the report")).toBe('Here lies "write the report"');
    expect(first("snuffed", null)).toBe("Here lies an unnamed watch");
    expect(first("burned-out", "write the report")).toBe("Burned to the end: write the report");
    expect(first("burned-out", null)).toBe("Burned to the end: an unnamed watch");
  });

  it("renders the title forms of R6.1 to R6.5 through the real titleFor", () => {
    const T0 = 1_800_000_000_000;
    const lit = step(INITIAL_STATE, { type: "light", length: 25 }, T0);
    const at = T0 + 12 * 60_000 + 29_000;
    const paused = step(lit, { type: "pause" }, at);
    const dawn = step(lit, { type: "tick" }, T0 + 25 * 60_000);
    const dark = step(lit, { type: "snuff" }, T0 + 7 * 60_000);
    const name = "Candlewatch";
    expect(titleFor(INITIAL_STATE, T0)).toBe(name);
    expect(titleFor(lit, at)).toBe(valueOf("pageTitle.lit").replace("{time}", "12:31").replace("{name}", name));
    expect(titleFor(lit, at)).toBe(`12:31 ${MIDDLE_DOT} ${name}`);
    expect(titleFor(paused, at)).toBe(`12:31 paused ${MIDDLE_DOT} ${name}`);
    expect(titleFor(dawn, T0 + 25 * 60_000)).toBe(`Morning ${MIDDLE_DOT} ${name}`);
    expect(titleFor(dark, T0 + 8 * 60_000)).toBe(`Dark ${MIDDLE_DOT} ${name}`);
  });

  // ---- locked groups and months ---------------------------------------------------------------------------------------

  it("keeps STRINGS.scene and STRINGS.time exactly as they are today (R8.12)", () => {
    expect(STRINGS.scene).toEqual({
      unlit: "An unlit candle.",
      steady: "The candle burns.",
      paused: "The flame is low and blue.",
      guttering: "The flame gutters.",
      smoke: "Smoke curls from the wick.",
    });
    expect(STRINGS.time).toEqual({
      minute: "{n} minute",
      minutes: "{n} minutes",
      second: "{n} second",
      seconds: "{n} seconds",
      timeLeft: "{time} left",
      timeUnknown: "--:--",
    });
  });

  it("has twelve non-empty three-letter month names in calendar order", () => {
    const months = STRINGS.graveyard.months;
    expect(months).toHaveLength(12);
    for (const m of months) {
      expect(m.length, m).toBe(3);
    }
    expect([...months]).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
  });
});

// room-art R2.6: the exact visible string key set at batch 2 intake.
it("room-art adds no visible string key",()=>{
 const keyPaths=(v: object,p=""): string[] => Object.entries(v).flatMap(([k,x]: [string,unknown])=>x!==null&&typeof x==="object"?keyPaths(x,p+k+"."):[p+k]).sort();
 expect(keyPaths(STRINGS)).toEqual([
  "announce.burnedOut",
  "announce.lastMinute",
  "announce.limit",
  "announce.lit",
  "announce.paused",
  "announce.q25",
  "announce.q50",
  "announce.q75",
  "announce.refused",
  "announce.restored",
  "announce.resumed",
  "announce.snuffed",
  "announce.timeOnRequest",
  "announce.timeOnRequestPaused",
  "count.distraction",
  "count.distractions",
  "ghosts.overflow",
  "graveyard.announceLeave",
  "graveyard.announceOpen",
  "graveyard.back",
  "graveyard.card.away",
  "graveyard.card.distractions",
  "graveyard.card.planned",
  "graveyard.card.quoted",
  "graveyard.card.stoneLine",
  "graveyard.card.stubLine",
  "graveyard.card.unnamed",
  "graveyard.carvedDate",
  "graveyard.door",
  "graveyard.graveyardLabel",
  "graveyard.itemName",
  "graveyard.months.0",
  "graveyard.months.1",
  "graveyard.months.10",
  "graveyard.months.11",
  "graveyard.months.2",
  "graveyard.months.3",
  "graveyard.months.4",
  "graveyard.months.5",
  "graveyard.months.6",
  "graveyard.months.7",
  "graveyard.months.8",
  "graveyard.months.9",
  "graveyard.more",
  "graveyard.noIntent",
  "graveyard.noStones",
  "graveyard.noStubs",
  "graveyard.olderDay",
  "graveyard.olderDays",
  "graveyard.olderStone",
  "graveyard.olderStones",
  "graveyard.shelfLabel",
  "graveyard.title",
  "graveyard.unknownDate",
  "intent.count",
  "intent.hint",
  "intent.label",
  "intent.overLimit",
  "intent.placeholderShort",
  "length.custom",
  "length.group",
  "length.placeholder",
  "length.preset",
  "light.again",
  "light.light",
  "pageTitle.burnedOut",
  "pageTitle.lit",
  "pageTitle.paused",
  "pageTitle.snuffed",
  "pause.pause",
  "pause.resume",
  "region.watch",
  "scene.guttering",
  "scene.paused",
  "scene.smoke",
  "scene.steady",
  "scene.unlit",
  "settings.close",
  "settings.defaultLength",
  "settings.ghosts",
  "settings.off",
  "settings.on",
  "settings.open",
  "settings.sound",
  "settings.title",
  "setup.label",
  "snuff.body",
  "snuff.confirm",
  "snuff.keep",
  "snuff.open",
  "snuff.title",
  "status.burnedOut",
  "status.cools",
  "status.firstVisit",
  "status.firstVisitTouch",
  "status.guttering",
  "status.idle",
  "status.lengthRange",
  "status.lit",
  "status.pauseLeft",
  "status.snuffed",
  "tagline",
  "time.minute",
  "time.minutes",
  "time.second",
  "time.seconds",
  "time.timeLeft",
  "time.timeUnknown",
  "title"
]);
});
