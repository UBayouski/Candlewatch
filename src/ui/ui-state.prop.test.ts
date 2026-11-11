// P5 and P8 (controls-and-access R4, R5, R6, R10.5, R14): the UI state machine driven with the engine.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { INITIAL_STATE, step, timeLeftMs } from "../engine";
import type { State } from "../engine";
import { arbScript, arbT0, runScript } from "../engine/test-kit";
import { keyAction } from "./keys";
import {
  PROP_PARAMS,
  afterEngineStep,
  arbControlScript,
  arbNeutralOp,
  arbUiScript,
  assertInvariants,
  isNeutral,
  runUiScript,
  validInPhase,
} from "./test-kit";
import type { UiOpStep } from "./test-kit";
import { initialUi, uiStep } from "./ui-state";

const running = (phase: State["phase"]): boolean => phase === "lit" || phase === "paused";

describe("P5 (R4.1, R4.3, R5.5, R10.5, R14): the interface cannot break the engine", () => {
  it.each([
    ["any inputs", arbUiScript],
    ["mostly the controls that act (reaches paused and ended)", arbControlScript],
  ])("keeps the engine's invariants, sends only valid events, and snuffs only after the dialog is confirmed: %s", (_name, arbScriptOfUi) => {
    fc.assert(
      fc.property(arbT0, arbScriptOfUi, (t0, script) => {
        for (const e of runUiScript(script, t0)) {
          assertInvariants(e.after.engine);
          for (const { event, phase } of e.sent) {
            expect(validInPhase(event, phase), `${event.type} sent while ${phase}`).toBe(true);
            if (event.type === "snuff") {
              expect(e.action?.type).toBe("confirm-snuff");
              expect(e.before.ui.overlay).toBe("snuff");
            }
          }
          expect(e.sent.length).toBeLessThanOrEqual(1);
          // The dialog is open only while the session runs.
          if (e.after.ui.overlay === "snuff") expect(running(e.after.engine.phase)).toBe(true);
          // An input that sends nothing and is not a tick leaves the engine, and the time left, alone.
          if (e.step.op.kind !== "tick" && e.sent.length === 0) {
            expect(e.after.engine).toBe(e.before.engine);
            expect(timeLeftMs(e.after.engine, e.now)).toBe(timeLeftMs(e.before.engine, e.now));
          }
        }
      }),
      PROP_PARAMS,
    );
  });

  it("leaves the engine where time alone puts it when the script has no Light, Pause, Resume or confirmed snuff", () => {
    fc.assert(
      fc.property(
        arbT0,
        fc.array(
          fc.record({
            gap: fc.integer({ min: 0, max: 400_000 }),
            op: fc.oneof(arbNeutralOp, fc.constant({ kind: "tick" as const })),
            typing: fc.boolean(),
          }),
          { maxLength: 40 },
        ),
        (t0, neutral) => {
          // A candle is lit first; after that only neutral inputs and ticks.
          const script: UiOpStep[] = [
            { gap: 0, op: { kind: "action", action: { type: "light" } }, typing: false },
            ...neutral,
          ];
          const trace = runUiScript(script, t0);
          let reference: State = INITIAL_STATE;
          for (const e of trace) {
            if (e.step === script[0]) reference = step(reference, { type: "light", length: 25 }, e.now);
            else if (e.step.op.kind === "tick") reference = step(reference, { type: "tick" }, e.now);
            else {
              // Neutral inputs, and keys that stand for none of Light, Pause, Resume: nothing is sent.
              expect(e.sent).toEqual([]);
            }
          }
          const last = trace[trace.length - 1];
          if (last === undefined) throw new Error("empty trace");
          expect(last.after.engine).toEqual(reference);
        },
      ),
      PROP_PARAMS,
    );
  });
});

describe("P8 (R14): UI-only inputs never change what the engine does", () => {
  it("gives the same engine states with neutral inputs interleaved at the same times", () => {
    fc.assert(
      fc.property(
        arbT0,
        arbScript,
        fc.array(fc.array(arbNeutralOp, { maxLength: 3 }), { minLength: 60, maxLength: 60 }),
        fc.array(fc.boolean(), { minLength: 60, maxLength: 60 }),
        (t0, script, extras, typingFlags) => {
          const reference = runScript(script, t0);
          let engine: State = INITIAL_STATE;
          let ui = initialUi({ defaultLength: 25 });
          reference.forEach((entry, i) => {
            for (const op of extras[i] ?? []) {
              const action =
                op.kind === "key"
                  ? keyAction({ phase: engine.phase, overlay: ui.overlay, focus: op.focus }, op.key)
                  : op.kind === "action"
                    ? op.action
                    : null;
              // A key that would Light, Pause or Resume is not a UI-only input.
              if (action === null || !isNeutral(action)) continue;
              const r = uiStep(ui, { type: "action", action }, engine.phase);
              expect(r.effects.events).toEqual([]);
              ui = r.ui;
            }
            const next = step(engine, entry.event, entry.now);
            ui = afterEngineStep(ui, engine.phase, next.phase, typingFlags[i] ?? false);
            engine = next;
            expect(engine).toEqual(entry.after);
          });
        },
      ),
      PROP_PARAMS,
    );
  });
});
