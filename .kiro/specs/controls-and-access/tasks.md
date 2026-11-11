# Tasks: controls-and-access

Implements `design.md` against `requirements.md` in this folder (design review applied: the Settings opener is a zone control, and the Tab order equals the visual order). Work the tasks in order; each builds on the previous ones.

Conventions for every task:

- TypeScript strict, no `any`, exact dependency versions, **no new dependencies** (R1.9: no DOM library for Vitest).
- Tests are colocated next to the source (`*.test.ts`, `*.prop.test.ts`) per `.kiro/steering/structure.md`; Playwright tests are `*.spec.ts` in `e2e/`.
- The pure modules of `src/ui/` (`format`, `length`, `light`, `keys`, `ui-state`, `view`, `announcer`, `layout`) and `src/storage/settings.ts` import nothing from the DOM, `window`, `document`, `localStorage`, `Date`, `performance`, `Math.random`, timers or `requestAnimationFrame`. They take `now` and the viewport as arguments. `src/ui/` imports only `src/engine/index.ts`, `src/strings.ts` and, as a type, `Settings` from `src/storage/settings.ts` (design 1.4). It does not import `src/scene/`.
- `src/scene/` does not change. `src/engine/` changes only by the one additive selector of tasks 1 and 2.
- All user-visible text is in `src/strings.ts`. The word "Pomodoro" appears nowhere (R1.8). User text reaches the page only through `textContent` or an input's `value`; no `innerHTML`, no style attributes (design 4.1).
- A task is done only when `npm run verify` passes (type-check and lint, unit tests, build, e2e).
- Property-test tasks (2, 5, 7, 9, 11, 13, 14, 17, 19, 21) are **required**, not optional. Every property test uses the engine's shared `PROP_PARAMS` (`numRuns: 300`) from `src/engine/test-kit.ts`. Never lower it, never weaken a property to make it pass. If a property fails, report the shrunk counterexample and the seed, say whether the bug is in the code or the test, fix the right one, and record it in `KIRO_USAGE.md`.
- Following `scene.md`, any task that changes what a user sees names the screenshots it affects; all of them are retaken in tasks 36 and 37.
- Test counts are reported at each task's end (`npm run verify` prints them); the wrap-up compares them with the starting counts (28 unit files, 463 tests, 71 e2e tests).

## Tasks

- [x] 1. The engine selector `pauseLeftMs` and its unit tests (a session-engine addition)
  - In `src/engine/selectors.ts` add `pauseLeftMs(state, now)` exactly as in design section 2: `0` unless the phase is `paused` and `now` is finite; otherwise `pauseLimitAt(state) - max(floor(now), state.pausedAt)` clamped to `[0, PAUSE_LIMIT_MS - session.pausedTotalMs]`. Import `pauseLimitAt` from `./time` and `PAUSE_LIMIT_MS` from `./constants`. Export it from `src/engine/index.ts`. Do not touch `step`, `settle`, the types or the serialized formats.
  - In `src/engine/selectors.test.ts` add examples: a pause that has just started (full allowance); halfway; with an earlier closed pause (`pausedTotalMs` of 4 minutes leaves 6); at the limit instant (exactly 0, and the state is still `paused` after a `tick`); one millisecond past it (0, and a `tick` snuffs); a clock that moved backwards (`now` before `pausedAt` gives the full remaining allowance, never more); `idle`, `lit`, `burned-out` and `snuffed` (0); `NaN` and infinite `now` (0); a fractional `now` (floored); the input state is not changed.
  - Record the addition: update `.kiro/specs/session-engine/design.md` Decisions item 10 to say "built by `controls-and-access` tasks 1 and 2", and the matching note in `.kiro/specs/session-engine/requirements.md` Decisions. Change nothing else in the session-engine spec.
  - Files: `src/engine/selectors.ts`, `src/engine/index.ts`, `src/engine/selectors.test.ts`, the two session-engine spec files.
  - Requirements: R1.1, R5.6. Properties: none (P9 is task 2).
  - Done when `npm run verify` passes, including the engine's purity test.
  - Result (2026-11-10): `pauseLeftMs` added to `src/engine/selectors.ts` and exported from `src/engine/index.ts`; 10 unit tests added to `selectors.test.ts`, including the boundary (elapsed 0 gives the whole allowance, exactly `PAUSE_LIMIT_MS` gives 0 and the state is still `paused`, one millisecond past gives 0 and a tick snuffs). The session-engine Decisions (design item 10, requirements note) now say it is built.
- [x] 2. Required: P9, the pause allowance
  - Add P9 to `src/engine/selectors.prop.test.ts`, with the engine's generators (`arbScript`, `runScript`) and probe times drawn around each paused state's limit instant (the limit minus a gap, the limit, the limit plus a gap, and arbitrary): `pauseLeftMs` is in `[0, PAUSE_LIMIT_MS]` for every state and `now`, including `NaN`, infinite and negative `now`; it is 0 in every phase but `paused`; while `paused` it never increases as `now` grows (probe pairs `a <= b`); it equals `pausedAt + (PAUSE_LIMIT_MS - pausedTotalMs) - now` for `now` between `pausedAt` and the limit, and is 0 from the limit on; if it is greater than 0 then `step(state, tick, now)` is still `paused`; a state that a `tick` has snuffed had `pauseLeftMs === 0`; the input is deep-frozen and unchanged.
  - Files: `src/engine/selectors.prop.test.ts`.
  - Requirements: R5.6. Properties: P9.
  - Done when `npm run verify` passes.
  - Result (2026-11-10): P9 added to `selectors.prop.test.ts` (300 runs): range, zero outside `paused`, non-increasing, the exact formula, agreement with a `tick`, and no change to the input (deep-frozen copy). Mutation spot-checks: with the `max(now, pausedAt)` floor and the clamp removed (`pauseLimitAt(state) - floor(now)`) the property failed (seed -830941260, a paused state probed before its pause began gave 1000000600001 against a bound of 600000); with an off-by-one (`floor(now) + 1`) it failed too; both restored.
- [x] 3. UI purity test, banned-call scan and test-kit skeleton
  - Create `src/ui/purity.test.ts` (design 13.1) with a comment-stripping, whole-word scanner like the engine's and the scene's: the pure modules (`format.ts`, `length.ts`, `light.ts`, `keys.ts`, `ui-state.ts`, `view.ts`, `announcer.ts`, `layout.ts`) and `src/storage/settings.ts` contain none of `window`, `document`, `localStorage`, `Date`, `performance`, `Math.random`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `matchMedia`; they import only `../engine`, `../strings` and (types) `../storage/settings`; `test-kit.ts` is imported by no non-test file; `src/ui/` never imports `src/scene/` or `src/distraction/`; and the banned calls `innerHTML`, `insertAdjacentHTML`, `document.write`, `setAttribute("style"` and `style.cssText` appear nowhere in `src/ui/`. The test lists the files that exist so far and skips the ones not yet written; a later task adds each file to the list (it fails if a listed file is missing).
  - Create `src/ui/test-kit.ts` (test-only) with the shared arbitraries that later tasks fill in: `arbKeyDescriptor`, `arbFocusKind`, `arbLengthText`, `arbIntentText`, `arbSettingsDoc`. It re-exports `PROP_PARAMS`. Add only what is used when it is first used.
  - Remove `src/ui/.gitkeep`.
  - Files: `src/ui/purity.test.ts`, `src/ui/test-kit.ts`.
  - Requirements: R1.5, R1.7. Properties: none.
  - Done when `npm run verify` passes.

  - Result (2026-11-10): purity.test.ts (27 tests) and test-kit.ts written; the pure list grows with each task (now format, length, light, keys, ui-state).
