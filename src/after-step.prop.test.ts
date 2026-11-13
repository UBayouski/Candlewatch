// Property tests of afterStep (sound-and-title tasks 10.2 and 10.3, design 3.9). Properties 14 and 3.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createAfterStep } from "./after-step";
import type { AfterStepDeps } from "./after-step";
import { arbCueScript, arbPhasePair, arbOffset, endOf, EVENT_TYPES, PROP_PARAMS, transition, TRANSITION_KINDS } from "./audio/test-kit";
import type { Cue } from "./audio/types";
import type { Event, State } from "./engine";
import { arbLength, arbT0, runScript } from "./engine/test-kit";
import type { ScriptStep, StepKind } from "./engine/test-kit";

type DepName = "sound" | "play" | "writeTitle" | "start" | "stop";

/** An event of the given type; a reload carries `state`. */
function eventOf(type: Event["type"], state: State): Event {
  switch (type) {
    case "light":
      return { type, length: 25 };
    case "reload":
      return { type, state };
    default:
      return { type };
  }
}

/** Recording fakes; each dependency in `throwing` throws after it is logged. */
function recording(throwing: ReadonlySet<DepName>, sound: boolean) {
  const log: { name: DepName; arg?: unknown }[] = [];
  const hit = (name: DepName, arg?: unknown): void => {
    log.push({ name, arg });
    if (throwing.has(name)) throw new Error(name);
  };
  const deps: AfterStepDeps = {
    sound: () => {
      hit("sound");
      return sound;
    },
    play: (cue) => hit("play", cue),
    writeTitle: (title) => hit("writeTitle", title),
    hidden: { start: (now) => hit("start", now), stop: () => hit("stop") },
  };
  return { deps, log };
}

/** Any ordered phase pair, or (as often) a Transition the engine really makes, so a Cue is often chosen. */
const arbStepPair: fc.Arbitrary<{ prev: State; next: State }> = fc.oneof(
  arbPhasePair,
  fc.tuple(fc.constantFrom(...TRANSITION_KINDS), arbT0).map(([kind, t0]) => {
    const { prev, next } = transition(kind, t0);
    return { prev, next };
  }),
);

describe("Feature: sound-and-title, Property 14: afterStep runs in order and plays at most one Cue", () => {
  it("play at most once, then the title, then the Hidden_Tick control for hide or show only; it never throws", () => {
    let played = 0;
    let hiddenCalls = 0;
    fc.assert(
      fc.property(
        arbStepPair.chain(({ prev, next }) =>
          fc.record({
            prev: fc.constant(prev),
            next: fc.constant(next),
            type: fc.constantFrom(...EVENT_TYPES),
            now: arbOffset.map((o) => endOf(next, 1_700_000_000_000) + o),
            sound: fc.boolean(),
            throwing: fc.subarray<DepName>(["sound", "play", "writeTitle", "start", "stop"]),
          }),
        ),
        ({ prev, next, type, now, sound, throwing }) => {
          const r = recording(new Set(throwing), sound);
          const event = eventOf(type, next);
          expect(() => createAfterStep(r.deps)(prev, next, event, now)).not.toThrow();
          const order = r.log.map((e) => e.name).filter((n) => n !== "sound");
          const plays = order.filter((n) => n === "play").length;
          expect(plays).toBeLessThanOrEqual(1);
          const rank = (n: DepName): number => (n === "play" ? 0 : n === "writeTitle" ? 1 : 2);
          for (let i = 1; i < order.length; i++) expect(rank(order[i] ?? "play")).toBeGreaterThan(rank(order[i - 1] ?? "play"));
          expect(order.filter((n) => n === "writeTitle")).toHaveLength(1);
          expect(order.includes("start")).toBe(type === "hide");
          expect(order.includes("stop")).toBe(type === "show");
          const start = r.log.find((e) => e.name === "start");
          if (start !== undefined) expect(start.arg).toBe(now);
          played += plays;
          if (type === "hide" || type === "show") hiddenCalls++;
        },
      ),
      PROP_PARAMS,
    );
    expect(played, "Cues played").toBeGreaterThanOrEqual(10);
    expect(hiddenCalls, "hide or show events").toBeGreaterThanOrEqual(30);
  });
});

