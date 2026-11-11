# Requirements Document

## Introduction

This spec implements `docs/BRIEF.md` spec plan item 6 for Candlewatch: the three Web Audio cues, the page-title countdown, the background-tab tick that keeps both honest, and the final wording of the strings file. It also follows brief sections 4 (the dawn and its chime), 6 (flavour text) and 7 (sound, generated in code, off until the first user gesture). It builds on the finished `session-engine`, `distraction-tracking`, `candle-scene` and `controls-and-access` specs and on `ghosts-and-graveyard`. It does not redefine them.

Fixed inputs from the existing specs and code:

- The engine is pure: `step(state, event, now) -> state`. Its phases are `idle`, `lit`, `paused`, `burned-out` and `snuffed`. A `reload` event and a `tick` event only settle. Every other event settles first. The engine is not changed by this spec.
- `main.ts` owns the clock and the one `dispatch(event, now)` through which every event reaches `step` (`controls-and-access` R1.2). The first `reload` step runs before `dispatch` exists, so a transition found there never passes through `dispatch`.
- `main.ts` redraws on `requestAnimationFrame`, which browsers pause in hidden tabs. Time is computed from timestamps, so the timer is right when the tab comes back, but nothing redraws, retitles or sounds in the meantime.
- `controls-and-access` stores `settings.sound` (default on) and says "sound on" only allows sound: nothing plays before the first user gesture (Decision Q6, R11.7). It exports `formatTime` and says this spec does not change it (R7.7).
- `controls-and-access` and `candle-scene` both leave the chime and the title to this spec. `ghosts-and-graveyard` leaves its wording as placeholders (its design section 4.7 and its Open Questions).
- The distraction wiring (`wireVisibility`) turns `visibilitychange` into `hide` and `show` events through `dispatch`. This spec leaves that wiring unchanged.
- `render.yaml` already allows what this spec needs: Web Audio makes no network request and loads no file, so the Content-Security-Policy does not change.
- The costume rule applies to every new element: each cue shows exactly one state change and nothing is decoration. Sound is never the only signal, because every state change a cue marks is already drawn and announced.

The requirements fix constraints. The cue recipes (frequencies, envelopes, noise shaping), the module layout, the hidden-tick mechanism and the title wording details are settled in the design from the rules here.

## Glossary

- **Cue**: one of three sounds: `strike` (the match), `chime` (the dawn) or `breath` (the snuff).
- **Cue_Spec**: a pure, plain-data description of one Cue: its voices (oscillators or seeded noise), filters, envelopes and total duration. It holds no Web Audio object.
- **Cue_Context**: the values `cueFor` needs besides the two states: the event type, the `sound` setting, and `now`.
- **cueFor**: the pure function `cueFor(prev, next, context) -> Cue | null`.
- **Transition**: the pair (prev, next) of states around one call of `step` inside `dispatch`.
- **Live_Transition**: a Transition produced by `dispatch` for any event except `reload`.
- **Reload_Settle**: the first `reload` step in `main.ts` that restores the stored session and settles it with the clock at page load. It is not a Live_Transition.
- **Audio_Player**: the thin adapter that turns a Cue_Spec into Web Audio nodes. It is the only code that touches `AudioContext`.
- **First_Gesture**: the first user input of a kind the browser accepts as activation: a key press, a pointer press or a touch end.
- **Unlocked**: the state of the Audio_Player after a First_Gesture while `settings.sound` is on, when the `AudioContext` exists and its state is `running`.
- **Late_Cue_Limit**: the greatest lateness, in milliseconds, at which an end cue still plays: 120000 ms (two minutes).
- **Hidden_Tick**: the timer that runs only while the page is hidden and sends `tick` events through `dispatch`.
- **Wake_Delay**: the pure result of `nextWakeMs(state, now)`: the delay in milliseconds until the Hidden_Tick next needs to run, or null when no tick is needed.
- **Visible_Loop**: the existing `requestAnimationFrame` loop in `main.ts`.
- **Page_Title**: the value of `document.title`.
- **titleFor**: the pure function `titleFor(state, now) -> string`.
- **Title_Time**: the `mm:ss` part of the Page_Title, produced by `formatTime(timeLeftMs(state, now))`.
- **Time_Text**: the on-screen time left of `controls-and-access` R7.
- **Strings_Table**: the table in the design that lists every string this spec finalises, with its key, final wording and the spec it came from.
- **Fake_AudioContext**: a recording stand-in for `AudioContext`, injected by a Playwright init script or a Vitest test. It is never part of shipped code.
- **PROP_PARAMS**: the shared fast-check settings (300 runs) exported by the engine test kit.
- **Costume_Reviewer**: the `costume-reviewer` agent, run in the Kiro CLI.

## Requirements

### Requirement 1: Boundaries and wiring

**User Story:** As a maintainer, I want sound and the title to read state and never write time, so that the timer cannot disagree with what the user sees or hears.

#### Acceptance Criteria