- [x] 4. `format.ts`: the time text, the spoken time, `fill`
  - Create `src/ui/format.ts` (design 3.1): `formatTime(ms)` (`mm:ss`, minutes at least two digits, rounded up to whole seconds, `00:00` for zero, negative, `NaN` and infinite), `spokenTime(ms)` (minutes and seconds in words with singular and plural units, a zero unit skipped, "0 seconds" for zero, the same rounding) and `fill(template, values)` (`{name}` substitution, unknown names left as they are). `spokenTime` takes its unit templates from `strings.ts`: this task adds the small `time` group there (`minute`, `minutes`, `second`, `seconds`, `timeLeft`, `timeUnknown`, drafts in design 8.9); task 15 adds the rest.
  - Create `src/ui/format.test.ts` with the examples of the requirements: `formatTime` at 0, 1, 999, 1000, 1001 ms, 60 000, 12 minutes 30.1 s (`12:31`), 25 minutes (`25:00`), 90 minutes (`90:00`), `NaN`, `-5`, `Infinity`; `spokenTime` at 12:31, 1:00, 0:45, 0, 1:01 (singular units); `fill` with one, two, repeated and unknown placeholders.
  - Files: `src/ui/format.ts`, `src/ui/format.test.ts`, `src/strings.ts` (the `time` group); add `format.ts` to the purity list.
  - Requirements: R7.3, R7.7, R9.1. Properties: none (P1 is task 5).
  - Done when `npm run verify` passes.

  - Result (2026-11-10): format.ts and STRINGS.time added. Found by P1 (task 5): ms of 5e-324 made Math.ceil(ms/1000) underflow to 0; fixed with Math.max(1, ...).
- [x] 5. Required: P1, the time text
  - Create `src/ui/format.prop.test.ts` and add P1: for arbitrary `ms` (integers and fractions in `[0, 90 minutes]`, then negatives, `NaN`, `±Infinity`, large values) the text matches `^\d{2,}:\d{2}$`; seconds are 00 to 59; for finite `ms` in `[0, 90 minutes]` its value in seconds equals `ceil(ms / 1000)`; the text is `00:00` for `ms` of 0, negative, `NaN` or infinite and only then; reading the text back gives the same seconds; for finite `a >= b` the text of `a` is not earlier than that of `b`; at `ms` equal to a whole length it shows that length; `spokenTime` names the same minutes and seconds as `formatTime` (digits extracted from the sentence).
  - Files: `src/ui/format.prop.test.ts`.
  - Requirements: R7.3, R9.1. Properties: P1.
  - Done when `npm run verify` passes.

  - Result (2026-11-10): P1 added (300 runs); oracle uses the bounds (s-1)*1000 < ms <= s*1000. Mutation: round-down mutant caught (seed -152089541).
- [x] 6. `length.ts`: parsing and the chooser's movement
  - Create `src/ui/length.ts` (design 3.2): `LengthChoice`, `LengthResult`, `parseLength(text)` (trim ASCII space and tab, then `^[0-9]{1,3}$`, then `MIN_LENGTH_MIN <= value <= MAX_LENGTH_MIN`, with the reasons `empty`, `format`, `range`; no `Number(text)` shortcut), `lengthOf(choice)`, and `nextChoice(index, key)` for the four stops (Left and Up previous, Right and Down next, wrapping). Take the constants from the engine.
  - Create `src/ui/length.test.ts`: `parseLength` at 4, 5, 90, 91, ` 25 `, `025`, `2 5`, `25.0`, `+25`, `2e1`, `0x19`, `25.`, empty, and an Arabic-Indic digit text; the reasons; `lengthOf` for presets and custom; `nextChoice` for every index and key.
  - Files: `src/ui/length.ts`, `src/ui/length.test.ts`; add `length.ts` to the purity list.
  - Requirements: R2.1, R2.3, R2.4. Properties: none (P2 is task 7).
  - Done when `npm run verify` passes.

  - Result (2026-11-10): length.ts written; whitespace-only text gives "empty" (spaces and tabs trimmed only).
- [x] 7. Required: P2 (and P2b), length parsing and chooser movement
  - Create `src/ui/length.prop.test.ts`. P2: generated texts (digit strings of length 0 to 5, padded with spaces and tabs, signed, decimal, exponent, hexadecimal, other digit scripts, mixed text) are accepted exactly when, after trimming, they are one to three ASCII digits worth 5 to 90, and the result is that integer; every integer from 5 to 90 and every preset round-trips through `String`; values 0 to 4 and 91 up are rejected with `range`; the result is never outside 5 to 90. P2b: for any index and arrow key `nextChoice` is in `0..3`, and four presses of the same key return to the start.
  - Files: `src/ui/length.prop.test.ts`.
  - Requirements: R2.4, R2.6. Properties: P2, P2b.
  - Done when `npm run verify` passes.

  - Result (2026-11-10): P2 and P2b added. Mutations: Number(text) parsing caught (counterexample "9.0"); ArrowUp-goes-forward caught.
- [x] 8. `light.ts`: the light request
  - Create `src/ui/light.ts` (design 3.3): `lightRequest(choice, intentText)` returns a refusal with the reason, or `{ ok: true, event: { type: "light", length, intent } }` with the intent passed unchanged and the key omitted when the text is empty.
  - Create `src/ui/light.test.ts`: a preset and an intent; a valid custom length; an invalid custom length for each reason; an empty intent; an intent with line breaks, trailing spaces and 100 characters is passed unchanged (the engine normalizes it).
  - Files: `src/ui/light.ts`, `src/ui/light.test.ts`; add `light.ts` to the purity list.
  - Requirements: R2.6, R3.3, R4.2. Properties: none (P3 is task 9).
  - Done when `npm run verify` passes.

  - Result (2026-11-10): light.ts written.
- [x] 9. Required: P3, the light request through the engine
  - Create `src/ui/light.prop.test.ts` and add P3: for any selection (a preset, or custom text from the P2 generator) and any intent text (arbitrary Unicode, line breaks, long text, emoji, whitespace), `lightRequest` gives either a refusal (and no event exists) or a `light` event whose length is an integer from 5 to 90. Stepping the engine with that event from `idle`, and from `burned-out` and `snuffed` states built with the engine's test kit, always gives `lit`, with `intent` either `null` or a single line of at most 80 code points (`Array.from(intent).length`) with no leading or trailing space, and never throws. An invalid length never produces an event.
  - Files: `src/ui/light.prop.test.ts`.
  - Requirements: R2.6, R3.3, R4.2. Properties: P3.
  - Done when `npm run verify` passes.

  - Result (2026-11-10): P3 added. Mutations: UI trims the intent caught (counterexample preset 15 + " "); invalid length still builds an event caught.
- [x] 10. `keys.ts`: the key map
  - Create `src/ui/keys.ts` (design 3.4): `KeyDescriptor`, `FocusKind` (`body`, `text`, `button`, `other`), `KeyContext`, `KeyAction` and `keyAction(context, key)` with exactly the rows of the design's table: Enter lights outside buttons; Space pauses or resumes outside text fields and buttons; Escape closes an overlay or opens the snuff dialog; `t`/`T` announces the time in `lit` or `paused`, never with a text field focused; anything with Ctrl, Alt or Meta and anything with `repeat` gives nothing; with an overlay open only Escape applies. No key ever gives a snuff.
  - Create `src/ui/keys.test.ts`: every row of the table, including each phase, each focus kind, each overlay, Shift+Space, Ctrl+Enter, Alt+Space, a held Space and Enter, `t` in the intent field.
  - Files: `src/ui/keys.ts`, `src/ui/keys.test.ts`; add `keys.ts` to the purity list.
  - Requirements: R5.2, R5.3, R6.1, R6.4, R9.5, R10.2, R10.3. Properties: none (P4 is task 11).
  - Done when `npm run verify` passes.

  - Result (2026-11-10): keys.ts written. Design question: every repeat returns null, including a held Escape (R10.3 names only Space and Enter; design adds t).
