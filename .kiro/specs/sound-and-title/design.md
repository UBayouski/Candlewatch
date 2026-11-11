# Design Document

## Overview

This design covers the three Web Audio cues (strike, chime, breath), the page-title countdown, the background-tab tick that keeps both honest, and the final wording of the strings file for Candlewatch. It reads the engine's state and selectors, the `sound` setting and `formatTime`. It stores nothing new, sends no engine event except `tick` from the Hidden_Tick, and changes neither the engine, the scene model, the stored documents nor `render.yaml`.

The text refers to its parts by number ("section 3.2", "Decision D15"). The Overview is section 1. The headings, in the order they appear:

- Architecture (section 2, parts 2.1 to 2.4): the files, the boundaries and the data flow of `dispatch` after the change.
- Components and Interfaces (section 3, parts 3.1 to 3.9): `cue.ts`, `specs.ts`, the Audio_Player and the gesture listener, `title.ts`, `wake.ts`, the Hidden_Tick source, the title adapter and `after-step.ts`, with signatures and rules.
- Data Models (unnumbered, between sections 3 and 4): the in-memory shapes (Cue, Cue_Spec, Cue_Context, the closures' state); nothing is stored.
- Section 4: Strings (parts 4.1 to 4.4): the Strings_Table and the page-title templates (D7, D12, D13, D22 to D25).
- Section 5: Accessibility (parts 5.1 to 5.6): where each cue's state change is also drawn and announced.
- Section 6: Change requests (parts 6.1 and 6.2): CR1 to CR9 of the requirements with the exact edits, and CR10 to CR18 added here.
- Error Handling (section 7, unnumbered parts): every failure path, and Decisions D26 to D29.
- Testing Strategy (section 8, parts 8.1 to 8.7).
- Correctness Properties (section 9): P1 to P11 of the requirements, refined, and P12 to P15 added here.
- Section 10: Decisions (D1 to D13 of the requirements, plus D14 to D33 added here), with the Risks K1 to K5.

Every section is written. Later sections read the files, names and numbers of section 2 without restating them as new choices.

Conventions:

- Numbers come from `requirements.md` and are not changed here: Late_Cue_Limit = 120000 ms; the Wake_Delay is in (0, 1000] ms; the minimum Wake_Delay is 1 ms; Cue duration bounds are 700 ms (strike), 2500 ms (chime) and 1200 ms (breath); the peak level is at most 0.2; the hidden-tab throttling the design accepts is about one wake per 60000 ms (D10).
- A "pure file" imports only `../engine` (the public index), `../strings`, `../ui/format` (`formatTime`, `fill`) and its pure siblings. It contains none of the names in the purity table of section 2.2.
- An "effect file" takes every global it needs (clock, timer functions, `document`, the `AudioContext` factory) as an argument. It never names a global except in its one `browser...` factory function, which `main.ts` calls.
- A "test-only file" is never imported by a shipped file; the purity tests check this.
- Time is always `now` in epoch milliseconds, passed in. Nothing in this spec counts ticks or reads a clock inside a pure file (`tech.md` rules 1 to 3).
- Cue names are the strings `"strike"`, `"chime"` and `"breath"`. Phase names are the engine's: `idle`, `lit`, `paused`, `burned-out`, `snuffed`.

## Architecture

### 2.1 Files

Two folders carry the new code. `src/audio/` already exists (empty, with a `.gitkeep`) and `structure.md` assigns it to "Web Audio cues", so the cues live there (Decision D14). The title and the background tick live in a new folder `src/page/`, because both are about the page (its title and its visibility), not about the scene or the controls. One small file next to `wiring.ts` composes them for `dispatch`.

```
src/audio/
  types.ts              Cue, CueSpec, Voice, Envelope, CueContext                                 types  (pure)
  cue.ts                cueFor(prev, next, context), LATE_CUE_LIMIT_MS                            pure   (R2)
  specs.ts              CUE_SPECS, cueSpec(cue), MASTER_GAIN, NOISE_SEEDS                         pure   (R3, D1, D2)
  noise.ts              seeded noise samples for a voice: noiseSamples(seed, count)               pure   (R3.5)
  audio-player.ts       createAudioPlayer(deps) -> { play, setSound, unlock, isUnlocked },
                        browserAudioFactory()                                                      effect (the only AudioContext user, R1.4)
  gesture.ts            armFirstGesture(target, wanted, unlock) -> disarm                          effect (document injected, R4.4, R4.16)
  fake-audio-context.ts FakeAudioContext: records nodes, params and calls                         test-only (R9.3)
  test-kit.ts           arbitraries for Cue_Context and gesture scripts; reference table           test-only
  purity.test.ts        the purity scan for types, cue, specs, noise
  cue.test.ts, cue.prop.test.ts, specs.test.ts, specs.prop.test.ts, noise.test.ts,
  audio-player.test.ts, audio-player.prop.test.ts, gesture.test.ts

src/page/
  title.ts              titleFor(state, now)                                                       pure   (R6)
  wake.ts               nextWakeMs(state, now), WAKE_MAX_MS = 1000, WAKE_MIN_MS = 1                pure   (R5.3 to R5.5)
  title-adapter.ts      createTitleAdapter(doc) -> { write(title), last() }                        effect (the only writer of document.title, R1.4)
  hidden-tick.ts        createHiddenTick(deps) -> { start, stop, isRunning, hasPending }           effect (the only timer owner, R1.5)
  fake-timer.ts         FakeTimer: schedule, cancel, advance(ms), a settable clock                 test-only
  test-kit.ts           arbitraries for states and times; a script runner with extra ticks         test-only
  purity.test.ts        the purity scan for title and wake
  title.test.ts, title.prop.test.ts, wake.test.ts, wake.prop.test.ts,
  title-adapter.test.ts, title-adapter.prop.test.ts, hidden-tick.test.ts, hidden-tick.prop.test.ts

src/after-step.ts       createAfterStep(deps) -> (prev, next, event, now) => void                  effect (composes cueFor, the player, the title and the Hidden_Tick control, CR1)
src/after-step.test.ts  the order and the one-Cue-per-event rule with recording fakes
src/after-step.prop.test.ts  P3 and P14 with recording fakes
```

- `src/strings.ts` gains the `pageTitle` group and the final wording of section 4. Nothing else in the file changes (R8.12).
- `index.html` keeps `<title>Candlewatch</title>` (R6.16).
- Nothing is added to `src/engine/`, `src/storage/`, `src/scene/`, `src/distraction/` or `src/ui/`. `main.ts` and `wiring.ts` are the only existing files edited, and `wiring.ts` is edited only if the Hidden_Tick control needs a test seam (it does not; see section 2.3).
- Pure versus effect:

| File | Kind | May name |
|---|---|---|
| `audio/types.ts`, `audio/cue.ts`, `audio/specs.ts`, `audio/noise.ts` | pure | `../engine`, `./types`, siblings |
| `page/title.ts`, `page/wake.ts` | pure | `../engine`, `../strings`, `../ui/format`, siblings |
| `audio/audio-player.ts` | effect | `AudioContext` (only in `browserAudioFactory`), the injected factory, `./types`, `./specs` |
| `audio/gesture.ts` | effect | the injected event target only |
| `page/title-adapter.ts` | effect | the injected `Document` (`title` property) |
| `page/hidden-tick.ts` | effect | injected `schedule`, `cancel`, `clock`, `dispatch`, `getState`; `./wake` |
| `after-step.ts` | effect | injected `play`, `writeTitle`, `hidden`, `sound`; `./audio/cue`, `./page/title` |
| `*/fake-*.ts`, `*/test-kit.ts`, `*.test.ts` | test-only | anything |

### 2.2 Boundaries

- Reads. `cueFor`, `titleFor` and `nextWakeMs` read state through `src/engine/index.ts` (`State`, `Event`, `timeLeftMs`, `pauseLeftMs`) and `formatTime` from `src/ui/format.ts`. None of them computes time left, wax or a pause total itself (R1.1). `cueFor` reads `next.endedAt` (a field of the engine's `burned-out` and `snuffed` states) and nothing else beyond `phase`.
- Writes. Only `title-adapter.ts` writes `document.title`. Only `audio-player.ts` touches `AudioContext`. Only `hidden-tick.ts` starts or clears the background timer (R1.4, R1.5). No file in this spec sends an event except `hidden-tick.ts`, and it sends only `{ type: "tick" }` through the `dispatch` it is given (R1.7).
- Clock. `main.ts` owns `Date.now`. It passes `clock: Date.now` to `createHiddenTick`, `createInterface` and `wireVisibility` as today. No file in `src/audio/` or `src/page/` names `Date`.
- Imports allowed:
  - `src/audio/*.ts` (shipped): `../engine`, `../strings`, own siblings. Never `../ui`, `../scene`, `../storage`, `../page`, `../distraction`.
  - `src/page/*.ts` (shipped): `../engine`, `../strings`, `../ui/format`, own siblings. Never `../audio`, `../scene`, `../storage`.
  - `src/after-step.ts`: `./audio/cue`, `./audio/types`, `./page/title`, `./engine`. It receives the player, the adapter and the Hidden_Tick as arguments (types only), so it imports no effect file.
  - `src/engine/` imports nothing from either folder (`structure.md`).
- Purity scan. `src/audio/purity.test.ts` and `src/page/purity.test.ts` copy the technique of `src/ui/purity.test.ts`: strip comments, match whole words. The pure files must not contain `window`, `document`, `localStorage`, `Date`, `performance`, `Math.random`, `matchMedia`, `setTimeout`, `setInterval`, `requestAnimationFrame` or `AudioContext` (R1.2, R1.3). The effect files are scanned for the words they must not use: `audio-player.ts` has no `Audio(`, `<audio>`, `fetch`, `XMLHttpRequest` or `.mp3`/`.wav`/`.ogg` (R4.15); `hidden-tick.ts` has no `Date`, `requestAnimationFrame` or `AudioContext` (R1.5, R5.23); `title-adapter.ts` is the only file in the repo that matches `document.title =` or `.title =`, which a scan of `src/` checks (R1.4).
- Strings. Every user-visible string is in `src/strings.ts`. The folders hold only cue names, ids and numbers, which are not shown. The strings test and a literal scan of the two folders keep it so (R1.10, R8.7).
- No `any`, no new runtime or test dependency, no sound file, no font, no network request (R1.9). The Content-Security-Policy in `render.yaml` is unchanged: Web Audio makes no request and loads no file, so `'self'` and `'none'` still hold (`tech.md`).
- The trademarked timer word appears nowhere in the folders or this document; every text that names a session says "focus session" (R1.11). The purity tests also scan for it, case-insensitive.
- Persistence. No stored document changes. The history, session and settings documents are byte-identical before and after for the same inputs (R1.8). The `sound` setting is read from `settings` in memory; nothing writes it except the existing settings store.

### 2.3 Data flow

This is what `main.ts` does today (read from the file, not assumed):

- `state` is a closure variable, first set by `step(INITIAL_STATE, { type: "reload", state: storage.load() }, Date.now())`. That call is before `dispatch` exists and is not saved.
- `dispatch(event, now)` is `next = step(state, event, now)`; if `next !== state` then `storage.save(state, next)` and `state = next`. Nothing else.
- `wireVisibility({ target, clock: Date.now, dispatch })` runs right after, so its `syncVisibility` dispatches one `hide` or `show` immediately and `watchVisibility` registers one `visibilitychange` listener on `document`.
- `settings = settingsStore.load()` is read after `dispatch` is defined, and `createInterface` gets `onSettings` that stores the new value and saves it. Ghosts and sound have no effect today.
- The Visible_Loop is `requestAnimationFrame(frame)`; `frame` reads `now = Date.now()`, runs `dispatch({ type: "tick" }, now)`, then `scene.apply(sceneModel(state, now, ...))`, then `ui.update(state, now)`, then requests the next frame. It already goes through `dispatch`, so the Visible_Loop is not changed by this spec except that its `dispatch` call now feeds the title (below).

After the change, `dispatch` is:

```ts
const dispatch = (event: Event, now: number): void => {
  const prev = state;
  const next = step(prev, event, now);              // one call of step per event (R1.6)
  if (next !== prev) {
    storage.save(prev, next);                       // unchanged
    state = next;
  }
  afterStep(prev, next, event, now);                // CR1: runs for every event, changed or not
};
```

`afterStep` is `createAfterStep({ sound: () => settings.sound, play: player.play, writeTitle: titleAdapter.write, hidden })` and does, in this order, and never throws:

1. `cue = cueFor(prev, next, { eventType: event.type, sound: settings.sound, now })`.
2. `if (cue !== null) player.play(cue)`.
3. `titleAdapter.write(titleFor(next, now))`. The adapter drops a write equal to the last one, so a `tick` per frame writes at most once per whole second of time left (R6.10, R6.11). A phase change changes the string and writes in this same call, before the next frame (R6.12).
4. `if (event.type === "hide") hidden.start(now)`; `if (event.type === "show") hidden.stop()`.

Why `afterStep` runs even when `next === prev`: the title depends on `now`, and the time left changes every second while the state object does not. `cueFor` returns null when the phase is kept, so no Cue comes from a plain `tick`. Cues are chosen only here, from the Transition of one `step` call; no button, key or settings handler calls `cueFor` (R1.6).

`settings` must exist before the first `dispatch` (the `wireVisibility` sync dispatches during startup, and a `let` read before its declaration throws). So `settings = settingsStore.load()` moves above `dispatch`, and `onSettings` assigns it and also calls `player.setSound(next.sound)` (Decision D16).

The order of construction in `main.ts`, top to bottom:

1. `kv`, `storage`, `settingsStore`, `reduced` (as today); then `let settings = settingsStore.load()`.
2. `player = createAudioPlayer({ factory: browserAudioFactory(), sound: settings.sound })`, then `armFirstGesture(document, () => settings.sound, player.unlock)`. These come before any control exists, so the listeners are registered before the controls' handlers (R4.16, D4).
3. `titleAdapter = createTitleAdapter(document)`.
4. The scene (as today) and `loadNow = Date.now()`; `state = step(INITIAL_STATE, { type: "reload", state: storage.load() }, loadNow)`; then `titleAdapter.write(titleFor(state, loadNow))` once.
5. `hidden = createHiddenTick({ schedule: (f, ms) => window.setTimeout(f, ms), cancel: (id) => window.clearTimeout(id), clock: Date.now, dispatch: (e, now) => dispatch(e, now), getState: () => state })`.
6. `afterStep = createAfterStep(...)`; `dispatch` as above.
7. `wireVisibility(...)` unchanged (sync, then watch).
8. `createInterface(...)` with `onSettings` as in step 1's rule.
9. `requestAnimationFrame(frame)` with `frame` unchanged.

The Reload_Settle path. Step 4's `step(... reload ...)` is the only place where a transition can be found without `dispatch`. It never reaches `afterStep`, so no Cue is chosen: a candle that burned out while the page was closed plays nothing (R2.6, R2.10). The title is written once from that state, before the first frame (R6.14). The `reload` event type is also a null in `cueFor` (R2.6), a second guard for any future caller. The `hide` or `show` that the visibility sync sends in step 7 is a normal Live_Transition. Every event except `reload` and `tick` settles first, so it can only change the phase if the candle ended in the few milliseconds between `loadNow` and the sync's clock read. That is a transition found within milliseconds of its moment, and a Cue for it is correct.

The Visible_Loop path. Each frame: `dispatch({ type: "tick" }, now)` runs `step`, then `afterStep` (a Cue if the phase just changed, then the title), then the frame paints from `state`. A burn-out found in a visible frame therefore chimes once, in the frame that finds it, and the dawn is drawn in that same frame. While the page is visible the Hidden_Tick has no timer (R5.11).

The hidden tick path. `hidden.start(now)` reads `wake = nextWakeMs(getState(), now)`. If it is null it arms nothing. Otherwise it calls `schedule(callback, wake)`. The callback is:

```ts
const callback = (): void => {
  pending = null;
  const now = clock();                              // read when the timer runs (R5.1)
  try { dispatch({ type: "tick" }, now); } catch { /* swallowed; the chain goes on (D27) */ }
  let wake: number | null;
  try { wake = nextWakeMs(getState(), clock()); } catch { wake = WAKE_MAX_MS; }   // D27
  if (wake !== null && running) pending = schedule(callback, wake);   // R5.2, R5.6, R5.13
};
```

This is the outline; the full code, with the guard against a callback that runs after `stop()`, is in 3.7. `stop()` sets `running = false` and cancels `pending`. A `tick` from this path settles by timestamps, so a throttled or late timer gives the right time left and the right phase; the Cue and the title follow at the late tick (R5.9). It does not paint: the Visible_Loop is the only code that calls `scene.apply` and `ui.update` (R5.20).

How `hide` and `show` interact with the timer (Decision D15). `wireVisibility` stays exactly as it is: one `visibilitychange` listener on `document` that sends `hide` or `show` through `dispatch`, plus the one sync event at startup. The Hidden_Tick is started and stopped by step 4 of `afterStep`, which runs inside `dispatch` after `step` has returned. So:

- `hide`: `step(hide)` runs first, then `afterStep` calls `hidden.start(now)`. The first timer is armed after the engine has the `hide` (R5.16).
- `show`: `step(show)` runs first, then `afterStep` calls `hidden.stop()`. The timer is cleared after the engine has the `show` (R5.17).
- The order is a property of the call stack, not of listener registration order, so it holds however `main.ts` is reordered, and it covers the startup sync: a page that loads hidden sends `hide` through `dispatch` after the Reload_Settle and the title write, and the timer starts then (R5.12).
- A second `visibilitychange` listener registered after `wireVisibility` would also work, because listeners on one target run in registration order, but that order is a convention a later edit can break and it would need its own `document.visibilityState` read. It is not used.
- The hide event is sent in every phase, including `idle`, `burned-out` and `snuffed`, where the engine ignores it. `hidden.start` then finds `nextWakeMs` null and arms nothing (R5.3, R5.13). A phase that becomes `lit` or `paused` while hidden cannot happen without user input, and the hidden tick has no way to start it, so no extra rule is needed.
- `hide`, `show` and the tick count: the Hidden_Tick sends only `tick`, and `tick` neither opens nor closes a hide span (R5.18). Property P9 checks that against the engine; if it fails, that is Risk K1, not something to work around here.

Where the first-gesture listener sits. `armFirstGesture(document, wanted, unlock)` adds `keydown`, `pointerdown` and `touchend` listeners to `document` with `{ capture: true }`. Capture on the document runs before every bubbling or target handler below it, including the `keydown` listener on `document` in `src/ui/dom/events.ts` and the `submit` and `click` handlers on the controls. The listener calls `unlock()` only when `wanted()` (the `sound` setting) is true and the player is not yet Unlocked. In that call the player creates the `AudioContext` and calls `resume()` synchronously, then the three listeners are removed in the same dispatch of the event (R4.1 to R4.4, R4.6). With sound off, the listeners stay armed and create nothing. The sound switch is also a gesture: its `onSettings` path calls `player.setSound(true)`, which unlocks inside that click (R4.5).

Sequence (a): the first Enter on Light, sound on, nothing unlocked yet (a fresh page).

```
user      document (capture)      events.ts / ui          dispatch (main)                afterStep               player
 |  Enter    |                        |                        |                            |                      |
 |---------->| keydown (capture)      |                        |                            |                      |
 |           |-- wanted()? sound on --+                        |                            |                      |
 |           |-- unlock() --------------------------------------------------------------------------------------->| new AudioContext()
 |           |                        |                        |                            |                      | resume() (sync, in gesture)
 |           |-- remove keydown, pointerdown, touchend --------------------------------------------------------------| state = running
 |           | keydown (bubble) ----->| keyAction -> light     |                            |                      |
 |           |                        |-- dispatch(light, now)>| prev = state               |                      |
 |           |                        |                        | next = step(prev, light)   |                      |
 |           |                        |                        | storage.save(prev, next)   |                      |
 |           |                        |                        | state = next               |                      |
 |           |                        |                        |--- afterStep(prev,next,ev,now) ->                 |
 |           |                        |                        |                            | cueFor -> "strike"   |
 |           |                        |                        |                            |-- play("strike") --->| voices start now
 |           |                        |                        |                            | title "25:00 · ..."  |
 |           |                        |                        |                            | (adapter writes)     |
 |           |                        |<- announce, focus -----|                            |                      |
 |           |                        |   next frame: dispatch(tick) -> title same, no write  |                      |
```

Sequence (b): the candle burns out in a hidden tab (lit, 10 s left, sound on, unlocked earlier).

```
browser         wireVisibility        dispatch / step / afterStep                 hidden-tick                    player / title
 |                    |                         |                                       |                             |
 | visibilitychange   |                         |                                       |                             |
 | (hidden) --------->| dispatch(hide, t0) ---->| step(hide): open hide span; save      |                             |
 |                    |                         | afterStep: cue null; title "00:10.."  |                             |
 |                    |                         | afterStep step 4: hidden.start(t0) -->| wake = nextWakeMs = 1000    |
 |                    |                         |                                       | schedule(cb, 1000)          |
 | rAF stops          |                         |                                       |                             |
 | ...timer fires ... |                         |                                       | cb: now = clock()           |
 |                    |                         |<--------- dispatch(tick, now) --------| (each second: title only,   |
 |                    |                         | step(tick): still lit                 |  then re-arm, wake <= 1000) |
 | ...at t0+10 s ...  |                         |                                       |                             |
 |                    |                         |<--------- dispatch(tick, now) --------| cb: wake was min(1000,left) |
 |                    |                         | step(tick): settle -> burned-out      |                             |
 |                    |                         | afterStep: cueFor: now - endedAt      |                             |
 |                    |                         |   <= 120000 -> "chime" --------------------------------------------->| play("chime")
 |                    |                         | title "Morning · Candlewatch" ------------------------------------->| document.title
 |                    |                         |                                       | wake = null: no timer       |
 | visibilitychange   |                         |                                       |                             |
 | (visible) -------->| dispatch(show, t1) ---->| step(show): close span; save          |                             |
 |                    |                         | afterStep: cue null (phase kept)      |                             |
 |                    |                         | afterStep step 4: hidden.stop() ----->| cancel pending (none)       |
 | rAF resumes        |                         |                                       |                             |
 | frame: dispatch(tick) -> paint from settled state; no second chime (phase kept)       |                             |
```

If the browser had throttled the hidden timer to one wake per 60000 ms, the same `tick` would run at about t0 + 60 s with `now - endedAt` near 50 s. That is under the Late_Cue_Limit (120000 ms), so the chime still plays, late, once. If the wake came 130 s after the burn-out, the lateness is above the limit, `cueFor` returns null, and the title and the dawn are right but there is no sound (R5.22, D5, D10).

### 2.4 Decisions made in this part

These are recorded in the Decisions section later, under these numbers. D1 to D13 are fixed by the requirements.

- **D8 (module layout).** The two folders and the one file of section 2.1, with the pure and effect split of the table above.
- **D14. The cues live in the existing `src/audio/`.** The request for this design suggested a new `src/sound/`; `structure.md` and CR7 of the requirements already name `src/audio/` for "Web Audio cues", and the folder exists. A second folder for the same thing would split one concern in two, so `src/audio/` is used. The title and the tick are page concerns, not audio, so they go in `src/page/`. If the owner prefers `src/sound/`, the change is a rename in `structure.md` and this section; no rule depends on the folder name.
- **D15. The Hidden_Tick is driven by `hide` and `show` inside `dispatch`, not by a second listener.** Reason: the order (engine first, timer after) then holds by construction (R5.16, R5.17), the startup sync is covered by the same path (R5.12), and `wireVisibility` stays untouched (R5.15). The cost is that `afterStep` knows two event names. CR3 of the requirements says "on `visibilitychange`"; this is the same trigger seen one step later, through the events `wireVisibility` sends.
- **D16. `settings` is loaded before `dispatch` is defined.** Reason: `afterStep` reads `settings.sound` at the moment of each Transition (R2.13), and the startup visibility sync dispatches before the interface is created. Today `settings` is loaded after `dispatch`; moving it up changes no behaviour, because nothing reads it earlier.
- **D17. `afterStep` runs for every event, changed or not.** Reason: the title needs the new `now` even when the state object is the same. The cost is one `titleFor` and one string compare per frame; `cueFor` returns null at once when the phase is kept.
- **D18. Cues are requested after `save`.** Reason: a failing or slow player cannot delay or lose the write of the session (R1.8). `afterStep` wraps each of its four steps in its own `try`/`catch` (3.9), and the player and the adapter are also written not to throw (section 7).

## Components and Interfaces

Parts 3.1 to 3.4 cover the audio folder; parts 3.5 to 3.9 cover the title, the wake rule, the Hidden_Tick, the title adapter and `after-step.ts`. Names are those of section 2.1.

### 3.1 `types.ts` and `cue.ts`

`types.ts` holds the shared shapes (the voice shapes are in 3.2). `cue.ts` holds the one choosing function and the one limit.

```ts
// src/audio/types.ts (pure)
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
```

```ts
// src/audio/cue.ts (pure)
import type { State } from "../engine";
import type { Cue, CueContext } from "./types";

/** Greatest lateness at which an end cue still plays: two minutes (R2.11, D5). */
export const LATE_CUE_LIMIT_MS = 120000;

/** Total and pure. Exactly one of "strike", "chime", "breath", or null. */
export function cueFor(prev: State, next: State, context: CueContext): Cue | null;
```

What the engine gives `cueFor` (read from `src/engine/types.ts`):

- `State` is the union of five phases. `burned-out` has `endedAt` (the true completion instant) and `breakEndsAt` (`endedAt + BREAK_MS`). `snuffed` has `endedAt`. `idle`, `lit` and `paused` have no `endedAt`.
- The break is not a phase. It is the `burned-out` state while `isBreak(state, now)` is true, and it ends by the clock passing `breakEndsAt`, with no event and no phase change. So the break starts with the same Transition as the dawn (`lit` or `paused` to `burned-out`), which plays the `chime` and nothing more. No Transition marks the start or the end of the break itself, which is why R2.9 holds without a special case.
- `cueFor` reads `prev.phase`, `next.phase`, and `next.endedAt` only when `next.phase` is `burned-out` or `snuffed`. It reads no other field and calls no selector.

The rule table. Rules are tried top to bottom; the first that matches decides.

| # | Condition | Result |
|---|---|---|
| 1 | `context.sound` is false | `null` (R2.7) |
| 2 | `context.eventType` is `"reload"` | `null` (R2.6) |
| 3 | `prev.phase` in {`idle`, `burned-out`, `snuffed`} and `next.phase` is `lit` | `"strike"` (R2.2, whatever the delay, R2.12) |
| 4 | `prev.phase` in {`lit`, `paused`} and `next.phase` is `burned-out` and the lateness is within the limit | `"chime"` (R2.3) |
| 5 | `prev.phase` in {`lit`, `paused`} and `next.phase` is `snuffed` and the lateness is within the limit | `"breath"` (R2.4) |
| 6 | anything else | `null` |

Rule 6 covers every other ordered pair of phases: `lit` to `paused`, `paused` to `lit`, every same-phase pair (including `burned-out` to `burned-out`, which is the break running and being saved again), `idle` to `idle`, and the pairs the engine never produces (for example `burned-out` to `snuffed`). It is a total fallback, not a claim that the engine makes them.

Phase pairs, as the unit test walks them (5 x 5 = 25 ordered pairs, sound on, a live event, `now` equal to `endedAt`):

| prev \ next | idle | lit | paused | burned-out | snuffed |
|---|---|---|---|---|---|
| idle | null | strike | null | null | null |
| lit | null | null | null | chime | breath |
| paused | null | null | null | chime | breath |
| burned-out | null | strike | null | null | null |
| snuffed | null | strike | null | null | null |

The lateness rule:

- Lateness is `context.now - next.endedAt`, computed only for rules 4 and 5. It is not computed for `strike` (R2.12): lighting is found in the instant of the user's action, and `light` has no `endedAt`.
- An end cue plays when `lateness <= LATE_CUE_LIMIT_MS`. The boundary is therefore: one ms below the limit (119999) plays; exactly the limit (120000) plays; one ms above (120001) returns `null`. These are the three cases of R9.2 and the unit test uses exactly them, for both `chime` and `breath`.
- Decision D29: the lateness is `now - endedAt`, not clamped. A negative lateness (`now` before `endedAt`, which the engine does not produce because `endedAt` is at most `now`, but clock skew could) satisfies `<=` and plays. A `now` that is `NaN` or infinite makes the comparison false and returns `null`, so a non-finite `now` gives no end Cue; `cueFor` never throws.
- The limit lives in `cue.ts` only. `hidden-tick.ts` and `after-step.ts` do not know it (R5.22).

Properties of the function that the design relies on (checked in section 9): it returns at most one Cue; the result does not depend on `prev.history`, the intent or the distraction counts; and flipping `sound` to false turns any result into `null` while leaving the other inputs alone.

### 3.2 `specs.ts` and `noise.ts`

`specs.ts` is plain data. A Cue_Spec holds numbers, strings and arrays only (R3.4). The player turns it into nodes (3.3).

```ts
// src/audio/types.ts (continued, pure)

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
```

```ts
// src/audio/specs.ts (pure)
/** One master gain for all Cues, applied by one gain node in the player. 0 < value <= 1 (R3.7). */
export const MASTER_GAIN = 0.5;

export const CUE_SPECS: Readonly<Record<Cue, CueSpec>>;

/** Same object for the same Cue, on every call and whatever the motion preference (R3.5, R3.11). */
export function cueSpec(cue: Cue): CueSpec;
```

```ts
// src/audio/noise.ts (pure)
/**
 * `count` samples in [-1, 1) from a seeded generator (mulberry32, below). Pure: the same
 * (seed, count) gives the same array, and the first n samples of a longer array equal the n-sample array.
 * `count` is floored; a negative, NaN or infinite count gives an empty array. `seed` is read as an unsigned 32-bit integer.
 */
export function noiseSamples(seed: number, count: number): number[];
```

The generator is mulberry32, written locally in `noise.ts` (about eight lines):

```ts
let a = seed >>> 0;
for (let i = 0; i < n; i++) {
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  out[i] = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
}
```

- `src/scene/flicker.ts` has a seeded integer hash (`hash32(a, b, c)`), but it is value noise keyed by a time lattice, not a stream of samples, and `src/audio/` may not import `../scene` (section 2.2). A small local generator is cheaper than moving shared code or loosening a boundary, and a copy of a three-line hash would have to be a stream anyway. So `noise.ts` carries its own mulberry32 and imports nothing.
- The player asks for `ceil(sampleRate * (spanMs + 10) / 1000)` samples per noise voice, where `spanMs` is the voice's last envelope time minus its `startMs` and 10 ms is the slack before the scheduled stop. At 48000 Hz: strike scratch 5280 samples, breath voice A 43680, breath voice B 34080. They are generated when the Cue starts (a few thousand floats; well under a millisecond) and are not cached, so no state outlives a Cue. Because the stream is seeded and a prefix is stable, a different sample rate gives the same sound at a different resolution, not a different texture.

Why the Cues are quiet and short. A focus timer is heard in the middle of work, often on speakers in a room. The brief calls for a sound that marks a change, not one that announces itself. So every Cue peaks at or below 0.2 of full scale after the master gain (R3.7), the longest lasts 2 seconds, and each one fades to exact zero so nothing clicks (R3.8). The `strike` and the `breath` are under a second on purpose: they follow a key press and must not outlast the action.

**Decision D1. The recipes.** All times are Cue-relative milliseconds. A gain point is `[timeMs, gain]` before the master gain. Frequencies are Hz.

`strike` (id `"strike"`, `durationMs` 400):

| Voice | kind | startMs | frequency / filter | gain points | peak |
|---|---|---|---|---|---|
| 1 scratch | noise, seed `0x5ca7c4` | 0 | bandpass 4000 to 2500, q 0.8 | [0,0] [8,0.24] [100,0] | 0.24 |
| 2 flare | osc, triangle | 60 | 160 to 110 | [60,0] [75,0.14] [400,0] | 0.14 |

The scratch lasts 100 ms (inside 40..150). The flare partial is 160 to 110 Hz (inside 80..220) and starts at 60 ms, inside the scratch window 0..100 (R3.1). Rises: 8 ms and 15 ms. Falls: 92 ms and 325 ms. Total 400 ms (at most 700).

`chime` (id `"chime"`, `durationMs` 2000):

| Voice | kind | startMs | frequency | gain points | peak | decay |
|---|---|---|---|---|---|---|
| 1 | osc, sine | 0 | 660 | [0,0] [10,0.14] [1400,0] | 0.14 | 1390 |
| 2 | osc, sine | 140 | 880 | [140,0] [150,0.12] [1700,0] | 0.12 | 1550 |
| 3 | osc, sine | 280 | 1320 | [280,0] [290,0.08] [1900,0] | 0.08 | 1610 |

Three tonal voices in the ratio 3:4:6, all inside 200..2000 Hz, each with a decay of at least 600 ms (R3.2), staggered by 140 ms so it reads as a soft bell rising. Rise 10 ms each. The last envelope ends at 1900 ms, inside the 2000 ms total (at most 2500).

`breath` (id `"breath"`, `durationMs` 900):

| Voice | kind | startMs | filter | gain points | peak |
|---|---|---|---|---|---|
| 1 | noise, seed `0xb2ea71` | 0 | lowpass 2400 to 700, q 0.7 | [0,0] [60,0.30] [900,0] | 0.30 |
| 2 | noise, seed `0x0d15ea` | 0 | bandpass 1800 to 900, q 0.9 | [0,0] [40,0.08] [700,0] | 0.08 |

Noise only (R3.3). Voice 1 ends at 700/2400 = 29% of its start cutoff (71% lower; the rule needs at most 70%, that is at least 30% lower); voice 2 ends at 50%. Both fall to 0. Rises 60 ms and 40 ms; falls 840 ms and 660 ms. Total 900 ms (at most 1200).

The ids are `"strike"`, `"chime"`, `"breath"` and the durations 400, 2000 and 900, so all differ (R3.10). The tests read the numbers from `CUE_SPECS`, not from this table, and the rules of R3 are checked as properties over them (section 9); this table is the starting data.

The worst-case summed peak, after the master gain (R3.7). The worst case adds every voice's peak, which is more than the real peak because the voices peak at different instants:

| Cue | Sum of voice peaks | x MASTER_GAIN (0.5) | Limit |
|---|---|---|---|
| strike | 0.24 + 0.14 = 0.38 | 0.19 | 0.2 |
| chime | 0.14 + 0.12 + 0.08 = 0.34 | 0.17 | 0.2 |
| breath | 0.30 + 0.08 = 0.38 | 0.19 | 0.2 |

The largest bound is 0.19, so every Cue is at most 0.2 after the master gain. The test computes, for each Cue, the sum of `max(gain)` over its voices times `MASTER_GAIN` and asserts `<= 0.2`; that bound is the one the requirement states, and it does not depend on the voices' timing. During the 30 ms fade of an earlier Cue (3.3), the old Cue is at most at its own level and fading while the new one rises from 0, so the two never add past 0.2 by more than the fade overlap; the requirement bounds a Cue, not the overlap, and the overlap is under 50 ms (R4.10).

**Decision D2. The Cue_Spec shape and the noise seeds.** The shape is the plain-data type above (oscillator and noise voices, gain points, filters), which the player turns into nodes as described in 3.3. The three noise voices use the fixed seeds `0x5ca7c4`, `0xb2ea71` and `0x0d15ea`, stored in the Cue_Spec data as `seed` (the table above). They are distinct so the scratch and the two breath layers are not the same texture, and fixed so that two calls give the same data and the same samples (R3.5). The seeds are numbers in `specs.ts`; `noise.ts` has no seed of its own. Nothing is random at run time (`tech.md` rule 6 asks only for sound generated in code; the seed keeps it testable).

### 3.3 `audio-player.ts`

The only file that names `AudioContext` (R1.4). It takes a factory, so a test hands it a Fake_AudioContext with no hook in shipped code (R4.13).

```ts
// src/audio/audio-player.ts (effect)
import type { Cue } from "./types";

/** The smallest part of Web Audio the player uses. The real AudioContext satisfies it; the fake implements it. */
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

export interface OscillatorNodeLike extends AudioNodeLike {
  type: string;
  readonly frequency: AudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
  onended: ((event: unknown) => void) | null;
}

export interface AudioBufferLike {
  getChannelData(channel: number): Float32Array;
}

export interface BufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  start(when?: number): void;
  stop(when?: number): void;
  onended: ((event: unknown) => void) | null;
}

export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: string;
  readonly frequency: AudioParamLike;
  readonly Q: AudioParamLike;
}

export interface AudioContextLike {
  readonly state: string;                 // "suspended" | "running" | "closed" in a browser
  readonly currentTime: number;           // seconds
  readonly sampleRate: number;
  readonly destination: AudioNodeLike;
  resume(): Promise<void> | void;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorNodeLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  createBufferSource(): BufferSourceNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  close?(): Promise<void> | void;         // declared for test cleanup; the player never calls it
}

export interface AudioPlayerDeps {
  /** Called at most once, inside unlock(). Returns null when there is no AudioContext. */
  readonly factory: () => AudioContextLike | null;
  /** The `sound` setting at start-up. */
  readonly sound: boolean;
}

export interface AudioPlayer {
  /** Start the Cue now, or drop it. Never throws, never queues for a later gesture. */
  play(cue: Cue): void;
  /** Follow the `sound` setting. Turning it on is a gesture: it unlocks (R4.5). Turning it off fades the sounding Cue (R4.7). */
  setSound(on: boolean): void;
  /** Create the context and call resume() synchronously. To be called inside a user gesture. True when Unlocked afterwards. */
  unlock(): boolean;
  /** True once the context exists (state "unlocked" below). */
  isUnlocked(): boolean;
}

export function createAudioPlayer(deps: AudioPlayerDeps): AudioPlayer;

/** A factory over `window.AudioContext`; null when it is missing or its construction throws (R4.12). */
export function browserAudioFactory(): () => AudioContextLike | null;
```

If the real `AudioContext` does not satisfy `AudioContextLike` structurally, the implementation narrows the interface; it does not add a cast to `any`. `OscillatorNodeLike.type` and `BiquadFilterNodeLike.type` are `string` so the browser's wider unions are accepted.

The state machine. The player has one of three states and a `sound` flag:

```
            unlock() with sound on, factory ok
 locked ───────────────────────────────────────────▶ unlocked
   │                                                    │
   │ unlock(): factory null / throws                    │ any throw while building or playing
   └───────────────▶ failed ◀───────────────────────────┘
                (silent for the rest of the page's life)
```

- `locked`: no context exists (R4.1). `play` drops. `unlock()` with `sound` off returns false and stays `locked` (R4.6). `unlock()` with `sound` on calls `factory()` once. A `null` result or a throw makes the state `failed` and returns false. Otherwise the player builds the master gain node (`gain.value = MASTER_GAIN`, connected to `destination`), calls `context.resume()` in that same call (R4.2), swallows a rejected promise with a no-op `catch`, sets `unlocked` and returns true.
- `unlocked`: the context exists. `unlock()` returns true and does nothing more. `isUnlocked()` is true. Whether a Cue sounds depends on the context state at `play`.
- `failed`: `play`, `unlock` and `setSound` do nothing. `isUnlocked()` is false. There is no retry (R4.12).

The rules of `play(cue)`, in order. The whole body is inside one `try`; a throw sets `failed`, releases whatever the failed call built, and is not rethrown (R4.12). Nothing is shown to the user.

1. State `locked` or `failed`: drop (R4.8, R4.14). Nothing is remembered for a later gesture.
2. `sound` off: drop (R4.6).
3. Context state is `"running"`: start the Cue (rule 6).
4. Otherwise (a `"suspended"` context): call `resume()` once for this request. If the state is `"running"` right after the call (a fake does this; some engines do), start the Cue.
5. Otherwise, if `resume()` returned a promise, hold this single request as the latest: when the promise fulfils, start the Cue only if (a) the context state is then `"running"`, (b) this request is still the latest one (no later `play`, and no `setSound(false)` since), and (c) `sound` is still on. If the promise rejects or the state is still not `"running"`, drop it. If `resume()` returned nothing and the state is not running, drop it now (R4.9).
6. Start the Cue: fade out the sounding Cue (below), then build and start the new one.

**Decision D19. How `play` handles an asynchronous `resume()`.** Browsers settle `resume()` on a later task, so a state check right after the call usually still says `"suspended"` on a real page, and the very first `strike` (unlock and Light in one key press) would be lost if rule 4 were the only start path. Rule 5 is the one place where a request waits, and it waits only for the promise of the `resume()` call that this same request made, so it is the "after that call settles" of R4.9 and not a queue for a later gesture. It holds one request, never a list: a newer `play` replaces it, `setSound(false)` clears it, and a locked or failed player never reaches rule 5. A context that is still `"suspended"` once the promise has settled drops the Cue. Lateness is not checked again: `cueFor` already applied the limit at the Transition, and a promise that settles takes milliseconds. The fake settles the promise in a microtask, so a test awaits one microtask turn and then asserts; a fake whose `resume()` leaves the state `"suspended"` shows the drop, and one that flips the state shows the start.

Why the retry on `play` and not only in `unlock()`: per the HTML activation rules a key press (other than Escape) and a mouse press count as activation but a mouse `pointerdown` alone may not, and `unlock()` may run on an event that does not count. The `resume()` in `play` runs inside the click or key handler that caused the Transition, which is itself a gesture. This is also why the First_Gesture listener (3.4) can stay simple.

**Decision D20. Per-Cue gain node, a 30 ms fade, and release.** Each Cue gets its own gain node (`cueGain`, value 1) between its voices and the master node. Voices connect: source, then filter (noise voices only), then the voice's gain node, then `cueGain`, then the master node, then `destination`.

- Fading the sounding Cue (R4.7, R4.10): at time `t = context.currentTime`, call `cueGain.gain.cancelScheduledValues(t)`, `setValueAtTime(cueGain.gain.value, t)` and `linearRampToValueAtTime(0, t + 0.03)`, then `stop(t + 0.035)` on every source of that Cue. The fade is 30 ms, inside the 50 ms the requirements allow. The envelopes of the voices are not touched; only the Cue-level gain moves.
- Release (R4.11): every source has `onended`. When it fires, the player disconnects that source, its filter and its voice gain node. When the last source of a Cue has ended, it disconnects `cueGain`. A `release()` closure per Cue does this and is idempotent, so a source that ends and a fade that also calls it cause no second disconnect. `onended` is the cleanup trigger and a scheduled `stop` is what makes the event fire; the player never waits on a timer of its own (R5.23 and the purity scan forbid `setTimeout` here). The fake context fires `onended` of a node when its test clock passes the node's `stop` time, so the test sees the nodes disconnected after `advance`. If a build throws midway, the `catch` calls the same `release()` for the nodes made so far and sets `failed`.
- At most one Cue is tracked: `current: { cueGain, release, stopAll } | null`. A new start calls `fadeOut(current)` first and then replaces it.
- `setSound(false)`: sets the flag, clears the held request of rule 5, and fades `current`. Nothing is closed and the context is kept, because a new context would need a new gesture. `setSound(true)`: sets the flag, then calls `unlock()` if the state is `locked` (it is called from the click on the switch, R4.5); an `unlocked` or `failed` player does nothing more. This path sends no engine event and plays nothing (R2.14).

How the envelope points become calls. For a voice with `startMs` `s`, gain points `p0 .. pn` and the Cue start `t0 = context.currentTime` (seconds), `at(ms) = t0 + ms / 1000`:

- The voice gain node is created with `gain.value = 0` (a gain node starts at 1, so this is set first), then `gain.setValueAtTime(0, at(p0.time))`. The first point is always gain 0, so the voice begins silent.
- For each later point: `gain.linearRampToValueAtTime(point.gain, at(point.time))`. Every pair of points in the data is a rise or a fall of at least 5 ms or 20 ms, so no two points share a time and no ramp has zero length. The ramps are linear: the attack is a straight rise, the decay a straight fall to exactly 0 at the last point, so the voice ends at 0 and nothing clicks (R3.8). An exponential decay is not used because an exponential ramp cannot reach 0.
- An oscillator voice: `type = waveform`; `frequency.setValueAtTime(startHz, at(s))`; if `endHz !== startHz`, `frequency.exponentialRampToValueAtTime(endHz, at(lastPoint.time))` (the glide of the flare). `start(at(s))` and `stop(at(lastPoint.time) + 0.01)`.
- A noise voice: `n = ceil(sampleRate * (spanMs + 10) / 1000)`; `buffer = createBuffer(1, n, sampleRate)`; `buffer.getChannelData(0).set(noiseSamples(seed, n))`; a buffer source with that buffer (not looped); a biquad filter with `type = filter.kind`, `Q.value = filter.q`, `frequency.setValueAtTime(startHz, at(s))` and `frequency.exponentialRampToValueAtTime(endHz, at(lastPoint.time))`. That is the cutoff sweep: it falls from `startHz` to `endHz` over the voice, which is what makes the `breath` close and the `strike` scratch thin out. `start(at(s))` and `stop(at(lastPoint.time) + 0.01)`.
- Frequencies and cutoffs are always above 0 in the data, so the exponential ramp is valid; the spec tests assert it.
- If `context.currentTime` is not finite the start is treated as a throw (the `catch` handles it).

`browserAudioFactory()`:

```ts
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
```

- It names `window` and `AudioContext` here and nowhere else in the file (section 2.2). No `webkitAudioContext` fallback: the unprefixed constructor ships in every browser the build targets (Safari from 14.1), and a prefixed fallback would add a branch with no test and no user. A browser without it gets `null`, then `failed`, then silence, with the timer, the scene and the title unchanged (R4.12). **Decision D21.**
- The factory is called only from `unlock()`, so nothing is constructed at page load (R4.1). `main.ts` passes `browserAudioFactory()` and never calls the returned function.

### 3.4 `gesture.ts`

An effect file with no global: the target is injected (`document` in `main.ts`, a fake in tests).

```ts
// src/audio/gesture.ts (effect)
export type GestureEventName = "keydown" | "pointerdown" | "touchend";

/** The part of EventTarget the arming uses. */
export interface GestureTarget {
  addEventListener(type: GestureEventName, listener: () => void, options: { capture: true; passive?: boolean }): void;
  removeEventListener(type: GestureEventName, listener: () => void, options: { capture: true }): void;
}

/**
 * Listen for the first gesture. Returns `disarm`, which removes all three listeners and is safe to call more than once.
 * `wanted()` is the `sound` setting; `unlock()` is `player.unlock`.
 */
export function armFirstGesture(
  target: GestureTarget,
  wanted: () => boolean,
  unlock: () => boolean,
): () => void;
```

Rules:

- Three events: `keydown`, `pointerdown`, `touchend` (R4.4), one shared handler. No other event counts, and no key is excluded: an Escape press that the browser does not treat as activation simply leaves the context `"suspended"`, and the retry in `play` (D19) covers it. R4.17 asks only that Escape not be required.
- Capture phase. Each listener is added with `{ capture: true }`, and the `touchend` listener also with `passive: true` (it never calls `preventDefault`, and a passive listener cannot delay scrolling). Each listener is removed with `{ capture: true }`, because `removeEventListener` matches on the capture flag, not on `passive`; a mismatch would leave the listener armed. A capture listener on `document` runs before the bubbling handlers of `src/ui/dom/events.ts` and of the controls, so the gesture that lights the first candle unlocks audio before its own `strike` is requested (R4.3, R4.16).
- The handler: `if (!wanted()) return;` then `unlock()` inside a `try` (a throw is swallowed), then `disarm()`. `disarm` removes all three listeners. This happens in the same dispatch of the event (R4.4), so a later press of any of the three never reaches the handler.
- Sound off: `wanted()` is false, so the handler returns at once, creates nothing (R4.6) and the listeners stay armed. When the user later turns sound on, `setSound(true)` unlocks (R4.5, 3.3) and the still-armed listeners then fire at the next gesture, find an Unlocked player (`unlock()` returns true and does nothing) and disarm. Nothing is lost if the switch click and the arming race.
- Unlock fails: `unlock()` returns false because the factory gave `null` or threw, so the player is `failed` for good. The handler still calls `disarm()`: there is nothing to wait for, and keeping three capture listeners on every key press for no purpose has a cost. The cost of this choice is that if the player's `sound` flag and `wanted()` ever differ, the arming would be spent without an unlock; both read the same setting and `onSettings` updates the player before any other event runs, so they do not differ (the test with the fake covers the order).
- Pointer then touch: on a touch screen `pointerdown` comes first and unlocks; `touchend` is then already removed. The handler runs at most once in total.
- `disarm` is also returned for tests and for a future teardown. `main.ts` ignores it.

### 3.5 `title.ts`

Pure and total. It builds the Page_Title from the state and `now` and nothing else.

```ts
// src/page/title.ts (pure)
import type { State } from "../engine";

/** The Page_Title for this state at `now`. Total: one string for every state, including a non-finite `now`. */
export function titleFor(state: State, now: number): string;
```

Imports: `timeLeftMs` from `../engine`, `STRINGS` from `../strings`, `fill` and `formatTime` from `../ui/format`. Nothing else (section 2.2).

The templates live in `STRINGS.pageTitle` (final wording in section 4). The keys and placeholders this file depends on:

| Key | Placeholders | Starting wording (section 4 confirms) | Form (R6) |
|---|---|---|---|
| `STRINGS.title` | none | `Candlewatch` | idle, exactly (R6.1) |
| `STRINGS.pageTitle.lit` | `{time}`, `{name}` | `{time} · {name}` | `12:31 · Candlewatch` (R6.2) |
| `STRINGS.pageTitle.paused` | `{time}`, `{name}` | `{time} paused · {name}` | `12:31 paused · Candlewatch` (R6.3) |
| `STRINGS.pageTitle.burnedOut` | `{name}` | `Morning · {name}` | `Morning · Candlewatch` (R6.4) |
| `STRINGS.pageTitle.snuffed` | `{name}` | `Dark · {name}` | `Dark · Candlewatch` (R6.5) |

The separator is U+00B7 with a space on each side. It is part of the templates, not of the code.

The body, one `switch` on `state.phase` with no default branch, so the compiler reports a missing phase:

```ts
export function titleFor(state: State, now: number): string {
  const name = STRINGS.title;
  switch (state.phase) {
    case "idle":
      return STRINGS.title;
    case "lit":
      return fill(STRINGS.pageTitle.lit, { time: formatTime(timeLeftMs(state, now)), name });
    case "paused":
      return fill(STRINGS.pageTitle.paused, { time: formatTime(timeLeftMs(state, now)), name });
    case "burned-out":
      return fill(STRINGS.pageTitle.burnedOut, { name });
    case "snuffed":
      return fill(STRINGS.pageTitle.snuffed, { name });
  }
}
```

Rules:

- Five forms, one per phase (R6.1 to R6.5). The `lit` and `paused` forms call the same expression, `formatTime(timeLeftMs(state, now))`, so only the template differs.
- No literal `paused`, `Morning` or `Dark` appears in `title.ts` (R6.6). The purity test strips comments and then scans the file for those three words, case-insensitive, and for the separator character; all of them live in `strings.ts`. The strings test (section 8) checks that the templates contain them.
- The name comes from `STRINGS.title`, the same value that `idle` returns and that `index.html` holds (R6.16). There is no second copy of the product name.
- The intent is never read. `titleFor` touches `state.phase` and, through `timeLeftMs`, the session's length, start and pauses; it never reads `state.session.intent` (R6.9). A property test sets an intent made of a distinctive marker and asserts the marker is absent from the output for every phase.
- `fill` leaves an unknown placeholder as it is. Each template is filled with every placeholder it holds, so none is left in the output; the strings test checks that the caller fills each one (R8.7).

What `timeLeftMs` returns while paused. From `src/engine/selectors.ts` and `time.ts`:

- `timeLeftMs(state, now)` is `lengthMs(session) - burnMs(state, floor(now))`, and `0` for any phase other than `lit` and `paused`, and `0` for a non-finite `now`.
- `burnMs` for a `paused` state is frozen at `pausedAt`: `clamp(pausedAt - startedAt - pausedTotalMs, 0, length)`. It does not depend on `now`. So the time left while paused is a constant: the time that was left at the moment of the pause.
- Therefore the `paused` title reads `12:31 paused · Candlewatch` and does not change while the pause lasts, whatever `now` is. It changes only when the phase changes. What counts down during a pause is the pause allowance, and that is shown on screen (`STRINGS.status.pauseLeft`) but not in the title, because R6.15 allows one piece of state per form: the time left and the pause.
- `timeLeftMs` does not settle (its comment says so). A `lit` state whose end has passed reads `0` until the next `tick` settles it. Between that moment and the settle the title would read `00:00 · Candlewatch`. In the Visible_Loop the settle comes in the same frame (the `tick` runs before the title is built); in the Hidden_Tick it comes at the tick that finds the end (3.6, 3.7). `titleFor` is always called with the state `dispatch` returned, which for a `tick` is settled.

Edge cases:

| Input | Output | Why |
|---|---|---|
| `burned-out`, break running (`isBreak` true) | `Morning · Candlewatch` | The break is not a phase (3.1). The title does not read `isBreak`, so the cooling break and the finished dawn have one title (R6.4). |
| `burned-out`, break over, or a stored `burned-out` after reload | `Morning · Candlewatch` | Same form. The title is not the place to show the break, and the status line already does. |
| `snuffed` | `Dark · Candlewatch` | No time, no intent (R6.5). |
| `idle` | `Candlewatch` | Exactly `STRINGS.title`; the string is `===` to the constant (R6.1). |
| `lit`, `now` NaN or infinite | `00:00 · Candlewatch` | `timeLeftMs` gives 0 and `formatTime(0)` is `00:00`. `titleFor` does not throw. |
| `lit`, 25 minutes left exactly | `25:00 · Candlewatch` | `formatTime` rounds up to whole seconds. |
| `lit`, 1 ms left | `00:01 · Candlewatch` | The same round-up; `00:00` is shown only at 0. |
| Graveyard view open | the phase's form | The view is not a phase (R6.18); `titleFor` has no view argument. |

Why the title time equals the Time_Text (R6.7, R6.8). The Time_Text of a running session is built in `timeOf` in `src/ui/view.ts` (called by `viewOf`, then written by `src/ui/dom/apply.ts` as `view.timeText`). For `lit` and `paused` it is:

```ts
const left = timeLeftMs(state, now);
return { text: formatTime(left), ... };
```

`titleFor` computes `formatTime(timeLeftMs(state, now))`, the same two functions in the same order, imported from the same modules (`../engine` and `../ui/format`). `ui.update(state, now)` is called with the same `state` and `now` that `afterStep` just received in the same frame, because the frame reads `Date.now()` once and uses it for `dispatch`, `scene.apply` and `ui.update`. So for equal `(state, now)` the strings are equal by construction, and a test checks it over generated states: for every `lit` or `paused` state and every finite `now`, `titleFor(...)` starts with `viewOf(...).timeText` (for `lit`) or contains it (for `paused`). The two are not a coincidence of formatting; there is no code path that formats a title time without `formatTime`. `idle` shows no title time, while the `idle` Time_Text shows the chosen length: that is not a mismatch, because R6.8 is about a time the title shows, and the idle title shows none.

### 3.6 `wake.ts`

Pure. It answers one question: how long may the Hidden_Tick sleep before it must look at the state again?

```ts
// src/page/wake.ts (pure)
import type { State } from "../engine";

/** Longest sleep: one second (R5.2, R5.3). */
export const WAKE_MAX_MS = 1000;
/** Shortest sleep: one millisecond (R5.4, R5.5). Never 0, so a timer never re-arms in a tight loop. */
export const WAKE_MIN_MS = 1;

/** Delay in (0, 1000] ms for `lit` and `paused`; null for `idle`, `burned-out` and `snuffed`. Total. */
export function nextWakeMs(state: State, now: number): number | null;
```

Imports: `timeLeftMs` and `pauseLeftMs` from `../engine`.

The pause allowance selector exists and is public. `src/engine/index.ts` exports `pauseLeftMs(state, now)`; it is "the pause allowance left in ms, in [0, PAUSE_LIMIT_MS]", `0` outside `paused` and for a non-finite `now`. It is computed from the same `pauseLimitAt` that `settle` uses to snuff the pause, so the wake and the snuff cannot disagree. `PAUSE_LIMIT_MS` (600000, ten minutes) is exported too and is not needed here. No change request to the engine is needed (no CR-E); this design uses `pauseLeftMs` as it stands and does not edit the engine.

Rules:

| Phase | Result |
|---|---|
| `lit` | `clampWake(timeLeftMs(state, now))` |
| `paused` | `clampWake(pauseLeftMs(state, now))` |
| `idle`, `burned-out`, `snuffed` | `null` |

```ts
function clampWake(ms: number): number {
  if (Number.isNaN(ms)) return WAKE_MAX_MS;            // unknown: look again in a second, never spin
  return Math.min(Math.max(ms, WAKE_MIN_MS), WAKE_MAX_MS);
}
```

Edge cases, `lit` with `ms = timeLeftMs(state, now)` (the same rows hold for `paused` with `pauseLeftMs`):

| Left | Result | Why |
|---|---|---|
| `0` | `1` | The end is now; the tick must still run, and it must be after the end moment. 1 ms is the shortest sleep (R5.4). |
| `0.4` | `1` | Under 1 ms is raised to the minimum (R5.4, R5.5). |
| `1` | `1` | At the minimum. |
| `999` | `999` | Shorter than a second: sleep exactly until the end (R5.4). |
| `1000` | `1000` | At the maximum. |
| `1000.5`, `5000`, `1500000` | `1000` | Longer than a second: wake once per second (R5.2). |
| `Infinity` | `1000` | Follows the clamp. The selectors never return it. |
| `-Infinity`, any negative | `1` | Follows the clamp. The selectors never return it. |
| `NaN` | `1000` | See below. |
| `now` NaN or infinite with a `lit` state | `1` | The selector turns a non-finite `now` into `0` left (`timeLeftMs` and `pauseLeftMs` both do), so the result is `1`. |

**Decision: NaN gives `WAKE_MAX_MS`.** A `NaN` can come only from a state whose own numbers are not finite, which the validators in `src/engine/validate.ts` do not let in. If it ever happened, the two wrong choices are different in cost. Returning `1` would make the Hidden_Tick re-arm every millisecond for as long as the state stayed bad, and a browser that does not clamp (a foreground test, a fake) would spin. Returning `1000` makes it look again once a second, which is the normal pace and the pace at which a state that repairs itself (a later event, a settle) is noticed. The result stays inside (0, 1000] either way (R5.3). `Infinity` and `-Infinity` are ordered values, so they follow the clamp: a limit of `Infinity` left is "a long time", which is 1000; a limit of `-Infinity` left is "overdue", which is 1.

Why the delay never overshoots the end (R5.4, R5.5). While `lit`, the Wake_Delay is at most the time left, so the timer is set to fire at or before the end moment (`now + delay <= now + left`). The only case where it fires after the end is when the left time is under 1 ms, and then it fires 1 ms later, which is the shortest possible delay and the earliest moment the tick can find the end already passed. The same holds for `paused` and the pause-limit moment. The delay is also at most 1000 ms, so the title is never more than a second plus the browser's lateness behind (R6.13).

Why an early timer re-arms (R5.6). Browsers may run a timer a little early with respect to `Date.now()` (the timer clock and the wall clock differ, and each rounds), or the tick may find `left` still above zero after a long delay was cut short. The tick that runs is a normal `tick`: it settles by timestamps and reads the new state. If the phase is still `lit` or `paused`, `nextWakeMs` is asked again with the new `now`, gives the shorter remaining time (down to 1 ms) and the timer is armed again. So an early timer never loses the end: it only costs one more short timer. Each delay is at least 1 ms, so the number of re-arms before the end is bounded by `left / 1 ms` in the worst case and by `left / 1000 ms` in the normal one.

### 3.7 `hidden-tick.ts`

The only owner of the background timer (R1.5). It sends only `{ type: "tick" }` through the `dispatch` it is given and never paints (R5.20). It reads no global; the timer functions and the clock come in as arguments.

```ts
// src/page/hidden-tick.ts (effect)
import type { Event, State } from "../engine";
import { nextWakeMs, WAKE_MAX_MS } from "./wake";

/** What `schedule` returns and `cancel` takes. `window.setTimeout` returns a number. */
export type TimerId = number;

export interface HiddenTickDeps {
  /** Run `fn` once after about `ms` milliseconds. `main.ts`: (fn, ms) => window.setTimeout(fn, ms). */
  readonly schedule: (fn: () => void, ms: number) => TimerId;
  /** Cancel a timer that has not run. `main.ts`: (id) => window.clearTimeout(id). */
  readonly cancel: (id: TimerId) => void;
  /** Epoch ms. `main.ts`: Date.now. Read when the timer callback runs (R5.1). */
  readonly clock: () => number;
  /** The one `dispatch` of `main.ts`; the Cue and the title follow from it (R1.7). */
  readonly dispatch: (event: Event, now: number) => void;
  /** The state `dispatch` last stored. */
  readonly getState: () => State;
}

export interface HiddenTick {
  /** Start ticking after a `hide` has reached the engine. Does nothing if already running or if no wake is needed. */
  start(now: number): void;
  /** Stop ticking and cancel the pending timer. Safe to call at any time, any number of times. */
  stop(): void;
  /** True from a start that armed a timer until stop() or a callback that finds nothing left to wait for. */
  isRunning(): boolean;
  /** True while a timer is armed and has not run. */
  hasPending(): boolean;
}

export function createHiddenTick(deps: HiddenTickDeps): HiddenTick;
```

The code, made precise. `armId` is the guard against a callback that runs after `stop()` (a fake timer, or a browser that had already queued the task): every arm takes a new id, and a callback acts only if its own id is still the current one.

```ts
export function createHiddenTick(deps: HiddenTickDeps): HiddenTick {
  let running = false;
  let pending: TimerId | null = null;
  let armId = 0;                                   // changes at every arm and every stop

  const arm = (wake: number): void => {
    const mine = ++armId;
    pending = deps.schedule(() => fire(mine), wake);
  };

  const fire = (mine: number): void => {
    if (mine !== armId || !running) return;        // stopped or replaced: do nothing at all
    pending = null;
    try {
      deps.dispatch({ type: "tick" }, deps.clock());           // now read when the timer runs (R5.1)
    } catch {
      /* swallowed: the chain goes on below (D27) */
    }
    if (mine !== armId || !running) return;                    // stop() during the dispatch
    let wake: number | null;
    try {
      wake = nextWakeMs(deps.getState(), deps.clock());        // a fresh read: the dispatch took time
    } catch {
      wake = WAKE_MAX_MS;                                      // state unreadable: look again in a second, never spin
    }
    if (wake === null) {
      running = false;                                         // nothing left to wait for (R5.13)
      return;
    }
    arm(wake);                                                 // R5.2, R5.6
  };

  return {
    start(now) {
      if (running) return;                                     // no second timer
      const wake = nextWakeMs(deps.getState(), now);           // the state after the hide
      if (wake === null) return;                               // arms nothing, stays not running
      running = true;
      arm(wake);
    },
    stop() {
      running = false;
      armId++;                                                 // any callback still in flight is now stale
      if (pending !== null) {
        const id = pending;
        pending = null;
        deps.cancel(id);
      }
    },
    isRunning: () => running,
    hasPending: () => pending !== null,
  };
}
```

Rules, with the criteria they serve:

| Rule | Behaviour | Criteria |
|---|---|---|
| Source of `now` | Each callback reads `deps.clock()` when it runs. `start(now)` uses the `now` of the `hide` event only to compute the first delay. The module never names `Date`. | R5.1, R1.5 |
| Delay | Every arm uses `nextWakeMs`, so every delay is in (0, 1000]. | R5.2, R5.3 |
| End found | The delay is at most the time (or pause allowance) left, so a tick runs at the end moment. | R5.4, R5.5 |
| Early timer | The callback dispatches, reads the new wake and re-arms. | R5.6 |
| Cue once | The tick that finds the end changes the phase once; the next `nextWakeMs` is `null`, so no further tick runs. `cueFor` plays only on the phase change, so one end gives one Cue. | R5.7, R5.8 |
| Late timer | A late callback dispatches `tick` with the later `now`; the engine settles by timestamps. The Cue and the title follow at that tick. | R5.9, R5.22 |
| Show | `stop()` cancels the pending timer. `main.ts` calls it after `show` reached the engine. | R5.10, R5.17 |
| Visible | The timer exists only after `start`, and `start` is called only after `hide`. A visible page has none. | R5.11 |
| Load hidden | The sync `hide` goes through `dispatch` after the Reload_Settle, so `start` runs after both. | R5.12 |
| Phase leaves | See below. | R5.13 |
| Only `tick` | `fire` dispatches nothing else. The engine's `tick` neither opens nor closes a hide span; property P9 checks the equivalence with the extra-tick-free run. | R5.14, R5.18 |
| `hide`/`show` untouched | `wireVisibility` is not edited. | R5.15 |
| Order | `start` is called after `step(hide)` has returned and stored the state; `stop` after `step(show)`. | R5.16, R5.17 |
| No paint | `fire` has no reference to the scene or the interface. | R5.20 |
| Plain timer | `schedule` and `cancel` only. No audio source, no keep-alive, no audio clock. The purity scan forbids `AudioContext`. | R5.23 |

Details that the code settles:

- Guard against a callback after `stop`. `stop()` increments `armId` and clears `running`, so a callback already in flight fails its first line and does nothing: it does not dispatch, does not read the state and does not arm. The same guard covers a `stop()` that happens inside the dispatch (the check after `dispatch`).
- `start()` when already running does not double-arm. It returns before it reads the state. There is at most one `pending` at any time, an invariant the property test checks over random scripts: `hasPending()` implies `isRunning()`, and the fake timer never holds more than one live timer from this module.
- `start()` when `nextWakeMs` is `null` arms nothing. `running` stays false, `hasPending()` is false and `schedule` is not called. This is the case of a `hide` sent while the phase is `idle`, `burned-out` or `snuffed`.
- `stop()` is idempotent. A second call finds `pending === null` and calls `cancel` no more; it only increments `armId`. It is safe before any `start`.
- Why `start(now)` reads `getState()` after the hide. The engine ignores `hide` in some phases and accepts it in `lit` (it opens a hide span). `start` must see the state that `dispatch` stored, not the one from before the event, otherwise a `hide` that moved the state to something else would be judged on stale data. `afterStep` runs after `state = next` (section 2.3), so `getState()` is the state after the hide. The `now` argument is the event's `now`; it feeds only the first delay. The `now` of every later wake is read from `clock()` at the callback.
- How the phase leaving `lit` and `paused` stops the chain. The tick that settles `lit` to `burned-out`, or `paused` to `snuffed`, runs inside `fire`. After the dispatch, `nextWakeMs(getState(), clock())` is `null`, so `fire` sets `running = false`, arms nothing and returns. `pending` is already `null`. Nothing is cancelled because nothing is pending. The later `show` calls `stop()`, which then does nothing harmful (idempotent). The chain does not end when `lit` goes to `paused` and back: both are "needs a wake", so the chain continues (a pause during a hide cannot happen because there is no input, but the rule does not depend on that).
- A throw (Decision D27). If `dispatch` throws, the error is swallowed and the chain goes on: the next wake is read from the state as it is and a timer is armed as usual, so one bad tick cannot end the chain and lose the chime and the end title of a session that ends later in a background tab. If `getState` or `nextWakeMs` throws, the next timer is armed at `WAKE_MAX_MS` (1000 ms) and never sooner, so a state that stays unreadable is retried once a second and cannot spin. The chain ends only when `nextWakeMs` returns `null` (the phase is no longer `lit` or `paused`) or when `stop()` has run; a throw never ends it. `show` stops the chain in every case.
- Timer ids. `schedule` returns whatever the host returns; this module keeps it only to cancel it. A fake returns an incrementing number.

Browser timers, in general. This is the behaviour of mainstream browsers as commonly documented (for example in MDN's pages on `setTimeout` and on inactive tabs); it is not defined by this spec, it varies by browser and version, and the design relies only on its direction, never on an exact number.

| Page state | What a `setTimeout` delay does (general behaviour) | Effect on the Hidden_Tick |
|---|---|---|
| Visible | The delay is honoured to within a few milliseconds. Nested timers may get a floor of about 4 ms after several levels. | Not used: the Visible_Loop runs. |
| Hidden, first minutes | Browsers clamp the delay to about 1000 ms (a request for 1 ms runs after about 1 s). Chrome applies budget-based throttling to hidden pages. | The tick runs about once per second. A wake of 1 to 999 ms near the end runs up to about a second late. |
| Hidden, about 5 minutes or more (Chrome "intensive throttling") | A page that has been hidden for several minutes, whose timer chains are long and which makes no sound, may be woken about once per minute. Safari and Firefox have similar limits and different rules. | About one tick per 60000 ms. |
| Frozen, discarded or device asleep | Timers do not run at all. | No ticks. The next event or the next visible frame settles by timestamps. |

Consequences, which are the design's, not the browser's:

- The time is right on return in every row, because it comes from timestamps (`tech.md` rule 1). Throttling changes only when the Cue and the title update, never the time.
- A late end Cue plays if `now - endedAt <= LATE_CUE_LIMIT_MS` (120000 ms). With about one wake per minute the worst lateness is about 60 s plus the browser's own delay, which is inside the limit, so the chime still sounds, late and once. A lateness above the limit gives no sound; the title and the dawn are still right (R5.22).
- The page does not try to avoid throttling: no silent audio keep-alive, no Web Worker timer, no audio-clock scheduling (R5.23). A silent audio source would break R4 (no context before a gesture, and no hidden sound) and would be a hidden costume. A Worker needs its own file and gains little against the 60 s case.

**Decision D3. Mechanism and delay rule (with D10, accepted throttling).** The Hidden_Tick is a chain of single `setTimeout` calls, re-armed from the callback. Each delay is `nextWakeMs`: at most 1000 ms and at most the time left, at least 1 ms. A `setInterval` is rejected because it keeps firing after the end and cannot shorten its last interval. A fixed 1000 ms chain is rejected because it would overshoot the end by up to a second when 1 to 999 ms were left. The rule `min(left, 1000)` costs one extra timer at the end and makes the chime land at the end moment where the browser allows. Under throttling to one wake per minute, the title freezes between wakes and the Cue is late by at most the throttle interval plus the browser's own delay; the Late_Cue_Limit of two minutes is chosen above that. The owner can lower or raise the limit by changing one constant in `cue.ts`; nothing in this file depends on it.

### 3.8 `title-adapter.ts`

The only code that writes `document.title` (R1.4). The `doc` argument is the page's `document`, or in a test any object with a `title` string property.

```ts
// src/page/title-adapter.ts (effect)

/** The part of `document` the adapter uses. */
export interface TitleTarget {
  title: string;
}

export interface TitleAdapter {
  /** Write `title` to the document unless it is already what is shown. Never throws. */
  write(title: string): void;
  /** The last title this adapter knows the document holds: the last one written, or the one it found and kept. null before the first write. */
  last(): string | null;
}

export function createTitleAdapter(doc: TitleTarget): TitleAdapter;
```

```ts
export function createTitleAdapter(doc: TitleTarget): TitleAdapter {
  let known: string | null = null;
  return {
    write(title) {
      if (typeof title !== "string") return;
      try {
        if (known === null) {
          if (doc.title !== title) doc.title = title;   // the first write compares with what the page holds
        } else if (known === title) {
          return;                                       // equal to the last write: no write (R6.10)
        } else {
          doc.title = title;
        }
        known = title;
      } catch {
        // A document that throws on read or write: keep the old `known` so the next call tries again. Nothing is shown.
      }
    },
    last: () => known,
  };
}
```

Rules:

- Equal writes are dropped (R6.10). After the first write the adapter compares with the string it last stored, not with `doc.title`. Reading `document.title` on every frame has a cost, and the setter normalises the text (the browser strips and collapses ASCII whitespace), so a read-back can differ from what was written and would force a write on every frame. Compare-to-last avoids both. A title that another script changes in between is not noticed; no other code in this page writes it.
- The first write compares with `doc.title` once (R6.14). The page starts with `<title>Candlewatch</title>` (R6.16). If the first title is `Candlewatch` (idle), nothing is written and `last()` becomes `Candlewatch`. If it is different (a stored `lit` session: `12:31 · Candlewatch`), it is written once, before the first frame.
- It never throws. A throwing getter or setter is caught; `known` is left unchanged so the next call retries. A value that is not a string is ignored; the type already forbids it and the check keeps the function total.
- It owns no timer, no `requestAnimationFrame` and no clock. It is called from `afterStep` and from the one initial write in `main.ts`, and nothing else.
- It writes in the same synchronous call as the change (R6.12). `afterStep` calls `writeTitle` inside `dispatch`, so a phase change is in the title before the next frame is drawn.

Why at most one write per whole second (R6.11). While `lit`, `titleFor` varies with `now` only through `formatTime(timeLeftMs(state, now))`. `timeLeftMs` is non-increasing in `now` while the state is `lit` and unchanged (it is `length - burn`, and `burn` grows with `now`, clamped at the ends). `formatTime` is `ceil(ms / 1000)` shown as `mm:ss`: it is constant on each interval `(k - 1) * 1000 < ms <= k * 1000`, which is 1000 ms wide. A monotone function that is constant on 1000 ms-wide steps takes a new value at most once per 1000 ms of `now`. So the string `titleFor` gives changes at most once per second; every other call yields an equal string, and the adapter drops it. While `paused`, `timeLeftMs` is frozen, so the string does not change at all until the phase does. A phase change adds one more write, which is the point of R6.12. So over any interval the number of writes is at most (the number of whole seconds in the interval + 1) plus the number of phase changes. No timer in the adapter is needed to enforce this; equality does it. If the clock moves backwards, `timeLeftMs` may rise again (the lit clamp is on `litSince` only); each change in the string then costs one write, and the count of writes is still bounded by the count of changes.

### 3.9 `after-step.ts`

The one function that `dispatch` calls after every `step`. It composes the pure choices (`cueFor`, `titleFor`) with the effects it is given, in a fixed order, and it never throws.

```ts
// src/after-step.ts (effect)
import type { Event, State } from "./engine";
import { cueFor } from "./audio/cue";
import type { Cue } from "./audio/types";
import { titleFor } from "./page/title";

export interface AfterStepDeps {
  /** The `sound` setting now. `main.ts`: () => settings.sound. */
  readonly sound: () => boolean;
  /** `player.play`. Never throws by contract, and is guarded here anyway. */
  readonly play: (cue: Cue) => void;
  /** `titleAdapter.write`. */
  readonly writeTitle: (title: string) => void;
  /** The Hidden_Tick control. A `HiddenTick` satisfies it. */
  readonly hidden: {
    start(now: number): void;
    stop(): void;
  };
}

/** Called by `dispatch` once per event, with the state before and after the single `step` call. */
export type AfterStep = (prev: State, next: State, event: Event, now: number) => void;

export function createAfterStep(deps: AfterStepDeps): AfterStep;
```

The four steps, in this order, each in its own `try`/`catch`:

```ts
export function createAfterStep(deps: AfterStepDeps): AfterStep {
  return (prev, next, event, now) => {
    // 1. choose the Cue from this one Transition
    let cue: Cue | null = null;
    try {
      cue = cueFor(prev, next, { eventType: event.type, sound: deps.sound(), now });
    } catch {
      cue = null;
    }
    // 2. play it
    if (cue !== null) {
      try {
        deps.play(cue);
      } catch {
        /* a failing player is silent; steps 3 and 4 still run */
      }
    }
    // 3. the title
    try {
      deps.writeTitle(titleFor(next, now));
    } catch {
      /* a failing title write must not stop step 4 */
    }
    // 4. the Hidden_Tick control
    try {
      if (event.type === "hide") deps.hidden.start(now);
      else if (event.type === "show") deps.hidden.stop();
    } catch {
      /* the next hide or show tries again */
    }
  };
}
```

Rules:

- Order. Cue first, so the sound starts as close to the key press as possible; title second; Hidden_Tick control last, because `start` must see the stored state (3.7) and nothing before it changes the state. The order is fixed and tested with recording fakes: the log of calls for one `light` event is `play("strike")`, `writeTitle("25:00 · Candlewatch")`, in that order, and for `hide` it is `writeTitle(...)`, `hidden.start(now)`.
- Nothing escapes. Each step has its own `try`/`catch`, so an error in step `k` never skips step `k + 1`. A failing `play` does not stop the title write or the hidden start, and a failing `writeTitle` does not stop the hidden start. What is swallowed: any error from `cueFor`, `sound()`, `play`, `titleFor`, `writeTitle`, `hidden.start` and `hidden.stop`. Nothing is logged and nothing is shown (R4.12). What is not swallowed: nothing in `afterStep` re-throws, and it does not catch errors from `step` or `storage.save`, which are outside it (`dispatch` calls it last).
- Why the `catch` is here even though the player and the adapter do not throw. They are written not to (3.3, 3.8), but the property of `dispatch` that a cue or a title can never undo a saved session is worth a second, local guard, and the guard costs one `try` per step. A thrown error in `cueFor` is not expected (it is pure and total); treating it as "no Cue" keeps the title and the tick.
- One Cue per event. `cueFor` returns `Cue | null`, a single value, and `afterStep` calls `play` at most once per call. `dispatch` calls `afterStep` once per `step`. So an event gives at most one sound, and a Transition that could look like two (for example `lit` to `burned-out` with a hide in the same call) is one `phase` pair that maps to one row of the rule table (3.1). The Hidden_Tick's `tick` goes through the same `dispatch`, so it too gives at most one Cue.
- The `hide` and `show` events reach step 4 whatever the phase. `hidden.start` decides if a timer is needed (3.7).
- `sound()` is read inside step 1 at the moment of the Transition (R2.13). The player also holds its own `sound` flag (3.3); the two come from the same setting and `onSettings` updates both before any other event is handled.

The `main.ts` edits, as a numbered list (this is the detail of CR1). The line numbers refer to the file as read for this design; the order, not the line numbers, is what matters.

1. Imports. Add `createAudioPlayer`, `browserAudioFactory` (from `./audio/audio-player`), `armFirstGesture` (from `./audio/gesture`), `titleFor` (from `./page/title`), `createTitleAdapter` (from `./page/title-adapter`), `createHiddenTick` (from `./page/hidden-tick`) and `createAfterStep` (from `./after-step`).
2. Move `let settings = settingsStore.load();` up to just after `const reduced = ...` (D16). Delete it from its old place, between `wireVisibility` and `createInterface`. Nothing between the two places reads `settings`.
3. Right after it, still outside the `if (app)` block: `const player = createAudioPlayer({ factory: browserAudioFactory(), sound: settings.sound });` then `armFirstGesture(document, () => settings.sound, player.unlock);`. The controls do not exist yet, so the capture listeners are registered before any control's handler (R4.16).
4. Next: `const titleAdapter = createTitleAdapter(document);`.
5. Inside `if (app)`, replace the first `state` initialisation with `const loadNow = Date.now();` and `let state: State = step(INITIAL_STATE, { type: "reload", state: storage.load() }, loadNow);`, then `titleAdapter.write(titleFor(state, loadNow));` on the next line (R6.14). This path does not use `dispatch` and never reaches `afterStep`, so it gives no Cue (R2.6, R2.10).
6. Create the Hidden_Tick:
   ```ts
   const hidden = createHiddenTick({
     schedule: (fn, ms) => window.setTimeout(fn, ms),
     cancel: (id) => window.clearTimeout(id),
     clock: Date.now,
     dispatch: (event, now) => dispatch(event, now),
     getState: () => state,
   });
   ```
   `dispatch` is declared two steps below. The arrow function reads it only when it runs, which is after `dispatch` exists, so there is no use before definition (the ESLint config has no `no-use-before-define` rule; TypeScript allows a closure over a later `const`).
7. Create `afterStep`: `const afterStep = createAfterStep({ sound: () => settings.sound, play: player.play, writeTitle: titleAdapter.write, hidden });`.
8. Replace `dispatch` with the version below.
9. Leave `wireVisibility({ target: browserVisibilityTarget(), clock: Date.now, dispatch })` as it is, in the same place: after `dispatch`, before `createInterface`. Its sync `hide` or `show` now goes through `afterStep` (a `hide` on a page that loads hidden starts the Hidden_Tick after the title is written). `src/wiring.ts` and `src/distraction/` are not edited.
10. In `createInterface`, `settings` stays the same argument. `onSettings` (typed `(settings: Settings) => void` in `src/ui/index.ts`; the `next` parameter is inferred, so the callback is written as before) becomes:
    ```ts
    onSettings: (next) => {
      settings = next;
      player.setSound(next.sound);     // turning sound on is a gesture: unlocks inside this click (R4.5)
      settingsStore.save(next);
    },
    ```
    `setSound` runs before `save` so the unlock happens at once in the click and cannot be skipped by a failing save. `setSound` never throws.
11. `frame` is unchanged: it already calls `dispatch({ type: "tick" }, now)`, then paints from `state`. Its title writes now come through `afterStep`.

The resulting `dispatch`:

```ts
const dispatch = (event: Event, now: number): void => {
  const prev = state;
  const next = step(prev, event, now);         // one call of step per event (R1.6)
  if (next !== prev) {
    storage.save(prev, next);
    state = next;
  }
  afterStep(prev, next, event, now);           // Cue, title, Hidden_Tick control; never throws
};
```

`state = next` is assigned before `afterStep` runs, so `hidden.start(now)` and every `getState()` in the Hidden_Tick see the state after the event. `afterStep` is called last, so a failing sound or title can never delay or lose the save (D18).

## Data Models

Nothing in this spec is stored. Every shape below is in memory, is rebuilt at page load and is gone when the page closes. No storage key is added, no field is added to the history, session or settings document, and no document version changes: the history document stays version 1, the session document and the settings document keep their versions, and their stored form is byte-identical before and after this spec for the same inputs (R1.8). The `sound` setting is read from the existing `settings` value in `main.ts`; only the existing settings store writes it.

The table lists each shape, where it is defined, who owns it and how long it lives. "Owner" is the one place that creates and changes it.

| Shape | Defined in | Owner | Lifetime |
|---|---|---|---|
| `Cue` (`"strike" \| "chime" \| "breath"`) | `audio/types.ts` | none: a value returned by `cueFor` and passed to `play` | one call of `afterStep` |
| `CueContext` (`eventType`, `sound`, `now`) | `audio/types.ts` | `afterStep` builds one per event | one call of `afterStep`; never kept |
| `CueSpec`, `Voice` (`OscVoice \| NoiseVoice`), `Envelope` | `audio/types.ts`; values in `audio/specs.ts` | `specs.ts` (constants, `CUE_SPECS`) | module constants: created at import, never changed, deeply equal on every call (R3.5) |
| Noise samples (`Float32Array`) | `audio/noise.ts` | the player builds one per noise voice per play | until its source node ends; not cached |
| Player state (see below) | `audio/audio-player.ts` closure | `createAudioPlayer` | the page's life |
| Gesture arming (three capture listeners) | `audio/gesture.ts` closure | `armFirstGesture` | from `main.ts` start until the first handled gesture |
| Wake_Delay (`number \| null`) | `page/wake.ts` | none: a value returned by `nextWakeMs` | read at each arm; never kept |
| Hidden-tick state (see below) | `page/hidden-tick.ts` closure | `createHiddenTick` | the page's life; the timer inside it lives from `hide` until `show` or the end of the session |
| Title adapter state (see below) | `page/title-adapter.ts` closure | `createTitleAdapter` | the page's life |
| Page_Title (`string`) | none | `titleFor` returns it; the adapter writes it | rebuilt on every `afterStep`; the only copy that outlives a call is `document.title` itself |

### Cue, CueSpec, Voice and CueContext

These are the types of sections 3.1 and 3.2. In short:

- `Cue` is one of three strings. `cueFor` returns one of them or `null` (section 3.1).
- `CueContext` is `{ eventType: Event["type"]; sound: boolean; now: number }`. It holds the setting as it is at the moment of the Transition (R2.13), so a later change of the setting cannot change a decision already made.
- `CueSpec` is plain data: `id`, `durationMs`, `voices`. A `Voice` is an `OscVoice` (waveform, start and end frequency) or a `NoiseVoice` (seed, filter kind, cutoff start and end, Q), each with `startMs` and a list of `[timeMs, gain]` envelope points. It holds no function, no node and no file reference (R3.4). Reduced motion does not enter it (R3.11).
- These values are created once at import and never mutated. The player reads them and builds nodes from them; it does not keep a reference to the spec after the Cue has been built.

### Wake_Delay

`number | null`: a delay in (0, 1000] ms while the phase is `lit` or `paused`, `null` in every other phase (section 3.6). It is a return value and is not stored. The Hidden_Tick uses it as the delay of one `schedule` call and asks again after every `tick`.

### Hidden-tick state

Private to the closure of `createHiddenTick` (section 3.7). Nothing outside reads it except through `isRunning()` and `hasPending()`.

| Field | Type | Meaning |
|---|---|---|
| `running` | `boolean` | true from a `start` that armed a timer until `stop()` or a `tick` that found nothing left to wait for |
| `pending` | `TimerId \| null` | the id of the one armed timer, or `null` |
| `armId` | `number` | a counter that changes at every arm and every stop, so a callback that was already in flight can tell it is stale |

Invariants: at most one timer is pending; `pending !== null` implies `running`; the state is created `running = false`, `pending = null`. It is owned by `main.ts` only in the sense that `main.ts` creates it and `afterStep` calls `start` and `stop`; no other code reads or writes it.

### Player state

Private to the closure of `createAudioPlayer` (section 3.3). `isUnlocked()` tells whether the first field is `unlocked` (for tests); `armFirstGesture` does not read it, it only calls `unlock()`. The other fields are not exposed.

| Field | Type | Meaning |
|---|---|---|
| `state` | `"locked" \| "unlocked" \| "failed"` | `locked` until a handled gesture while sound is on; `unlocked` once the context exists; `failed` for good when the factory returned `null` or threw |
| `sound` | `boolean` | the player's copy of the setting, set by `setSound` and read before every start |
| `context` | `AudioContextLike \| null` | null until the unlock; the only `AudioContext` the page ever has |
| `master` | gain node or `null` | created with the context; holds `MASTER_GAIN` |
| `current` | `{ cueGain, release, stopAll } \| null` | the one Cue that is sounding, or none |
| `held` | one pending request or `null` | the single request that waits for the promise of its own `resume()` call (Decision D19); never a list |

It is created `locked` with no context, so nothing is constructed at page load (R4.1). A request made while `locked` or `failed` is dropped and not remembered (R4.8, R4.14).

### Title adapter state

Private to the closure of `createTitleAdapter` (section 3.8). One field: the last title the adapter knows the document holds, `string | null`, `null` before the first write (`last()` returns it). `write(title)` compares with it and writes only when different. The page's real title lives in `document.title`; this copy exists only to skip equal writes (R6.10, R6.11).

## Section 4: Strings

### 4.1 How `src/strings.ts` changes

`src/strings.ts` as it is now holds these groups: `title` (a string, `"Candlewatch"`), `tagline`, `scene`, `time`, `setup`, `length`, `intent`, `light`, `pause`, `snuff`, `settings`, `status`, `announce` and `region`. It has no `graveyard`, `ghosts`, `count` or `pageTitle` group yet. The key `title` is a top-level string, not a group; `titleFor` reads it for the product name and for the `idle` title, and `index.html` holds the same text (R6.16). There is no second copy.

The `ghosts-and-graveyard` spec adds three groups in its task 1.4 (design 4.7): `count`, `ghosts` and `graveyard` (with `graveyard.card`), with placeholder wording. This spec's tasks do two things to them, and they come after that task:

1. They REPLACE the placeholder values of those groups with the final wording of the Strings_Table (4.2). The keys that the other spec created keep their names; only values change (CR6).
2. They ADD the new keys: the `pageTitle` group, `graveyard.card.stoneLine`, `graveyard.card.stubLine`, `graveyard.card.unnamed` and `graveyard.card.quoted` (Decision D22).

If this spec's tasks ever run before that task 1.4, they create the three groups themselves with the final wording, and the other spec's task then finds the keys present and changes nothing. The order does not matter for the final file; the table below is the file after both.

The top-level groups after both specs:

| Group | Source | Changed by this spec |
|---|---|---|
| `title`, `tagline`, `scene`, `time`, `setup`, `length`, `intent`, `light`, `pause`, `snuff`, `settings`, `status`, `announce`, `region` | `candle-scene`, `controls-and-access` | no. `scene` and `time` are locked by a snapshot test (4.4); the others are final and are not edited (R8.12) |
| `count` (`distraction`, `distractions`) | `ghosts-and-graveyard` | values only: unchanged wording, confirmed final |
| `ghosts` (`overflow`) | `ghosts-and-graveyard` | value only |
| `graveyard` (`door`, `back`, `title`, `graveyardLabel`, `shelfLabel`, `noStones`, `noStubs`, `noIntent`, `itemName`, `carvedDate`, `unknownDate`, `months`, `olderStone`, `olderStones`, `olderDay`, `olderDays`, `more`, `announceOpen`, `announceLeave`) | `ghosts-and-graveyard` | values replaced |
| `graveyard.card` (`planned`, `distractions`, `away`) | `ghosts-and-graveyard` | values replaced |
| `graveyard.card` (`stoneLine`, `stubLine`, `unnamed`, `quoted`) | this spec | new keys |
| `pageTitle` (`lit`, `paused`, `burnedOut`, `snuffed`) | this spec | new group |

The exact key list added or changed by the two specs together is the 33 rows of 4.2 (the `months` row is one key holding twelve names, and `count.distraction` and `count.distractions` are two keys). The file keeps its shape: one exported `STRINGS` object, nested groups, `{name}` placeholders filled by `fill`, `as const` (R8.6). No key is removed. Nothing in `engine/`, `scene/` or `ui/` source is edited by the string changes except the callers named in CR5, CR6 and CR9.

### 4.2 The Strings_Table

Columns: key (under `STRINGS`), final wording, the spec the key came from, and the tone class. The classes follow D12: a state line is a sentence about the room or the watch (short, dry, ends in a full stop); a data label names one datum or one control, plainly, with no figurative wording and no exclamation mark. The "Final Wording" starting table of the requirements is reproduced with its real keys; the last column says "as in Final Wording" unless a decision follows below. `{...}` are placeholders filled by `fill`.

| Key | Final wording | Spec it came from | Tone class |
|---|---|---|---|
| `graveyard.carvedDate` | `{day} {month}` ("10 Nov") | ghosts-and-graveyard R2.11 | data label |
| `graveyard.months` | Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec | ghosts-and-graveyard 4.7 | data label |
| `graveyard.unknownDate` | Unknown date | ghosts-and-graveyard 4.7; **changed** from "Date worn away" (D23) | data label |
| `graveyard.noIntent` | Unnamed watch | ghosts-and-graveyard R4.3; **changed** from "No intent" | data label |
| `graveyard.itemName` | `{intent}, {date}` | ghosts-and-graveyard R7.1 | data label |
| `graveyard.noStones` | Nothing is buried here. | ghosts-and-graveyard R4.9; **changed** from "No stones yet" | state line |
| `graveyard.noStubs` | The shelf is bare. | ghosts-and-graveyard R4.9; **changed** from "No candles on the shelf yet" | state line |
| `graveyard.olderStone` | `{n}` older stone out of sight | ghosts-and-graveyard R8.8; **changed** from "not shown" | data label |
| `graveyard.olderStones` | `{n}` older stones out of sight | ghosts-and-graveyard R8.8; **changed** | data label |
| `graveyard.olderDay` | `{n}` older day out of sight | ghosts-and-graveyard R8.9; **changed** | data label |
| `graveyard.olderDays` | `{n}` older days out of sight | ghosts-and-graveyard R8.9; **changed** | data label |
| `graveyard.more` | +`{n}` more | ghosts-and-graveyard R8.5 | data label |
| `ghosts.overflow` | +`{n}` | ghosts-and-graveyard R9.13 | data label |
| `graveyard.card.stoneLine` | Here lies `{intent}` (rendered `Here lies "write the report"`; the quotes come from `card.quoted`, D22) | sound-and-title R8.13 | state line (flavour first line) |
| `graveyard.card.stubLine` | Burned to the end: `{intent}` | sound-and-title R8.13 | state line (flavour first line) |
| `graveyard.card.unnamed` | an unnamed watch | sound-and-title R8.13 | state line (fills `{intent}` in the two lines above) |
| `graveyard.card.quoted` | "`{text}`" (straight double quotes around the text) | added here: carries the quotes of R8.13 (D22) | data label |
| `graveyard.card.planned` | Length: `{time}` | ghosts-and-graveyard R5.1; **changed** from "Planned: {time}" | data label |
| `graveyard.card.distractions` | Distractions: `{n}` | ghosts-and-graveyard R5.1 | data label |
| `graveyard.card.away` | Time away: `{time}` | ghosts-and-graveyard R5.1 | data label |
| `graveyard.door` | Walk out to the graveyard | ghosts-and-graveyard R7.11; **changed** from "Open the graveyard" | data label (control name) |
| `graveyard.back` | Back to the room | ghosts-and-graveyard 4.7 | data label (control name) |
| `graveyard.title` | The graveyard | ghosts-and-graveyard R7.9 | data label (heading) |
| `graveyard.graveyardLabel` | Graveyard | ghosts-and-graveyard R7.5 | data label |
| `graveyard.shelfLabel` | Shelf | ghosts-and-graveyard R7.5 | data label |
| `graveyard.announceOpen` | The graveyard. Quiet. | ghosts-and-graveyard R7.10; **changed** from "The graveyard." | state line (announcement) |
| `graveyard.announceLeave` | Back in the room. | ghosts-and-graveyard R7.10 | state line (announcement) |
| `count.distraction` | `{n}` distraction | ghosts-and-graveyard R10.1 | data label |
| `count.distractions` | `{n}` distractions | ghosts-and-graveyard R10.1 | data label |
| `pageTitle.lit` | `{time} · {name}` | added here (sound-and-title R6.2) | data label (tab title) |
| `pageTitle.paused` | `{time} paused · {name}` | added here (sound-and-title R6.3) | data label (tab title) |
| `pageTitle.burnedOut` | Morning · `{name}` | added here (sound-and-title R6.4) | data label (tab title) |
| `pageTitle.snuffed` | Dark · `{name}` | added here (sound-and-title R6.5) | data label (tab title) |

Rows added here and not in the Final Wording table of the requirements: `graveyard.card.quoted` (reason: the quote rule of R8.13, D22). The `pageTitle.*` rows are in that table. No other key of the ghosts-and-graveyard design 4.7 is missing from it: its list (`count.*`, `ghosts.overflow`, `graveyard.door` to `graveyard.announceLeave`, `graveyard.card.*`) was compared key by key with the table above and every key has a row. The `months` row is one key (an array of twelve names).

Checks of R8.4 and R8.5, done on the wording above:

| State line or announcement | Length | Ends in a full stop |
|---|---|---|
| Nothing is buried here. | 23 | yes |
| The shelf is bare. | 18 | yes |
| The graveyard. Quiet. | 21 | yes |
| Back in the room. | 17 | yes |
| Here lies "…" / Burned to the end: … | the first line holds the user's intent, so its length is the intent's; the fixed part is 10 characters (12 with the two quotes) and 19 characters. It is a card line, not a state line or announcement, and it ends where the intent ends (R8.14 forbids trimming) | not required: it carries user text unchanged |
| `unnamed` | 16 | no full stop, because it is spliced inside a line; the lines it fills end with it unchanged |

The existing `status` and `announce` strings are final and not changed here. Read from `src/strings.ts` as it is now, every one is at most 60 characters (after filling) and ends in a full stop, except `status.pauseLeft` ("Pause left {time}"), which is a data-bearing status label. The strings test (4.4) therefore checks the state-line list below with `status.pauseLeft` left out.

Data labels: each states only the datum it names (a date, a count, a length, a time away, a heading, a control), uses no exclamation mark, and shows the datum as stored (R8.5). "Unnamed watch" is a plain label for a missing intent. "out of sight" says where the hidden items are, not a feeling; it replaces "not shown", which could be read as "deleted", and it is the wording the requirements fixed.

Decisions for wording that differs from the Final Wording table or from the ghosts-and-graveyard placeholder (R8.3). The Final Wording table itself is reproduced without change, with two exceptions, D22 (the stone line's template text; its rendered wording is unchanged) and D23 (`unknownDate`):

- **D22. The quotes of the stone line are a separate template.** The Final Wording table writes the stone line as `Here lies "{intent}"` and the unnamed form without quotes. A single template with quotes cannot give the second form: filling `{intent}` with "an unnamed watch" would show `Here lies "an unnamed watch"`, which would look like a quoted intent. So the rendered wording of R8.13 is kept exactly, but built from two keys: `card.stoneLine` = `Here lies {intent}` and `card.quoted` = `"{text}"`. The caller fills `{intent}` with `fill(quoted, { text: intent })` when the intent is not null, and with `card.unnamed` when it is null (4.3). Reason: the quotes belong only to real user text. The visible result for every input is identical to the table; only the key set differs (one added key, `card.quoted`). The test of 4.4 asserts the rendered strings of R8.13, not the template text.
- **D23. `graveyard.unknownDate` is "Unknown date", not "Date worn away".** "Date worn away" is figurative and the line is a data label that sits inside an Item's accessible name (`{intent}, {date}`); R8.5 asks data labels to be plain and exact, and a screen-reader user hears the name as "write the report, Date worn away", which says less than "Unknown date". The dry tone goes to the empty-state lines (D12), not to a fallback for missing data. This keeps the ghosts-and-graveyard placeholder value; it is recorded because it differs from the requirements' Final Wording table (R8.3).
- **D24. The wording that changes from the ghosts-and-graveyard placeholders is the table's, not a new choice.** `noStones`, `noStubs`, `noIntent`, `olderStone(s)`, `olderDay(s)`, `card.planned`, `door` and `announceOpen` take the Final Wording values. `card.planned` becomes "Length:" because the datum is the length of the focus session, and "Planned" implied a plan that the stored entry does not record. `noIntent` is "Unnamed watch" and `card.unnamed` is "an unnamed watch": the same words, a capital for the stone face and a lower case for the middle of a sentence. They are two keys because a capital cannot be derived from a lower case string in code without a transform, and the strings file holds all text.
- **D25. Page titles are data labels.** `pageTitle.*` are tab strip text, not sentences, so R8.4's full stop does not apply; "Morning" and "Dark" are the one-word state names of the phase, the same words the room uses. The separator " · " is part of the templates (3.5).

### 4.3 How the first card line is built

`cardLines(item)` in `src/graveyard/text.ts` (ghosts-and-graveyard design 3.3) keeps returning exactly five lines in the same order (R5.1, CR9). Only the first line changes. Today it is "the intent or the placeholder". It becomes a kind-specific flavour line built from the entry's kind (a stone for a `snuffed` entry, a stub for a `burned-out` one):

```ts
// src/graveyard/text.ts (inside cardLines; pure)
const intent = entry.intent;                                   // string | null, from the history entry
const named = intent !== null && intent !== "";                // an empty string is "no intent", as in stoneIntent (R4.3)
const subject = named
  ? (kind === "stone" ? fill(STRINGS.graveyard.card.quoted, { text: intent }) : intent)
  : STRINGS.graveyard.card.unnamed;
const first = fill(
  kind === "stone" ? STRINGS.graveyard.card.stoneLine : STRINGS.graveyard.card.stubLine,
  { intent: subject },
);
```

The exact fill calls and the strings they give:

| Kind | Intent | Calls | Result |
|---|---|---|---|
| stone | `write the report` | `fill(quoted, { text })` then `fill(stoneLine, { intent: that })` | `Here lies "write the report"` |
| stone | null (or empty) | `fill(stoneLine, { intent: unnamed })` | `Here lies an unnamed watch` (no quotes) |
| stub | `write the report` | `fill(stubLine, { intent })` | `Burned to the end: write the report` (no quotes) |
| stub | null (or empty) | `fill(stubLine, { intent: unnamed })` | `Burned to the end: an unnamed watch` |

Rules:

- The quotes rule: the stone line puts quotes around the intent and not around the unnamed text; the stub line never has quotes (R8.13). The quotes come from `card.quoted`, so the code holds no quote literal.
- The intent is passed to `fill` as a value. `fill` replaces in one pass with a function, so the value is never searched again and `$&`, `{n}` or `{intent}` inside the intent stay as typed. The intent is not trimmed, cut, escaped or case-changed (R8.14), so `ghosts-and-graveyard` P18 (the card contains the exact intent) still holds; its check searches for the intent as a substring of the first line.
- The other four lines are those of the ghosts-and-graveyard design: the Carved_Date (`carvedDate`), `Length: {time}` (`card.planned`, with the minute words of `time`), `Distractions: {n}` (`card.distractions`) and `Time away: {time}` (`card.away`). `cardLines` keeps five lines; a null intent changes the first line only, and the null-intent card line is no longer `stoneIntent`'s `noIntent` text (CR9).
- Not changed: `stoneIntent` (still the intent, or `STRINGS.graveyard.noIntent`) for the Stone face and `itemName`. The Item's accessible name stays `{intent}, {date}` and never contains "Here lies" or "Burned to the end" (R8.15, D13). A test asserts it for both kinds, with and without an intent.
- `text.ts` stays pure: it imports `STRINGS`, `fill` and its siblings only.

### 4.4 Strings tests

`src/strings.test.ts` today checks the tagline and the five `scene` names (no digits, all different, no timer word). It does not yet check that keys are used, or placeholders filled, or the `time` group; the checks below are additions made by this spec's tasks (R8.7, R8.12). They sit in `src/strings.test.ts` and in one helper that reads the shipped source.

| Test | What it does | Fails when |
|---|---|---|
| Every key is used | Walks `STRINGS` to its leaf keys (strings and the `months` array), reads every shipped `.ts` file under `src/` except `strings.ts` and test-only files (`*.test.ts`, `test-kit.ts`, `fake-*.ts`, `*-kit.ts`, `src/hosting/`), and requires each leaf key's dotted path to appear in some file, either whole (`STRINGS.status.lit`) or through a group access (`STRINGS.announce[...]`, `STRINGS.scene[mode]`, `STRINGS.graveyard.card.` plus the leaf) that the helper maps to the group. A group read by a computed key is on an explicit list in the test, with the keys it covers | a leaf key has no use; the message names the key |
| No timer word | Every leaf value, lower-cased, does not contain the trademarked word (R1.11, R8.7). The test file holds the word only in a form built at run time from fragments, so the test source itself passes the scan | a value contains it; the message names the key |
| Each placeholder is filled | For each template, finds its placeholders with the regex `\{([A-Za-z0-9_]+)\}` and looks at its callers (the same source scan) for a `fill(<key>, { ... })` that names every one. Templates and their callers are listed in the table below, so a new placeholder without a caller fails | a placeholder has no filler; the message names the key and the name |
| State lines | The keys of the state-line list (`graveyard.noStones`, `noStubs`, `announceOpen`, `announceLeave`, and every leaf of `status` and `announce` except `status.pauseLeft`) have length at most 60 and end with "." | one is longer or has no final stop |
| Data labels | The data-label list has no "!" (R8.5), and none of the `pageTitle` templates contains the intent or the word "intent" | a violation; names the key |
| Rendered card lines | The four rows of 4.3 are produced through the real `cardLines` and compared with the literal strings of R8.13 | a wording or quote difference |
| Locked groups | A snapshot (`toEqual`, not a stored file) of `STRINGS.scene` and `STRINGS.time`, written out in the test as literals: the five scene names and the nine time strings as they are in `src/strings.ts` today | any value differs (R8.12) |
| No product name | No leaf value contains a trademark or logo name; the test holds a short list of names and the product name `Candlewatch` is allowed | a value contains one (R8.8) |
| Title forms | `titleFor` for each phase against the forms of R6.1 to R6.5, with the templates read from `STRINGS` | a form differs |
| Months | `STRINGS.graveyard.months` has twelve non-empty three-letter entries in calendar order | not so |

The placeholder table. "Filler" is the function that fills it; the strings test lists the same pairs.

| Template (key) | Placeholders | Filler |
|---|---|---|
| `pageTitle.lit` | `time`, `name` | `titleFor` |
| `pageTitle.paused` | `time`, `name` | `titleFor` |
| `pageTitle.burnedOut` | `name` | `titleFor` |
| `pageTitle.snuffed` | `name` | `titleFor` |
| `graveyard.carvedDate` | `day`, `month` | `formatCarvedDate` |
| `graveyard.itemName` | `intent`, `date` | `itemName` |
| `graveyard.olderStone`, `olderStones` | `n` | `stonesCountLine` |
| `graveyard.olderDay`, `olderDays` | `n` | `daysCountLine` |
| `graveyard.more` | `n` | `moreText` |
| `ghosts.overflow` | `n` | the ghost layer's overflow mark |
| `graveyard.card.stoneLine`, `stubLine` | `intent` | `cardLines` |
| `graveyard.card.quoted` | `text` | `cardLines` |
| `graveyard.card.planned` | `time` | `cardLines` |
| `graveyard.card.distractions` | `n` | `cardLines` |
| `graveyard.card.away` | `time` | `cardLines` |
| `count.distraction`, `count.distractions` | `n` | `countWords` |
| existing: `time.*`, `status.pauseLeft`, `status.lengthRange`, `announce.*`, `length.preset`, `intent.hint`, `intent.count`, `intent.overLimit` | as in `src/strings.ts` | their current callers in `src/ui/` |

`card.unnamed`, `noIntent`, `unknownDate`, `noStones`, `noStubs`, `door`, `back`, `title`, `graveyardLabel`, `shelfLabel`, `announceOpen` and `announceLeave` hold no placeholder.

## Section 5: Accessibility

No cue is the only signal of anything. Each of the three state changes a cue marks is drawn by the scene, announced by the live region and written into the tab title in the same engine step, whether sound is on or off. Sound adds a signal; it takes none away (R7.1).

### 5.1 Cue, drawing, announcement and title

The scene facts are read from `src/scene/model.ts`: the flame mode is `unlit` in `idle`, `steady` or `guttering` in `lit`, `paused` in `paused` and `smoke` in both `burned-out` and `snuffed`; the dawn value is 1 only in `burned-out`. The announcements are the keys of `STRINGS.announce` chosen by `stateChangeMessage` in `src/ui/announcer.ts`. This spec adds no announcement key and edits neither file (R7.2).

| Cue | State change | Drawn (scene) | Announced (live region key and text) | Title after the change |
|---|---|---|---|---|
| `strike` | `idle`, `burned-out` or `snuffed` to `lit`: the wick catches | the flame mode goes from `unlit` or `smoke` to `steady`; the flame, the wax at full height and the pool of light appear | `announce.lit`: "The wick catches. {time} left." | `25:00 · Candlewatch` |
| `chime` | `lit` or `paused` to `burned-out`: the watch is over | the flame goes out in `smoke` and the dawn value becomes 1, so the room's window lightens; the wax is at its end | `announce.burnedOut`: "The watch is over. Morning." | `Morning · Candlewatch` |
| `breath` | `lit` or `paused` to `snuffed`: the flame is put out, by the user or by the pause limit | the flame goes out in `smoke` with the dawn value 0, so the room stays dark and the wick smokes | `announce.snuffed`: "The candle is out." | `Dark · Candlewatch` |

The same change is also stated in the status line under the time text (`status.lit`, `status.burnedOut` or `status.cools`, `status.snuffed`) and in the scene's accessible name (`scene.steady`, `scene.smoke`), which is a different string from the live region and carries no time. Those are unchanged.

Cue to drawn to announced, as a compact table (R7.1, R7.6):

| Cue | Drawn | Announced |
|---|---|---|
| `strike` | flame lit, steady | `announce.lit` |
| `chime` | smoke and dawn | `announce.burnedOut` |
| `breath` | smoke, no dawn | `announce.snuffed` |

Points that follow from the code:

- A break after a burned-out session starts with the `chime` and has no cue of its own; `status.cools` is the text for it, unchanged (R2.9).
- No cue exists for pause, resume, a milestone or a ghost. Those changes are drawn and announced as before (`announce.paused`, `announce.resumed`, `announce.q75` and the rest) and are silent (R7.6, Out of Scope).
- A `restored` or `paused` announcement after a reload has no cue, because the Reload_Settle gives none (R2.6). A candle that burned out while the page was closed shows the dawn and says nothing new, as today.
- A hidden tab. The Hidden_Tick settles the state, may play the `chime` or the `breath` and writes the title; it does not paint and the interface does not announce while hidden, because `ui.update` runs only in the Visible_Loop (R5.20). On return the first frame paints the state and the announcer says the message for the new phase once, from its own memory of the last phase it saw. So a screen reader hears the dawn or the dark once, on return, and the tab title and the sound were the signals while away. The announcement count is the same as without this spec (R5.19, `controls-and-access` R9.4).

### 5.2 Reduced motion

`prefers-reduced-motion: reduce` changes the scene only: no flicker, no drift, no running smoke (`animateSmoke` is false). The smoke is still drawn as a still wisp, the dawn is still drawn by colour and brightness, and the flame is still drawn lit or out, so every state a cue marks stays visible by shape, colour and text (`scene.md`, R7.7). The cue specs are deeply equal in both settings (R3.11) and `cueFor` does not read the preference: sound is not motion. The same triggers, the same order and the same sound setting behaviour apply with reduced motion on (E8). The title and the announcements do not depend on motion at all.

### 5.3 The sound switch

The sound switch of the settings panel is unchanged: its name, its on and off text and its keyboard behaviour stay as in `controls-and-access` R11.2 (`settings.sound`, `settings.on`, `settings.off`). It is the only sound control; there is no volume control and no second switch (R7.3, R7.5). The change is its effect: turning it on is a gesture and unlocks audio inside that click (R4.5); turning it off silences a sounding cue within 50 ms. It sends no engine event, plays no cue, and changes neither the timer nor the live region (R2.14). The live region text for a state change is identical with sound on and off (R7.2).

### 5.4 The page title as assistive information

The page title is the name of the tab or the window. Assistive technology reads it when the tab or window gets focus, and a task switcher or a tab strip shows it, so it gives a person away from the page the time left: `12:31 · Candlewatch` while lit, `12:31 paused · Candlewatch` while paused, `Morning · Candlewatch` or `Dark · Candlewatch` at the end (R7.9). It adds to the Time_Text and does not replace it: the Time_Text, the scene's name and the live region are unchanged, and `titleFor` takes its time from `formatTime`, so both always agree (R6.7). The title holds no intent (R6.9), so nothing the user typed is read out by the tab strip or shown in a window list.

Does a title that changes every second spam a screen reader? No. `document.title` is not a live region. Screen readers do not announce a title change while the user is working in the page; they read the title when the window or tab receives focus or when the user asks for it. So the once-per-second update (at most one write per whole second of time left, R6.11) is not announced in the page. In a tab strip the text is repainted, which is what the user wants, and some browsers may refresh the tab's accessible name each time, which is a quiet change without speech. The update rate is acceptable: it is no faster than the Time_Text changes, the adapter skips equal writes, and the pause title does not change at all while the pause lasts (3.5). The announcements that matter, the milestones and the end, still go only through the live region at the bounded rate of `controls-and-access` R9.4, which this spec does not touch.

### 5.5 No sound indicator, focus unchanged

- No visible sound indicator is added and no text says that a sound played or is about to play. The live region does not mention sound. Nothing is added to the scene, because nothing in the costume would map to it (`product.md`).
- Focus does not move. The player, the adapter, the Hidden_Tick and `afterStep` call no `focus()`, add no focusable element and change no `tabindex`. The Tab order, the key map, and the focus position after each action are identical to before this spec, with sound on and off (R7.8). The first-gesture listeners are on the document in the capture phase and call neither `preventDefault` nor `stopPropagation`, so the key press that unlocks audio still reaches the controls unchanged.
- The Graveyard_View does not change the cues or the title: the phase decides both (R6.18).

### 5.6 What is not claimed

This design reasons from the code and the requirements. Whether a given screen reader speaks the changing title on focus, or how a given browser refreshes a tab's accessible name, depends on the product, and full validation of the page needs manual testing with assistive technologies and expert review. The Playwright checks (E7, E8) and the Costume_Reviewer check that the visible and textual signals are present, not how any one product speaks them.

## Section 6: Change requests

### 6.1 Who changes what, and when

This spec edits no other spec and no source file in the session that wrote it. Its only files are in `.kiro/specs/sound-and-title/`. The table in 6.2 lists every change that other specs and files need. It is a hand-over, not a diff that has been applied.

- The first build task of this spec's `tasks.md` applies the table to the other spec documents and to the source files, in the way task 1 of `ghosts-and-graveyard` applied its design 6.1 to `controls-and-access`: read each target first, change only what the row names, and record in the task's result which rows were applied and which passages changed. Rows marked "doc" change a spec document, rows marked "code" change source or tests, rows marked "this spec" change files the spec owns anyway.
- Rows marked "steering" are `.kiro/steering/` files (CR7 and CR15). They are applied by Kiro in the wrap-up task (task 27.2 of `tasks.md`), last, so that `structure.md` lists the files as they exist on disk; no earlier task edits `.kiro/steering/`.
- No row changes the engine, the scene model, the stored documents or `render.yaml` (CR8). No row edits `KIRO_USAGE.md`: its entries are written by the checkpoint tasks (5, 12 and 18) and by the wrap-up (task 27.2), as R9.10 says.
- Rows CR1 to CR9 are the nine change requests of the requirements, adjusted to this design where it differs (CR3 only). CR10 to CR18 are added by this design.

### 6.2 The change-request table

| ID | Target (spec or file) | Exact change | Why | Requirement |
|---|---|---|---|---|
| CR1 | doc: `controls-and-access` requirements R1.2 (the sentence about the one `dispatch` that runs `step` and `save`) and design section 5 (the `dispatch` in the `main.ts` code block, step 3 of the wiring order) | R1.2: after "runs `step` and `save`" add "and then calls the post-step hook (`afterStep`) of `sound-and-title`, which chooses the Cue, writes the page title and starts or stops the Hidden_Tick". Design 5: the `dispatch` block becomes the one of section 2.3 and 3.9 here (`const prev = state; const next = step(prev, event, now); if (next !== prev) { storage.save(prev, next); state = next; } afterStep(prev, next, event, now);`). The sentence "a state that did not change is not saved" stays true. | `dispatch` stays the one path in, and gains one call that runs for every event, changed or not (D17). | R1.6, R2.1 to R2.8 |
| CR2 | doc: `controls-and-access` requirements R11.7 (the sentence "Sound and ghosts have no effect in this spec"), Out-of-scope bullet "Sound itself and the page title, including the chime and the sound toggle's effect", Decision Q6; design 11.2 (the sentence "nothing plays here ... `sound-and-title` reads `settings.sound`") | R11.7: "no effect in this spec" is kept for ghosts only; for sound write "`sound-and-title` makes the setting decide whether Cues play: it is read at the moment of each Transition, and turning it on is a First_Gesture". Add that changing either setting still sends no engine event and changes neither the timer nor the distraction count. Out-of-scope bullet and Q6 and design 11.2: add "implemented by `sound-and-title`" and change nothing else; Q6 keeps "nothing plays before the first user gesture". The result text of its task 20 (a dated record) is not edited. | The setting that was stored and unused now has an effect; the old wording would be false. | R2.7, R2.13, R2.14, R4.5, R7.4 |
| CR3 | doc: `controls-and-access` requirements R12.1 and R12.2, design section 5 step 4 (visibility). Adjusted from the requirements' "on `visibilitychange`" to D15 | `wireVisibility`, `syncVisibility` and `watchVisibility` are not edited and still send `hide` and `show` through `dispatch`. Add one sentence to R12.1: "The Hidden_Tick of `sound-and-title` is started by `afterStep` after a `hide` and stopped after a `show`; no second `visibilitychange` listener is added". The startup sync of R12.2 is unchanged and now also starts the Hidden_Tick for a page that loads hidden. | Starting the timer inside `dispatch` after `step` makes the order (engine first, timer second) true by construction, and needs no second listener (D15). | R5.12, R5.15 to R5.17 |
| CR4 | doc: `controls-and-access` requirements R7.7 and design 3.1 (the bullet "`formatTime` is exported for `sound-and-title`") and 7.1 (the bullet "It is the same value the page title will show") | Mark as fulfilled: "read by `titleFor` in `src/page/title.ts`; behaviour unchanged". No code change; `formatTime` and `fill` keep their signatures. | `formatTime` gets its second reader, and the docs said a later spec would be the reader. | R6.7, R6.8 |
| CR5 | doc: `ghosts-and-graveyard` requirements R2.11 (Carved_Date), R4.3 and R5.2 (null-intent line), R4.9 ("No stones yet" / "No candles on the shelf yet"), R5.1 (the card lines), R8.5 ("+n more"), R8.8 and R8.9 ("not shown" examples), R7.11 (Door name) and the Open Questions at the end ("Carved_Date wording", "Overflow_Mark wording", "Count_Line wording", "Empty-state wording", "Null-intent placeholder") | Replace the placeholder wording and examples with the Strings_Table of section 4.2: "10 Nov" stays; "Nothing is buried here." and "The shelf is bare."; "{n} older stones out of sight" and "{n} older days out of sight" (singular forms too); "Unnamed watch"; the first card line is a stone or stub flavour line (R8.13 of this spec). Move the five wording Open Questions to resolved with "finalised by `sound-and-title`, section 4.2". The questions S, D, K and G stay open. Remove the words "placeholder" and "to be finalised" from the passages above. | The wording is now final and the requirements must not describe it as temporary. | R8.1 to R8.3 |
| CR6 | doc and code: `ghosts-and-graveyard` design 4.7 (the `STRINGS` block and its opening sentence "Every wording is a placeholder"), the comment at design 348 ("38 older stones not shown"), design 296 (the word "placeholder" before `"{day} {month}"`), and tests `src/graveyard/text.test.ts` and any other test that quotes these strings, and the literals in E3 and E6 (design 841, 844) | Values change to: `door` "Walk out to the graveyard"; `noStones` "Nothing is buried here."; `noStubs` "The shelf is bare."; `noIntent` "Unnamed watch"; `olderStone` "{n} older stone out of sight"; `olderStones` "{n} older stones out of sight"; `olderDay` "{n} older day out of sight"; `olderDays` "{n} older days out of sight"; `card.planned` "Length: {time}"; `announceOpen` "The graveyard. Quiet.". These ten values are the whole change. The other keys keep their values: `unknownDate` stays "Unknown date" (D23) and `count.*`, `ghosts.overflow`, `more`, `card.distractions`, `card.away`, `back`, `title`, `graveyardLabel`, `shelfLabel`, `itemName`, `carvedDate`, `months`, `announceLeave` are unchanged. Keys are added: `card.stoneLine`, `card.stubLine`, `card.unnamed`, `card.quoted`. Opening sentence: "Final wording, set by `sound-and-title` (section 4.2)". Tests and the E3 and E6 literals are updated to the same values. | The ghosts-and-graveyard strings were written as placeholders for this spec to finalise. | R8.1, R9.7 |
| CR7 | doc, steering (task 27.2): `.kiro/steering/structure.md` | In the first paragraph add `src/audio/` and `src/page/` to the implemented folders (the `sound-and-title` spec). In the tree: replace the `audio/` line "Web Audio cues" with the list: types.ts, cue.ts, specs.ts, noise.ts, audio-player.ts (the only AudioContext user), gesture.ts, and the test-only fake-audio-context.ts and test-kit.ts. Add `page/` with title.ts, wake.ts, title-adapter.ts (the only writer of document.title), hidden-tick.ts (the only background timer), and the test-only fake-timer.ts and test-kit.ts. Add `after-step.ts` next to `main.ts` (composes the Cue, the title and the Hidden_Tick control for `dispatch`). In Boundaries add: `src/audio/` imports only the engine's `index.ts`, `src/strings.ts` and its own files; `src/page/` imports only the engine's `index.ts`, `src/strings.ts`, `src/ui/format.ts` and its own files; `src/engine/` imports nothing from `page/` (the list already names `audio/`); `after-step.ts` receives the player, the adapter and the Hidden_Tick as arguments. Task 27.2 makes this edit, done by Kiro, listing the files as they exist on disk. | The structure file is the map of the repo and must name the new folders and their import rules. | R1.4, R1.5 |
| CR8 | `session-engine`, `distraction-tracking`, `candle-scene`, `hosting` | None. The engine, the scene and `render.yaml` do not change. If P9 finds that a `tick` while hidden changes a hide span, that is an engine finding to raise (Risk K1), not a change made here. | The Hidden_Tick sends only the engine's existing `tick`. | R5.14, R5.18 |
| CR9 | doc and code: `ghosts-and-graveyard` design 3.3 (`cardLines`, item 1 of the list "the intent or the placeholder", and the signature comment at design 347), Property P18 (design 962) and its task 3.12, task 3.8 and `src/graveyard/text.ts` | `cardLines` still returns five lines. Line 1 becomes the kind-specific flavour line built as in section 4.3 here (stone: `Here lies "{intent}"`; stub: `Burned to the end: {intent}`; null or empty intent: the `card.unnamed` text, with no quotes). Lines 2 to 5 are unchanged. `stoneIntent` and `itemName` are unchanged: the Stone face and the accessible name stay the intent (or `noIntent`) plus the date and never contain "Here lies". P18 becomes: "five lines; the first contains the exact intent as a substring when the intent is not null and not empty, and `card.unnamed` when it is; the Item name equals the intent (or `noIntent`) and the date joined by the template". The null-intent card line is therefore no longer the `noIntent` text. | The first card line carries the flavour and the accessible name stays plain (D13). | R8.13 to R8.15 |
| CR10 | code: `src/main.ts` | The eleven edits of section 3.9, in order: (1) add the seven imports; (2) move `let settings = settingsStore.load();` above `dispatch` (D16); (3) create `player` with `browserAudioFactory()` and call `armFirstGesture(document, () => settings.sound, player.unlock)` before any control exists; (4) create `titleAdapter`; (5) split the first `state` initialisation into `loadNow`, the `reload` step and one `titleAdapter.write(titleFor(state, loadNow))`; (6) create `hidden` with `window.setTimeout`, `window.clearTimeout`, `Date.now`, `dispatch` and `getState`; (7) create `afterStep`; (8) replace `dispatch` with the version that calls `afterStep` last; (9) leave `wireVisibility` where it is; (10) `onSettings` assigns `settings`, calls `player.setSound(next.sound)` and then saves; (11) leave `frame` unchanged. `src/wiring.ts`, `src/distraction/` and `src/ui/` are not edited. If `ghosts-and-graveyard` task 16 has already edited `main.ts` (view state, `createGhostLayer`, `createGraveyard`), these edits are made on top of its version and keep its lines. | The wiring is the only place the pieces meet. | R1.6, R1.7, R2.10, R4.16, R5.12, R6.14 |
| CR11 | this spec: `src/strings.ts` and `src/strings.test.ts` | `strings.ts`: add the `pageTitle` group (`lit`, `paused`, `burnedOut`, `snuffed`), the keys `graveyard.card.stoneLine`, `stubLine`, `unnamed`, `quoted`, and set the ten values of CR6 (if `ghosts-and-graveyard` task 1.4 has not run, create the `count`, `ghosts` and `graveyard` groups with the final values; see CR18). Nothing else in the file changes (R8.12). `strings.test.ts`: add the tests of section 4.4 (every key used, no timer word, placeholders filled, state lines at most 60 characters and ending in a full stop, data labels without "!", rendered card lines, locked `scene` and `time` groups, no product name, title forms, months). The existing `scene` tests stay. | The strings are this spec's own deliverable. | R8.2, R8.4 to R8.8, R8.12 |
| CR12 | code: `src/ui/strings.test.ts` (it is not this spec's file, so the row is a request) | Its `newKeys()` takes every top-level group except `NOT_THIS_SPEC = {title, tagline, scene}` and, with `ENFORCE_ALL_USED = true`, fails when a key is not used by a file in `src/ui/`. The groups `count`, `ghosts`, `graveyard` (ghosts-and-graveyard) and `pageTitle` (this spec) are used outside `src/ui/`, so adding them would fail that test. Add the four group names to `NOT_THIS_SPEC` (their use is checked by the tests of 4.4 and by the ghosts-and-graveyard strings test instead). This is a finding for `ghosts-and-graveyard` task 1.4 too, which adds three of the groups and does not mention this file. | Without it `npm test` fails the moment the groups exist. | R8.7 |
| CR13 | doc: `ghosts-and-graveyard` tasks 1.4, 3.8, 3.12, 21.1, 22.1 and 25.1 (only those not yet run) | 1.4: "the wording stays a placeholder for `sound-and-title`" becomes "final wording from `sound-and-title` section 4.2"; the allowed placeholder names `n`, `day`, `month`, `intent`, `date`, `time` gain `text` (for `card.quoted`); the new keys of CR6 are added with the groups. 3.8: the literals in the `text.test.ts` description (the null and empty intent line, the five card lines, the counts "38 older stones", the Item name) take the final values; `cardLines` is built as in 4.3. 3.12: P18 as in CR9. 21.1, 22.1, 25.1: any text literal in the E2, E3 and E6 descriptions takes the final value. Nothing else in those tasks changes. If a task is already `[x]`, it is not reopened; this spec's code task edits the code and tests it produced (see CR18). | The tasks quote the placeholder literals. | R8.1, R9.7 |
| CR14 | doc: `candle-scene` requirements R8.6 ("The chime that goes with the dawn belongs to the `sound-and-title` spec") and the Out-of-scope bullet "Sound, including the chime at dawn, and the page title"; `controls-and-access` requirements out-of-scope bullet "Sound itself and the page title" and design 3.1 and 7.1 (see CR2, CR4) | Mark each as fulfilled: append "(done by `sound-and-title`: the `chime` plays at the dawn, `titleFor` writes the page title)". No requirement text is removed and no behaviour of the scene changes. | The pointers to this spec stay true and say so. | R7.1, R7.6 |
| CR15 | doc, steering (task 27.2): `.kiro/steering/tech.md` | Under "Non-negotiable rules" rule 1, add one sentence: "A hidden tab is kept honest by a plain `setTimeout` chain (the Hidden_Tick) that sends `tick` through `dispatch` at most one second apart and no later than the end; browsers may throttle it to about one wake per minute and the design accepts that, because the time always comes from timestamps. No silent audio keep-alive." Rule 6 (sound off until the first user gesture) is unchanged and now implemented. Task 27.2 makes this edit, done by Kiro. | The hidden-tab approach is a technical rule worth stating once where the other timing rules are. | R5.21, R5.23 |
| CR16 | code: `e2e/` existing tests | Read, not rewritten: `live.spec.ts` (line 54) and `smoke.spec.ts` (line 5) assert `toHaveTitle("Candlewatch")` on a fresh page; this stays true because the `idle` title is exactly `STRINGS.title`. `controls-a11y.spec.ts` (line 546) scans `outerHTML + document.title` for the typed intent; it stays true because the title never holds the intent. `settings.spec.ts` (the lit-session test, line 151) clicks the sound switch during a lit session; it now also calls `player.setSound`, which sends no event, so the assertions (timer, phase and stored session unchanged) hold. Those specs run with the real `AudioContext` of the test browser: the first gesture creates it, and the test must not fail on a console warning about autoplay (none is expected, because the context is created inside the gesture). New specs for E1 to E10 are added by this spec's tasks and use the Fake_AudioContext init script. | The existing tests must stay green, and the reasons are written down so a failure is read correctly. | R9.3, R7.8 |
| CR17 | code: `docs/screenshots` and `e2e/screenshots.spec.ts` | The `candle-*` screenshots (21 files) are NOT affected by this spec: the title is not part of a page screenshot, sound is not drawn, and no visible element of the room changes. They are not retaken. At the time of writing `docs/screenshots/` holds only those 21 files; the `ghosts-*` and `graveyard-*` files do not exist yet (they are taken by `ghosts-and-graveyard` task 26.3). Affected once they exist: `graveyard-small-desktop`, `graveyard-small-phone`, `graveyard-large-desktop`, `graveyard-large-phone`, `graveyard-large-desktop-reduced` (empty-state lines, count lines "out of sight", the Overflow text "+n more", the heading and the date), and `graveyard-card-keyboard-desktop`, `graveyard-card-keyboard-phone`, `graveyard-card-touch-desktop`, `graveyard-card-touch-phone` (the five card lines, the first of them new). The `ghosts-*` images are not affected: the Overflow_Mark "+9" keeps its value. If the Door shows its name as visible text, the shots that show it are affected too; the task checks this by looking at the image, not by assumption. Affected images are retaken and looked at (R9.7, E11). | Screenshots must match the final wording. | R9.7, E11 |
| CR18 | sequencing: this spec and `ghosts-and-graveyard` | Decision D30: run `ghosts-and-graveyard` first, then this spec. This spec's build depends on the strings groups of `ghosts-and-graveyard` task 1.4 and on its `text.ts` (task 3.8) and P18 (task 3.12), because CR9 changes `cardLines`. So (a) the rows CR6, CR9, CR11 (the ghosts-group part) and CR13 are applied only after the matching ghosts task is `[x]`; (b) this spec's first task then edits wording in the code and tests the ghosts spec produced, and retakes the affected screenshots of CR17; (c) the pure and effect modules of `src/audio/` and `src/page/` do not depend on the ghosts spec and may be built in any order, but `main.ts` (CR10) is edited after `ghosts-and-graveyard` task 16 so that the two sets of `main.ts` edits do not collide. Single-pass alternative, if the owner prefers it: apply CR5, CR6, CR9 and CR13 to the ghosts documents before any ghosts build task runs, so the ghosts spec builds with the final wording and its screenshots need no retake; this spec's first task then only checks that the values are in place. If this spec's tasks run before ghosts task 1.4, they create the three groups with the final values, and task 1.4 then finds the keys present (section 4.1). | Two specs edit the same strings, `text.ts` and `main.ts`; the order decides who rebases onto whom. | R8.1, R9.7 |

## Error Handling

Every failure of sound, title or the background timer is silent and leaves the timer, the scene, the stored documents and the live region as they were. Nothing here shows the user an error (R4.12). The time never depends on any of these paths, because it comes from timestamps (`tech.md` rule 1).

| Situation | Behaviour | Requirement |
|---|---|---|
| `AudioContext` is missing (no `window.AudioContext`) | `browserAudioFactory()` returns null; `unlock()` makes the player `failed`; every later `play`, `unlock` and `setSound` does nothing. The first-gesture listeners are removed. No `webkitAudioContext` fallback (D21). | R4.12 |
| `new AudioContext()` throws (blocked by policy, too many contexts) | The factory's `try`/`catch` returns null; same as above: `failed` for the page's life, no retry. | R4.12 |
| The factory itself throws (a bad injected factory) | `unlock()` catches it, sets `failed`, returns false. The gesture handler still removes its listeners. | R4.12, R4.13 |
| The factory returns null | `failed`, as above. | R4.12 |
| `resume()` rejects (autoplay policy, interrupted by the system) | The rejection is swallowed with a no-op `catch`. In `unlock()` the player stays `unlocked`. For a held request (rule 5 of `play`) the Cue is dropped. The next `play` calls `resume()` again once. | R4.9 |
| `resume()` settles but the state is still `suspended` | The Cue is dropped, not queued. The next request tries `resume()` once more; a later gesture or Light can succeed. | R4.9 |
| `resume()` throws synchronously (a fake or an old engine) | The whole `play` body is inside one `try`; the throw sets `failed` and releases what was built. `unlock()` does the same. Silent from then on. | R4.12 |
| The context state is `closed` (the browser closed it, or the page was frozen and discarded the context) | Decision D26: `closed` is terminal. `play` finds the state `closed`, sets `failed` and drops the Cue; it does not call `resume()` (a closed context rejects it) and does not create a second context, because a new context needs a new gesture the player does not track. The page stays silent for its life; the title, the scene and the timer are unaffected. | R4.12 |
| Sound is turned off while a Cue sounds | `setSound(false)` sets the flag, clears the held request and fades the sounding Cue to silence in 30 ms (within the 50 ms bound), then stops and disconnects its nodes. The context is kept. No engine event, no new Cue. | R4.7, R2.14 |
| Sound is turned on before any first gesture | The switch click is itself a gesture: `setSound(true)` calls `unlock()` inside the click (R4.5). If the browser still does not count it, the context stays `suspended`, `resume()` is retried by the next `play`, and nothing plays by surprise. Turning sound on at page load (the stored setting) creates nothing; only a gesture does. | R4.1, R4.5, R4.6 |
| A Cue is requested while the player is `locked` (a stored `lit` session burns out after a reload, before any gesture) | Dropped. It is not remembered and does not start after the first gesture. The title and the dawn are right. | R4.8, R4.14, E4 |
| A Cue is requested while sound is off | `cueFor` returns null (sound is read at the moment of the Transition). If a stale request reaches the player, `play` drops it at rule 2. | R2.7, R4.6 |
| Building the nodes throws midway (a bad `createBuffer`, a non-finite `currentTime`) | The `catch` in `play` calls the Cue's `release()` for the nodes made so far (each is stopped and disconnected, idempotently), sets `failed`, and does not rethrow. `current` is cleared. | R4.11, R4.12 |
| `player.play` throws in spite of its contract | `afterStep` catches it in step 2; steps 3 and 4 (title, Hidden_Tick control) still run. The saved session is unaffected because `afterStep` runs after `save`. | R1.8, D18 |
| `cueFor` or `sound()` throws | `afterStep` treats it as no Cue; the title and the Hidden_Tick control still run. | R2.1 |
| The title adapter throws (the `document.title` getter or setter) | The adapter catches it and keeps its old `known` value, so the next call retries the write. If it throws anyway, `afterStep` catches it in step 3 and step 4 still runs. A non-string title is ignored. | R6.10, R6.14 |
| `titleFor` gets an unknown phase at run time (a corrupt state object; the types forbid it) | The `switch` has no default, so it returns `undefined`; the adapter ignores a non-string and keeps the old title; `afterStep`'s `try` covers a throw. `cueFor` returns null for any phase pair it does not list (rule 6). | R2.1, R6.17 |
| `titleFor` gets a `now` that is NaN or infinite | `timeLeftMs` gives 0, so a `lit` title reads `00:00 · Candlewatch` and no throw occurs. | R6.17 |
| A placeholder in a title or card template is missing from the `fill` call | `fill` leaves `{name}` as it is, so the text would show the braces. The strings test of 4.4 (every placeholder is filled by its caller) fails at build time and names the key; no run-time guard is added. | R8.7 |
| A hidden timer callback throws (from `dispatch`, `getState` or `nextWakeMs`) | Decision D27: a throw cannot end the chain. `fire` catches a throw from `dispatch`, then reads the next wake from the state as it is and arms the next timer (the structure is a `try` around the dispatch, then a guarded re-arm; the `armId` and `running` checks still run first). If `getState` or `nextWakeMs` throws, the timer is armed at 1000 ms and never sooner. A phase that is no longer `lit` or `paused` gives `null` and ends the chain as usual. The chain ends only when `nextWakeMs` returns `null` or `stop()` has run. Reason: a throw that happens once (a bad frame of state, a failing sink) must not silently lose the end tick, and with it the chime and the end title, of a session that ends later in a hidden tab. The cost: a state-read fault retries once a second (the pace of the normal chain); a dispatch that keeps throwing retries at the normal Wake_Delay, which past the end is the 1 ms minimum and which the browser clamps to about a second in a hidden tab. `show` stops the chain in every case. | R5.2, R5.6, R5.13 |
| `setTimeout` returns an id the module does not expect (0, a large number, `undefined` from a fake) | The module never uses an id as a truth value: it compares `pending !== null` and passes whatever it was given to `cancel`. Id 0 is valid. A fake that returns `undefined` is a test bug; `cancel(undefined)` is harmless. | R5.2 |
| `start()` is called while a timer is already armed (a second `hide` without a `show`) | Returns at once; there is at most one pending timer. | R5.11 |
| The hidden timer fires after `stop()` (a queued task, a fake timer that ignores `cancel`) | `stop()` increments `armId`; the stale callback fails its first check and does nothing: no dispatch, no read, no re-arm. | R5.10, R5.17 |
| `visibilitychange` storm: hide, show, hide in quick succession | Each `hide` goes through `dispatch`, so `afterStep` calls `start`; each `show` calls `stop`. After hide, show, hide there is exactly one chain, started by the last `hide`; the earlier chain's callbacks are stale. The engine counts one ghost per closed hide, as without this spec. No Cue for any of them. | R5.10, R5.16, R5.17, R5.18 |
| The clock goes backwards, or `clock()` returns NaN | `nextWakeMs` always returns a value in (0, 1000] or null (NaN input gives 1000 for a NaN left; a non-finite `now` gives 0 left and so 1 ms). The engine settles by its own clamps. A phase does not change on a backwards clock, so no Cue; the title may show a larger time and costs one write per change. `Date.now` does not return NaN; a fake that does is bounded by the 1 ms minimum plus the browser's hidden-timer clamp, and the property test caps its iterations. | R5.3, R6.11 |
| The hidden timer fires but the page is visible again | `show` has already called `stop()`; the callback is stale. If the page were visible without a `show` having reached `dispatch`, a `tick` is harmless: it is the same event the Visible_Loop sends, and the engine settles by timestamps. | R5.11 |
| The phase leaves `lit` or `paused` while the page is hidden | The only way is the Hidden_Tick's own `tick` (burn-out or pause limit): `nextWakeMs` then returns null and the chain ends. No user input reaches a hidden page, so a snuff cannot come from the user; if an event arrives anyway (a developer tool, a script), it goes through `dispatch` and `afterStep` like any event, and the next `nextWakeMs` decides. | R5.7, R5.8, R5.13 |
| The page loads hidden with a stored `lit` session | The Reload_Settle plays no Cue and writes the title once; the sync `hide` goes through `dispatch`; `afterStep` starts the chain after both. If the candle already ended while the page was closed, the reload settles it to `burned-out`, the wake is null, no timer runs and no Cue plays. | R2.10, R5.12, R6.14 |
| A late end Cue: the tick that finds the end comes more than 120000 ms after `endedAt` (a long throttle, a sleeping laptop) | `cueFor` returns null; no sound. The state, the title and the dawn are right. Exactly 120000 ms plays; 120001 ms does not. | R2.11, R5.22 |
| Negative lateness (`now` earlier than `endedAt`, clock skew) | Decision D29: the lateness is `now - endedAt`, with no clamp. A negative value satisfies `lateness <= LATE_CUE_LIMIT_MS`, so the end Cue plays (3.1). The unit test names this case. | R2.11 |
| `cueFor` given a NaN or infinite `now` | Decision D29: the comparison is false, so an end Cue returns `null` (no end cue); `strike` is unaffected. It never throws. | R2.11, R2.12 |
| The browser throttles hidden timers to about one per minute | The title and the Cue follow at the late tick; the time stays right because it comes from timestamps. An end Cue later than 120000 ms is skipped; the title and the dawn are right (D10). | R5.9, R5.22 |
| The device sleeps or the tab is frozen | No ticks run. The next event or frame settles by timestamps; an end Cue older than the limit is not played. | R5.9, R5.22 |
| Storage unavailable | Unchanged from today; the storage adapter already handles it. This spec stores nothing. | R1.8 |
| `storage.save` throws inside `dispatch` | Decision D28: not handled in `dispatch`, and `afterStep` does not run. `save` is written never to throw (it catches every storage error and keeps the app working without persistence, `controls-and-access` R11.2) and its tests use a store whose `getItem` and `setItem` throw. If it threw anyway, `state = next` would not be assigned, so playing the Cue or writing the title for a Transition that did not land would be wrong; the throw propagates as it does today for every event. A `try` around `save` in `main.ts` is not added by this spec, because it changes the existing `dispatch` contract that `controls-and-access` owns. | R1.8, D18 |
| Reload settle with a garbage or invalid stored state | `storage.load()` validates and returns a valid `State` (the initial state when nothing usable is stored); the `reload` step settles it. `titleFor` is total over that state, the title is written once, and no Cue plays (event type `reload`). | R2.6, R6.14 |
| A Cue is requested while another is sounding | The earlier Cue is faded in 30 ms and stopped, and the new one starts; at most one sounds after the fade. A held request is replaced by the newest. | R4.10 |
| Nodes of a finished Cue | `onended` of each source calls the idempotent `release()`, which disconnects the source, its filter and gains. A source that never fires `onended` (a fake that ignores `stop`) is released when the next Cue fades it. | R4.11 |

Notes on the table:

- **D26. `closed` is terminal.** Decision recorded here and in section 10. It fills a gap in rule 4 of 3.3, which says "otherwise (a `suspended` context)" and does not name `closed`. The rule is: state `running` starts the Cue; state `suspended` follows rules 4 and 5; any other state (`closed`, or `interrupted` in some browsers) with a resume that does not bring it to `running` drops the Cue, and `closed` additionally sets `failed`. The unit test uses a fake whose state is `closed`.
- **D27. A throw cannot end the Hidden_Tick chain.** Reason as in the table. The code is the `fire` function of 3.7 (a `try` around the dispatch, then a `try` around the wake read that falls back to `WAKE_MAX_MS`), and the bullet "A throw" of 3.7 states the same rule.
- **D28. `dispatch` keeps its contract.** `afterStep` runs only after a `step` and a `save` that returned. This keeps one rule: a Cue or a title is requested only for a state that is stored.
- **D29. The lateness is not clamped.** Stated in 3.1 and in the table above: `now - endedAt`; a negative value plays; a non-finite `now` gives no end Cue.
- No row above adds a user-visible message, a log line or a new string. The only text a failure could produce is the unfilled placeholder of the row for a missing `fill` name, and the strings test stops that before it ships.

## Testing Strategy

### 8.1 Principles

- Two kinds of test, both used. Property tests (fast-check, `PROP_PARAMS` with 300 runs, `*.prop.test.ts` colocated with the source) cover every pure rule. Unit tests cover concrete numbers, edges and the effect files with fakes. Browser tests (Playwright with `page.clock`, no hook in shipped code) cover the real page.
- Properties are pure: they call `cueFor`, `cueSpec`, `titleFor`, `nextWakeMs`, `formatCarvedDate`, and for the effect files they drive an injected fake and assert on what the fake recorded. No property reads a clock, `Math.random` or the DOM. Time is an argument, taken from `arbT0` and the gap generators of `src/engine/test-kit.ts`.
- Each property test is one `fc.assert(fc.property(...), PROP_PARAMS)` and carries the tag `Feature: sound-and-title, Property N: <title>`. No property is weakened to pass; a failure is investigated, not tuned away.
- No test hook in shipped code (R9.3). The `AudioContext` factory, the timer functions, the clock, `document` and the gesture target are all arguments, so tests pass fakes. Browser tests replace `window.AudioContext` from their own `addInitScript`; that global exists only in the test's script.
- Fakes live in test-only files (`fake-audio-context.ts`, `fake-timer.ts`, `test-kit.ts`, `e2e/sound-fixtures.ts`). The purity tests check that no shipped file imports them.
- Property-based testing is not used for the DOM, the CSS, the real audio output or the screenshots; those get example tests in a browser and the human review of 8.6.

### 8.2 Unit tests, file by file

| File | Covers |
|---|---|
| `src/audio/cue.test.ts` | All 25 ordered phase pairs against the table in 3.1 (sound on, live event, `now = endedAt`). The Late_Cue_Limit at 119999, 120000 and 120001 ms for `chime` and `breath`. `strike` found 10 minutes after `idle` still strikes. `reload` and sound off give `null`. A negative lateness (`now` 1 ms before `endedAt`) plays; a NaN or infinite `now` gives no end Cue (D29). |
| `src/audio/specs.test.ts` | Each Cue_Spec's numbers against D1: ids, durations 400, 2000, 900; scratch 100 ms and flare 160 to 110 Hz starting at 60 ms; chime frequencies 660, 880, 1320 with decays at least 600 ms; breath cutoff ratios 0.29 and 0.5; rise and fall lengths; the sums of peaks times `MASTER_GAIN` (0.19, 0.17, 0.19). Frequencies above 0 (exponential ramps are valid). No functions in the data. |
| `src/audio/noise.test.ts` | Same `(seed, count)` gives equal arrays; a prefix of a longer array equals the shorter one; samples in [-1, 1); bad counts give an empty array. |
| `src/audio/audio-player.test.ts` | With `FakeAudioContext`: nothing constructed at creation; `unlock()` constructs once and calls `resume()` in the same call; sound off constructs nothing; `play` before unlock is dropped and not replayed after unlock; a `suspended` context with `resume()` that flips the state starts the Cue; one that leaves it `suspended` drops it; deferred `resume()` starts the held request once and only the latest; `setSound(false)` fades within 50 ms and clears the held request; a second Cue fades the first in 30 ms; every node disconnected after `advance`; a factory that returns `null` or throws, and a node call that throws, go `failed` silently; no `<audio>`, no `fetch`. |
| `src/audio/gesture.test.ts` | Three listeners on a fake target, capture phase; the first event with sound on unlocks and removes all three in the same dispatch; with sound off nothing is created and the listeners stay; `disarm` twice is safe; no `preventDefault` or `stopPropagation` is called. |
| `src/audio/purity.test.ts`, `src/page/purity.test.ts` | The scans of 2.2. |
| `src/page/title.test.ts` | One example per phase against the forms of R6.1 to R6.5, including `12:31 paused · Candlewatch`; the intent never appears; a long intent changes nothing. |
| `src/page/wake.test.ts` | Zero left gives 1 ms; exactly 1000 ms left gives 1000; 1001 ms gives 1000; 999 gives 999; `idle`, `burned-out`, `snuffed` give `null`; paused with 10 minutes of allowance left and with 0. |
| `src/page/title-adapter.test.ts` | The first write compares with the page's title (equal: no write); equal writes dropped; a changed string writes; a throwing setter keeps `known` and retries; the initial write count after a reload is one. |
| `src/page/hidden-tick.test.ts` | With `FakeTimer`: `start` after `hide` arms one timer at the wake; the callback dispatches one `tick` with `clock()`; re-arm; end found stops the chain; `stop` cancels; a callback that runs after `stop` does nothing; `start` twice arms once; `start` in `idle` arms nothing; a throwing `dispatch` is swallowed and the next timer is still armed at the Wake_Delay; a throwing `getState` arms the next timer at exactly 1000 ms (`WAKE_MAX_MS`); the chain ends only when `nextWakeMs` is `null` or after `stop()` (D27). |
| `src/after-step.test.ts` | With recording fakes: for `light` the log is `play("strike")` then `writeTitle(...)`; for `hide` it is `writeTitle` then `hidden.start(now)`; for `show`, `hidden.stop()`; for `reload` no `play`; a throwing `play` still writes the title and starts the tick. |
| `src/graveyard/days.test.ts` (ghosts-and-graveyard file, extended) | `formatCarvedDate` for each of the 12 months and the bad keys of R9.2: empty string, wrong separator, month 00, month 13, day 00, day 32, non-numeric parts. |
| `src/graveyard/text.test.ts` (extended) | The four rows of 4.3 through the real `cardLines`; the Item name never contains "Here lies" or "Burned to the end". |
| `src/strings.test.ts` (extended) | The checks of 4.4. |
| `index.html` check (in `src/hosting/static-only.test.ts` or `src/page/title.test.ts`) | `<title>Candlewatch</title>` exactly (R6.16). |

### 8.3 Generators and reference models

- Shared from `src/engine/test-kit.ts`: `PROP_PARAMS`, `arbT0`, `arbGap`, `arbSignedGap`, `arbLength`, `arbIntent`, `makeArbScript`, `arbScript`, `arbVisibilityScript`, `runScript`, `assertInvariants`, `ScriptStep`, `TraceEntry`. States for pure properties come from running generated scripts with `runScript`, so every state is one the engine can reach.
- `src/audio/test-kit.ts`:
  - `arbPhasePair` (all 25 ordered pairs, built from states picked out of `runScript` traces and from hand-built `burned-out` and `snuffed` states with a chosen `endedAt`), `arbCueContext` (event type from the engine's event names, `sound` boolean, `now` near `endedAt` with offsets that include 0, 119999, 120000, 120001, large values and negative values down to -200000, for D29), `arbGestureScript` (a list of `gesture`, `request(cue)`, `setSound(on)`, `advance(ms)` and `settle` steps).
  - `referenceCue(prevPhase, nextPhase, eventType, sound, lateness)`: a lookup written differently from the code. It is a map keyed by the string `"<prev>><next>"` holding `strike`, `chime` or `breath`, and a separate lateness test written as `lateness > 120000` negated. The code uses rules tried in order; the reference uses a table and a negation, so one cannot copy the other's mistake. The expected result for `sound` false or `reload` is written as the first line of the reference.
- `src/page/test-kit.ts`:
  - `arbLitState`, `arbAnyState`, `arbNonDecreasingTimes` (a start and a list of non-negative gaps).
  - `runWithExtraTicks(script, t0, extraTimes)`: the script runner for P9. It runs the script through `step` and, between steps, inserts `tick` events at the extra times that fall between two steps (times are merged so the sequence of `now` values never goes backwards). A second function, `runWithoutExtraTicks(script, t0)`, runs the same script and ends with one `tick` at the last `now`. P9 compares the two final states with `toEqual`.
  - `FakeTimer` (`src/page/fake-timer.ts`): `schedule(fn, ms)` returns an incrementing id and records the due time; `cancel(id)`; `advance(ms)` runs due timers in order, advancing a settable `clock()`; `live()` is the number of armed timers; `lateBy(ms)` runs the next timer `ms` later than due (to model throttling).
- `src/audio/fake-audio-context.ts`: `FakeAudioContext` implements `AudioContextLike`. It records every created node with its type and its parameter calls (`setValueAtTime`, `linearRampToValueAtTime`, `exponentialRampToValueAtTime`, `cancelScheduledValues`), every `start` and `stop` time, every `connect` and `disconnect`, and counts of construction and `resume()` calls. Options: `resumeMode` (`"instant"` flips the state in the call, `"deferred"` flips it in a microtask, `"never"` leaves it `suspended`, `"throw"` rejects), `throwOn` (a method name that throws). `advance(ms)` moves `currentTime` and fires `onended` of a node once its `stop` time has passed. `sounding()` returns the cues whose `cueGain` is above 0 at the current time, which P15 counts.
- `src/audio/fake-target.ts` is not needed: the gesture target is a 20-line object inside `gesture.test.ts` that records `addEventListener` and `removeEventListener` calls and can `fire(type)`.
- For `src/distraction`, the existing `fake-document.ts` is reused where a test needs a `document`-shaped value.

### 8.4 Mutation checks

Done by hand while building, before a property is accepted: apply the mutation, run the named test, see it fail, revert. A property that cannot fail is not accepted. The table is also the list of tests a reviewer can run to see that they bite.

| Property | Mutation to apply | Expected failing test |
|---|---|---|
| P1 | In `cueFor`, ignore `context.sound` (delete rule 1) | `cue.prop.test.ts` P1 |
| P1 | Delete the `reload` rule (rule 2) | `cue.prop.test.ts` P1 and the reload unit test |
| P2 | Swap the `strike` and `chime` results in rules 3 and 4 | `cue.prop.test.ts` P2 and the 25-pair unit test |
| P2 | Return `breath` for `paused` to `burned-out` | `cue.prop.test.ts` P2 |
| P3 | In `afterStep`, call `play` a second time for the same Cue; or let a `reload` event reach `cueFor` with the context's event type forced to `"tick"` | `after-step.prop.test.ts` P3 |
| P4 | Change `<=` to `<` in the lateness test, or use `LATE_CUE_LIMIT_MS + 1` | `cue.prop.test.ts` P4 and the 119999/120000/120001 unit test |
| P4 | Apply the lateness rule to `strike` | `cue.prop.test.ts` P4 |
| P4 | Compute the lateness as `Math.abs(now - endedAt)` (a negative lateness of more than the limit would then stop playing, against D29) | `cue.prop.test.ts` P4 (generator includes negative offsets) and the negative-lateness unit test |
| P5 | Raise a spec peak so the sum times `MASTER_GAIN` is above 0.2 (set `MASTER_GAIN` to 0.6) | `specs.prop.test.ts` P5 |
| P5 | End a voice envelope at gain 0.01 instead of 0 | `specs.prop.test.ts` P5 |
| P6 | Build the title time from `timeLeftMs(state, now + 1000)` | `title.prop.test.ts` P6 |
| P6 | Append the intent to the title | `title.prop.test.ts` P6 |
| P7 | Make the title include `Math.floor(now / 500)` or tenths of a second | `title.prop.test.ts` P7 |
| P8 | Remove the `min(left, ...)` cap so the wake can pass the end moment | `wake.prop.test.ts` P8 |
| P8 | Return 0 instead of the 1 ms floor | `wake.prop.test.ts` P8 |
| P9 | In `fire`, dispatch `{ type: "hide" }` instead of `tick` | `hidden-tick.prop.test.ts` P9 |
| P9 | Have the runner's extra tick carry a stale `now` (an earlier time than the previous event) | `hidden-tick.prop.test.ts` P9 |
| P10 | Call the factory inside `createAudioPlayer` instead of inside `unlock()` | `audio-player.prop.test.ts` P10, and E1 |
| P10 | Let `play` create the context when `locked` | `audio-player.prop.test.ts` P10 |
| P11 | Pad the day with a leading zero (`"07 Nov"`) | `days.prop.test.ts` P11 |
| P12 | Remove the `armId` check in `fire` | `hidden-tick.prop.test.ts` P12 |
| P12 | Re-arm after `running` became false | `hidden-tick.prop.test.ts` P12 |
| P12 | Return from the `catch` around `dispatch` (a throw ends the chain) | `hidden-tick.prop.test.ts` P12 and the throwing-dispatch unit test |
| P12 | Fall back to `WAKE_MIN_MS` instead of `WAKE_MAX_MS` when `getState` throws | `hidden-tick.prop.test.ts` P12 and the throwing-getState unit test |
| P13 | Drop the equality check in the title adapter | `title-adapter.prop.test.ts` P13 |
| P14 | In `afterStep`, call `writeTitle` before `play` | `after-step.test.ts` order test and `after-step.prop.test.ts` P14 |
| P14 | Call `hidden.start` for `show` | `after-step.prop.test.ts` P14 |
| P15 | Skip `fadeOut(current)` when a new Cue starts | `audio-player.prop.test.ts` P15 |
| P15 | Leave the held request alive after `setSound(false)` | `audio-player.prop.test.ts` P15 |

A failure of P9 that is not caused by a mutation is Risk K1: stop, report the counterexample and the seed, and do not work around it (Section 10, Risks).

### 8.5 Browser tests

Files: `e2e/sound-fixtures.ts` (helpers), `e2e/sound.spec.ts` (E1, E1b, E2, E3, E4, E8), `e2e/hidden-tab.spec.ts` (E5, E6), `e2e/title.spec.ts` (E7), `e2e/final-wording.spec.ts` (E9, after the ghosts-and-graveyard build), `e2e/sound-headers.spec.ts` (E10), and the screenshots of 8.6 (E11). They build on `e2e/controls-fixtures.ts`, which already provides `openApp(browser, { fixture, now, initScripts, reducedMotion, settings, viewport })`, `settle`, `jump`, `press`, `timeText`, `statusText`, `liveTexts`, `storedState`, `phaseOf` and `clockNow`, and on the `FIXTURES` and `T0` of `e2e/scene-fixtures.ts`.

How the mechanics work:

- **The fake audio.** `sound-fixtures.ts` exports `FAKE_AUDIO_SCRIPT`, a string passed in `initScripts` (so it runs after the live-region recorder, before the page script). It replaces `window.AudioContext` with a class that starts `suspended`, flips to `running` in a microtask after `resume()`, and appends plain objects to `window.__audioLog`: `{ kind: "construct" | "resume" | "osc" | "noise" | "filter" | "stop", at: Date.now(), ... }` with the frequencies, waveform and filter type. `window.__audioLog` is a global of the test's own init script, not of shipped code, and the app never reads it. Tests read it with `page.evaluate(() => window.__audioLog)`. `cuesPlayed(log)` turns the log into cue names by signature, using the numbers from `CUE_SPECS` (imported from `../src/audio`, as `controls-fixtures.ts` already imports from `../src/engine`): a bandpass noise voice from 4000 Hz is a `strike`; a 660 Hz sine is a `chime`; a lowpass noise voice from 2400 Hz is a `breath`. `constructions(log)` and `resumes(log)` count the other kinds. A variant script (`FAKE_AUDIO_THROWS`) makes the constructor throw, for the silent-failure check.
- **The clock.** `openApp` installs `page.clock` and pauses it, so time moves only when a test moves it: `settle(page)` runs 48 ms of frames, `jump(page, ms)` is `fastForward`, and `page.clock.runFor(ms)` runs timers and frames in order. `runFor` is used wherever a timer or a frame must fire at its due time (the hidden tick, a burn-out at an exact instant); `fastForward` is used to jump over time with at most one firing, which is how a throttled tab is modelled.
- **A hidden tab.** `setHidden(page, true)` in `sound-fixtures.ts` does what `controls.spec.ts` (E8) does: `Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" })` and `document.dispatchEvent(new Event("visibilitychange"))`. It also stops `requestAnimationFrame` the way a browser does: in the same `page.evaluate` it saves the current `window.requestAnimationFrame` and replaces it with a function that pushes the callback onto `window.__heldFrames` instead of running it. The one frame already requested at that moment may run once (a browser would also have issued it before the tab was hidden); `settle` right after lets it pass. After that no frame runs, so the scene and the interface are frozen and any change in the title must come from the Hidden_Tick. `setHidden(page, false)` restores the saved function, sets `visibilityState` to `"visible"`, dispatches `visibilitychange`, and passes the held callbacks to the restored function. The frame stub is installed after load, not from an init script, because `page.clock.install` registers its own init script and could overwrite a wrapper installed earlier.
- **Keyboard-only states.** `idle`: a fresh page. `lit`: `press(page, "Enter")` on Light. `paused`: Space. Back to `lit`: Space again. The snuff dialog: Escape, then Tab to the confirm button and Enter (Enter on the focused **Keep burning** keeps the candle, as `controls.spec.ts` checks). `burned-out`: `page.clock.runFor` past the length. `snuffed` by the pause limit: Space, then `runFor` past ten minutes. A state written before load: `openApp(browser, { fixture })` with a `Fixture` from `FIXTURES`, or one built with the engine's `step` and written by `serializeSession` and `serializeHistory` as `openApp` already does; `now` set to a time after the end gives a candle that ended while the page was closed.
- **The title.** `await page.title()` reads the tab title; `timeText(page)` reads `#time`. Both are read in the same `page.evaluate` at each sampled clock point, so they belong to the same frame.
- **The CSP check.** `e2e/sound-headers.spec.ts` serves the real build with the Blueprint's headers the way `e2e/headers-local.spec.ts` does: it reads `render.yaml` with `readBlueprint`, adds `headersFor(blueprint, pathname)` to every response in a `page.route("**/*")` handler, records `securitypolicyviolation` events in an init script, and listens to `console`, `pageerror` and `requestfailed`. It is a local copy of that `serveWithHeaders` shape (spec files do not import each other); extracting it into `e2e/headers-fixtures.ts` is allowed in the build tasks. The fake audio script is added as well, because a real `AudioContext` makes no request either way. It also records every request and asserts that all are same-origin and none has a `media` resource type.

The tests:

- **E1.** `FAKE_AUDIO_SCRIPT` installed. Open a fresh page and a page with a stored `lit` session. Assert `constructions(log)` is 0 after load and after `settle` and after several frames (a timer or a pointer move is not a gesture). Press Enter on a fresh page: `constructions` is 1, `resumes` is 1, and `cuesPlayed` is `["strike"]`, all in the same step.
- **E1b.** A fresh page, nothing touched, then `press(page, "Enter")` while Light has focus. Assert one construction, one `resume`, one `strike`, and that the log entry for `resume` comes before the first voice entry (the capture-phase listener unlocked before the controls' handler lit the candle). This is the first-ever action on the page (R4.3, R4.16).
- **E2.** A whole session by keyboard with the clock moved by `runFor`: Enter (one `strike`), Space and Space (no new Cue), `runFor` to the end (one `chime`), then a second session: Enter, Escape, confirm (one `breath`), a third: Enter, Space, `runFor` past ten minutes (one `breath`, from the pause limit). The counts are exact, not "at least".
- **E3.** `settings` stored with sound off: a whole session constructs nothing and plays nothing. In another test, turn sound on mid-session with the real switch (click or keyboard): one construction and no Cue; the next Transition (burn-out) plays the `chime`. Turning sound off again fades within 50 ms (the log shows `stop` entries) and sends no engine event (the stored session is unchanged).
- **E4.** A stored `lit` session whose end passed while the page was closed: no Cue at load, none after the first gesture (a click on the page). A stored `lit` session that burns out after the load but before any gesture, found by `runFor`: no Cue (the player is locked). Then a gesture and a new Light: the `strike` plays.
- **E5.** A stored `lit` session with 20 seconds left. `setHidden(page, true)`, `settle`. Record `timeText` (frozen: no frame runs). `runFor(1000)` five times: the title changes each second (it equals `formatTime` of the time left at the sampled clock, read with `clockNow`), `timeText` does not change. `runFor` to the end: the title is `Morning · Candlewatch` and `cuesPlayed` is `["chime"]` at the burn-out instant (the log's `at` is within the wake interval of the end). `setHidden(page, false)`, `settle`: still one `chime`, one stored distraction (`storedState(page)` has `distractions` 1), `#time` reads the right text, and the live region has the dawn once.
- **E6.** A stored `paused` session with a few seconds of pause allowance left, hidden: `runFor` past the limit gives one `breath`, the title `Dark · Candlewatch`. Late timers: `fastForward` 90 seconds past the end (lateness under the limit) gives the `chime`; `fastForward` 130 seconds past (over the limit) gives no Cue, while the title and the stored phase are right. Run for both end kinds.
- **E7.** A session by keyboard. At sampled clock points (every 5 seconds of a short session, the instant of each phase change, and the last second) read the title and `#time` in one `page.evaluate`; assert the title matches the forms of R6 with the time equal to `#time`, and that the title never contains the typed intent (type a distinctive intent first). Check the page title is `Candlewatch` before the script runs by loading `view-source`-free: `page.goto` with scripts blocked once (`javaScriptEnabled: false` context) and read `page.title()`.
- **E8.** The same keyboard session twice, with `reducedMotion` true and false (`openApp` option): `cuesPlayed` lists are equal, and the logs of node types are equal.
- **E9.** After the ghosts-and-graveyard build: a history of 200 sessions over 45 days and a small one. `ariaSnapshot` of the graveyard view checked against the Final Wording: the Carved_Date ("10 Nov", no zero), the empty lines, the count lines (singular for 1, plural otherwise), the Overflow_Mark `+n`, "+n more", and the five card lines of a stone and of a stub, with and without an intent.
- **E10.** The real build under the Blueprint's headers (`vite preview` on port 4173, as the other specs): a whole short session plays a `strike` and a `chime` through the fake audio; `window.__violations` is `[]`, no console error names the policy, no `pageerror`, no `requestfailed`, and no request leaves the origin. A negative control with `script-src 'none'` (as in `headers-local.spec.ts`) shows the test can fail.
- **E11.** The screenshots of 8.6.

### 8.6 Screenshots

The wording changes affect the graveyard view; the cues and the title are not drawn. `docs/screenshots/` has no `graveyard-*` or `ghosts-*` files yet, because ghosts-and-graveyard has not been built, so this spec's task retakes whatever that spec's screenshot step produced, using its names (ghosts-and-graveyard design 8.5):

- Retaken because text changes: `graveyard-small-desktop.png`, `graveyard-small-phone.png`, `graveyard-large-desktop.png`, `graveyard-large-phone.png`, `graveyard-large-desktop-reduced.png`, `graveyard-card-keyboard-desktop.png`, `graveyard-card-keyboard-phone.png`, `graveyard-card-touch-desktop.png`, `graveyard-card-touch-phone.png`.
- Checked, retaken only if the picture differs: `ghosts-0-*`, `ghosts-1-*`, `ghosts-g-*`, `ghosts-g-plus-9-desktop.png`, `ghosts-g-plus-9-phone.png`, `ghosts-g-plus-9-desktop-reduced.png`. The Overflow_Mark wording `+{n}` is the same as the placeholder, so these are expected to be unchanged.
- `candle-*` and `controls-*`: unchanged by this spec; the title is not in a screenshot. If the Door label is drawn as visible text and its wording changed, they are retaken as well.

Each is taken at desktop (1280 by 800) and phone (360 by 640). The rule: every retaken file is opened and looked at (the Read tool shows images) before the task is closed. The summary lists the retaken file names and any file checked and left unchanged. A screenshot nobody looked at does not count.

### 8.7 What cannot be verified automatically

- Real audible quality: whether the three Cues sound pleasant, quiet and distinct on real speakers and headphones. The tests check numbers (frequencies, envelopes, peak) and what a fake recorded, not what a person hears. The owner listens once on a laptop and a phone (Risks, K4).
- Real browser throttling: the fake timer and the clock model throttling, but real Chrome, Safari and Firefox hide-time rules (budget throttling, intensive throttling, frozen tabs) vary by version and cannot be reproduced by Playwright's clock.
- Real autoplay rules: whether Safari or a mobile browser accepts the first gesture as activation for `resume()` (Risks, K3). The fake accepts what the code asks for.
- Real screen readers: how a given product speaks the changing tab title or the live region. Full validation needs manual testing with assistive technologies and expert accessibility review.
- A laptop that sleeps or a tab that is discarded: no ticks run; the design relies on timestamps, which is tested only by jumping the clock.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Randomised testing applies to the pure choosing, title and wake functions and to the effect files through injected fakes. It does not apply to the real audio output, the DOM wiring or the screenshots (8.7). Numbers 1 to 11 below are the requirements' P1 to P11, restated; numbers 12 to 15 are added by this design because the effect files carry rules the requirements state only as examples. The last clause of the requirements' P10 ("at most one Cue sounds at a time") is checked by Property 15, which states it with the 50 ms fade.

Reflection on redundancy. P1 (null for sound off or `reload`) and P2 (the table) overlap on the null rows, but P1 pins the two guards on every input including pairs the table maps to a Cue, so a mutation that removes a guard fails P1 alone; both stay. P4 is separate from P2 because it varies `now`. P7 (title changes at most once per second) and P13 (the adapter writes only changed titles) test two different files and both are needed for R6.11. P12 (the Hidden_Tick's timer discipline) and P9 (the engine state with extra ticks) fail for different reasons and are kept apart: P9 is about the engine, P12 about the timer. P14 and P3 are about `afterStep`: P3 counts Cues across a whole run, P14 checks the order and the single Cue for one event.

### Property 1: No Cue when sound is off or on reload

*For any* two states, *any* event type, *any* `now` and *any* value of `sound`, `cueFor` returns `null` when `sound` is false, and returns `null` when the event type is `reload`.

**Validates: Requirements 2.6, 2.7, 2.13**

Test: `src/audio/cue.prop.test.ts`.

### Property 2: cueFor agrees with the reference table

*For any* two states reached by a generated script, *any* live event type, sound on, and `now` within the Late_Cue_Limit, `cueFor` equals the reference: `strike` for (`idle`, `burned-out` or `snuffed`) to `lit`; `chime` for (`lit` or `paused`) to `burned-out`; `breath` for (`lit` or `paused`) to `snuffed`; `null` for every other pair. The result is one of `strike`, `chime`, `breath` or `null`, never anything else, and a break does not change it.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.8, 2.9**

Test: `src/audio/cue.prop.test.ts`.

### Property 3: At most one Cue per event, none from reload, one strike and one end Cue per session

*For any* generated script run through a `dispatch` that calls `afterStep` and counts the Cues played, at most one Cue comes from each event, no Cue comes from a `reload` event, and over one session (from `light` to the end) there is at most one `strike` and at most one end Cue (`chime` or `breath`).

**Validates: Requirements 1.6, 2.8, 2.10, 5.7, 5.8**

Test: `src/after-step.prop.test.ts`.

### Property 4: The Late_Cue_Limit decides end Cues and never strikes

*For any* Transition to `burned-out` or `snuffed` from `lit` or `paused`, with sound on, `cueFor` returns `null` exactly when `now - endedAt` is greater than 120000 ms; otherwise it returns `chime` or `breath` by the next phase. *For any* Transition to `lit` from `idle`, `burned-out` or `snuffed`, the result is `strike` whatever the delay.

**Validates: Requirements 2.11, 2.12, 5.22**

Test: `src/audio/cue.prop.test.ts`.

### Property 5: Cue_Specs obey the sound rules

*For any* Cue, `cueSpec(cue)` is deeply equal across calls and holds only plain data; its duration is above 0 and within 700 (`strike`), 2500 (`chime`) or 1200 (`breath`) ms; the sum over its voices of the peak gain times `MASTER_GAIN` is at most 0.2, every voice peak is above 0, and `MASTER_GAIN` is in (0, 1]; every voice envelope starts and ends at gain 0, rises at least 5 ms and falls at least 20 ms, has non-decreasing times inside [0, duration]; `strike` has a noise scratch of 40 to 150 ms and a tonal partial of 80 to 220 Hz starting within the scratch; `chime` has at least two tonal voices between 200 and 2000 Hz with decays of at least 600 ms; `breath` has only noise voices whose cutoff at the end is at least 30% lower than at the start; the three ids and the three durations differ.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11**

Test: `src/audio/specs.prop.test.ts` (the properties that vary nothing are checked once per Cue inside one `fc.constantFrom` property; the equality across calls and across the reduced-motion preference uses repeated calls).

### Property 6: The title carries the time left and no intent

*For any* state reached by a generated script and *any* `now`, in `lit` the title equals the `pageTitle.lit` template filled with `formatTime(timeLeftMs(state, now))`; in `paused` the `pageTitle.paused` template filled the same way; `burned-out` and `snuffed` give the dawn and dark forms with no time; `idle` gives exactly `STRINGS.title`; the time in the title equals the time `viewOf` shows as the Time_Text for the same state and `now`; and no title contains the session's intent (for an intent of at least 3 characters that does not occur in the fixed strings).

**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.8, 6.9, 6.15, 6.17**

Test: `src/page/title.prop.test.ts`.

### Property 7: The title changes at most once per second while lit

*For any* `lit` state and *any* non-decreasing list of times, the titles `titleFor` gives change at most once for each whole second of time left crossed, and the Title_Time never increases.

**Validates: Requirements 6.11**

Test: `src/page/title.prop.test.ts`.

### Property 8: The wake delay is bounded and never passes the end

*For any* state and *any* `now`, `nextWakeMs` is in (0, 1000] when the phase is `lit` or `paused` and `null` otherwise; in `lit` it is at most the time left (at least 1 ms); in `paused` it is at most the pause allowance left (at least 1 ms).

**Validates: Requirements 5.3, 5.4, 5.5**

Test: `src/page/wake.prop.test.ts`.

### Property 9: Extra hidden ticks change nothing (the Risk K1 property)

*For any* script of events and *any* list of extra `tick` events inserted at non-decreasing times, the final engine state equals the state of the script without the extra ticks followed by one `tick` at the last `now`; and the distraction count and the ghost spans are equal.

**Validates: Requirements 5.14, 5.18**

Test: `src/page/hidden-tick.prop.test.ts` (the engine part, using `runWithExtraTicks`). This is the Risk K1 property. If it fails, stop and report the counterexample and the seed; do not work around it in this spec, and do not change the engine here. It is an engine finding for `distraction-tracking` (CR8).

### Property 10: The player never makes a sound by surprise

*For any* sequence of gestures, Cue requests, sound-setting changes and time advances against an injected factory: the factory is called at most once, never before the first gesture that the sound setting allows, and never while the sound setting is off since the start; a Cue sounds only when the player is unlocked with sound on and the context is running; a request made before unlock never sounds afterwards; a request made while sound is off is never replayed.

**Validates: Requirements 4.1, 4.2, 4.5, 4.6, 4.8, 4.9, 4.14**

Test: `src/audio/audio-player.prop.test.ts`.

### Property 11: formatCarvedDate

*For any* valid Day_Key, `formatCarvedDate` returns the day number without a leading zero, a single space and the matching three-letter month name, with no year or time; *for any* other input (an arbitrary string, `null`, `undefined`, a malformed key, a well-formed key naming a day that does not exist) it returns the unknown-date line and does not throw.

**Validates: Requirements 8.9, 8.10**

Test: `src/graveyard/days.prop.test.ts` (the file that holds `formatCarvedDate` in the ghosts-and-graveyard design).

### Property 12: The Hidden_Tick keeps at most one timer and stops when told

*For any* generated sequence of `start`, `stop`, timer advances (including late ones) and state changes, the `FakeTimer` never holds more than one live timer from the Hidden_Tick; `hasPending()` implies `isRunning()`; no timer is armed while the phase is not `lit` or `paused`; after `stop()` no `dispatch` runs and no timer is armed, including a callback already due; the only event sent is `tick`; every `dispatch` carries the `now` that `clock()` returned when the callback ran; a `dispatch` that throws (the generator injects throws) never ends the chain, so the next timer is armed whenever the phase is still `lit` or `paused`; a `getState` that throws arms the next timer at `WAKE_MAX_MS`; and the chain ends only when `nextWakeMs` returns `null` or `stop()` has run.

**Validates: Requirements 5.1, 5.2, 5.6, 5.10, 5.11, 5.13, 5.14**

Test: `src/page/hidden-tick.prop.test.ts`.

### Property 13: The title adapter writes only changes

*For any* sequence of titles and *any* starting `document.title`, the adapter writes `document.title` only when the new title differs from the last one it knows, so the number of writes is the number of changes in the sequence (plus one when the first title differs from the page's); and for any monotone sequence of `now` values in `lit` fed through `titleFor`, the writes are at most one per whole second of time left plus the phase changes.

**Validates: Requirements 6.10, 6.11, 6.12, 6.14**

Test: `src/page/title-adapter.prop.test.ts`.

### Property 14: afterStep runs in order and plays at most one Cue

*For any* previous state, next state, event and `now`, `afterStep` calls `play` at most once; it calls `play` before `writeTitle` and `writeTitle` before `hidden.start` or `hidden.stop`; it calls `hidden.start` only for `hide` and `hidden.stop` only for `show`; and it does not throw whichever of its dependencies throw.

**Validates: Requirements 1.6, 1.7, 5.16, 5.17, 6.12**

Test: `src/after-step.prop.test.ts` (with `src/after-step.test.ts` for the examples).

### Property 15: At most one Cue sounds at a time

*For any* sequence of Cue requests and time advances against the `FakeAudioContext`, at any instant after 50 ms from the last request at most one Cue is sounding; a Cue that is replaced is silent within 50 ms; when sound is turned off the sounding Cue is silent within 50 ms; and after every source has ended all nodes the player created are disconnected.

**Validates: Requirements 4.7, 4.10, 4.11**

Test: `src/audio/audio-player.prop.test.ts`.

Coverage of the requirements' tests: P1 to P11 are the requirements' P1 to P11. Criteria with no property are covered by the unit tests of 8.2 or the browser tests of 8.5: R1.3, R1.9 to R1.11 (purity and strings scans), R4.3, R4.4, R4.16, R4.17 (gesture unit tests, E1, E1b), R5.12, R5.15, R5.19 to R5.21, R5.23 (E5, E6 and scans), R6.6, R6.13, R6.16, R6.18 (title unit tests, E7), R7 (E8 and the Costume_Reviewer), R8.1 to R8.8, R8.11 to R8.15 (strings tests and E9), R9 (this section).

## Section 10: Decisions

This table is the one authority for decision numbers; every "D" number elsewhere in this document refers to the row with that number. D1 to D13 are those of the requirements; D14 to D29 are argued in the earlier sections (D26 to D28 in Error Handling, D29 in 3.1 and Error Handling); D30 to D33 are recorded here. The last column is where the reasoning is.

| ID | Decision | Reason | Where |
|---|---|---|---|
| D1 | Cue recipes: `strike` 400 ms (noise scratch 100 ms, triangle flare 160 to 110 Hz), `chime` 2000 ms (sines 660, 880, 1320 Hz staggered 140 ms), `breath` 900 ms (two filtered-noise layers); `MASTER_GAIN` 0.5; peaks sum to 0.19, 0.17 and 0.19 after it. | Quiet, short, distinct by ear, every envelope starts and ends at 0 so nothing clicks. | 3.2 |
| D2 | Cue_Spec is plain data (osc and noise voices, gain points, filters). Noise seeds are fixed (`0x5ca7c4`, `0xb2ea71`, `0x0d15ea`). The shape and the seeds are one decision. | No sound file, deterministic and testable; no `Math.random`. | 3.2 |
| D3 | Hidden_Tick is a chain of single `setTimeout` calls, each at `nextWakeMs` (at most 1000 ms, at most the time left, at least 1 ms). | `setInterval` cannot shorten the last interval; a fixed 1000 ms chain overshoots the end by up to a second. | 3.7 |
| D4 | Unlock on `keydown`, `pointerdown`, `touchend` on `document`, capture phase, removed in the same dispatch. Escape is not needed. | The listener runs before the controls', so the first Enter on Light strikes at that Light. | 3.4, 2.3 |
| D5 | Late_Cue_Limit is 120000 ms, in `cue.ts` only; it applies to end Cues, never to `strike`. | Covers a tab woken once a minute; keeps a laptop that wakes an hour later from chiming for the past. | 3.1 |
| D6 | Title forms: `12:31 · Candlewatch`, `12:31 paused · Candlewatch`, `Morning · Candlewatch`, `Dark · Candlewatch`, `Candlewatch`; templates in `strings.ts`. The end forms carry no time. | Time first so a narrow tab shows it; the Time_Text reads 00:00 at the end and the word says more. | 3.5 |
| D7 | The Strings_Table (4.2) lists every finalised string with key, wording and source spec. | R8.2. | 4.2 |
| D8 | Module layout: `src/audio/`, `src/page/`, `src/after-step.ts`, with the pure and effect split of 2.1. | Matches `structure.md` boundaries. | 2.1 |
| D9 | Costume-reviewer findings: **recorded by the last task**, each with an outcome of fixed or accepted with a reason (R9.8), like ghosts-and-graveyard D12. | The review comes after the build. | Section 10 (this row, filled by the last task) |
| D10 | Throttled hidden tabs accepted: a chime and title up to about a minute late after long hidden periods. No silent keep-alive audio, no audio-clock scheduling. | Browsers throttle hidden timers to about once a minute; time is right from timestamps. | 3.7 |
| D11 | No year in the Carved_Date. | Only the newest items are drawn, so the same month a year apart is rare. | 4.2 |
| D12 | Data labels are plain; state and empty lines carry the dry tone. | R8.4 and R8.5. | 4.2 |
| D13 | "Here lies" and "Burned to the end" appear only as the first card line, never in an accessible name. | R8.15. | 4.3 |
| D14 | The cues live in the existing `src/audio/`; the title and tick in `src/page/`. | `structure.md` already assigns `src/audio/` to Web Audio cues. | 2.4 |
| D15 | The Hidden_Tick is started and stopped from `afterStep` on `hide` and `show`, not by a second listener. | The order (engine first, timer after) then holds by construction; `wireVisibility` is untouched. | 2.3, 2.4 |
| D16 | `settings` is loaded before `dispatch` is defined; `onSettings` also calls `player.setSound`. | `afterStep` reads it at each Transition; the startup sync dispatches before the interface exists. | 2.4 |
| D17 | `afterStep` runs for every event, changed or not. | The title depends on `now`. | 2.4 |
| D18 | Cues are requested after `save`; each step of `afterStep` has its own `try`/`catch`. | A failing player or title cannot delay or lose the session write. | 2.4, 3.9 |
| D19 | `play` holds at most one request for the promise of its own `resume()` call. | Real `resume()` settles on a later task; the first strike would be lost otherwise. | 3.3 |
| D20 | One gain node per Cue, a 30 ms fade of the Cue gain, idempotent `release()` on `onended`. | Meets the 50 ms bound with no timer in the player. | 3.3 |
| D21 | No `webkitAudioContext` fallback; a missing constructor means silence. | Unprefixed `AudioContext` ships in the supported browsers; a prefixed branch has no test and no user. | 3.3 |
| D22 | The stone line's quotes are a separate template (`card.quoted`). | Quotes belong only to real user text; the visible result is the table's. | 4.2 |
| D23 | `graveyard.unknownDate` is "Unknown date", not "Date worn away". | The date sits inside an accessible name; data labels are plain (R8.5). | 4.2 |
| D24 | Wording that differs from the ghosts-and-graveyard placeholders is the Final Wording table's. | R8.1, R8.3. | 4.2 |
| D25 | Page titles are data labels, so R8.4's full stop does not apply. | They are tab strip text, not sentences. | 4.2 |
| D26 | An `AudioContext` in state `closed` is terminal: `play` sets `failed` and drops the Cue, with no `resume()` and no second context. | A closed context rejects `resume()`, and a new context would need a new gesture the player does not track. | Error Handling |
| D27 | A throw inside a hidden tick never ends the chain. A throw from `dispatch` is swallowed and the next timer is armed at the Wake_Delay; a throw from `getState` or `nextWakeMs` arms it at `WAKE_MAX_MS` (1000 ms). The chain ends only when `nextWakeMs` returns `null` or `stop()` has run. | A chain that died silently would lose the end tick, and with it the chime and the end title, in a background tab. | 3.7, Error Handling |
| D28 | `dispatch` keeps its contract: `storage.save` is written never to throw, and `afterStep` runs only after a `step` and a `save` that returned; no `try` is added around `save`. | A Cue or a title is requested only for a state that is stored; the `dispatch` contract belongs to `controls-and-access`. | Error Handling |
| D29 | The lateness is `now - endedAt` with no clamp. A negative value (clock skew, a `now` before `endedAt`) passes `<=` and plays; a non-finite `now` fails it and gives no end Cue. | The engine never produces `endedAt > now`; a clamp would add a branch with no input that reaches it. | 3.1, Error Handling |
| D30 | Run order: `ghosts-and-graveyard` is built first. This spec's strings, `cardLines` and graveyard wording tasks run after the matching ghosts-and-graveyard tasks, because `src/graveyard/` does not exist yet; the `main.ts` edits come after its task 16. The cue, title and Hidden_Tick modules do not depend on it. | CR5, CR6, CR9 and CR13 edit that spec's files and tests. | 6.2 (CR18) |
| D31 | The first-gesture wiring is armed in `main.ts` before any control exists. | Capture on `document` then runs before the controls' handlers (R4.16). | 2.3 |
| D32 | Tests: the fake `AudioContext` is installed from the test's `addInitScript`; the hidden tab is emulated by `visibilityState` plus a held `requestAnimationFrame` installed after load. | No hook in shipped code; `page.clock.install` could overwrite an earlier wrapper. | 8.5 |
| D33 | Mutation checks (8.4) are run by hand before a property is accepted. | A property that cannot fail is not accepted. | 8.4 |

### Risks

- **K1. P9 may fail (a risk, not a known bug).** If an extra `tick` while hidden changes a hide span, a ghost span or the distraction count, the build stops and reports the counterexample and the seed. It is not worked around in this spec. It is an engine finding for `distraction-tracking` (CR8).
- **K2. Throttled timers.** Real browsers may wake a hidden tab once a minute, freeze it, or discard it. The time stays right (timestamps); the title and the Cue are late; a Cue later than 120000 ms is skipped. Accepted (D10). Not verifiable by Playwright (8.7).
- **K3. Autoplay rules, Safari first.** Safari and mobile browsers decide what counts as activation for `AudioContext.resume()`. The design unlocks inside the gesture and retries `resume()` once inside the handler that caused each Transition (D19), but cannot prove it on a real device. If a browser refuses, sound stays silent and nothing else changes (R4.12).
- **K4. Real-device audio quality.** The recipes are numbers checked by tests; whether they sound good, are quiet enough and are told apart on a phone speaker is a listening test by the owner. If not, only the numbers in `specs.ts` change.
- **K5. Contrast and reduced motion.** Checked by the Costume_Reviewer (R9.9), not by a property; findings are recorded under D9.

