// The Audio_Player (sound-and-title design 3.3, D19, D20, D21, D26; R4). Effect file: the only one that names the audio API, and
// only inside browserAudioFactory. Everything else reaches the context through the injected factory, so tests pass a fake.
import { noiseSamples } from "./noise";
import { cueSpec, MASTER_GAIN } from "./specs";
import type { Cue, Voice } from "./types";

/** The smallest part of Web Audio the player uses. The real context satisfies it; the fake implements it. */
export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
  cancelScheduledValues(time: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
  disconnect(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

/** The `ended` handler. Typed so the browser's wider handler type is accepted; the player never reads the argument. */
export type EndedHandler = ((this: never, event: never) => unknown) | null;

export interface OscillatorNodeLike extends AudioNodeLike {
  type: string;
  readonly frequency: AudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
  onended: EndedHandler;
}

export interface AudioBufferLike {
  getChannelData(channel: number): Float32Array;
}

export interface BufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  start(when?: number): void;
  stop(when?: number): void;
  onended: EndedHandler;
}

export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: string;
  readonly frequency: AudioParamLike;
  readonly Q: AudioParamLike;
}

export interface AudioContextLike {
  /** "suspended" | "running" | "closed" in a browser. */
  readonly state: string;
  /** Seconds. */
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: AudioNodeLike;
  resume(): Promise<void> | void;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorNodeLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  createBufferSource(): BufferSourceNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  /** Declared for test cleanup; the player never calls it. */
  close?(): Promise<void> | void;
}

export interface AudioPlayerDeps {
  /** Called at most once, inside unlock(). Returns null when there is no audio context. */
  readonly factory: () => AudioContextLike | null;
  /** The `sound` setting at start-up. */
  readonly sound: boolean;
}

export interface AudioPlayer {
  /** Start the Cue now, or drop it. Never throws, never queues for a later gesture. */
  play(cue: Cue): void;
  /** Follow the `sound` setting. Turning it on is a gesture: it unlocks (R4.5). Turning it off fades the sounding Cue (R4.7). */
  setSound(on: boolean): void;
  /** Create the context and call resume() in the same call. To be called inside a user gesture. True when unlocked afterwards. */
  unlock(): boolean;
  /** True once the context exists. */
  isUnlocked(): boolean;
}

/** The fade of a replaced or silenced Cue, and the stop just after it (D20). Seconds. */
const FADE_S = 0.03;
const FADE_STOP_S = 0.035;
/** A source stops this long after its last gain point, which is already 0. Seconds. */
const TAIL_S = 0.01;
/** Extra noise samples past the last gain point, ms. */
const NOISE_PAD_MS = 10;

type Source = OscillatorNodeLike | BufferSourceNodeLike;

/** One built Cue: the per-Cue gain, its sources, the fade and the idempotent release. */
interface Playing {
  fadeOut(): void;
  release(): void;
}

const noop = (): void => undefined;

/** Disconnects a node and swallows a throw: a release must never fail. */
function cut(node: AudioNodeLike): void {
  try {
    node.disconnect();
  } catch {
    /* already gone */
  }
}

/** Builds the nodes of `cue` under `master`, starts them and returns the handle. A throw releases what was built, then rethrows. */
function build(ctx: AudioContextLike, master: GainNodeLike, cue: Cue): Playing {
  const t0 = ctx.currentTime;
  if (!Number.isFinite(t0)) throw new RangeError();
  const at = (ms: number): number => t0 + ms / 1000;

  // The per-Cue gain first: if this throws, nothing was built.
  const cueGain = ctx.createGain();
  // Per voice: the nodes to cut when its source ends, and whether that happened.
  const voices: { source: Source | null; nodes: AudioNodeLike[]; done: boolean }[] = [];
  let cueCut = false;

  const releaseCue = (): void => {
    if (cueCut) return;
    cueCut = true;
    cut(cueGain);
  };
  const releaseVoice = (i: number): void => {
    const v = voices[i];
    if (v === undefined || v.done) return;
    v.done = true;
    for (const n of v.nodes) cut(n);
    if (voices.every((w) => w.done)) releaseCue();
  };
  const release = (): void => {
    for (const v of voices) {
      if (v.done || v.source === null) continue;
      try {
        v.source.stop();
      } catch {
        /* never started */
      }
    }
    voices.forEach((_, i) => releaseVoice(i));
    releaseCue();
  };

  try {
    cueGain.gain.value = 1;
    cueGain.connect(master);

    const spec = cueSpec(cue);
    const starts: { source: Source; start: number; stop: number }[] = [];
    spec.voices.forEach((voice: Voice, i) => {
      const entry: { source: Source | null; nodes: AudioNodeLike[]; done: boolean } = { source: null, nodes: [], done: false };
      voices.push(entry);
      const first = voice.gain[0];
      const last = voice.gain[voice.gain.length - 1];
      if (first === undefined || last === undefined) throw new RangeError();
      const s = voice.startMs;
      const end = last[0];

      const vg = ctx.createGain();
      entry.nodes.push(vg);
      vg.gain.value = 0;
      vg.gain.setValueAtTime(0, at(first[0]));
      for (const [time, gain] of voice.gain.slice(1)) vg.gain.linearRampToValueAtTime(gain, at(time));
      vg.connect(cueGain);

      let source: Source;
      if (voice.kind === "osc") {
        const osc = ctx.createOscillator();
        entry.nodes.unshift(osc);
        entry.source = osc;
        osc.type = voice.waveform;
        osc.frequency.setValueAtTime(voice.startHz, at(s));
        if (voice.endHz !== voice.startHz) osc.frequency.exponentialRampToValueAtTime(voice.endHz, at(end));
        osc.connect(vg);
        source = osc;
      } else {
        const n = Math.ceil((ctx.sampleRate * (end - s + NOISE_PAD_MS)) / 1000);
        const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
        buffer.getChannelData(0).set(noiseSamples(voice.seed, n));
        const src = ctx.createBufferSource();
        entry.nodes.unshift(src);
        entry.source = src;
        src.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        entry.nodes.splice(1, 0, filter);
        filter.type = voice.filter.kind;
        filter.Q.value = voice.filter.q;
        filter.frequency.setValueAtTime(voice.filter.startHz, at(s));
        filter.frequency.exponentialRampToValueAtTime(voice.filter.endHz, at(end));
        src.connect(filter);
        filter.connect(vg);
        source = src;
      }
      source.onended = () => releaseVoice(i);
      starts.push({ source, start: at(s), stop: at(end) + TAIL_S });
    });
    for (const { source, start, stop } of starts) {
      source.start(start);
      source.stop(stop);
    }
  } catch (error) {
    release();
    throw error;
  }

  return {
    fadeOut() {
      const t = ctx.currentTime;
      cueGain.gain.cancelScheduledValues(t);
      cueGain.gain.setValueAtTime(cueGain.gain.value, t);
      cueGain.gain.linearRampToValueAtTime(0, t + FADE_S);
      for (const v of voices) if (!v.done && v.source !== null) v.source.stop(t + FADE_STOP_S);
    },
    release,
  };
}

