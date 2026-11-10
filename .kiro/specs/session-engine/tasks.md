# Tasks: session-engine

Implements `design.md` against `requirements.md` in this folder. Work the tasks in order; each builds on the previous ones.

Conventions for every task:

- TypeScript strict, no `any`, exact dependency versions, no new dependencies (Vitest and fast-check are already installed).
- Tests are colocated next to the source (`*.test.ts`, `*.prop.test.ts`) per `.kiro/steering/structure.md`.
- Nothing under `src/engine/` touches `window`, `document`, `localStorage`, `Date.now`, `performance` or `Math.random` (R11.1).
- A task is done only when `npm run verify` passes (type-check and lint, unit tests, build, e2e).
- Property-test tasks (12 to 22) and the purity test (23) are **required**, not optional. None of the tasks in this list is optional.

Build order note: `history` comes before `settle` (task 3 before 4) because `settle` appends history entries.

## Tasks

- [x] 1. Constants and types
  - Create `src/engine/constants.ts` (section 2 of the design) and `src/engine/types.ts` (section 3: `Session`, `HistoryEntry`, the five state interfaces and the `State` union, `Event`, `Outcome`, `INITIAL_STATE`).
  - Add a small `src/engine/constants.test.ts` asserting the values (5, 90, 80, 600 000, 300 000, version 1).
  - Files: `src/engine/constants.ts`, `src/engine/types.ts`, `src/engine/constants.test.ts`.
  - Requirements: R1.1, R2.2, R3.4, R7.1, R8.1, R10.4, R12.1. Properties: none.
  - Done when `npm run verify` passes.

- [x] 2. Intent normalization
  - Create `src/engine/intent.ts` with `normalizeIntent(raw: unknown): string | null` (flatten line breaks, trim, cut at 80 code points via `Array.from`, `trimEnd`, empty to `null`, non-string to `null`).
  - Create `src/engine/intent.test.ts` with the example cases from design 8.1: trim, line-break flattening, empty to `null`, exactly 80 and 81 code points, 80 emoji kept whole, 81 emoji cut to 80 with no lone surrogate, 79 ASCII plus one emoji keeps the emoji as the 80th code point, 79 ASCII plus two emoji keeps only the first, non-string input, idempotence.
  - Files: `src/engine/intent.ts`, `src/engine/intent.test.ts`.
  - Requirements: R2.4, Decision Q2. Properties: none.
  - Done when `npm run verify` passes.

- [x] 3. History helpers
  - Create `src/engine/history.ts` with `entryOf(session, endedAt, outcome)` and `appendEntry(history, entry)` (idempotent on `(startedAt, endedAt)`, returns the same array when the entry exists, never edits or reorders).
  - Create `src/engine/history.test.ts`: append keeps order oldest first; appending the same entry twice returns the same array reference; earlier entries are the same objects; input array is not mutated.
  - Files: `src/engine/history.ts`, `src/engine/history.test.ts`.
  - Requirements: R10.1, R10.2, R9.5, R12.3. Properties: none (covered by P10 later).
  - Done when `npm run verify` passes.

- [x] 4. Time formulas and settle
  - Create `src/engine/time.ts`: `completionAt`, `pauseLimitAt`, `burnMs` with the clamp on `litSince` / `pausedAt` (design 4.1).
  - Create `src/engine/settle.ts`: `settle(state, now)` with `endBurnedOut` (sets `breakEndsAt = end + BREAK_MS`) and `endSnuffed` (design 4.2). Same reference when nothing is due; idempotent.
  - Create `src/engine/step.test.ts` and add the settle cases: completes at `now >= completionAt` dated to the true instant; exactly at the 10-minute pause limit is still paused, one ms later is `snuffed` at the limit instant; settle is idempotent; clock moving backwards gives zero elapsed, never negative; history gets exactly one entry.
  - Files: `src/engine/time.ts`, `src/engine/settle.ts`, `src/engine/step.test.ts`.
  - Requirements: R3.4, R3.5, R4.1, R4.5, R5.1, R5.2, R5.3, R7.1, R10.1. Properties: none (covered by P2, P3, P7 later).
  - Done when `npm run verify` passes.

