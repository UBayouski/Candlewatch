# Requirements: controls-and-access

Source: `docs/BRIEF.md` section 5 (Interaction), the line under section 4 ("The time left is also always shown as text (`12:31`), in the page title while a session runs, and to screen readers"), section 7 (reduced motion, contrast, responsive) and section 11 item 5. Constrained by `.kiro/steering/product.md`, `tech.md`, `structure.md` and `scene.md`, and built on the finished `session-engine`, `distraction-tracking` and `candle-scene` specs, especially their Decisions (the time-text zone below y = 900, text at least ivory `#efe6cf`, the contrast bounds in candle-scene design 7.2, the reserved edge bands).

Status: **review answers applied** (see Decisions). The design is written in `design.md` and waits for review. The tasks come after the design is approved.

## Introduction

This spec puts the user's hands on the candle. It adds everything the user touches or reads that is not the room itself:

- choosing a length and an optional intent, and lighting the candle;
- pause and resume, and the deliberate snuff with its confirm dialog;
- the time left as text in the time-text zone;
- the text a screen reader gets for the time and the state;
- settings (sound on or off, ghosts on or off, default length) that survive a reload;
- the keyboard model and the focus rules, so that everything works without a mouse;
- the `main.ts` wiring: one place that turns user input and page visibility into engine events.

The engine gains one additive, pure selector, `pauseLeftMs` (R5.6, Decision Q4) and nothing else. Every control only builds an engine event (`light`, `pause`, `resume`, `snuff`) and sends it through the one `dispatch` in `main.ts`. The UI reads state only through the engine's public surface (`src/engine/index.ts`) and shows the result. The scene is not touched either: this spec adds a layer on top of it and keeps that layer out of the flame, the halo and the candle.

To make the logic testable in Node (Vitest runs with `environment: "node"` and no DOM library is installed), the behaviour is split into **pure modules** (time text, length and intent handling, the key map and the UI state machine, the announcer, the settings document) and **thin DOM code** that only builds elements, applies what the pure modules return and listens for events. The pure modules are unit-tested and property-tested; the DOM code is checked in a real browser with Playwright and a faked clock.

## Glossary

- **Control**: any element the user can operate: a button, a field, a chooser, a switch.
- **Time text**: the time left as text in the `m:ss` family, for example `12:31`.
- **Time-text zone**: the band below the floor line (y = 900 and down, in room units) that `candle-scene` reserves, with its text area `.zone-text-area` (x 110..490, y 900..1000). Its backgrounds are `--zone-bg-darkest` `#080b12` and `--zone-bg-brightest` `#4b4358`.
- **Candle column**: the vertical strip of the stage that holds the candle, the flame and the halo: the candle is x 268..332, and the flame and halo reach further, moving down as the wax burns.
- **Reserved edges** (or **edge bands**): the stage strips x 0..110 and x 490..600 for every y, including the part below the floor line, and everything beyond them sideways (candle-scene design 5.4, 7.2).
- **Keep-clear region**: where no persistent control and no text may be: the **candle column** and the **window pane** (R8.3), and the door and ghost rectangles `DOOR_RECT` and the ghost cells (R8.3). *(Amended by ghosts-and-graveyard task 1, CR5.)* The candle column is the strip of the stage that holds the candle, the flame, the halo at every wax height, and the small pool around an unlit wick.
- **Setup controls**: the length chooser, the intent field and Light. Shown in `idle` and in the ended phases, and not while the graveyard view is open. *(Amended by ghosts-and-graveyard task 1, CR-V1.)*
- **View**: `room` (the candle, the normal screen) or `graveyard` (the second screen of `ghosts-and-graveyard`, reached through the Door). It is UI state outside the engine and changes no time. *(Added by ghosts-and-graveyard task 1, CR1.)*
- **Zone controls**: everything persistent in the floor-band zone: the time text, the status line, Pause or Resume and Let it go dark (only while `lit` or `paused`), and the Settings opener (always).
- **Compact** and **wide** layouts: the two placements of R8, chosen from the width the viewport leaves on each side of the stage.
- **Overlay**: a dialog or panel that opens over the room while it is open: the snuff dialog and the settings panel. Overlays are exempt from the keep-clear rule while open (Decision Q2).
- **Announcement**: text put into the polite live region for screen readers.
- **Ended phase**: `burned-out` or `snuffed`.
- **UI state**: what the interface remembers on top of the engine state: whether the snuff dialog or the settings panel is open, what is typed in the intent field, the chosen length, and which element should have focus.
- **Settings**: `{ sound, ghosts, defaultLength }`.
- **Status line**: the one line of text under the time text in the zone.

## Requirements

### R1. Boundaries and wiring

**User story:** As a maintainer, I want one place where input becomes engine events, so that the timer can never disagree with what the controls show.

1. All code of this spec SHALL live in `src/ui/` (controls, dialogs, key handling, announcements, formatting), in `src/storage/` (the settings adapter) and in `src/main.ts` (wiring), plus new strings in `src/strings.ts` and new CSS in `src/ui/`. The scene (`src/scene/`) SHALL NOT change. The engine (`src/engine/`) SHALL change only by one additive pure selector, `pauseLeftMs` (R5.6, Decision Q4), which is recorded in the session-engine Decisions and has its own unit and property tests.
2. `main.ts` and `src/ui/` own the clock source and pass `now` into the engine (`structure.md`). Every user action SHALL reach the engine through the same `dispatch(event, now)` that already runs `step` and `save` in `main.ts`, with `now` read from `Date.now()` at the moment of the action. No other code path SHALL call `step`.
3. The UI SHALL read engine state only through the public surface of `src/engine/index.ts` (selectors, constants, `phase`, and fields of the states it exports). It SHALL NOT compute time left, wax or pause totals itself; it SHALL use `timeLeftMs`, `pauseLeftMs`, `isBreak` and the engine's constants.
4. The UI SHALL send only events that are valid in the current phase: `light` in `idle`, `burned-out` or `snuffed`; `pause` in `lit`; `resume` in `paused`; `snuff` in `lit` or `paused`. It SHALL NOT rely on the engine ignoring an invalid event.
5. The pure modules (time text, length parsing, the light request, the key map, the UI state machine, the announcer, the settings document) SHALL import nothing from the DOM, `window`, `document`, `localStorage`, `Date` or `Math.random`, and SHALL take `now` as an argument. A purity test, like the engine's and the scene's, SHALL enforce it.
6. `localStorage` SHALL be touched only by `src/storage/`. The settings document SHALL be read and written there (R11). The UI SHALL receive settings as plain values and a `save` callback.
7. The user's text (the intent) SHALL be put into the page with `textContent` or an equivalent, never as HTML. Nothing in the page SHALL be built by concatenating user text into markup.
8. All user-visible text SHALL live in `src/strings.ts`: labels, button names, headings, the dialog text, error messages, flavour lines, the first-visit line, the settings labels and every announcement. The word "Pomodoro" SHALL appear nowhere in the repository's source, copy or documents of this spec; a unit test SHALL scan `src/` for it, case-insensitively. No trademarks, logos or real product names.
9. No new runtime or test dependency SHALL be added without asking. In particular, no DOM library for Vitest.

### R2. Choosing a length

**User story:** As a user, I want to pick how long the candle burns, with three common choices and a custom one.