const MIN = 60_000;
const stepOf = (kind: StepKind, gap: number, length = 25): ScriptStep => ({ kind, gap, length, intent: undefined, junk: undefined });

/**
 * A session that ends close to an event: a light, then a tick or a reload found up to 150 s after the end of the watch (so the
 * end Cue is often inside the Late_Cue_Limit), or a pause whose allowance runs out before a tick or a reload.
 */
const arbEndingChunk: fc.Arbitrary<ScriptStep[]> = fc
  .tuple(arbLength, fc.integer({ min: 0, max: 150_000 }), fc.constantFrom<StepKind>("tick", "reload"), fc.boolean(), fc.integer({ min: 0, max: 20 * MIN }))
  .map(([length, late, finder, viaPause, into]) =>
    viaPause
      ? [stepOf("light", 1000, length), stepOf("pause", Math.min(into, length * MIN - 1)), stepOf(finder, 10 * MIN + late)]
      : [stepOf("light", 1000, length), stepOf(finder, length * MIN + late)],
  );

/** Generated scripts with sessions that end near an event mixed in. */
const arbP3Script: fc.Arbitrary<ScriptStep[]> = fc
  .array(fc.oneof({ weight: 1, arbitrary: arbCueScript }, { weight: 1, arbitrary: arbEndingChunk }), { maxLength: 5 })
  .map((parts) => parts.flat());

describe("Feature: sound-and-title, Property 3: At most one Cue per event, none from reload, one strike and one end Cue per session", () => {
  it("through step then afterStep: one Cue per event at most, none from a reload, one strike and one end Cue per session", () => {
    const seen = { strike: 0, end: 0, reloadEnds: 0 };
    fc.assert(
      fc.property(arbP3Script, arbT0, (script, t0) => {
        const played: Cue[] = [];
        const afterStep = createAfterStep({ sound: () => true, play: (cue) => played.push(cue), writeTitle: () => undefined, hidden: { start: () => undefined, stop: () => undefined } });
        // A dispatch built like the one in main.ts: one step per event, then afterStep with the states before and after.
        const trace = runScript(script, t0);
        let session = 0;
        const perSession = new Map<number, { strike: number; end: number }>();
        for (const { before, after, event, now } of trace) {
          const from = played.length;
          afterStep(before, after, event, now);
          const cues = played.slice(from);
          expect(cues.length).toBeLessThanOrEqual(1);
          if (event.type === "reload") {
            expect(cues).toEqual([]);
            if ((before.phase === "lit" || before.phase === "paused") && after.phase !== before.phase) seen.reloadEnds++;
          }
          // A new session starts where a non-running phase becomes lit (counted from the states, not from the Cues).
          if (after.phase === "lit" && before.phase !== "lit" && before.phase !== "paused") session++;
          const counts = perSession.get(session) ?? { strike: 0, end: 0 };
          for (const cue of cues) {
            if (cue === "strike") counts.strike++;
            else counts.end++;
          }
          perSession.set(session, counts);
          expect(counts.strike).toBeLessThanOrEqual(1);
          expect(counts.end).toBeLessThanOrEqual(1);
        }
        seen.strike += played.filter((c) => c === "strike").length;
        seen.end += played.filter((c) => c !== "strike").length;
      }),
      PROP_PARAMS,
    );
    expect(seen.strike, "strikes").toBeGreaterThanOrEqual(100);
    expect(seen.end, "end Cues").toBeGreaterThanOrEqual(100);
    expect(seen.reloadEnds, "reloads that end a session").toBeGreaterThanOrEqual(10);
  });
});
