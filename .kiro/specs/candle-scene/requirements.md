# Requirements: candle-scene

Source: `docs/BRIEF.md` section 4 (rows The candle, The flame, The room's light, The dawn), section 7 (visual design, reduced motion, responsive) and section 11 item 3. Constrained by `.kiro/steering/product.md`, `tech.md`, `structure.md` and `scene.md`, and built on the finished `session-engine` spec.

Status: **review answers applied** (see Decisions). The design is written and its costume review is applied (verdict CHANGES NEEDED, then applied; findings F1 to F6 in the design's Decisions). The tasks are in `tasks.md`.

## Introduction

The candle scene is the room: a candle, its wax, the drips, the flame, the pool of light and the dawn. It is the first spec where the costume appears. Every element shows one piece of state and nothing is decoration only.

The scene is split in two:

- A **scene model**: a pure, DOM-free function `sceneModel(state, now, options) -> SceneModel` that turns engine state into plain numbers and flags (wax height, drips shown, flame mode, light radius, dawn amount, seeded flicker values). It is unit-tested and property-tested.
- A **renderer**: thin SVG and CSS code that only applies a `SceneModel` to the page as CSS custom properties and data attributes. It has no logic of its own and no clock. It is checked with Playwright screenshots of each state using a faked clock.

The scene never owns time. It reads engine state only through the session-engine selectors `timeLeftMs`, `waxFraction` and `isBreak`, and the `phase` field. Ticks only redraw.

## Glossary

- **Scene model**: the plain-data result of `sceneModel`. Numbers and flags only. No DOM, no strings, no objects from the page.
- **Renderer**: the code in `src/scene/` that writes a scene model to the DOM. It reads nothing from the engine.
- **Flame mode**: one of `unlit`, `steady`, `paused`, `guttering`, `smoke`.
- **Quarter**: a quarter of the session length. A drip runs at each quarter mark of burn time.
- **Light radius**: the radius of the pool of light, as a fraction of the room's size (a number in [0, 1]).
- **Dawn amount**: how much early light fills the room, in [0, 1].
- **Flicker values**: small seeded numbers (sideways lean, height jitter, glow jitter) that make the flame move.
- **Reduced motion**: the `prefers-reduced-motion: reduce` setting. The still version of the scene.
- **Motion values**: every model field that exists only to move something: the flicker values and the animate flags. All are zero or false in reduced motion.
- **Session end**: the phase is `burned-out` or `snuffed`.

## Requirements

### R1. The scene reads state only through the engine's selectors

**User story:** As a maintainer, I want the scene to be unable to disagree with the timer.

1. `sceneModel` SHALL take the engine `State`, a `now` in ms and an options object, and SHALL return a `SceneModel`. It SHALL read the state only through `timeLeftMs`, `waxFraction`, `isBreak` and the `phase` field, all imported from the engine's public surface (`src/engine/index.ts`).
2. The scene SHALL NOT compute time left, wax fraction, pause totals or break timing itself, and SHALL NOT read other state fields (`session`, `litSince`, `pausedAt`, `history`, and so on).
3. The scene SHALL NOT own time. No file in `src/scene/` SHALL call `Date.now`, `performance.now`, `setTimeout`, `setInterval` or `requestAnimationFrame`. The clock and the redraw loop belong to `main.ts` and `src/ui/`, which pass `now` in (steering `structure.md`).
4. A redraw SHALL NOT change the engine state. The scene SHALL NOT send events to the engine.
5. WHEN `now` is not finite, THE scene model SHALL still be valid (R2.4), following the selectors, which return 0 and `false` in that case.

### R2. The scene model is pure, total and bounded

**User story:** As a developer, I want to test the whole look of the room without a browser.

1. The scene model code SHALL be pure and DOM-free: no `window`, `document`, `localStorage`, `Date.now`, `performance`, `Math.random` or `matchMedia`, and no imports from `ui/`, `audio/` or `storage/`. A purity test, like the engine's, SHALL enforce this.
2. `sceneModel` SHALL be total: for every state, every `now` (including non-finite) and every options value, it returns a model and never throws.
3. `sceneModel` SHALL NOT mutate its input.
4. Every numeric field in the model SHALL be finite and inside its documented range, for every input.
5. The model SHALL contain only numbers, booleans and string literals from fixed unions. It SHALL contain no user text, such as the session intent.
6. The same `(state, now, options)` SHALL always give a deeply equal model.

### R3. The candle and its wax

**User story:** As a user, I want the height of the candle to tell me how much time is left.

1. WHILE the phase is `lit` or `paused`, THE model's wax height SHALL equal `waxFraction(state, now)` exactly, a number in [0, 1].
2. WHILE a session is running, wax height SHALL NOT grow from one `now` to a later `now` (given the same state), and SHALL NOT grow across any event sequence the engine can produce, including pause, resume and reload (brief section 12). It SHALL stay constant while `paused`.
3. WHILE the phase is `idle`, THE wax height SHALL be 1: a whole candle waiting to be lit. This is the only phase where wax height is not `waxFraction`, and it is deliberate (Decision Q1).
4. WHEN the phase is `burned-out` or `snuffed`, THE wax height SHALL be 0 (the selectors give 0), and the renderer SHALL draw a short stub of fixed size so that a candle is still there. A snuffed candle does not show how much wax was left; that detail belongs to `ghosts-and-graveyard` (Decision Q2).
5. The wax SHALL be drawn in ivory, with its top edge following the wax height linearly. The candle SHALL stay fully inside the visible room at every wax height and at every viewport size in R10.
6. The wax height SHALL be the only thing that sets the candle's height. Nothing else on the page changes the candle's size.
7. The drawn height of the candle SHALL be exactly proportional to the wax height: the full candle height times the wax height, with nothing fixed added, in `idle`, `lit` and `paused`. The fixed stub of R3.4 SHALL be drawn only in `burned-out` and `snuffed`. The model SHALL give a `stub` flag (0 or 1) that is 1 exactly in those two phases (costume review F6).

### R4. Drips at each quarter

**User story:** As a user, I want a quiet mark each time a quarter of the session has burned.

1. The model SHALL give a count of drips shown, an integer from 0 to 3. The count SHALL be the number of quarter marks passed, computed from wax height only: 1 once wax height is 0.75 or less, 2 at 0.5 or less, 3 at 0.25 or less. It is 0 in `idle`, and 0 after a session end. There is no fourth drip at 100 percent. This is a deliberate change from the brief's "a drip at each quarter" (Decision Q4).
2. The count SHALL NOT decrease while a session is running, and SHALL NOT change while `paused`.
3. WHEN the drip count rises, THE renderer MAY run the new drip down the candle once. The drips already shown SHALL stay on the candle as still shapes.
4. In reduced motion, new drips SHALL appear at once in their final position, with no run.
5. After a reload, the drips SHALL show the count for the current wax height. A drip does not depend on having been seen.

### R5. The flame

**User story:** As a user, I want the flame to tell me the state of the session at a glance.

1. The model SHALL give exactly one flame mode, chosen only from `phase` and `timeLeftMs`:

   | Condition | Mode | Look (still version) |
   |---|---|---|
   | phase `idle` | `unlit` | No flame. A dark wick. |
   | phase `lit`, time left more than 60 000 ms | `steady` | Full height, warm amber, upright teardrop. |
   | phase `lit`, time left 60 000 ms or less | `guttering` | Shorter, amber with a lean and a ragged tip, dimmer glow. |
   | phase `paused` | `paused` | Small, blue, upright. |
   | phase `burned-out` or `snuffed` | `smoke` | No flame. A wisp of smoke above a dark wick. |

2. The flame mode SHALL be a pure function of `phase` and `timeLeftMs`. Two states with the same phase and the same time left SHALL give the same flame mode, whatever else differs.
3. `paused` SHALL win over `guttering`: a paused candle in its last minute is small and blue.
4. A `lit` state whose time is already up but not yet settled by a tick (time left 0) SHALL show `guttering`, never `smoke`. The scene does not settle; the engine does.
5. The model SHALL give the flame's height and a blue amount (0 amber, 1 blue) so that the renderer needs no table of its own. These SHALL be constants per mode.
6. In the still version, any two different flame modes SHALL differ in at least two of: size, colour, shape. Shape is the teardrop, the leaning ragged tip, the absence of a flame, or the wisp. The one pair with no flame, `unlit` and `smoke`, is read at scene level: the whole still scene differs in the candle (whole or stub), the pool (small or none) and the wisp (accepted, design Decision P1).
7. WHEN the flame mode changes, THE renderer MAY ease between the two looks. In reduced motion it SHALL switch at once.

### R6. The flicker is seeded

**User story:** As a developer, I want a flame that moves but is the same every time I test it.

1. The model SHALL include flicker values: a sideways lean, a height jitter and a glow jitter. Each is a finite number in a documented range.
2. The flicker values SHALL be a pure function of `(seed, now, flame mode)`. The seed comes from the options (a number; a default constant applies when absent). The scene SHALL NOT use `Math.random`.
3. For a fixed seed, mode and `now`, the flicker values SHALL always be equal. A different seed SHALL give a different flicker at most instants.
4. The flicker SHALL be smooth: it is built from a seeded noise sampled at fixed steps of time, interpolated, so that two instants a few milliseconds apart give nearby values.
5. The flicker SHALL be zero for `unlit` and `smoke`. It SHALL be gentle for `steady`, very small for `paused`, and larger for `guttering`, with occasional deeper dips (sputter) in the last minute.
6. The flicker SHALL NOT depend on the session, the history or the wax height, only on the seed, `now` and the flame mode.

### R7. The room's light

**User story:** As a user, I want the room to close in as the candle burns down, and to be darkest just before the end.

1. The model SHALL give a light radius in [0, 1] for the pool of light around the candle.
2. WHILE the phase is `lit` or `paused`, THE light radius SHALL be a non-decreasing function of wax height, with a minimum above 0. The light SHALL therefore shrink as the wax falls, stay the same while `paused`, and be at its smallest (the room darkest) in the last moments before the end.
3. The light radius SHALL NOT grow from one `now` to a later `now` for the same running state, nor across any event sequence the engine can produce, including pause, resume and reload.
4. WHILE the phase is `idle`, THE light radius SHALL be the same small value as the minimum in R7.2: a dim room around an unlit candle (Decision Q1).
5. WHEN the phase is `snuffed`, THE light radius SHALL be 0 and the room dark. WHEN the phase is `burned-out`, THE light radius SHALL be 0 and the dawn (R8) lights the room instead.
6. The model SHALL NOT make the light shrink for any reason other than wax height. The flicker may move the edge of the pool by a small amount (R6) but SHALL NOT change the radius value.
7. The scene SHALL publish the room's background colour at its darkest and at its brightest as two CSS custom properties, so that the `controls-and-access` spec can check the time text for WCAG AA contrast against both. This spec does not check the time text.
8. The scene SHALL reserve a time-text zone for `controls-and-access`: the band below the floor line, which is the candle's base, with a text area marked in the markup. The flame, its halo, the drips, the smoke and the light pool SHALL never enter the zone, at any wax height. The zone SHALL have its own darkest and brightest background, published as two CSS custom properties, and the contrast of ivory (`#efe6cf`) against each SHALL be at least 4.5:1. The time text SHALL be at least ivory in brightness (relative luminance at least that of `#efe6cf`) (costume review F2, F5).
9. The light pool's intensity SHALL be constant: the pool shows progress only, by its radius, and the flame's glow SHALL NOT change it (costume review F4).

### R8. The dawn

**User story:** As a user, I want the end of a finished session to feel like morning.

1. The model SHALL give a dawn amount in [0, 1].
2. WHEN the phase is `burned-out`, THE dawn amount SHALL be 1, for the whole phase: during the break and after it ends. In every other phase it SHALL be 0 (Decision Q3).
3. WHEN the dawn amount changes, THE renderer MAY ease the early light in over a few seconds. In reduced motion the light SHALL change at once.
4. In the dawn, the room SHALL fill with pale early light (cool at the window, warm low on the wall) and the candle SHALL be an unlit stub. The look SHALL still be different from `idle` in colour and brightness, so that the dawn can be told from a dim waiting room in the still version.
5. The model SHALL give the break flag `cooling`, equal to `isBreak(state, now)`. WHILE `cooling` is true, THE renderer SHALL show a faint warm glow on the wick of the stub ("the wax cools"). The glow ends when `cooling` turns false. It does not change the dawn amount, the light radius or the flame mode. The glow is a still shape and colour, so it is shown in reduced motion too; only any easing of it is motion.
6. The chime that goes with the dawn belongs to the `sound-and-title` spec.
7. The dawn SHALL be a wash layered above the night layer. The night layer SHALL NOT be faded by the dawn, so that each layer shows one thing (costume review F4). The window pane SHALL have a faint, constant night colour at rest that is visible against the wall, so the dawn reads as the window lighting up; the colour carries no state (costume review F3).

### R9. Reduced motion

**User story:** As a user who has asked for less motion, I want the same information in a still room.

1. `sceneModel` SHALL take a `reducedMotion` option. WHEN it is true, all motion values SHALL be zero or false: the flicker values are 0 and the animate flags are false.
2. For any state and `now`, the model with `reducedMotion: true` SHALL equal the model with `reducedMotion: false` in every field that is not a motion value. Reduced motion SHALL NOT remove any state information.
3. In the still version, every state SHALL still be shown by size, colour and shape, and never by motion alone: the wax height, the drip shapes, the flame mode (R5.6), the light radius, the dawn and the smoke wisp.
4. `main.ts` or `src/ui/` SHALL read `matchMedia("(prefers-reduced-motion: reduce)")`, pass it in the options, and update it when the setting changes while the page is open. The model code itself SHALL NOT read it.
5. The stylesheet SHALL also switch off every CSS transition and animation under `@media (prefers-reduced-motion: reduce)`, so that the still version holds even before the first model is applied.
6. Ghost drift is out of scope here (`ghosts-and-graveyard`), but nothing in this spec SHALL make a still ghost impossible later: motion values are separate fields.

### R10. Responsive

**User story:** As a user on a phone or a wide desktop, I want the whole room to fit.

1. The scene SHALL work from a phone in portrait (360 by 640 CSS pixels) to a wide desktop (at least 1920 by 1080), and in between.
2. The room SHALL be one SVG that scales with a `viewBox` and fills the available area. The candle, the flame and the full pool of light SHALL always be inside the visible area. There SHALL be no horizontal or vertical scrollbar caused by the scene.
3. In portrait the candle SHALL stay centred and large enough to read its height; in landscape the extra width SHALL show more of the room (walls, window, shelf space), not a bigger or smaller candle.
4. Space at the edge of the room SHALL be left clear for the ghosts, the door and the controls of other specs. This spec places none of them. The one area it reserves is the time-text zone of R7.8.
5. The scene SHALL NOT rely on a fixed pixel size, a fixed aspect ratio or a hover.

### R11. Look and construction

**User story:** As a judge, I want the room to look like a haunted room, not like a software demo.

1. The scene SHALL be built from inline SVG and CSS only. It SHALL NOT use raster or vector image files, `<img>`, `<canvas>`, WebGL or video. SVG filters, gradients and masks are allowed.
2. The look SHALL follow `scene.md` and brief section 7: a dark, painterly room lit only by the candle; deep blue-black walls, warm amber light, ivory wax; flame from layered radial gradients; light pool from a radial mask whose radius follows R7.
3. The scene SHALL NOT look like a retro OS, 1-bit art or a spreadsheet: no window chrome, no pixel art, no grid or table layout, no hard two-colour palette. The look SHALL be soft: gradients, a vignette, and soft edges.
4. The scene SHALL show no text. The time text and all flavour text belong to other specs. The one exception is the accessible name in R12.
5. All colours and sizes that change with state SHALL be set through CSS custom properties on the scene root. The renderer SHALL write only custom properties and data attributes (for the discrete flame mode and phase), never inline styles on individual shapes or inline logic.
6. The renderer SHALL contain no branching on phase, time or wax. All such decisions are in the model.
7. No trademarks, logos or real product names, in code, comments, copy or assets. Say "focus session" (see `product.md`, Naming).
8. A new visual element SHALL map to a piece of state, or it SHALL NOT ship (`product.md`). Every element in this spec maps as follows: candle and wax to time left, drips to quarters burned, flame to session state, light pool to progress, dawn to completion, the wick glow to the break, smoke to an ended session, the stub to an ended session, the window pane to completion, the wall to nothing of its own (it is the surface the light pool reveals, so it carries progress), and the zone to a reserved area for the time text that also brightens at dawn. There is no table and no dish (costume review F1).

### R12. Accessible name

**User story:** As a screen-reader user, I want to know what the scene shows without hearing it change every frame.

1. The scene root SHALL be `role="img"` with an `aria-label` that names the flame mode in words. The words SHALL live in `src/strings.ts`.
2. The label SHALL be updated only when the flame mode changes, not on every redraw. It SHALL NOT include the time. The time for screen readers belongs to `controls-and-access`.

### R13. Wiring and tests in the browser

**User story:** As a developer, I want to see every state in a real browser, before the controls exist.

1. `main.ts` SHALL load the stored state through `src/storage/`, send it to the engine as a `reload` event, and then redraw on every animation frame with the current `now`. It SHALL send `tick` events so that the engine settles. This wiring is the minimum needed to show the scene. It adds no controls.
2. Playwright tests SHALL reach each state by writing a stored session to `localStorage` before the page loads, and by faking the clock (for example `page.clock`). They SHALL NOT use a test-only hook in the shipped code (Decision Q5). The fixtures SHALL be built with the engine's `serializeSession` and `serializeHistory` (and the storage adapter's key names), never with hand-written JSON, so that they follow the session document version. That version moves to 2 in the `distraction-tracking` spec.
3. Screenshots SHALL be taken of each of these states: `idle`, `lit` at the start, `lit` at the half (with two drips), `lit` in the last minute (`guttering`), `paused`, `burned-out` (dawn) and `snuffed` (smoke).
4. The states SHALL be shot at a desktop size (1280 by 800) and a phone portrait size (360 by 640). The same states SHALL also be shot at the desktop size with reduced motion on.
5. Screenshots SHALL be saved in `docs/screenshots/` with names that say the state, the size and whether reduced motion is on (for example `candle-lit-half-desktop.png`, `candle-lit-half-desktop-reduced.png`).
6. Following `scene.md`, any later change that alters what a user sees SHALL retake the affected screenshots, and the task summary SHALL say which.
7. The Playwright tests SHALL also assert the custom properties and data attributes for each state, so that a wrong state is caught without comparing pixels.
8. The `costume-reviewer` agent SHALL review `design.md` before it is approved, and the finished scene before the spec is closed. Its findings SHALL be recorded in the spec. The review runs in the Kiro CLI (`kiro-cli chat --agent costume-reviewer`), because custom agents live in `.kiro/agents/`; it does not run in Kiro Web. Design review done: verdict CHANGES NEEDED, then applied; the findings F1 to F6 are recorded in the design's Decisions (17.2).
9. Order of work: this spec's code tasks SHALL run only after `distraction-tracking` is complete. Both specs change the engine's public surface, and this spec adds the `main.ts` wiring (R13.1). Writing this spec's design and tasks does not have to wait.

## Property-based tests (fast-check)

Files: `*.prop.test.ts`, colocated in `src/scene/`. The generators are the engine's (`src/engine/test-kit.ts`, imported by tests only) plus generators for `now`, `seed` and `reducedMotion`. Each property runs at least 300 cases, like the engine's.

| ID | Property | Covers |
|---|---|---|
| P1 | For any generated event sequence, while a session is running (`lit` or `paused`) the model's wax height equals `waxFraction(state, now)`, and it never grows from one event to the next or from one `now` to a later one. The drip count never falls. | R3.1, R3.2, R4.2 |
| P2 | For any generated event sequence, the light radius never grows during a session, is constant while `paused`, and is non-decreasing in wax height. | R7.2, R7.3 |
| P3 | Flame mode is a pure function of `phase` and `timeLeftMs`: two states with the same phase and time left give the same mode, and the mode follows the table in R5.1 (including `paused` over `guttering` and time left 0 while `lit`). | R5.1 to R5.4 |
| P4 | Flicker is deterministic: the same `(seed, now, mode)` gives equal values, values stay in range, they are 0 for `unlit` and `smoke`, they do not depend on the state, and two instants a few ms apart give nearby values. | R6 |
| P5 | Reduced motion keeps the information: the model with `reducedMotion: true` equals the model with `false` in every non-motion field, and its motion values are all zero or false. | R9.1, R9.2 |
| P6 | Totality and bounds: for any state, `now` (including `NaN`, `Infinity` and negative values) and options, `sceneModel` returns a model with all numbers finite and in range, and does not throw. | R1.5, R2.2, R2.4 |
| P7 | Purity: the same input gives a deeply equal model, the input is not changed, and the model has no user text. | R2.3, R2.5, R2.6 |
| P8 | The dawn amount is 1 exactly when the phase is `burned-out` (whether or not the break is in progress), and 0 otherwise. The light radius is 0 whenever the phase is `burned-out` or `snuffed`. `cooling` equals `isBreak(state, now)` and changes nothing else in the model. The `stub` flag is 1 exactly when the phase is `burned-out` or `snuffed`. | R3.7, R7.5, R8.2, R8.5 |

Example-based unit tests (not property-based) cover: the five flame modes at their boundaries (time left 60 001, 60 000 and 0 ms; paused in the last minute), the drip count at wax 0.76, 0.75, 0.5, 0.25 and 0, idle values (wax 1, no flame, small light), burned-out and snuffed values, the stub flag in every phase, the drawn candle height proportional to the wax height, the contrast of ivory against the zone's darkest and brightest backgrounds (at least 4.5:1), a fixed flicker table for one seed, the purity test (strips comments, whole-word match, like the engine's), the stylesheet containing a `prefers-reduced-motion` block, and the renderer writing only custom properties and data attributes (checked in a DOM test environment or in Playwright).

