// sound-and-title R3 (design 3.2, D1, D2): the three Cue_Specs against the recipes.
import { describe, expect, it } from "vitest";
import { CUE_SPECS, MASTER_GAIN, cueSpec } from "./specs";
import type { CueSpec, NoiseVoice, OscVoice, Voice } from "./types";

const peak = (v: Voice): number => Math.max(...v.gain.map(([, g]) => g));
const osc = (s: CueSpec): OscVoice[] => s.voices.filter((v): v is OscVoice => v.kind === "osc");
const noise = (s: CueSpec): NoiseVoice[] => s.voices.filter((v): v is NoiseVoice => v.kind === "noise");
const end = (v: Voice): number => v.gain[v.gain.length - 1]?.[0] ?? Number.NaN;

describe("the recipes of D1", () => {
  it("has the ids and durations 400, 2000 and 900 ms", () => {
    expect(Object.keys(CUE_SPECS).sort()).toEqual(["breath", "chime", "strike"]);
    expect([CUE_SPECS.strike.id, CUE_SPECS.chime.id, CUE_SPECS.breath.id]).toEqual(["strike", "chime", "breath"]);
    expect([CUE_SPECS.strike.durationMs, CUE_SPECS.chime.durationMs, CUE_SPECS.breath.durationMs]).toEqual([400, 2000, 900]);
    expect(MASTER_GAIN).toBe(0.5);
  });

  it("strike: a 100 ms noise scratch from 4000 to 2500 Hz, and a triangle flare 160 to 110 Hz from 60 ms", () => {
    const [scratch] = noise(CUE_SPECS.strike);
    const [flare] = osc(CUE_SPECS.strike);
    expect(scratch).toMatchObject({ seed: 0x5ca7c4, startMs: 0, filter: { kind: "bandpass", startHz: 4000, endHz: 2500, q: 0.8 } });
    expect(scratch?.gain).toEqual([[0, 0], [8, 0.24], [100, 0]]);
    expect(flare).toMatchObject({ waveform: "triangle", startMs: 60, startHz: 160, endHz: 110 });
    expect(flare?.gain).toEqual([[60, 0], [75, 0.14], [400, 0]]);
  });

  it("chime: sines at 660, 880 and 1320 Hz from 0, 140 and 280 ms, peaks 0.14, 0.12, 0.08, each decaying at least 600 ms", () => {
    const voices = osc(CUE_SPECS.chime);
    expect(voices.map((v) => [v.waveform, v.startHz, v.endHz, v.startMs, peak(v), end(v)])).toEqual([
      ["sine", 660, 660, 0, 0.14, 1400],
      ["sine", 880, 880, 140, 0.12, 1700],
      ["sine", 1320, 1320, 280, 0.08, 1900],
    ]);
    for (const v of voices) {
      const top = v.gain.find(([, g]) => g === peak(v))?.[0] ?? Number.NaN;
      expect(end(v) - top).toBeGreaterThanOrEqual(600);
    }
  });

  it("breath: two noise layers whose cutoffs end at 0.29 and 0.5 of the start", () => {
    const [a, b] = noise(CUE_SPECS.breath);
    expect(osc(CUE_SPECS.breath)).toEqual([]);
    expect(a).toMatchObject({ seed: 0xb2ea71, filter: { kind: "lowpass", startHz: 2400, endHz: 700, q: 0.7 } });
    expect(b).toMatchObject({ seed: 0x0d15ea, filter: { kind: "bandpass", startHz: 1800, endHz: 900, q: 0.9 } });
    expect((a?.filter.endHz ?? 0) / (a?.filter.startHz ?? 1)).toBeCloseTo(0.29, 2);
    expect((b?.filter.endHz ?? 0) / (b?.filter.startHz ?? 1)).toBeCloseTo(0.5, 2);
    expect(a?.gain).toEqual([[0, 0], [60, 0.3], [900, 0]]);
    expect(b?.gain).toEqual([[0, 0], [40, 0.08], [700, 0]]);
  });

  it("has the rise and fall lengths of D1", () => {
    const rises = (s: CueSpec): number[] => s.voices.map((v) => (v.gain[1]?.[0] ?? 0) - (v.gain[0]?.[0] ?? 0));
    const falls = (s: CueSpec): number[] => s.voices.map((v) => end(v) - (v.gain[1]?.[0] ?? 0));
    expect(rises(CUE_SPECS.strike)).toEqual([8, 15]);
    expect(falls(CUE_SPECS.strike)).toEqual([92, 325]);
    expect(rises(CUE_SPECS.chime)).toEqual([10, 10, 10]);
    expect(rises(CUE_SPECS.breath)).toEqual([60, 40]);
    expect(falls(CUE_SPECS.breath)).toEqual([840, 660]);
  });
});

describe("the sound rules on the data", () => {
  it("keeps the summed peaks after MASTER_GAIN at 0.19, 0.17 and 0.19, at most 0.2 (R3.7)", () => {
    const sums = (["strike", "chime", "breath"] as const).map((c) => CUE_SPECS[c].voices.reduce((s, v) => s + peak(v), 0) * MASTER_GAIN);
    expect(sums.map((s) => Number(s.toFixed(2)))).toEqual([0.19, 0.17, 0.19]);
    for (const s of sums) expect(s).toBeLessThanOrEqual(0.2);
  });

  it("has every frequency and cutoff above 0, so exponential ramps are valid", () => {
    for (const spec of Object.values(CUE_SPECS)) {
      for (const v of osc(spec)) expect(Math.min(v.startHz, v.endHz)).toBeGreaterThan(0);
      for (const v of noise(spec)) expect(Math.min(v.filter.startHz, v.filter.endHz)).toBeGreaterThan(0);
    }
  });

  it("is plain data: arrays and records of numbers and strings, and survives a JSON round trip", () => {
    const plain = (x: unknown): boolean =>
      typeof x === "number" || typeof x === "string" || (Array.isArray(x) && x.every(plain)) ||
      (x !== null && typeof x === "object" && Object.getPrototypeOf(x) === Object.prototype && Object.values(x).every(plain));
    for (const cue of ["strike", "chime", "breath"] as const) {
      const spec = cueSpec(cue);
      expect(plain(spec), cue).toBe(true);
      expect(JSON.parse(JSON.stringify(spec))).toEqual(spec);
    }
  });

  it("returns the same object on every call", () => {
    expect(cueSpec("chime")).toBe(cueSpec("chime"));
    expect(cueSpec("strike")).toBe(CUE_SPECS.strike);
  });
});