- [x] 11. Required: P4, the key map
  - Create `src/ui/keys.prop.test.ts` and add P4 over all contexts (phase, overlay, focus kind) and generated key events (printable keys, Enter, Space, Escape, Tab, arrows, with random modifier flags and `repeat`): Ctrl, Alt or Meta gives no action; a repeated Space, Enter or `t` gives no action; Space never gives an action with a text field or any button focused; no key gives a snuff; Escape gives "open the dialog" only in `lit` or `paused` with no overlay open, and "close" with an overlay open; with an overlay open no key gives light, pause or announce; no action is ever invalid for the phase; `t` gives "announce the time" only in `lit` or `paused` with no overlay open and no text field focused.
  - Files: `src/ui/keys.prop.test.ts`.
  - Requirements: R5.3, R6.1, R6.4, R9.5, R10.3. Properties: P4.
  - Done when `npm run verify` passes.

  - Result (2026-11-10): P4 added, plus a metamorphic property (where the plain key acts, Ctrl, Alt, Meta and repeat each give null). Mutations: Space acts with text focus caught; t announces while typing caught; repeats-act and meta mutants first survived 1 run in 8, now caught 10/10.
- [x] 12. `ui-state.ts`: the UI state machine
  - Create `src/ui/ui-state.ts` (design 3.5): `UiState`, `UiAction`, `UiInput`, `Effects`, `FocusTarget` and `uiStep(ui, input, phase)` with every row of the transition table: `light` (success sends one `light` event, clears the intent, focuses `pause-resume`; refusal sets `refusal`, sets `customTouched`, announces the refusal, focuses `custom-length`), `toggle-pause`, `open-snuff`, `keep-burning`, `confirm-snuff` (one `snuff` event only if the phase is still running), `open-settings`, `close-settings`, `announce-time`, `select-preset`, `set-custom`, `set-intent`, and the `engine` input (the snuff overlay closes when the phase leaves `lit` and `paused`; focus to Light unless the user is typing or the settings panel is open, in which case it is held in `pendingFocus`). Also `initialUi(settings)`: the default length selects the preset 15, 25 or 50, or the custom stop with the text of the number.
  - Create `src/ui/ui-state.test.ts`: every row of the table and each invariant of the design (the dialog only while running; a `snuff` event only from `confirm-snuff` with the dialog open; no `tick`, `hide`, `show` or `reload` event is ever produced; an action not valid for the phase changes nothing).
  - Files: `src/ui/ui-state.ts`, `src/ui/ui-state.test.ts`; add `ui-state.ts` to the purity list.
  - Requirements: R2.2, R2.5, R3.5, R4, R5, R6, R10.5. Properties: none (P5 and P8 are tasks 13 and 14).
  - Done when `npm run verify` passes.

  - Result (2026-11-10): ui-state.ts and 33 unit tests written; ui-state.ts added to the purity list. Design gaps reported: no settings-change action in 3.5 (11.2 mentions one); typing vs pendingFocus (3.5 vs section 10, followed section 10); confirm-snuff sends snuff only while running and holds pendingFocus "light" for the engine input; initialUi takes { defaultLength }.
- [x] 13. Required: P5, the UI state machine against the engine
  - In `src/ui/test-kit.ts` add the UI script generator and a small interpreter that applies a script the way `main.ts` does: a UI input goes through `keyAction` where it is a key, then `uiStep`; its events go through `step` at the script's `now`; after every step the interpreter feeds the `engine` input when the phase changed (as `update` does). Script steps: key presses, button clicks, preset and text changes, time advances of any size (including long gaps), visibility changes, reloads, and engine events from the engine's `arbScript`.
  - Create `src/ui/ui-state.prop.test.ts` and add P5: the engine's own invariants (`assertInvariants`) hold after every step and the phases follow only the allowed transitions; `snuff` is sent only right after the dialog was open and the confirm was activated, never otherwise; the dialog is open only while the phase is `lit` or `paused`; opening, closing or cancelling the dialog and the settings panel never changes the time left; the UI never sends an event that is invalid for the phase; a script made only of UI inputs that are not Light, Pause, Resume or confirm leaves the engine state exactly where time alone puts it.
  - Files: `src/ui/test-kit.ts`, `src/ui/ui-state.prop.test.ts`.
  - Requirements: R1.4, R5, R6.4 to R6.6. Properties: P5.
  - Done when `npm run verify` passes.

  - Result (2026-11-10): P5 added (4 tests: any inputs, control-heavy scripts, neutral-only scripts); interpreter and generators in test-kit.ts. Mutations: keep-burning emits snuff caught 4/4; engine input keeps the dialog caught 4/4; toggle-pause always sends pause first SURVIVED (random scripts rarely reach paused), so a control-heavy generator was added, then caught 8/8. confirm-snuff keeping the overlay open is equivalent at script level (the engine input closes it) and is caught by the unit test instead.
- [x] 14. Required: P8, no UI input changes time
  - Add P8 to `src/ui/ui-state.prop.test.ts`: for any generated engine script (`arbScript`), the engine state after the script is deeply equal whether or not arbitrary UI-only inputs (opening and closing the dialog and the settings panel, changing settings, typing in the fields, Tab, key presses that have no action, a `T` press) were interleaved between the events at the same times.
  - Files: `src/ui/ui-state.prop.test.ts`.
  - Requirements: R1.2, R6.5, R11.7. Properties: P8.
  - Done when `npm run verify` passes.

  - Result (2026-11-10): P8 added: neutral UI inputs interleaved at the same times leave every engine state equal to the plain run, and each sends no event. Mutations: announce-time sends pause caught; open-snuff allowed while idle caught (P5/P8 file).
- [x] 15. Strings
  - Add all the new text to `src/strings.ts` (design 8.9): the setup labels, buttons, the dialog, the settings labels, the time units and `timeLeft`, `timeUnknown`, the status lines, the announcements, the regions, and the unit templates `spokenTime` uses. Keep the existing `title`, `tagline` and `scene` keys unchanged. Use `{name}` placeholders. The draft wording of the design may be improved in the tone of brief section 6 (short and dry); no trademark, no real product name, never "Pomodoro".
  - Create `src/ui/strings.test.ts` (design 13.1): every key used in `src/ui/` exists; every key of the new groups is used by some `src/ui/` file once those exist (until task 24 the check lists the keys still to be used and does not fail on them, and task 24 turns it on); no visible string literal in `src/ui/` outside `strings.ts`; the whole of `src/` contains no "pomodoro" (case-insensitive); every status text that is shown while Pause and Let it go dark are on screen is at most 24 characters or is allowed to be cut (the note records which are cut at 136 px).
  - Files: `src/strings.ts`, `src/ui/strings.test.ts`.
  - Requirements: R1.8, R14. Properties: none.
  - Done when `npm run verify` passes.

  - Result (2026-11-10): STRINGS gained setup, length, intent, light, pause, snuff, settings, status, announce and region (57 keys with the time group); wording kept from design 8.9 except the first-visit line, shortened to "Enter lights. Space pauses. Esc lets it go dark." (48 characters, to fit two lines of the 240 px resting status), and a new key `intent.overLimit` ("{max}+") for the compact over-limit mark of 8.3. `src/ui/strings.test.ts` (8 tests): every key used in `src/ui/` exists; no visible literal in non-test `src/ui/` files (a two-word or sentence-end heuristic); no trademarked word anywhere in `src/` (the check spells it in two pieces and skips `src/strings.test.ts`, which asserts its absence for the scene names); every placeholder is one of n, max, min, time; the running status lines are at most 24 characters (lit 17, guttering 18, "Pause left 10:00" 16) so none needs cutting by that rule; their rendered width at 136 px is NOT measured here (browser test, later). The "every key is used" check is wired but off (`ENFORCE_ALL_USED = false`); 9 keys are still unused until task 23/24 (setup.label, snuff.title/body/keep/confirm, settings.title/close, region.setup/watch). Turn the flag on in task 24.