1. The chooser SHALL offer the presets 15, 25 and 50 minutes (`PRESET_LENGTHS_MIN`) and a custom length, in whole minutes from `MIN_LENGTH_MIN` (5) to `MAX_LENGTH_MIN` (90) inclusive. These numbers SHALL be read from the engine's constants, not repeated.
2. Exactly one length SHALL be selected at any time. The initial selection SHALL be the default length from the settings (R11). After a session ends, the selection SHALL stay what the user last chose.
3. The chooser SHALL be one group with one accessible name, reachable and operable by keyboard: arrow keys move between the presets and the custom field, as for a radio group, and the group has a single tab stop. The selected preset SHALL be shown by more than colour (for example a mark or a heavier border).
4. A custom length is typed as digits. A **pure** function `parseLength(text)` SHALL accept a text exactly when, after trimming spaces, it is one to three ASCII digits whose value is an integer from 5 to 90; it SHALL return that integer, and otherwise an error reason. Leading zeros are allowed (`025` is 25). Signs, decimals, exponents, other scripts' digits and empty text SHALL be rejected.
5. WHEN the custom text is not valid, THE UI SHALL show an error message in the status line (text from `strings.ts`, naming the allowed range; the upper room has no space for it beside the field, Decision Q1), mark the field `aria-invalid="true"` and connect the status line with `aria-describedby`, announce the refusal once (R9.3), and SHALL NOT send `light`. The message SHALL appear only after the user has typed in the field or pressed Light, not on first load, and SHALL go as soon as the text is valid.
6. A preset or a valid custom length SHALL always be accepted by the engine; the UI SHALL never build a `light` event with a length the engine would ignore.

### R3. The intent

**User story:** As a user, I want to say in a few words what the candle is for.

1. The UI SHALL offer one optional single-line text field for the intent, with an accessible name. It SHALL be a single-line field, so a line break cannot be typed; pasted line breaks are handled by the engine (session-engine R2.4).
2. The UI SHALL show how much of the limit is used, in code points, against `INTENT_MAX_CODE_POINTS` (80), and SHALL keep a count that matches how the engine counts (Unicode code points, not UTF-16 units). The count is information, not a hard stop: longer text is allowed in the field and is cut by the engine. The count SHALL be announced politely at most when the limit is passed, not on every key.
3. The UI SHALL pass the typed text to the engine as the `intent` of the `light` event, unchanged. It SHALL NOT trim, cut or flatten the text itself, so that the engine stays the one place that normalizes (session-engine R2.4).
4. WHILE `lit`, THE status line SHALL show the intent that the engine kept (`session.intent`) when there is one, as text, cut with an ellipsis if it does not fit, with the full text available to screen readers (R7.5). In the other phases the line has other duties (R7.5) and the intent is not shown; it stays in the stored session for the graveyard and the shelf.
5. The intent field SHALL be cleared after a session is lit, ready for the next one. The chosen length SHALL not be cleared (R2.2).

### R4. Light

**User story:** As a user, I want to start a session with one key or one tap.

1. In `idle`, `burned-out` and `snuffed`, a **Light** button SHALL be shown and enabled. Its name SHALL be from `strings.ts` and SHALL say "Light" in `idle` and a variant for an ended phase (for example "Light another") so that the purpose is clear.
2. Pressing Light, or pressing Enter while the focus is not on another button, link or the settings, SHALL send `light` with the selected length and the typed intent, when the length is valid (R2.4, R2.5). Pressing Enter inside the intent field or the custom length field SHALL do the same (they are one form).
3. WHEN the length is not valid, THE UI SHALL NOT send an event. The focus SHALL move to the custom field and the error message SHALL be shown (R2.5).
4. The break is not a control. Skipping the break is lighting a new candle, which is allowed at any time, including while `isBreak` is true (session-engine R7.5). WHILE `isBreak(state, now)` is true, THE status line SHALL say "The wax cools." (R7.5); nothing else about the break is shown, and there is no countdown (Decision Q3).
5. WHEN `light` has been sent, the interface SHALL change to the running controls (R5, R6) in the same frame, and the focus SHALL follow the rules in R10.5.
6. A `light` while the previous session is still `lit` or `paused` SHALL be impossible from the UI (the Light button is not shown; Enter does nothing).

### R5. Pause and resume

**User story:** As a user, I want to stop the clock for a real interruption and start it again.

1. WHILE `lit`, a **Pause** button SHALL be shown; WHILE `paused`, a **Resume** button SHALL be shown in the same place, with a different name, so the control and its name always say what it will do.
2. Space SHALL send `pause` while `lit` and `resume` while `paused`, under the focus rules of R10.3. Pressing the button does the same.
3. The UI SHALL NOT send `pause` or `resume` when the snuff dialog or the settings panel is open.
4. WHILE `paused`, THE status line SHALL show the pause allowance left as text: `pauseLeftMs(state, now)` shown with `formatTime` and a label from `strings.ts` (for example "Pause left 09:12"). It counts down while the time text stays still. It is not announced (R9.4).
5. WHEN the engine snuffs a paused session because the limit passed, THE interface SHALL change to the ended controls and announce it (R9), with the focus rules of R10.5.
6. **Engine addition.** The engine SHALL gain one pure selector, `pauseLeftMs(state, now): number`, exported from `src/engine/index.ts` and recorded in the session-engine Decisions. WHILE `paused` it SHALL return the pause allowance left: the instant the engine snuffs the pause (`pausedAt + (PAUSE_LIMIT_MS - pausedTotalMs)`, the same instant `settle` uses) minus `max(floor(now), pausedAt)`, so a clock that moved backwards cannot make it grow past `PAUSE_LIMIT_MS - pausedTotalMs`; the result is in `[0, PAUSE_LIMIT_MS]`. It SHALL return 0 in every other phase and for a non-finite `now`. It SHALL NOT settle, add an event, a phase or a field, or change `step`, `settle` or the serialized formats. Its unit tests and its property (P9) belong to this spec's tasks.

### R6. Snuff

**User story:** As a user, I want letting a candle go to be deliberate, so that I never lose a session to a stray key.

1. WHILE `lit` or `paused`, Esc SHALL open the snuff dialog, and a **Let it go dark** button (name from `strings.ts`) SHALL do the same by pointer. Neither SHALL send `snuff`.
2. The dialog SHALL be a modal dialog with the heading "Let it go dark?" (text in `strings.ts`) and two buttons: **Keep burning** and a confirm button whose name says the candle goes dark. It SHALL have an accessible name and, if there is a short body text, an accessible description.
3. WHEN the dialog opens, THE focus SHALL be on **Keep burning**. The focus SHALL stay inside the dialog (Tab and Shift+Tab cycle between the two buttons), and the content behind it SHALL not be reachable by keyboard or by a screen reader while it is open.
4. **Keep burning**, Esc, and a click outside a plain backdrop (if any) SHALL close the dialog without sending any event. Only an explicit activation of the confirm button SHALL send `snuff`. Pressing Esc twice SHALL never snuff. Enter and Space on the focused button activate that button, nothing else.
5. The dialog SHALL NOT pause or change the timer. The candle keeps burning while the dialog is open; the time text keeps updating behind or beside it (R8.8).
6. IF the session ends while the dialog is open (the candle burns out, or the pause limit passes), THEN THE dialog SHALL close by itself, the ended state SHALL show, and the confirm button SHALL no longer send anything. A confirm that arrives after the end SHALL leave the engine state as the engine returns it (the session stays `burned-out`).
7. WHEN the dialog closes without a snuff, THE focus SHALL return to the element that had it before, or to the Pause or Resume button if that element is gone. WHEN it closes with a snuff, the focus SHALL follow R10.5.
8. In reduced motion the dialog SHALL appear and disappear without any transition (R13).

### R7. The time text

**User story:** As a user, I want to read the time left, always, in the same place.

