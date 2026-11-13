// Fake_AudioContext (sound-and-title design 8.3). Test-only: never imported by a shipped file. It implements AudioContextLike,
// records every node and every call, runs a test clock with advance(ms), fires `onended` once a source's stop time has passed,
// and tells which Cues are sounding.
import type {
  AudioBufferLike,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  BiquadFilterNodeLike,
  BufferSourceNodeLike,
  EndedHandler,
  GainNodeLike,
  OscillatorNodeLike,
} from "./audio-player";
import type { Cue } from "./types";

/** How resume() behaves (design 8.3). `void` returns nothing and leaves the context suspended (rule 5 of play). */
export type ResumeMode = "instant" | "deferred" | "never" | "throw" | "void";

/** A method of the context or of a node that the fake can be told to throw from. */
export type ThrowOn =
  | "resume"
  | "createGain"
  | "createOscillator"
  | "createBuffer"
  | "createBufferSource"
  | "createBiquadFilter"
  | "connect"
  | "start"
  | "stop"
  | "setValueAtTime"
  | "linearRampToValueAtTime"
  | "exponentialRampToValueAtTime"
  | "cancelScheduledValues";

export interface FakeOptions {
  readonly resumeMode?: ResumeMode;
  readonly throwOn?: ThrowOn | null;
  /** The state at construction; "suspended" by default, as a browser starts one before a gesture. */
  readonly state?: "suspended" | "running" | "closed";
  readonly sampleRate?: number;
  /** The clock at construction, seconds. A non-finite value models a broken clock. */
  readonly currentTime?: number;
}

export type ParamMethod = "setValueAtTime" | "linearRampToValueAtTime" | "exponentialRampToValueAtTime" | "cancelScheduledValues";
export interface ParamCall {
  readonly method: ParamMethod;
  readonly value: number;
  readonly time: number;
}

/** One automation event of a parameter, as Web Audio keeps them. */
interface Automation {
  readonly kind: "set" | "linear" | "exp";
  readonly value: number;
  readonly time: number;
}

export class FakeParam implements AudioParamLike {
  readonly calls: ParamCall[] = [];
  private intrinsic: number;
  private events: Automation[] = [];

  constructor(
    private readonly ctx: FakeAudioContext,
    initial: number,
  ) {
    this.intrinsic = initial;
  }

  /** Reads like the browser: the value at the current time once automation exists. */
  get value(): number {
    return this.valueAt(this.ctx.currentTime);
  }
  set value(v: number) {
    this.intrinsic = v;
  }

  setValueAtTime(value: number, time: number): this {
    return this.add("setValueAtTime", { kind: "set", value, time });
  }
  linearRampToValueAtTime(value: number, time: number): this {
    return this.add("linearRampToValueAtTime", { kind: "linear", value, time });
  }
  exponentialRampToValueAtTime(value: number, time: number): this {
    return this.add("exponentialRampToValueAtTime", { kind: "exp", value, time });
  }
  cancelScheduledValues(time: number): this {
    this.ctx.maybeThrow("cancelScheduledValues");
    this.calls.push({ method: "cancelScheduledValues", value: Number.NaN, time });
    this.events = this.events.filter((e) => e.time < time);
    return this;
  }

  /** The value at `t` seconds: the intrinsic value before any event, held after a set, interpolated along a ramp. */
  valueAt(t: number): number {
    let value = this.intrinsic;
    let since = Number.NEGATIVE_INFINITY;
    for (const e of this.events) {
      if (e.time <= t) {
        value = e.value;
        since = e.time;
        continue;
      }
      if (e.kind === "set") return value;
      const span = e.time - since;
      const f = Number.isFinite(span) && span > 0 ? (t - since) / span : 0;
      if (e.kind === "linear") return value + (e.value - value) * f;
      return value > 0 && e.value > 0 ? value * Math.pow(e.value / value, f) : value;
    }
    return value;
  }

  private add(method: ParamMethod, event: Automation): this {
    this.ctx.maybeThrow(method);
    this.calls.push({ method, value: event.value, time: event.time });
    // Web Audio keeps events sorted by time; an equal time goes after the earlier one.
    const at = this.events.findIndex((e) => e.time > event.time);
    if (at === -1) this.events.push(event);
    else this.events.splice(at, 0, event);
    return this;
  }
}

export type NodeKind = "destination" | "gain" | "oscillator" | "buffer-source" | "biquad";

export class FakeNode implements AudioNodeLike {
  /** Where this node sends its output now. */
  outputs: FakeNode[] = [];
  /** Every node it was ever connected to, in order (kept after disconnect, for the structure). */
  readonly everConnected: FakeNode[] = [];
  connectCalls = 0;
  disconnectCalls = 0;

  constructor(
    readonly ctx: FakeAudioContext,
    readonly kind: NodeKind,
    readonly id: number,
  ) {}

