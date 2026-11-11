# Tasks: candle-scene

Implements `design.md` against `requirements.md` in this folder. Work the tasks in order; each builds on the previous ones.

Conventions for every task:

- TypeScript strict, no `any`, exact dependency versions, no new dependencies.
- Tests are colocated next to the source (`*.test.ts`, `*.prop.test.ts`) per `.kiro/steering/structure.md`; Playwright tests are `*.spec.ts` in `e2e/`.
- The scene model files (`types.ts`, `constants.ts`, `flicker.ts`, `model.ts`) are pure: no `window`, `document`, `localStorage`, `Date.now`, `performance`, `Math.random`, `matchMedia`, timers or `requestAnimationFrame`. The scene reads the engine only through its public `index.ts`, and only `timeLeftMs`, `waxFraction`, `isBreak` and the `State` type (R1).
- Nothing in `src/engine/` or `src/storage/` changes in this spec.
- A task is done only when `npm run verify` passes (type-check and lint, unit tests, build, e2e).
- Property-test tasks (12 to 19) are **required**, not optional. Every property test uses the engine's shared `PROP_PARAMS`, which is `numRuns: 300`. Never lower it, never weaken a property to make it pass. If a property fails, report the shrunk counterexample and the seed, say whether the bug is in the code or the test, fix the right one, and record it in `KIRO_USAGE.md`.
- Following `scene.md`, any task that changes what a user sees names the screenshots it affects; all of them are retaken in task 22.
- The code tasks run after `distraction-tracking` is complete (R13.9). That spec is complete, so they can start.

## Tasks

- [ ] 1. Prove the Playwright imports (design P6)
  - Create `e2e/fixtures-imports.spec.ts`. It imports `INITIAL_STATE`, `step`, `serializeSession` and `serializeHistory` from `../src/engine` and `SESSION_KEY` and `HISTORY_KEY` from `../src/storage/storage`, builds a lit state, writes it into `localStorage` with `page.addInitScript`, loads `/`, and reads the same keys back.
  - Run `npm run e2e`. If Playwright resolves the extensionless TypeScript imports, keep the spec as the proof and note the result in `KIRO_USAGE.md`. If it does not, use the fallback of design 11.1: a small Node script run by `globalSetup` writes the fixture strings to a JSON file the specs read; add `e2e/global-setup.ts` and the `globalSetup` line to `playwright.config.ts`, and say so in `KIRO_USAGE.md`.
  - Files: `e2e/fixtures-imports.spec.ts`; only if the fallback is needed, `e2e/global-setup.ts` and `playwright.config.ts`.
  - Requirements: R13.2. Properties: none.
  - Done when `npm run verify` passes.

- [ ] 2. Scene types and constants
  - Create `src/scene/types.ts` (design section 2): `FlameMode`, `SceneOptions`, `SceneModel` with the `stub` field, `MOTION_FIELDS`, and `RANGES` (the documented range of every numeric field).
  - Create `src/scene/constants.ts` (design 3.1, 3.3, 4.3, 5.4): `GUTTER_MS`, `LIGHT_MIN`, `LIGHT_MAX`, `LIGHT_FULL_UNITS`, `DRIP_MARKS`, `DEFAULT_SEED`, `FLAME_LOOK`, `FLICKER_AMPLITUDE`, `CANDLE_H` (420), `FLOOR_Y` (900), `STUB_H` (28).
  - Create `src/scene/types.test.ts`: `MOTION_FIELDS` names exactly the six motion fields and every one exists in the model type; `RANGES` covers every numeric field; `FLAME_LOOK` values are inside their ranges; R5.6 on `FLAME_LOOK` (any two of `steady`, `guttering`, `paused` differ in at least two of size, colour, shape); the geometry constants are `CANDLE_H` 420, `FLOOR_Y` 900, `STUB_H` 28.
  - Remove `src/scene/.gitkeep`.
  - Files: `src/scene/types.ts`, `src/scene/constants.ts`, `src/scene/types.test.ts`.
  - Requirements: R2.4, R2.5, R5.5, R5.6, R9.1. Properties: none.
  - Done when `npm run verify` passes.