1. The time text SHALL be shown whenever the page shows a candle: in `idle` (the time of the chosen length, as a preview), in `lit` and `paused` (the time left), and in the ended phases (`00:00`).
2. It SHALL be placed inside the time-text zone's text area (`.zone-text-area`), centred, and SHALL never cover or sit over the flame, the halo, the candle or the pool (R8; the zone is below the floor line, which none of them enter). It SHALL be larger than any other text.
3. A **pure** function `formatTime(ms)` SHALL produce `mm:ss`: minutes with at least two digits, seconds with exactly two digits, from a time in milliseconds **rounded up to whole seconds**. So 25 minutes shows `25:00`; 12 minutes 30.1 seconds shows `12:31`; 1 ms shows `00:01`; 0 shows `00:00` and only 0 does. A negative, `NaN` or infinite input shows `00:00`. The text for a larger time is never earlier than the text for a smaller one.
4. The time text SHALL be computed from `timeLeftMs(state, now)` in `lit` and `paused`, from the selected length in `idle`, and SHALL not be computed from counting frames. The text SHALL be written to the page only when the string changes, not on every frame.
5. Under the time, the **status line** SHALL show one line of text, cut with an ellipsis if it is too long (the full text stays available to screen readers), chosen by phase: in `idle`, `snuffed` and `burned-out` after the break, the flavour line of R14 (in `idle` with an empty history, the first-visit instructions, R14.2); in `lit`, the intent if there is one, else the flavour line; in `paused`, the pause allowance (R5.4); in `burned-out` while `isBreak`, "The wax cools."; and, for a moment, a refusal message (R2.5). The time text lies inside `.zone-text-area`; the status line lies inside the zone, which is the band from the floor line to the bottom of the viewport. Together they SHALL fit that band at every viewport in R8.7 (it is 80 CSS pixels tall at 360 by 640) without covering each other or any control. While Pause or Let it go dark are shown the line is one line and is narrower, so that it never reaches a button; in `idle` and the ended phases it may use two lines when the band is at least 80 CSS pixels tall.
6. The time text SHALL be at least ivory in brightness (relative luminance not below that of `#efe6cf`, 0.7945), as the candle-scene handoff requires, so that it meets at least 15.83:1 against `--zone-bg-darkest` and 7.53:1 against `--zone-bg-brightest`, at every state and light level including the darkest minute and the dawn. The status line, the intent and every other text in the zone SHALL meet at least 4.5:1 against the zone's real background in each state (R13.3). A unit test SHALL check the colours; a browser test SHALL check the rendered pixels.
7. The same `formatTime` SHALL be exported for the `sound-and-title` spec (the page title shows the same text). That spec does not change it.

### R8. Where things go

**User story:** As a user, I want the room to stay the room: the candle and its light must never be hidden behind a button.

1. **Which controls are shown when.** WHILE `idle`, `burned-out` or `snuffed`, THE **setup controls** (length chooser, intent field, Light) SHALL be shown, in the dark upper room (R8.2). WHILE `lit` or `paused`, THE setup controls SHALL NOT be shown. In every phase the **zone controls** are shown: the time text and the status line, the Settings opener, and, while `lit` or `paused`, Pause or Resume and Let it go dark (for touch). While a session runs, the only persistent interface is therefore in the floor-band zone. Overlays (R6, R11) are the only other things that can appear. WHILE the graveyard view is open (`view === "graveyard"`), THE setup controls SHALL NOT be shown either; the zone controls and the Settings opener stay. *(Amended by ghosts-and-graveyard task 1, CR-V1.)*
2. **Where they go.** The setup controls SHALL sit in the upper room, clear of the candle column and of the window pane. The zone controls SHALL sit in the zone, below the floor line, in this order from left to right: Pause or Resume, the time text and status line, Let it go dark, Settings. Nothing persistent SHALL sit in the top corners or anywhere else above the floor line while a session runs. The left edge band below y = 300 room units SHALL stay free for the door of `ghosts-and-graveyard`. That door is `DOOR_RECT` (x 20..100, y 805..890 room units), a keep-clear rectangle of the placement function (R8.3). *(Amended by ghosts-and-graveyard task 1, CR5.)*
3. **The keep-clear region** is: the candle column (stage x 160..440, y 260..900 in room units: the candle, the flame, the halo at every wax height, and the idle pool) and the window pane (x 240..360, y 50..260). No persistent control and no text SHALL intersect it, in any phase, at any wax height, at any viewport in R8.7, with at least 6 CSS pixels between a control and the candle column and 1 CSS pixel between a control and the window pane. The time text and the status line are below the floor line, which the flame, the halo, the drips, the smoke and the pool never enter, so they are clear by construction (candle-scene R7.8). The region also holds `DOOR_RECT` (x 20..100, y 805..890 room units) and the ghost cells (x 10..100 and x 500..590, y 215..785 room units): `placeControls` treats them as keep-clear rectangles and no control intersects them, in any phase and at any viewport in R8.7, because ghosts stay drawn in `burned-out` and `snuffed` while the setup controls are shown. *(Amended by ghosts-and-graveyard task 1, CR5; "exactly" removed from the first sentence because the region now has these two further parts.)*
4. **The pool, without exception.** No persistent control and no text SHALL cover the light pool, at any viewport, phase or wax height (Decision Q2, design review change 1). While a session runs, all persistent interface is below the floor line, which the pool never enters, even when it fills the stage at the start. The setup controls are shown only when the pool is the small idle pool (a disc inside the keep-clear column) or none (`burned-out`, `snuffed`), and they stay clear of the column. The snuff dialog and the settings panel are exempt while they are open (Decision Q2).
5. **Order.** The Tab order SHALL equal the visual order in every layout (R10.6): the length chooser is drawn above the intent field, and the intent field before Light, in the compact layout as in the wide one.
6. **The two layouts to be built** (positions in CSS pixels; the design shows the arithmetic):
   - **360 by 640** (compact; the stage is 360 by 600 from y = 20, the floor line is at y = 560, the zone is y = 560..640): the setup controls are three rows. The length chooser is a row of four cells, 80 by 44, at x 8..352, y 4..48. Below it, the intent field at x 8..136, y 56..100 and Light, 116 by 52, at x 236..352, y 56..108. The window pane is at x 144..216, y 50..176; the idle pool is a disc of radius 84 around (180, 260); the candle column starts at y 176 and is x 96..264 wide. The zone holds the time text (36 px) centred at x 180, y 562..598, with the status line under it, one line 136 wide while the buttons are shown (x 112..248) and up to two lines 240 wide in `idle` and the ended phases (x 60..300). The buttons are 44 by 44 at y 578..622: Pause or Resume at x 8..52, Let it go dark at x 256..300, Settings at x 308..352.
   - **1280 by 800** (wide; the stage is 480 by 800 from x = 400, the floor line is at y = 720, the zone is y = 720..800): the setup controls are one column in the free side area to the right of the stage, x 904..1256: the length chooser (four cells) at y 96..140, the intent field at y 152..196, and Light, 52 tall, at y 212..264. The zone holds the time text (44 px) centred at x 640 in the text area x 488..792, y 722..766, the status line under it (x 488..792 while the buttons are shown, x 312..968 in `idle` and the ended phases), a labelled Pause or Resume button, 128 by 44 at x 344..472, a labelled Let it go dark button, 160 by 44 at x 808..968, and a labelled Settings button, 96 by 44 at x 976..1072, all y 738..782.
   The layout SHALL be computed by a pure function of the viewport size and the stage's own scaling rule (design 6), so that other sizes follow the same rules: the wide layout when the viewport leaves at least 360 px on each side of the stage, the compact layout otherwise; in the compact layout, where the window pane starts too high for a full-width top row (a stage limited by height in a narrow viewport), the chooser is a 2 by 2 grid in the region left of the window, with the intent field under it and Light to the right of the intent field.
