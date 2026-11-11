# Tasks: distraction-tracking

Implements `design.md` against `requirements.md` in this folder. Work the tasks in order; each builds on the previous ones.

Conventions for every task:

- TypeScript strict, no `any`, exact dependency versions, no new dependencies.
- Tests are colocated next to the source (`*.test.ts`, `*.prop.test.ts`) per `.kiro/steering/structure.md`.
- Nothing under `src/engine/` touches `window`, `document`, `localStorage`, `Date.now`, `performance` or `Math.random` (session-engine R11.1; the purity test keeps checking it). The Page Visibility API is used only through the injected target in `src/distraction/`.
- A task is done only when `npm run verify` passes (type-check and lint, unit tests, build, e2e). Because the repository must stay green after every task, a change to the types or to behaviour includes the existing tests it breaks, even when design section 9.1 lists those tests separately (the notes under each task say which).
- Property-test tasks (9 to 16) are **required**, not optional. None of the tasks in this list is optional.
- Never weaken a property to make it pass, and never lower `numRuns` below 300 (all property tests use the shared `PROP_PARAMS`). If a property fails, report the shrunk counterexample and the seed, say whether the bug is in the engine or in the test, fix the right one, and record it in `KIRO_USAGE.md`.

Build order note: the version constants and the type changes come first and fix every compile error they cause in the same task, so later tasks start from a green build. The session document keeps version 1 behaviour until task 5 raises it to version 2.

## Tasks

- [ ] 1. Constants and types
  - In `src/engine/constants.ts` add `GHOST_MIN_SIZE = 0.25`, `GHOST_FULL_SIZE_MS = 5 * MS_PER_MINUTE`, `SESSION_SCHEMA_VERSION` (set to `1` for now; task 5 sets it to `2`) and `HISTORY_SCHEMA_VERSION = 1`, and remove `SCHEMA_VERSION`. Update its uses (`serialize.ts`, `validate.ts`, `index.ts`, `serialize.prop.test.ts`, `constants.test.ts`).
  - In `src/engine/types.ts` add `awaySpansMs: readonly number[]` to `Session` and `awaySince: number | null` to `LitState` (design section 3).
  - Make the code compile with the new fields and no behaviour change: `light` sets `awaySpansMs: []` and `awaySince: null`; `resume` sets `awaySince: null`; `validate.ts` returns `awaySpansMs: []` and `awaySince: null` for the documents it reads; `serialize.ts` keeps writing the current format. Update the test helpers that build `Session` or `LitState` literals (`step.test.ts`, `history.test.ts`, `serialize.test.ts`, `test-kit.test.ts`) with the two fields only.
  - Export the new constants from `src/engine/index.ts`.
  - Files: `src/engine/constants.ts`, `src/engine/types.ts`, `src/engine/step.ts`, `src/engine/validate.ts`, `src/engine/serialize.ts`, `src/engine/index.ts`, `src/engine/constants.test.ts`, `src/engine/serialize.prop.test.ts`, and the test helpers above.
  - Requirements: R9.1, R9.2 (constants), R10.2. Properties: none.
  - Done when `npm run verify` passes and the existing 184 session-engine tests still pass unchanged apart from the helper literals.

- [ ] 2. `openHide` and `closeHide`
  - Create `src/engine/distraction.ts` with `openHide(s, at)` and `closeHide(s, at)` exactly as in design 4.1: open at `max(at, litSince)`, same reference when already open; close at `max(at, awaySince)`, append the span, bump the count and total, clear `awaySince`, same reference when none is open. Neither touches a timer field.
  - Create `src/engine/distraction.test.ts`: clamp to `litSince`; same reference when already open or none open; span, count, total and list after a close; a close earlier than the open instant gives span 0; the timer fields (`startedAt`, `pausedTotalMs`, `litSince`) are the same objects/values before and after; inputs are not mutated (frozen objects).
  - Files: `src/engine/distraction.ts`, `src/engine/distraction.test.ts`.
  - Requirements: R1.1, R1.3, R2.1, R2.2, R4.1, R4.2, R5.1, R5.2. Properties: none (covered by D1, D2, D3 later).
  - Done when `npm run verify` passes.