1. THE sound-and-title code SHALL read state only through `src/engine/index.ts` and `formatTime` from `src/ui/format.ts`, and SHALL NOT compute time left, wax or pause totals itself.
2. THE pure modules `cueFor`, the Cue_Specs, `titleFor` and `nextWakeMs` SHALL import nothing from the DOM, `window`, `document`, `localStorage`, `Date`, `Math.random`, `AudioContext` or the clock, and SHALL return the same output for the same input on every call.
3. THE purity test SHALL fail IF any module named in R1.2 contains an import or a reference to any of the names listed in R1.2, and it SHALL enforce R1.2 in the same way as the engine's, the scene's and the interface's purity tests.
4. THE Audio_Player SHALL be the only code that touches `AudioContext`, and one title adapter SHALL be the only code that writes `document.title`.
5. THE Hidden_Tick source SHALL be the only code that starts or clears the background timer, and it SHALL read `now` from the clock that `main.ts` owns and not from `Date` directly.
6. WHEN `dispatch` calls `step` once for an event, THE `dispatch` function SHALL choose the Cue from the Transition (the state before and after that single `step` call), and no button, key or settings handler SHALL choose a Cue.
7. THE sound-and-title code SHALL send no engine event of its own except `tick` from the Hidden_Tick, and every `tick` SHALL go through the same `dispatch` as every other event.
8. THE sound-and-title code SHALL NOT change the engine, the scene model, the history document, the session document or the settings document, and the stored form of each of these documents SHALL be byte-identical before and after this spec for the same inputs.
9. THE sound-and-title code SHALL add no sound file, no font, no network request, no new runtime dependency and no new test dependency.
10. THE sound-and-title code SHALL place all user-visible text in `src/strings.ts`, and no other file in the spec's source SHALL contain a string literal shown to the user.
11. THE spec's source, tests and documents SHALL contain the trademarked timer word (case-insensitive) nowhere, and every text that names a session SHALL say "focus session".

### Requirement 2: Choosing the cue

**User Story:** As a user, I want a sound only when the candle really changes state, so that every sound means something.

#### Acceptance Criteria

1. THE function `cueFor(prev, next, context)` SHALL be pure and total, and SHALL return exactly one of `strike`, `chime`, `breath` or null for every input.
2. WHEN a Live_Transition goes from `idle`, `burned-out` or `snuffed` to `lit`, THE cueFor SHALL return `strike`.
3. WHEN a Live_Transition goes from `lit` or `paused` to `burned-out`, THE cueFor SHALL return `chime`.
4. WHEN a Live_Transition goes from `lit` or `paused` to `snuffed`, THE cueFor SHALL return `breath`, whether the user snuffed the candle or the pause limit did.
5. WHEN a Live_Transition is `lit` to `paused`, `paused` to `lit`, or any change that keeps the phase, THE cueFor SHALL return null.
6. WHEN the event type of the Cue_Context is `reload`, THE cueFor SHALL return null.
7. WHILE the `sound` setting of the Cue_Context is off, THE cueFor SHALL return null.
8. THE cueFor SHALL return at most one Cue for one Transition.
9. THE break after a burned-out session SHALL NOT start or end with a Cue.
10. WHEN the page loads, THE main.ts wiring SHALL pass the Reload_Settle no further than `step`, so that a candle that burned out while the page was closed plays no Cue.
11. IF a Live_Transition to `burned-out` or `snuffed` is found more than the Late_Cue_Limit (120000 ms) after the `endedAt` of the next state, THEN THE cueFor SHALL return null.
12. WHEN a Live_Transition to `lit` is found, THE cueFor SHALL return `strike` whatever the delay, because the Late_Cue_Limit does not apply to `strike`; lighting is always found in the instant of the user's action.
13. THE cueFor SHALL read the `sound` setting from the Cue_Context at the moment of the Transition, so that a change of the setting never replays or cancels a Cue for an earlier Transition.
14. WHEN the `sound` setting is turned on or off, THE page SHALL send no engine event, play no Cue and change neither the timer nor the distraction count.

### Requirement 3: The three sounds

**User Story:** As a user, I want three short, quiet sounds that each fit their moment, so that sound helps without startling me.

#### Acceptance Criteria

1. THE `strike` Cue_Spec SHALL describe a match strike made of two voices in order: a scratch voice of seeded noise lasting 40 ms to 150 ms, followed by a flare voice with a tonal partial between 80 Hz and 220 Hz that starts no earlier than the start of the scratch voice and no later than the end of the scratch voice.
2. THE `chime` Cue_Spec SHALL describe a soft chime with at least two tonal voices at different frequencies between 200 Hz and 2000 Hz, each with a decay (time from peak to gain 0) of at least 600 ms, so that it can be told from the other two Cues by ear.
3. THE `breath` Cue_Spec SHALL describe a breath made only of filtered-noise voices, with no tonal voice, where the filter cutoff frequency at the end of the voice is at least 30% lower than at its start and the voice level falls from its peak to gain 0.
4. THE Cue_Spec of each Cue SHALL be plain data (numbers, strings and arrays only, with no functions, no `AudioContext` nodes and no file references) and SHALL describe every voice as an oscillator or a seeded-noise source, so that no sound is loaded from a file.
5. THE Cue_Spec noise SHALL come from a seeded generator, so that two calls for the same Cue return deeply equal data and the noise samples (if present in the data) are identical on every call.
6. THE Cue_Spec duration SHALL NOT exceed 700 ms for `strike`, 2500 ms for `chime` and 1200 ms for `breath`, and SHALL be greater than 0 ms for each.
7. THE Cue_Spec peak level SHALL NOT exceed 0.2 of full scale after the master gain is applied, the peak level of each voice SHALL be greater than 0, and the master gain SHALL be one named constant with a value greater than 0 and at most 1.
8. THE voice envelope of each Cue_Spec voice SHALL start and end at gain 0, with a rise of at least 5 ms from gain 0 to its peak and a fall of at least 20 ms from its peak to gain 0, so that no click is heard.
9. THE envelope times of each voice SHALL lie inside the range 0 ms to the Cue_Spec duration (both included) and SHALL be in non-decreasing order.
10. THE three Cue_Specs SHALL have three different `id` values and three different durations.
11. THE Cue_Spec data of each Cue SHALL be deeply equal whether `prefers-reduced-motion` is set to `reduce` or to `no-preference`, because sound is not motion.
12. THE design SHALL record the recipe of each Cue (voices, frequencies, envelopes, filters) as a decision.

### Requirement 4: The audio adapter and the first gesture

**User Story:** As a user, I want nothing to play until I have acted on the page, so that the page never makes a sound by surprise.

#### Acceptance Criteria