- [x] 5. The `step` function
  - Create `src/engine/step.ts` (design 4.3): non-finite `now` returns the state unchanged, `Math.floor(now)`, `hide`/`show` return the same reference without settling, `reload` settles `event.state`, `tick` settles, every other event settles first and then handles `light`, `pause`, `resume`, `snuff`; unknown events return the state; exhaustive `never` check.
  - Extend `src/engine/step.test.ts`: lengths 4, 5, 90, 91, 25.5 and `NaN`; `light` from each of the five phases (ignored in `lit`/`paused`, starts a new session from `idle`/`burned-out`/`snuffed`); pause and resume; exactly 10 minutes of pause allowed and 10 minutes plus 1 ms snuffed at the limit instant; `resume` after the limit snuffs; late completion dated to the true instant; `light` after a late completion records the old session once, then starts the new one; `snuff` from `lit` and `paused` with end time `now`; `snuff` after completion is ignored; `hide`/`show`/non-finite `now` return the same reference; input state and event are not mutated (frozen objects).
  - Files: `src/engine/step.ts`, `src/engine/step.test.ts`.
  - Requirements: R1.1 to R1.5, R2.1 to R2.5, R3.1 to R3.6, R4.2, R5.1 to R5.4, R6.1, R6.2, R8.2, R12.1 to R12.4. Properties: none (covered by P1 to P4, P7, P9, P10 later).
  - Done when `npm run verify` passes.

- [x] 6. Selectors
  - Create `src/engine/selectors.ts`: `timeLeftMs`, `waxFraction`, `isBreak` (design 4.4). Return 0 / 0 / `false` for non-finite `now`, and 0 for `idle`, `burned-out` and `snuffed` where there is no running candle.
  - Create `src/engine/selectors.test.ts`: time left and fraction at start, halfway and at completion; frozen while paused; clamped when `now` is before the anchor; `isBreak` is true one ms before `breakEndsAt` and false at and after it; non-finite `now`.
  - Files: `src/engine/selectors.ts`, `src/engine/selectors.test.ts`.
  - Requirements: R4.4, R4.5, R4.6, R7.2, R12.4. Properties: none (covered by P5, P11 later).
  - Done when `npm run verify` passes.

- [x] 7. Validation and serialization
  - Create `src/engine/validate.ts`: field guards and the per-phase consistency checks of design 5.3 (safe integers, ranges, ordering, `breakEndsAt === endedAt + BREAK_MS`, `pausedTotalMs <= PAUSE_LIMIT_MS`).
  - Create `src/engine/serialize.ts`: `serializeSession` (null for idle), `serializeHistory`, `readHistory`, `readSession` (status `absent | ok | unreadable`), `parseHistory`, `restoreState` (invalid entries dropped one by one, valid ones unchanged; anything else falls back to idle or an empty history; crash repair with idempotent `appendEntry`). None of them throws.
  - Create `src/engine/serialize.test.ts`: the documented JSON examples round-trip; corrupt inputs (`""`, `"{"`, wrong `v`, wrong types, missing `entries`, inconsistent phase fields) give idle or `[]` without throwing; status values for absent, ok and unreadable text; a history document with some invalid entries is `ok` and keeps the valid ones intact; restored `burned-out` with a missing history entry gets it added once.
  - Files: `src/engine/validate.ts`, `src/engine/serialize.ts`, `src/engine/serialize.test.ts`.
  - Requirements: R9.1, R9.4, R10.3, R10.4, R10.5, R7.6. Properties: none (covered by P6, P8 later).
  - Done when `npm run verify` passes.

- [x] 8. Public engine API
  - Create `src/engine/index.ts` re-exporting only the public surface: `step`, the selectors, the serialization functions, types, constants. Keep `settle`, `time` and `validate` internal.
  - Files: `src/engine/index.ts`.
  - Requirements: R11.1, R12.1. Properties: none.
  - Done when `npm run verify` passes.

- [x] 9. Storage adapter
  - Create `src/storage/storage.ts` (design section 6 and 6.1): `KeyValueStore`, `SESSION_KEY`, `HISTORY_KEY`, the two `:unreadable` backup keys, `browserStore()` (try/catch around `window.localStorage`), and `createStorage(kv)` with `load()` and `save(prev, next)`. Every call in `try/catch`; history key written only when the history reference changed; idle removes the session key; backup of unreadable raw text once, before the first write, only if the backup key is empty, and no overwrite when the backup cannot be written. It imports from `src/engine/index.ts` only.
  - Create `src/storage/storage.test.ts` with a fake `KeyValueStore` and call log: round-trip; `null` store; `getItem` throws; `setItem` throws a quota error; history write skipped when unchanged; the unreadable-text cases from design 8.1 (invalid JSON, wrong `v`, no `entries`; unreadable session; backup copied once; existing backup not overwritten; failed backup leaves the key untouched and retries; absent, valid, and partially-dropped text create no backup).
  - Files: `src/storage/storage.ts`, `src/storage/storage.test.ts`.
  - Requirements: R9.1, R9.4, R10.5, R11.2, R11.3, R11.4. Properties: none.
  - Done when `npm run verify` passes.