- [x] 16. `announcer.ts`: what is said, and when
  - Create `src/ui/announcer.ts` (design 3.7, 9.3): `AnnouncerMemory`, `INITIAL_ANNOUNCER`, `nextAnnouncement(mem, state, now)`, `timeAnnouncement(state, now)` and `textOf(announcement)`. Rules: the first call after a load says the state once (with the time if `lit`) and marks the milestones already passed as done; a change of phase says the message for the final phase (a new session resets the milestones; pause and resume keep them); while `lit`, crossing `0.75 · L`, `0.5 · L`, `0.25 · L` and `60 000 ms` of time left (with `<=`) says the latest crossed milestone once each; nothing while `paused`, nothing for the end of the break, nothing for `hide` or `show`, nothing for `timeLeftMs <= 0`. `timeAnnouncement` is the T key's message (`…Paused` variant while paused) and is `null` outside `lit` and `paused`. The refusal and the limit messages are built from keys without state.
  - Create `src/ui/announcer.test.ts`: a 25-minute session called once a second gives exactly lit, q75, q50, q25, last minute, burned out; the same session called once every 10 minutes gives lit, the latest milestone crossed, burned out; a pause and a resume; a reload into a running session (the restored message, no milestone repeated); a 5-minute session (75 s and 60 s are separate); the first call on an idle page and on an ended page (nothing); T in each phase.
  - Files: `src/ui/announcer.ts`, `src/ui/announcer.test.ts`; add `announcer.ts` to the purity list.
  - Requirements: R9.2 to R9.5. Properties: none (P7 is task 17).
  - Done when `npm run verify` passes.

  - Result (2026-11-10): `announcer.ts` written (nextAnnouncement, timeAnnouncement, refusalAnnouncement, limitAnnouncement, textOf, thresholdsMs) and added to the purity list; 16 unit tests: the 25-minute session once a second says exactly lit, q75, q50, q25, lastMinute, burnedOut; every 10 minutes lit, q75, q25, burnedOut; every 20 minutes lit, q25, burnedOut; a 5-minute session has the separate 75 s and 60 s milestones; pause and resume keep the milestones; a reload into a lit or paused session; idle and ended pages say nothing; the pause limit says snuffed; hide, show and the end of the break say nothing; T in each phase. Two details beyond the design pseudocode (recorded in design Decisions from the batch 2 build): the first call after a load marks passed milestones done for `paused` as well as `lit`.
- [x] 17. Required: P7, the announcer
  - Create `src/ui/announcer.prop.test.ts` and add P7: for any generated session (engine script with pauses, resumes, snuffs and reloads) and any set of call times that contains at least one call after each engine event (one call per second, one per frame, only a few, long gaps, a hidden tab): the multiset of state-change messages is the same whatever the call times; the number of automatic messages over the whole session is at most the number of state changes plus 4; each milestone is announced at most once per session and never after a pause, resume or reload that already announced it; when several milestones are crossed between two calls only the latest is said; nothing is announced while `paused` except the pause itself; `hide` and `show` give no message; a refusal gives exactly one message and a T press exactly one, neither counted in the bound; every message text comes from `strings.ts`.
  - Files: `src/ui/announcer.prop.test.ts`.
  - Requirements: R9.3, R9.4, R9.5. Properties: P7.
  - Done when `npm run verify` passes.

  - Result (2026-11-10): P7 added in `announcer.prop.test.ts` (7 properties, 300 runs, scripts from `arbScript` mixed with a candle-that-burns generator with pauses, resumes, reloads, hide and show; call schedules: one call per event, one late call, a fine schedule up to 200 calls per gap, and random times; every schedule has at least one call after each event, and a reload resets the memory). Covers: same state-change messages whatever the call times; at most the state changes plus four milestones per candle and load; each milestone once per candle and in order, never after a pause, resume or reload; only the latest milestone, and only when reached; nothing while paused except the pause, each message fits its phase; hide and show give no message (compared with what a tick alone gives); purity and every text matches a strings.ts template. Mutation spot-checks, all caught (6 runs each for the last three): milestone never marked done caught 2/2; done forgotten after a pause caught 6/6 (first only 1/2 until the burning-candle generator was added: random scripts rarely stay lit long enough to cross a milestone before pausing); earliest milestone said instead of the latest caught 2/2; talks while paused caught 2/2; a reload that forgets the passed milestones caught 2/2; a late call that loses the light message caught 6/6; "announce every minute" caught 6/6.
- [x] 18. `layout.ts`: the stage box and the placement
  - Create `src/ui/layout.ts` (design section 6): `Rect`, `Placement`, `stageBox(vw, vh)` (`s = min(vw/600, vh/1000)`, `ox`, `oy`), and `placeControls(vw, vh)` with the constants `T`, `G`, `M`, `PAD_COLUMN`, `PAD_WINDOW` and the keep-clear column (x 160..440, y 260..900) and window (x 240..360, y 50..260) in room units. The wide mode when `ox >= 360`, else the compact mode with the `top-row` variant (window top at least 50) or the `left-region` variant. The zone: Pause or Resume, the time text and status line, Let it go dark, Settings, left to right, with `timeSize` 36 (compact) or `clamp(zoneH - 28, 32, 44)` (wide), the status line bounded by the buttons (one line while running, up to two lines at rest when `zoneH >= 80`), and the overlays' rectangles (6.6). **Settings is a zone control; nothing is placed above the floor line except the setup controls.**
  - Create `src/ui/layout.test.ts`: the exact rectangles of design 6.5 at 360 × 640 and 1280 × 800; the rectangles at 375 × 667, 768 × 1024, 480 × 800 (`left-region`) and 1920 × 1080; the constants against `src/scene/constants.ts` (`WINDOW`, `CANDLE_H`, `FLOOR_Y`, `LIGHT_MIN`, `LIGHT_FULL_UNITS`) and the halo circle read from `ROOM_SVG` in `src/scene/room.ts` (the test may import them; the source may not); the mode switch at `ox = 360`; the variant switch at window top 50.
  - Files: `src/ui/layout.ts`, `src/ui/layout.test.ts`; add `layout.ts` to the purity list.
  - Requirements: R8.2 to R8.7. Properties: none (P10 is task 19).
  - Done when `npm run verify` passes.

  - Result (2026-11-10): `layout.ts` written (stageBox, placeControls, T, G, M, PAD_COLUMN, PAD_WINDOW, the keep-clear rectangles in room units, DOM_ORDER_SETUP, DOM_ORDER_RUNNING, visibleControls) and added to the purity list; 24 unit tests. The exact rectangles of design 6.5 at 360 x 640 and 1280 x 800 matched at the first run, and so did 375 x 667, 768 x 1024, 480 x 800 (left-region) and 1920 x 1080 (Settings at 1349.2). The constants are compared with `src/scene/constants.ts` (WINDOW, CANDLE_H, FLOOR_Y, LIGHT_MIN, LIGHT_FULL_UNITS), the pool rule in `scene.css` (centre 300, 400, drop 420) and the halo circle in `ROOM_SVG`. Switches tested at ox = 360/359 and window top 50. One name differs from the design: `keepClear.windowPane` (the purity scan forbids the word `window`).
