// Property tests for the scene model: P1, P2, P3, P5, P6, P7, P8 (candle-scene design.md section 13).
// P4 (the flicker) is in flicker.prop.test.ts. Every test runs PROP_PARAMS, which is 300 runs.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BREAK_MS, INITIAL_STATE, MS_PER_MINUTE, isBreak, step, timeLeftMs, waxFraction } from "../engine";
import type { State } from "../engine";
import { PROP_PARAMS, arbIntent, arbLength, arbScript, arbT0, arbWildScript, runScript } from "../engine/test-kit";
import { GUTTER_MS, LIGHT_MIN } from "./constants";
import { sceneModel } from "./model";
import { arbNow, arbReduced, arbSeed, deepFreeze, sampleModels } from "./scene-kit";
import { MOTION_FIELDS, RANGES } from "./types";
import type { FlameMode, SceneModel } from "./types";

const HOUR = 3_600_000;

const isRunning = (s: State): s is Extract<State, { phase: "lit" | "paused" }> => s.phase === "lit" || s.phase === "paused";

/** Probe offsets after a trace time: 0 to 4 hours. */
const arbOffsets = fc.array(fc.integer({ min: 0, max: 4 * HOUR }), { minLength: 1, maxLength: 4 });

/** The anchor of a paused state: where its burn froze. */
const anchorOf = (s: State): number | null => (s.phase === "paused" ? s.pausedAt : null);

describe("P1: wax height and drips", () => {
  it("while running, wax height is the engine's fraction; it never grows and drips never fall, over events and over time", () => {
    fc.assert(
      fc.property(arbT0, arbScript, arbOffsets, (t0, script, offsets) => {
        let previous: { startedAt: number; wax: number; drips: number } | null = null;
        for (const { after, now } of runScript(script, t0)) {
          if (!isRunning(after)) {
            previous = null;
            continue;
          }
          const own = sceneModel(after, now);
          expect(own.waxHeight).toBe(waxFraction(after, now));

          if (previous !== null && previous.startedAt === after.session.startedAt) {
            expect(own.waxHeight).toBeLessThanOrEqual(previous.wax);
            expect(own.drips).toBeGreaterThanOrEqual(previous.drips);
          }
          previous = { startedAt: after.session.startedAt, wax: own.waxHeight, drips: own.drips };

          for (const d of offsets) {
            const later = sceneModel(after, now + d);
            expect(later.waxHeight).toBe(waxFraction(after, now + d));
            expect(later.waxHeight).toBeLessThanOrEqual(own.waxHeight);
            expect(later.drips).toBeGreaterThanOrEqual(own.drips);
          }

          const anchor = anchorOf(after);
          if (anchor !== null) {
            const atAnchor = sceneModel(after, anchor);
            expect(own.waxHeight).toBe(atAnchor.waxHeight);
            expect(own.drips).toBe(atAnchor.drips);
            for (const d of offsets) {
              const later = sceneModel(after, now + d);
              expect(later.waxHeight).toBe(atAnchor.waxHeight);
              expect(later.drips).toBe(atAnchor.drips);
            }
          }
        }
      }),
      PROP_PARAMS,
    );
  });
});

describe("P1 (quarter marks): drips change exactly at the quarter marks", () => {
  it("shows one more drip at exactly 3/4, 1/2 and 1/4 of the time left, and not a millisecond before, by integer arithmetic", () => {
    fc.assert(
      fc.property(
        arbT0,
        arbLength,
        fc.constantFrom(0, 1, 2, 3),
        fc.constantFrom(-1, 0, 1),
        fc.integer({ min: 0, max: 90 * MS_PER_MINUTE }),
        (t0, length, mark, nudge, random) => {
          const L = length * MS_PER_MINUTE;
          const lit = step(INITIAL_STATE, { type: "light", length }, t0);
          const marks = [(3 * L) / 4, L / 2, L / 4];
          const left = mark === 3 ? Math.min(random, L) : Math.min(Math.max((marks[mark] ?? 0) + nudge, 0), L);
          const model = sceneModel(lit, t0 + L - left);
          expect(timeLeftMs(lit, t0 + L - left)).toBe(left);
          // An independent oracle in whole milliseconds: a mark is passed once the time left is at or below it.
          expect(model.drips).toBe(marks.filter((m) => left <= m).length);
        },
      ),
      PROP_PARAMS,
    );
  });
});

