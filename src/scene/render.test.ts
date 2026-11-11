import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { INITIAL_STATE, MS_PER_MINUTE, step } from "../engine";
import type { State } from "../engine";
import { STRINGS } from "../strings";
import { sceneModel } from "./model";
import { createScene } from "./render";
import type { SceneRoot } from "./render";
import { ROOM_SVG } from "./room";

const T0 = 1_800_000_000_000;
const MIN = MS_PER_MINUTE;

/** A minimal stand-in for an element that records every write. */
function fakeRoot() {
  const properties = new Map<string, string>();
  const attributes = new Map<string, string>();
  const classes: string[] = [];
  const log: string[] = [];
  const root: SceneRoot = {
    innerHTML: "",
    style: {
      setProperty(name, value) {
        properties.set(name, value);
        log.push(`style ${name}`);
      },
    },
    classList: {
      add(token) {
        classes.push(token);
      },
    },
    setAttribute(name, value) {
      attributes.set(name, value);
      log.push(`attr ${name}`);
    },
  };
  return { root, properties, attributes, classes, log };
}

const lit = (): State => step(INITIAL_STATE, { type: "light", length: 25 }, T0);
const model = (state: State, now: number, reducedMotion = false) => sceneModel(state, now, { reducedMotion });

const PROPERTY_NAMES = [
  "--wax-height",
  "--drips",
  "--flame-height",
  "--flame-blue",
  "--flame-ragged",
  "--flame-glow",
  "--smoke",
  "--stub",
  "--light-radius",
  "--dawn",
  "--cooling",
  "--flicker-lean",
  "--flicker-height",
  "--flicker-glow",
];
const ATTRIBUTE_NAMES = ["data-phase", "data-flame", "data-animate-drips", "data-animate-smoke", "data-ease"];

describe("createScene", () => {
  it("builds the room, names it as an image and adds the scene class", () => {
    const f = fakeRoot();
    createScene(f.root);
    expect(f.root.innerHTML).toBe(ROOM_SVG);
    expect(f.attributes.get("role")).toBe("img");
    expect(f.classes).toEqual(["candle-scene"]);
    expect(f.log.filter((l) => l.startsWith("style"))).toEqual([]);
  });
});

describe("apply: what it writes", () => {
  it("the first call writes every custom property and data attribute in the table, and nothing else", () => {
    const f = fakeRoot();
    const scene = createScene(f.root);
    scene.apply(model(lit(), T0 + 5 * MIN));
    expect([...f.properties.keys()].sort()).toEqual([...PROPERTY_NAMES].sort());
    const written = [...f.attributes.keys()].filter((k) => k !== "role");
    expect(written.sort()).toEqual([...ATTRIBUTE_NAMES, "data-settled", "aria-label"].sort());
  });

  it("writes numbers as text, booleans as 1 and 0 for properties and true and false for attributes", () => {
    const f = fakeRoot();
    const scene = createScene(f.root);
    scene.apply(model(lit(), T0));
    expect(f.properties.get("--wax-height")).toBe("1");
    expect(f.properties.get("--cooling")).toBe("0");
    expect(f.attributes.get("data-phase")).toBe("lit");
    expect(f.attributes.get("data-flame")).toBe("steady");
    expect(f.attributes.get("data-ease")).toBe("true");
    const done = step(lit(), { type: "tick" }, T0 + 25 * MIN);
    const g = fakeRoot();
    createScene(g.root).apply(model(done, T0 + 26 * MIN));
    expect(g.properties.get("--cooling")).toBe("1");
    expect(g.properties.get("--stub")).toBe("1");
    expect(g.attributes.get("data-flame")).toBe("smoke");
    const still = fakeRoot();
    createScene(still.root).apply(model(lit(), T0 + MIN, true));
    expect(still.attributes.get("data-ease")).toBe("false");
    expect(still.attributes.get("data-animate-drips")).toBe("false");
    expect(still.properties.get("--flicker-lean")).toBe("0");
  });

  it("writes only custom properties, data attributes and the accessible name (R11.5)", () => {
    const f = fakeRoot();
    createScene(f.root).apply(model(lit(), T0));
    for (const name of f.properties.keys()) expect(name).toMatch(/^--[a-z-]+$/);
    for (const name of f.attributes.keys()) expect(["role", "aria-label", "data-settled", ...ATTRIBUTE_NAMES]).toContain(name);
  });

  it("an unchanged model writes nothing the second time except the settle flag", () => {
    const f = fakeRoot();
    const scene = createScene(f.root);
    const m = model(lit(), T0);
    scene.apply(m);
    f.log.length = 0;
    scene.apply(m);
    expect(f.log).toEqual(["attr data-settled"]);
    f.log.length = 0;
    scene.apply(m);
    expect(f.log).toEqual([]);
  });

  it("a changed model writes only the fields that changed", () => {
    const f = fakeRoot();
    const scene = createScene(f.root);
    scene.apply(model(lit(), T0));
    scene.apply(model(lit(), T0));
    scene.apply(model(lit(), T0));
    f.log.length = 0;
    scene.apply(model(lit(), T0 + 5 * MIN, true)); // same flame, wax and light now differ; motion is off
    const names = f.log.map((l) => l.split(" ")[1]);
    expect(names).toContain("--wax-height");
    expect(names).toContain("--light-radius");
    expect(names).not.toContain("--stub");
    expect(names).not.toContain("--dawn");
    expect(names).not.toContain("aria-label");
  });
});