export function createAudioPlayer(deps: AudioPlayerDeps): AudioPlayer {
  let state: "locked" | "unlocked" | "failed" = "locked";
  let sound = deps.sound;
  let ctx: AudioContextLike | null = null;
  let master: GainNodeLike | null = null;
  /** The Cue that sounds, and the one fading out behind it (released at the next fade, in case it never ends). */
  let current: Playing | null = null;
  let fading: Playing | null = null;
  /** Every request that reaches the context takes a number; `held` is the one waiting for its own resume(), 0 for none (D19). */
  let requests = 0;
  let held = 0;

  /** Fades the sounding Cue and keeps it as the fading one. */
  const silence = (): void => {
    const playing = current;
    current = null;
    if (playing === null) return;
    if (fading !== null) fading.release();
    fading = playing;
    playing.fadeOut();
  };

  const fail = (): void => {
    state = "failed";
    held = 0;
    try {
      silence();
    } catch {
      /* already failing */
    }
  };

  const start = (c: AudioContextLike, cue: Cue): void => {
    if (master === null) return;
    silence();
    current = build(c, master, cue);
  };

  const unlock = (): boolean => {
    if (state === "unlocked") return true;
    if (state === "failed" || !sound) return false;
    try {
      const made = deps.factory();
      if (made === null) {
        state = "failed";
        return false;
      }
      ctx = made;
      const m = made.createGain();
      m.gain.value = MASTER_GAIN;
      m.connect(made.destination);
      master = m;
      const resumed = made.resume();
      if (resumed !== undefined) resumed.then(noop, noop);
      state = "unlocked";
      return true;
    } catch {
      state = "failed";
      return false;
    }
  };

  return {
    play(cue) {
      const c = ctx;
      if (state !== "unlocked" || c === null) return;
      if (!sound) return;
      try {
        const mine = ++requests;
        held = 0;
        if (c.state === "running") {
          start(c, cue);
          return;
        }
        if (c.state === "closed") {
          fail();
          return;
        }
        const resumed = c.resume();
        if (c.state === "running") {
          start(c, cue);
          return;
        }
        if (resumed === undefined) return;
        held = mine;
        resumed.then(
          () => {
            if (held !== mine) return;
            held = 0;
            if (state !== "unlocked" || !sound || c.state !== "running") return;
            try {
              start(c, cue);
            } catch {
              fail();
            }
          },
          () => {
            if (held === mine) held = 0;
          },
        );
      } catch {
        fail();
      }
    },
    setSound(on) {
      if (state === "failed") return;
      sound = on;
      if (!on) {
        held = 0;
        try {
          silence();
        } catch {
          fail();
        }
      } else if (state === "locked") {
        unlock();
      }
    },
    unlock,
    isUnlocked: () => state === "unlocked",
  };
}

/** A factory over `window.AudioContext`; null when it is missing or its construction throws (R4.12, D21). */
export function browserAudioFactory(): () => AudioContextLike | null {
  return () => {
    try {
      if (typeof window === "undefined" || typeof window.AudioContext !== "function") return null;
      return new window.AudioContext();
    } catch {
      return null;
    }
  };
}