1. THE Audio_Player SHALL NOT create, resume or start any `AudioContext` before the First_Gesture.
2. WHEN the First_Gesture happens while the `sound` setting is on, THE Audio_Player SHALL create the `AudioContext` and call `resume()` on it synchronously inside that gesture's event handler.
3. WHEN the First_Gesture is the action that lights the candle, THE Audio_Player SHALL be Unlocked before the `strike` is requested, so that the `strike` is started at the first Light.
4. THE Audio_Player SHALL listen for the First_Gesture on the document for `keydown`, `pointerdown` and `touchend` events, and SHALL remove all three listeners within the same event dispatch in which it becomes Unlocked.
5. WHEN the user turns the `sound` setting on, THE Audio_Player SHALL treat that action as a First_Gesture and, if it is not yet Unlocked, SHALL unlock inside that action.
6. WHILE the `sound` setting is off, THE Audio_Player SHALL create no `AudioContext` and SHALL start no Cue.
7. WHEN the `sound` setting is turned off while a Cue is sounding, THE Audio_Player SHALL silence that Cue within 50 ms.
8. IF a Cue is requested before the Audio_Player is Unlocked, THEN THE Audio_Player SHALL drop the Cue, SHALL NOT queue it for a later gesture and SHALL NOT start it after the First_Gesture.
9. WHEN a Cue is requested and the `AudioContext` state is not `running`, THE Audio_Player SHALL call `resume()` exactly once and, IF the state is still not `running` after that call settles, THEN THE Audio_Player SHALL drop the Cue.
10. WHEN a Cue is requested while another Cue is sounding, THE Audio_Player SHALL fade the earlier Cue to silence within 50 ms and start the new one, so that at most one Cue sounds at any instant after the 50 ms fade.
11. WHEN a Cue ends or is stopped, THE Audio_Player SHALL stop and disconnect every node it created for that Cue.
12. IF `AudioContext` is missing, blocked or throws, THEN THE Audio_Player SHALL stay silent for the rest of the page's life, SHALL show no error to the user and SHALL leave the timer, the scene and the page title unchanged.
13. THE Audio_Player SHALL take its `AudioContext` factory as an argument, so that tests can inject a Fake_AudioContext without any test-only hook in shipped code.
14. WHEN the page loads with a stored `lit` session, THE Audio_Player SHALL remain not Unlocked until a First_Gesture, and IF a Cue is requested for a Transition before that gesture, THEN THE Audio_Player SHALL drop it (R4.8).
15. THE Audio_Player SHALL NOT use a sound file, an `<audio>` element or a network request.
16. THE Audio_Player SHALL attach its First_Gesture listeners (`keydown`, `pointerdown` and `touchend`) to the document in the capture phase, so that they run before the handlers of the controls and the gesture that lights the first candle unlocks audio in time for its own `strike`.
17. THE Escape key press SHALL NOT be required to count as a First_Gesture, because confirming the snuff dialog is an Enter key press or a click, and both count.

### Requirement 5: Background tabs

**User Story:** As a user who switches to another tab, I want the title to keep counting and the chime to sound when the candle burns out, so that I know the watch is over without looking.

#### Acceptance Criteria

1. WHILE the page is hidden and the phase is `lit` or `paused`, THE Hidden_Tick source SHALL send `tick` events through `dispatch`, each with `now` read from the clock at the moment the timer callback runs.
2. WHILE the page is hidden and the phase is `lit` or `paused`, THE Hidden_Tick source SHALL arm a timer with a delay of at most 1000 ms after every tick, so that a tick runs at least once every 1000 ms plus the lateness the browser adds.
3. THE pure function `nextWakeMs(state, now)` SHALL return a Wake_Delay greater than 0 ms and not greater than 1000 ms while the phase is `lit` or `paused`, and `null` in every other phase (`idle`, `burned-out`, `snuffed`).
4. WHILE the phase is `lit`, THE Wake_Delay SHALL NOT be longer than the time left, with a minimum of 1 ms when the time left is under 1 ms, so that a tick runs at the burn-out moment and not a second later.
5. WHILE the phase is `paused`, THE Wake_Delay SHALL NOT be longer than the pause allowance left, with a minimum of 1 ms when the allowance left is under 1 ms, so that a tick runs at the pause-limit moment.
6. WHEN a hidden timer fires before the burn-out or pause-limit moment, THE Hidden_Tick source SHALL send the `tick`, read the new Wake_Delay and arm the next timer, so that an early timer never loses the end.
7. WHEN the Hidden_Tick settles the session to `burned-out` while the page is hidden, THE `chime` SHALL play at that tick if R2 and R4 allow it, and SHALL play exactly once for that session.
8. WHEN the Hidden_Tick settles the session to `snuffed` because the pause limit passed while the page is hidden, THE `breath` SHALL play at that tick if R2 and R4 allow it, and SHALL play exactly once for that session.
9. WHEN a hidden timer runs late because the browser throttled it, THE engine SHALL settle by timestamps, THE Page_Title and the Cue SHALL follow at the late tick, and the time left SHALL equal the end time minus `now`, clamped to 0, whatever the lateness.
10. WHEN the page becomes visible, THE Hidden_Tick source SHALL clear its pending timer, THE Visible_Loop SHALL resume, and the first visible frame SHALL paint from the settled state.
11. WHILE the page is visible, THE Hidden_Tick source SHALL NOT have a pending timer and SHALL NOT send `tick`, so that no second tick source competes with the Visible_Loop.
12. WHEN the page loads while hidden, THE Hidden_Tick source SHALL start after the Reload_Settle and the visibility sync have completed, if the phase is `lit` or `paused`.
13. WHEN the phase leaves `lit` and `paused`, THE Hidden_Tick source SHALL clear its pending timer and SHALL NOT arm another.
14. THE Hidden_Tick source SHALL send only `tick`, and the engine state after a hidden interval SHALL equal the engine state that the same events give without the extra ticks followed by one `tick` at the last `now`.
15. THE Hidden_Tick source SHALL leave `hide` and `show` exactly as they are today: `wireVisibility` SHALL still deliver each to the engine through `dispatch`, once per `visibilitychange`, and in the same order relative to the clock.
16. WHEN the page becomes hidden, THE engine SHALL receive `hide` first, and THE Hidden_Tick source SHALL arm its first timer after that.
17. WHEN the page becomes visible, THE engine SHALL receive `show` first, and THE Hidden_Tick source SHALL clear its timer after that.
18. THE `tick` events of the Hidden_Tick SHALL NOT open, close or change any hide span, ghost span or distraction count.
19. THE Hidden_Tick source SHALL cause no announcement that the Visible_Loop would not cause, and the announcement bound of `controls-and-access` R9.4 SHALL hold unchanged.
20. WHILE the page is hidden, THE Hidden_Tick source SHALL settle the state, play any due Cue and update the Page_Title only, and SHALL NOT paint the scene or the interface, because a hidden page shows nothing.
21. THE design SHALL record the timer mechanism, the Wake_Delay rule and the effect of browser throttling as a decision.
22. IF the browser limits hidden timers to one run per 60000 ms, THEN THE page SHALL still show the right time on return, and a late end Cue SHALL play only if the lateness is at most the Late_Cue_Limit (120000 ms) and SHALL NOT play if the lateness is greater.
23. THE Hidden_Tick source SHALL use a plain timer and SHALL NOT play a silent keep-alive audio source or schedule a Cue on the audio clock.

