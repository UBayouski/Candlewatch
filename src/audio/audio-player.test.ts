// Unit tests of the Audio_Player against the Fake_AudioContext (sound-and-title task 6.2, design 3.3, D19, D20, D26; R4).
import { describe, expect, it } from "vitest";
import { browserAudioFactory, createAudioPlayer } from "./audio-player";
import { countingFactory, FakeAudioContext, FakeBiquad, FakeBufferSource, FakeGain, FakeOscillator } from "./fake-audio-context";
import type { FakeOptions } from "./fake-audio-context";
import { CUE_SPECS, MASTER_GAIN } from "./specs";
import type { Cue } from "./types";

/** Lets every pending promise callback run. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** A player on a counting factory, unlocked unless told otherwise. */
function setup(options: FakeOptions = {}, sound = true, unlock = true) {
  const f = countingFactory(options);
  const player = createAudioPlayer({ factory: f.factory, sound });
  if (unlock) player.unlock();
  const ctx = (): FakeAudioContext => {
    const c = f.context();
    if (c === null) throw new Error("no context");
    return c;
  };
  return { f, player, ctx };
}

const startedCues = (ctx: FakeAudioContext): (Cue | null)[] => ctx.cueGains().map((g) => ctx.cueOf(g));

describe("creation and unlock (R4.1, R4.2, R4.6)", () => {
  it("constructs nothing at creation", () => {
    const { f, player } = setup({}, true, false);
    expect(f.calls()).toBe(0);
    expect(player.isUnlocked()).toBe(false);
  });

  it("unlock() constructs once and calls resume() in the same call", () => {
    const { f, player } = setup({ resumeMode: "never" }, true, false);
    expect(player.unlock()).toBe(true);
    expect(f.calls()).toBe(1);
    expect(f.context()?.resumeCalls).toBe(1);
    expect(player.unlock()).toBe(true);
    expect(f.calls()).toBe(1);
    expect(f.context()?.resumeCalls).toBe(1);
    expect(player.isUnlocked()).toBe(true);
  });

  it("builds one master gain at MASTER_GAIN on the destination", () => {
    const { ctx } = setup();
    const master = ctx().master();
    expect(master).not.toBeNull();
    expect(master?.gain.value).toBe(MASTER_GAIN);
    expect(ctx().nodes).toEqual([master]);
  });

  it("with sound off, unlock() constructs nothing and stays locked", () => {
    const { f, player } = setup({}, false, false);
    expect(player.unlock()).toBe(false);
    expect(f.calls()).toBe(0);
    expect(player.isUnlocked()).toBe(false);
  });

  it("setSound(true) before any gesture unlocks; setSound(false) creates nothing (R4.5)", () => {
    const { f, player } = setup({}, false, false);
    player.setSound(false);
    expect(f.calls()).toBe(0);
    player.setSound(true);
    expect(f.calls()).toBe(1);
    expect(player.isUnlocked()).toBe(true);
    player.setSound(true);
    expect(f.calls()).toBe(1);
  });

  it("a rejected resume() in unlock is swallowed and the player stays unlocked", async () => {
    const { player } = setup({ resumeMode: "throw" });
    await flush();
    expect(player.isUnlocked()).toBe(true);
  });
});