- [ ] 3. Purity test
  - Create `src/scene/purity.test.ts` (design 12.2) with its own comment-stripping scanner (a copy of the technique in `src/engine/purity.test.ts`; do not import from a test file). Model files: none of `window`, `document`, `localStorage`, `Date.now`, `performance`, `Math.random`, `matchMedia`, `setTimeout`, `setInterval`, `requestAnimationFrame` as whole words; no imports from `storage`, `ui`, `audio`, `distraction`; the only engine import is `../engine`. Every non-test file in `src/scene/`: no `Date.now`, `performance.now`, timers or `requestAnimationFrame`; no import of `test-kit` or `scene-kit`. `render.ts`: no import from `../engine`. `model.ts`: no mention of `.session`, `.litSince`, `.pausedAt`, `.history`, `.endedAt`, `.breakEndsAt`. Scanner self-tests like the engine's.
  - The test passes now on the two files that exist and covers each new file as it lands.
  - Files: `src/scene/purity.test.ts`.
  - Requirements: R1.2, R1.3, R2.1. Properties: none.
  - Done when `npm run verify` passes.

- [ ] 4. The seeded flicker
  - Create `src/scene/flicker.ts` (design section 4): `hash32`, value noise with the three channel steps, the per-mode amplitudes, the sputter dips in `guttering`, `flicker(seed, now, mode)`. Pure, no `Math.random`; a non-finite `now` is treated as 0.
  - Create `src/scene/flicker.test.ts`: the reference table for seed 20261031 at 8 instants for each mode (hard-coded numbers, to catch an accidental change of the hash or steps); exact 0 for `unlit` and `smoke`; amplitudes ordered `paused` < `steady` < `guttering`; a dip in `guttering` stays inside its 1500 ms window; negative and non-finite `now` give finite values.
  - Files: `src/scene/flicker.ts`, `src/scene/flicker.test.ts`.
  - Requirements: R6.1 to R6.6. Properties: none (covered by P4).
  - Done when `npm run verify` passes.

- [ ] 5. The scene model
  - Create `src/scene/model.ts` (design section 3): `sceneModel(state, now, options)` and the pure helper `candleHeightUnits(model)`. It reads only `phase`, `timeLeftMs`, `waxFraction` and `isBreak`. Formulas as in 3.2: wax height, drips, light radius, dawn, `stub`, `cooling`; `flameModeOf` (3.3); motion values from the flicker and `reducedMotion` (3.4).
  - Create `src/scene/model.test.ts` (design 12.1): flame mode at time left 60 001, 60 000, 59 999 and 0 ms (lit), for paused and for paused in the last minute; drip count at wax 0.76, 0.75, 0.5, 0.25, 0 and in idle and the ended phases; idle values (wax 1, no flame, light radius 0.2, drips 0, stub 0); burned-out values (wax 0, dawn 1, light 0, smoke 1, stub 1); snuffed values (wax 0, dawn 0, light 0, smoke 1, stub 1); the stub is 0 at every wax height in idle, lit and paused, including wax 0.02 and a lit state with time left 0; `candleHeightUnits` divided by wax height is the constant 420 over a sweep, and equals 28 when `stub` is 1; `cooling` is true at the end instant and 299 999 ms after, false at `breakEndsAt` and later; `reducedMotion` zeroes the motion values and changes nothing else.
  - Files: `src/scene/model.ts`, `src/scene/model.test.ts`.
  - Requirements: R1, R2, R3, R4, R5, R7, R8, R9. Properties: none (covered by P1 to P8).
  - Done when `npm run verify` passes.

- [ ] 6. Accessible-name strings
  - Add the five names to `src/strings.ts` under `scene`: `unlit`, `steady`, `paused`, `guttering`, `smoke` (design 6.4). Extend `src/strings.test.ts` so every `FlameMode` has a non-empty string and none contains digits (no time).
  - Files: `src/strings.ts`, `src/strings.test.ts`.
  - Requirements: R12.1, R12.2. Properties: none.
  - Done when `npm run verify` passes.

