# Design Document

## Overview

This design covers the three Web Audio cues (strike, chime, breath), the page-title countdown, the background-tab tick that keeps both honest, and the final wording of the strings file for Candlewatch. It reads the engine's state and selectors, the `sound` setting and `formatTime`. It stores nothing new, sends no engine event except `tick` from the Hidden_Tick, and changes neither the engine, the scene model, the stored documents nor `render.yaml`.

The text refers to its parts by number ("section 3.2", "Decision D15"). The headings are:

1. Architecture (section 2): the files, the boundaries and the data flow of `dispatch` after the change.
2. Components and Interfaces (section 3): `cue.ts`, `specs.ts`, the Audio_Player and the gesture listener, `title.ts`, `wake.ts`, the Hidden_Tick source, the title adapter and `after-step.ts`, with signatures and rules.
3. Data Models: the in-memory shapes (Cue, Cue_Spec, Cue_Context); nothing is stored.
4. Section 4: Strings: the Strings_Table and the page-title templates (D7, D12, D13).
5. Section 5: Accessibility: where each cue's state change is also drawn and announced.
6. Section 6: Change requests to other specs and files (CR1 to CR9 of the requirements, with the exact edits).
7. Error Handling (section 7).
8. Testing Strategy (section 8).
9. Correctness Properties (section 9): P1 to P11 of the requirements, refined.
10. Section 10: Decisions (D1 to D13 of the requirements, plus D14 and later added here).

Only the first two headings (Overview and Architecture) are written so far. Later sections are appended in order and read the files, names and numbers of section 2 without restating them as new choices.

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
  audio-player.ts       createAudioPlayer(deps) -> { play, setSound, unlock, state },
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
  hidden-tick.ts        createHiddenTick(deps) -> { start, stop, pending }                         effect (the only timer owner, R1.5)
  fake-timer.ts         FakeTimer: schedule, cancel, advance(ms), a settable clock                 test-only
  test-kit.ts           arbitraries for states and times; a script runner with extra ticks         test-only
  purity.test.ts        the purity scan for title and wake
  title.test.ts, title.prop.test.ts, wake.test.ts, wake.prop.test.ts,
  title-adapter.test.ts, hidden-tick.test.ts, hidden-tick.prop.test.ts

src/after-step.ts       createAfterStep(deps) -> (prev, next, event, now) => void                  effect (composes cueFor, the player, the title and the Hidden_Tick control, CR1)
src/after-step.test.ts  the order and the one-Cue-per-event rule with recording fakes
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

The Reload_Settle path. Step 4's `step(... reload ...)` is the only place where a transition can be found without `dispatch`. It never reaches `afterStep`, so no Cue is chosen: a candle that burned out while the page was closed plays nothing (R2.6, R2.10). The title is written once from that state, before the first frame (R6.14). The `reload` event type is also a null in `cueFor` (R2.6), a second guard for any future caller. The `hide` or `show` sent by the visibility sync in step 7 is a normal Live_Transition: the engine may settle a stored `lit` session there only through `tick`-like settling of its own `reload` step, which already ran, so step 7 changes the phase only when `now` has moved past a boundary between `loadNow` and the sync clock read, which is a Live_Transition found within milliseconds of its moment, and a Cue is correct for it.

The Visible_Loop path. Each frame: `dispatch({ type: "tick" }, now)` runs `step`, then `afterStep` (a Cue if the phase just changed, then the title), then the frame paints from `state`. A burn-out found in a visible frame therefore chimes once, in the frame that finds it, and the dawn is drawn in that same frame. While the page is visible the Hidden_Tick has no timer (R5.11).

The hidden tick path. `hidden.start(now)` reads `wake = nextWakeMs(getState(), now)`. If it is null it arms nothing. Otherwise it calls `schedule(callback, wake)`. The callback is:

```ts
const callback = (): void => {
  pending = null;
  const now = clock();                              // read when the timer runs (R5.1)
  dispatch({ type: "tick" }, now);                  // same dispatch: Cue and title included
  const wake = nextWakeMs(getState(), clock());
  if (wake !== null && running) pending = schedule(callback, wake);   // R5.2, R5.6, R5.13
};
```

`stop()` sets `running = false` and cancels `pending`. A `tick` from this path settles by timestamps, so a throttled or late timer gives the right time left and the right phase; the Cue and the title follow at the late tick (R5.9). It does not paint: the Visible_Loop is the only code that calls `scene.apply` and `ui.update` (R5.20).

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
- **D14. The cues live in the existing `src/audio/`.** The user-level brief for this design named a new `src/sound/`; `structure.md` and CR7 of the requirements already name `src/audio/` for "Web Audio cues", and the folder exists. A second folder for the same thing would split one concern in two, so `src/audio/` is used. The title and the tick are page concerns, not audio, so they go in `src/page/`. If the owner prefers `src/sound/`, the change is a rename in `structure.md` and this section; no rule depends on the folder name.
- **D15. The Hidden_Tick is driven by `hide` and `show` inside `dispatch`, not by a second listener.** Reason: the order (engine first, timer after) then holds by construction (R5.16, R5.17), the startup sync is covered by the same path (R5.12), and `wireVisibility` stays untouched (R5.15). The cost is that `afterStep` knows two event names. CR3 of the requirements says "on `visibilitychange`"; this is the same trigger seen one step later, through the events `wireVisibility` sends.
- **D16. `settings` is loaded before `dispatch` is defined.** Reason: `afterStep` reads `settings.sound` at the moment of each Transition (R2.13), and the startup visibility sync dispatches before the interface is created. Today `settings` is loaded after `dispatch`; moving it up changes no behaviour, because nothing reads it earlier.
- **D17. `afterStep` runs for every event, changed or not.** Reason: the title needs the new `now` even when the state object is the same. The cost is one `titleFor` and one string compare per frame; `cueFor` returns null at once when the phase is kept.
- **D18. Cues are requested after `save`.** Reason: a failing or slow player cannot delay or lose the write of the session (R1.8). `afterStep` catches nothing itself; the player and the adapter are written not to throw (section 7).