describe("play (rules 1 to 6)", () => {
  it("a request before unlock is dropped and not replayed after unlock (R4.8, R4.14)", async () => {
    const { f, player, ctx } = setup({}, true, false);
    player.play("chime");
    expect(f.calls()).toBe(0);
    player.unlock();
    await flush();
    ctx().advance(100);
    expect(ctx().sources()).toEqual([]);
  });

  it("a running context starts the Cue at once", () => {
    const { player, ctx } = setup();
    player.play("strike");
    expect(startedCues(ctx())).toEqual(["strike"]);
    expect(ctx().sounding().map((s) => s.cue)).toEqual(["strike"]);
  });

  it("sound off drops the request (R4.6)", () => {
    const { player, ctx } = setup();
    player.setSound(false);
    player.play("strike");
    expect(ctx().sources()).toEqual([]);
  });

  it("a suspended context whose resume() flips the state starts the Cue", () => {
    const { player, ctx } = setup({ resumeMode: "instant" });
    ctx().state = "suspended";
    player.play("chime");
    expect(ctx().resumeCalls).toBe(2);
    expect(startedCues(ctx())).toEqual(["chime"]);
  });

  it("a context that stays suspended drops the Cue (R4.9)", async () => {
    const { player, ctx } = setup({ resumeMode: "never" });
    player.play("chime");
    expect(ctx().resumeCalls).toBe(2);
    await flush();
    expect(ctx().sources()).toEqual([]);
  });

  it("a resume() that returns nothing and leaves the state suspended drops the Cue now", async () => {
    const { player, ctx } = setup({ resumeMode: "void" });
    player.play("breath");
    await flush();
    expect(ctx().sources()).toEqual([]);
  });

  it("a resume() that rejects at play (the spec's interrupted or closed refusal) drops the Cue, throws nothing and leaves the player unlocked", async () => {
    const { player, ctx } = setup({ resumeMode: "throw" });
    expect(() => player.play("strike")).not.toThrow();
    expect(ctx().resumeCalls).toBe(2); // one in unlock, one in play
    await flush(); // the rejection is handled inside the player; vitest fails the run on an unhandled one
    expect(ctx().sources()).toEqual([]);
    expect(startedCues(ctx())).toEqual([]);
    expect(player.isUnlocked()).toBe(true);
  });

  it("a deferred resume() starts the held request once, and only the latest (D19)", async () => {
    const { player, ctx } = setup({ resumeMode: "deferred" });
    player.play("strike");
    player.play("chime");
    expect(ctx().sources()).toEqual([]);
    await flush();
    expect(startedCues(ctx())).toEqual(["chime"]);
    await flush();
    expect(startedCues(ctx())).toEqual(["chime"]);
  });

  it("the first strike of a key press that also unlocks is held and plays (D19)", async () => {
    const { player, ctx } = setup({ resumeMode: "deferred" }, true, false);
    player.unlock();
    player.play("strike");
    await flush();
    expect(startedCues(ctx())).toEqual(["strike"]);
  });

  it("setSound(false) clears the held request", async () => {
    const { player, ctx } = setup({ resumeMode: "deferred" });
    player.play("chime");
    player.setSound(false);
    await flush();
    expect(ctx().sources()).toEqual([]);
  });

  it("a held request is dropped if sound went off and back on before it settled", async () => {
    const { player, ctx } = setup({ resumeMode: "deferred" });
    player.play("chime");
    player.setSound(false);
    player.setSound(true);
    await flush();
    expect(ctx().sources()).toEqual([]);
  });
});

describe("one Cue at a time and release (D20, R4.7, R4.10, R4.11)", () => {
  it("a second Cue fades the first to 0 in 30 ms and stops it at 35 ms", () => {
    const { player, ctx } = setup();
    player.play("chime");
    ctx().advance(100);
    player.play("strike");
    const [chimeGain] = ctx().cueGains();
    const t = ctx().currentTime;
    expect(chimeGain?.gain.valueAt(t + 0.03)).toBe(0);
    expect(chimeGain?.gain.valueAt(t + 0.015)).toBeCloseTo(0.5, 9);
    const chimeSources = ctx().sources().filter((s) => s instanceof FakeOscillator && s.frequency.calls[0]?.value !== 160);
    expect(chimeSources.every((s) => Math.abs((s.stopTime() ?? 0) - (t + 0.035)) < 1e-9)).toBe(true);
    ctx().advance(30);
    expect(ctx().sounding().map((s) => s.cue)).toEqual(["strike"]);
  });

  it("setSound(false) fades the sounding Cue within 50 ms and keeps the context", () => {
    const { f, player, ctx } = setup();
    player.play("chime");
    ctx().advance(200);
    player.setSound(false);
    ctx().advance(30);
    expect(ctx().sounding()).toEqual([]);
    expect(f.calls()).toBe(1);
    player.setSound(true);
    player.play("strike");
    expect(ctx().sounding().map((s) => s.cue)).toEqual(["strike"]);
  });

  it("every node of a Cue is disconnected once its sources end, each exactly once", () => {
    const { player, ctx } = setup();
    player.play("chime");
    ctx().advance(500);
    player.play("breath");
    ctx().advance(100);
    player.play("strike");
    expect(ctx().connectedCueNodes().length).toBeGreaterThan(0);
    ctx().advance(3000);
    expect(ctx().connectedCueNodes()).toEqual([]);
    const master = ctx().master();
    expect(ctx().nodes.filter((n) => n !== master).every((n) => n.disconnectCalls === 1)).toBe(true);
    expect(master?.outputs).toEqual([ctx().destination]);
  });
});