- [ ] 7. Room markup
  - Create `src/scene/room.ts` with `ROOM_SVG`, a constant string (design 5.1 to 5.8): `viewBox="0 0 600 1000"`, `overflow: visible`, the seven layers in order (`.wall`, `.night`, `.window` with its two pane rects only, `.dawn-wash`, `.candle` with `.body` and `.stub`, the clipped `.lit` group holding `.head`, and the topmost `.zone` with `.zone-rest`, `.zone-dawn` and the invisible `.zone-text-area`), the pool mask and gradient, `#cw-above-floor`, the three drips, the flame stack, `.ember`, `.smoke-wisp` and `.halo`. No table, no dish, no frame, no raster, no text.
  - Create `src/scene/room.test.ts` (design 12.3, markup part): `.zone` is the last layer; `.lit` carries the clip and `#cw-above-floor` covers the stage only above y = 900; `.halo` is inside `.lit`; `.wall` and `.night` end at y = 900; no `.table`, `.dish` or `.floor`; the window has only its two pane rects; `.zone-text-area` is x 110..490, y 900..1000; no `url(` for a raster file and no `<img>`, `<canvas>` or `image`.
  - Files: `src/scene/room.ts`, `src/scene/room.test.ts`.
  - Requirements: R3.5, R3.6, R7.8, R10.2, R10.4, R11.1, R11.3, R11.4, R11.8. Properties: none.
  - Done when `npm run verify` passes. Affects: all screenshots (task 22).

- [ ] 8. Stylesheet
  - Create `src/scene/scene.css` (design sections 5, 7, 8): the palette custom properties (7.1), the layout (fixed full-viewport container, `html, body` with no margin and no overflow), the rules that turn custom properties into shapes, `.visually-hidden`, the `[data-settled="true"]` transitions, and the `@media (prefers-reduced-motion: reduce)` block. `.pool` has no opacity rule; `.night` has no rule that reads `--dawn` or `--flame-glow`; `.stub` takes its opacity from `--stub`; `.body` is `scaleY(var(--wax-height))` over a full height of `CANDLE_H`.
  - Create `src/scene/scene.css.test.ts` (design 12.3, stylesheet part): the reduced-motion block sets `animation: none` and `transition: none`; every custom property in design 6.2 is used by at least one rule; the palette test (background stops between the room bounds; ivory against `--room-bg-darkest`, `--room-bg-brightest`, `--zone-bg-darkest`, `--zone-bg-brightest` at least 4.5:1, with the four figures 16.20, 4.66, 15.83 and 7.53 asserted to two decimals; `--window-night` against `--room-night` at least 1.4:1 and a single constant value); the rules named above exist or are absent as stated.
  - Files: `src/scene/scene.css`, `src/scene/scene.css.test.ts`.
  - Requirements: R7.7, R7.8, R7.9, R8.7, R9.5, R10, R11.2, R11.3, R11.5. Properties: none.
  - Done when `npm run verify` passes. Affects: all screenshots.

- [ ] 9. Renderer
  - Create `src/scene/render.ts` (design section 6): `createScene(root)` sets `innerHTML` to `ROOM_SVG`, `role="img"` and the class `candle-scene`, and returns `apply(model)`. `apply` is table-driven (6.2): custom properties and data attributes only, written only when changed, no branching on phase, time or wax; `aria-label` from `STRINGS.scene` only when the flame mode changes; `data-settled` is `"false"` on the first call and `"true"` from the second (6.5). It imports nothing from the engine.
  - Create `src/scene/render.test.ts` with a minimal fake element (records `style.setProperty`, `setAttribute`, `innerHTML`, `classList`): the first `apply` writes every custom property and data attribute in the table and nothing else; an unchanged model writes nothing the second time; `aria-label` changes only with the flame mode and contains no time; `data-settled` goes `"false"` then `"true"`; booleans become the documented values; the file has no `if` on phase, time or wax (checked as in the purity test: no `.phase`, `waxHeight` or `flameMode` comparisons in `render.ts` other than the aria-label change check).
  - Files: `src/scene/render.ts`, `src/scene/render.test.ts`.
  - Requirements: R11.5, R11.6, R12, R4.5. Properties: none.
  - Done when `npm run verify` passes.