describe("apply: data-settled (design 6.5)", () => {
  it("goes false on the first call and true from the second, and then stays", () => {
    const f = fakeRoot();
    const scene = createScene(f.root);
    expect(f.attributes.has("data-settled")).toBe(false);
    scene.apply(model(lit(), T0));
    expect(f.attributes.get("data-settled")).toBe("false");
    scene.apply(model(lit(), T0 + 1000));
    expect(f.attributes.get("data-settled")).toBe("true");
    scene.apply(model(lit(), T0 + 2000));
    expect(f.attributes.get("data-settled")).toBe("true");
  });
});

describe("apply: the accessible name (R12)", () => {
  it("is the string for the flame mode and changes only when the flame mode changes", () => {
    const f = fakeRoot();
    const scene = createScene(f.root);
    scene.apply(model(lit(), T0));
    expect(f.attributes.get("aria-label")).toBe(STRINGS.scene.steady);
    f.log.length = 0;
    scene.apply(model(lit(), T0 + 5 * MIN));
    scene.apply(model(lit(), T0 + 10 * MIN));
    expect(f.log.filter((l) => l === "attr aria-label")).toEqual([]);
    scene.apply(model(lit(), T0 + 24.5 * MIN));
    expect(f.attributes.get("aria-label")).toBe(STRINGS.scene.guttering);
    expect(f.log.filter((l) => l === "attr aria-label")).toHaveLength(1);
  });

  it("covers every flame mode and never includes the time", () => {
    const states: [State, number, keyof typeof STRINGS.scene][] = [
      [INITIAL_STATE, T0, "unlit"],
      [lit(), T0 + MIN, "steady"],
      [step(lit(), { type: "pause" }, T0 + MIN), T0 + 2 * MIN, "paused"],
      [lit(), T0 + 24.5 * MIN, "guttering"],
      [step(lit(), { type: "snuff" }, T0 + MIN), T0 + 2 * MIN, "smoke"],
    ];
    for (const [state, now, mode] of states) {
      const f = fakeRoot();
      createScene(f.root).apply(model(state, now));
      expect(f.attributes.get("aria-label")).toBe(STRINGS.scene[mode]);
      expect(f.attributes.get("aria-label")).not.toMatch(/\d/);
    }
  });
});