- [x] 10. Test kit
  - Create `src/engine/test-kit.ts` (design 8.2): `arbT0`, `arbGap`, `arbSignedGap`, `arbLength`, `arbBadLength`, `arbIntent`, `arbStep`, `arbScript`, `arbEntry`, `arbHistory`, `runScript` (turns `reload` steps into a real serialize/restore round trip; never reads a clock), and `assertInvariants(state)`.
  - Create `src/engine/test-kit.test.ts`: `runScript` is deterministic for the same script and `t0`; `assertInvariants` accepts states produced by `step` and rejects hand-built bad states (pause total over the limit, `breakEndsAt` on a snuffed state, unordered anchors).
  - Files: `src/engine/test-kit.ts`, `src/engine/test-kit.test.ts`.
  - Requirements: supports R1 to R12 test coverage. Properties: supports P1 to P11.
  - Done when `npm run verify` passes.

- [x] 11. Property test setup file
  - Create `src/engine/step.prop.test.ts` with the shared `fc.assert` settings (`numRuns: 300`) and an empty `describe('step properties')`, plus `src/engine/selectors.prop.test.ts` and `src/engine/serialize.prop.test.ts` with their headers. Each file imports only from the test kit and the engine's public API.
  - Files: `src/engine/step.prop.test.ts`, `src/engine/selectors.prop.test.ts`, `src/engine/serialize.prop.test.ts`.
  - Requirements: P1 to P11 file layout. Properties: none yet.
  - Done when `npm run verify` passes.

- [x] 12. Required: P1, time left never increases while lit
  - Add the P1 test to `src/engine/step.prop.test.ts` per design 8.2: for consecutive trace entries that are both `lit` or `paused` in the same session, `timeLeftMs` does not increase.
  - Files: `src/engine/step.prop.test.ts`.
  - Requirements: R4.4, R3.3. Properties: P1.
  - Done when `npm run verify` passes.

- [x] 13. Required: P2, pausing never changes total burn time
  - Add the P2 test: up to 10 pause/resume pairs with total pause within the limit; at `t0 + L + P - 1` the state is `lit` with 1 ms left, at `t0 + L + P` it is `burned-out` with `endedAt = t0 + L + P` and `pausedTotalMs = P`; a pause-free run ends at `t0 + L`.
  - Files: `src/engine/step.prop.test.ts`.
  - Requirements: R3.3, R4.1. Properties: P2.
  - Done when `npm run verify` passes.

- [x] 14. Required: P3, tick rate does not matter
  - Add the P3 test with both variants (random inserted ticks interpolated between neighbours; a fixed-period tick every `period` ms capped at 500): state after every original event is `toStrictEqual` to the base run.
  - Files: `src/engine/step.prop.test.ts`.
  - Requirements: R4.3, R5.3, R5.4. Properties: P3.
  - Done when `npm run verify` passes.

- [x] 15. Required: P4, no illegal states or transitions
  - Add the P4 test: scripts with invalid steps, small negative gaps and junk `reload` events; `step` never throws; `assertInvariants` after every step; only the allowed moves; new sessions start with `litSince = startedAt = now`; `paused -> lit` keeps `startedAt`; nothing moves to `idle`.
  - Files: `src/engine/step.prop.test.ts`.
  - Requirements: R1.1 to R1.5, R12.1 to R12.3. Properties: P4.
  - Done when `npm run verify` passes.

- [x] 16. Required: P5, wax fraction bounds and anchor clamp
  - Add the P5 test to `src/engine/selectors.prop.test.ts`: signed gaps, probe times around the anchor; `waxFraction` in `[0, 1]`; equals the anchor value for probes at or before the anchor; never exceeds it past the anchor.
  - Files: `src/engine/selectors.prop.test.ts`.
  - Requirements: R4.4, R4.5, R4.6. Properties: P5 (as reworded).
  - Done when `npm run verify` passes.

- [x] 17. Required: P6, history JSON round trip
  - Add the P6 test to `src/engine/serialize.prop.test.ts`: `parseHistory(serializeHistory(h))` is `toStrictEqual` to `h` for generated histories with arbitrary intents (quotes, backslashes, emoji, CJK, lone surrogates); the JSON carries `"v": 1`; `parseHistory` of arbitrary strings never throws and returns an array; injected invalid entries are dropped and the valid ones come back in order.
  - Files: `src/engine/serialize.prop.test.ts`.
  - Requirements: R10.3, R10.4, R10.5. Properties: P6.
  - Done when `npm run verify` passes.

