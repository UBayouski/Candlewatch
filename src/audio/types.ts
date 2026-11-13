// The shared shapes of the audio folder (sound-and-title design 3.1, 3.2). Pure: types only.
import type { Event } from "../engine";

export type Cue = "strike" | "chime" | "breath";

/** What cueFor needs besides the two states (R2.13: read at the moment of the Transition). */
export interface CueContext {
  /** The type of the one event that `step` was given. `reload` never gives a Cue. */
  readonly eventType: Event["type"];
  /** The `sound` setting at the moment of the Transition. */
  readonly sound: boolean;
  /** Epoch ms, from the clock `main.ts` owns. */
  readonly now: number;
}

/** One gain point: [timeMs, gain]. timeMs is measured from the start of the Cue, not of the voice. */
export type GainPoint = readonly [timeMs: number, gain: number];

export type Waveform = "sine" | "triangle" | "sawtooth" | "square";
export type FilterKind = "lowpass" | "bandpass" | "highpass";

export interface FilterSpec {
  readonly kind: FilterKind;
  /** Cutoff (centre for bandpass) at the voice start, Hz. */
  readonly startHz: number;
  /** Cutoff at the voice end, Hz. The player sweeps start to end exponentially. */
  readonly endHz: number;
  readonly q: number;
}

interface VoiceBase {
  /** Cue-relative ms at which the voice starts. Equal to gain[0][0] (the first point, gain 0). */
  readonly startMs: number;
  /** Gain envelope. Times non-decreasing, inside [0, durationMs]. First and last gain are 0. Peak is the largest gain. */
  readonly gain: readonly GainPoint[];
}

export interface OscVoice extends VoiceBase {
  readonly kind: "osc";
  readonly waveform: Waveform;
  /** Frequency at the voice start and end, Hz. Equal means no glide. */
  readonly startHz: number;
  readonly endHz: number;
}

export interface NoiseVoice extends VoiceBase {
  readonly kind: "noise";
  /** Seed of the noise samples (noiseSamples). */
  readonly seed: number;
  readonly filter: FilterSpec;
}

export type Voice = OscVoice | NoiseVoice;

export interface CueSpec {
  readonly id: Cue;
  /** Total length. Every envelope ends at or before it. */
  readonly durationMs: number;
  readonly voices: readonly Voice[];
}
