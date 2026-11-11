// P6 (controls-and-access R11.4, R11.5): the settings document round-trips, and reading never throws and always lands in range.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PROP_PARAMS } from "../engine/test-kit";
import { DEFAULT_SETTINGS, parseSettings, serializeSettings } from "./settings";
import type { Settings } from "./settings";

const arbSettings: fc.Arbitrary<Settings> = fc.record({
  sound: fc.boolean(),
  ghosts: fc.boolean(),
  defaultLength: fc.integer({ min: 5, max: 90 }),
});

/** Any JSON value, as text. */
const arbJsonText: fc.Arbitrary<string> = fc.oneof(fc.json(), fc.jsonValue().map((v) => JSON.stringify(v)));

const WRONG_VALUES: readonly unknown[] = ["yes", "25", 1, 0, null, [], {}, 4, 91, -1, 25.5, 1e21, true, false, "", [25]];

/** One edit of a valid document: remove a field, retype it, push the length out of range, add a key, or change the version. */
const arbEdit: fc.Arbitrary<(doc: Record<string, unknown>) => void> = fc.oneof(
  fc.constantFrom("v", "sound", "ghosts", "defaultLength").map((key) => (doc: Record<string, unknown>) => void Reflect.deleteProperty(doc, key)),
  fc.tuple(fc.constantFrom("v", "sound", "ghosts", "defaultLength"), fc.constantFrom(...WRONG_VALUES)).map(([key, value]) => (doc: Record<string, unknown>) => void (doc[key] = value)),
  fc.constantFrom(4, 91, 0, -5, 1000, 25.5, 4.99, 5.0001).map((n) => (doc: Record<string, unknown>) => void (doc["defaultLength"] = n)),
  fc.tuple(fc.constantFrom("volume", "theme", "extra", "__proto__", "constructor", "sound2"), fc.constantFrom(...WRONG_VALUES)).map(([key, value]) => (doc: Record<string, unknown>) => void Object.defineProperty(doc, key, { value, enumerable: true, configurable: true, writable: true })),
  fc.constantFrom(0, 2, 3, "1", null).map((v) => (doc: Record<string, unknown>) => void (doc["v"] = v)),
);

const arbMutatedDoc: fc.Arbitrary<string> = fc.tuple(arbSettings, fc.array(arbEdit, { minLength: 1, maxLength: 4 })).map(([s, edits]) => {
  const doc: Record<string, unknown> = { v: 1, sound: s.sound, ghosts: s.ghosts, defaultLength: s.defaultLength };
  for (const edit of edits) edit(doc);
  return JSON.stringify(doc);
});

const arbText: fc.Arbitrary<string> = fc.oneof(
  { weight: 2, arbitrary: fc.string({ maxLength: 80 }) },
  { weight: 2, arbitrary: fc.string({ unit: "binary", maxLength: 80 }) },
  { weight: 3, arbitrary: arbJsonText },
  { weight: 4, arbitrary: arbMutatedDoc },
  { weight: 1, arbitrary: fc.constantFrom("", "{", "}", "null", "[]", '{"v":1', '{"v":1,"sound":true,"ghosts":true,"defaultLength":25}x') },
);

/** An independent reading of R11.5, written against the parsed value rather than with the code's helpers. */
function reference(text: string): Settings {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return DEFAULT_SETTINGS;
  const get = (key: string): unknown => (Object.getOwnPropertyDescriptor(value, key) as PropertyDescriptor | undefined)?.value;
  if (get("v") !== 1) return DEFAULT_SETTINGS;
  const length = get("defaultLength");
  return {
    sound: typeof get("sound") === "boolean" ? (get("sound") as boolean) : true,
    ghosts: typeof get("ghosts") === "boolean" ? (get("ghosts") as boolean) : true,
    defaultLength: typeof length === "number" && Number.isInteger(length) && length >= 5 && length <= 90 ? length : 25,
  };
}

const inRange = (s: Settings): boolean =>
  typeof s.sound === "boolean" && typeof s.ghosts === "boolean" && Number.isInteger(s.defaultLength) && s.defaultLength >= 5 && s.defaultLength <= 90;

describe("P6: the settings document (R11.4, R11.5)", () => {
  it("parse(serialize(s)) is s for every valid settings value (identity)", () => {
    fc.assert(
      fc.property(arbSettings, (s) => {
        expect(parseSettings(serializeSettings(s))).toEqual(s);
      }),
      PROP_PARAMS,
    );
  });

  it("never throws on any text and always returns settings in range", () => {
    fc.assert(
      fc.property(arbText, (text) => {
        const read = parseSettings(text);
        expect(inRange(read)).toBe(true);
      }),
      PROP_PARAMS,
    );
  });

  it("keeps each valid field and defaults the others, as the requirement reads", () => {
    fc.assert(
      fc.property(arbText, (text) => {
        expect(parseSettings(text)).toEqual(reference(text));
      }),
      PROP_PARAMS,
    );
  });

  it("drops unknown fields: the result has the three settings and nothing else, and so does the text written", () => {
    fc.assert(
      fc.property(arbMutatedDoc, (text) => {
        const read = parseSettings(text);
        expect(Object.keys(read).sort()).toEqual(["defaultLength", "ghosts", "sound"]);
        expect(Object.keys(JSON.parse(serializeSettings(read)) as object)).toEqual(["v", "sound", "ghosts", "defaultLength"]);
      }),
      PROP_PARAMS,
    );
  });

  it("serialize(parse(x)) is a fixed point: a second pass gives the same text", () => {
    fc.assert(
      fc.property(arbText, (text) => {
        const once = serializeSettings(parseSettings(text));
        expect(serializeSettings(parseSettings(once))).toBe(once);
      }),
      PROP_PARAMS,
    );
  });

  it("never stores a default length outside 5 to 90, whatever it is given", () => {
    const arbAnyNumber = fc.oneof(fc.integer({ min: -1000, max: 1000 }), fc.double(), fc.constantFrom(4, 91, 4.5, NaN, Infinity, -Infinity, 1e21, -0));
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), arbAnyNumber, (sound, ghosts, defaultLength) => {
        const stored = JSON.parse(serializeSettings({ sound, ghosts, defaultLength })) as { defaultLength: number };
        expect(Number.isInteger(stored.defaultLength) && stored.defaultLength >= 5 && stored.defaultLength <= 90).toBe(true);
        if (Number.isInteger(defaultLength) && defaultLength >= 5 && defaultLength <= 90) expect(stored.defaultLength).toBe(defaultLength);
      }),
      PROP_PARAMS,
    );
  });
});