### Requirement 6: The page title

**User Story:** As a user in another tab, I want the tab title to show the time left, so that I can check the candle without leaving my work.

#### Acceptance Criteria

1. WHILE the phase is `idle`, THE Page_Title SHALL be exactly the product name from `STRINGS.title`.
2. WHILE the phase is `lit`, THE Page_Title SHALL be the Title_Time, then the separator " · " (a space, U+00B7, a space), then the product name, in the form "12:31 · Candlewatch".
3. WHILE the phase is `paused`, THE Page_Title SHALL be the Title_Time, a space, the paused word from `src/strings.ts`, the separator " · " and the product name, in the form "12:31 paused · Candlewatch".
4. WHILE the phase is `burned-out`, THE Page_Title SHALL be the dawn word from `src/strings.ts`, the separator " · " and the product name, in the form "Morning · Candlewatch", with no Title_Time.
5. WHILE the phase is `snuffed`, THE Page_Title SHALL be the dark word from `src/strings.ts`, the separator " · " and the product name, in the form "Dark · Candlewatch", with no Title_Time.
6. THE forms of R6.2 to R6.5 SHALL come from `src/strings.ts` as templates filled by the title code, and THE title code SHALL contain no literal copy of the paused, dawn or dark words.
7. THE Title_Time SHALL equal `formatTime(timeLeftMs(state, now))` for the same state and `now` as the Time_Text of that frame.
8. THE Page_Title SHALL NOT show a time that differs from the Time_Text computed at the same `now`.
9. THE Page_Title SHALL NOT include the intent or any text the user typed, in any phase.
10. IF the string computed for `document.title` is equal to the string the title adapter last wrote, THEN THE title adapter SHALL NOT write `document.title`.
11. WHILE the phase is `lit` or `paused`, THE title adapter SHALL write `document.title` at most once for each distinct Title_Time value, because `formatTime` rounds up to whole seconds (at most 1 write per second of time left).
12. WHEN the phase changes, THE title adapter SHALL write the new form in the same synchronous call that applies the change, before the next frame is drawn and without waiting for the next tick.
13. WHILE the page is hidden, THE Page_Title SHALL be updated by the Hidden_Tick (R5.20), so that the Title_Time in the tab strip is at most one Hidden_Tick interval behind the Time_Text that would be shown at the same `now`.
14. WHEN the page loads with a stored session, THE title adapter SHALL write the Page_Title exactly once, from the Reload_Settle state, before the first frame is drawn.
15. THE Page_Title SHALL show one piece of state only per form: time left while `lit`, time left and the pause while `paused`, completion while `burned-out`, abandonment while `snuffed`.
16. THE `index.html` title SHALL be exactly "Candlewatch", so that the page has a title before the script runs.
17. THE `titleFor` function SHALL be pure and total over every phase, SHALL NOT read the clock, `document` or storage, and SHALL return the same string for equal inputs.
18. WHILE the Graveyard_View is open, THE Page_Title SHALL follow the phase exactly as in every other view, because the view does not change the phase.

### Requirement 7: Sound setting and accessibility

**User Story:** As a user who is deaf, hard of hearing or has sound off, I want nothing to depend on hearing, so that I miss no state change.

#### Acceptance Criteria

1. WHEN a Cue's state change occurs, THE page SHALL draw that state change in the scene and announce it through the live region of `controls-and-access` R9.3 in the same engine step, whether the sound setting is on or off, so that no Cue is the only signal of a state change.
2. THE page SHALL NOT announce a Cue, mention sound in the live region, or add a visible sound indicator; the live region text SHALL be identical with the sound setting on and off for the same state change.
3. THE page SHALL use the existing sound switch of the settings panel and SHALL NOT add another control for sound; the count of sound controls in the page SHALL be exactly 1.
4. THE sound switch SHALL keep its name, state and on and off text from `controls-and-access` R11.2, and WHILE the sound setting is on and the first user gesture has happened, THE sound switch SHALL cause Cues to play; WHILE the sound setting is off, THE sound switch SHALL cause no Cue to play.
5. THE page SHALL add no volume control and no setting beyond the existing three (sound, ghosts on/off, default length).
6. THE Cue SHALL map to exactly one state change each: `strike` to the wick catching (`idle` to `lit`), `chime` to the dawn (`lit` to `burned-out`), `breath` to the flame going out (`lit` or `paused` to `snuffed`); the costume table in `product.md` SHALL stay true.
7. WHERE the setting `prefers-reduced-motion: reduce` is on, THE Cues SHALL play with the same triggers, order and sound setting behaviour as when it is off.
8. THE page SHALL leave the focus position, the Tab order and the key map identical to their state before this requirement, for every state and with the sound setting on and off.
9. WHILE a session runs, THE Page_Title SHALL give assistive technology the time left through the tab or window name in addition to the Time_Text, and SHALL NOT replace the Time_Text.

