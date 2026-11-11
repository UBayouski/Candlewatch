// P3 (controls-and-access R2.6, R3.3, R4.2): the light request, and what the engine does with it.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { INITIAL_STATE, step } from "../engine";
import type { State } from "../engine";
import { arbScript, arbT0, runScript } from "../engine/test-kit";
import type { LengthChoice } from "./length";
import { lightRequest } from "./light";
import { PROP_PARAMS, arbIntentText, arbLengthText, referenceLength } from "./test-kit";

const MIN = 60_000;

const arbChoice: fc.Arbitrary<LengthChoice> = fc.oneof(
  fc.constantFrom<LengthChoice>({ kind: "preset", minutes: 15 }, { kind: "preset", minutes: 25 }, { kind: "preset", minutes: 50 }),
  arbLengthText.map((text): LengthChoice => ({ kind: "custom", text })),
);

/** A state a person can light from: idle, burned out, snuffed, and any ended state a generated session reaches. */
function startingStates(t0: number, script: Parameters<typeof runScript>[0]): { state: State; now: number }[] {
  const lit = step(INITIAL_STATE, { type: "light", length: 25 }, t0);
  const burned = step(lit, { type: "tick" }, t0 + 25 * MIN);
  const snuffed = step(lit, { type: "snuff" }, t0 + MIN);
  const fromScript = runScript(script, t0)
    .filter((e) => e.after.phase === "burned-out" || e.after.phase === "snuffed")
    .map((e) => ({ state: e.after, now: e.now + 1 }));
  return [
    { state: INITIAL_STATE, now: t0 },
    { state: burned, now: t0 + 26 * MIN },
    { state: snuffed, now: t0 + 2 * MIN },
    ...fromScript,
  ];
}

describe("P3: the light request (R2.6, R3.3, R4.2)", () => {
  it("is a refusal (and no event) exactly when the length is invalid, and otherwise a light event with an integer length from 5 to 90", () => {
    fc.assert(
      fc.property(arbChoice, arbIntentText, (choice, intent) => {
        const request = lightRequest(choice, intent);
        const want = choice.kind === "preset" ? choice.minutes : referenceLength(choice.text);
        if (want === null) {
          expect(request.ok).toBe(false);
          expect("event" in request).toBe(false);
        } else {
          expect(request.ok).toBe(true);
          if (request.ok) {
            expect(request.event.type).toBe("light");
            expect(request.event.length).toBe(want);
            expect(Number.isInteger(request.event.length)).toBe(true);
            expect(request.event.length).toBeGreaterThanOrEqual(5);
            expect(request.event.length).toBeLessThanOrEqual(90);
            // The intent goes on unchanged (R3.3); it is left out only when empty.
            expect(request.event.intent).toBe(intent === "" ? undefined : intent);
          }
        }
      }),
      PROP_PARAMS,
    );
  });

  it("makes the engine light a session from idle, burned-out and snuffed, with no intent or one clean single line of at most 80 code points, and never throws", () => {
    fc.assert(
      fc.property(arbChoice, arbIntentText, arbT0, arbScript, (choice, intent, t0, script) => {
        const request = lightRequest(choice, intent);
        if (!request.ok) return;
        for (const { state, now } of startingStates(t0, script)) {
          const next = step(state, request.event, now);
          expect(next.phase).toBe("lit");
          if (next.phase !== "lit") continue;
          expect(next.session.lengthMin).toBe(request.event.length);
          const kept = next.session.intent;
          if (kept !== null) {
            expect(kept).not.toMatch(/[\r\n\u2028\u2029]/);
            expect(kept).toBe(kept.trim());
            expect(kept.length).toBeGreaterThan(0);
            expect(Array.from(kept).length).toBeLessThanOrEqual(80);
          }
          // The finished session stays in the history.
          expect(next.history.length).toBe(state.history.length);
        }
      }),
      PROP_PARAMS,
    );
  });

  it("never builds an event for an invalid length, so the engine is never asked to ignore one", () => {
    fc.assert(
      fc.property(arbLengthText, arbIntentText, (text, intent) => {
        fc.pre(referenceLength(text) === null);
        const request = lightRequest({ kind: "custom", text }, intent);
        expect(request.ok).toBe(false);
        if (!request.ok) expect(["empty", "format", "range"]).toContain(request.reason);
      }),
      PROP_PARAMS,
    );
  });
});