describe("P2: the light radius", () => {
  it("never grows during a session, is constant while paused, is non-decreasing in wax height, and stays in [LIGHT_MIN, 1]", () => {
    fc.assert(
      fc.property(arbT0, arbScript, arbOffsets, (t0, script, offsets) => {
        const seen: { wax: number; light: number }[] = [];
        let previous: { startedAt: number; light: number } | null = null;
        for (const { after, now } of runScript(script, t0)) {
          if (!isRunning(after)) {
            previous = null;
            continue;
          }
          const own = sceneModel(after, now);
          expect(own.lightRadius).toBeGreaterThanOrEqual(LIGHT_MIN);
          expect(own.lightRadius).toBeLessThanOrEqual(1);
          seen.push({ wax: own.waxHeight, light: own.lightRadius });

          if (previous !== null && previous.startedAt === after.session.startedAt) {
            expect(own.lightRadius).toBeLessThanOrEqual(previous.light);
          }
          previous = { startedAt: after.session.startedAt, light: own.lightRadius };

          for (const d of offsets) {
            const later = sceneModel(after, now + d);
            expect(later.lightRadius).toBeLessThanOrEqual(own.lightRadius);
            expect(later.lightRadius).toBeGreaterThanOrEqual(LIGHT_MIN);
            seen.push({ wax: later.waxHeight, light: later.lightRadius });
            if (after.phase === "paused") expect(later.lightRadius).toBe(own.lightRadius);
          }
        }
        seen.sort((a, b) => a.wax - b.wax);
        seen.forEach((s, i) => {
          const before = seen[i - 1];
          if (before) expect(s.light).toBeGreaterThanOrEqual(before.light);
          if (before && before.wax === s.wax) expect(s.light).toBe(before.light);
        });
      }),
      PROP_PARAMS,
    );
  });
});

