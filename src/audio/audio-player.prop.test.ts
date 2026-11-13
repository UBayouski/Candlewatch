// Property tests of the Audio_Player (sound-and-title tasks 6.3 and 6.4, design 3.3, D19, D20; R4).
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createAudioPlayer } from "./audio-player";
import { FakeAudioContext, FakeBufferSource, FakeOscillator } from "./fake-audio-context";
import type { FakeGain, ResumeMode } from "./fake-audio-context";
import { arbCue, arbGestureScript, arbAdvanceMs, PROP_PARAMS } from "./test-kit";
import type { GestureStep } from "./test-kit";
import type { Cue } from "./types";

/** Lets the fake's promise chains run: a deferred resume() settles in two microtask turns, the player's callback in a third. */
async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

const arbResumeMode = fc.constantFrom<ResumeMode>("instant", "deferred", "never", "throw", "void");
const arbStartState = fc.constantFrom<"suspended" | "running">("suspended", "suspended", "running");

/** The per-Cue gains of `ctx` with a started source, that `seen` does not hold yet; adds them to it. */
function newCues(ctx: FakeAudioContext | null, seen: Set<FakeGain>): FakeGain[] {
  if (ctx === null) return [];
  const fresh = ctx
    .cueGains()
    .filter((g) => !seen.has(g) && ctx.upstream(g).some((n) => (n instanceof FakeOscillator || n instanceof FakeBufferSource) && n.startTime !== null));
  for (const g of fresh) seen.add(g);
  return fresh;
}

describe("Feature: sound-and-title, Property 10: The player never makes a sound by surprise", () => {
  it("the factory runs at most once and only after an allowed gesture; a Cue sounds only when unlocked, with sound on, on a running context", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), arbResumeMode, arbStartState, arbGestureScript, async (initialSound, resumeMode, state, script) => {
        let at = -1; // -1 is the creation of the player
        const callSteps: number[] = [];
        const made: FakeAudioContext[] = [];
        const factory = (): FakeAudioContext => {
          callSteps.push(at);
          const ctx = new FakeAudioContext({ resumeMode, state });
          made.push(ctx);
          return ctx;
        };
        const player = createAudioPlayer({ factory, sound: initialSound });
        const ctx = (): FakeAudioContext | null => made[0] ?? null;
        const seen = new Set<FakeGain>();

        let sound = initialSound;
        let armed = true;
        /** The step of the first gesture the sound setting allowed (a gesture with sound on, or turning sound on). */
        let firstAllowed: number | null = null;
        /** The one request that may still start after its resume() settles (D19), or null. */
        let pending: Cue | null = null;

        for (const [i, s] of script.entries()) {
          at = i;
          let started: FakeGain[];
          switch (s.kind) {
            case "gesture":
              // The first-gesture listener (design 3.4): returns while sound is off, else unlocks once and disarms.
              if (armed && sound) {
                firstAllowed ??= i;
                player.unlock();
                armed = false;
              }
              started = newCues(ctx(), seen);
              expect(started).toEqual([]);
              break;
            case "request": {
              const eligible = player.isUnlocked() && sound;
              player.play(s.cue);
              started = newCues(ctx(), seen);
              if (!eligible) {
                expect(started).toEqual([]);
              } else {
                expect(started.length).toBeLessThanOrEqual(1);
                for (const g of started) expect(ctx()?.cueOf(g)).toBe(s.cue);
                pending = started.length === 0 ? s.cue : null;
              }
              break;
            }
            case "setSound":
              if (s.on) firstAllowed ??= i;
              sound = s.on;
              player.setSound(s.on);
              if (!s.on) pending = null;
              expect(newCues(ctx(), seen)).toEqual([]);
              break;
            case "advance":
              ctx()?.advance(s.ms);
              expect(newCues(ctx(), seen)).toEqual([]);
              break;
            case "settle": {
              await flush();
              started = newCues(ctx(), seen);
              expect(started.length).toBeLessThanOrEqual(1);
              for (const g of started) {
                expect(pending).not.toBeNull();
                expect(ctx()?.cueOf(g)).toBe(pending);
                expect(sound).toBe(true);
                expect(player.isUnlocked()).toBe(true);
              }
              pending = null;
              break;
            }
          }
          expect(callSteps.length).toBeLessThanOrEqual(1);
          const first = callSteps[0];
          if (first !== undefined) {
            expect(firstAllowed).not.toBeNull();
            expect(first).toBeGreaterThanOrEqual(firstAllowed ?? Number.POSITIVE_INFINITY);
          }
          const c = ctx();
          if (c !== null) for (const src of c.sources()) if (src.startTime !== null) expect(src.stateAtStart).toBe("running");
        }
        if (firstAllowed === null) expect(callSteps).toEqual([]);
      }),
      PROP_PARAMS,
    );
  });
});

