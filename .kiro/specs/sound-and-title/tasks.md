# Implementation Plan: sound-and-title

## Overview

Implements `design.md` against `requirements.md` in this folder: the three Web Audio cues (strike, chime, breath), the page-title countdown, the Hidden_Tick that keeps both honest in a background tab, and the final wording of `src/strings.ts`. The plan follows the design's order: the pure modules first (`src/audio/` cue choice, specs and noise; `src/page/` title and wake) with their required property tasks and purity tests; then the effect modules with their fakes (audio player, gesture, title adapter, Hidden_Tick, `after-step.ts`) with their property tasks; then the wiring in `main.ts`, the change requests to other specs, the final wording and the graveyard text changes; then the browser tests E1 to E10, the screenshots, the costume review and the wrap-up.

The plan runs in **four CLI batches**. Each batch ends with a checkpoint and a marker line ("Batch N ends here"). Start a new CLI session per batch, run the tasks of that batch in order, and stop at the marker.

| Batch | Tasks | Content |
|---|---|---|
| 1 | 1 to 5 | Pure modules and their property tasks: `cueFor` (P1, P2, P4), noise and Cue_Specs (P5), the `pageTitle` strings, `titleFor` (P6, P7), `nextWakeMs` (P8), the purity tests. Nothing is wired: the build stays as it was |
| 2 | 6 to 12 | Effect modules with fakes: Audio_Player and Fake_AudioContext (P10, P15), first-gesture listener, title adapter (P13), Hidden_Tick and FakeTimer (P12, P9), `after-step.ts` (P14, P3), the effect-file purity scans |
| 3 | 13 to 18 | `main.ts` wiring, change requests to other specs, final wording in `strings.ts`, `formatCarvedDate` and `cardLines` changes (P11), strings tests |
| 4 | 19 to 27 | Browser tests E1 to E10, screenshots, costume review, wrap-up |

Run order with `ghosts-and-graveyard` (design D30, CR18): that spec is built **first**. Tasks marked **Requires the ghosts-and-graveyard build** (14.2, 15.1, 16.1, 16.2, 16.3, 17.1, 24.1, 25.1, 25.2) edit its documents, strings groups, `src/graveyard/` files or screenshots. Before such a task, check that `src/graveyard/days.ts` and `src/graveyard/text.ts` exist (and, for 25.x, that `docs/screenshots/` holds `graveyard-*` files). If they do not, **stop that task and report** "ghosts-and-graveyard is not built"; do not create `src/graveyard/` or its files, and do not invent its screenshots. The modules of batches 1 and 2, task 13 and task 14.1 do not depend on that spec.

Conventions for every task:

- TypeScript strict, no `any`, exact dependency versions, **no new dependency** of any kind, runtime or test (R1.9). No sound file, no font, no network request. No DOM library for Vitest: the effect files take their globals (clock, timer functions, `document`, the `AudioContext` factory, the event target) as arguments and are tested with fakes.
- **No test hook in shipped code** (R9.3). No `window.__...` global, no exported setter, no `if (test)` branch in a shipped file. Browser tests install their fake `AudioContext` and their hidden-tab helpers from their own `addInitScript` and `page.evaluate`.
- Tests are colocated next to the source (`*.test.ts`, `*.prop.test.ts`); Playwright tests are `*.spec.ts` in `e2e/`. Test-only helpers (`src/audio/test-kit.ts`, `src/audio/fake-audio-context.ts`, `src/page/test-kit.ts`, `src/page/fake-timer.ts`, `e2e/sound-fixtures.ts`) are never imported by a shipped file; the purity tests check it.
- **Pure files** are `src/audio/types.ts`, `src/audio/cue.ts`, `src/audio/specs.ts`, `src/audio/noise.ts`, `src/page/title.ts` and `src/page/wake.ts`. They import only `../engine` (the public index), `../strings`, `../ui/format` (`formatTime`, `fill`; `src/page/` only) and their pure siblings. They contain none of `window`, `document`, `localStorage`, `Date`, `performance`, `Math.random`, `matchMedia`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `AudioContext` (R1.2, R1.3). `Math.imul` in `noise.ts` is allowed; `Math.random` is not.
- **Effect files** (`audio-player.ts`, `gesture.ts`, `title-adapter.ts`, `hidden-tick.ts`, `after-step.ts`) take every global as an argument. `audio-player.ts` names `window` and `AudioContext` only inside `browserAudioFactory`; `hidden-tick.ts` never names `Date`, `requestAnimationFrame` or `AudioContext`; `title-adapter.ts` is the only file in `src/` that assigns `document.title`; the Hidden_Tick sends only `{ type: "tick" }` (R1.4, R1.5, R1.7).
- All user-visible text lives in `src/strings.ts` (R1.10). The folders `src/audio/` and `src/page/` hold only cue ids, numbers and keys. The trademarked timer word appears nowhere in source, tests, documents or strings (R1.11); where a test must name it, build it at run time from fragments the way the existing strings test does. Every text that names a session says "focus session".
- Property-test tasks are **required**, not optional. Every property test uses the engine's shared `PROP_PARAMS` (300 runs) from `src/engine/test-kit.ts`, never a literal lower `numRuns`, and carries the tag `Feature: sound-and-title, Property N: <title>`. Never weaken a property to make it pass. If a property fails, report the shrunk counterexample and the seed, say whether the bug is in the code or the test, and fix the right one.
- **Mutation check** (design 8.4, D33): where a property task names one, apply the named fault to the source by hand, run only that property file (`npx vitest --run <file>`), confirm it fails, then revert the fault and check with `git diff` that the source is back. If the property survives, strengthen the test (a sharper assertion or generator), never the code under test, and note it in the task result. A property that cannot fail is not accepted.
- Pure code never reads the clock: every function takes `now`. Elapsed time comes from timestamps, never from counting ticks (`tech.md` rule 1). Distractions never change the time left.
- A task is done only when `npm run verify` passes (type-check and lint, unit tests, build, e2e) unless its note names a narrower check. In batches 1 and 2 the new modules are not imported by any shipped file yet, so `verify` stays green by construction.
- **`KIRO_USAGE.md` entries (R9.10)**, as in the other specs: one entry at each of the checkpoints of tasks 5, 12 and 18, and the final entry in the wrap-up (task 27.2), which also covers batch 4. Each entry records the surface, what was built, property failures with their seeds (or none), the mutation results, the screenshot checks, the costume review and the counts, as far as that batch has them (write "none yet" for screenshots and the review before batch 4).
- **The two `.kiro/steering/` edits** (CR7 for `structure.md`, CR15 for `tech.md`) are made by Kiro in the wrap-up, task 27.2, and in no earlier task.
- Each batch's checkpoint reports the unit file and test counts from `npm run verify`, and its `KIRO_USAGE.md` entry holds them.

## Tasks

