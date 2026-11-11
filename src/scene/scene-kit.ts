// Test-only helpers for the scene's property tests. Imported only by tests (the purity tests enforce it).
// The engine's own generators (`arbT0`, `arbScript`, `runScript`, ...) come from `src/engine/test-kit.ts`,
// which the property tests import directly; this file adds what only the scene needs.
import * as fc from "fast-check";
import type { State } from "../engine";
import { sceneModel } from "./model";
import type { SceneModel, SceneOptions } from "./types";

/** A moment: mostly realistic epoch milliseconds, some small and negative, some huge, some non-finite. */
export const arbNow: fc.Arbitrary<number> = fc.oneof(
  { weight: 5, arbitrary: fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 }) },
  { weight: 2, arbitrary: fc.integer({ min: -1_000_000, max: 1_000_000 }) },
  { weight: 1, arbitrary: fc.double({ noNaN: true, noDefaultInfinity: true }) },
  { weight: 2, arbitrary: fc.constantFrom(NaN, Infinity, -Infinity) },
);

/** A moment near `base`: up to two minutes before and four hours after. */
export const arbNowNear = (base: number): fc.Arbitrary<number> => fc.integer({ min: -120_000, max: 4 * 3_600_000 }).map((d) => base + d);

/** Any double as a flicker seed, including `NaN` and the infinities. */
export const arbSeed: fc.Arbitrary<number> = fc.double();

export const arbReduced: fc.Arbitrary<boolean> = fc.boolean();

/** Freezes a value and everything inside it, so a test can prove the code under test never writes to it. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value as Record<string, unknown>)) deepFreeze(inner);
  }
  return value;
}

/** The part of an engine trace entry the scene needs: the state after the step and its time. */
export interface TraceSample {
  readonly after: State;
  readonly now: number;
}

export interface ModelSample {
  readonly state: State;
  readonly now: number;
  readonly model: SceneModel;
}

/**
 * Evaluates `sceneModel` on every state of a trace, at the step's own time and at each probe offset after it.
 * Non-finite offsets are skipped, so a probe is always a real moment.
 */
export function sampleModels(
  trace: readonly TraceSample[],
  offsets: readonly number[],
  options: SceneOptions = {},
): ModelSample[] {
  const samples: ModelSample[] = [];
  for (const { after, now } of trace) {
    for (const at of [now, ...offsets.filter(Number.isFinite).map((d) => now + d)]) {
      samples.push({ state: after, now: at, model: sceneModel(after, at, options) });
    }
  }
  return samples;
}