- [x] 18. Required: P7, the pause limit
  - Add the P7 test to `src/engine/step.prop.test.ts`: pause durations around the allowance (`allowance - 1`, `allowance`, `allowance + 1`, plus random up to 20 minutes), noticed late by `tick`, `resume`, `snuff`, `pause`, `light` or `reload`; within the allowance `resume` gives `lit` with the pause total increased; beyond it the result is `snuffed` with `endedAt = pausedAt + allowance`; `pausedTotalMs` never exceeds 600 000 in any trace state; include multi-pause sequences.
  - Files: `src/engine/step.prop.test.ts`.
  - Requirements: R3.4, R3.5, R3.6. Properties: P7.
  - Done when `npm run verify` passes.

- [x] 19. Required: P8, reload equals tick
  - Add the P8 test to `src/engine/serialize.prop.test.ts`: for every `lit`, `paused` and `burned-out` state in generated traces, `restoreState(serializeSession(s), serializeHistory(s.history))` is `toStrictEqual` to `s`, and `step(s, reload(restored), T)` is `toStrictEqual` to `step(s, tick, T)` for random `T` up to 6 hours later.
  - Files: `src/engine/serialize.prop.test.ts`.
  - Requirements: R9.1, R9.2, R9.3. Properties: P8.
  - Done when `npm run verify` passes.

- [x] 20. Required: P9, hide and show never change state
  - Add the P9 test to `src/engine/step.prop.test.ts`: for every state in generated traces and any `now`, `step(s, hide, now) === s` and `step(s, show, now) === s` (same reference).
  - Files: `src/engine/step.prop.test.ts`.
  - Requirements: R8.2, R5.4. Properties: P9.
  - Done when `npm run verify` passes.

- [x] 21. Required: P10, one history entry per ended session
  - Add the P10 test to `src/engine/step.prop.test.ts`: history never shrinks; old entries are the same objects in the same positions; length grows by exactly 1 when a step ends a session (including via settle inside `light` or `reload`) and by 0 otherwise; total entries equal the number of sessions ended; reloading the same running state twice at a late `T` adds exactly one entry.
  - Files: `src/engine/step.prop.test.ts`.
  - Requirements: R10.1, R10.2, R9.5. Properties: P10.
  - Done when `npm run verify` passes.

- [x] 22. Required: P11, the break selector
  - Add the P11 test to `src/engine/selectors.prop.test.ts`: for every state and probe time around `endedAt` and `breakEndsAt`, `isBreak` equals `phase === 'burned-out' && probe < breakEndsAt`; `breakEndsAt` exists only on `burned-out` states; `breakEndsAt` equals the end time computed independently from the script (`t0 + L + P`) plus 300 000.
  - Files: `src/engine/selectors.prop.test.ts`.
  - Requirements: R7.1, R7.2, R7.4. Properties: P11.
  - Done when `npm run verify` passes.

- [x] 23. Required: purity test
  - Create `src/engine/purity.test.ts`: read the non-test `.ts` files in `src/engine/` with `node:fs` (excluding `*.test.ts`, `*.prop.test.ts` and `test-kit.ts`) and fail if any mentions `window`, `document`, `localStorage`, `Date.now`, `performance` or `Math.random`; also fail if any imports from `../storage`, `../ui`, `../scene` or `../audio`.
  - Files: `src/engine/purity.test.ts`.
  - Requirements: R11.1, R4.2. Properties: none.
  - Done when `npm run verify` passes.

- [x] 24. Wrap-up
  - Run `npm run verify` and confirm every property test ran with its full number of runs (no skipped or `todo` tests).
  - Update `.kiro/steering/structure.md` if the final layout differs from it (for example the `test-kit` files).
  - Add a `KIRO_USAGE.md` entry for the implementation, with the real surface used, what Kiro produced, and anything changed by hand.
  - Files: `.kiro/steering/structure.md` (only if needed), `KIRO_USAGE.md`.
  - Requirements: all. Properties: P1 to P11 all passing.
  - Done when `npm run verify` passes.

## Coverage check

| Requirement | Tasks |
|---|---|
| R1 | 1, 5, 15 |
| R2 | 2, 5 |
| R3 | 4, 5, 13, 18 |
| R4 | 4, 6, 12, 14, 16, 23 |
| R5 | 4, 5, 14, 20 |
| R6 | 5 |
| R7 | 4, 6, 7, 22 |
| R8 | 1, 5, 20 |
| R9 | 3, 7, 9, 19, 21 |
| R10 | 3, 7, 9, 17, 21 |
| R11 | 8, 9 (R11.4 backup of unreadable text), 23 |
| R12 | 1, 5, 6, 15 |

| Property | Task |
|---|---|
| P1 | 12 |
| P2 | 13 |
| P3 | 14 |
| P4 | 15 |
| P5 | 16 |
| P6 | 17 |
| P7 | 18 |
| P8 | 19 |
| P9 | 20 |
| P10 | 21 |
| P11 | 22 |