- [ ] 10. Public index and `main.ts`
  - Create `src/scene/index.ts` re-exporting `sceneModel`, `createScene` and the types.
  - Update `src/main.ts` (design section 10): load through `createStorage(browserStore())`, send the stored state as a `reload` event, `dispatch` for `step` and `save`, redraw every animation frame with `Date.now()` after a `tick`, pass `reducedMotion` from `matchMedia` each frame, import `./scene/scene.css`. Keep the placeholder `h1` and tagline in the DOM with the class `visually-hidden` (design 10.1). No controls and no visibility wiring.
  - The existing e2e smoke test (title and visible heading) must still pass.
  - Files: `src/scene/index.ts`, `src/main.ts`.
  - Requirements: R1.3, R1.4, R13.1. Properties: none.
  - Done when `npm run verify` passes. Affects: all screenshots.

- [ ] 11. Scene test kit
  - Create `src/scene/scene-kit.ts` (test-only; extend the purity test so no non-test file imports it): `arbNow` (finite values near a run's times, large, negative, plus `NaN`, `Infinity`, `-Infinity`), `arbSeed` (any double), `arbReduced` (boolean), `deepFreeze`, and a helper that evaluates `sceneModel` on every state of an engine trace (`runScript` from the engine's `test-kit`) at the trace time and at probe offsets.
  - Create `src/scene/scene-kit.test.ts`: the generators produce the documented kinds of values (including the non-finite ones); `deepFreeze` freezes nested objects.
  - Files: `src/scene/scene-kit.ts`, `src/scene/scene-kit.test.ts`, `src/scene/purity.test.ts`.
  - Requirements: supports R1 to R9 test coverage. Properties: supports P1 to P8.
  - Done when `npm run verify` passes.

- [ ] 12. Required: P1, wax height and drips
  - Create `src/scene/model.prop.test.ts` and add P1 per design 13: while running, `waxHeight === waxFraction(state, now)`; across consecutive running states of the same session and across probe offsets, wax height never grows and the drip count never falls; while paused, wax and drips equal those at the anchor for every probe.
  - Files: `src/scene/model.prop.test.ts`.
  - Requirements: R3.1, R3.2, R4.2. Properties: P1.
  - Done when `npm run verify` passes.

- [ ] 13. Required: P2, the light radius
  - Add P2 to `src/scene/model.prop.test.ts`: sorted by wax height the light radius is non-decreasing; it never grows within a session, along the trace or across probes; it is constant while paused; it stays within `[LIGHT_MIN, 1]` while running.
  - Files: `src/scene/model.prop.test.ts`.
  - Requirements: R7.2, R7.3. Properties: P2.
  - Done when `npm run verify` passes.

- [ ] 14. Required: P3, the flame mode
  - Add P3: (a) pairs of lit states with different lengths, intents and earlier history, probed so time left equals a drawn value from a boundary-biased set (0, 1, 59 999, 60 000, 60 001, then arbitrary), and paused states with the same time left, always give the same mode; (b) pooled samples keyed by `(phase, timeLeftMs)` map to exactly one mode; both equal an independent plain `if` table of R5.1 for all five phases, including `paused` over `guttering` and time left 0 while lit.
  - Files: `src/scene/model.prop.test.ts`.
  - Requirements: R5.1 to R5.4. Properties: P3.
  - Done when `npm run verify` passes.

- [ ] 15. Required: P4, the flicker
  - Create `src/scene/flicker.prop.test.ts` and add P4: the same `(seed, now, mode)` gives equal values; values are finite and in range; all three are exactly 0 for `unlit` and `smoke`; two different states of the same mode, `now` and seed give the same flicker fields through `sceneModel`; `|f(now + d) - f(now)|` stays within the smoothness bound of design 13 (including the dip term in `guttering`) for `d` of 1 to 5 ms; different seeds differ at most instants on a fixed 200-instant grid.
  - Files: `src/scene/flicker.prop.test.ts`.
  - Requirements: R6. Properties: P4.
  - Done when `npm run verify` passes.

- [ ] 16. Required: P5, reduced motion keeps the information
  - Add P5 to `src/scene/model.prop.test.ts`: for any trace sample, `arbNow`, `arbSeed`, the models with `reducedMotion` true and false are deeply equal after removing `MOTION_FIELDS`; with `reducedMotion` true the three flicker values are 0 and the three flags are false.
  - Files: `src/scene/model.prop.test.ts`.
  - Requirements: R9.1, R9.2. Properties: P5.
  - Done when `npm run verify` passes.

