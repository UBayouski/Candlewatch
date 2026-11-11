// ghosts-and-graveyard R3.1, R3.2, R3.5 to R3.7, R3.10 to R3.12, R3.14 (design 3.7): the Door and the view switch.
import { describe, expect, it } from "vitest";
import type { State } from "../engine";
import { doorUsable, doorView, viewStep } from "./view";
import type { View } from "./view";

const PHASES: readonly State["phase"][] = ["idle", "lit", "paused", "burned-out", "snuffed"];
const USABLE: readonly State["phase"][] = ["idle", "burned-out", "snuffed"];
const RUNNING: readonly State["phase"][] = ["lit", "paused"];

describe("doorView", () => {
  it("is usable in idle, burned-out and snuffed, and shut while a candle burns (lit, paused)", () => {
    for (const phase of PHASES) {
      const door = doorView(phase);
      expect(door.usable, phase).toBe(USABLE.includes(phase));
      expect(door.shut, phase).toBe(!door.usable);
      expect(doorUsable(phase), phase).toBe(door.usable);
    }
  });

  it("gives the five phases exactly three usable and two shut", () => {
    expect(PHASES.filter(doorUsable)).toEqual(["idle", "burned-out", "snuffed"]);
    expect(PHASES.filter((p) => doorView(p).shut)).toEqual(["lit", "paused"]);
  });
});

describe("open", () => {
  it("opens the view from the Room in each phase with a usable Door, and moves focus to the first Group", () => {
    for (const phase of USABLE) expect(viewStep("room", { type: "open", phase }), phase).toEqual({ view: "graveyard", focus: "first-group" });
  });

  it("does nothing from the Room while the Door is shut", () => {
    for (const phase of RUNNING) expect(viewStep("room", { type: "open", phase }), phase).toEqual({ view: "room", focus: "none" });
  });

  it("does nothing when the view is already open", () => {
    for (const phase of PHASES) {
      const step = viewStep("graveyard", { type: "open", phase });
      expect(step.focus, phase).toBe("none");
      expect(step.view, phase).toBe("graveyard");
    }
  });
});

describe("leave", () => {
  it("returns to the Room from the view and moves focus to the Door", () => {
    expect(viewStep("graveyard", { type: "leave" })).toEqual({ view: "room", focus: "door" });
  });

  it("does nothing in the Room", () => {
    expect(viewStep("room", { type: "leave" })).toEqual({ view: "room", focus: "none" });
  });
});

describe("phase", () => {
  it("closes the view in the frame a candle is lit, and when it is paused", () => {
    for (const phase of RUNNING) expect(viewStep("graveyard", { type: "phase", phase }), phase).toEqual({ view: "room", focus: "none" });
  });

  it("leaves the view open when the phase is snuffed, burned-out or idle", () => {
    for (const phase of USABLE) expect(viewStep("graveyard", { type: "phase", phase }), phase).toEqual({ view: "graveyard", focus: "none" });
  });

  it("changes nothing in the Room, whatever the phase", () => {
    for (const phase of PHASES) expect(viewStep("room", { type: "phase", phase }), phase).toEqual({ view: "room", focus: "none" });
  });

  it("never opens the view by itself", () => {
    for (const view of ["room", "graveyard"] as const satisfies readonly View[]) {
      for (const phase of PHASES) expect(viewStep(view, { type: "phase", phase }).view === "graveyard" && view === "room").toBe(false);
    }
  });
});
