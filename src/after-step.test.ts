// Unit tests of afterStep with recording fakes (sound-and-title task 10.1, design 3.9).
import { describe, expect, it } from "vitest";
import { createAfterStep } from "./after-step";
import type { AfterStepDeps } from "./after-step";
import type { Cue } from "./audio/types";
import { INITIAL_STATE, step } from "./engine";
import type { Event, State } from "./engine";

const T0 = 1_700_000_000_000;
const MIN = 60_000;

/** Recording fakes; a dependency named in `throwing` throws after it is logged. */
function fakes(options: { sound?: boolean; throwing?: readonly ("sound" | "play" | "writeTitle" | "start" | "stop")[] } = {}) {
  const log: string[] = [];
  const throws = (name: string): void => {
    if (options.throwing?.includes(name as never) === true) throw new Error(name);
  };
  const deps: AfterStepDeps = {
    sound: () => {
      log.push("sound");
      throws("sound");
      return options.sound ?? true;
    },
    play: (cue: Cue) => {
      log.push(`play(${cue})`);
      throws("play");
    },
    writeTitle: (title: string) => {
      log.push(`writeTitle(${title})`);
      throws("writeTitle");
    },
    hidden: {
      start: (now: number) => {
        log.push(`hidden.start(${now - T0})`);
        throws("start");
      },
      stop: () => {
        log.push("hidden.stop()");
        throws("stop");
      },
    },
  };
  return { deps, log, effects: () => log.filter((l) => l !== "sound") };
}

/** Runs one event through step and afterStep, as dispatch does. */
function run(f: ReturnType<typeof fakes>, prev: State, event: Event, now: number): State {
  const next = step(prev, event, now);
  createAfterStep(f.deps)(prev, next, event, now);
  return next;
}

const lit = step(INITIAL_STATE, { type: "light", length: 25 }, T0);

describe("createAfterStep (design 3.9)", () => {
  it("light: play(strike), then the title", () => {
    const f = fakes();
    run(f, INITIAL_STATE, { type: "light", length: 25 }, T0);
    expect(f.effects()).toEqual(["play(strike)", "writeTitle(25:00 · Candlewatch)"]);
  });

  it("hide: the title, then hidden.start(now)", () => {
    const f = fakes();
    run(f, lit, { type: "hide" }, T0 + 1000);
    expect(f.effects()).toEqual(["writeTitle(24:59 · Candlewatch)", "hidden.start(1000)"]);
  });

  it("show: the title, then hidden.stop()", () => {
    const f = fakes();
    const hidden = step(lit, { type: "hide" }, T0 + 1000);
    run(f, hidden, { type: "show" }, T0 + 2000);
    expect(f.effects()).toEqual(["writeTitle(24:58 · Candlewatch)", "hidden.stop()"]);
  });

  it("the end of the watch plays the chime; a snuff plays the breath", () => {
    const f = fakes();
    run(f, lit, { type: "tick" }, T0 + 25 * MIN);
    expect(f.effects()).toEqual(["play(chime)", "writeTitle(Morning · Candlewatch)"]);
    const g = fakes();
    run(g, lit, { type: "snuff" }, T0 + MIN);
    expect(g.effects()).toEqual(["play(breath)", "writeTitle(Dark · Candlewatch)"]);
  });

  it("reload plays nothing, even when it settles a session that ended", () => {
    const f = fakes();
    run(f, lit, { type: "reload", state: lit }, T0 + 25 * MIN + 10);
    expect(f.effects()).toEqual(["writeTitle(Morning · Candlewatch)"]);
  });

  it("a tick that keeps the phase plays nothing", () => {
    const f = fakes();
    run(f, lit, { type: "tick" }, T0 + 5000);
    expect(f.effects()).toEqual(["writeTitle(24:55 · Candlewatch)"]);
  });

  it("a throwing play still writes the title", () => {
    const f = fakes({ throwing: ["play"] });
    expect(() => run(f, INITIAL_STATE, { type: "light", length: 25 }, T0)).not.toThrow();
    expect(f.effects()).toEqual(["play(strike)", "writeTitle(25:00 · Candlewatch)"]);
  });

  it("a throwing play still writes the title and starts the tick (all four steps in one call)", () => {
    // A burn-out found by a hide event: the Cue, the title and the Hidden_Tick control in one call.
    const f = fakes({ throwing: ["play"] });
    expect(() => run(f, lit, { type: "hide" }, T0 + 25 * MIN)).not.toThrow();
    expect(f.effects()).toEqual(["play(chime)", "writeTitle(Morning · Candlewatch)", `hidden.start(${25 * MIN})`]);
  });

  it("a throwing writeTitle still starts the tick", () => {
    const f = fakes({ throwing: ["writeTitle"] });
    expect(() => run(f, lit, { type: "hide" }, T0 + 1000)).not.toThrow();
    expect(f.effects()).toEqual(["writeTitle(24:59 · Candlewatch)", "hidden.start(1000)"]);
  });

  it("a throwing hidden control is swallowed", () => {
    const f = fakes({ throwing: ["start", "stop"] });
    expect(() => run(f, lit, { type: "hide" }, T0 + 1000)).not.toThrow();
    expect(() => run(f, lit, { type: "show" }, T0 + 2000)).not.toThrow();
  });

  it("a throwing sound() means no Cue, and the title is still written", () => {
    const f = fakes({ throwing: ["sound"] });
    run(f, INITIAL_STATE, { type: "light", length: 25 }, T0);
    expect(f.effects()).toEqual(["writeTitle(25:00 · Candlewatch)"]);
  });

  it("sound off means no play", () => {
    const f = fakes({ sound: false });
    run(f, INITIAL_STATE, { type: "light", length: 25 }, T0);
    expect(f.effects()).toEqual(["writeTitle(25:00 · Candlewatch)"]);
  });

  it("sound() is read once per call, at the Transition", () => {
    const f = fakes();
    run(f, lit, { type: "tick" }, T0 + 1000);
    expect(f.log.filter((l) => l === "sound")).toHaveLength(1);
  });
});