describe("apply: the label suffix (R10.1, R10.11, CR-S1)", () => {
  const states: [State, number, keyof typeof STRINGS.scene][] = [
    [INITIAL_STATE, T0, "unlit"],
    [lit(), T0 + MIN, "steady"],
    [step(lit(), { type: "pause" }, T0 + MIN), T0 + 2 * MIN, "paused"],
    [lit(), T0 + 24.5 * MIN, "guttering"],
    [step(lit(), { type: "snuff" }, T0 + MIN), T0 + 2 * MIN, "smoke"],
  ];
  const labelWrites = (log: string[]): number => log.filter((l) => l === "attr aria-label").length;

  it("with extra the label is the mode string, a space, the suffix and a full stop, for each of the five modes", () => {
    for (const [state, now, mode] of states) {
      const f = fakeRoot();
      createScene(f.root).apply(model(state, now), { labelSuffix: "2 distractions" });
      expect(f.attributes.get("aria-label")).toBe(`${STRINGS.scene[mode]} 2 distractions.`);
    }
  });

  it("without extra the label is exactly the plain mode string", () => {
    const f = fakeRoot();
    createScene(f.root).apply(model(lit(), T0));
    expect(f.attributes.get("aria-label")).toBe(STRINGS.scene.steady);
  });

  it("a changed suffix rewrites the label; an unchanged suffix writes nothing", () => {
    const f = fakeRoot();
    const scene = createScene(f.root);
    scene.apply(model(lit(), T0), { labelSuffix: "0 distractions" });
    f.log.length = 0;
    scene.apply(model(lit(), T0 + 5 * MIN), { labelSuffix: "0 distractions" });
    expect(labelWrites(f.log)).toBe(0);
    scene.apply(model(lit(), T0 + 6 * MIN), { labelSuffix: "1 distraction" });
    expect(labelWrites(f.log)).toBe(1);
    expect(f.attributes.get("aria-label")).toBe(`${STRINGS.scene.steady} 1 distraction.`);
  });

  it("a changed mode with the same suffix rewrites the label", () => {
    const f = fakeRoot();
    const scene = createScene(f.root);
    scene.apply(model(lit(), T0), { labelSuffix: "1 distraction" });
    scene.apply(model(lit(), T0 + 24.5 * MIN), { labelSuffix: "1 distraction" });
    expect(f.attributes.get("aria-label")).toBe(`${STRINGS.scene.guttering} 1 distraction.`);
  });

  it("switching from extra to no extra restores the plain label, once", () => {
    const f = fakeRoot();
    const scene = createScene(f.root);
    scene.apply(model(lit(), T0), { labelSuffix: "3 distractions" });
    f.log.length = 0;
    scene.apply(model(lit(), T0));
    expect(f.attributes.get("aria-label")).toBe(STRINGS.scene.steady);
    scene.apply(model(lit(), T0));
    expect(labelWrites(f.log)).toBe(1);
  });

  it("the suffix changes nothing but the label", () => {
    const a = fakeRoot();
    const b = fakeRoot();
    createScene(a.root).apply(model(lit(), T0 + 5 * MIN));
    createScene(b.root).apply(model(lit(), T0 + 5 * MIN), { labelSuffix: "4 distractions" });
    a.attributes.delete("aria-label");
    b.attributes.delete("aria-label");
    expect(b.attributes).toEqual(a.attributes);
    expect(b.properties).toEqual(a.properties);
  });
});

describe("render.ts keeps no logic of its own (R11.6)", () => {
  const code = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "render.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("does not read the phase, the wax, the light, the dawn or the time from the model", () => {
    for (const field of ["phase", "waxHeight", "lightRadius", "dawn", "drips", "stub", "cooling", "flickerLean"]) {
      expect(code, `model.${field}`).not.toMatch(new RegExp(`model\\.${field}\\b`));
    }
  });

  it("reads the flame mode only to choose the accessible name (compare, remember, look up the string)", () => {
    // One read: the string lookup. The label is then compared and remembered as text (R10.1).
    expect(code.match(/model\.flameMode/g)?.length).toBe(1);
    expect(code).toMatch(/STRINGS\.scene\[model\.flameMode\]/);
  });

  it("imports nothing from the engine", () => {
    expect(code).not.toMatch(/from\s+["'][^"']*engine/);
  });
});