- [ ] 17. Required: P6, totality and bounds
  - Add P6: for trace samples and extra states from the engine's `arbWildScript`, with `arbNow` (non-finite included) and `arbSeed`, `sceneModel` never throws; every number is finite and inside `RANGES`; `drips` is 0, 1, 2 or 3; `stub` is 0 or 1; `flameMode` and `phase` are in their unions; booleans are booleans.
  - Files: `src/scene/model.prop.test.ts`.
  - Requirements: R1.5, R2.2, R2.4. Properties: P6.
  - Done when `npm run verify` passes.

- [ ] 18. Required: P7, purity of the model
  - Add P7: the same input gives deeply equal models; a deep-frozen input equals its `structuredClone` afterwards; every model value is a number, a boolean, or one of the two fixed unions (no other string, object or array).
  - Files: `src/scene/model.prop.test.ts`.
  - Requirements: R2.3, R2.5, R2.6. Properties: P7.
  - Done when `npm run verify` passes.

- [ ] 19. Required: P8, dawn, light, cooling and the stub
  - Add P8: `dawn === 1` iff the phase is `burned-out`, whether or not the break is in progress; `lightRadius === 0` iff the phase is `burned-out` or `snuffed`; `stub === 1` iff the phase is `burned-out` or `snuffed`; `cooling === isBreak(state, now)`; for a burned-out state, the models at an instant inside the break and at one after it differ only in `cooling`.
  - Files: `src/scene/model.prop.test.ts`.
  - Requirements: R3.7, R7.5, R8.2, R8.5. Properties: P8.
  - Done when `npm run verify` passes.

- [ ] 20. Mutation spot-check
  - Break the scene code on purpose, one change at a time, run the whole suite, and revert: remove the `paused` case from `flameModeOf`; change `<=` to `<` in the drip test; make `lightRadius` grow with the flicker; call `Math.random` in the hash; drop one `MOTION_FIELDS` entry from the reduced-motion path; draw the stub in every phase (`stub` always 1); make the pool's opacity read `--flame-glow` in `scene.css`. Each must be caught by at least one property or example test. Record which test caught each in `KIRO_USAGE.md`. A mutant that survives means a test is too weak: strengthen the test, not the code.
  - Files: none kept (a note in `KIRO_USAGE.md` at the end).
  - Requirements: R3, R4, R5, R6, R7, R9, R11. Properties: P1 to P8.
  - Done when the code is back to its original state and `npm run verify` passes.

- [ ] 21. Browser fixtures and state assertions
  - Create `e2e/scene-fixtures.ts` (design 11.1, 11.2): the seven fixtures built in Node with the engine only (`step`, `serializeSession`, `serializeHistory`) and the storage key names; `showAt(page, fixture, now, { reducedMotion })` using `page.addInitScript`, `page.clock.install`, `pauseAt` and `runFor`. If task 1 needed the `globalSetup` fallback, read the fixtures from its file instead.
  - Create `e2e/scene.spec.ts` (design 11.3): per fixture, wait for `data-settled="true"` and finished transitions, then assert `data-flame`, `data-phase` and the computed custom properties of the table (including `--stub`); `aria-label` and `role="img"`; with reduced motion on, `--flicker-*` are 0 and the three animate and ease attributes are `"false"`; no scrollbar and the candle and flame inside the viewport at 360x640, 768x1024, 1280x800 and 1920x1080; the candle height is proportional (the `.body` box height over its height at `lit-start` equals `--wax-height`; `.stub` opacity 0 while running, 1 and body height under 1 px after the end); the time-text zone region is decoded in the page and every pixel is within 2 per channel of `--zone-bg-darkest` (or `--zone-bg-brightest` in the dawn fixtures), with `lit-last-minute` included; reload settle checks (a stored lit session past completion draws the dawn; a stored paused session past the pause limit draws smoke; `--cooling` is 0 after the break).
  - Files: `e2e/scene-fixtures.ts`, `e2e/scene.spec.ts`.
  - Requirements: R3, R4, R5, R7, R8, R9, R10, R12, R13.2, R13.7. Properties: none.
  - Done when `npm run verify` passes.