7. **Viewports.** The layout SHALL work at 360 by 640, 768 by 1024, 1280 by 800 and 1920 by 1080, and at every size from 360 by 640 up (property P10), with no scrollbar, no clipped control and no two controls overlapping (at least 4 CSS pixels between them). Controls SHALL be at least 44 by 44 CSS pixels, with the labelled buttons of the wide layout allowed to be wider. Viewports shorter than 640 CSS pixels (a phone held sideways) are best effort: nothing may be lost, but the rules of R8.3 are not guaranteed there (design 6.7).
8. **Overlays.** The snuff dialog and the settings panel SHALL appear over the room only while open. They SHALL be as small as their content allows, SHALL NOT dim or blur the room behind them, SHALL NOT stop the clock or the redraw, and SHALL be placed away from the flame and the halo wherever the viewport has room: in the free side areas at wide sizes, and anchored to the top of the viewport at compact sizes, no taller than the space above the halo's highest point for the snuff dialog (design 6.6).
9. The page SHALL not depend on hover. Every control SHALL work by pointer, touch and keyboard.
10. Following `scene.md`, the new CSS under `src/ui/` is covered by the same rules as the scene's: soft, dark, ivory; not a retro OS, not a spreadsheet; no window chrome, no table layout.
11. A new visual element SHALL map to a piece of state or to an action the user can take, or it SHALL NOT ship (`product.md`). The controls map to actions, the time text to time left, the status line to the phase, the pause allowance and the intent, and there is no decoration.
### R9. Screen-reader text

**User story:** As a screen-reader user, I want to know the time and the state without being talked at every second.

1. The time text element SHALL have `role="timer"` (not a live region), so it can be read when visited, and SHALL give its time in words as well as digits where a name is needed (a pure `spokenTime(ms)`, for example "12 minutes 31 seconds").
2. There SHALL be exactly one polite live region (`role="status"`) for announcements. It SHALL be in the page from the start (so it is registered before it is used), visually hidden with the clip technique (not `display: none`), and written with one message at a time. The DOM layer SHALL expose `announce(text: string)`, which writes one line to this region (with the same one-frame clear for a repeated line), so that `main.ts` can announce a view change; the pure `nextAnnouncement` is unchanged. *(Amended by ghosts-and-graveyard task 1, CR-A1.)*
3. A pure **announcer** SHALL decide what to say, from the engine state and `now`, and return at most one message per call. It SHALL announce:
   - **state changes**, once each, at once: lit, paused, resumed, burned out (which starts the break), and snuffed (by the user, or by the pause limit). The end of the break is not announced: nothing happens when it ends (session-engine R7.5);
   - **a refusal**, once each time Light is refused for an invalid length (R2.5);
   - **time milestones** while `lit`, once each per session: when the time left first falls to 75, 50 and 25 percent of the length, and to one minute (the moment the flame starts to gutter). A milestone is announced with the time left in words. After a pause and resume, a reload, or a long throttled gap, a milestone that was already announced is not announced again, and when several were crossed at once only the latest is announced.
4. The announcer SHALL NOT announce on every tick, every second or every minute, SHALL NOT announce the time or the pause allowance while `paused`, and SHALL NOT announce distractions (`hide` and `show`). The number of automatic announcements over a whole session SHALL be bounded: at most one per state change plus four milestones, whatever the tick rate (P7). When a page is loaded with a session already running, the first call SHALL say the state once (with the time left if `lit`; the time is not announced while `paused`), and SHALL treat the milestones already passed as announced.
5. **On request** (Decision Q5): pressing **T** in `lit` or `paused` SHALL announce the time left in words (and "paused" if paused), once per press, at once, even when the words are the same as the last announcement. These are not counted in the bound of R9.4; each press gives exactly one message.
6. Announcement text SHALL come from `strings.ts`. The messages for state changes SHALL be the same short lines as the status line where one exists (R14), so sighted and non-sighted users get the same words.
7. The dialog and the settings panel SHALL be announced by their roles and names (R6.2, R11.2), not through the live region.
8. The scene keeps its `role="img"` and its label by flame mode (candle-scene R12). That label SHALL stay free of the time. The live region SHALL NOT repeat it.
9. Every control SHALL have an accessible name from `strings.ts`, a role that matches what it does, and a state exposed to assistive technology: `aria-pressed` or `aria-checked` for switches, `aria-invalid` for a bad field, `aria-expanded` or `aria-haspopup` on the Settings button as fits its design. The page SHALL keep `<html lang="en">`, a single `h1` (visually hidden is allowed, as in candle-scene 10.1) and landmark regions for the scene and the controls.

### R10. Keyboard and focus

**User story:** As a keyboard user, I want every action to be reachable, and to always see where I am.

