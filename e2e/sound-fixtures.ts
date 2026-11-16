import type { Page } from "@playwright/test";
import { CUE_SPECS } from "../src/audio/specs";

export interface AudioEntry {
  readonly kind: string;
  readonly at: number;
  readonly hz?: number;
  readonly waveform?: string;
  readonly filter?: string;
}

// The page owns this test-only fake. It deliberately resumes in a microtask.
export const FAKE_AUDIO_SCRIPT = `(() => {
  const w = window;
  w.__audioLog = [];
  const log = (kind, extra = {}) => w.__audioLog.push({ kind, at: Date.now(), ...extra });
  class Param {
    value = 0;
    constructor(onSet = () => {}) { this.onSet = onSet; }
    setValueAtTime(value) { this.value = value; this.onSet(value); return this; }
    linearRampToValueAtTime(value) { this.value = value; return this; }
    exponentialRampToValueAtTime(value) { this.value = value; return this; }
    cancelScheduledValues() { return this; }
  }
  class Node {
    connect() { return this; }
    disconnect() {}
  }
  class Source extends Node {
    onended = null;
    start() {}
    stop() { log('stop'); }
  }
  class FakeAudioContext {
    state = 'suspended';
    sampleRate = 44100;
    currentTime = 0;
    destination = new Node();
    constructor() { log('construct'); }
    resume() { log('resume'); return Promise.resolve().then(() => { this.state = 'running'; }); }
    createGain() { const n = new Node(); n.gain = new Param(); return n; }
    createOscillator() { const n = new Source(); n.frequency = new Param((hz) => log('osc', { hz, waveform: n.type })); n.type = 'sine'; return n; }
    createBuffer() { return { getChannelData: (_channel) => new Float32Array(44100) }; }
    createBufferSource() { log('noise'); return new Source(); }
    createBiquadFilter() { const n = new Node(); n.type = 'lowpass'; n.Q = new Param(); n.frequency = new Param((hz) => log('filter', { hz, filter: n.type })); return n; }
  }
  w.AudioContext = FakeAudioContext;
})();`;

export const FAKE_AUDIO_THROWS = `(() => {
  window.__audioLog = [];
  window.AudioContext = class { constructor() { throw new Error('audio unavailable'); } };
})();`;

export const audioLog = (page: Page): Promise<AudioEntry[]> =>
  page.evaluate(() => (window as unknown as { __audioLog: AudioEntry[] }).__audioLog);

export const constructions = (log: readonly AudioEntry[]): number => log.filter((e) => e.kind === "construct").length;
export const resumes = (log: readonly AudioEntry[]): number => log.filter((e) => e.kind === "resume").length;
export function cuesPlayed(log: readonly AudioEntry[]): string[] {
  const strikeHz = CUE_SPECS.strike.voices[0];
  const chimeHz = CUE_SPECS.chime.voices[0];
  const breathHz = CUE_SPECS.breath.voices[0];
  if (strikeHz?.kind !== "noise" || chimeHz?.kind !== "osc" || breathHz?.kind !== "noise") throw new Error("Cue signatures changed");
  return log.flatMap((e) => {
    if (e.kind === "filter" && e.filter === "bandpass" && e.hz === strikeHz.filter.startHz) return ["strike"];
    if (e.kind === "osc" && e.waveform === "sine" && e.hz === chimeHz.startHz) return ["chime"];
    if (e.kind === "filter" && e.filter === "lowpass" && e.hz === breathHz.filter.startHz) return ["breath"];
    return [];
  });
}

export async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((hide) => {
    const w = window as unknown as { __heldFrames?: FrameRequestCallback[]; __originalRaf?: typeof requestAnimationFrame };
    if (hide) {
      w.__heldFrames = [];
      w.__originalRaf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
        w.__heldFrames?.push(callback);
        return w.__heldFrames?.length ?? 0;
      };
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    } else {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      if (w.__originalRaf) window.requestAnimationFrame = w.__originalRaf;
      document.dispatchEvent(new Event("visibilitychange"));
      for (const callback of w.__heldFrames ?? []) window.requestAnimationFrame(callback);
      w.__heldFrames = [];
    }
  }, hidden);
}