describe("P3: the flame mode is a function of the phase and the time left", () => {
  /** An independent plain table of R5.1. */
  function oracle(phase: State["phase"], timeLeft: number): FlameMode {
    if (phase === "idle") return "unlit";
    if (phase === "paused") return "paused";
    if (phase === "burned-out" || phase === "snuffed") return "smoke";
    return timeLeft <= GUTTER_MS ? "guttering" : "steady";
  }

  /** A fresh candle lit after a prefix run, so the state carries earlier history (a running prefix is snuffed first). */
  function lightAfter(prefix: State, at: number, length: number, intent: string | undefined): State {
    const base = isRunning(prefix) ? step(prefix, { type: "snuff" }, at) : prefix;
    return step(base, { type: "light", length, intent }, at + 1);
  }

  const arbTimeLeft = fc.oneof(
    fc.constantFrom(0, 1, 59_999, 60_000, 60_001),
    fc.integer({ min: 0, max: 90 * MS_PER_MINUTE }),
  );

  it("two lit or paused states with the same time left give the same mode, whatever the length, intent and history", () => {
    fc.assert(
      fc.property(
        arbT0,
        arbScript,
        arbLength,
        arbLength,
        arbIntent,
        arbIntent,
        arbTimeLeft,
        fc.integer({ min: 0, max: 5000 }),
        (t0, prefixScript, lenA, lenB, intentA, intentB, wanted, extra) => {
          const trace = runScript(prefixScript, t0);
          const last = trace.length === 0 ? { state: INITIAL_STATE, now: t0 } : { state: trace[trace.length - 1]?.after ?? INITIAL_STATE, now: trace[trace.length - 1]?.now ?? t0 };
          const a = lightAfter(INITIAL_STATE, t0, lenA, intentA);
          const b = lightAfter(last.state, last.now, lenB, intentB);
          if (a.phase !== "lit" || b.phase !== "lit") return;
          const left = Math.min(wanted, lenA * MS_PER_MINUTE, lenB * MS_PER_MINUTE);

          const nowA = a.session.startedAt + lenA * MS_PER_MINUTE - left;
          const nowB = b.session.startedAt + lenB * MS_PER_MINUTE - left;
          expect(timeLeftMs(a, nowA)).toBe(left);
          expect(timeLeftMs(b, nowB)).toBe(left);
          const modeA = sceneModel(a, nowA).flameMode;
          expect(sceneModel(b, nowB).flameMode).toBe(modeA);
          expect(modeA).toBe(oracle("lit", left));

          // Paused with the same time left (at least 1 ms, so pausing is not settled into the end first).
          const pausedLeft = Math.max(1, left);
          const pa = step(a, { type: "pause" }, a.session.startedAt + lenA * MS_PER_MINUTE - pausedLeft);
          const pb = step(b, { type: "pause" }, b.session.startedAt + lenB * MS_PER_MINUTE - pausedLeft);
          if (pa.phase !== "paused" || pb.phase !== "paused") return;
          const pausedAtA = pa.pausedAt + extra;
          expect(timeLeftMs(pa, pausedAtA)).toBe(pausedLeft);
          expect(sceneModel(pa, pausedAtA).flameMode).toBe("paused");
          expect(sceneModel(pb, pb.pausedAt + extra).flameMode).toBe("paused");
          expect(sceneModel(pa, pausedAtA).flameMode).toBe(oracle("paused", pausedLeft));
        },
      ),
      PROP_PARAMS,
    );
  });

  it("over a whole run, every (phase, time left) key maps to exactly one mode, and it is the table's mode", () => {
    fc.assert(
      fc.property(arbT0, arbScript, arbOffsets, (t0, script, offsets) => {
        const modes = new Map<string, Set<FlameMode>>();
        for (const { state, now, model } of sampleModels(runScript(script, t0), offsets)) {
          const left = timeLeftMs(state, now);
          const key = `${state.phase}:${left}`;
          const set = modes.get(key) ?? new Set<FlameMode>();
          set.add(model.flameMode);
          modes.set(key, set);
          expect(model.flameMode).toBe(oracle(state.phase, left));
        }
        for (const [key, set] of modes) expect(set.size, key).toBe(1);
      }),
      PROP_PARAMS,
    );
  });
});

describe("P5: reduced motion keeps the information", () => {
  const strip = (m: SceneModel): Record<string, unknown> =>
    Object.fromEntries(Object.entries(m).filter(([k]) => !(MOTION_FIELDS as readonly string[]).includes(k)));

  it("equals the normal model in every non-motion field, with the motion values zero or false", () => {
    fc.assert(
      fc.property(
        arbT0,
        arbWildScript,
        fc.array(arbNow, { minLength: 1, maxLength: 3 }),
        fc.array(arbSeed, { minLength: 1, maxLength: 2 }),
        (t0, script, nows, seeds) => {
          for (const { after, now } of runScript(script, t0)) {
            for (const at of [now, ...nows]) {
              for (const seed of seeds) {
                const normal = sceneModel(after, at, { reducedMotion: false, seed });
                const still = sceneModel(after, at, { reducedMotion: true, seed });
                expect(strip(still)).toEqual(strip(normal));
                expect([still.flickerLean, still.flickerHeight, still.flickerGlow]).toEqual([0, 0, 0]);
                expect([still.animateDrips, still.animateSmoke, still.animateEase]).toEqual([false, false, false]);
              }
            }
          }
        },
      ),
      PROP_PARAMS,
    );
  });
});

