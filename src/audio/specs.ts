// The three Cue_Specs (sound-and-title design 3.2, D1, D2; R3). Pure, plain data: numbers, strings and arrays. The player turns a
// spec into nodes. The reduced-motion preference never enters it (R3.11).
import type { Cue, CueSpec } from "./types";

/** One master gain for all Cues, applied by one gain node in the player. 0 < value <= 1 (R3.7). */
export const MASTER_GAIN = 0.5;

export const CUE_SPECS: Readonly<Record<Cue, CueSpec>> = {
  // A match struck: a 100 ms scratch of bandpassed noise, then a low triangle flare from 60 ms.
  strike: {
    id: "strike",
    durationMs: 400,
    voices: [
      {
        kind: "noise",
        seed: 0x5ca7c4,
        startMs: 0,
        filter: { kind: "bandpass", startHz: 4000, endHz: 2500, q: 0.8 },
        gain: [
          [0, 0],
          [8, 0.24],
          [100, 0],
        ],
      },
      {
        kind: "osc",
        waveform: "triangle",
        startMs: 60,
        startHz: 160,
        endHz: 110,
        gain: [
          [60, 0],
          [75, 0.14],
          [400, 0],
        ],
      },
    ],
  },
  // A soft bell rising: three sines in the ratio 3:4:6, staggered 140 ms.
  chime: {
    id: "chime",
    durationMs: 2000,
    voices: [
      {
        kind: "osc",
        waveform: "sine",
        startMs: 0,
        startHz: 660,
        endHz: 660,
        gain: [
          [0, 0],
          [10, 0.14],
          [1400, 0],
        ],
      },
      {
        kind: "osc",
        waveform: "sine",
        startMs: 140,
        startHz: 880,
        endHz: 880,
        gain: [
          [140, 0],
          [150, 0.12],
          [1700, 0],
        ],
      },
      {
        kind: "osc",
        waveform: "sine",
        startMs: 280,
        startHz: 1320,
        endHz: 1320,
        gain: [
          [280, 0],
          [290, 0.08],
          [1900, 0],
        ],
      },
    ],
  },
  // A flame blown out: two layers of filtered noise, their cutoffs falling.
  breath: {
    id: "breath",
    durationMs: 900,
    voices: [
      {
        kind: "noise",
        seed: 0xb2ea71,
        startMs: 0,
        filter: { kind: "lowpass", startHz: 2400, endHz: 700, q: 0.7 },
        gain: [
          [0, 0],
          [60, 0.3],
          [900, 0],
        ],
      },
      {
        kind: "noise",
        seed: 0x0d15ea,
        startMs: 0,
        filter: { kind: "bandpass", startHz: 1800, endHz: 900, q: 0.9 },
        gain: [
          [0, 0],
          [40, 0.08],
          [700, 0],
        ],
      },
    ],
  },
};

/** Same object for the same Cue, on every call and whatever the motion preference (R3.5, R3.11). */
export function cueSpec(cue: Cue): CueSpec {
  return CUE_SPECS[cue];
}