describe("failures are silent and final (R4.12, D26)", () => {
  it("a factory that returns null fails the player; nothing is retried", () => {
    let calls = 0;
    const player = createAudioPlayer({ factory: () => (calls++, null), sound: true });
    expect(player.unlock()).toBe(false);
    expect(player.unlock()).toBe(false);
    player.setSound(true);
    expect(() => player.play("strike")).not.toThrow();
    expect(calls).toBe(1);
    expect(player.isUnlocked()).toBe(false);
  });

  it("a factory that throws fails the player silently", () => {
    let calls = 0;
    const player = createAudioPlayer({
      factory: () => {
        calls++;
        throw new Error("blocked");
      },
      sound: true,
    });
    expect(player.unlock()).toBe(false);
    player.setSound(false);
    player.setSound(true);
    expect(() => player.play("chime")).not.toThrow();
    expect(calls).toBe(1);
  });

  it("a resume() that throws in unlock fails the player", () => {
    const { player } = setup({ throwOn: "resume" });
    expect(player.isUnlocked()).toBe(false);
    expect(() => player.play("strike")).not.toThrow();
  });

  it("a closed context fails the player at play without calling resume() again", () => {
    const { player, ctx } = setup({ state: "closed" });
    expect(ctx().resumeCalls).toBe(1);
    expect(() => player.play("chime")).not.toThrow();
    expect(ctx().resumeCalls).toBe(1);
    expect(player.isUnlocked()).toBe(false);
    expect(ctx().sources()).toEqual([]);
  });

  it("a node call that throws midway fails the player and releases what was built", () => {
    const { player, ctx } = setup();
    ctx().throwOn = "createBiquadFilter";
    expect(() => player.play("breath")).not.toThrow();
    expect(player.isUnlocked()).toBe(false);
    expect(ctx().connectedCueNodes()).toEqual([]);
    ctx().throwOn = null;
    player.play("strike");
    expect(ctx().sources().filter((s) => s.startTime !== null)).toEqual([]);
  });

  it("a start() that throws fails the player and silences the built Cue", () => {
    const { player, ctx } = setup();
    ctx().throwOn = "start";
    expect(() => player.play("chime")).not.toThrow();
    expect(player.isUnlocked()).toBe(false);
    expect(ctx().sounding()).toEqual([]);
    expect(ctx().connectedCueNodes()).toEqual([]);
  });

  it("a non-finite currentTime is treated as a throw", () => {
    const { player, ctx } = setup({ currentTime: Number.NaN });
    expect(() => player.play("strike")).not.toThrow();
    expect(player.isUnlocked()).toBe(false);
    expect(ctx().nodes.filter((n) => n instanceof FakeOscillator || n instanceof FakeBufferSource)).toEqual([]);
  });

  it("a throw while starting a held request fails the player silently", async () => {
    const { player, ctx } = setup({ resumeMode: "deferred" });
    player.play("chime");
    ctx().throwOn = "createGain";
    await flush();
    expect(player.isUnlocked()).toBe(false);
  });

  it("browserAudioFactory gives null where there is no window (Node)", () => {
    expect(browserAudioFactory()()).toBeNull();
  });
});