- [ ] 1. Cue choice (`src/audio/types.ts`, `src/audio/cue.ts`)
  - [ ] 1.1 Types, `cueFor`, the audio test-kit and the unit tests
    - Create `src/audio/types.ts` with `Cue`, `CueContext` (`eventType`, `sound`, `now`), `GainPoint`, `Waveform`, `FilterKind`, `FilterSpec`, `OscVoice`, `NoiseVoice`, `Voice` and `CueSpec` exactly as design 3.1 and 3.2. Create `src/audio/cue.ts` with `LATE_CUE_LIMIT_MS = 120000` and `cueFor(prev, next, context)`: the six rules of design 3.1 tried in order (sound off, `reload`, strike, chime, breath, fallback `null`); lateness is `context.now - next.endedAt`, computed only for the end Cues, not clamped, end Cue plays when `lateness <= LATE_CUE_LIMIT_MS`, a non-finite `now` gives no end Cue, never throws (D29). Remove `src/audio/.gitkeep` now that the folder has files.
    - Create `src/audio/test-kit.ts` (test-only) with `arbPhasePair` (all 25 ordered pairs, built from states picked out of `runScript` traces and from hand-built `burned-out` and `snuffed` states with a chosen `endedAt`), `arbCueContext` (event type from the engine's event names, `sound`, `now` near `endedAt` with offsets that include 0, 119999, 120000, 120001, large values and negative values down to -200000), and `referenceCue(prevPhase, nextPhase, eventType, sound, lateness)`: a lookup keyed by `"<prev>><next>"` plus a lateness test written as `lateness > 120000` negated, with `sound` false or `reload` as its first line, so it cannot copy the code's mistakes. Re-export `PROP_PARAMS`. The gesture-script arbitrary is added in task 6.3.
    - Create `src/audio/cue.test.ts`: the 25 ordered phase pairs against the table in design 3.1; the Late_Cue_Limit at 119999, 120000 and 120001 ms for `chime` and `breath`; `strike` found 10 minutes after the previous `idle` state still strikes; `reload` and sound off give `null`; a negative lateness (`now` 1 ms before `endedAt`) plays; a NaN and an infinite `now` give no end Cue and do not throw; the break (`burned-out` to `burned-out`) gives `null`.
    - Files: `src/audio/types.ts`, `src/audio/cue.ts`, `src/audio/test-kit.ts`, `src/audio/cue.test.ts`, `src/audio/.gitkeep` (deleted).
    - _Requirements: R1.1, R1.2, R2.1 to R2.13, R9.2_

  - [ ] 1.2 Required: P1, no Cue when sound is off or on reload
    - **Property 1: No Cue when sound is off or on reload**
    - Create `src/audio/cue.prop.test.ts` (tag Property 1): for any two states, any event type, any `now` and any `sound`, `cueFor` returns `null` when `sound` is false and returns `null` when the event type is `reload`.
    - Mutation check (P1): in `cueFor`, ignore `context.sound` (delete rule 1); confirm P1 fails; revert. Then delete the `reload` rule (rule 2); confirm P1 and the `reload` unit test fail; revert.
    - Files: `src/audio/cue.prop.test.ts`.
    - **Validates: Requirements 2.6, 2.7, 2.13**

  - [ ] 1.3 Required: P2, `cueFor` agrees with the reference table
    - **Property 2: cueFor agrees with the reference table**
    - Add Property 2 to `src/audio/cue.prop.test.ts` (tag Property 2): for any two states reached by a generated script, any live event type, sound on and `now` within the Late_Cue_Limit, `cueFor` equals `referenceCue`; the result is always one of `strike`, `chime`, `breath` or `null`; at most one Cue is returned; a break (`isBreak` true or false on the same `burned-out` state) does not change the result.
    - Mutation check (P2): swap the `strike` and `chime` results of rules 3 and 4; confirm P2 and the 25-pair unit test fail; revert. Then return `breath` for `paused` to `burned-out`; confirm P2 fails; revert.
    - Files: `src/audio/cue.prop.test.ts`.
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.8, 2.9**

  - [ ] 1.4 Required: P4, the Late_Cue_Limit decides end Cues and never strikes
    - **Property 4: The Late_Cue_Limit decides end Cues and never strikes**
    - Add Property 4 to `src/audio/cue.prop.test.ts` (tag Property 4): for any Transition from `lit` or `paused` to `burned-out` or `snuffed` with sound on, `cueFor` is `null` exactly when `now - endedAt > 120000`, otherwise `chime` or `breath` by the next phase; for any Transition to `lit` from `idle`, `burned-out` or `snuffed` the result is `strike` whatever the delay. The generator includes offsets 119999, 120000, 120001, large positive values and negative values.
    - Mutation check (P4), three faults, each applied, caught and reverted: (a) change `<=` to `<` (or use `LATE_CUE_LIMIT_MS + 1`); (b) apply the lateness rule to `strike`; (c) compute the lateness as `Math.abs(now - endedAt)`. Each must fail P4 and the matching unit test.
    - Files: `src/audio/cue.prop.test.ts`.
    - **Validates: Requirements 2.11, 2.12, 5.22**

- [ ] 2. Noise and the three Cue_Specs
  - [ ] 2.1 `src/audio/noise.ts`
    - Create `noiseSamples(seed, count)` with the local mulberry32 of design 3.2: samples in [-1, 1), the same `(seed, count)` gives the same array, a prefix of a longer array equals the shorter one, `count` is floored, a negative, NaN or infinite `count` gives an empty array, `seed` is read as an unsigned 32-bit integer. It imports nothing.
    - Create `src/audio/noise.test.ts`: equal arrays for equal inputs; prefix stability; range; bad counts; two different seeds differ.
    - Files: `src/audio/noise.ts`, `src/audio/noise.test.ts`.
    - _Requirements: R3.4, R3.5_

  - [ ] 2.2 `src/audio/specs.ts`
    - Create `MASTER_GAIN = 0.5`, `CUE_SPECS` and `cueSpec(cue)` with the recipes of decision D1 (design 3.2): `strike` 400 ms (noise scratch seed `0x5ca7c4`, bandpass 4000 to 2500 Hz, q 0.8, gain points [0,0] [8,0.24] [100,0]; triangle flare 160 to 110 Hz from 60 ms, [60,0] [75,0.14] [400,0]); `chime` 2000 ms (sines 660, 880, 1320 Hz at 0, 140, 280 ms, peaks 0.14, 0.12, 0.08, ends 1400, 1700, 1900); `breath` 900 ms (noise seed `0xb2ea71` lowpass 2400 to 700 Hz q 0.7 [0,0] [60,0.30] [900,0], and noise seed `0x0d15ea` bandpass 1800 to 900 Hz q 0.9 [0,0] [40,0.08] [700,0]). Plain data only: numbers, strings and arrays; the same object on every call; the reduced-motion preference never enters it (R3.11).
    - Create `src/audio/specs.test.ts`: each number against D1 (ids, durations 400, 2000, 900; scratch 100 ms and flare 160 to 110 Hz starting at 60 ms; chime frequencies and decays at least 600 ms; breath cutoff ratios 0.29 and 0.5; rise and fall lengths); the sums of voice peaks times `MASTER_GAIN` (0.19, 0.17, 0.19) are at most 0.2; every frequency and cutoff is above 0 (exponential ramps are valid); no function or object other than plain arrays and records in the data; `JSON.parse(JSON.stringify(spec))` equals the spec.
    - Files: `src/audio/specs.ts`, `src/audio/specs.test.ts`.
    - _Requirements: R3.1 to R3.12, R9.2_

  - [ ] 2.3 Required: P5, Cue_Specs obey the sound rules
    - **Property 5: Cue_Specs obey the sound rules**
    - Create `src/audio/specs.prop.test.ts` (tag Property 5), one property over `fc.constantFrom("strike", "chime", "breath")`, with repeated calls for equality: `cueSpec(cue)` is deeply equal across calls and across a simulated reduced-motion preference (there is no input for it, so the test calls twice around a changed `matchMedia` stub and asserts equality); duration above 0 and within 700, 2500 and 1200 ms; the sum over voices of the peak gain times `MASTER_GAIN` at most 0.2; every voice peak above 0; `MASTER_GAIN` in (0, 1]; every envelope starts and ends at gain 0, rises at least 5 ms and falls at least 20 ms, has non-decreasing times inside [0, duration]; `strike` has a noise scratch of 40 to 150 ms and a tonal partial of 80 to 220 Hz starting inside the scratch window; `chime` has at least two tonal voices between 200 and 2000 Hz with decays of at least 600 ms; `breath` has only noise voices whose end cutoff is at least 30% lower than the start; the three ids and the three durations differ.
    - Mutation check (P5): set `MASTER_GAIN` to 0.6; confirm P5 fails; revert. Then end one voice envelope at gain 0.01; confirm P5 fails; revert.
    - Files: `src/audio/specs.prop.test.ts`.
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11**

- [ ] 3. Page title and wake delay (`src/page/`)
  - [ ] 3.1 The `pageTitle` strings, and the matching `src/ui/strings.test.ts` exemption
    - Add the `pageTitle` group to `src/strings.ts` with the final wording of design 4.2 and no other change to the file: `lit` `{time} · {name}`, `paused` `{time} paused · {name}`, `burnedOut` `Morning · {name}`, `snuffed` `Dark · {name}` (separator U+00B7 with a space on each side, inside the templates). Keep `as const` and the nested shape (R8.6).
    - CR12, first part: in `src/ui/strings.test.ts` add `"pageTitle"` to `NOT_THIS_SPEC`; its keys are used by `src/page/title.ts`, outside `src/ui/`, and without this the "every new key is used" check of that file fails the moment the group exists. The other groups named in CR12 (`count`, `ghosts`, `graveyard`) are added to the set in task 15.1, when they get this spec's wording. Note this ordering in the task result.
    - Files: `src/strings.ts`, `src/ui/strings.test.ts`.
    - _Requirements: R6.6, R8.2, R8.6_

  - [ ] 3.2 `src/page/title.ts`, the page test-kit and the unit tests
    - Create `titleFor(state, now)` exactly as design 3.5: one `switch` on `state.phase` with no default; `idle` returns `STRINGS.title`; `lit` and `paused` fill the templates with `formatTime(timeLeftMs(state, now))` and `name = STRINGS.title`; `burned-out` and `snuffed` fill the dawn and dark forms with no time. Imports: `timeLeftMs` from `../engine`, `STRINGS`, `fill` and `formatTime` from `../ui/format`. No literal `paused`, `Morning`, `Dark` or separator in the file; the intent is never read.
    - Create `src/page/test-kit.ts` (test-only) with `arbLitState`, `arbAnyState` (both built from `runScript` traces) and `arbNonDecreasingTimes` (a start and a list of non-negative gaps); re-export `PROP_PARAMS`. The `runWithExtraTicks` helper is added in task 9.1.
    - Create `src/page/title.test.ts`: one example per phase against the forms of R6.1 to R6.5 (`Candlewatch`, `12:31 · Candlewatch`, `12:31 paused · Candlewatch`, `Morning · Candlewatch`, `Dark · Candlewatch`); the paused title is the same at two different `now` values; a break and a finished dawn give one title; a NaN and an infinite `now` give `00:00 · Candlewatch` for `lit` and do not throw; a long and a distinctive intent never appears; `1 ms` left reads `00:01`; and a file check that `index.html` holds `<title>Candlewatch</title>` exactly (R6.16, read with `node:fs`).
    - Files: `src/page/title.ts`, `src/page/test-kit.ts`, `src/page/title.test.ts`.
    - _Requirements: R1.1, R6.1 to R6.9, R6.15 to R6.17, R9.2_

  - [ ] 3.3 Required: P6, the title carries the time left and no intent
    - **Property 6: The title carries the time left and no intent**
    - Create `src/page/title.prop.test.ts` (tag Property 6): for any state reached by a generated script and any `now`, `lit` equals the `pageTitle.lit` template filled with `formatTime(timeLeftMs(state, now))`, `paused` the `pageTitle.paused` template filled the same way, `burned-out` and `snuffed` give the dawn and dark forms with no time, `idle` equals `STRINGS.title`; the time in the title equals the time that `viewOf` shows as the Time_Text for the same state and `now`; no title contains the session's intent (use an intent of at least 3 characters that does not occur in the fixed strings).
    - Mutation check (P6): build the title time from `timeLeftMs(state, now + 1000)`; confirm P6 fails; revert. Then append the intent to the title; confirm P6 fails; revert.
    - Files: `src/page/title.prop.test.ts`.
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.8, 6.9, 6.15, 6.17**

  - [ ] 3.4 Required: P7, the title changes at most once per second while lit
    - **Property 7: The title changes at most once per second while lit**
    - Add Property 7 to `src/page/title.prop.test.ts` (tag Property 7): for any `lit` state and any non-decreasing list of times, the number of changes in the sequence of titles is at most the number of whole seconds of time left crossed, and the Title_Time never increases.
    - Mutation check (P7): make the title include tenths of a second (for example `Math.floor(now / 100)`); confirm P7 fails; revert.
    - Files: `src/page/title.prop.test.ts`.
    - **Validates: Requirements 6.11**

  - [ ] 3.5 `src/page/wake.ts`
    - Create `WAKE_MAX_MS = 1000`, `WAKE_MIN_MS = 1` and `nextWakeMs(state, now)` exactly as design 3.6: `lit` uses `clampWake(timeLeftMs(state, now))`, `paused` uses `clampWake(pauseLeftMs(state, now))`, other phases give `null`; `clampWake` returns `WAKE_MAX_MS` for NaN and otherwise `min(max(ms, WAKE_MIN_MS), WAKE_MAX_MS)`. Imports `timeLeftMs` and `pauseLeftMs` from `../engine`.
    - Create `src/page/wake.test.ts`: zero left gives 1; 0.4 gives 1; 1 gives 1; 999 gives 999; exactly 1000 gives 1000; 1001 and 5000 give 1000; `idle`, `burned-out`, `snuffed` give `null`; paused with 10 minutes of allowance and with 0 left; a non-finite `now` in `lit` gives 1; the table of design 3.6 row by row (Infinity, -Infinity, NaN through the clamp, tested on the exported rule or an equivalent state).
    - Files: `src/page/wake.ts`, `src/page/wake.test.ts`.
    - _Requirements: R5.3, R5.4, R5.5, R9.2_

  - [ ] 3.6 Required: P8, the wake delay is bounded and never passes the end
    - **Property 8: The wake delay is bounded and never passes the end**
    - Create `src/page/wake.prop.test.ts` (tag Property 8): for any state and any `now`, `nextWakeMs` is in (0, 1000] when the phase is `lit` or `paused` and `null` otherwise; in `lit` it is at most `max(timeLeftMs, 1)`; in `paused` it is at most `max(pauseLeftMs, 1)`; it is never 0.
    - Mutation check (P8): remove the cap so the wake can pass the end moment; confirm P8 fails; revert. Then return 0 instead of the 1 ms floor; confirm P8 fails; revert.
    - Files: `src/page/wake.prop.test.ts`.
    - **Validates: Requirements 5.3, 5.4, 5.5**

- [ ] 4. Purity tests for the pure modules
  - [ ] 4.1 `src/audio/purity.test.ts` and `src/page/purity.test.ts`
    - Copy the technique of `src/ui/purity.test.ts` (strip comments, match whole words). `src/audio/purity.test.ts` scans `types.ts`, `cue.ts`, `specs.ts`, `noise.ts`; `src/page/purity.test.ts` scans `title.ts` and `wake.ts`. Each fails if a file contains any of `window`, `document`, `localStorage`, `Date`, `performance`, `Math.random`, `matchMedia`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `AudioContext`, or imports anything outside the allowed list of design 2.2 (`src/audio/` imports only `../engine`, `../strings` and siblings; `src/page/` also `../ui/format`).
    - Also check: `title.ts` contains no literal copy of the paused, dawn and dark words or of the separator; no file in either folder contains the trademarked timer word (case-insensitive, built from fragments); no shipped file in the repo imports `test-kit.ts`, `fake-audio-context.ts` or `fake-timer.ts`; every string literal in the pure files is a cue id, a waveform name, a filter kind or a phase name (no visible text, R1.10).
    - Files: `src/audio/purity.test.ts`, `src/page/purity.test.ts`.
    - _Requirements: R1.2, R1.3, R1.10, R1.11, R6.6_

- [ ] 5. Checkpoint - Batch 1 ends here
  - Run `npm run verify`. Ensure all tests pass, ask the user if questions arise. Confirm P1, P2, P4, P5, P6, P7, P8 ran at 300 runs through `PROP_PARAMS` with no skipped, `only` or `todo` tests, that every mutation named above was caught and reverted (`git diff` on the sources shows only the intended files), and that no shipped file imports the new modules yet. Report the unit file and test counts.
  - Add the batch 1 entry to `KIRO_USAGE.md` (R9.10): surface, what was built (tasks 1 to 4), property failures with their seeds or "none", the mutation results, screenshots and costume review "none yet", and the counts.
  - Files: `KIRO_USAGE.md`.

> **Batch 1 ends here.** Stop this CLI session. Start batch 2 with task 6.

- [ ] 6. The Audio_Player and the Fake_AudioContext
  - [ ] 6.1 `src/audio/fake-audio-context.ts`
    - Create `FakeAudioContext` (test-only) implementing `AudioContextLike` as in design 8.3: records every created node with its type and parameter calls (`setValueAtTime`, `linearRampToValueAtTime`, `exponentialRampToValueAtTime`, `cancelScheduledValues`), every `start` and `stop` time, every `connect` and `disconnect`, and counts of construction and `resume()` calls. Options: `resumeMode` (`"instant"` flips the state in the call, `"deferred"` flips it in a microtask, `"never"` leaves it `suspended`, `"throw"` rejects) and `throwOn` (a method name that throws). `advance(ms)` moves `currentTime` and fires `onended` of a node once its `stop` time has passed; `sounding()` returns the Cues whose `cueGain` is above 0 at the current time (used by P15). Also export a small factory helper that counts calls.
    - Create `src/audio/fake-audio-context.test.ts` as a short self-test: the options behave as named, `onended` fires after `advance`, `sounding()` follows a fade.
    - Files: `src/audio/fake-audio-context.ts`, `src/audio/fake-audio-context.test.ts`.
    - _Requirements: R4.13, R9.2, R9.3_

  - [ ] 6.2 `src/audio/audio-player.ts` and the unit tests
    - Create the `*Like` interfaces, `createAudioPlayer(deps)` and `browserAudioFactory()` exactly as design 3.3: states `locked`, `unlocked`, `failed`; `unlock()` calls the factory once and `resume()` in the same call; `play(cue)` follows rules 1 to 6 (drop when locked, failed or sound off; start when the context is `running`; one `resume()` per request; one held request for the promise of its own `resume()` call, replaced by a newer request, cleared by `setSound(false)`; `closed` sets `failed` and drops, D26); each Cue gets its own gain node; a 30 ms fade of the sounding Cue before a new one starts; an idempotent `release()` on every `onended`; envelope points become `setValueAtTime` and `linearRampToValueAtTime` calls, glides use `exponentialRampToValueAtTime`; noise buffers come from `noiseSamples`. The whole of `play` is inside one `try`; a throw sets `failed`, releases what was built and is not rethrown. No `setTimeout`, no `<audio>`, no `Audio(`, no `fetch`, no `webkitAudioContext`.
    - Create `src/audio/audio-player.test.ts` with `FakeAudioContext`: nothing is constructed at creation; `unlock()` constructs once and calls `resume()` in the same call; sound off constructs nothing; `play` before unlock is dropped and not replayed after unlock; a `suspended` context whose `resume()` flips the state starts the Cue; one that leaves it `suspended` drops it; a deferred `resume()` starts the held request once and only the latest; `setSound(false)` fades within 50 ms and clears the held request; `setSound(true)` before any gesture unlocks; a second Cue fades the first in 30 ms; every node is disconnected after `advance`; a factory returning `null`, a factory that throws, a context in state `closed` and a node call that throws all end `failed` silently with the timer, title and scene untouched; the voice envelope calls match `CUE_SPECS` for each Cue.
    - Files: `src/audio/audio-player.ts`, `src/audio/audio-player.test.ts`.
    - _Requirements: R4.1 to R4.15, R9.2_

  - [ ] 6.3 Required: P10, the player never makes a sound by surprise
    - **Property 10: The player never makes a sound by surprise**
    - Add `arbGestureScript` to `src/audio/test-kit.ts` (a list of `gesture`, `request(cue)`, `setSound(on)`, `advance(ms)` and `settle` steps). Create `src/audio/audio-player.prop.test.ts` (tag Property 10): for any script against an injected factory, the factory is called at most once, never before the first gesture that the sound setting allows, and never while sound has been off since the start; a Cue sounds only when the player is unlocked with sound on and the context is running; a request made before unlock never sounds afterwards; a request made while sound is off is never replayed.
    - Mutation check (P10): call the factory inside `createAudioPlayer` instead of inside `unlock()`; confirm P10 fails; revert. Then let `play` create the context when `locked`; confirm P10 fails; revert.
    - Files: `src/audio/test-kit.ts`, `src/audio/audio-player.prop.test.ts`.
    - **Validates: Requirements 4.1, 4.2, 4.5, 4.6, 4.8, 4.9, 4.14**

  - [ ] 6.4 Required: P15, at most one Cue sounds at a time
    - **Property 15: At most one Cue sounds at a time**
    - Add Property 15 to `src/audio/audio-player.prop.test.ts` (tag Property 15): for any sequence of Cue requests and time advances against the `FakeAudioContext`, at any instant 50 ms after the last request at most one Cue is sounding; a replaced Cue is silent within 50 ms; when sound is turned off the sounding Cue is silent within 50 ms; after every source has ended all nodes the player created are disconnected.
    - Mutation check (P15): skip `fadeOut(current)` when a new Cue starts; confirm P15 fails; revert. Then leave the held request alive after `setSound(false)`; confirm P15 fails (strengthen the generator with a deferred `resume()` if it survives); revert.
    - Files: `src/audio/audio-player.prop.test.ts`.
    - **Validates: Requirements 4.7, 4.10, 4.11**

- [ ] 7. The first-gesture listener
  - [ ] 7.1 `src/audio/gesture.ts`
    - Create `armFirstGesture(target, wanted, unlock)` exactly as design 3.4: `keydown`, `pointerdown` and `touchend` added with `{ capture: true }` (and `passive: true` on `touchend`), one shared handler, removed with `{ capture: true }`. The handler returns at once when `wanted()` is false (listeners stay armed); otherwise it calls `unlock()` inside a `try`, then `disarm()` in the same dispatch (also when `unlock()` returns false). It calls neither `preventDefault` nor `stopPropagation`. `disarm` is safe to call twice.
    - Create `src/audio/gesture.test.ts` with a 20-line recording target: three listeners in the capture phase; the first event with sound on unlocks and removes all three in the same dispatch; with sound off nothing is created and the listeners stay armed; a later turn-on plus the next gesture finds an unlocked player and disarms; an `unlock` that returns false or throws still disarms; Escape is not required (any key counts); `disarm` twice is safe.
    - Files: `src/audio/gesture.ts`, `src/audio/gesture.test.ts`.
    - _Requirements: R4.2, R4.4, R4.6, R4.16, R4.17, R9.2_

- [ ] 8. The title adapter
  - [ ] 8.1 `src/page/title-adapter.ts`
    - Create `createTitleAdapter(doc)` exactly as design 3.8: the first write compares with `doc.title` once; later writes compare with the last known string and drop equal ones; a non-string is ignored; a throwing getter or setter is caught and `known` is left unchanged so the next call retries; no timer, no clock, no `requestAnimationFrame`.
    - Create `src/page/title-adapter.test.ts`: the first write equal to the page's title does not write; equal writes are dropped; a changed string writes; a throwing setter keeps `known` and retries on the next call; `last()` is `null` before the first write; the write count after a reload is one.
    - Files: `src/page/title-adapter.ts`, `src/page/title-adapter.test.ts`.
    - _Requirements: R1.4, R6.10, R6.11, R6.12, R6.14, R9.2_

  - [ ] 8.2 Required: P13, the title adapter writes only changes
    - **Property 13: The title adapter writes only changes**
    - Create `src/page/title-adapter.prop.test.ts` (tag Property 13): for any sequence of titles and any starting `document.title`, the adapter writes only when the new title differs from the last one it knows (the write count equals the number of changes, plus one when the first title differs from the page's); for any monotone sequence of `now` values in `lit` fed through `titleFor` the writes are at most one per whole second of time left plus the phase changes.
    - Mutation check (P13): drop the equality check in the adapter; confirm P13 fails; revert.
    - Files: `src/page/title-adapter.prop.test.ts`.
    - **Validates: Requirements 6.10, 6.11, 6.12, 6.14**

- [ ] 9. The Hidden_Tick
  - [ ] 9.1 `src/page/fake-timer.ts` and the extra-tick runner
    - Create `FakeTimer` (test-only): `schedule(fn, ms)` returns an incrementing id and records the due time; `cancel(id)`; `advance(ms)` runs due timers in order while moving a settable `clock()`; `live()` counts armed timers; `lateBy(ms)` runs the next timer `ms` later than due (models throttling). Add to `src/page/test-kit.ts` `runWithExtraTicks(script, t0, extraTimes)` (runs the script through `step` and inserts `tick` events at extra times that fall between steps, merged so `now` never goes backwards) and `runWithoutExtraTicks(script, t0)` (the same script followed by one `tick` at the last `now`). Add a short `fake-timer.test.ts` self-test.
    - Files: `src/page/fake-timer.ts`, `src/page/fake-timer.test.ts`, `src/page/test-kit.ts`.
    - _Requirements: R5.1, R5.9, R9.2_

  - [ ] 9.2 `src/page/hidden-tick.ts` and the unit tests
    - Create `createHiddenTick(deps)` exactly as design 3.7: `start(now)`, `stop()`, `isRunning()`, `hasPending()`; the `armId` guard; every delay from `nextWakeMs`; `now` read from `deps.clock()` when the callback runs; only `{ type: "tick" }` is dispatched; a throw from `dispatch` is swallowed and the chain goes on; a throw from `getState` or `nextWakeMs` arms the next timer at `WAKE_MAX_MS`; the chain ends only when `nextWakeMs` returns `null` or `stop()` has run (D27). No `Date`, no `requestAnimationFrame`, no `AudioContext`.
    - Create `src/page/hidden-tick.test.ts` with `FakeTimer`: `start` after `hide` arms one timer at the wake; the callback dispatches one `tick` with `clock()`; re-arm; the tick that finds the end stops the chain; `stop` cancels; a callback that runs after `stop` does nothing; `start` twice arms once; `start` in `idle` arms nothing; a throwing `dispatch` is swallowed and the next timer is still armed at the Wake_Delay; a throwing `getState` arms the next timer at exactly 1000 ms; a late timer (`lateBy`) dispatches with the later `now`; an early timer re-arms with a shorter delay.
    - Files: `src/page/hidden-tick.ts`, `src/page/hidden-tick.test.ts`.
    - _Requirements: R1.5, R1.7, R5.1 to R5.14, R5.18, R5.20, R5.23, R9.2_

  - [ ] 9.3 Required: P12, the Hidden_Tick keeps at most one timer and stops when told
    - **Property 12: The Hidden_Tick keeps at most one timer and stops when told**
    - Create `src/page/hidden-tick.prop.test.ts` (tag Property 12): for any generated sequence of `start`, `stop`, timer advances (including late ones), state changes and injected throws from `dispatch` and `getState`, the `FakeTimer` never holds more than one live timer from the module; `hasPending()` implies `isRunning()`; no timer is armed while the phase is not `lit` or `paused`; after `stop()` no `dispatch` runs and no timer is armed, including a callback already due; the only event sent is `tick`; every `dispatch` carries the `now` that `clock()` returned when the callback ran; a throwing `dispatch` never ends the chain; a throwing `getState` arms the next timer at `WAKE_MAX_MS`; the chain ends only when `nextWakeMs` is `null` or `stop()` has run.
    - Mutation check (P12), four faults, each applied, caught and reverted: (a) remove the `armId` check in `fire`; (b) re-arm after `running` became false; (c) return from the `catch` around `dispatch`; (d) fall back to `WAKE_MIN_MS` instead of `WAKE_MAX_MS` when `getState` throws. Each must fail P12; (c) and (d) must also fail the matching unit tests.
    - Files: `src/page/hidden-tick.prop.test.ts`.
    - **Validates: Requirements 5.1, 5.2, 5.6, 5.10, 5.11, 5.13, 5.14**

  - [ ] 9.4 Required: P9, extra hidden ticks change nothing (Risk K1)
    - **Property 9: Extra hidden ticks change nothing**
    - Add Property 9 to `src/page/hidden-tick.prop.test.ts` (tag Property 9), in two parts: the engine part uses `runWithExtraTicks` against `runWithoutExtraTicks` and asserts the final states are `toEqual`, and that the distraction count and the ghost spans are equal; the Hidden_Tick part drives a real `createHiddenTick` with a `dispatch` that calls the engine's `step` and a `FakeTimer`, over generated scripts with `hide` and `show`, and asserts the same equality with the ticks the module itself sent.
    - **Risk K1 (stop-and-report rule):** if P9 fails without a mutation applied, do not work around it. Do not change the engine, the test, the runner, the generator or the property to make it pass, and do not weaken it. Stop, record the shrunk counterexample and the seed, say that a `tick` while hidden changed a hide span, a ghost span or the distraction count, and report it as an engine finding for `distraction-tracking` (CR8). Leave the rest of the batch to the owner's decision.
    - Mutation check (P9): in `fire`, dispatch `{ type: "hide" }` instead of `tick`; confirm P9 fails (the Hidden_Tick part must catch it; if only the engine part exists, strengthen the test); revert. Then make the runner's extra tick carry a stale `now` (earlier than the previous event); confirm P9 fails; revert.
    - Files: `src/page/hidden-tick.prop.test.ts`.
    - **Validates: Requirements 5.14, 5.18**

- [ ] 10. `after-step.ts`
  - [ ] 10.1 `src/after-step.ts` and the unit tests
    - Create `createAfterStep(deps)` and the `AfterStep` type exactly as design 3.9: four steps in a fixed order, each in its own `try`/`catch` (choose the Cue with `cueFor` and `deps.sound()` read at that moment; `play`; `writeTitle(titleFor(next, now))`; `hidden.start(now)` for `hide` or `hidden.stop()` for `show`). It receives the player, the adapter and the Hidden_Tick as arguments and imports no effect file.
    - Create `src/after-step.test.ts` with recording fakes: for `light` the log is `play("strike")` then `writeTitle("25:00 · Candlewatch")`; for `hide` it is `writeTitle` then `hidden.start(now)`; for `show` it is `hidden.stop()`; `reload` plays nothing; a `tick` that keeps the phase plays nothing; a throwing `play` still writes the title and starts the tick; a throwing `writeTitle` still starts the tick; a throwing `sound()` means no Cue; sound off means no `play`.
    - Files: `src/after-step.ts`, `src/after-step.test.ts`.
    - _Requirements: R1.6, R1.7, R2.1 to R2.8, R2.14, R5.16, R5.17, R6.12, R9.2_

  - [ ] 10.2 Required: P14, `afterStep` runs in order and plays at most one Cue
    - **Property 14: afterStep runs in order and plays at most one Cue**
    - Create `src/after-step.prop.test.ts` (tag Property 14): for any previous state, next state, event and `now`, `afterStep` calls `play` at most once; `play` before `writeTitle` and `writeTitle` before `hidden.start` or `hidden.stop`; `hidden.start` only for `hide` and `hidden.stop` only for `show`; it does not throw whichever of its dependencies throw.
    - Mutation check (P14): call `writeTitle` before `play`; confirm P14 and the order unit test fail; revert. Then call `hidden.start` for `show`; confirm P14 fails; revert.
    - Files: `src/after-step.prop.test.ts`.
    - **Validates: Requirements 1.6, 1.7, 5.16, 5.17, 6.12**

  - [ ] 10.3 Required: P3, at most one Cue per event, none from reload, one strike and one end Cue per session
    - **Property 3: At most one Cue per event, none from reload, one strike and one end Cue per session**
    - Add Property 3 to `src/after-step.prop.test.ts` (tag Property 3): for any generated script run through a `dispatch` built like the one in `main.ts` (`step`, then `afterStep` with a counting `play`), at most one Cue comes from each event, no Cue comes from the initial `reload` step, and over one session (from `light` to its end) there is at most one `strike` and at most one end Cue (`chime` or `breath`).
    - Mutation check (P3): call `play` a second time for the same Cue in `afterStep`; confirm P3 fails; revert. Then force the event type given to `cueFor` to `"tick"` for a `reload`; confirm P3 fails; revert.
    - Files: `src/after-step.prop.test.ts`.
    - **Validates: Requirements 1.6, 2.8, 2.10, 5.7, 5.8**

- [ ] 11. Purity scans for the effect files
  - [ ] 11.1 Extend `src/audio/purity.test.ts` and `src/page/purity.test.ts`
    - `audio-player.ts`: no `Audio(`, `<audio>`, `fetch`, `XMLHttpRequest`, `webkitAudioContext`, `setTimeout`, `.mp3`, `.wav` or `.ogg`; `window` and `AudioContext` only inside `browserAudioFactory`. `gesture.ts`: no `window` or `document`. `hidden-tick.ts`: no `Date`, `requestAnimationFrame`, `AudioContext`, `window` or `document`. `title-adapter.ts`: no `window`, `setTimeout` or `requestAnimationFrame`. `after-step.ts`: imports only `./audio/cue`, `./audio/types`, `./page/title` and `./engine`.
    - Add a scan of all non-test files under `src/`: `title-adapter.ts` is the only file that assigns `document.title` or `.title =`; `AudioContext` appears only in `audio-player.ts`; `setTimeout` and `clearTimeout` appear only in `main.ts` (the wiring) and files that already used them before this spec; no file in `src/audio/` or `src/page/` contains a visible string literal outside `strings.ts`; no shipped file imports a `test-kit`, `fake-*` file.
    - Files: `src/audio/purity.test.ts`, `src/page/purity.test.ts`.
    - _Requirements: R1.4, R1.5, R1.9, R1.10, R4.15, R5.23_

- [ ] 12. Checkpoint - Batch 2 ends here
  - Run `npm run verify`. Ensure all tests pass, ask the user if questions arise. Confirm every property test of tasks 6 to 10 ran at 300 runs through `PROP_PARAMS`, with no skipped, `only` or `todo` tests, that every mutation named above was caught and reverted (`git diff` on the sources is clean), and that P9 passed or was reported under Risk K1. Report the unit file and test counts. The new modules are still not imported by any shipped file.
  - Add the batch 2 entry to `KIRO_USAGE.md` (R9.10): surface, what was built (tasks 6 to 11), property failures with their seeds or "none" (P9 and the Risk K1 result in particular), the mutation results, screenshots and costume review "none yet", and the counts.
  - Files: `KIRO_USAGE.md`.

> **Batch 2 ends here.** Stop this CLI session. Start batch 3 with task 13.

- [ ] 13. Wire it into `main.ts` (CR10, CR16)
  - [ ] 13.1 The eleven `main.ts` edits, with the existing e2e suites kept green
    - Read `src/main.ts` first. If `ghosts-and-graveyard` task 16 has already edited it (view state, ghost layer, graveyard), make these edits on top of its version and keep its lines. Apply the eleven edits of design 3.9 in order: (1) the seven imports; (2) move `let settings = settingsStore.load();` above `dispatch` (D16); (3) create `player` with `createAudioPlayer({ factory: browserAudioFactory(), sound: settings.sound })` and call `armFirstGesture(document, () => settings.sound, player.unlock)` before any control exists (D31); (4) `createTitleAdapter(document)`; (5) split the first state initialisation into `loadNow = Date.now()`, the `reload` step and one `titleAdapter.write(titleFor(state, loadNow))` (this path never reaches `afterStep`, so no Cue); (6) `createHiddenTick` with `window.setTimeout`, `window.clearTimeout`, `Date.now`, a `dispatch` closure and `getState`; (7) `createAfterStep({ sound: () => settings.sound, play: player.play, writeTitle: titleAdapter.write, hidden })`; (8) `dispatch` calls `step` once, saves as before, assigns `state`, then `afterStep(prev, next, event, now)` last; (9) leave `wireVisibility` where it is; (10) `onSettings` assigns `settings`, calls `player.setSound(next.sound)`, then saves; (11) leave `frame` unchanged. `src/wiring.ts`, `src/distraction/`, `src/ui/`, `src/engine/`, `src/scene/` and `src/storage/` are not edited.
    - Keep `npm run verify` green. The existing e2e specs that read the title or the live region are checked and updated in this same task (CR14 and CR16 rows): `e2e/live.spec.ts` and `e2e/smoke.spec.ts` assert `toHaveTitle("Candlewatch")` on a fresh page (stays true, the idle title is `STRINGS.title`); `e2e/controls-a11y.spec.ts` scans `outerHTML + document.title` for the typed intent (stays true, the title never holds the intent); `e2e/settings.spec.ts` clicks the sound switch during a lit session (the assertions about timer, phase and stored session hold, because `setSound` sends no event). Run the whole e2e suite; if a case fails because the title now changes while a session runs (for example a `toHaveTitle` taken mid-session), change the test to read the title through the forms of R6, not the code. Note each case changed in the task result.
    - Add a unit-level guard in `src/after-step.test.ts` or a new `src/wiring-order.test.ts` only if it needs no DOM: a static scan of `src/main.ts` that `armFirstGesture(` appears before `createInterface(`, that `afterStep(` is called after `storage.save(`, and that `main.ts` has no `cueFor(` call.
    - Files: `src/main.ts`, and e2e specs only where a case must change.
    - _Requirements: R1.6, R1.7, R2.6, R2.10, R4.16, R5.12, R5.15 to R5.17, R6.14, R7.8_

- [ ] 14. Change requests to other specs: documents
  - [ ] 14.1 `controls-and-access` and `candle-scene` documents (CR1, CR2, CR3, CR4, CR14)
    - Read each target first and change only what the row of design 6.2 names. `controls-and-access` requirements and design: CR1 (R1.2 and the `dispatch` block of design 5 gain the post-step hook), CR2 (R11.7 and Decision Q6 and the out-of-scope bullet and design 11.2: the sound setting now decides whether Cues play), CR3 (R12.1: the Hidden_Tick is started by `afterStep` after a `hide` and stopped after a `show`; no second listener), CR4 (R7.7 and the `formatTime` bullets: fulfilled by `titleFor`). CR14: append "(done by `sound-and-title`: the `chime` plays at the dawn, `titleFor` writes the page title)" to the pointers in `candle-scene` R8.6 and its out-of-scope bullet, and in the `controls-and-access` out-of-scope bullet. Add a short "Amended by sound-and-title task 14.1" note beside each changed passage. Do not edit a dated task result and do not edit any `tasks.md` of those specs.
    - Files: `.kiro/specs/controls-and-access/requirements.md`, `.kiro/specs/controls-and-access/design.md`, `.kiro/specs/candle-scene/requirements.md`.
    - _Requirements: R1.6, R2.7, R2.13, R2.14, R4.5, R5.12, R5.15 to R5.17, R6.7, R6.8, R7.1, R7.4, R7.6_

  - [ ] 14.2 `ghosts-and-graveyard` documents (CR5, CR6 documents, CR9 documents, CR13). Requires the ghosts-and-graveyard build
    - If `src/graveyard/` does not exist, stop and report (see Overview). Otherwise read each target first. CR5 (requirements): replace the placeholder wording and examples in R2.11, R4.3, R4.9, R5.1, R5.2, R7.11, R8.5, R8.8, R8.9 and the Open Questions with the Strings_Table of design 4.2; move the five wording Open Questions to resolved with "finalised by `sound-and-title`, section 4.2"; keep the open questions S, D, K and G; remove the words "placeholder" and "to be finalised" from those passages. CR6 (design 4.7 and the comments at the two example lines): the ten values of CR6, the four added keys, the opening sentence "Final wording, set by `sound-and-title` (section 4.2)". CR9 (design 3.3 `cardLines` item 1, Property P18): the first card line is the kind-specific flavour line of design 4.3; P18 becomes "five lines; the first contains the exact intent as a substring when the intent is not null and not empty, and `card.unnamed` when it is; the Item name equals the intent (or `noIntent`) and the date joined by the template". CR13: only the ghosts tasks not yet `[x]` (1.4, 3.8, 3.12, 21.1, 22.1, 25.1) get their literals changed; a task already done is not reopened. Add a short "Amended by sound-and-title task 14.2" note beside each change.
    - Files: `.kiro/specs/ghosts-and-graveyard/requirements.md`, `.kiro/specs/ghosts-and-graveyard/design.md`, `.kiro/specs/ghosts-and-graveyard/tasks.md`.
    - _Requirements: R8.1, R8.2, R8.3, R8.13, R8.14, R8.15, R9.7_

- [ ] 15. Final wording in `strings.ts`
  - [ ] 15.1 Replace the placeholder values and add the new keys (CR6, CR11, CR12). Requires the ghosts-and-graveyard build
    - If `src/strings.ts` has no `graveyard` group or `src/graveyard/` does not exist, stop and report (see Overview). Otherwise set the ten values of CR6 in `src/strings.ts`: `graveyard.door` "Walk out to the graveyard", `noStones` "Nothing is buried here.", `noStubs` "The shelf is bare.", `noIntent` "Unnamed watch", `olderStone` "{n} older stone out of sight", `olderStones` "{n} older stones out of sight", `olderDay` "{n} older day out of sight", `olderDays` "{n} older days out of sight", `card.planned` "Length: {time}", `announceOpen` "The graveyard. Quiet.". Add `graveyard.card.stoneLine` ("Here lies {intent}"), `stubLine` ("Burned to the end: {intent}"), `unnamed` ("an unnamed watch") and `quoted` (`"{text}"`, straight double quotes). Every other key keeps its value, in particular `unknownDate` stays "Unknown date" (D23), and `status`, `announce`, `snuff`, `settings`, `scene` and `time` are not touched (R8.12).
    - CR12, second part: add `"count"`, `"ghosts"` and `"graveyard"` to `NOT_THIS_SPEC` in `src/ui/strings.test.ts` if the ghosts spec has not already done so (`pageTitle` was added in task 3.1).
    - Update every test and e2e literal that quotes a changed value (`src/graveyard/text.test.ts`, `src/strings.test.ts`, the ghosts E3 and E6 specs and any other file found by a search for the old strings "No stones yet", "No candles on the shelf yet", "not shown", "Planned:", "Open the graveyard", "The graveyard.", "No intent"). Do not change their logic.
    - Files: `src/strings.ts`, `src/ui/strings.test.ts`, and the test files that quote the old values.
    - _Requirements: R8.1, R8.2, R8.3, R8.4, R8.5, R8.6, R8.11, R8.12_

- [ ] 16. Carved date and card lines
  - [ ] 16.1 `formatCarvedDate` is total and uses the final wording. Requires the ghosts-and-graveyard build
    - Read `src/graveyard/days.ts`. `formatCarvedDate` returns the day without a leading zero, a single space and the three-letter month name (from `STRINGS.graveyard.months`), no year and no time, for every valid Day_Key; for every other input (null, undefined, the empty string, a wrong separator, month 00, month 13, day 00, day 32, non-numeric parts, a well-formed key naming a day that does not exist such as 2026-02-30) it returns `STRINGS.graveyard.unknownDate` and never throws. Change the function only where it does not already do this, and widen its parameter type to accept `string | null | undefined`.
    - Extend `src/graveyard/days.test.ts`: each of the 12 months; the bad keys of R9.2; "2026-11-07" gives "7 Nov".
    - Files: `src/graveyard/days.ts`, `src/graveyard/days.test.ts`.
    - _Requirements: R8.9, R8.10, R9.2_

  - [ ] 16.2 Required: P11, `formatCarvedDate`. Requires the ghosts-and-graveyard build
    - **Property 11: formatCarvedDate**
    - Add Property 11 to `src/graveyard/days.prop.test.ts` (tag `Feature: sound-and-title, Property 11: formatCarvedDate`): for any valid Day_Key the result is the day without a leading zero, a single space and the matching month name, with no year or time; for any other input (an arbitrary string, `null`, `undefined`, a malformed key, a well-formed key naming a day that does not exist) the result is the unknown-date line and nothing throws. The generator builds valid keys from year, month and day and checks them against an independent day-count table.
    - Mutation check (P11): pad the day with a leading zero; confirm P11 fails; revert.
    - Files: `src/graveyard/days.prop.test.ts`.
    - **Validates: Requirements 8.9, 8.10**

  - [ ] 16.3 `cardLines` builds the kind-specific first line (CR9). Requires the ghosts-and-graveyard build
    - In `src/graveyard/text.ts` change only the first line of `cardLines` as in design 4.3: a stone gets `fill(stoneLine, { intent })` where `intent` is `fill(card.quoted, { text })` for a named entry and `card.unnamed` otherwise; a stub gets `fill(stubLine, { intent })` with the intent unquoted or `card.unnamed`; a null or empty intent counts as unnamed. The intent is passed to `fill` as a value, never trimmed, cut, escaped or case-changed. `cardLines` still returns exactly five lines and lines 2 to 5 are unchanged. `stoneIntent` and `itemName` are not changed: the accessible name stays the intent (or `noIntent`) plus the date and never contains "Here lies" or "Burned to the end" (R8.15).
    - Update `src/graveyard/text.test.ts` with the four rows of design 4.3 compared with the literal strings of R8.13 (`Here lies "write the report"`, `Here lies an unnamed watch`, `Burned to the end: write the report`, `Burned to the end: an unnamed watch`), an intent containing `$&`, `{n}` and `{intent}` kept as typed, and the Item name never containing the flavour phrases for both kinds with and without an intent. Update ghosts Property P18 in `src/graveyard/text.prop.test.ts` as CR9 says (five lines; the first contains the exact intent as a substring when it is not null and not empty, and `card.unnamed` when it is); keep its tag and its generator, and run its mutation check from the ghosts plan again (drop the intent from the first line; confirm it fails; revert).
    - Files: `src/graveyard/text.ts`, `src/graveyard/text.test.ts`, `src/graveyard/text.prop.test.ts`.
    - _Requirements: R8.13, R8.14, R8.15, R9.2_

- [ ] 17. Strings tests
  - [ ] 17.1 The checks of design 4.4. Requires the ghosts-and-graveyard build
    - Extend `src/strings.test.ts` (and one helper that reads the shipped source) with: every leaf key of `STRINGS` outside the exempt list is used by some shipped file under `src/` (excluding `strings.ts`, `*.test.ts`, `test-kit.ts`, `fake-*.ts`, `*-kit.ts`, `src/hosting/`), whole or through a group access that the helper maps to the group, with an explicit list for computed reads; no leaf value contains the trademarked timer word (case-insensitive, word built from fragments in the test source); every placeholder found by `\{([A-Za-z0-9_]+)\}` is filled by a caller named in the placeholder table of design 4.4; state lines (`graveyard.noStones`, `noStubs`, `announceOpen`, `announceLeave`, and every leaf of `status` and `announce` except `status.pauseLeft`) are at most 60 characters and end with "."; data labels have no "!" and no `pageTitle` template contains the intent; the rendered card lines of design 4.3 through the real `cardLines`; `STRINGS.scene` and `STRINGS.time` equal literals written out in the test as they are today (R8.12); no leaf value contains a trademark or logo name (short list in the test; `Candlewatch` is allowed); the title forms of R6.1 to R6.5 through `titleFor`; `months` has twelve non-empty three-letter entries in calendar order. Every failure message names the offending key.
    - Mutation check (strings test): add a key with no use, then a value containing the timer word, then a template placeholder with no caller, one at a time; confirm each fails the right check and names the key; revert each.
    - Files: `src/strings.test.ts`.
    - _Requirements: R1.10, R1.11, R8.2, R8.4, R8.5, R8.6, R8.7, R8.8, R8.11, R8.12, R8.13_

- [ ] 18. Checkpoint - Batch 3 ends here
  - Run `npm run verify`. Ensure all tests pass, ask the user if questions arise. Confirm P11 ran at 300 runs, the ghosts properties P3, P11 and P18 (ghosts numbering) still pass, the mutations of tasks 16 and 17 were caught and reverted, and the existing e2e suites pass with sound on and off. If tasks 14.2 to 17.1 were skipped because `ghosts-and-graveyard` is not built, say so here and list them as pending. Report the unit file and test counts.
  - Add the batch 3 entry to `KIRO_USAGE.md` (R9.10): surface, what was built (tasks 13 to 17: the `main.ts` wiring, the change requests applied and the passages changed, the final wording), property failures with their seeds or "none", the mutation results, any task skipped because `ghosts-and-graveyard` was not built, screenshots and costume review "none yet", and the counts.
  - Files: `KIRO_USAGE.md`.

> **Batch 3 ends here.** Stop this CLI session. Start batch 4 with task 19.

- [ ] 19. Browser test helpers
  - [ ] 19.1 `e2e/sound-fixtures.ts`
    - Build on `e2e/controls-fixtures.ts` (`openApp`, `settle`, `jump`, `press`, `timeText`, `statusText`, `liveTexts`, `storedState`, `phaseOf`, `clockNow`) and `FIXTURES` and `T0` of `e2e/scene-fixtures.ts`. Export `FAKE_AUDIO_SCRIPT` (a string for `initScripts`: replaces `window.AudioContext` with a class that starts `suspended`, flips to `running` in a microtask after `resume()`, and appends `{ kind, at: Date.now(), ... }` entries to `window.__audioLog` for `construct`, `resume`, `osc`, `noise`, `filter` and `stop`), `FAKE_AUDIO_THROWS` (a constructor that throws), `cuesPlayed(log)` (identifies a Cue by its signature using the numbers of `CUE_SPECS`: a bandpass noise voice from 4000 Hz is `strike`, a 660 Hz sine is `chime`, a lowpass noise voice from 2400 Hz is `breath`), `constructions(log)`, `resumes(log)`, and `setHidden(page, hidden)` (sets `visibilityState`, dispatches `visibilitychange`, and holds `requestAnimationFrame` callbacks in `window.__heldFrames` installed after load, restoring and replaying them on show; see design 8.5 and D32). `window.__audioLog` and `window.__heldFrames` are globals of the tests' own scripts; the app never reads them.
    - Add a one-test smoke in `e2e/sound.spec.ts` that opens a page with the fake audio and sees `constructions(log)` equal 0, to prove the helpers.
    - Files: `e2e/sound-fixtures.ts`, `e2e/sound.spec.ts`.
    - _Requirements: R9.3, R9.5_

- [ ] 20. E1, E1b, E2, E3, E4, E8: the cues
  - [ ] 20.1 E1, E1b and E2 in `e2e/sound.spec.ts`
    - **E1**: with `FAKE_AUDIO_SCRIPT`, a fresh page and a page with a stored `lit` session construct no context after load, after `settle` and after several frames and a pointer move; the first Enter on a fresh page gives one construction, one `resume` and `cuesPlayed` equal to `["strike"]`.
    - **E1b**: a fresh page, nothing touched, then Enter while Light has focus: one construction, one `resume`, one `strike`, and the `resume` entry comes before the first voice entry in the log (the capture-phase listener unlocked before the controls lit the candle).
    - **E2**: a whole session by keyboard with the clock moved by `page.clock.runFor`: Enter (one `strike`), Space and Space (no new Cue), run to the end (one `chime`); a second session: Enter, Escape, confirm (one `breath`); a third: Enter, Space, run past ten minutes (one `breath` from the pause limit). Counts are exact.
    - Files: `e2e/sound.spec.ts`.
    - _Requirements: R2.2 to R2.4, R4.1 to R4.3, R4.14, R4.16, R9.3, R9.4_

  - [ ] 20.2 E3, E4 and E8 in `e2e/sound.spec.ts`
    - **E3**: with the stored setting sound off, a whole session constructs nothing and plays nothing; turning sound on mid-session with the real switch constructs one context and plays nothing until the next Transition (the burn-out then plays the `chime`); turning it off fades within 50 ms (`stop` entries appear) and sends no engine event (the stored session is byte-equal before and after).
    - **E4**: a stored session that burned out while the page was closed plays no Cue at load and none at the first gesture; a stored `lit` session that burns out after load but before any gesture (found by `runFor`) plays no Cue; then a gesture and a new Light plays the `strike`.
    - **E8**: the same keyboard session with `reducedMotion` true and false: the lists from `cuesPlayed` and the logged node types are equal.
    - Files: `e2e/sound.spec.ts`.
    - _Requirements: R2.6, R2.10, R2.14, R4.5 to R4.8, R7.4, R7.7, R9.4_

- [ ] 21. E5 and E6: hidden tabs
  - [ ] 21.1 Write E5 and E6 in `e2e/hidden-tab.spec.ts`
    - **E5**: a stored `lit` session with 20 seconds left, `setHidden(page, true)`, `settle`; `#time` stays frozen (no frame runs) while `runFor(1000)` five times changes the title each second, equal to `formatTime` of the time left at the sampled clock; at the end the title is `Morning · Candlewatch` and `cuesPlayed` is `["chime"]` at the burn-out instant; on `setHidden(page, false)` and `settle` there is no second `chime`, the stored session counts one distraction per hide, `#time` is right and the live region says the dawn once.
    - **E6**: a stored `paused` session with a few seconds of pause allowance, hidden: `runFor` past the limit gives one `breath` and the title `Dark · Candlewatch`. Late timers, for both end kinds: `fastForward` 90 seconds past the end (lateness under the limit) gives the Cue; 130 seconds past (over the limit) gives no Cue while the title and the stored phase are right.
    - Files: `e2e/hidden-tab.spec.ts`.
    - _Requirements: R5.1 to R5.10, R5.14 to R5.22, R6.13, R9.5_

- [ ] 22. E7: the title
  - [ ] 22.1 Write E7 in `e2e/title.spec.ts`
    - A session by keyboard with a distinctive typed intent. At sampled clock points (every 5 seconds of a short session, at each phase change, and the last second) read the title and `#time` in one `page.evaluate`; the title matches the forms of R6 with the time equal to `#time`, and never contains the intent. In a context with JavaScript disabled the page title is `Candlewatch` (R6.16). The idle title is `Candlewatch` and the paused title does not change while the pause lasts.
    - Files: `e2e/title.spec.ts`.
    - _Requirements: R6.1 to R6.5, R6.7 to R6.9, R6.12, R6.14, R6.16, R7.9_

- [ ] 23. E10: the real build under the Blueprint's headers
  - [ ] 23.1 Write E10 in `e2e/sound-headers.spec.ts`
    - Serve the real build with the Blueprint's headers the way `e2e/headers-local.spec.ts` does (`readBlueprint`, `headersFor` in a `page.route("**/*")` handler; a local copy of that shape, or extract it into `e2e/headers-fixtures.ts`), install the fake audio script, record `securitypolicyviolation` events, `console`, `pageerror` and `requestfailed`. A whole short session plays a `strike` and a `chime`; the violations list is empty, no console error names the policy, no `pageerror`, no `requestfailed`, every request is same-origin and none has resource type `media`. Add a negative control with `script-src 'none'` showing the test can fail.
    - Files: `e2e/sound-headers.spec.ts`, optionally `e2e/headers-fixtures.ts`.
    - _Requirements: R1.9, R9.6_

- [ ] 24. E9: the final wording in the graveyard
  - [ ] 24.1 Write E9 in `e2e/final-wording.spec.ts`. Requires the ghosts-and-graveyard build
    - If `src/graveyard/` or `e2e/graveyard-fixtures.ts` does not exist, stop and report (see Overview). Use `openGraveyardApp`, `smallHistory` and `largeHistory` (200 sessions over 45 days) from the ghosts fixtures. Check `ariaSnapshot` and text of the graveyard view against the Final Wording: the Carved_Date ("10 Nov", "7 Nov", no zero, no year), the empty-state lines, the count lines (singular for 1, plural for 0 and 2 or more, exact numbers for the 200-session history), the Overflow_Mark and "+n more", the door and return names, the heading, the announcements on open and leave, and the five card lines of a stone and of a stub with and without an intent; an Item's accessible name never contains "Here lies" or "Burned to the end".
    - Files: `e2e/final-wording.spec.ts`.
    - _Requirements: R8.1 to R8.15, R9.3_

- [ ] 25. Screenshots
  - [ ] 25.1 Retake the affected `graveyard-*` screenshots. Requires the ghosts-and-graveyard build
    - If `docs/screenshots/` has no `graveyard-*` files, stop and report (see Overview). Read `e2e/screenshots.spec.ts` for the opt-in rule (`CANDLEWATCH_SHOTS=1` writes into `docs/screenshots/`) and the test names. Retake only the affected shots, with a grep filter on the test names, at desktop (1280 by 800) and phone (360 by 640): `graveyard-small-desktop`, `graveyard-small-phone`, `graveyard-large-desktop`, `graveyard-large-phone`, `graveyard-large-desktop-reduced`, `graveyard-card-keyboard-desktop`, `graveyard-card-keyboard-phone`, `graveyard-card-touch-desktop`, `graveyard-card-touch-phone`. Clear the variable afterwards. Run `git status`: only these files may have changed under `docs/screenshots/`; the `candle-*` files are not affected by this spec (the title is not drawn, no room element changes, CR17) and must not be retaken. A `candle-*` file that shows as modified before this task started is not this task's change; do not touch it.
    - Files: `docs/screenshots/graveyard-*.png` (the nine named above).
    - _Requirements: R9.7_

  - [ ] 25.2 Look at every retaken image, and check the `ghosts-*` shots. Requires the ghosts-and-graveyard build
    - **Open every retaken PNG with the image reader and look at it.** For each, confirm it shows the screen in its name and that the new wording is drawn: the Carved_Date without a leading zero, the empty lines "Nothing is buried here." and "The shelf is bare." where the fixture is empty, the count lines "out of sight", "+n more", the heading, and in the card shots the five card lines with the new first line; nothing overlaps, text is readable, the card does not cover its Item. Open the `ghosts-0`, `ghosts-1`, `ghosts-g`, `ghosts-g-plus-9` shots (desktop, phone and the reduced-motion one) and confirm they are unchanged (the Overflow_Mark `+{n}` keeps its value); retake any that differs. If the Door label is drawn as visible text in a shot, check that shot too. If a shot is wrong, fix the cause and retake every affected shot; do not edit PNGs. The task result lists the retaken file names and every file checked and left unchanged. A screenshot nobody looked at does not count.
    - Files: `docs/screenshots/graveyard-*.png`, `docs/screenshots/ghosts-*.png` only if one differs.
    - _Requirements: R9.7_

- [ ] 26. Costume review
  - [ ] 26.1 Run the Costume_Reviewer and record its findings in Decision D9
    - Invoke the `costume-reviewer` agent (in the Kiro CLI: `kiro-cli chat --agent costume-reviewer`, or as a sub-agent where the session offers it) on the finished cues and title, with `design.md` section 5, the screenshots of tasks 25.1 and 25.2 and the existing `candle-*` shots as input. It applies its three rules: each Cue shows one state change (`strike` the wick catching, `chime` the dawn, `breath` the flame going out, R7.6); with reduced motion every state a Cue marks is still shown by a visible or textual change (R7.7, design 5.2); the Time_Text keeps a contrast of at least 4.5:1 against its background (R9.9).
    - Record its verdict and every finding in `design.md` Decision **D9** (the row in section 10 now says "recorded by the last task"; replace that text with the findings), each with an outcome of **fixed** or **accepted with a reason** (R9.8). Apply the fixes (and retake and look at any affected screenshot), and run the agent again until it passes. If the agent cannot be run, say so and stop: do not substitute another review and call it this one. Edit `design.md` only in D9 and keep the file valid for `validate_spec_format`.
    - Files: `.kiro/specs/sound-and-title/design.md` (D9 only), and whatever the findings change.
    - _Requirements: R9.8, R9.9_

- [ ] 27. Wrap-up
  - [ ] 27.1 Verify and summarise
    - Run `npm run verify`. Confirm every property test P1 to P15 ran with its full number of runs (all through `PROP_PARAMS`, no literal lower `numRuns`, no skipped, `only` or `todo` tests) and that every mutation of the plan was caught and reverted (`git diff` on the sources shows only intended changes). Report the unit file and test counts and the e2e count against the counts reported at the checkpoints.
    - Confirm the shipped folders hold no sound file, no font, no new dependency (`package.json` and `package-lock.json` unchanged), no `window.__` global in `src/`, and that `src/engine/`, `src/scene/`, `src/storage/`, `src/distraction/`, `render.yaml` and the stored documents are unchanged by this spec (`git diff --stat`).
    - Write the summary: it names the screenshots retaken (the nine `graveyard-*` files of task 25.1) and the files checked and left unchanged, and says that no `candle-*` file was retaken by this spec. It lists which tasks were skipped because `ghosts-and-graveyard` was not built, if any, and the Risk K1 result for P9. Say that the two steering edits (CR7, CR15) and the final `KIRO_USAGE.md` entry follow in task 27.2, and that the owner should listen to the three Cues once on a laptop and a phone (Risk K4) and try the first Enter on Safari and a mobile browser (Risk K3).
    - Files: none (summary only).
    - _Requirements: all_

  - [ ] 27.2 The steering documents (CR7, CR15) and the final `KIRO_USAGE.md` entry
    - Read `.kiro/steering/structure.md` and `.kiro/steering/tech.md` first and change only what rows CR7 and CR15 of design 6.2 name, in the style of each file. `structure.md` (CR7): add `src/audio/` and `src/page/` to the implemented folders in the first paragraph; in the tree replace the `audio/` line with the files of `src/audio/` (types.ts, cue.ts, specs.ts, noise.ts, audio-player.ts as the only AudioContext user, gesture.ts, and the test-only fake-audio-context.ts and test-kit.ts); add `page/` (title.ts, wake.ts, title-adapter.ts as the only writer of document.title, hidden-tick.ts as the only background timer, and the test-only fake-timer.ts and test-kit.ts); add `after-step.ts` next to `main.ts`; add the import rules of CR7 under Boundaries. List the files as they exist on disk (check with a directory listing), not as the design planned them. `tech.md` (CR15): add the one sentence of CR15 under rule 1 of "Non-negotiable rules" and nothing else; rule 6 is unchanged. Do not touch `product.md`, `scene.md` or any other steering file. These are the only steering edits of this spec.
    - Write the final entry in `KIRO_USAGE.md` (R9.10), in the manner of the wrap-up entries of the other specs: the surface; what was built (modules, wiring, change requests applied, final wording); property failures with their seeds, or "none", and the Risk K1 result for P9; the mutation results (each caught and reverted); the screenshot checks (the nine `graveyard-*` files of task 25.1, each opened and looked at, one line each); the costume review (the verdict of each pass and each finding with its outcome); the counts (unit files and tests, e2e passed and skipped, against the counts of the batch entries); the two steering edits; and what was not done on purpose. Check first that the entries of the checkpoints of tasks 5, 12 and 18 exist.
    - Files: `.kiro/steering/structure.md`, `.kiro/steering/tech.md`, `KIRO_USAGE.md`.
    - _Requirements: R1.4, R1.5, R5.21, R5.23, R9.10_

> **Batch 4 ends here.** The spec is complete when `npm run verify` passes and the costume reviewer's last pass is PASS.

## Notes

- Property tasks are required in this plan; none is marked optional. Each carries its property number from design section 9 and the requirement clauses it validates. Every property P1 to P15 is in exactly one task (see the table below).
- Mutation checks are those of design 8.4: P1, P2, P3, P4, P5, P6, P7, P8, P9, P10, P11, P12, P13, P14, P15. Task 17.1 adds one for the strings test and task 16.3 repeats the ghosts P18 mutation.
- The DOM wiring has no unit tests (no DOM library for Vitest, no new test dependency, R1.9); it is covered by the existing e2e suites (task 13.1) and by E1 to E10.
- Steering edits (rows CR7 and CR15 of design 6.2): `.kiro/steering/structure.md` and `.kiro/steering/tech.md`, made by Kiro in task 27.2 and in no earlier task. `KIRO_USAGE.md` entries (R9.10): tasks 5, 12, 18 and 27.2. Row CR8 needs no change. Row CR17 (screenshots) is task 25. Row CR18 (run order) is the Overview rule.
- Deviation from the suggested split, on purpose: the `pageTitle` strings and the first part of the `src/ui/strings.test.ts` exemption (CR12) are task 3.1 in batch 1, because `titleFor` needs the templates and `npm test` fails the moment the group exists without the exemption. The rest of CR12 (`count`, `ghosts`, `graveyard`) is task 15.1.
- Batch boundaries: batch 1 is tasks 1 to 5, batch 2 is 6 to 12, batch 3 is 13 to 18, batch 4 is 19 to 27. Within a batch, run tasks in order; the dependency graph below is a guide to which tasks touch different files.

## Coverage check

| Requirement | Tasks |
|---|---|
| R1 | 1.1, 2.2, 3.2, 4.1, 6.2, 8.1, 9.2, 10.1, 11.1, 13.1, 17.1, 23.1, 27.1, 27.2 |
| R2 | 1.1 to 1.4, 10.1, 10.3, 13.1, 20.1, 20.2 |
| R3 | 2.1, 2.2, 2.3 |
| R4 | 6.1 to 6.4, 7.1, 11.1, 13.1, 20.1, 20.2 |
| R5 | 3.5, 3.6, 9.1 to 9.4, 10.1, 13.1, 21.1, 27.2 |
| R6 | 3.1 to 3.4, 8.1, 8.2, 10.1, 13.1, 22.1 |
| R7 | 13.1, 14.1, 20.2, 22.1, 26.1 |
| R8 | 14.2, 15.1, 16.1 to 16.3, 17.1, 24.1 |
| R9 | 1.1, 2.2, 6.1, 6.2, 9.1, 9.2, 16.1, 16.3, 19.1, 20.1 to 24.1, 25.1, 25.2, 26.1, 27.1, 27.2; checkpoints 5, 12 and 18 (R9.10) |

| Property | Task |
|---|---|
| P1 | 1.2 |
| P2 | 1.3 |
| P3 | 10.3 |
| P4 | 1.4 |
| P5 | 2.3 |
| P6 | 3.3 |
| P7 | 3.4 |
| P8 | 3.6 |
| P9 | 9.4 |
| P10 | 6.3 |
| P11 | 16.2 |
| P12 | 9.3 |
| P13 | 8.2 |
| P14 | 10.2 |
| P15 | 6.4 |

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.2"] },
    { "id": 2, "tasks": ["1.3", "2.3", "3.3", "3.5"] },
    { "id": 3, "tasks": ["1.4", "3.4", "3.6"] },
    { "id": 4, "tasks": ["4.1"] },
    { "id": 5, "tasks": ["6.1", "7.1", "8.1", "9.1"] },
    { "id": 6, "tasks": ["6.2", "8.2", "9.2"] },
    { "id": 7, "tasks": ["6.3", "9.3", "10.1"] },
    { "id": 8, "tasks": ["6.4", "9.4", "10.2"] },
    { "id": 9, "tasks": ["10.3", "11.1"] },
    { "id": 10, "tasks": ["13.1"] },
    { "id": 11, "tasks": ["14.1", "14.2", "15.1"] },
    { "id": 12, "tasks": ["16.1", "16.3"] },
    { "id": 13, "tasks": ["16.2", "17.1"] },
    { "id": 14, "tasks": ["19.1"] },
    { "id": 15, "tasks": ["20.1", "21.1", "22.1", "23.1", "24.1"] },
    { "id": 16, "tasks": ["20.2"] },
    { "id": 17, "tasks": ["25.1"] },
    { "id": 18, "tasks": ["25.2"] },
    { "id": 19, "tasks": ["26.1"] },
    { "id": 20, "tasks": ["27.1"] },
    { "id": 21, "tasks": ["27.2"] }
  ]
}
```