### Requirement 8: Strings and flavour text

**User Story:** As a maintainer, I want every wording in one file, final and in one voice, so that the product reads as one place.

#### Acceptance Criteria

1. THE sound-and-title spec SHALL finalise every wording that `controls-and-access` and `ghosts-and-graveyard` left open: the Carved_Date, the older-stone and older-day count lines, the empty-state lines, the Overflow_Mark, the "+n more" text, the line for a session with no intent, the unknown-date line, the five Details_Card lines (the first of them a kind-specific flavour line), and the door, back, heading and announcement lines of the graveyard view.
2. THE design SHALL contain the Strings_Table listing each finalised string with its `strings.ts` key, its final wording and the spec it came from, and the table SHALL include the new page-title templates, with no finalised string missing from the table and no table row naming a key absent from `strings.ts`.
3. THE Final Wording section of this document SHALL give the wording that the Strings_Table starts from, and THE design SHALL change a starting wording only WHEN a decision recording the reason for the change is present in the design.
4. THE wording of state lines and announcements SHALL be short and dry, in the tone of brief section 6 ("The wick catches.", "The watch is over. Morning."), with each state line and announcement at most 60 characters long and ending in a full stop.
5. THE wording of data labels (the Details_Card lines other than the first, the count lines, the date) SHALL be plain and exact: each label states only the datum it names, uses no figurative wording and no exclamation mark, and shows the datum unchanged from the stored value (except the Carved_Date format of criterion 9).
6. THE strings SHALL keep the structure of `src/strings.ts`: one exported `STRINGS` object, nested groups, `{name}` placeholders filled by `fill`, and `as const`.
7. THE strings test SHALL check that every key is used by shipped source, that no value contains the trademarked timer word (case-insensitive), and that every placeholder in a template is filled by its caller, and THE strings test SHALL fail WHEN any one of these three checks finds a violation, naming the offending key.
8. THE strings SHALL contain no trademark, logo or real product name.
9. THE Carved_Date SHALL show the day without a leading zero (1 to 31) and a three-letter English month name (Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec), and SHALL show no year and no time of day.
10. FOR ALL valid Day_Keys, THE formatCarvedDate function SHALL return the day number, a single space and the month name, and FOR ALL other inputs (including null, undefined, the empty string, a malformed string and a well-formed string naming a day that does not exist) SHALL return the unknown-date line and SHALL NOT throw.
11. THE count lines SHALL have a singular form for a count of 1 and a plural form for a count of 0 or of 2 or more, and THE Overflow_Mark and "+n more" text SHALL show only the number of items not drawn, as a whole number of 1 or more, with no other digits in the text.
12. THE scene's accessible names (`STRINGS.scene`) and the time words (`STRINGS.time`) SHALL stay as they are, because they are final and tested, and THE strings test SHALL fail WHEN any value in those two groups differs from its current value.
13. THE first line of a Stone's Details_Card SHALL be `Here lies "{intent}"`, or `Here lies an unnamed watch` WHEN the intent is null, and THE first line of a Stub's Details_Card SHALL be `Burned to the end: {intent}`, or `Burned to the end: an unnamed watch` WHEN the intent is null.
14. THE first card line SHALL be flavour text that contains the exact intent, character for character with no trimming, truncation or case change, so that `ghosts-and-graveyard` P18 holds.
15. THE phrase "Here lies" SHALL NOT appear in any Item's accessible name, which stays the intent plus the date (`ghosts-and-graveyard` R7.1).

### Requirement 9: Tests, screenshots and review

**User Story:** As a developer, I want the pure rules property-tested and the sound and title seen in a real browser, so that the costume stays honest.

#### Acceptance Criteria

1. THE property tests SHALL use fast-check with `PROP_PARAMS` and the engine's generators, in `*.prop.test.ts` files colocated with the source.
2. THE unit tests SHALL cover `cueFor` for every ordered pair of distinct phases, the Late_Cue_Limit at its edge (one millisecond below, equal to, and one millisecond above the limit), each Cue_Spec's numbers (frequency, gain, start offset and duration), `titleFor` for every phase, `nextWakeMs` at its edges (zero, exactly one wake interval, and no pending wake), `formatCarvedDate` for each of the 12 months and for bad keys (empty string, wrong separator, month 00, month 13, day 00, day 32, non-numeric parts), and the Audio_Player with an injected Fake_AudioContext.
3. THE Playwright tests SHALL use a Fake_AudioContext injected by an init script, `page.clock`, and no test hook in shipped code.
4. THE Playwright tests SHALL reach every state in the model (`idle`, `lit`, `paused`, `burned-out`, `snuffed`) by keyboard or by a stored session written before the page loads, built with the engine's serializers.
5. WHEN a Playwright test emulates a hidden tab, THE Playwright tests SHALL set `visibilityState` and dispatch `visibilitychange` the way the existing visibility tests do, and SHALL stop `requestAnimationFrame` callbacks until the tab is shown again, as a browser does.
6. THE Playwright tests SHALL check that a real build served under the Blueprint's headers plays at least one Cue and records zero Content-Security-Policy violations (zero `securitypolicyviolation` events and zero console errors naming the policy).
7. WHEN this spec changes a wording drawn in a screenshot, THE tasks SHALL retake every affected `graveyard-*` and `ghosts-*` screenshot in `docs/screenshots/`, and the summary SHALL list the retaken file names.
8. THE final task of the spec SHALL be a review by the Costume_Reviewer of the finished cues and title, and its findings SHALL be recorded in the design's Decisions, each with an outcome of fixed or accepted with a reason.
9. THE Costume_Reviewer SHALL check that each Cue shows one state change, that with reduced motion on every state a Cue marks is still shown by a visible or textual change, and that the Time_Text keeps a contrast ratio of at least 4.5:1 against its background.
10. THE build tasks SHALL add entries for this spec to `KIRO_USAGE.md` in the manner of the other specs: one entry at each batch checkpoint (batches 1 to 3), and a final entry in the wrap-up task, which also covers batch 4. Each entry SHALL record the surface, what was built, any property failure with its seed, the mutation results, the screenshot checks, the costume review and the counts, as far as the batch or the whole spec has them.

