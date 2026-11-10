import { describe, expect, it } from "vitest";
import {
  BREAK_MS,
  INTENT_MAX_CODE_POINTS,
  MAX_LENGTH_MIN,
  MIN_LENGTH_MIN,
  MS_PER_MINUTE,
  PAUSE_LIMIT_MS,
  PRESET_LENGTHS_MIN,
  SCHEMA_VERSION,
} from "./constants";
import { INITIAL_STATE } from "./types";

describe("constants", () => {
  it("match the brief and the requirements", () => {
    expect(MS_PER_MINUTE).toBe(60_000);
    expect(MIN_LENGTH_MIN).toBe(5);
    expect(MAX_LENGTH_MIN).toBe(90);
    expect(INTENT_MAX_CODE_POINTS).toBe(80);
    expect(PAUSE_LIMIT_MS).toBe(10 * 60_000);
    expect(BREAK_MS).toBe(5 * 60_000);
    expect(SCHEMA_VERSION).toBe(1);
  });

  it("offers the presets 15, 25 and 50, all valid lengths", () => {
    expect([...PRESET_LENGTHS_MIN]).toEqual([15, 25, 50]);
    for (const p of PRESET_LENGTHS_MIN) {
      expect(p).toBeGreaterThanOrEqual(MIN_LENGTH_MIN);
      expect(p).toBeLessThanOrEqual(MAX_LENGTH_MIN);
    }
  });

  it("starts idle with an empty history", () => {
    expect(INITIAL_STATE).toEqual({ phase: "idle", history: [] });
  });
});