/**
 * P15 scripts: no gestures (the player is unlocked at the start); requests, advances, sound changes, settles, and `suspend`, which
 * puts the context back to "suspended" (the browser or the system suspends it) so that later requests wait on a deferred resume().
 * A sound toggle (off, then on) is also generated as one chunk, so a held request often meets it before its resume() settles.
 */
type ToneStep = Exclude<GestureStep, { kind: "gesture" }> | { readonly kind: "suspend" };
const arbToneStep: fc.Arbitrary<ToneStep> = fc.oneof(
  { weight: 4, arbitrary: arbCue.map((cue): ToneStep => ({ kind: "request", cue })) },
  { weight: 4, arbitrary: arbAdvanceMs.map((ms): ToneStep => ({ kind: "advance", ms })) },
  { weight: 2, arbitrary: fc.boolean().map((on): ToneStep => ({ kind: "setSound", on })) },
  { weight: 2, arbitrary: fc.constant<ToneStep>({ kind: "settle" }) },
  { weight: 1, arbitrary: fc.constant<ToneStep>({ kind: "suspend" }) },
);
const arbToneScript: fc.Arbitrary<ToneStep[]> = fc
  .array(
    fc.oneof(
      { weight: 5, arbitrary: arbToneStep.map((s) => [s]) },
      { weight: 1, arbitrary: fc.constant<ToneStep[]>([{ kind: "setSound", on: false }, { kind: "setSound", on: true }]) },
    ),
    { maxLength: 24 },
  )
  .map((chunks) => chunks.flat());

/** One Cue the player started: its gain, the step of the request it came from, and the time by which it must be silent. */
interface Track {
  readonly gain: FakeGain;
  readonly requestStep: number;
  deadline: number;
}

const BOUND_S = 0.05;
const SAMPLE_MS = 10;

describe("Feature: sound-and-title, Property 15: At most one Cue sounds at a time", () => {
  it("50 ms after a request at most one Cue sounds; replaced and silenced Cues are silent within 50 ms; ended Cues are disconnected", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<ResumeMode>("instant", "deferred", "deferred", "never"),
        arbStartState,
        arbToneScript,
        async (resumeMode, state, script) => {
          const ctx = new FakeAudioContext({ resumeMode, state });
          const player = createAudioPlayer({ factory: () => ctx, sound: true });
          player.unlock();
          const seen = new Set<FakeGain>();
          const tracks: Track[] = [];
          let lastRequestTime = Number.NEGATIVE_INFINITY;
          let lastRequestStep = -1;
          const offs: { step: number; time: number }[] = [];

          const adopt = (requestStep: number): void => {
            const fresh = newCues(ctx, seen);
            if (fresh.length === 0) return;
            const now = ctx.currentTime;
            // A held request (D19) takes effect when its resume() settles: the 50 ms are counted from that start.
            lastRequestTime = Math.max(lastRequestTime, now);
            for (const t of tracks) t.deadline = Math.min(t.deadline, now + BOUND_S);
            for (const gain of fresh) tracks.push({ gain, requestStep, deadline: Number.POSITIVE_INFINITY });
          };

          const check = (): void => {
            const t = ctx.currentTime;
            const sounding = new Set(ctx.sounding().map((s) => s.gain));
            if (t - lastRequestTime >= BOUND_S) expect(sounding.size).toBeLessThanOrEqual(1);
            for (const track of tracks) {
              if (!sounding.has(track.gain)) continue;
              expect(t).toBeLessThan(track.deadline);
              // A Cue requested before sound went off stays silent from 50 ms after that (its held request was cleared).
              for (const off of offs) if (off.step > track.requestStep) expect(t).toBeLessThan(off.time + BOUND_S);
            }
            const started = ctx.sources().filter((s) => s.startTime !== null);
            if (started.every((s) => s.ended)) expect(ctx.connectedCueNodes()).toEqual([]);
          };

          for (const [i, s] of script.entries()) {
            switch (s.kind) {
              case "request":
                lastRequestTime = ctx.currentTime;
                lastRequestStep = i;
                player.play(s.cue);
                adopt(i);
                break;
              case "advance":
                for (let left = s.ms; left > 0; left -= SAMPLE_MS) {
                  ctx.advance(Math.min(SAMPLE_MS, left));
                  check();
                }
                break;
              case "setSound":
                player.setSound(s.on);
                if (!s.on) {
                  const now = ctx.currentTime;
                  offs.push({ step: i, time: now });
                  for (const t of tracks) t.deadline = Math.min(t.deadline, now + BOUND_S);
                }
                adopt(lastRequestStep);
                break;
              case "settle":
                await flush();
                adopt(lastRequestStep);
                break;
              case "suspend":
                if (ctx.state === "running") ctx.state = "suspended";
                break;
            }
            check();
          }
          ctx.advance(5000);
          check();
          expect(ctx.sounding()).toEqual([]);
          expect(ctx.connectedCueNodes()).toEqual([]);
        },
      ),
      PROP_PARAMS,
    );
  });
});