- [ ] 3. `step`, `pause`, `snuff` and `settle` changes
  - `src/engine/step.ts` (design 4.2): move `hide` and `show` out of the first switch so they settle first; `hide` in `lit` calls `openHide`, `show` in `lit` calls `closeHide`; in every other phase they return the settled state. `pause` closes the open hide at the pause instant (design 4.3) without changing `pausedAt`. `snuff` is unchanged in what it computes.
  - `src/engine/settle.ts`: `endBurnedOut` closes the open hide at the completion instant before building the history entry; `endSnuffed` closes it for a `lit` input (design 4.3).
  - Update the session-engine tests this breaks, in the same task so the build stays green (design 9.1): in `step.test.ts` replace "returns the same reference for hide and show in every phase" and reverse "does not settle on hide or show"; in `step.prop.test.ts` remove the `hide`/`show` exception from P3 (strict equality after every original event, both variants) and delete P9.
  - Add the new example tests from design 10.1 to `step.test.ts`: hide then show in the middle of a candle; hide at minute 20 of 25 with the show at minute 40 (one distraction of exactly 5 minutes, ended at minute 25, the show ignored); hide at the exact completion instant ignored; hide at `C - 1` gives span 1; pause while hidden closes and counts at the pause instant, with `pausedAt` unchanged; snuff while hidden counts; hide while paused ignored and the later show ignored; duplicate hide and stray show return the same reference; same-millisecond hide and show counts with span 0; the second `light` starts with no spans and no open hide; a late `show` after completion leaves the history entry unchanged.
  - Files: `src/engine/step.ts`, `src/engine/settle.ts`, `src/engine/step.test.ts`, `src/engine/step.prop.test.ts`.
  - Requirements: R1, R2, R3, R5, R6, R7, R8.1, R12. Properties: none new (P3 restored to strict; D1 to D5 later).
  - Done when `npm run verify` passes, including P1, P2, P3 (strict), P4, P7, P10 and P11 unchanged apart from P3.

- [ ] 4. Ghost selectors
  - Create `src/engine/ghosts.ts` with `distractionCount`, `ghostSpansMs` (a shared frozen empty list for `idle`) and `ghostSize` (design section 5). Export them and the ghost constants from `src/engine/index.ts`.
  - Create `src/engine/ghosts.test.ts`: `ghostSize(0) === 0.25`; `ghostSize(300_000) === 1` and larger spans stay `1`; `ghostSize(75_000) === 0.625`; negative and `NaN` map to `0.25`, `Infinity` to `1`; `ghostSpansMs` and `distractionCount` for idle, lit with spans, burned-out and snuffed; the spans come back in order; no `now` parameter is needed.
  - Files: `src/engine/ghosts.ts`, `src/engine/ghosts.test.ts`, `src/engine/index.ts`.
  - Requirements: R9.1, R9.2, R9.3. Properties: none (covered by D8 later).
  - Done when `npm run verify` passes.