  connect(destination: AudioNodeLike): AudioNodeLike {
    this.ctx.maybeThrow("connect");
    if (!(destination instanceof FakeNode) || destination.ctx !== this.ctx) throw new TypeError("not a node of this context");
    this.connectCalls++;
    this.outputs.push(destination);
    this.everConnected.push(destination);
    return destination;
  }

  disconnect(): void {
    this.disconnectCalls++;
    this.outputs = [];
  }
}

export class FakeGain extends FakeNode implements GainNodeLike {
  readonly gain: FakeParam;
  constructor(ctx: FakeAudioContext, id: number) {
    super(ctx, "gain", id);
    this.gain = new FakeParam(ctx, 1);
  }
}

/** What the fake records about a source: its start and stop calls, whether it ended, and the context state at start. */
abstract class FakeSource extends FakeNode {
  startTime: number | null = null;
  readonly stopCalls: number[] = [];
  /** The context state when start() ran (P10: a Cue sounds only on a running context). */
  stateAtStart: string | null = null;
  ended = false;
  onended: EndedHandler = null;

  start(when = 0): void {
    this.ctx.maybeThrow("start");
    if (this.startTime !== null) throw new Error("start called twice");
    this.startTime = when;
    this.stateAtStart = this.ctx.state;
  }
  stop(when = 0): void {
    this.ctx.maybeThrow("stop");
    if (this.startTime === null) throw new Error("stop before start");
    this.stopCalls.push(when);
  }
  /** The stop that applies: the last one called (Web Audio keeps the latest). */
  stopTime(): number | null {
    return this.stopCalls.length === 0 ? null : (this.stopCalls[this.stopCalls.length - 1] ?? null);
  }
  /** Playing at `t`: started at or before `t`, not ended, and `t` before its stop time. */
  playingAt(t: number): boolean {
    const stop = this.stopTime();
    return this.startTime !== null && !this.ended && this.startTime <= t && (stop === null || t < stop);
  }
}

export class FakeOscillator extends FakeSource implements OscillatorNodeLike {
  type = "sine";
  readonly frequency: FakeParam;
  constructor(ctx: FakeAudioContext, id: number) {
    super(ctx, "oscillator", id);
    this.frequency = new FakeParam(ctx, 440);
  }
}

export class FakeBuffer implements AudioBufferLike {
  private readonly data: Float32Array[];
  constructor(
    readonly channels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = Array.from({ length: channels }, () => new Float32Array(length));
  }
  getChannelData(channel: number): Float32Array {
    const d = this.data[channel];
    if (d === undefined) throw new RangeError("channel");
    return d;
  }
}

export class FakeBufferSource extends FakeSource implements BufferSourceNodeLike {
  buffer: AudioBufferLike | null = null;
  constructor(ctx: FakeAudioContext, id: number) {
    super(ctx, "buffer-source", id);
  }
}

export class FakeBiquad extends FakeNode implements BiquadFilterNodeLike {
  type = "lowpass";
  readonly frequency: FakeParam;
  readonly Q: FakeParam;
  constructor(ctx: FakeAudioContext, id: number) {
    super(ctx, "biquad", id);
    this.frequency = new FakeParam(ctx, 350);
    this.Q = new FakeParam(ctx, 1);
  }
}

/** One Cue the player built: its per-Cue gain node and the Cue it carries, told apart by its sources. */
export interface SoundingCue {
  readonly cue: Cue | null;
  readonly gain: FakeGain;
}

export class FakeAudioContext implements AudioContextLike {
  state: "suspended" | "running" | "closed";
  currentTime: number;
  readonly sampleRate: number;
  readonly destination: FakeNode;
  readonly nodes: FakeNode[] = [];
  resumeCalls = 0;
  /** The method that throws, or null. Writable so a test can make a later call fail. */
  throwOn: ThrowOn | null;
  private readonly resumeMode: ResumeMode;
  private nextId = 1;

  constructor(options: FakeOptions = {}) {
    this.state = options.state ?? "suspended";
    this.currentTime = options.currentTime ?? 0;
    this.sampleRate = options.sampleRate ?? 48000;
    this.resumeMode = options.resumeMode ?? "instant";
    this.throwOn = options.throwOn ?? null;
    this.destination = new FakeNode(this, "destination", 0);
  }

  /** Throws when `method` is the one named in `throwOn`. */
  maybeThrow(method: ThrowOn): void {
    if (this.throwOn === method) throw new Error(`fake ${method} throws`);
  }

  resume(): Promise<void> | void {
    this.resumeCalls++;
    this.maybeThrow("resume");
    if (this.state === "closed") return Promise.reject(new Error("closed"));
    switch (this.resumeMode) {
      case "instant":
        this.state = "running";
        return Promise.resolve();
      case "deferred":
        return Promise.resolve().then(() => {
          if (this.state === "suspended") this.state = "running";
        });
      case "never":
        return Promise.resolve();
      case "throw":
        return Promise.reject(new Error("resume rejected"));
      case "void":
        return undefined;
    }
  }