- [x] 19. Required: P10, layout geometry
  - Create `src/ui/layout.prop.test.ts` and add P10 over integer viewports from 360 × 640 to 2560 × 1440 (a generator that also hits the boundaries: `ox` near 360, the window top near 50, the smallest zone heights) plus the four named sizes. Assert, for every viewport: every rectangle is inside the viewport; every control is at least 44 by 44 (the wide labelled buttons wider); every pair that is on screen together keeps at least 4 px (the idle and ended set: chooser, intent, Light, Settings, time text, status line; the running set: Pause, Let it go dark, Settings, time text, status line); every setup control keeps 6 px from the keep-clear column and 1 px from the window pane and is above the floor line; the chooser is above the intent field and the intent field is before Light in reading order; every zone control, the time text and the status line are wholly inside the zone in the order Pause, Let it go dark, Settings from left to right; the time text is inside the text area and the status line clear of every button and inside the viewport; the left edge band below y = 300 room units is free; **no persistent control is above the floor line while a session runs**; and the DOM order of the visible controls (from `Placement`'s documented order list) equals their reading order. Also assert the compact intent field is at least 120 px wide and the status line while running at least 136 px wide. A deliberate mutation (the task note records it) moving Settings above the floor line, and one drawing the chooser under the intent field, must fail the property.
  - Files: `src/ui/layout.prop.test.ts`.
  - Requirements: R8.2 to R8.7, R10.6. Properties: P10.
  - Done when `npm run verify` passes.

  - Result (2026-11-10): P10 added in `layout.prop.test.ts` (4 tests): the four named sizes; 1500 random viewports from 360 x 640 to 2560 x 1440 with boundary generators (ox near 360, window top near 50, the smallest zones, the edges); a regular sweep of 170 x 48 viewports; purity. Rules checked: inside the viewport, 44 x 44, 4 px between every pair on screen together, 6 px from the column and 1 px from the window pane, above the floor line, chooser above the intent field, intent before Light, zone order Pause < Let it go dark < Settings and all inside the zone, time text inside the text area and centred on the candle, status line inside the viewport and at least 136 px wide while running, compact intent at least 120 px wide, nothing above the floor line while a session runs, DOM order equals reading order, the compact snuff dialog stops above the halo. Two readings of the task text, flagged for the owner: the time text and the status line touch in the design's own rectangles (6.5), so that pair is required to be stacked (status under the time) instead of 4 px apart; and the left-edge-band check covers the rows from 300 room units down to the floor line (Pause at x 8..52 is in the band's columns at 360 x 640 but below the floor line). Mutations, all caught: Settings moved above the floor line; chooser drawn under the intent field; Light moved into the window pane; the wide time text fixed at 44 px (caught by the random property at 1104 x 640, as the design's first script found).
- [x] 20. The settings document and store
  - Create `src/storage/settings.ts` (design 11.1): `Settings`, `DEFAULT_SETTINGS` (sound on, ghosts on, default length 25), `SETTINGS_KEY` (`candlewatch:settings`), `SETTINGS_SCHEMA_VERSION` (1), `serializeSettings`, `parseSettings` (never throws; each field read on its own; unknown fields dropped; a newer version read as defaults and not overwritten until the user changes a setting) and `createSettingsStore(kv)` (in-memory when `kv` is `null`, try/catch on read and write; unreadable text is copied to `candlewatch:settings:unreadable` before the first write over it, as the session and history adapter does, changed from "no backup copy" on the owner's instruction in batch 2). Import `KeyValueStore` from `./storage` and the length range from the engine's index only.
  - Create `src/storage/settings.test.ts`: the defaults; each fall-back (missing, not JSON, not an object, wrong version, a boolean field of the wrong type, a default length of 4, 91, 25.5, `"25"`); unknown fields dropped; a newer version; the in-memory fallback; a store whose `getItem` and `setItem` throw.
  - Files: `src/storage/settings.ts`, `src/storage/settings.test.ts`; add `settings.ts` to the purity list.
  - Requirements: R11.1, R11.4 to R11.6. Properties: none (P6 is task 21).
  - Done when `npm run verify` passes.

  - Result (2026-11-10): `src/storage/settings.ts` written (Settings, DEFAULT_SETTINGS, SETTINGS_KEY, SETTINGS_BACKUP_KEY, SETTINGS_SCHEMA_VERSION, readSettings, parseSettings, serializeSettings, createSettingsStore) and added to the purity list (a storage file may import the engine index and `./storage`); 19 unit tests (defaults, fixed key order, each fall-back, a default length of 4, 91, 25.5, "25", unknown fields dropped, a newer version, in-memory store, throwing getItem/setItem, a failed write kept in memory and retried, the backup rules). **Owner instruction applied:** the unreadable text (not JSON, not an object, or not version 1) is copied to `candlewatch:settings:unreadable` before the first write over it, never over an existing backup, and the original is left untouched if the backup fails; this replaces "no backup copy" (Decision Q6; design 11.1 and the Q6 line of requirements.md are updated). A field that is invalid inside a version 1 object is only defaulted, no backup (as for history entries). `initialUi` now takes `Settings` (batch 1 decision 5); its callers and tests were updated.
- [x] 21. Required: P6, the settings document
  - Create `src/storage/settings.prop.test.ts` and add P6: `parseSettings(serializeSettings(s))` equals `s` for every valid settings value (identity); `parseSettings` of arbitrary text, of arbitrary JSON, and of mutations of a valid document (a field removed, retyped, set out of range, a key added, the version changed) never throws and always returns settings in range, keeping each valid field and defaulting the others; unknown fields are dropped; `serializeSettings(parseSettings(x))` is a fixed point (a second pass gives the same text); a default length outside 5 to 90 is never stored.
  - Files: `src/storage/settings.prop.test.ts`.
  - Requirements: R11.4, R11.5. Properties: P6.
  - Done when `npm run verify` passes.

  - Result (2026-11-10): P6 added in `settings.prop.test.ts` (6 properties, 300 runs): identity for valid settings; no throw and always in range for arbitrary text, arbitrary JSON and mutated valid documents (a field removed, retyped, set out of range, a key added including `__proto__`, the version changed); the result equals an independent reading of R11.5; unknown fields dropped; serialize(parse(x)) is a fixed point; a default length outside 5 to 90 is never written. Mutation spot-checks, all caught 3/3: the range check without its upper bound; one bad field defaulting another; a newer version accepted.
- [x] 22. `view.ts`: the view model
  - Create `src/ui/view.ts` (design 3.6, 7): `ViewModel` and `viewOf(state, ui, settings, now, placement)`: the time text by phase (the time left; the chosen length in `idle`, `--:--` for an invalid custom text; `00:00` after the end), its spoken form, the status line by the table of 7.2 (refusal, first visit, idle, intent, flavour, guttering, pause allowance from `pauseLeftMs`, "The wax cools." while `isBreak`, burned out, snuffed) with the narrow or wide rectangle, which controls are visible (setup in `idle` and the ended phases; Pause or Resume and Let it go dark only while `lit` or `paused`; Settings always), the Pause or Resume label, the chooser state (selected stop, `customInvalid` only when `customTouched`), the intent counter and `overLimit`, the overlay, the settings display texts and the placement. Text comes from `strings.ts` through `fill`; `formatTime` for every time.
  - Create `src/ui/view.test.ts`: the time text and status line for every phase and condition (including the last minute with and without an intent, a paused session counting down the allowance, the break, the first-visit line with an empty history and not after the first session, a refusal and its removal); the visibility flags; the Tab order list; equal inputs give equal outputs.
  - Files: `src/ui/view.ts`, `src/ui/view.test.ts`; add `view.ts` to the purity list.
  - Requirements: R3.4, R4.4, R5.4, R7, R8.1, R14.1, R14.2. Properties: none.
  - Done when `npm run verify` passes.

  - Result (2026-11-10): `view.ts` written (ViewModel, viewOf, StatusKind) and added to the purity list; 21 unit tests: the time text for every phase (idle with a preset, a custom length and an invalid one, lit rounded up, paused still, ended 00:00); the status line for every row of 7.2 (the first-visit line with an empty history and not otherwise, intent, guttering at exactly 60 s with and without an intent, the pause allowance counting down and with an earlier pause, the break and after it, snuffed, a refusal and its removal, the narrow and wide rectangles); visibility flags; Light and Light another, Pause and Resume; the Tab order lists; the chooser, intent counter in code points (emoji) and over-limit flag; the settings texts; equal inputs give equal views. No property is required for this task, so no mutation check.
- [ ] 23. The DOM layer: build and apply (and the live-region writer)
  - Create `src/ui/dom/build.ts` (design 4.1, 4.2): creates the elements once with `createElement` and `textContent`: `form#setup` with the chooser (`role=radiogroup`, three `button[role=radio]` and the custom input), the intent input and Light; `section#watch` with `div#time[role=timer]`, `p#status`, `button#pause`, `button#snuff` and `button#settings-button`, in DOM order = reading order; `div#live[role=status]`; and the two native `<dialog>` elements with their headings, buttons and the settings switches (`role=switch`) and chooser. Accessible names from `strings.ts`; `hidden` plus the `[hidden] { display: none !important }` rule; no `innerHTML`, no style attributes.
  - Create `src/ui/dom/apply.ts`: applies a `ViewModel`, remembering the last value of each field and writing only what changed (placement custom properties through `style.setProperty`, the `hidden` flags, texts, chooser state, `aria-invalid`, the counter, `showModal()` and `close()` only on a change of overlay).
  - Create `src/ui/dom/live.ts` (design 4.4): `say(text)` and `frame()` with the one-frame clear that repeats an identical message.
  - Files: `src/ui/dom/build.ts`, `src/ui/dom/apply.ts`, `src/ui/dom/live.ts`.
  - Requirements: R1.7, R7.2, R7.4, R9.1, R9.2, R9.9. Properties: none.
  - Done when `npm run verify` passes (no browser test yet: this layer is exercised by the e2e tasks).

- [ ] 24. The DOM layer: events, focus and `createInterface`
  - Create `src/ui/dom/events.ts` (design 4.1): one `keydown` listener on `document` that builds a `KeyDescriptor` and a `FocusKind` from `document.activeElement`, calls `keyAction`, and, if there is an action, `preventDefault`s and calls `handle`; click, input and `submit` listeners for the pointer and form actions (the form `submit` is cancelled and becomes `light`); the two dialogs' `cancel` events cancelled and turned into `keep-burning` or `close-settings`; the chooser's arrow keys through `nextChoice` (Up and Down leave the custom field, Left and Right move the caret); `handle` reads `Date.now()` for the moment of the action, runs `uiStep`, sends the events through `dispatch(event, now)`, and passes the effects on (announce to the live writer, settings to `onSettings`, focus to the focus module).
  - Create `src/ui/dom/focus.ts`: resolves a `FocusTarget` to an element with the fallback chain (`#pause`, `#light`, `#settings-button`, none); moves focus after `apply` in the same frame; never moves it while the user is typing.
  - Create `src/ui/index.ts`: `createInterface({ root, sceneRoot, dispatch, now, getState, settings, onSettings })` builds the elements, measures the viewport once before the first update (a `ResizeObserver` on `sceneRoot`, with a `resize` listener fallback), and returns `update(state, now)`: feed the `engine` input to `uiStep` when the phase changed, run the announcer (`say`), compute `viewOf` and `apply` it, then run the focus effect and the live-region `frame`.
  - Turn on the "every key is used" check of `strings.test.ts`.
  - Files: `src/ui/dom/events.ts`, `src/ui/dom/focus.ts`, `src/ui/index.ts`.
  - Requirements: R4, R5, R6, R9, R10, R11. Properties: none.
  - Done when `npm run verify` passes.

- [ ] 25. The stylesheet
  - Create `src/ui/ui.css` (design 12), imported by `main.ts`: the reduced-motion rule first (`#ui, #ui * { transition: none !important; animation: none !important }` under `@media (prefers-reduced-motion: reduce)`), the tokens (`--ui-text`, `--ui-text-subtle`, `--ui-bg`, `--ui-bg-selected`, `--ui-border`, `--ui-focus`, `--ui-error`, `--ui-font`), the `#ui` container (`position: fixed; inset: 0; pointer-events: none`, children `auto`), the placed elements (`left/top/width/height` from `--x --y --w --h`), the time text (tabular numerals, `--time-size`, bold), the status line (ellipsis, `-webkit-line-clamp: 2` at rest), controls (10 px radius, 2 px border, a check mark and heavier border for the selected stop, a double border and "!" for an invalid field), the dialogs (`::backdrop` transparent), the switches with visible On and Off text, the focus ring (`:focus-visible` 3 px outline, 3 px offset, never `outline: none` without a replacement), the visually hidden live region, `[hidden]`, forced-colours and `prefers-contrast: more` rules, and short transitions (120 ms dialog fade, 120 ms switch, 80 ms pressed) that touch neither the time text nor the status line.
  - Create `src/ui/style.test.ts` (design 13.1): reads `ui.css`; the reduced-motion rule is first; no `outline: none` without a replacement; no `!important` outside the two allowed rules; the contrast table of design 12.1 computed from the token values (time and status text on both zone bounds, text on the control fills, subtle and error text, borders, the focus ring, the control fill against the room's brightest background), with the published ratios; the body text is at least 16 px and the time text at least 32 px.
  - Files: `src/ui/ui.css`, `src/ui/style.test.ts`.
  - Requirements: R7.6, R8.10, R10.4, R13. Properties: none.
  - Done when `npm run verify` passes.

- [ ] 26. `main.ts` wiring
  - Update `src/main.ts` exactly in the order of design section 5: the placeholder `h1` and tagline as now; the scene root and a new interface root; `createScene`; the reload step; the one `dispatch`; (the visibility wiring is task 27); the settings store and `createInterface`; the loop (`dispatch` of `tick`, `scene.apply`, `ui.update(state, now)`). Import `./ui/ui.css`. The interface receives `dispatch`, never `step`. `Date.now()` is read only in the loop, the visibility clock and (inside `src/ui/dom/events.ts`) the moment of a user action.
  - Run the page by hand once (`npm run dev` started with `Start-Process`, as in earlier specs): the first-visit line, Light, the time text, Pause, the snuff dialog; stop the server afterwards.
  - Files: `src/main.ts`.
  - Requirements: R1.2, R1.6, R11. Properties: none.
  - Done when `npm run verify` passes.

- [ ] 27. The visibility wiring
  - In `src/main.ts`, after the reload step and before the first frame, add the wiring of design section 5: `browserVisibilityTarget()`; when it is not `null`, build `{ target, clock: Date.now, send: (type, now) => dispatch({ type }, now) }`, call `syncVisibility(wiring)` once, then `watchVisibility(wiring)`. When there is no target, skip without error. The interface does not react to `hide` and `show` (no text, announcement or focus change).
  - Add a unit test of the wiring order if it can be done without a DOM (a small `wireVisibility(deps)` function in `src/main.ts`'s own module or a new `src/wiring.ts`, imported by `main.ts`, with injected `dispatch`, `clock` and target; `syncVisibility` before `watchVisibility`; no target means no calls). Otherwise the order is covered by E8 (task 34) and the task note says so.
  - Files: `src/main.ts`, optionally `src/wiring.ts` and `src/wiring.test.ts`.
  - Requirements: R12. Properties: none.
  - Done when `npm run verify` passes.

- [ ] 28. E2E helpers
  - Create `e2e/controls-fixtures.ts` (design 13.3): `openApp(browser, options)` (nothing stored, or a fixture from `scene-fixtures.ts`; `page.clock.install({ time })`; the viewport; reduced motion; touch) built on the existing `openScene` where it fits; `settle(page)` (`page.clock.runFor(48)`, three frames); `storedSession(page)` (reads `localStorage` and parses with the engine's `readSession`); `timeText`, `statusText`, `liveLog(page)` (a `MutationObserver` installed before load that records the live region's text with its frame), `focused(page)` (accessible name and id of `document.activeElement`), `rectOf(page, selector)`, `expectedPlacement(vw, vh)` (imports `placeControls`), and the viewport constants (`phone` 360 × 640, `desktop` 1280 × 800, plus 768 × 1024 and 1920 × 1080 from `scene-fixtures.ts`).
  - Create a one-test smoke in `e2e/controls.spec.ts` that loads the page with nothing stored and sees the first-visit status line and the Light button, to prove the helpers.
  - Files: `e2e/controls-fixtures.ts`, `e2e/controls.spec.ts`.
  - Requirements: R15.1. Properties: none.
  - Done when `npm run verify` passes.

- [ ] 29. E2E: whole sessions by keyboard and by touch (E1, E1b, E2)
  - In `e2e/controls.spec.ts` add **E1** (design 13.3: 1280 × 800, nothing stored, the whole keyboard session: Tab to the chooser, ArrowLeft to 15, Tab, type the intent, Enter; Space pause and resume with the pause allowance counting down and the time text still; T; Esc, Keep burning, Esc, Tab, Enter on Snuff it; Enter to light again; the clock run past the end: burned out, dawn, the break line then the end line; a reload keeps the ended state without an announcement), checking after each step the stored session, `data-phase` and `data-flame` on `#scene`, the time text, the status line, the live log and the focused element; **E1b** (360 × 640 with `hasTouch`: the same by taps on the chooser cells, Light, the icon buttons, Keep burning, Snuff it, Light another); and **E2** (the time text at fixed clock points through a 25-minute session: start, 12:31 left, the quarter marks, 59 s, 1 s, the end; wholly inside `.zone-text-area`; written only when it changes, counted with a `MutationObserver`; unchanged while paused; its colour against R7.6 in `lit-start`, `lit-last-minute`, `burned-out` and `idle`).
  - Files: `e2e/controls.spec.ts`.
  - Requirements: R4 to R7, R9, R10, R15.4. Properties: none.
  - Done when `npm run verify` passes.

- [ ] 30. E2E: keys, first visit, T and the pause allowance (E5, E10, E13)
  - In `e2e/controls.spec.ts` add **E5** (Ctrl+Enter, Alt+Space and a held Space do nothing; Space on a focused Settings button opens the settings and does not pause; Enter in the intent field lights; Esc with the settings open closes them and does not open the dialog); **E10** (nothing stored: the one-line instructions show and name the three keys; after a first session is lit they are gone and stay gone after the session ends and after a reload; with a non-empty history they are not shown); **E13** (T in a lit session adds exactly one message to the live region with the time in words, pressed twice adds two; typing "t" in the intent field adds none and types the letter; in a paused session the status line shows `Pause left` counting down while the time text stays still, and the engine snuffs the session when it reaches zero).
  - Files: `e2e/controls.spec.ts`.
  - Requirements: R5.4, R9.5, R10.2, R10.3, R14.2. Properties: none.
  - Done when `npm run verify` passes.

- [ ] 31. E2E: layout (E3, E14)
  - Create `e2e/controls-layout.spec.ts`. **E3**: for each of the four viewports, each of the seven phases (`idle`, `lit-start`, `lit-half`, `lit-last-minute`, `paused`, `burned-out`, `snuffed`) and the states with the dialog and the settings open, read the page's rectangles for `#length`, `#intent`, `#light`, `#pause`, `#snuff`, `#settings-button`, `#time`, `#status` and the dialogs and compare them with `placeControls` (within 1 px); none intersects the rectangles of `.candle`, `.flame-shape`, `.halo` or the window pane (read from the page); the time text is wholly inside `.zone-text-area`; there is no scrollbar; at 360 × 640 and 1280 × 800 the rectangles equal the tables of design 6.5; the compact snuff dialog leaves the flame and halo uncovered for `lit-start`, `lit-half` and `lit-last-minute`. **E14**: during the whole-session scripts of E1 and E1b (reuse their steps), at each step the visible controls match the tables of 6.5 and, while a session runs, no control rectangle is above `.zone-text-area`'s top.
  - Files: `e2e/controls-layout.spec.ts`.
  - Requirements: R8. Properties: none.
  - Done when `npm run verify` passes.

- [ ] 32. E2E: focus, accessibility tree, reduced motion, strings (E4, E6, E9, E11)
  - Create `e2e/controls-a11y.spec.ts`. **E4**: the focus table of design 10, row by row; a scripted keyboard walk (Tab, Shift+Tab, Enter, Space, Esc) in which after every key the focused element is visible, connected and inside the viewport; the Tab order equals the order of the rectangles in every phase at 360 × 640 and 1280 × 800; a focus ring on every focusable element (a pixel check of the ring against its surroundings, at least 3:1); the dialog traps Tab and Shift+Tab; Esc and Keep burning restore focus. **E6**: `locator.ariaSnapshot()` of `#ui` and of each dialog in each state against hand-written expected snapshots; the live log of a whole 25-minute session equals the list of design 9.2, once in one-second steps and once with the clock jumped in one run; the scene's label never contains a digit. **E9**: with reduced motion `getAnimations()` is empty while an overlay opens or closes or a switch changes; without it any running transition is under 200 ms and none touches the time text or the status line. **E11**: on every state and overlay every visible text node is in `strings.ts` (or is a formatted time or the user's own intent) and the word "Pomodoro" is absent from the page.
  - Files: `e2e/controls-a11y.spec.ts`.
  - Requirements: R1.8, R9, R10.4 to R10.6, R13. Properties: none.
  - Done when `npm run verify` passes.

- [ ] 33. E2E: settings (E7)
  - Create `e2e/settings.spec.ts`: each setting changed, the page reloaded, the setting kept; the default length is the chooser's first selection and a change in the panel while idle updates the main chooser; invalid stored settings give the defaults; `localStorage` that throws on read and on write leaves the page working and the settings working in memory; changing a setting during a lit session changes neither the timer nor `data-phase`, and sends no engine event (the stored session is byte-equal before and after).
  - Files: `e2e/settings.spec.ts`.
  - Requirements: R11. Properties: none.
  - Done when `npm run verify` passes.

- [ ] 34. E2E: visibility (E8)
  - In `e2e/controls.spec.ts` add **E8**: in a lit session `document.visibilityState` is redefined to `hidden` and `visibilitychange` is dispatched, the clock runs 30 s, the state becomes `visible` again: the stored session shows one distraction with its time away and the time left is what the clock says; the status, time text, live log and focus are unchanged by the hide and the show; a session stored with an open hide (`awaySince`) is closed by `syncVisibility` on load; with the target missing the page loads without error.
  - Files: `e2e/controls.spec.ts`.
  - Requirements: R12. Properties: none.
  - Done when `npm run verify` passes.

- [ ] 35. The zone-clear pixel test (R15.2) and the existing suites (E12)
  - In `e2e/scene.spec.ts` change the zone test "the time-text zone stays clear of flame, halo and light pool (F5)": it still compares `.zone-text-area` with the plain zone colour, but first adds a style in the test (`page.addStyleTag`, not a hook in shipped code) that hides `#ui` (`visibility: hidden`), so the check is about the scene alone; keep every case in the table, including the dawn cases. Add a second small test per case that the same area contains only the interface's own colours when `#ui` is shown (the zone colour and the text colours of `--ui-text`/`--ui-text-subtle`/`--ui-error`), so the layer cannot hide a leak.
  - Run the whole scene suite and the smoke test (`getByRole("heading")` must stay visible): fix any change the new layer caused by changing the test, not the scene (the scene does not change in this spec).
  - Files: `e2e/scene.spec.ts` (and `e2e/smoke.spec.ts` only if the heading query needs it).
  - Requirements: R15.2. Properties: none (E12).
  - Done when `npm run verify` passes.

- [ ] 36. Retake the 21 `candle-*` screenshots, then look at each
  - Run `e2e/screenshots.spec.ts` unchanged: the 21 files `docs/screenshots/candle-<state>-<desktop|phone|desktop-reduced>.png` now show the interface (the setup controls in `idle`, `burned-out` and `snuffed`; the zone controls, the time text and the status line in every state).
  - **Look at every PNG** (open each file with the image reader). For each, check and record in `KIRO_USAGE.md`: it shows the state in its name; the time text is readable and in the zone; the status line and buttons are in the zone and do not touch each other; in the running states there is nothing above the floor line but the scene; in `idle`, `burned-out` and `snuffed` the setup controls are in the upper room and clear of the candle column and the window; the first-visit line is in `candle-idle-*`; the pause allowance line is in `candle-paused-*`; "Light another" is in the ended shots; the reduced-motion shot shows the same information as the normal one. If a shot is wrong, fix the cause (layout, CSS or view) and retake every affected shot; do not edit PNGs.
  - Files: `docs/screenshots/candle-*.png` (21 files).
  - Requirements: R15.3. Properties: none.
  - Done when `npm run verify` passes and every PNG has been looked at.

- [ ] 37. The 15 new `controls-*` screenshots, then look at each
  - Create `e2e/controls-screenshots.spec.ts` (design 14). Take, at desktop (1280 × 800) and phone (360 × 640): `controls-idle-returning` (a non-empty history: no instruction line), `controls-invalid-length` (after Light is pressed with an invalid custom length: the error in the status line, the field marked), `controls-lit-intent` (a lit session with an intent in the status line), `controls-snuff-dialog` (open, **Keep burning** focused, the candle visible), `controls-settings` (the panel open), `controls-focus-light` (keyboard focus on Light, the ring visible) and `controls-focus-pause` (keyboard focus on Pause during a session): 14 files; and `controls-snuff-dialog-desktop-reduced.png`: 15 files, named `controls-<screen>-<size>[-reduced].png`. Use `animations: "disabled"`. The tests do not compare pixels.
  - **Look at every PNG.** For each, check and record in `KIRO_USAGE.md`: it shows the screen in its name; its state is clear at its size; no control touches the flame, halo, candle or window (overlays excepted); the dialog is small, in the right place for its size, and does not dim the room; the focus ring is visible where named; the time text and the status line are readable. Fix the cause and retake if a shot is wrong.
  - Files: `e2e/controls-screenshots.spec.ts`, 15 files under `docs/screenshots/`.
  - Requirements: R15.3. Properties: none.
  - Done when `npm run verify` passes and every PNG has been looked at.

- [ ] 38. Mutation checks
  - Apply each mutant of design 13.4 one at a time, run the whole suite (unit, property and the e2e groups that cover it), and revert in a `finally`; every mutant must be caught: `formatTime` rounds down (P1); `parseLength` accepts `+25` or `25.0` (P2); `keyAction` ignores `repeat` (P4); `keyAction` maps Esc to a snuff (P4, P5); `uiStep` keeps the dialog open after the phase ends (P5); the announcer announces every minute (P7); the announcer forgets `done` after a pause (P7); `parseSettings` keeps an invalid default length (P6); `pauseLeftMs` loses its clamp, or uses `>` for `>=` (P9); the Light rectangle is moved into the window (P10); Settings is put back above the floor line (P10, E14); the chooser is drawn under the intent field, or the DOM order differs from the visual order (P10, E4); the intent is put in with `innerHTML` (the purity test); `T` announces while a text field has focus (P4, E13); the dialog's initial focus is the confirm button (E1, E4). If one survives, strengthen the test (a new property or a sharper assertion), never the code under test, and record it.
  - Files: none changed in the end; the results go in `KIRO_USAGE.md`.
  - Requirements: R15.1. Properties: P1 to P10 (exercised).
  - Done when every mutant is caught and the suite is green after the last revert.

- [ ] 39. Costume review of the finished interface (R15.5)
  - Run the `costume-reviewer` agent in the Kiro CLI (`kiro-cli chat --agent costume-reviewer`) on the finished interface, with the 36 screenshots as input. It applies its three rules to the interface: no element is decoration only (R8.11); the reduced-motion version still shows every state (R13.1, R13.2); the time text keeps its contrast (R7.6, R13.3). Record its verdict and findings in `design.md` section 17 (a new item 17.1), apply them (fix, retake the affected screenshots, look at them), and repeat until it passes. If the agent cannot be run, say so and stop: do not substitute another review and call it this one.
  - Files: `design.md` (Decisions), and whatever the findings change.
  - Requirements: R15.5. Properties: none.
  - Done when the reviewer's last pass is PASS and `npm run verify` passes.

- [ ] 40. Wrap-up
  - Run `npm run verify` and confirm every property test ran with its full number of runs (all through `PROP_PARAMS`, no literal lower `numRuns`, no skipped, `only` or `todo` tests) and report the unit file and test counts and the e2e count against the starting counts.
  - Update `.kiro/steering/structure.md`: `src/ui/` is implemented (list its files), `src/storage/settings.ts` and the settings key, `e2e/` holds the controls specs and fixtures, the boundaries section says `src/ui/` imports the engine's `index.ts`, `src/strings.ts` and the `Settings` type only.
  - Confirm `docs/screenshots/` holds the 21 `candle-*` and the 15 `controls-*` files and that no screenshot is older than the last change to `src/ui/`, `src/scene/` or `src/main.ts` (`scene.md`, "Screenshots stay current").
  - Confirm the session-engine Decisions item 10 and the requirements note say the selector is built.
  - Add a `KIRO_USAGE.md` entry for the implementation with the surface used, what was produced, the property failures with counterexamples and seeds, the mutation results (task 38), the screenshot checks (tasks 36 and 37), the costume review (task 39), and the final counts.
  - Files: `.kiro/steering/structure.md`, `KIRO_USAGE.md`.
  - Requirements: all. Properties: P1 to P10 all passing.
  - Done when `npm run verify` passes.

## Coverage check

| Requirement | Tasks |
|---|---|
| R1 | 1, 3, 4, 13, 15, 23, 24, 26, 27, 32 |
| R2 | 6, 7, 8, 9, 12, 22, 24 |
| R3 | 8, 9, 12, 22 |
| R4 | 8, 12, 22, 24, 29 |
| R5 | 1, 2, 10, 12, 13, 22, 29, 30 |
| R6 | 10, 11, 12, 13, 24, 29, 31, 32 |
| R7 | 4, 5, 22, 25, 29, 35 |
| R8 | 18, 19, 22, 25, 31, 36, 37 |
| R9 | 4, 16, 17, 23, 24, 29, 30, 32 |
| R10 | 6, 10, 11, 12, 19, 24, 32 |
| R11 | 14, 20, 21, 24, 26, 33 |
| R12 | 27, 34 |
| R13 | 25, 32, 39 |
| R14 | 15, 22, 30 |
| R15 | 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40 |

| Property | Task |
|---|---|
| P1 | 5 |
| P2 (and P2b) | 7 |
| P3 | 9 |
| P4 | 11 |
| P5 | 13 |
| P6 | 21 |
| P7 | 17 |
| P8 | 14 |
| P9 | 2 |
| P10 | 19 |
