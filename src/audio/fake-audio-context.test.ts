// Self-test of the Fake_AudioContext (sound-and-title task 6.1): the options behave as named, onended fires after advance,
// sounding() follows a fade.
import { describe, expect, it } from "vitest";
import { countingFactory, FakeAudioContext } from "./fake-audio-context";

/** A minimal Cue by hand: master -> cue gain -> voice gain -> oscillator, started at 0 and stopped at `stopS`. */
function oneVoice(ctx: FakeAudioContext, stopS: number) {
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const cueGain = ctx.createGain();
  cueGain.connect(master);
  const voiceGain = ctx.createGain();
  voiceGain.connect(cueGain);
  const osc = ctx.createOscillator();
  osc.connect(voiceGain);
  osc.start(0);
  osc.stop(stopS);
  return { master, cueGain, voiceGain, osc };
}

describe("resume modes", () => {
  it("instant flips the state inside the call", () => {
    const ctx = new FakeAudioContext({ resumeMode: "instant" });
    void ctx.resume();
    expect(ctx.state).toBe("running");
    expect(ctx.resumeCalls).toBe(1);
  });

  it("deferred flips it in a microtask, before the promise settles", async () => {
    const ctx = new FakeAudioContext({ resumeMode: "deferred" });
    const p = ctx.resume();
    expect(ctx.state).toBe("suspended");
    await p;
    expect(ctx.state).toBe("running");
  });

  it("never leaves it suspended; throw rejects; void returns nothing", async () => {
    const never = new FakeAudioContext({ resumeMode: "never" });
    await never.resume();
    expect(never.state).toBe("suspended");
    const rejecting = new FakeAudioContext({ resumeMode: "throw" });
    await expect(rejecting.resume()).rejects.toThrow();
    expect(rejecting.state).toBe("suspended");
    expect(new FakeAudioContext({ resumeMode: "void" }).resume()).toBeUndefined();
  });

  it("a closed context rejects resume and stays closed", async () => {
    const ctx = new FakeAudioContext({ state: "closed" });
    await expect(ctx.resume()).rejects.toThrow();
    expect(ctx.state).toBe("closed");
  });
});

describe("throwOn", () => {
  it("throws from the named method only", () => {
    const ctx = new FakeAudioContext({ throwOn: "createOscillator" });
    expect(() => ctx.createOscillator()).toThrow();
    expect(() => ctx.createGain()).not.toThrow();
    ctx.throwOn = "resume";
    expect(() => ctx.resume()).toThrow();
    ctx.throwOn = "setValueAtTime";
    expect(() => ctx.createGain().gain.setValueAtTime(0, 0)).toThrow();
  });
});

describe("recording", () => {
  it("records nodes, connections, parameter calls, start and stop", () => {
    const ctx = new FakeAudioContext();
    const { cueGain, voiceGain, osc } = oneVoice(ctx, 1);
    voiceGain.gain.setValueAtTime(0, 0);
    voiceGain.gain.linearRampToValueAtTime(1, 0.5);
    expect(ctx.nodes.map((n) => n.kind)).toEqual(["gain", "gain", "gain", "oscillator"]);
    expect(voiceGain.everConnected).toEqual([cueGain]);
    expect(voiceGain.gain.calls.map((c) => c.method)).toEqual(["setValueAtTime", "linearRampToValueAtTime"]);
    expect(osc.startTime).toBe(0);
    expect(osc.stopCalls).toEqual([1]);
    expect(ctx.master()).toBe(ctx.nodes[0]);
    expect(ctx.cueGains()).toEqual([cueGain]);
  });

  it("the factory helper counts its calls", () => {
    const f = countingFactory({ resumeMode: "never" });
    expect(f.calls()).toBe(0);
    expect(f.context()).toBeNull();
    const ctx = f.factory();
    expect(f.calls()).toBe(1);
    expect(f.context()).toBe(ctx);
  });
});

describe("the clock", () => {
  it("advance fires onended once the stop time has passed, and only once", () => {
    const ctx = new FakeAudioContext();
    const { osc } = oneVoice(ctx, 0.5);
    let ended = 0;
    osc.onended = () => {
      ended++;
    };
    ctx.advance(499);
    expect(ended).toBe(0);
    ctx.advance(1);
    expect(ended).toBe(1);
    ctx.advance(1000);
    expect(ended).toBe(1);
    expect(ctx.currentTime).toBeCloseTo(1.5, 9);
  });

  it("the last stop call applies", () => {
    const ctx = new FakeAudioContext();
    const { osc } = oneVoice(ctx, 2);
    osc.stop(0.1);
    ctx.advance(100);
    expect(osc.ended).toBe(true);
  });

  it("parameter values follow sets and linear ramps", () => {
    const ctx = new FakeAudioContext();
    const g = ctx.createGain();
    expect(g.gain.value).toBe(1);
    g.gain.value = 0;
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(1, 1);
    g.gain.linearRampToValueAtTime(0, 2);
    expect(g.gain.valueAt(0.5)).toBeCloseTo(0.5, 9);
    expect(g.gain.valueAt(1)).toBe(1);
    expect(g.gain.valueAt(1.5)).toBeCloseTo(0.5, 9);
    expect(g.gain.valueAt(3)).toBe(0);
    g.gain.cancelScheduledValues(1);
    expect(g.gain.valueAt(3)).toBe(0);
  });
});

describe("sounding()", () => {
  it("follows a fade of the per-Cue gain and the end of the sources", () => {
    const ctx = new FakeAudioContext();
    const { cueGain } = oneVoice(ctx, 2);
    expect(ctx.sounding()).toHaveLength(1);
    cueGain.gain.setValueAtTime(1, 0);
    cueGain.gain.linearRampToValueAtTime(0, 0.03);
    ctx.advance(10);
    expect(ctx.sounding()).toHaveLength(1);
    ctx.advance(20);
    expect(ctx.sounding()).toEqual([]);
  });

  it("a disconnected Cue or an ended source is silent", () => {
    const ctx = new FakeAudioContext();
    const a = oneVoice(ctx, 2);
    a.cueGain.disconnect();
    expect(ctx.sounding()).toEqual([]);
    const ctx2 = new FakeAudioContext();
    oneVoice(ctx2, 0.2);
    ctx2.advance(200);
    expect(ctx2.sounding()).toEqual([]);
  });
});
