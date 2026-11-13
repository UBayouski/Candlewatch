// Property test for the Cue_Specs (sound-and-title design 3.2, section 9). Property 5.
import * as fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { CUE_SPECS, MASTER_GAIN, cueSpec } from "./specs";
import { PROP_PARAMS } from "./test-kit";
import type { Cue, CueSpec, NoiseVoice, OscVoice, Voice } from "./types";

const peak = (v: Voice): number => Math.max(...v.gain.map(([, g]) => g));
const LIMITS: Readonly<Record<Cue, number>> = { strike: 700, chime: 2500, breath: 1200 };

/** Every rule of R3 for one spec. */
function checkSpec(cue: Cue, spec: CueSpec): void {
  expect(spec.id).toBe(cue);
  expect(spec.durationMs).toBeGreaterThan(0);
  expect(spec.durationMs).toBeLessThanOrEqual(LIMITS[cue]);
  expect(MASTER_GAIN).toBeGreaterThan(0);
  expect(MASTER_GAIN).toBeLessThanOrEqual(1);
  expect(spec.voices.reduce((s, v) => s + peak(v), 0) * MASTER_GAIN).toBeLessThanOrEqual(0.2);
  for (const v of spec.voices) {
    expect(peak(v)).toBeGreaterThan(0);
    const g = v.gain;
    const first = g[0];
    const last = g[g.length - 1];
    expect(first?.[1]).toBe(0);
    expect(last?.[1]).toBe(0);
    expect(first?.[0]).toBe(v.startMs);
    for (let i = 1; i < g.length; i++) expect(g[i]?.[0] ?? -1).toBeGreaterThanOrEqual(g[i - 1]?.[0] ?? 0);
    for (const [t] of g) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(spec.durationMs);
    }
    // The rise to the first peak is at least 5 ms, the fall from the last peak at least 20 ms (R3.8).
    const p = peak(v);
    const firstPeak = g.find(([, x]) => x === p)?.[0] ?? Number.NaN;
    const lastPeak = [...g].reverse().find(([, x]) => x === p)?.[0] ?? Number.NaN;
    expect(firstPeak - (first?.[0] ?? 0)).toBeGreaterThanOrEqual(5);
    expect((last?.[0] ?? 0) - lastPeak).toBeGreaterThanOrEqual(20);
  }
  const oscs = spec.voices.filter((v): v is OscVoice => v.kind === "osc");
  const noises = spec.voices.filter((v): v is NoiseVoice => v.kind === "noise");
  if (cue === "strike") {
    const scratch = noises[0];
    expect(scratch).toBeDefined();
    const scratchEnd = scratch?.gain[scratch.gain.length - 1]?.[0] ?? 0;
    expect(scratchEnd - (scratch?.startMs ?? 0)).toBeGreaterThanOrEqual(40);
    expect(scratchEnd - (scratch?.startMs ?? 0)).toBeLessThanOrEqual(150);
    const tonal = oscs.filter((o) => Math.min(o.startHz, o.endHz) >= 80 && Math.max(o.startHz, o.endHz) <= 220);
    expect(tonal.length).toBeGreaterThanOrEqual(1);
    expect(tonal.some((o) => o.startMs >= (scratch?.startMs ?? 0) && o.startMs <= scratchEnd)).toBe(true);
  }
  if (cue === "chime") {
    const tones = oscs.filter((o) => o.startHz >= 200 && o.startHz <= 2000 && o.endHz >= 200 && o.endHz <= 2000);
    expect(tones.length).toBeGreaterThanOrEqual(2);
    for (const o of tones) {
      const top = o.gain.find(([, x]) => x === peak(o))?.[0] ?? 0;
      expect((o.gain[o.gain.length - 1]?.[0] ?? 0) - top).toBeGreaterThanOrEqual(600);
    }
  }
  if (cue === "breath") {
    expect(oscs).toEqual([]);
    expect(noises.length).toBeGreaterThan(0);
    for (const n of noises) expect(n.filter.endHz).toBeLessThanOrEqual(0.7 * n.filter.startHz);
  }
}

describe("Feature: sound-and-title, Property 5: Cue_Specs obey the sound rules", () => {
  it("every Cue_Spec obeys R3, is the same across calls and across a changed motion preference, and the three differ", () => {
    fc.assert(
      fc.property(fc.constantFrom<Cue>("strike", "chime", "breath"), fc.boolean(), (cue, reduce) => {
        const before = cueSpec(cue);
        // There is no input for the motion preference: stub matchMedia to the other answer and ask again.
        vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce, media: q }));
        const after = cueSpec(cue);
        vi.unstubAllGlobals();
        expect(after).toEqual(before);
        expect(after).toBe(before);
        expect(cueSpec(cue)).toEqual(JSON.parse(JSON.stringify(before)));
        checkSpec(cue, before);
        const all = [CUE_SPECS.strike, CUE_SPECS.chime, CUE_SPECS.breath];
        expect(new Set(all.map((s) => s.id)).size).toBe(3);
        expect(new Set(all.map((s) => s.durationMs)).size).toBe(3);
      }),
      PROP_PARAMS,
    );
  });
});