  createGain(): FakeGain {
    this.maybeThrow("createGain");
    return this.track(new FakeGain(this, this.nextId++));
  }
  createOscillator(): FakeOscillator {
    this.maybeThrow("createOscillator");
    return this.track(new FakeOscillator(this, this.nextId++));
  }
  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
    this.maybeThrow("createBuffer");
    if (!(Number.isInteger(length) && length > 0)) throw new RangeError("buffer length");
    return new FakeBuffer(channels, length, sampleRate);
  }
  createBufferSource(): FakeBufferSource {
    this.maybeThrow("createBufferSource");
    return this.track(new FakeBufferSource(this, this.nextId++));
  }
  createBiquadFilter(): FakeBiquad {
    this.maybeThrow("createBiquadFilter");
    return this.track(new FakeBiquad(this, this.nextId++));
  }

  /** Moves the clock by `ms` and fires `onended` of every source whose stop time has passed, in stop-time order. */
  advance(ms: number): void {
    const target = this.currentTime + ms / 1000;
    for (;;) {
      const due = this.sources()
        .filter((s) => !s.ended && s.startTime !== null && (s.stopTime() ?? Number.POSITIVE_INFINITY) <= target)
        .sort((a, b) => (a.stopTime() ?? 0) - (b.stopTime() ?? 0))[0];
      if (due === undefined) break;
      this.currentTime = Math.max(this.currentTime, due.stopTime() ?? this.currentTime);
      due.ended = true;
      const handler = due.onended as ((event: unknown) => unknown) | null;
      if (handler !== null) handler.call(due, { type: "ended" });
    }
    this.currentTime = target;
  }

  sources(): (FakeOscillator | FakeBufferSource)[] {
    return this.nodes.filter((n): n is FakeOscillator | FakeBufferSource => n instanceof FakeOscillator || n instanceof FakeBufferSource);
  }

  /** The master gain: the first gain node connected to the destination. */
  master(): FakeGain | null {
    return this.nodes.find((n): n is FakeGain => n instanceof FakeGain && n.everConnected.includes(this.destination)) ?? null;
  }

  /** The per-Cue gain nodes: gains connected to the master. */
  cueGains(): FakeGain[] {
    const m = this.master();
    if (m === null) return [];
    return this.nodes.filter((n): n is FakeGain => n instanceof FakeGain && n.everConnected.includes(m));
  }

  /** Every node feeding `node`, at any depth, over all connections ever made. */
  upstream(node: FakeNode): FakeNode[] {
    const found = new Set<FakeNode>();
    const visit = (to: FakeNode): void => {
      for (const n of this.nodes) {
        if (!found.has(n) && n.everConnected.includes(to)) {
          found.add(n);
          visit(n);
        }
      }
    };
    visit(node);
    return [...found];
  }

  /** The Cue a per-Cue gain carries, told by its sources: strike = noise + oscillator, chime = 3 oscillators, breath = 2 noises. */
  cueOf(gain: FakeGain): Cue | null {
    const up = this.upstream(gain);
    const osc = up.filter((n) => n instanceof FakeOscillator).length;
    const noise = up.filter((n) => n instanceof FakeBufferSource).length;
    if (osc === 1 && noise === 1) return "strike";
    if (osc === 3 && noise === 0) return "chime";
    if (osc === 0 && noise === 2) return "breath";
    return null;
  }

  /**
   * The Cues sounding now: a per-Cue gain still connected to the master, with gain above 0 now, and at least one of its sources
   * playing now. The context state is not part of it (P10 checks the state at each start).
   */
  sounding(): SoundingCue[] {
    const m = this.master();
    if (m === null) return [];
    const t = this.currentTime;
    return this.cueGains()
      .filter((g) => g.outputs.includes(m) && g.gain.valueAt(t) > 0)
      .filter((g) => this.upstream(g).some((n) => n instanceof FakeSource && n.playingAt(t)))
      .map((gain) => ({ gain, cue: this.cueOf(gain) }));
  }

  /** Nodes the player made for Cues (every node but the master) that still have an output. */
  connectedCueNodes(): FakeNode[] {
    const m = this.master();
    return this.nodes.filter((n) => n !== m && n.outputs.length > 0);
  }

  private track<T extends FakeNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }
}

/** A factory that counts its calls and keeps the contexts it made (design 8.3: the construction count). */
export function countingFactory(options: FakeOptions = {}): {
  readonly factory: () => FakeAudioContext;
  readonly calls: () => number;
  readonly context: () => FakeAudioContext | null;
} {
  const made: FakeAudioContext[] = [];
  return {
    factory: () => {
      const ctx = new FakeAudioContext(options);
      made.push(ctx);
      return ctx;
    },
    calls: () => made.length,
    context: () => made[made.length - 1] ?? null,
  };
}