- [ ] 5. Session document v2, v1 migration and validation
  - Set `SESSION_SCHEMA_VERSION` to `2`. `serializeSession` writes `awaySpansMs` inside `session` for every phase and `awaySince` for `lit` (design 6.1). `readSession` and `restoreState` accept `v` 1 or 2; v1 documents get `[]` spans and no open hide (design 6.2). Any other version is unreadable.
  - Add the validation rules of design 6.3 in `src/engine/validate.ts` (spans are non-negative safe integers; length equals `distractions`; sum equals `timeAwayMs`; `awaySince` only on `lit`, in `[litSince, completionAt)`); failures give idle with the history intact and status `unreadable`.
  - Update `src/engine/serialize.test.ts`: the documented lit example becomes the v2 format; the "wrong version" case uses `v: 3`; add cases for the v2 round trip with spans and an open hide, a v1 lit document restoring with `[]` spans and no open hide, a v1 document with `distractions > 0` being unreadable, and each new validation failure (negative or fractional span, length or sum mismatch, `awaySince` on `paused`, before `litSince`, at or after completion). Update `constants.test.ts` to assert `SESSION_SCHEMA_VERSION === 2` and `HISTORY_SCHEMA_VERSION === 1`.
  - Add one case to `src/storage/storage.test.ts`: a session text that is unreadable under the new rules is backed up unchanged before the first session write (session-engine R11.4).
  - Files: `src/engine/constants.ts`, `src/engine/serialize.ts`, `src/engine/validate.ts`, `src/engine/serialize.test.ts`, `src/engine/constants.test.ts`, `src/storage/storage.test.ts`.
  - Requirements: R10.1 to R10.7. Properties: none (covered by D6 later).
  - Done when `npm run verify` passes, including the session-engine P6 and P8.