## Final Wording

These are the starting wordings. The design's Strings_Table reproduces them with the real keys. Keys follow `ghosts-and-graveyard` design section 4.7.

| Key | Final wording | Came from |
|---|---|---|
| `graveyard.carvedDate` | `{day} {month}` (shows "10 Nov") | ghosts-and-graveyard R2.11 |
| `graveyard.months` | Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec | ghosts-and-graveyard design 4.7 |
| `graveyard.unknownDate` | Date worn away | ghosts-and-graveyard design 4.7 |
| `graveyard.noIntent` | Unnamed watch | ghosts-and-graveyard R4.3 |
| `graveyard.itemName` | `{intent}, {date}` | ghosts-and-graveyard R7.1 |
| `graveyard.noStones` | Nothing is buried here. | ghosts-and-graveyard R4.9 |
| `graveyard.noStubs` | The shelf is bare. | ghosts-and-graveyard R4.9 |
| `graveyard.olderStone` | `{n}` older stone out of sight | ghosts-and-graveyard R8.8 |
| `graveyard.olderStones` | `{n}` older stones out of sight | ghosts-and-graveyard R8.8 |
| `graveyard.olderDay` | `{n}` older day out of sight | ghosts-and-graveyard R8.9 |
| `graveyard.olderDays` | `{n}` older days out of sight | ghosts-and-graveyard R8.9 |
| `graveyard.more` | +`{n}` more | ghosts-and-graveyard R8.5 |
| `ghosts.overflow` | +`{n}` | ghosts-and-graveyard R9.13 |
| `graveyard.card.stoneLine` | Here lies "`{intent}`" | sound-and-title R8.13 |
| `graveyard.card.stubLine` | Burned to the end: `{intent}` | sound-and-title R8.13 |
| `graveyard.card.unnamed` | an unnamed watch (fills `{intent}` in the two lines above, without quotes on the stone line) | sound-and-title R8.13 |
| `graveyard.card.planned` | Length: `{time}` | ghosts-and-graveyard R5.1 |
| `graveyard.card.distractions` | Distractions: `{n}` | ghosts-and-graveyard R5.1 |
| `graveyard.card.away` | Time away: `{time}` | ghosts-and-graveyard R5.1 |
| `graveyard.door` | Walk out to the graveyard | ghosts-and-graveyard R7.11 |
| `graveyard.back` | Back to the room | ghosts-and-graveyard design 4.7 |
| `graveyard.title` | The graveyard | ghosts-and-graveyard R7.9 |
| `graveyard.graveyardLabel` | Graveyard | ghosts-and-graveyard R7.5 |
| `graveyard.shelfLabel` | Shelf | ghosts-and-graveyard R7.5 |
| `graveyard.announceOpen` | The graveyard. Quiet. | ghosts-and-graveyard R7.10 |
| `graveyard.announceLeave` | Back in the room. | ghosts-and-graveyard R7.10 |
| `count.distraction`, `count.distractions` | `{n}` distraction, `{n}` distractions | ghosts-and-graveyard R10.1 |
| `pageTitle.lit` | `{time} · {name}` | sound-and-title R6.2 |
| `pageTitle.paused` | `{time} paused · {name}` | sound-and-title R6.3 |
| `pageTitle.burnedOut` | Morning · `{name}` | sound-and-title R6.4 |
| `pageTitle.snuffed` | Dark · `{name}` | sound-and-title R6.5 |

The existing `status`, `announce`, `snuff`, `settings`, `scene` and `time` groups of `controls-and-access` and `candle-scene` are already final ("The wick catches.", "The watch is over. Morning.", "Let it go dark?") and are not changed.

## Property-Based Tests

Each property runs at least 300 cases through `PROP_PARAMS` and is never weakened to pass.

| ID | Property | Covers |
|---|---|---|
| P1 | For any two states, any event type and any `now`, `cueFor` returns null when sound is off, and returns null when the event type is `reload`. | R2.6, R2.7 |
| P2 | For any two states reached by any generated script, `cueFor` agrees with a reference table: strike for (idle, burned-out or snuffed) to `lit`; chime for (lit or paused) to `burned-out`; breath for (lit or paused) to `snuffed`; null for every other pair. | R2.2 to R2.5, R2.9 |
| P3 | For any generated script run through a `dispatch` that counts Cues, at most one Cue comes from each event, no Cue comes from a `reload`, and over one session there is at most one strike and at most one end Cue. | R2.8, R2.10 |
| P4 | For any `burned-out` or `snuffed` Transition, the end Cue is null exactly when `now - endedAt` is greater than the Late_Cue_Limit; a `strike` is never suppressed by lateness. | R2.11, R2.12 |
| P5 | Each Cue_Spec is equal across calls, has a duration within its bound, a peak within 0.2, voices that start and end at gain 0, envelope times inside the duration and in order, and the three differ in id and duration. | R3.4 to R3.10 |
| P6 | For any state and `now`, the time part of `titleFor` equals `formatTime(timeLeftMs(state, now))` in `lit` and `paused`, the title for `idle` equals the product name, and no title contains the session's intent. | R6.1, R6.7, R6.9 |
| P7 | For any `lit` state and any non-decreasing times, the title changes at most once per whole second of time left, and the Title_Time never increases. | R6.11 |
| P8 | For any state and `now`, `nextWakeMs` is in (0, 1000] in `lit` and `paused`, is null elsewhere, and never reaches past the burn-out or pause-limit moment. | R5.3 to R5.5 |
| P9 | For any script of events with extra `tick` events inserted at any non-decreasing times, the final engine state equals the state of the script without the extra ticks followed by one `tick` at the last `now`, and the distraction count and ghost spans are the same. | R5.14, R5.18 |
| P10 | For any sequence of gestures, Cue requests and sound-setting changes against an injected `AudioContext` factory, the factory is called at most once, never before the first gesture, and never while sound is off; a Cue sounds only when Unlocked with sound on; at most one Cue sounds at a time. | R4.1 to R4.10 |
| P11 | For any valid Day_Key, `formatCarvedDate` gives the day without a leading zero, a space and the matching month name; for any other string it gives the unknown-date line. | R8.9, R8.10 |