Playwright tests (not property-based) cover: each state's custom properties and attributes, the screenshots in R13, no scrollbar at the two sizes, the candle inside the visible area at both sizes, and the time-text zone staying clear of flame, halo and pool.

## Out of scope

- Ghosts and their drift, the graveyard and the shelf (`ghosts-and-graveyard`), including the remaining-wax detail of a snuffed session. The scene only keeps the edge of the room clear.
- Controls, the confirm dialog, settings, keyboard handling, the time text and its contrast, focus, the door (`controls-and-access`). This spec only publishes the room's darkest and brightest background colours (R7.7).
- Sound, including the chime at dawn, and the page title (`sound-and-title`).
- Fonts. The scene shows no text.
- Distraction tracking (`distraction-tracking`). Distractions never change the timer and so never change this scene.
- Any change to the engine. If the scene needs something the selectors do not give, that is a question for the engine spec, not a change here.

## Open questions

None. The five questions from the first review are answered below.

## Decisions

- **Q1. The idle candle:** yes. `idle` draws a whole candle (wax height 1) in a dim room at the minimum light radius. R3.3 stays as the one stated exception to "wax height equals `waxFraction`".
- **Q2. Snuffed candle:** yes. A snuffed candle is a fixed stub. The remaining-wax detail belongs to `ghosts-and-graveyard`. No engine change.
- **Q3. Dawn and the break:** yes. The dawn stays at 1 for the whole `burned-out` phase. `cooling` only adds a faint warm glow on the wick while `isBreak` is true (R8.5).
- **Q4. Drips:** three, at 25, 50 and 75 percent burned. This is a **deliberate change from the brief**, which says "a drip at each quarter" (section 4). At 100 percent the candle is out and the flame mode already shows the end, so a fourth drip would say nothing new. The brief itself is not edited.
- **Q5. Reaching states in e2e:** fixtures through storage, using the real reload path and no hook in shipped code (R13.2). Two additions: fixtures are built with the engine's `serializeSession` and `serializeHistory`, never hand-written JSON, so they follow the session document version (version 2 after `distraction-tracking`); and this spec's code tasks run only after `distraction-tracking` is complete, because both change the engine's public surface and this spec adds the `main.ts` wiring (R13.9).
- **Costume review:** `costume-reviewer` runs in the Kiro CLI (`kiro-cli chat --agent costume-reviewer`), not in Kiro Web (R13.8).
- **Costume review of `design.md` (R13.8):** verdict CHANGES NEEDED, then applied. P1 accepted (R5.6 read at scene level for `unlit` vs `smoke`). F1: the table and dish are removed. F2 and F5: the floor band is the time-text zone, with the new R7.8. F3: a constant faint night colour on the window pane (R8.7). F4: constant pool intensity (R7.9) and the dawn as a wash above the night layer (R8.7). F6: the drawn height is exactly proportional to the wax, and the stub is drawn only after the end (R3.7). Details: `design.md` Decisions 17.2.