describe("P6: totality and bounds", () => {
  const FLAME_MODES: readonly string[] = ["unlit", "steady", "paused", "guttering", "smoke"];
  const PHASES: readonly string[] = ["idle", "lit", "paused", "burned-out", "snuffed"];

  it("never throws; every number is finite and in range; discrete fields stay in their sets", () => {
    fc.assert(
      fc.property(
        arbT0,
        arbWildScript,
        fc.array(arbNow, { minLength: 1, maxLength: 3 }),
        arbSeed,
        arbReduced,
        (t0, script, nows, seed, reducedMotion) => {
          for (const { after, now } of runScript(script, t0)) {
            for (const at of [now, ...nows]) {
              const m = sceneModel(after, at, { seed, reducedMotion });
              for (const [field, [lo, hi]] of Object.entries(RANGES)) {
                const v = m[field as keyof SceneModel] as number;
                expect(Number.isFinite(v), `${field} at ${at}`).toBe(true);
                expect(v, field).toBeGreaterThanOrEqual(lo);
                expect(v, field).toBeLessThanOrEqual(hi);
              }
              expect([0, 1, 2, 3]).toContain(m.drips);
              for (const f of [m.flameRagged, m.smoke, m.stub, m.dawn]) expect([0, 1]).toContain(f);
              expect(FLAME_MODES).toContain(m.flameMode);
              expect(PHASES).toContain(m.phase);
              expect(m.phase).toBe(after.phase);
              for (const b of [m.cooling, m.animateDrips, m.animateSmoke, m.animateEase]) expect(typeof b).toBe("boolean");
            }
          }
        },
      ),
      PROP_PARAMS,
    );
  });
});

describe("P7: the model is a pure function of its input", () => {
  it("gives deeply equal models for equal input, leaves a deep-frozen input unchanged, and holds only numbers, booleans and the two unions", () => {
    fc.assert(
      fc.property(arbT0, arbWildScript, arbNow, arbSeed, arbReduced, (t0, script, extraNow, seed, reducedMotion) => {
        for (const { after, now } of runScript(script, t0)) {
          const clone = structuredClone(after);
          const frozen = deepFreeze(structuredClone(after));
          for (const at of [now, extraNow]) {
            const first = sceneModel(frozen, at, { seed, reducedMotion });
            const second = sceneModel(frozen, at, { seed, reducedMotion });
            expect(second).toEqual(first);
            for (const [key, value] of Object.entries(first)) {
              if (key === "phase" || key === "flameMode") expect(typeof value, key).toBe("string");
              else expect(["number", "boolean"], key).toContain(typeof value);
            }
          }
          expect(frozen).toEqual(clone);
        }
      }),
      PROP_PARAMS,
    );
  });
});

describe("P8: dawn, light, the stub and cooling", () => {
  it("dawn is 1 exactly after a finish; light and the stub follow the end; cooling is the engine's break", () => {
    fc.assert(
      fc.property(arbT0, arbScript, fc.array(arbNow, { minLength: 1, maxLength: 4 }), (t0, script, nows) => {
        for (const { after, now } of runScript(script, t0)) {
          for (const at of [now, ...nows]) {
            const m = sceneModel(after, at);
            expect(m.dawn === 1).toBe(after.phase === "burned-out");
            expect(m.dawn === 0 || m.dawn === 1).toBe(true);
            const ended = after.phase === "burned-out" || after.phase === "snuffed";
            expect(m.lightRadius === 0).toBe(ended);
            expect(m.stub === 1).toBe(ended);
            expect(m.cooling).toBe(isBreak(after, at));
          }
        }
      }),
      PROP_PARAMS,
    );
  });

  it("a burned-out state inside the break and after it differ only in cooling", () => {
    fc.assert(
      fc.property(
        arbT0,
        arbScript,
        fc.integer({ min: 0, max: BREAK_MS - 1 }),
        fc.integer({ min: 0, max: 3 * HOUR }),
        fc.array(arbSeed, { minLength: 1, maxLength: 2 }),
        arbReduced,
        (t0, script, insideBy, afterBy, seeds, reducedMotion) => {
          for (const { after } of runScript(script, t0)) {
            if (after.phase !== "burned-out") continue;
            for (const seed of seeds) {
              const inside = sceneModel(after, after.endedAt + insideBy, { seed, reducedMotion });
              const later = sceneModel(after, after.breakEndsAt + afterBy, { seed, reducedMotion });
              expect(inside.cooling).toBe(true);
              expect(later.cooling).toBe(false);
              const { cooling: a, ...restInside } = inside;
              const { cooling: b, ...restLater } = later;
              void a;
              void b;
              expect(restInside).toEqual(restLater);
            }
          }
        },
      ),
      PROP_PARAMS,
    );
  });
});