1. Everything a pointer can do SHALL be doable with the keyboard alone: choose a length, type an intent, light, pause, resume, open and answer the snuff dialog, open and use the settings.
2. The shortcuts SHALL be: **Enter** lights (R4.2); **Space** pauses and resumes (R5.2); **Esc** opens the snuff dialog (R6.1), and closes an open overlay first; **T** announces the time left (R9.5). The first three are described to the user by the first-visit line (R14.2). The key **g** opens the graveyard view, only in `idle`, `burned-out` and `snuffed` (the Door's key; it is handled by `graveKeyAction` of `ghosts-and-graveyard`, and `keyAction` returns `null` for it). *(Amended by ghosts-and-graveyard task 1, CR1.)*
3. A **pure key map** `keyAction(context, keyEvent)` SHALL decide what a key does. It SHALL obey these rules:
   - a key pressed with Ctrl, Alt or Meta SHALL do nothing, so browser and assistive-technology shortcuts keep working; Shift alone does not change a shortcut;
   - Space SHALL not pause or resume while the focus is in a text field or on a button, link or other element that Space already activates, and SHALL not be taken from them (the default action is kept): on the Pause or Resume button the browser's own activation does the toggle, once; the shortcut works when the focus is on the page body or on a non-interactive element;
   - T SHALL announce only in `lit` or `paused`, with no overlay open, and never while the focus is in a text field (so the letter can be typed in the intent), and not on a repeat;
   - Enter SHALL light only when the focus is not on a button, link or switch (which Enter activates natively) and not in a settings control, and in the intent and custom length fields (R4.2);
   - while an overlay is open, only the overlay's keys apply (Tab cycle, Esc to close, Enter and Space on the focused button), and the shortcuts for lighting and pausing do nothing;
   - a key that repeats because it is held (`repeat` true) SHALL do nothing, whatever the key (Space, Enter, T and Escape included), so that a held Space cannot pause and resume in a loop and a held Escape cannot open the snuff dialog and close it again;
   - a shortcut that is not valid in the phase SHALL do nothing and SHALL NOT prevent the browser's default for that key;
   - the context carries the **view** (`"room"` or `"graveyard"`). WHILE `view === "graveyard"`, `keyAction` SHALL return no room action (no light, pause or resume, open-snuff, keep-burning, length change or announce-time), except that Escape still gives close-settings while the settings overlay is open. With `view === "room"` every rule above is unchanged. *(Amended by ghosts-and-graveyard task 1, CR1.)*
   - Arrow keys, Home, End and Escape get a second meaning in the graveyard view only (moving between its Items, and leaving the view or hiding its card); this is done by the graveyard key map, never by `keyAction`. In the room they keep their meaning (the length chooser's arrows, the snuff dialog). The Door and `g` are in the Tab order and the key map only in `idle`, `burned-out` and `snuffed`. *(Amended by ghosts-and-graveyard task 1, CR1, CR2.)*
4. **Focus is always visible.** Every focusable element SHALL show a focus indicator whenever it has focus, including after a programmatic focus move, in every state, on every background of the scene and of the zone. The indicator SHALL have at least 3:1 contrast against the colours next to it (the room's darkest and brightest backgrounds, the zone's, and the control's own background), SHALL be at least 2 CSS pixels thick, SHALL not be clipped by an ancestor, and SHALL not be removed by `outline: none` without a replacement. Under forced colours the indicator and every control's border SHALL still be visible.
5. **Focus management.** Focus SHALL never be left on an element that has disappeared or been disabled by a state change. The target after each change is:

   | Change | Focus goes to |
   |---|---|
   | page load, nothing stored | nothing special: the document, so Tab reaches the first control (the length chooser) |
   | Light sent | the Pause button |
   | Pause sent | the Resume button (the same place) |
   | Resume sent | the Pause button |
   | snuff dialog opens | **Keep burning** |
   | dialog closed without snuff | the element that had focus before, else Pause or Resume |
   | snuff confirmed | the Light button (ended phase) |
   | candle burns out, or the pause limit snuffs | the Light button, unless the user is typing in a field or an overlay is open, in which case focus stays where it is until the overlay closes, then goes to the Light button |
   | settings opened | the first control in the panel |
   | settings closed | the Settings button |
   | Light refused (invalid length) | the custom length field |
   | page reload with a running session | the document (no auto-focus) |
| graveyard view opened (Door or `g`) | the first Group's Remembered_Item, else the next Tab stop |
| graveyard view left | the Door |

   *(The last two rows were added by ghosts-and-graveyard task 1, CR3.)*

6. **The Tab order SHALL equal the visual order** (top to bottom, then left to right) **in every layout** (WCAG 2.4.3): the length chooser, the intent field, Light, then the Door (idle and ended phases; the Door is absent from the Tab order while `lit` or `paused`); Pause or Resume, Let it go dark (running phases); then Settings. While the graveyard view is open the setup controls and the Door are not in the order; the view's own stops come first and Settings last. *(Amended by ghosts-and-graveyard task 1, CR1, CR-V1.)* In the compact layout the chooser is drawn above the intent field, as in the wide layout. Each layout keeps the same reading order in the DOM; a test compares the focus order with the rectangles (P10, E4). There SHALL be no focus trap except in an open overlay, and no positive `tabindex`.
7. The UI SHALL NOT steal focus on its own: no auto-focus on load, none when the tab becomes visible, none when the time changes.

### R11. Settings

**User story:** As a user, I want to turn sound and ghosts on or off and set my usual length, and have it remembered.

1. The settings SHALL be: **sound** (on or off), **ghosts** (on or off), and **default length** (the same chooser rules as R2: a preset or a custom whole number from 5 to 90). The defaults SHALL be sound on, ghosts on, default length 25 (Decision Q6).
2. A **Settings** button in the floor-band zone (R8.2), always shown and reachable by keyboard and pointer, SHALL open the settings panel (an overlay, R8.8). The panel SHALL have a heading and an accessible name, two switches (with `role="switch"` or checkbox semantics and visible on/off text, not colour alone) and a default length chooser, and a Close button. Esc closes it (R10.2). It can be opened in any phase, including while a session burns; the timer is not affected.
3. A change SHALL take effect and be saved at once, with no Save button. The default length applies as the initial selection of the chooser the next time the chooser is shown; it SHALL NOT change a session that is already lit.
4. Settings SHALL be stored in `localStorage` through `src/storage/`, under their own key (for example `candlewatch:settings`), as one JSON document `{ "v": 1, "sound": boolean, "ghosts": boolean, "defaultLength": integer }`. Writing then reading SHALL give back the same settings (identity, P6).
5. Reading SHALL never throw. A missing document, text that is not JSON, a wrong version, a wrong type, or a default length that is not a whole number from 5 to 90 SHALL give the default for that field (a field that is valid is kept; the others fall back). Unknown extra fields SHALL be dropped. A document with a newer version SHALL be read as defaults and not overwritten until the user changes a setting.
6. IF `localStorage` is missing, blocked or full, THEN the settings SHALL still work for the rest of the page's life, in memory, with no error shown.
7. "Sound on" means sound is **allowed**: nothing plays before the first user gesture (brief section 7), and the setting never starts audio by itself (Decision Q6). **Sound** and **ghosts** have no effect in this spec: the settings are stored and exposed (`settings.sound`, `settings.ghosts`) for `sound-and-title` and `ghosts-and-graveyard`. Changing either SHALL NOT dispatch any engine event, SHALL NOT change the timer or the distraction count (turning ghosts off hides ghosts; it does not stop counting), and SHALL be shown in the panel as saved. *(Checked by ghosts-and-graveyard task 1, CR6: the "ghosts" setting is read as defined here; no change.)*

### R12. Visibility wiring

**User story:** As a user, I want the ghosts to be real, so a tab I really left must count.

1. `main.ts` SHALL call `watchVisibility` from `src/distraction/` with the browser's visibility target (`browserVisibilityTarget()`), `Date.now` as the clock and a `send` that goes through `dispatch`, so that every `visibilitychange` becomes a `hide` or `show` event (distraction-tracking R11).
2. Right after the stored state has been restored by the `reload` step, and before the first frame, `main.ts` SHALL call `syncVisibility` once, so a persisted open hide is closed when the page comes back (distraction-tracking R11.3, R10.4).
3. When no visibility target exists (`browserVisibilityTarget()` is null), the wiring SHALL be skipped without error.
4. `hide` and `show` SHALL change no control, text, announcement or focus. They change the distraction count only, which this spec does not show (`ghosts-and-graveyard` does).
5. The wiring SHALL NOT change the timer: the time text and the wax are the same with or without a hidden interval (distraction-tracking R5).

### R13. Reduced motion and contrast for the interface

**User story:** As a user who asked for less motion or who has low vision, I want the interface to stay readable and still.

1. Under `prefers-reduced-motion: reduce` the interface SHALL have no transition and no animation: overlays appear and disappear at once, the focus indicator does not animate, and switches change at once. Outside reduced motion, any motion in the interface SHALL be short (under 200 ms) and SHALL only ease an overlay or a switch; none SHALL run on the time text. A rule in the stylesheet, like the scene's, SHALL switch it all off before the first script runs.
2. State changes in the interface SHALL be shown by text and shape as well as by colour (the selected preset, a switch's on or off, an invalid field), so that nothing relies on colour or motion alone.
3. Contrast, from WCAG 2.x relative luminance, and checked in a unit test from the stylesheet's colours:
   - the time text: at least ivory's luminance, 15.83:1 on the zone at rest and 7.53:1 at dawn (R7.6);
   - all other text, at its real background: at least 4.5:1 (3:1 for text of 24 CSS pixels or more, or 18.66 and bold); in the zone, against `--zone-bg-darkest` and `--zone-bg-brightest`; in the edge bands above the floor line, against the room's published bounds `--room-bg-darkest` and `--room-bg-brightest` (16.20:1 and 4.66:1 for ivory); in an overlay, against the overlay's own background;
   - control borders and the focus indicator: at least 3:1 against what is next to them (R10.4);
   - a disabled control SHALL still be visible with at least 3:1.
4. Text sizes: the body text SHALL be at least 16 CSS pixels; the time text SHALL be larger than any other text and at least 32 CSS pixels at 360 by 640. Text SHALL stay readable when the browser's minimum font size or text zoom is raised, as far as the room's fixed layout allows; where a text would not fit, it is cut with an ellipsis and its full text is available to screen readers (R3.4).
5. Under `prefers-contrast: more` and `forced-colors: active`, the interface SHOULD keep its structure, borders and focus indicator visible (system colours are allowed).
6. The two fonts (one display serif, one text face, both self-hosted and open-licensed, `tech.md`) belong to a later spec. Until then the interface uses the system fonts; the font choice SHALL be one place in the stylesheet so that the swap changes nothing else.

### R14. First visit and flavour text

**User story:** As a first-time user, I want one line that tells me what to press, then the candle.

1. The text for each state (the status line, R7.5) and each announcement (R9.3) SHALL be short, dry and from `strings.ts`, in the tone of brief section 6 (for example "The wick catches." when lit and "The watch is over. Morning." when burned out). There is one line per state: idle, lit, paused, guttering (the last minute), burned-out inside the break ("the wax cools"), burned-out after the break, snuffed. The final wording is written in the design.
2. WHEN the phase is `idle` and the history is empty (nothing has ever been lit), the status line SHALL show the one-line instructions naming the three keys (Enter, Space, Esc). It SHALL disappear as soon as the first session is lit and SHALL NOT come back; no extra storage key is used (Decision Q7). No cutscene, no tour, no modal.
3. The tagline "Keep the candle lit." MAY be shown in the idle phase in the zone with the instructions. It SHALL NOT take space from the time text.
4. No text SHALL mention a trademark or a real product, and the word "Pomodoro" is never used; say "focus session" if a session needs a name (R1.8).

### R15. Tests, screenshots and the review

**User story:** As a developer, I want to see whole sessions run with the keyboard alone, in seconds, and to see every new screen.

1. **Browser tests** (Playwright with `page.clock`, no test hook in shipped code, fixtures built with the engine's `serializeSession` and `serializeHistory` as in candle-scene R13.2) SHALL cover, at least: a whole session driven by the keyboard alone (R15.4); the time text at known clock points; layout and the keep-clear rule at the four viewports; the focus table (R10.5); the live region's output over a whole session; settings persistence and the fall-backs; the visibility wiring; reduced motion; and the first-visit line. They are listed in R15.4.
2. **Existing tests** SHALL keep passing or be changed on purpose. Two are affected, and this spec changes them: the zone-clear pixel test in `e2e/scene.spec.ts` compares the text area with the plain zone colour, which the time text now fills, so it SHALL check the same area with the interface layer hidden by the test (a style added in the test, not a hook in the shipped code); and the smoke test's visible heading SHALL keep passing.
3. **Screenshots** (the screenshot rule in `scene.md`): this spec changes what every state looks like, so all 21 `candle-*` screenshots SHALL be retaken, and each looked at, and the task summary SHALL say so. New screenshots SHALL be added in `docs/screenshots/`, named `controls-<screen>-<size>[-reduced].png`, at desktop (1280 by 800) and phone (360 by 640): the first visit with its instruction line; an invalid custom length with its error; the snuff dialog open (also with reduced motion); the settings panel open; keyboard focus visible on Light, on Pause and on a switch; the ended phase with Light another. The suggested set is in the design. *(Amended at the close of the spec: the folder holds 20 `controls-*` files and the 21 `candle-*`, 41 pictures; the list is in design section 14.)*
4. **Whole sessions with the keyboard**: (a) Tab to the chooser, choose 15 with the arrow keys, type an intent, press Enter; the flame is lit, the Pause button has focus; (b) run the clock, Space pauses, the flame is blue, the time text stops, Space resumes; (c) Esc opens the dialog with **Keep burning** focused, Esc closes it and nothing changes; (d) Esc, Tab to confirm, Enter: the candle is snuffed, the grave state shows, Light has focus; (e) Enter lights again, run the clock to the end: burned out, dawn, the instruction to light another, a reload keeps the state; (f) the same on a phone viewport with touch taps.
5. The `costume-reviewer` agent SHALL review the finished interface in the Kiro CLI (`kiro-cli chat --agent costume-reviewer`) before the spec is closed, as it did for the scene. Its rules apply to the interface as follows: no element is decoration only (R8.8); the reduced-motion version still shows every state (R13.1, R13.2); and the time text keeps its contrast (R7.6, R13.3). Its findings SHALL be recorded in the design's Decisions.
6. Order of work (Decision Q8): this spec's code tasks MAY run before `ghosts-and-graveyard`. The left edge band below y = 300 room units is kept free for that spec's door (R8.2), and that spec shall keep its ghosts clear of the setup controls in the ended phases. *(Amended by ghosts-and-graveyard task 1, CR5: this spec now keeps the controls clear of the ghost cells and `DOOR_RECT` too, R8.3, P10.)*

## Property-based tests (fast-check)

Files: `*.prop.test.ts`, colocated in `src/ui/` and `src/storage/`. Generators come from the engine's `src/engine/test-kit.ts` (tests only) plus new ones for key events, UI inputs, settings documents and text. Every property runs at least 300 cases through `PROP_PARAMS`, and no property is ever weakened to make it pass.

| ID | Property | Covers |
|---|---|---|
| P1 | **Time text.** For every finite `ms` the text of `formatTime` matches `^\d{2,}:\d{2}$`, seconds are 00 to 59, and its value in seconds equals `ceil(ms / 1000)` for `ms` in `[0, 90 minutes]`; the text is `00:00` for `ms` of 0, negative, `NaN` or infinite; it is `00:00` only when `ms` is 0 or less; reading the text back gives the same seconds; for `a >= b` the text of `a` is not earlier than the text of `b`; at `ms` equal to the whole length it shows the length (`25:00`). `spokenTime` names the same minutes and seconds as `formatTime`. | R7.3, R9.1 |
| P2 | **Length parsing.** `parseLength(text)` accepts exactly the trimmed texts of one to three ASCII digits worth 5 to 90, returns that integer, and rejects every other text, including decimals, signs, exponent forms, empty text, other digit scripts and values 0 to 4 and 91 and up; every preset and every integer from 5 to 90 round-trips through `String`; the result is never outside 5 to 90. | R2.4, R2.6 |
| P3 | **Light request.** For any selection (a preset or a custom text) and any intent text (arbitrary Unicode, line breaks, long text, emoji), the pure `lightRequest` gives either a refusal with a reason (and then no event is built) or a `light` event whose length is an integer from 5 to 90. Stepping the engine with that event from `idle`, `burned-out` or `snuffed` always gives `lit`, with `intent` either null or a single line of at most 80 code points with no leading or trailing space, and never throws. An invalid length never produces an event. | R2.6, R3.3, R4.2 |
| P4 | **Key map.** For any context and key event: Ctrl, Alt or Meta gives no action; a repeated Space or Enter gives no action; Space never gives an action while a text field or any button has focus; no key gives `snuff`; Esc gives "open the dialog" only in `lit` or `paused` with no overlay open, and "close" with an overlay open; with an overlay open, no key gives light, pause or resume; no action is ever invalid for the phase; T gives "announce the time" only in `lit` or `paused` with no overlay open and no text field focused, and never on a repeat. With `view === "graveyard"` and no overlay open, `keyAction` gives no action for any key; with the settings overlay open Escape still gives close-settings; with `view === "room"` every rule above is unchanged. *(Amended by ghosts-and-graveyard task 1, CR1.)* | R5.3, R6.1, R6.4, R9.5, R10.3 |
| P5 | **UI state machine against the engine.** For any generated script of key presses, button clicks, time advances (of any size, including long gaps), visibility changes and reloads, driven through the pure UI state machine and the engine together: the engine's phases only follow the allowed transitions (the engine's own invariants hold after every step); `snuff` is sent only right after the dialog was open and the confirm was activated, never otherwise; the dialog is open only while the phase is `lit` or `paused`; opening, closing or cancelling the dialog and the settings panel never changes the time left; the UI never sends an event that is invalid for the phase; a script made only of UI inputs that are not Light, Pause, Resume or confirm leaves the engine state exactly where time alone puts it. | R1.4, R5, R6.4, R6.5, R6.6 |
| P6 | **Settings document.** `parseSettings(serializeSettings(s))` equals `s` for every valid settings value (identity); `parseSettings` of arbitrary text, of arbitrary JSON, and of a mutation of a valid document never throws and always returns settings in range, keeping each valid field and defaulting the others; unknown fields are dropped; `serializeSettings(parseSettings(x))` is a fixed point (a second pass gives the same text); a default length outside 5 to 90 is never stored. | R11.4, R11.5 |
| P7 | **Announcer.** For any session and any set of times at which the announcer is called (one per second, one per frame, only a few, with long gaps, with a hidden tab): the multiset of state-change messages is the same whatever the call times; the number of messages over the whole session is at most the number of state changes plus 4; milestones are announced at most once each per session and never after a pause, resume or reload that already announced them; when several milestones are crossed between two calls only the latest is said; nothing is announced while `paused` except the pause itself; `hide` and `show` give no message. A refusal of Light gives exactly one message; a press of T gives exactly one message and is not counted in the bound. The messages come from the table in `strings.ts`. | R9.3, R9.4, R9.5 |
| P8 | **No UI input changes time.** For any generated engine script, the state after the script is deeply equal whether or not arbitrary UI-only inputs (opening and closing the dialog and the settings panel, changing settings, typing in the fields, Tab, key presses that have no action, and, from `ghosts-and-graveyard`, switching the view, the Details_Card inputs, focus moves between Items and the ghosts toggle) were interleaved between the events. *(Amended by ghosts-and-graveyard task 1, CR4: the view switch, card inputs, focus moves and the ghosts toggle are UI-only ops.)* | R1.2, R6.5, R11.7 |
| P9 | **Pause allowance (engine).** `pauseLeftMs(state, now)` is in `[0, PAUSE_LIMIT_MS]` for every state, `now` (including `NaN`, infinite and negative) and script; it is 0 in every phase but `paused`; while `paused` it never increases as `now` grows, equals `pausedAt + (PAUSE_LIMIT_MS - pausedTotalMs) - now` for `now` between `pausedAt` and the limit, and is 0 from the limit instant on; if it is greater than 0 the state is still `paused` after a `tick` at the same `now`, and a state that a `tick` has snuffed had 0; calling it changes nothing. Lives in `src/engine/` (`selectors.prop.test.ts`) and uses the engine's own generators. | R5.6 |
| P10 | **Layout geometry.** For every viewport width from 360 to 2560 and height from 640 to 1440 (integers; also the four named sizes), the pure placement function gives rectangles that: lie inside the viewport; are at least 44 by 44 (the labelled wide buttons wider); keep at least 4 px between each other within each set that is on screen together (the idle and ended set: chooser, intent, Light, Settings, time text, status line; the running set: Pause, Let it go dark, Settings, time text, status line); keep at least 6 px from the candle column and 1 px from the window pane for every setup control; put the setup controls above the floor line, the chooser above the intent field, and the intent field before Light in reading order; put every zone control, the time text and the status line wholly inside the zone, in the order Pause, time text, Let it go dark, Settings from left to right; put the time text inside `.zone-text-area` and the status line clear of every button; keep the left edge band below y = 300 room units free; intersect none of the keep-clear rectangles `DOOR_RECT` (x 20..100, y 805..890 room units) and the ghost cells (x 10..100 and x 500..590, y 215..785 room units) *(Amended by ghosts-and-graveyard task 1, CR5)*; and place **nothing persistent above the floor line while a session runs**. The Tab order (the DOM order of the visible controls) equals their reading order. The placement reproduces the exact rectangles of R8.6 at 360 by 640 and 1280 by 800, and its constants equal those of `src/scene/constants.ts`. Lives in `src/ui/layout.prop.test.ts`. | R8.2 to R8.7, R10.6 |

Example-based unit tests (not property-based) cover: `formatTime` at 0, 1, 999, 1000, 1001 ms, `60_000`, `12:30.1`, and `90:00`; `parseLength` at 4, 5, 90, 91, ` 25 `, `025`, `2 5`, `25.0`, `+25`, `2e1`, an Arabic-Indic digit text; the announcer over a 25-minute session at 1 s ticks (exactly: lit, 75 percent, 50 percent, 25 percent, one minute, burned out) and over the same session with one tick every 10 minutes; the key map table row by row; the settings defaults and each fall-back; the contrast of every text colour and of the focus indicator against the published bounds (the numbers in R7.6 and R13.3); the stylesheet containing the reduced-motion rule and no `outline: none` without a replacement; the purity test of R1.5; the scan for the forbidden word (R1.8); and a check that every key used by `strings` is defined and that no user-visible string literal sits outside `strings.ts` in `src/ui/`.

## Playwright tests (not property-based)

Files in `e2e/`: `controls.spec.ts` (sessions and keys), `controls-layout.spec.ts` (geometry and the keep-clear rule), `controls-a11y.spec.ts` (roles, names, live region, focus), `settings.spec.ts`, `controls-screenshots.spec.ts`. They use `page.clock`, fixtures from `e2e/scene-fixtures.ts`, and the scene's data attributes to check that the controls and the flame agree.

- **E1. Whole sessions by keyboard** (R15.4 a to e), at desktop; and **E1b** by touch taps at phone size. At each step: the engine's stored session in `localStorage` (parsed with the engine), `data-phase` and `data-flame` on `#scene`, the time text, the focused element's accessible name.
- **E2. Time text.** At fixed clock points through a 25-minute session (start, 12:31 left, the quarter marks, 59 s, 1 s, the end) the text equals the expected value, sits wholly inside `.zone-text-area`, is written only when it changes (counted with a `MutationObserver`), and keeps its value while paused. The text colour is read and checked against R7.6 in `lit-start`, `lit-last-minute`, `burned-out` (dawn) and `idle`.
- **E3. Layout.** (Rectangles are read from the real page and compared with the pure placement function and the rectangles of R8.6.) For each of the four viewports and each phase (`idle`, `lit-start`, `lit-half`, `lit-last-minute`, `paused`, `burned-out`, `snuffed`), with the dialog closed and then open and then the settings open: no scrollbar; every control inside the viewport, at least 44 by 44 on the phone, not overlapping another; no control or text box intersects `.candle`, `.flame-shape` or `.halo`, `DOOR_RECT` or a ghost cell *(Amended by ghosts-and-graveyard task 1, CR5)*; every control is in the reserved edges or the zone; the pool rule of Q2 as decided.
- **E4. Focus.** The table in R10.5, row by row; after every keystroke of a scripted keyboard walk the focused element is visible, inside the viewport and not removed; a visible indicator on each focusable element (a pixel check of the ring against its surroundings, at least 3:1); the dialog traps Tab and Shift+Tab; Esc and Keep burning restore focus.
- **E5. Keys.** Ctrl+Enter, Alt+Space and a held Space do nothing; Space on a focused Settings button opens the settings and does not pause; Enter in the intent field lights; Esc with the settings open closes them and does not open the dialog.
- **E6. Accessibility tree.** `locator.ariaSnapshot()` for each state and each overlay, compared to stored snapshots written by hand in the test (roles, names, states); the live region content recorded over a whole session by a `MutationObserver`: the messages are exactly the expected ones, none per second, none while paused, the same list with the clock run in one jump as in one-second steps; the scene's label never contains the time.
- **E7. Settings.** Each setting changed, the page reloaded, the setting kept; the default length is the chooser's first selection; invalid stored settings give defaults; `localStorage` that throws on read and on write leaves the page working; changing a setting during a lit session changes neither the timer nor `data-phase`.
- **E8. Visibility.** In a lit session the page is made hidden and visible again (by redefining `document.visibilityState` and dispatching `visibilitychange` in the test) and the stored session shows one distraction while the time left is unchanged; a session stored with an open hide is closed by `syncVisibility` on load; hide and show change no text, focus or announcement.
- **E9. Reduced motion.** With reduced motion on, no CSS transition or animation runs while an overlay opens or closes or a switch changes (`getAnimations()` is empty); with it off, any that runs is under 200 ms and none touches the time text.
- **E10. First visit.** With nothing stored the one-line instructions show and name the three keys; after a first session is lit they are gone, and they stay gone after the session ends and after a reload.
- **E11. Text and strings.** On every state and overlay, every visible text node is in `strings.ts` (or is a formatted time or the user's own intent), and the word "Pomodoro" is absent from the page.
- **E13. T and the pause allowance.** T in a lit session adds exactly one message to the live region, with the time in words; pressed twice it adds two; typing "t" in the intent field adds none and types the letter; in a paused session the status line shows `Pause left` counting down while the time text stays still, and the engine snuffs the session when it reaches zero.
- **E14. Keyboard and touch sessions on the layouts.** The whole-session scripts of E1 and E1b run at 360 by 640 (compact, touch) and 1280 by 800 (wide, keyboard); at each step the rectangles of the visible controls match R8.6, and no control rectangle intersects the rectangles of `.candle`, `.flame-shape`, `.halo` (read from the page) or the window pane. While a session runs, the page has no visible control above the floor line (every control rectangle is below `.zone-text-area`'s top).
- **E12. The existing suites.** The scene's own e2e tests (with the pixel test changed as in R15.2) and the smoke test pass.

Screenshots: the 21 retaken `candle-*` files and the new `controls-*` files of R15.3.

## Changes outside the new folders

- `src/main.ts`: builds the interface, passes `dispatch` to it, wires visibility (R12), reads and saves settings.
- `src/strings.ts`: all the new text.
- `src/engine/`: one additive pure selector, `pauseLeftMs`, in `selectors.ts`, exported from `index.ts`, with its tests (P9) and an item in the session-engine Decisions (done in the design phase); no other engine change.
- `src/storage/`: the settings adapter and the pure `parseSettings` / `serializeSettings`; the storage tests; no change to the session or history code.
- `e2e/scene.spec.ts`: the zone-clear test (R15.2). `e2e/screenshots.spec.ts` is rerun.
- `.kiro/steering/structure.md`: updated at the end (the `ui/` folder, the settings key). The `scene.md` rules already apply to the new CSS because it matches `**/*.css`.
- The scene: no change (R1.1). The engine: the one selector above and nothing else.

## Out of scope

- Ghosts, their drift, the graveyard and the shelf, the door on the left and the second view, hover details (`ghosts-and-graveyard`). This spec only stores the ghosts setting and keeps the left edge, `DOOR_RECT` and the ghost cells clear. *(Amended by ghosts-and-graveyard task 1, CR5, CR6.)*
- Sound itself and the page title, including the chime and the sound toggle's effect (`sound-and-title`). This spec stores the sound setting and exports `formatTime`.
- Fonts, hosting and deployment (`hosting`).
- Any change to the engine's events, phases or time math (the additive selector `pauseLeftMs` excepted), or to the scene's look or geometry.
- Browser notifications, accounts, a task list, statistics, themes (brief section 9).
- A tour, a tutorial or a cutscene.

## Decisions

Review answers to the open questions of the first draft. Each is applied in the requirement named.

- **Q1. The stage does not move; the layout is two layouts (R8).** No change to the scene's `preserveAspectRatio`. While idle (no flame, a small pool) and in the ended phases, the setup controls (length chooser, intent field, Light) sit in the dark upper room, clear of the candle column and the window, with 44 px targets at 360 by 640. While a session runs, persistent UI is only the floor-band zone: the time text plus Pause or Resume and Let it go dark for touch, which fit 360 by about 80 px with 44 px targets. The layouts for 360 by 640 and 1280 by 800 are stated in R8.6. *First version of the Settings opener (a top-right corner button) was replaced at the design review; see Design review change 1 below.* An error message for the custom length cannot fit beside the field in the upper room, so it is shown in the status line (R2.5).
- **Q2. Yes (R8.3, R8.4, R8.8).** The no-cover rule applies to persistent controls and the time text. The snuff dialog and the settings panel are exempt while open; they are still placed away from the flame and halo where there is room.
- **Q3. Yes (R4.4).** No break countdown. The status line says "The wax cools." while `isBreak`; Light skips the break.
- **Q4. Yes (R5.4, R5.6, R1.1).** A pure engine selector `pauseLeftMs`, recorded in the session-engine Decisions (design item 10, requirements note) as an addition required by this spec, with its own unit tests and property P9. The pause allowance is shown as text while paused.
- **Q5. Yes (R9.5, R10.2, R10.3).** The T key announces the time left.
- **Q6. Yes (R11.1, R11.7).** Defaults: sound on, ghosts on, default length 25. "Sound on" means sound is allowed; nothing plays before the first user gesture (brief section 7). An unreadable settings document is read as defaults and copied to `candlewatch:settings:unreadable` before the first write over it, as for the session and history (changed in batch 2, on the owner's instruction; it first said "without a backup copy").
- **Q7. Yes (R14.2).** The first-visit line is shown while the history is empty and the phase is `idle`; no extra storage key.
- **Q8. Yes (R15.6).** This spec's code tasks may run before `ghosts-and-graveyard`; the left edge band below y = 300 room units is kept free for its door.

## Design review (approved with two changes)

Review of `design.md`; both changes are applied in the requirements above and in the design (section 17).

- **Change 1. No exception for the Settings button (R8.1, R8.2, R8.4, R8.6, R8.7, P10).** The Settings opener moves from the top-right corner into the floor-band zone with the other zone controls (time text and status line, Pause or Resume, Let it go dark, Settings). So no persistent control ever sits in the light pool, at any size or wax height. The zone was re-checked at 360 by 640 with 44 px targets: 80 px tall, with the buttons at y 578..622 at x 8..52, 256..300 and 308..352, the time text centred at x 180 (36 px, y 562..598), and a status line 136 px wide while the buttons are shown. The cost: a narrower status line while running (136 px, up from 228), and two lines of status text in the idle and ended phases. This replaces the earlier pool-overlap analysis, which is dropped.
- **Change 2. Tab order equals the visual order in every layout (R8.5, R10.6, P10, E4).** In the compact layout the length chooser is drawn above the intent field, as in the wide layout (a row of four cells at the top of the viewport, then the intent field and Light). The cost: the compact intent field is 128 px wide at 360 by 640 (it was 292), because the window pane sits between it and Light.