describe("the nodes follow CUE_SPECS (design 3.3, D20)", () => {
  for (const cue of ["strike", "chime", "breath"] as const) {
    it(`${cue}: envelope, frequency, filter, start and stop calls`, () => {
      const T0 = 7.25;
      const { player, ctx } = setup({ currentTime: T0, sampleRate: 44100 });
      player.play(cue);
      const c = ctx();
      const [cueGain] = c.cueGains();
      if (cueGain === undefined) throw new Error("no cue gain");
      expect(c.cueOf(cueGain)).toBe(cue);
      expect(cueGain.gain.value).toBe(1);
      const voiceGains = c.nodes.filter((n): n is FakeGain => n instanceof FakeGain && n.everConnected.includes(cueGain));
      const spec = CUE_SPECS[cue];
      expect(voiceGains).toHaveLength(spec.voices.length);
      const at = (ms: number): number => T0 + ms / 1000;
      spec.voices.forEach((voice, i) => {
        const vg = voiceGains[i];
        if (vg === undefined) throw new Error("no voice gain");
        expect(vg.gain.calls).toEqual(
          voice.gain.map(([time, gain], k) => ({ method: k === 0 ? "setValueAtTime" : "linearRampToValueAtTime", value: gain, time: at(time) })),
        );
        const end = voice.gain[voice.gain.length - 1]?.[0] ?? 0;
        const up = c.upstream(vg);
        if (voice.kind === "osc") {
          const osc = up.find((n): n is FakeOscillator => n instanceof FakeOscillator);
          expect(osc?.type).toBe(voice.waveform);
          const glide = voice.endHz !== voice.startHz ? [{ method: "exponentialRampToValueAtTime", value: voice.endHz, time: at(end) }] : [];
          expect(osc?.frequency.calls).toEqual([{ method: "setValueAtTime", value: voice.startHz, time: at(voice.startMs) }, ...glide]);
          expect(osc?.startTime).toBe(at(voice.startMs));
          expect(osc?.stopCalls).toEqual([at(end) + 0.01]);
          expect(osc?.everConnected).toEqual([vg]);
        } else {
          const filter = up.find((n): n is FakeBiquad => n instanceof FakeBiquad);
          const src = up.find((n): n is FakeBufferSource => n instanceof FakeBufferSource);
          expect(filter?.type).toBe(voice.filter.kind);
          expect(filter?.Q.value).toBe(voice.filter.q);
          expect(filter?.frequency.calls).toEqual([
            { method: "setValueAtTime", value: voice.filter.startHz, time: at(voice.startMs) },
            { method: "exponentialRampToValueAtTime", value: voice.filter.endHz, time: at(end) },
          ]);
          expect(src?.everConnected).toEqual([filter]);
          expect(filter?.everConnected).toEqual([vg]);
          expect(src?.buffer?.getChannelData(0).length).toBe(Math.ceil((44100 * (end - voice.startMs + 10)) / 1000));
          expect(src?.startTime).toBe(at(voice.startMs));
          expect(src?.stopCalls).toEqual([at(end) + 0.01]);
        }
      });
    });
  }

  it("noise buffers hold the seeded samples", () => {
    const { player, ctx } = setup();
    player.play("strike");
    const a = ctx().sources().find((s): s is FakeBufferSource => s instanceof FakeBufferSource)?.buffer?.getChannelData(0);
    const second = setup();
    second.player.play("strike");
    const b = second.ctx().sources().find((s): s is FakeBufferSource => s instanceof FakeBufferSource)?.buffer?.getChannelData(0);
    expect(a).toBeDefined();
    expect(a).toEqual(b);
    expect(a?.some((x) => x !== 0)).toBe(true);
  });
});
