// Property tests for the Door and the view switch (ghosts-and-graveyard design 8.4). Properties 4 and 5.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { State } from "../engine";
import { arbScript, arbT0, runScript } from "../engine/test-kit";
import { PROP_PARAMS, arbPhase, arbViewScript } from "./test-kit";
import { doorUsable, doorView, viewStep } from "./view";
import type { View } from "./view";

/** The rule, written out here: a candle burns in `lit` and `paused`, and only then the Door is shut. */
const burning = (phase: State["phase"]): boolean => phase === "lit" || phase === "paused";

describe("Feature: ghosts-and-graveyard, Property 4: The Door is usable exactly when no candle burns", () => {
  it("is usable in idle, burned-out and snuffed and shut in lit and paused, with shut always the opposite of usable", () => {
    fc.assert(
      fc.property(arbPhase, (phase) => {
        const door = doorView(phase);
        expect(door.usable).toBe(!burning(phase));
        expect(door.shut).toBe(burning(phase));
        expect(door.shut).toBe(!door.usable);
        expect(doorUsable(phase)).toBe(door.usable);
      }),
      PROP_PARAMS,
    );
  });

  it("follows the rule for the phase after every step of any engine script", () => {
    const phasesSeen = new Set<string>();
    fc.assert(
      fc.property(arbT0, arbScript, (t0, script) => {
        for (const { after } of runScript(script, t0)) {
          phasesSeen.add(after.phase);
          const door = doorView(after.phase);
          expect(door.usable, `after ${after.phase}`).toBe(!burning(after.phase));
          expect(door.shut).toBe(burning(after.phase));
          expect(door.shut).toBe(!door.usable);
        }
      }),
      PROP_PARAMS,
    );
    // The scripts reach every phase, so both answers of the rule are really exercised.
    expect([...phasesSeen].sort()).toEqual(["burned-out", "idle", "lit", "paused", "snuffed"]);
  });
});

describe("Feature: ghosts-and-graveyard, Property 5: The Graveyard_View is open only when the Door is usable", () => {
  const RUNNING: readonly State["phase"][] = ["lit", "paused"];

  /**
   * A script as the page produces it: the phase changes now and then, and every `open` carries the phase of the moment, because
   * `main.ts` sends `phase` every frame. Written as operations, then expanded here with the current phase tracked by the test.
   */
  const arbConsistentScript: fc.Arbitrary<{ initial: State["phase"]; ops: ({ kind: "open" } | { kind: "leave" } | { kind: "phase"; phase: State["phase"] })[] }> = fc.record({
    initial: arbPhase,
    ops: fc.array(
      fc.oneof(
        { weight: 3, arbitrary: fc.constant({ kind: "open" as const }) },
        { weight: 2, arbitrary: fc.constant({ kind: "leave" as const }) },
        { weight: 3, arbitrary: arbPhase.map((phase) => ({ kind: "phase" as const, phase })) },
      ),
      { maxLength: 40, size: "max" },
    ),
  });

  it("is open only while the latest phase has a usable Door, never opens on a shut Door, and a running phase always returns the Room", () => {
    let opened = 0;
    let closedByPhase = 0;
    let shutOpens = 0;
    fc.assert(
      fc.property(arbConsistentScript, ({ initial, ops }) => {
        let view: View = "room";
        let phase = initial;
        // The page sends the phase before anything else in the frame.
        view = viewStep(view, { type: "phase", phase }).view;
        for (const op of ops) {
          const before = view;
          if (op.kind === "phase") {
            phase = op.phase;
            const step = viewStep(view, { type: "phase", phase });
            view = step.view;
            if (RUNNING.includes(phase)) {
              expect(view, `after phase ${phase}`).toBe("room");
              if (before === "graveyard") closedByPhase++;
            }
          } else if (op.kind === "open") {
            const step = viewStep(view, { type: "open", phase });
            view = step.view;
            if (RUNNING.includes(phase)) {
              // R3.3, R3.7: a shut Door has no effect.
              expect(view, "open on a shut Door").toBe(before);
              expect(step.focus).toBe("none");
              shutOpens++;
            } else if (before === "room") {
              expect(view).toBe("graveyard");
              opened++;
            }
          } else {
            view = viewStep(view, { type: "leave" }).view;
          }
          // The invariant: the view is the graveyard only if the Door is usable for the latest phase.
          if (view === "graveyard") expect(doorUsable(phase), `view open in ${phase}`).toBe(true);
        }
      }),
      PROP_PARAMS,
    );
    expect(opened).toBeGreaterThan(50);
    expect(closedByPhase).toBeGreaterThan(30);
    expect(shutOpens).toBeGreaterThan(50);
  });

  it("holds for any mix of inputs, even ones that disagree about the phase: the view is open only if the phase that opened it, or a later one, has a usable Door", () => {
    fc.assert(
      fc.property(arbViewScript, (script) => {
        let view: View = "room";
        let phase: State["phase"] | null = null;
        for (const input of script) {
          const before = view;
          view = viewStep(view, input).view;
          if (input.type === "phase") phase = input.phase;
          // An `open` that took effect records the phase it saw; one that changed nothing records nothing.
          if (input.type === "open" && before === "room" && view === "graveyard") phase = input.phase;
          if (input.type === "open" && before === "room") expect(view).toBe(doorUsable(input.phase) ? "graveyard" : "room");
          if (view === "graveyard") expect(phase !== null && doorUsable(phase)).toBe(true);
          if (input.type === "phase" && !doorUsable(input.phase)) expect(view).toBe("room");
        }
      }),
      PROP_PARAMS,
    );
  });
});