Example-based unit tests (not property-based) cover: the strings test of R8.7; the purity test of R1.3; `titleFor` for each phase against the forms of R6.1 to R6.5; the Audio_Player with a Fake_AudioContext that is `suspended` and one that throws; and the check that `index.html` keeps its title.

## Playwright Tests

- **E1.** No `AudioContext` is constructed before the first gesture, including with a stored `lit` session. The first Enter creates it and plays the `strike` in the same gesture.
- **E1b.** The first ever action on a fresh page is Enter on Light. The `AudioContext` is created and resumed by the capture-phase listener, and the `strike` plays for that same Enter (R4.3, R4.16).
- **E2.** A whole session by keyboard: one `strike` at Light; none at Pause or Resume; one `chime` at burn-out; one `breath` at snuff; one `breath` when the pause limit passes. Counts are exact.
- **E3.** With sound off in settings, nothing is constructed or played through a whole session. Turning sound on mid-session creates the context and plays nothing until the next Transition.
- **E4.** A stored session that burned out while the page was closed plays no Cue at load and none at the first gesture. A stored `lit` session that burns out after a reload before any gesture plays no Cue.
- **E5.** A hidden tab: with `requestAnimationFrame` stopped, the title counts down once a second and the `chime` plays at the burn-out moment; on return there is no second chime, one ghost is counted per hide and the Time_Text is right.
- **E6.** A hidden tab with the pause limit passing plays one `breath` and sets the end title; a late hidden timer (the clock jumps) obeys the Late_Cue_Limit.
- **E7.** The title through a whole session matches the forms of R6 and equals the Time_Text in the same frame at sampled clock points; it never contains the intent.
- **E8.** Reduced motion plays the same Cues as normal motion.
- **E9.** The graveyard view shows the final wording of R8 and the Final Wording table: the Carved_Date, the empty lines, the count lines for a 200-session history, the Overflow_Mark and the card lines, checked with `ariaSnapshot`.
- **E10.** A real build under the Blueprint's headers plays a Cue with no Content-Security-Policy violation and no network request.
- **E11.** Screenshots of any view whose text changed are retaken and looked at, at desktop (1280 by 800) and phone (360 by 640).

## Change Requests to Other Specs

This spec does not edit other specs. The following changes are requested and recorded here:

| ID | Target | Change | Requirement |
|---|---|---|---|
| CR1 | `controls-and-access` R1.2, design (`main.ts` wiring) | `dispatch` gains a post-step hook that receives (prev, next, event, now) and feeds `cueFor` and the title adapter. It still calls `step` once and `save` as today. | R1.6, R2.1 to R2.8 |
| CR2 | `controls-and-access` R11.7, Decision Q6 | "Sound and ghosts have no effect in this spec" becomes true only for ghosts. The `sound` setting now decides whether Cues play, is read at the moment of each Transition, and its switch counts as a gesture. | R2.7, R2.13, R4.5, R7.4 |
| CR3 | `controls-and-access` R1.2 and R12 (visibility) | `main.ts` also starts and stops the Hidden_Tick on `visibilitychange`. `wireVisibility` and the `hide` and `show` events are unchanged. | R5.15 to R5.17 |
| CR4 | `controls-and-access` R7.7 | `formatTime` gains a second reader (`titleFor`). Its behaviour does not change. | R6.7 |
| CR5 | `ghosts-and-graveyard` requirements: R2.11, R4.9, R8.5, R8.8, R8.9, R5.1, Open Questions | Replace "placeholder" wording and the examples ("38 older stones not shown", "12 older days not shown", "No stones yet", "No candles on the shelf yet", "Planned: ...") with the Final Wording table. Move the five wording Open Questions to resolved. S, D, K and G stay open for that design. | R8.1 to R8.3 |
| CR6 | `ghosts-and-graveyard` design 4.7 and its tests | Replace the placeholder strings with the final wording; update literals in unit tests and in E3 and E6. Retake affected screenshots. | R8.1, R9.7 |
| CR7 | `.kiro/steering/structure.md` | List the new files in `src/audio/`, the title module and the Hidden_Tick source, and the test-only Fake_AudioContext helper. The wrap-up task makes this edit, done by Kiro. | R1.4, R1.5 |
| CR9 | `ghosts-and-graveyard` design (`cardLines`), P18 and its text tests | `cardLines` takes the kind-specific first line (`graveyard.card.stoneLine` or `graveyard.card.stubLine`); the null-intent card line uses `graveyard.card.unnamed`. P18 still checks that the card contains the exact intent. The Item's accessible name does not change. | R8.13 to R8.15 |
| CR8 | `session-engine`, `distraction-tracking`, `candle-scene`, `hosting` | None. The engine, the scene and `render.yaml` do not change. If P9 finds that a `tick` while hidden changes a hide span, that is an engine finding to raise, not a change made here. | R5.14, R5.18 |

## Decisions to Record in the Design