- [ ] 6. Remaining session-engine updates (design section 9.1)
  - `src/engine/purity.test.ts`: extend the "test-kit is test-only" check so no non-test source file imports `fake-document` either (the file is created in task 7; the check passes with no matches until then).
  - Walk the table in design 9.1 and confirm every row is done, either in tasks 1, 3 and 5 or here; fix anything left, such as stale comments about the `hide`/`show` exemption in `step.prop.test.ts` or `step.test.ts`.
  - Update the session-engine documents so they match the approved change: `requirements.md` R5.4 (remove the `hide`/`show` exemption), R8.2 (replaced by this spec's R1 to R6), the P9 row (replaced by D1 and D5) and a Decisions line; `design.md` Decision 2 (reversed), Decision 8 (the P3 `hide`/`show` narrowing removed; the P10 `reload` narrowing stays), Decision 9 (applied), the section 8.2 P3 row (strict again) and P9 row (replaced), and section 4.3 text about `hide`/`show` not settling.
  - Files: `src/engine/purity.test.ts`, `.kiro/specs/session-engine/requirements.md`, `.kiro/specs/session-engine/design.md`.
  - Requirements: session-engine R5.4, R8.2, R11.1; this spec's "Changes to session-engine". Properties: none.
  - Done when `npm run verify` passes.

- [ ] 7. Visibility wiring and fake document
  - Create `src/distraction/visibility.ts` with `VisibilityTarget`, `VisibilityWiring`, `eventFor`, `watchVisibility`, `syncVisibility` and `browserVisibilityTarget` (design section 8). All globals are injected; the module imports nothing from `src/engine/` except types if needed, and the engine never imports it.
  - Create `src/distraction/fake-document.ts` (test-only): `createFakeDocument(initial)` with `setVisibility(state)` and `listenerCount()`.
  - Create `src/distraction/visibility.test.ts`: `eventFor` mapping (`hidden` to `hide`, everything else to `show`); `watchVisibility` sends `hide` then `show` with the injected clock's values; the returned function unsubscribes (`listenerCount()` is 0 and later changes send nothing); `syncVisibility` sends `show` when visible and `hide` when hidden, once; `browserVisibilityTarget` returns `null` when `document` is missing.
  - Files: `src/distraction/visibility.ts`, `src/distraction/fake-document.ts`, `src/distraction/visibility.test.ts`. Remove `src/distraction/.gitkeep`.
  - Requirements: R11.1 to R11.4. Properties: none.
  - Done when `npm run verify` passes, including the extended purity test from task 6.

- [ ] 8. Test kit additions and the reference interpreter
  - In `src/engine/test-kit.ts`: give `makeArbScript` an optional `kinds` arbitrary; add `arbVisibilityScript` (weights roughly: `hide` 4, `show` 4, `tick` 3, `light` 2, `pause` 2, `resume` 2, `snuff` 1, `reload` 1) and `arbSignedVisibilityScript` (same kinds, signed gaps); extend `assertInvariants` with the distraction invariants of design 10.2 (spans are non-negative safe integers, their number equals `distractions`, their sum equals `timeAwayMs`; `awaySince` is `null` or in `[litSince, completionAt)` for `lit` and absent otherwise).
  - Add the reference interpreter `referenceTrace(script, t0)` as described in design 10.3: an independent re-implementation of R1 to R3 and R7 in a different representation (a list of closed pause lengths, `hiddenAt`, a list of spans), importing nothing from the engine but constants.
  - In `src/engine/test-kit.test.ts`: the new arbitraries produce scripts with many hides and shows; `assertInvariants` accepts states from `step` and rejects hand-built bad ones (span count mismatch, sum mismatch, negative span, `awaySince` on a paused state, `awaySince` before `litSince`); `referenceTrace` agrees with the engine on three hand-written scenarios (hide and show; hide through completion with a late show; pause while hidden).
  - Files: `src/engine/test-kit.ts`, `src/engine/test-kit.test.ts`.
  - Requirements: supports R1 to R10 test coverage. Properties: supports D1 to D8.
  - Done when `npm run verify` passes.

- [ ] 9. Required: D1, distractions never change the timer
  - Create `src/engine/distraction.prop.test.ts` and add the D1 test per design 10.4: run a visibility script and the same script with every `hide`/`show` replaced by a `tick` at the same gap; at every step compare phase, `timeLeftMs`, `waxFraction`, `isBreak`, `startedAt`, `lengthMin`, `pausedTotalMs`, `litSince`, `pausedAt`, `endedAt`, `breakEndsAt`, and the history entries after removing `distractions` and `timeAwayMs`.
  - Files: `src/engine/distraction.prop.test.ts`.
  - Requirements: R5. Properties: D1.
  - Done when `npm run verify` passes.

- [ ] 10. Required: D2, the count equals the completed pairs
  - Add the D2 test: run `runScript` and `referenceTrace` over the same visibility script; per step they agree on the distraction count, the list of spans, the open instant and each history entry's distraction fields.
  - Files: `src/engine/distraction.prop.test.ts`.
  - Requirements: R1, R2, R3, R7. Properties: D2.
  - Done when `npm run verify` passes.

- [ ] 11. Required: D3, time away is the sum of the spans
  - Add the D3 test: on `arbVisibilityScript` and on `arbSignedVisibilityScript`, in every state the spans are integers `>= 0`, their number equals `distractions`, their sum equals `timeAwayMs`, and `assertInvariants` holds. On non-decreasing scripts only, every final session has `timeAwayMs <= endedAt - startedAt`, and a burned-out session has `timeAwayMs <=` its length.
  - Files: `src/engine/distraction.prop.test.ts`.
  - Requirements: R4, R8.3, R9.1. Properties: D3.
  - Done when `npm run verify` passes.

- [ ] 12. Required: D4, dating to the true instant
  - Add the D4 test per design 10.4: a hide at offset `h`, an exit by completion, snuff or pause at `x`, noticed by any of `tick`, `show`, `hide`, `resume`, `light`, `reload`, `snuff` at `x + late` (`late` up to 3 hours). Completion: one more distraction, `timeAwayMs` equals `C - h`, `endedAt = C`, and a later `show` leaves the entry unchanged. Snuff and pause: the span is `x - h`. A paused session snuffed later by the pause limit gains no distraction.
  - Files: `src/engine/distraction.prop.test.ts`.
  - Requirements: R6, R7, R8. Properties: D4.
  - Done when `npm run verify` passes.

- [ ] 13. Required: D5, what does not count
  - Add the D5 test: for every state in a trace and a probe `now` at or after the trace time, `hide` where the settled phase is not `lit`, a second `hide` where one is open, and `show` where none is open leave the distraction fields unchanged and equal `step(state, tick, now)`; when nothing is due the result is the same reference as the input.
  - Files: `src/engine/distraction.prop.test.ts`.
  - Requirements: R3, R6.3, R6.4. Properties: D5.
  - Done when `npm run verify` passes.

- [ ] 14. Required: D6, serialization with the new fields
  - Add the D6 test to `src/engine/serialize.prop.test.ts`: for every state of visibility scripts, restore of serialize is the identity (open hide and spans included) and `reload` at `T` equals `tick` at `T` (up to 6 hours later); a version 1 rewrite of a state with no distractions and no open hide restores to the same state; corrupting one new field (wrong type, negative, wrong length, sum mismatch, `awaySince` on a non-lit phase, `awaySince` before `litSince`) never throws and gives idle with the history intact.
  - Files: `src/engine/serialize.prop.test.ts`.
  - Requirements: R10. Properties: D6.
  - Done when `npm run verify` passes.

- [ ] 15. Required: D7, history matches the session
  - Add the D7 test: for every step that adds a history entry, the entry's `distractions` and `timeAwayMs` equal those of the ended session at that moment (the previous state with its open hide closed by the reference); earlier entries are the same objects, or deep-equal after a `reload`; on non-decreasing scripts `timeAwayMs <= endedAt - startedAt`.
  - Files: `src/engine/distraction.prop.test.ts`.
  - Requirements: R8. Properties: D7.
  - Done when `npm run verify` passes.

- [ ] 16. Required: D8, the ghost selectors
  - Create `src/engine/ghosts.prop.test.ts` and add the D8 test: for pairs `a <= b` in `[0, 1 hour]`, `ghostSize(a)` is in `[0.25, 1]`, `ghostSize(0) === 0.25`, `ghostSize(a) <= ghostSize(b)`, and `ghostSize(s) === 1` for `s >= 300_000`; for states from visibility scripts, `ghostSpansMs(state).length === distractionCount(state)` and the spans sum to `timeAwayMs`; `ghostSpansMs(idle)` is empty.
  - Files: `src/engine/ghosts.prop.test.ts`.
  - Requirements: R9. Properties: D8.
  - Done when `npm run verify` passes.

- [ ] 17. Wrap-up
  - Run `npm run verify` and confirm every property test ran with the full number of runs (all through `PROP_PARAMS`, no literal lower `numRuns`, no skipped or `todo` tests), including the session-engine properties that were touched.
  - Update `.kiro/steering/structure.md`: `src/engine/` now also holds `distraction.ts` and `ghosts.ts`, and `src/distraction/` holds the visibility wiring and the test-only fake document; keep the boundaries section accurate (the engine does not import `src/distraction/`).
  - Optional but recommended: repeat the mutation spot-check from session-engine tasks 12 to 24 for the new code (for example `closeHide` using `now` instead of the exit instant, `hide` not settling, `pause` not closing an open hide) and note which properties caught each in `KIRO_USAGE.md`.
  - Add a `KIRO_USAGE.md` entry for the implementation with the real surface used, what Kiro produced, any property failures with their counterexamples and seeds, and anything changed by hand.
  - Not in this spec: the `main.ts` wiring that calls `watchVisibility`, `syncVisibility` and `save`.
  - Files: `.kiro/steering/structure.md`, `KIRO_USAGE.md`.
  - Requirements: all. Properties: D1 to D8 all passing.
  - Done when `npm run verify` passes.

## Coverage check

| Requirement | Tasks |
|---|---|
| R1 | 2, 3, 10 |
| R2 | 2, 3, 10 |
| R3 | 3, 10, 13 |
| R4 | 2, 11 |
| R5 | 2, 3, 9 |
| R6 | 3, 12, 13 |
| R7 | 3, 10, 12 |
| R8 | 3, 11, 12, 15 |
| R9 | 1, 4, 11, 16 |
| R10 | 1, 5, 14 |
| R11 | 7 |
| R12 | 3 |

| Property | Task |
|---|---|
| D1 | 9 |
| D2 | 10 |
| D3 | 11 |
| D4 | 12 |
| D5 | 13 |
| D6 | 14 |
| D7 | 15 |
| D8 | 16 |