- [ ] 22. Screenshots (21 PNGs), then look at them
  - Create `e2e/screenshots.spec.ts` (design 11.4). For each of the seven states (`idle`, `lit-start`, `lit-half`, `lit-last-minute`, `paused`, `burned-out` inside the break, `snuffed`) take `docs/screenshots/candle-<state>-desktop.png` at 1280x800 and `candle-<state>-phone.png` at 360x640, and `candle-<state>-desktop-reduced.png` at 1280x800 with reduced motion on: 7 x 3 = 21 files. The tests do not compare pixels.
  - **Look at every PNG after capture** (open each file with the image reader). Check for each: it shows the state in its name; the candle is inside the frame; there is no text; the time-text zone below the floor line is a clear flat band with no flame, halo or pool in it; the flame modes can be told apart in the still shots; the dawn can be told from idle; the reduced-motion shot shows the same information as the normal one. Write the result for each file in the task note (`KIRO_USAGE.md`). If a shot is wrong, fix the cause (markup, CSS or model) and retake all affected shots; do not edit PNGs.
  - Remove `docs/screenshots/.gitkeep` once the folder has files.
  - Files: `e2e/screenshots.spec.ts`, the 21 files under `docs/screenshots/`.
  - Requirements: R13.3 to R13.6. Properties: none.
  - Done when `npm run verify` passes and every PNG has been looked at.

- [ ] 23. Costume review of the finished scene (R13.8)
  - Run `kiro-cli chat --agent costume-reviewer` in the Kiro CLI (custom agents do not run in Kiro Web) and ask it to review the finished scene: `src/scene/room.ts`, `src/scene/scene.css`, `src/scene/model.ts` and the screenshots in `docs/screenshots/`, against `docs/BRIEF.md` section 4 and its three rules (every element shows one piece of state; the reduced-motion version still shows it; the time text keeps WCAG AA contrast).
  - Record the verdict and each finding in the design's Decisions under a new heading "Costume review of the finished scene". Fix every finding (retaking the affected screenshots as in task 22) until the verdict is PASS, or record why a finding is accepted.
  - Files: `.kiro/specs/candle-scene/design.md` (Decisions), and any scene file a finding touches.
  - Requirements: R13.8, R11.8. Properties: none.
  - Done when the verdict is PASS (or accepted findings are recorded) and `npm run verify` passes.

- [ ] 24. Wrap-up
  - Run `npm run verify` and confirm every property test ran with its full number of runs (all through `PROP_PARAMS`, no literal lower `numRuns`, no skipped or `todo` tests).
  - Update `.kiro/steering/structure.md`: `src/scene/` is implemented (list the files), `e2e/` holds the scene specs and fixtures, the boundaries section says the scene imports only the engine's `index.ts` and that `scene-kit.ts` is test-only.
  - Confirm `docs/screenshots/` holds the 21 files named in design 11.4, and that no screenshot is older than the last change to `src/scene/` (`scene.md`, "Screenshots stay current").
  - Add a `KIRO_USAGE.md` entry for the implementation with the surface used, what was produced, the property failures with counterexamples and seeds, the mutation results (task 20), the screenshot check (task 22) and the costume review (task 23).
  - Files: `.kiro/steering/structure.md`, `KIRO_USAGE.md`.
  - Requirements: all. Properties: P1 to P8 all passing.
  - Done when `npm run verify` passes.

## Coverage check

| Requirement | Tasks |
|---|---|
| R1 | 3, 5, 10, 12, 17 |
| R2 | 2, 3, 5, 17, 18 |
| R3 | 5, 7, 12, 19, 21 |
| R4 | 5, 9, 12, 21 |
| R5 | 2, 5, 14, 21 |
| R6 | 4, 15 |
| R7 | 5, 7, 8, 13, 19, 21 |
| R8 | 5, 8, 19, 21 |
| R9 | 2, 5, 8, 16, 21 |
| R10 | 7, 8, 21 |
| R11 | 7, 8, 9, 20, 23 |
| R12 | 6, 9, 21 |
| R13 | 1, 10, 21, 22, 23 |

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