- **D1. Cue recipes.** Voices, frequencies, envelopes, filters, master gain and noise seed of each Cue (R3.12).
- **D2. Cue_Spec shape.** The plain-data type, and how the Audio_Player turns it into nodes.
- **D3. Hidden-tick mechanism.** The timer used, the Wake_Delay rule and how throttling is handled (R5.21). The hidden tick does not paint (R5.20).
- **D4. Unlock events.** `keydown`, `pointerdown` and `touchend` on the document, in the capture phase before the controls' handlers (R4.4, R4.16). Escape does not count as activation; confirming the snuff dialog is Enter or a click, which do.
- **D5. Late_Cue_Limit.** 120000 ms. It covers a hidden tab that the browser wakes once a minute, and keeps a laptop that wakes an hour later from chiming for the past (R2.11).
- **D10. Throttled hidden tabs accepted.** The design records as a decision that a chime and a title up to about a minute late after long hidden periods are fine. Reason: browsers throttle hidden-tab timers to about once a minute. No silent keep-alive audio and no audio-clock scheduling (R5.23).
- **D11. No year in the Carved_Date.** Only the newest items are drawn, so a repeated month across a year boundary is rare (R8.9).
- **D12. Plain data lines, dry state lines.** Data labels stay plain; state and empty lines carry the dry tone (R8.4, R8.5).
- **D13. Flavour in the card, not the name.** "Here lies" and "Burned to the end" appear only as the first card line, never in an accessible name (R8.13 to R8.15).
- **D6. Title forms.** The final forms and why the end forms carry no time (R6).
- **D7. Strings_Table.** The full table with keys, final wording and source spec (R8.2).
- **D8. Module layout.** File names and folders for the pure modules, the adapters and the test-only helpers, consistent with `structure.md` boundaries.
- **D9. Costume-reviewer findings.** Recorded at the end of the work (R9.8).

## Out of Scope

- Sound files, music, ambient sound, any cue beyond the three of the brief, a volume control, and a cue for pause, resume, the break or the ghosts.
- Browser notifications and background push (brief section 9).
- Keeping a page alive in the background beyond what timers and timestamps give.
- Any change to the engine, the scene, the history or settings documents, or `render.yaml`.
- Fonts and hosting (`hosting`), and the layout numbers S, D, K and G (the `ghosts-and-graveyard` design).
- Translating the strings. The product is English only.

## Risks

- **K1. P9 may fail during the build (a risk, not a known bug).** Property P9 is written as planned. If it fails, the build stops and reports the counterexample and the seed. The failure is not worked around in this spec. A `tick` that changes a hide span or ghost span would be an engine finding to raise with `distraction-tracking` (CR8).

## Resolved Questions

All nine open questions are resolved and folded into the requirements above:

- Q1 title forms: accepted as proposed, time first (R6.2 to R6.5).
- Q2 Late_Cue_Limit: 120000 ms (Glossary, D5).
- Q3 throttled tabs: accepted (R5.23, D10).
- Q4 first-gesture events: accepted, capture phase (R4.16, R4.17, D4, E1b).
- Q5 hidden tick painting: it does not paint (R5.20).
- Q6 year in the date: none (R8.9, D11).
- Q7 data labels versus flavour: accepted (D12).
- Q8 "Here lies": first card line only, not the accessible name (R8.13 to R8.15, CR9, D13).
- Q9 P9 engine risk: recorded as K1.

- **Q1. Title forms.** Recommended: `lit` "12:31 · Candlewatch", `paused` "12:31 paused · Candlewatch", `burned-out` "Morning · Candlewatch", `snuffed` "Dark · Candlewatch", `idle` "Candlewatch". The time comes first so a narrow tab still shows it. The end forms carry no time because the Time_Text shows 00:00 and the words say more. Confirm or change.
- **Q2. Late_Cue_Limit.** Recommended: 120 000 ms (two minutes). It covers a hidden tab that the browser wakes once a minute, and it keeps a laptop that wakes an hour later from chiming for the past. Confirm or choose another value.
- **Q3. Throttled background tabs.** Browsers wake hidden timers about once a second, and about once a minute after the tab has been hidden for several minutes. Recommended: accept this, keep the plain timer, and state in the design that the chime and title may be up to a minute late in a long-hidden tab while the time stays right. A silent keep-alive audio source and a chime scheduled on the audio clock are not recommended: the first is a hack, and the second breaks the rule that Cues come from Transitions. Confirm.
- **Q4. First-gesture events.** Recommended: key press, pointer press and touch end, listened for on the document in the capture phase and removed after unlock. The Escape key may not count as activation in some browsers, so the snuff dialog alone may not unlock sound. Confirm that this is acceptable.
- **Q5. Does the hidden tick paint?** Recommended: no. It dispatches `tick`, plays any due Cue and updates the title only; the first visible frame paints from state. This keeps the announcer's milestone rule unchanged (only the latest crossed milestone is said on return).
- **Q6. Carved_Date and the year.** Recommended: no year ("10 Nov"). Graveyard and shelf show at most a few weeks of days. A year would crowd the stone. History crossing a new year may show the same month twice a year apart; accept it.
- **Q7. Data labels versus flavour.** Recommended: the Details_Card lines, count lines and date stay plain ("Length: 25 minutes", "Distractions: 3"), and flavour goes in state lines, empty lines and the null-intent line ("Unnamed watch"). Confirm.
- **Q8. "Here lies" on the stone.** The brief's example "Here lies 'write the report', 25 minutes, snuffed at 14." is not used as a Stone's face or name, because ghosts-and-graveyard R7.1 fixes the name as intent and date. Recommended: leave it unused. Confirm.
- **Q9. Engine finding risk (P9).** If a `tick` during a hidden interval can change a hide span or ghost span in the engine, P9 will fail. Recommended answer: treat that as an engine bug to report to `distraction-tracking`, not to work around here.
