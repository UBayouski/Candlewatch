# Requirements Document

## Introduction

This spec implements `docs/BRIEF.md` sections 3 and 4 and spec plan item 4 for Candlewatch: ghosts in the room, the graveyard (snuffed sessions, one gravestone each), the shelf (burned-out sessions, one candle stub each, one shelf per day), and the hover and tap details for stones and stubs. It builds on the finished `session-engine`, `distraction-tracking` and `candle-scene` specs and on `controls-and-access`. It does not redefine them.

Fixed inputs from the existing specs:

- The engine already provides `distractionCount`, `ghostSpansMs` and `ghostSize` (floor 0.25, square-root curve, full size at 5 minutes). Ghosts read these selectors and never change the timer.
- The history document (version 1) holds finished and snuffed sessions as `HistoryEntry` values: `startedAt`, `endedAt`, `lengthMin`, `intent`, `outcome`, `distractions`, `timeAwayMs`. The graveyard and the shelf read it and store nothing new.
- The candle scene owns the 600 by 1000 stage, its layers, the reserved edge bands (x 0..110 and x 490..600) and the floor band below y = 900, which is reserved for the time text.
- `controls-and-access` owns the controls, the focus order, the key map and the settings document (which already holds "ghosts on or off"). This spec lists Change Requests against `controls-and-access` and does not edit that spec.
- The costume rule applies to every new element: each element shows exactly one piece of state and nothing is decoration.

The requirements fix constraints. The layout numbers S (stones drawn), D (days drawn), K (stubs per day) and G (ghost slots) are derived in the design from the stage geometry. They are not guessed here.

## Glossary

- **Room**: the default view, showing the candle scene, the ghosts and the controls of `controls-and-access`.
- **Graveyard_View**: the second view, reached through the Door, showing the Graveyard and the Shelf.
- **Door**: the control on the left edge of the Room that opens the Graveyard_View. The left edge band below y = 300 room units is kept free for the Door by `controls-and-access` R8.2.
- **Door_Usable_Phases**: the phases `idle`, `burned-out` (including the break) and `snuffed`.
- **Shut_Door**: the Door in `lit` and `paused`, drawn as a closed door.
- **Graveyard**: the group of Stones for snuffed sessions.
- **Stone**: one gravestone, carved with the intent and the date of one snuffed History_Entry.
- **Shelf**: the group of Day_Shelves for burned-out sessions.
- **Day_Shelf**: one shelf holding the Stubs of one Day_Key.
- **Stub**: one candle stub for one burned-out History_Entry.
- **Item**: a Stone or a Stub.
- **Group**: the Graveyard or the Shelf, each one Tab stop in the Graveyard_View.
- **History_Entry**: one record of the history document (version 1).
- **Day_Key**: the string "YYYY-MM-DD" naming a local calendar day.
- **DayKeyFn**: a function `dayKeyOf(ms) -> Day_Key` passed in by the caller. Production uses the browser's local time; tests use fixed-offset functions and one hand-written DST-jump function.
- **Carved_Date**: the date text shown on a Stone and in a Details_Card, built from the Day_Key with no time of day.
- **Details_Card**: the single card that shows the intent, date, planned length, distractions and time away of one Item.
- **Roving_Focus**: one Item per Group has `tabindex="0"` and the other Items have `tabindex="-1"`.
- **Remembered_Item**: the Item last focused in a Group; the newest Item when the Group has not been visited yet.
- **Visible_History**: the result of `visibleHistory(history, limits)`: `{ stones, shelves, hiddenStones, hiddenDays }`.
- **Count_Line**: the one line of real text per Group stating how many older entries are not drawn.
- **Ghost**: a translucent shape in the Room standing for one distraction of the current session.
- **Ghost_Slot**: one fixed position along the room's edge where a Ghost can be drawn at full size (ghostSize 1.0).
- **G**: the number of Ghost_Slots, derived in the design.
- **S, D, K**: the number of Stones drawn, Day_Shelves drawn, and Stubs drawn per Day_Shelf, derived in the design.
- **Overflow_Mark**: the small "+n" text beside the Ghosts showing how many distractions are not drawn.
- **Floor_Band**: the stage band below y = 900 reserved for time text.
- **Scene_Label**: the accessible name of the scene root (`role="img"`).
- **PROP_PARAMS**: the shared fast-check settings (300 runs) exported by the engine test kit.
- **Costume_Reviewer**: the `costume-reviewer` agent, run in the Kiro CLI.

## Requirements

### Requirement 1: Boundaries and wiring

**User Story:** As a maintainer, I want ghosts and the graveyard to read state and never write time, so that the timer cannot disagree with what the screen shows.

#### Acceptance Criteria

1. THE Ghost_Module SHALL read distraction data only through the engine selectors `distractionCount`, `ghostSpansMs` and `ghostSize`, imported from `src/engine/index.ts`.
2. THE Graveyard_Module SHALL read history only through the engine's public surface and the history document (version 1), and SHALL NOT add or change any stored field or document version.
3. THE Ghost_Module and the Graveyard_Module SHALL NOT send any engine event, read the clock, or change time left, wax, the distraction count or the history.
4. THE pure modules `groupByDay`, `visibleHistory`, `visibleGhosts`, the Door availability function and the roving-focus state machine SHALL import nothing from the DOM, `window`, `document`, `localStorage`, `Date` or `Math.random`.
5. A purity test SHALL enforce R1.4 in the same way as the engine's and the scene's purity tests.
6. THE Graveyard_Module and the Ghost_Module SHALL place all user-visible text in `src/strings.ts`.
7. THE Graveyard_Module SHALL put user text (the intent) into the page with `textContent` or an equivalent and never as markup.
8. THE spec's source SHALL contain the word "Pomodoro" nowhere, and every text that names a session SHALL say "focus session".
9. THE implementation SHALL add no new runtime or test dependency.

### Requirement 2: Shelf days and the carved date

**User Story:** As a user, I want each finished session on the shelf of the day it ended, so that a late-night session lands on the day I finished it.

#### Acceptance Criteria

1. THE Day_Key of a History_Entry SHALL be `dayKeyOf(endedAt)`, the local calendar day of the end time, and never the day of `startedAt` and never the UTC day.
2. WHEN a focus session starts at 23:50 and ends at 00:15 local time, THE Graveyard_Module SHALL place its Stub on the Day_Shelf of the day containing 00:15.
3. THE DayKeyFn SHALL derive the Day_Key from local date parts, so that a day with a daylight-saving jump is still exactly one Day_Shelf.
4. THE pure function `groupByDay(history, dayKeyOf)` SHALL take the DayKeyFn as an argument, so that no result depends on the machine's time zone.
5. THE production wiring SHALL pass a DayKeyFn built from the browser's local time, and the tests SHALL pass fixed-offset functions plus one hand-written DST-jump function.
6. THE Shelf SHALL order Day_Shelves by Day_Key, newest first.
7. THE Day_Shelf SHALL order its Stubs by `endedAt`, in a fixed direction recorded in the design.
8. WHEN two History_Entries of one Day_Shelf have equal `endedAt`, THE Graveyard_Module SHALL order them by their position in the history document, so that the order is total.
9. THE Carved_Date of a Stone SHALL be built from the Day_Key of its entry computed by the same DayKeyFn as the Shelf.
10. THE Carved_Date SHALL show no time of day.
11. THE Carved_Date format SHALL come from `src/strings.ts` in the style of that file; its exact wording is a placeholder to be finalised by `sound-and-title` (see Open Questions).
12. THE Graveyard_Module SHALL compute days at draw time and SHALL store no day key, shelf or grouping.
13. IF the browser's time zone changes between visits, THEN THE Graveyard_Module MAY move a near-midnight session to a neighbouring Day_Shelf, and the design SHALL record this as a decision.

### Requirement 3: The door to the graveyard

**User Story:** As a user, I want the door to open only when no candle is burning, so that I cannot wander into the graveyard during a focus session.

#### Acceptance Criteria

1. WHILE the phase is `idle`, `burned-out` or `snuffed`, THE Door SHALL be usable.
2. WHILE the phase is `lit` or `paused`, THE Door SHALL be drawn as a closed door that shows a focus session is running.
3. WHILE the Door is shut, THE Door SHALL be absent from the Tab order, SHALL be absent from the accessibility tree as a button, and SHALL NOT react to its key.
4. THE Door SHALL NOT be a focusable element that is merely styled as disabled.
5. WHEN the phase changes from a Door_Usable_Phase to `lit`, THE Door SHALL become a Shut_Door in the same frame.
6. WHEN the phase changes to a Door_Usable_Phase, THE Door SHALL become usable in the same frame.
7. WHEN the user activates the Door by pointer, touch or its key in a Door_Usable_Phase, THE View_Switch SHALL show the Graveyard_View.
8. THE View_Switch SHALL send no engine event and SHALL NOT change time left, wax, the distraction count or the history.
9. THE Door SHALL be placed in the left edge band below y = 300 room units, outside the Candle column, the window pane and the Floor_Band.
10. WHILE the phase is `lit` or `paused`, THE view SHALL be the Room.
11. WHEN the page loads or reloads with a stored `lit` or `paused` session, THE page SHALL open in the Room.
12. IF the Graveyard_View is open and the phase becomes `lit` or `paused`, THEN THE page SHALL return to the Room.
13. THE Graveyard_View SHALL contain no control that lights a candle, resumes a session or sends any engine event.
14. WHEN the user leaves the Graveyard_View, THE View_Switch SHALL show the Room and move focus to the Door.
15. WHEN the page becomes hidden while the Graveyard_View is open, THE distraction wiring SHALL treat it as it does in any non-`lit` phase, and entering the Graveyard_View SHALL NOT count as a distraction.
16. THE view switch, the opening of a Details_Card and every Roving_Focus movement SHALL be UI-only inputs for the "no UI input changes time" property (P8 of `controls-and-access`).

### Requirement 4: The graveyard view and its items

**User Story:** As a user, I want snuffed sessions as gravestones and finished sessions as candle stubs on shelves, so that my history reads as a place.

#### Acceptance Criteria

1. THE Graveyard SHALL draw one Stone for each drawn History_Entry whose outcome is `snuffed`.
2. THE Stone SHALL show the entry's intent and its Carved_Date as real text.
3. WHERE the entry's intent is null, THE Stone SHALL show a placeholder line from `src/strings.ts`.
4. THE Shelf SHALL draw one Day_Shelf for each drawn Day_Key and one Stub for each drawn History_Entry whose outcome is `burned-out`.
5. THE Day_Shelf SHALL show its Day_Key date as real text, built like the Carved_Date.
6. THE Stub SHALL show one piece of state only: that a focus session burned out on that day; the Stub's look SHALL carry no other state.
7. THE Stone SHALL show one piece of state only: that a focus session was snuffed, with its intent and date.
8. THE Graveyard_View SHALL contain no element that does not map to a piece of state or to an action the user can take.
9. WHILE a Group has no drawn Items, THE Graveyard_View SHALL show a short line from `src/strings.ts` ("No stones yet" or "No candles on the shelf yet" as placeholder wording) in place of the Group's Items.
10. THE Graveyard_View SHALL NOT scroll in either direction at the viewports 360 by 640, 768 by 1024, 1280 by 800 and 1920 by 1080.
11. THE Graveyard_View SHALL keep every drawn Item, Count_Line, empty-state line, Details_Card and the Door's return control inside the viewport and clear of one another.
12. THE Graveyard_View SHALL keep the Floor_Band and the controls of `controls-and-access` that remain visible free of overlap.
13. THE Graveyard_View SHALL give Stones and Stubs a hit size of at least the minimum hit size recorded in the design, and no smaller than 44 by 44 CSS pixels for touch.
14. THE Graveyard_View SHALL set text at or above the contrast values the scene already uses: ivory `#efe6cf` on the room's backgrounds at 4.5:1 or more for body text, and all other text at 4.5:1 or more against its real background.
15. WHERE the setting `prefers-reduced-motion: reduce` is on, THE Graveyard_View SHALL appear and disappear with no transition and no animation.

### Requirement 5: The details card

**User Story:** As a user, I want to read what a stone or a stub stands for without leaving the view, so that I can recall the session.

#### Acceptance Criteria

1. THE Details_Card SHALL show the intent, the Carved_Date, the planned length, the distraction count and the time away of the History_Entry.
2. WHERE the entry's intent is null, THE Details_Card SHALL show the same placeholder line as R4.3.
3. WHEN an Item receives keyboard focus, THE Graveyard_View SHALL show that Item's Details_Card.
4. WHEN the mouse pointer hovers an Item, THE Graveyard_View SHALL show that Item's Details_Card.
5. WHEN the mouse pointer hovers an Item, THE Graveyard_View SHALL NOT move keyboard focus.
6. WHEN the user taps an Item with touch, THE Graveyard_View SHALL show that Item's Details_Card.
7. WHEN the user taps the Item whose Details_Card is shown, THE Graveyard_View SHALL hide the Details_Card.
8. WHEN the user taps anywhere that is not the Item whose Details_Card is shown, THE Graveyard_View SHALL hide the Details_Card.
9. THE Graveyard_View SHALL show at most one Details_Card at a time.
10. THE Details_Card SHALL NOT cover the Item that it describes.
11. THE Details_Card SHALL stay inside the viewport at the four viewports of R4.10.
12. THE Details_Card text SHALL be real text from `src/strings.ts` templates filled with formatted values, with contrast per R4.14.
13. THE Details_Card text SHALL equal the values of the History_Entry, computed from the history document.
14. WHEN Escape is pressed while a Details_Card is shown, THE Graveyard_View SHALL hide the Details_Card and keep focus on the Item.
15. WHEN the page does not support hover, THE Graveyard_View SHALL still reach every Details_Card by keyboard focus and by tap.

### Requirement 6: Keyboard model and roving focus

**User Story:** As a keyboard user, I want two Tab stops in the graveyard and arrow keys inside each group, so that I can reach every stone and stub quickly.

#### Acceptance Criteria

1. THE Tab order in the Graveyard_View SHALL be the Graveyard, then the Shelf, then the Door's return control.
2. THE Graveyard and the Shelf SHALL each be exactly one Tab stop when they have at least one drawn Item.
3. WHILE a Group has no drawn Items, THE Group SHALL NOT be a Tab stop.
4. THE Group SHALL use Roving_Focus: exactly one drawn Item has `tabindex="0"` and every other drawn Item has `tabindex="-1"`.
5. WHEN the user tabs into a Group, THE focused Item SHALL be the Remembered_Item.
6. WHEN a Group is entered for the first time in a visit to the page, THE Remembered_Item SHALL be the newest Item of that Group.
7. WHEN Right Arrow is pressed on an Item, THE Group SHALL move focus to the next Item in its order, and WHEN Left Arrow is pressed, to the previous Item.
8. WHEN Up Arrow or Down Arrow is pressed on a Stub, THE Shelf SHALL move focus to the Stub at the same position on the newer or the older Day_Shelf respectively, or to the nearest Stub when that Day_Shelf has fewer Stubs.
9. WHEN Up Arrow or Down Arrow is pressed on a Stub and no newer or older drawn Day_Shelf exists, THE Shelf SHALL leave focus unchanged.
10. WHEN Home is pressed on an Item, THE Group SHALL move focus to its first Item, and WHEN End is pressed, to its last Item.
11. THE arrow, Home and End keys SHALL NOT wrap past the first or last Item.
12. WHEN an arrow key is pressed on an Item, THE focus SHALL stay inside the same Group.
13. WHEN Escape is pressed while a Details_Card is shown, THE Graveyard_View SHALL hide the card.
14. WHEN Escape is pressed while no Details_Card is shown, THE View_Switch SHALL leave the Graveyard_View for the Room.
15. WHEN the Door's key is pressed in the Graveyard_View, THE View_Switch SHALL leave the Graveyard_View for the Room.
16. THE Graveyard_View keys SHALL be active only in the Graveyard_View, and the arrow keys in the Room SHALL keep their current meaning.
17. THE Graveyard_View keys SHALL NOT clash with any key of the Room's key map.
18. WHEN the focus moves to an Item, THE Roving_Focus SHALL give that Item `tabindex="0"` and the previously focused Item of the Group `tabindex="-1"`, and SHALL record the Item as the Remembered_Item.
19. THE focus indicator on every Item, the Door and the return control SHALL meet the focus rules of `controls-and-access` R10.4.

### Requirement 7: Accessibility of items and groups

**User Story:** As a screen-reader user, I want each stone and stub to be named and described, so that I hear the session without needing the card on screen.

#### Acceptance Criteria

1. THE Item SHALL have an accessible name made of its intent and its date, for example "Write the essay, 10 Nov".
2. WHERE the entry's intent is null, THE Item's accessible name SHALL use the placeholder line of R4.3 and the date.
3. THE Item SHALL have an `aria-describedby` attribute that points at the Details_Card element holding its details, so that a screen reader reads the details without the card being visible.
4. THE Details_Card text for an Item SHALL be present in the accessibility tree for that Item even when the card is not shown.
5. THE Graveyard and the Shelf SHALL each have an accessible group label ("Graveyard" and "Shelf", from `src/strings.ts`).
6. THE Graveyard_View SHALL NOT use the roles `listbox`, `option` or `grid`.
7. WHILE the Count_Line of a Group is shown, THE Count_Line SHALL be part of the Group's accessible label or description.
8. THE Count_Line SHALL be real text and SHALL NOT be focusable.
9. WHEN the Graveyard_View opens, THE page SHALL give a screen reader a heading or label that names the view.
10. WHEN the view changes, THE page SHALL announce the new view once through the polite live region of `controls-and-access` R9.2, with text from `src/strings.ts`.
11. THE Door SHALL have an accessible name from `src/strings.ts` that says where it leads, and its state SHALL be exposed to assistive technology (present as a button while usable, absent while shut).

### Requirement 8: Large history

**User Story:** As a user with a long history, I want the view to stay readable and fit on screen, so that the graveyard never becomes a wall of noise.

#### Acceptance Criteria

1. THE pure function `visibleHistory(history, limits)` SHALL return `{ stones, shelves, hiddenStones, hiddenDays }`.
2. THE `limits` argument SHALL hold S, D and K and SHALL also take the DayKeyFn.
3. THE Graveyard SHALL draw the newest S Stones by end time.
4. THE Shelf SHALL draw the newest D Day_Shelves, and each Day_Shelf SHALL hold at most K Stubs.
5. WHEN a drawn Day_Shelf holds more than K Stubs, THE Day_Shelf SHALL show "+n more" at its end, with n the number of Stubs left out, as real text.
6. THE design SHALL derive S, D and K from the stage geometry as the largest values that fit at legible size, with Stones and Stubs at or above the minimum hit size of R4.13 and text at or above the contrast of R4.14, and SHALL record the numbers and the derivation as a decision.
7. THE requirements SHALL NOT fix the numbers S, D and K.
8. WHEN Stones are left out, THE Graveyard SHALL show one Count_Line stating how many older Stones are not shown (for example "38 older stones not shown").
9. WHEN Day_Shelves are left out, THE Shelf SHALL show one Count_Line stating how many older days are not shown (for example "12 older days not shown").
10. WHEN nothing is left out of a Group, THE Group SHALL show no Count_Line.
11. THE Graveyard_View SHALL NOT scroll for any history size.
12. THE Graveyard_Module SHALL NOT delete, trim or rewrite any History_Entry in storage, and the history document SHALL remain version 1 and complete.
13. THE Roving_Focus and the Details_Card SHALL cover only drawn Items.
14. THE `visibleHistory` result SHALL be unchanged when the order of the input history array is changed.
15. WHEN the history holds no more Items than the limits allow, THE `visibleHistory` result SHALL hide nothing and the page SHALL show no Count_Line.

### Requirement 9: Ghosts in the room

**User Story:** As a user, I want one ghost per distraction drifting at the room's edge, sized by time away, so that my distractions are visible.

#### Acceptance Criteria

1. THE Room SHALL draw one Ghost for each distraction of the current session, up to the cap G.
2. THE Ghost's size SHALL equal `ghostSize` of that distraction's span, taken from `ghostSpansMs`.
3. THE Ghost SHALL show one piece of state only: that one distraction happened, sized by its time away.
4. THE Ghost_Slots SHALL lie along the room's edge, within the reserved edge bands.
5. THE Ghost SHALL NOT overlap another Ghost, the candle, the centre of the light pool, or the Floor_Band below y = 900, at full size (ghostSize 1.0).
6. THE pure function `visibleGhosts(distractions, G)` SHALL return `{ drawn: [{slot, size}], hidden: n }`.
7. THE design SHALL derive G as the number of Ghost_Slots that fit at full size under R9.5, and SHALL record G and the derivation as a decision.
8. THE design SHALL use 12 as G only if the geometry allows it.
9. WHEN the number of distractions is at most G, THE Room SHALL draw every Ghost and show no Overflow_Mark.
10. WHEN the number of distractions exceeds G, THE Room SHALL draw the G newest Ghosts, each with its own size.
11. WHEN a Ghost is drawn, THE Ghost SHALL keep its Ghost_Slot for the rest of the session.
12. WHEN a new distraction is added while G Ghosts are drawn, THE oldest drawn Ghost SHALL fade out and the new Ghost SHALL take its Ghost_Slot, with no reshuffling of the other Ghosts.
13. WHEN more than G distractions exist, THE Room SHALL show one Overflow_Mark "+n" beside the Ghosts, with n the number of distractions not drawn.
14. THE Overflow_Mark SHALL be real text in the Room, outside the Floor_Band, in ivory `#efe6cf` or brighter, and at or above the scene's contrast values.
15. THE Overflow_Mark SHALL show one piece of state only: the number of distractions not drawn.
16. WHILE the phase is `idle`, THE Room SHALL draw no Ghost and no Overflow_Mark, because `ghostSpansMs` is empty.
17. WHILE the phase is `burned-out` or `snuffed`, THE Room SHALL draw the Ghosts of the session that just ended, as given by `ghostSpansMs`, under the same cap and slot rules.
18. THE Ghosts SHALL stay clear of the setup controls of `controls-and-access` in the ended phases.

### Requirement 10: Ghost settings, motion and screen-reader text

**User Story:** As a user who turns ghosts off, asks for less motion, or uses a screen reader, I want the count to stay true and the room to stay calm.

#### Acceptance Criteria

1. THE Scene_Label SHALL always give the exact engine distraction count in words, for example "3 distractions" or "14 distractions", whether or not Ghosts are drawn and whether or not the count exceeds G.
2. THE Scene_Label count SHALL equal `distractionCount(state)` for every state.
3. WHERE the setting "ghosts" is off, THE Room SHALL draw no Ghost and no Overflow_Mark.
4. WHERE the setting "ghosts" is off, THE Scene_Label SHALL still give the distraction count.
5. WHEN the setting "ghosts" is turned off or on, THE page SHALL send no engine event and SHALL NOT change the timer or the distraction count.
6. WHERE the setting `prefers-reduced-motion: reduce` is on, THE Ghosts SHALL be still silhouettes with no drift.
7. WHERE the setting `prefers-reduced-motion: reduce` is on, THE Room SHALL show a Ghost appearing or disappearing instantly, with no fade.
8. WHILE motion is allowed, THE Ghosts SHALL drift slowly within their Ghost_Slot's area and SHALL NOT enter the area of another Ghost_Slot, the candle, the centre of the light pool or the Floor_Band.
9. THE still version SHALL show every Ghost's size, its count and the Overflow_Mark exactly as the moving version does.
10. THE Scene_Label update SHALL be made through the scene's existing label rule, and the Ghost count SHALL NOT be announced through the live region on every distraction.
11. THE Ghost wiring SHALL leave the scene's model, flame modes and light radius unchanged.

### Requirement 11: Tests, screenshots and review

**User Story:** As a developer, I want the pure rules property-tested and every new screen seen in a real browser, so that the costume stays honest.

#### Acceptance Criteria

1. THE property tests SHALL use fast-check with `PROP_PARAMS` and the engine's generators, in `*.prop.test.ts` files colocated with the source.
2. THE unit tests for `groupByDay` SHALL use fixed-offset DayKeyFns and one hand-written DST-jump DayKeyFn, and SHALL NOT depend on the machine's time zone.
3. THE Playwright tests SHALL reach every state by writing a stored session and history to `localStorage` before the page loads, built with the engine's serializers, and SHALL use `page.clock`.
4. THE Playwright tests SHALL use no test hook in shipped code.
5. THE Playwright tests SHALL reach every drawn Item by keyboard alone.
6. THE Playwright tests SHALL reach every Details_Card by tap alone and compare each card's text with the history document.
7. THE Playwright tests SHALL check during a session that Tab never reaches the Door and its key does nothing.
8. THE Playwright tests SHALL check that after burn-out the Door opens and the Shelf shows the new Stub.
9. THE Playwright tests SHALL check a small history and one history seeded with 200 sessions over 45 days for no scroll, no overlap and the Count_Lines.
10. THE screenshot tests SHALL save screenshots in `docs/screenshots/` of the Ghost counts 0, 1, G and G+9 distractions, with G+9 also checked for no overlap with the candle and the Floor_Band.
11. THE screenshot tests SHALL save screenshots of the Graveyard_View with a small history, with the seeded large history, with a Details_Card opened by keyboard, and with a Details_Card opened by touch.
12. THE screenshot tests SHALL cover the desktop size (1280 by 800) and the phone size (360 by 640), and the desktop size with reduced motion on.
13. THE screenshot names SHALL say the screen, the size and whether reduced motion is on, in the existing style (for example `ghosts-g-plus-9-desktop.png`).
14. WHEN this spec changes what a user sees in the Room, THE tasks SHALL retake the affected `candle-*` screenshots and the summary SHALL say which.
15. THE Playwright accessibility tests SHALL check the roles, names, descriptions, group labels and Count_Lines with `ariaSnapshot`, and the Scene_Label count in every case of R10.1.
16. THE Playwright tests SHALL check the focus indicator on Items, the Door and the return control.
17. THE Playwright tests SHALL check text contrast of Item text, Count_Lines, empty-state lines, Details_Card text and the Overflow_Mark against the scene's values.
18. THE final task of the spec SHALL be a review by the Costume_Reviewer of the finished ghosts, graveyard and shelf, and its findings SHALL be recorded in the design's Decisions.

## Property-Based Tests

Each property runs at least 300 cases through `PROP_PARAMS` and is never weakened to pass.

| ID | Property | Covers |
|---|---|---|
| P1 | For any history and any DayKeyFn, every History_Entry appears on exactly one Day_Shelf or Stone group, each Day_Shelf key equals `dayKeyOf(endedAt)` for all its items, Day_Shelves are in newest-first key order, and the grouping is unchanged when the input is reordered. | R2.1, R2.6, R2.8 |
| P2 | For any history and DayKeyFn, a Stone's Carved_Date equals the date built from `dayKeyOf(endedAt)` of its entry. | R2.9 |
| P3 | Under a DST-jump DayKeyFn, all entries of one local day, including a 23-hour and a 25-hour day, are on one Day_Shelf. | R2.3 |
| P4 | For every phase, the Door is usable if and only if the phase is in {`idle`, `burned-out`, `snuffed`}. | R3.1, R3.2 |
| P5 | For any stored state and any view-switch script, the Graveyard_View is open only when the Door is usable. | R3.10, R3.12 |
| P6 | For any generated engine script, the state after the script is deeply equal whether or not view switches, card openings and focus moves were interleaved (extends P8 of `controls-and-access`). | R3.8, R3.16 |
| P7 | For any history and key sequence, each non-empty Group has exactly one Item with `tabindex` 0, an empty Group has none, and arrow, Home and End keys never move focus out of the Group or wrap. | R6.2 to R6.12 |
| P8 | For any history, the Up and Down keys on the Shelf move along the Day_Shelf order of the day-grouping rule. | R6.8, R6.9 |
| P9 | For any history and limits, the drawn Items plus the hidden Items equal the full history with nothing counted twice. | R8.3, R8.4, R8.8, R8.9 |
| P10 | For any history and limits, the drawn Stones are exactly the newest by end time, the drawn Day_Shelves are the newest days, and the hidden counts match. | R8.3, R8.4 |
| P11 | For any history, `visibleHistory` is unchanged under input reorder. | R8.14 |
| P12 | For a history no larger than the limits, nothing is hidden and no Count_Line is produced. | R8.15 |
| P13 | For any distractions list and G, drawn plus hidden equals `distractionCount`, drawn holds at most G entries, and the drawn entries are the newest. | R9.6, R9.10 |
| P14 | Every drawn size equals `ghostSize` of the span of that distraction. | R9.2 |
| P15 | Drawn slots are unique, and a Ghost's slot is stable as distractions are added. | R9.11, R9.12 |
| P16 | The Scene_Label count equals `distractionCount` for every state, with ghosts on, off and capped. | R10.1, R10.2, R10.4 |

## Playwright Tests

- **E1.** During a session, Tab never reaches the Door and its key does nothing; after burn-out the Door opens and the Shelf shows the new Stub.
- **E2.** Every Item is reachable by keyboard alone; every Details_Card is reachable by tap alone; each card's text is checked against the history document.
- **E3.** A small history and a history of 200 sessions over 45 days show no scroll, no overlap and correct Count_Lines at the four viewports.
- **E4.** Ghost counts 0, 1, G and G+9 show the right Ghosts, Overflow_Mark and Scene_Label, with no overlap of the candle or the Floor_Band.
- **E5.** Reduced motion shows still Ghosts and instant appearance; ghosts off shows no Ghost and no Overflow_Mark.
- **E6.** Screenshots: Ghosts at 0, 1, G and G+9; the Graveyard_View small and large; a card opened by keyboard and by touch.

## Change Requests for controls-and-access

This spec does not edit `controls-and-access`. The following changes are requested and recorded here:

- **CR1. Door in the Tab order and key map.** The Door joins the Tab order and the key map only in the phases where it opens (`idle`, `burned-out`, `snuffed`). The change is recorded beside the existing phase-dependent controls (Pause, Resume, Let it go dark, setup controls). In `lit` and `paused` the Door is absent from the Tab order, the key map has no entry for it, and its key does nothing.
- **CR2. Graveyard_View keys.** The key map gains the arrow keys, Home, End and Escape for the Graveyard_View only, as defined in R6. They are active only in that view, do not clash with the Room keys (Enter, Space, Esc to open the snuff dialog, T), and leave the Room's arrow keys (length chooser) unchanged.
- **CR3. Focus table.** The focus table of R10.5 gains two rows: opening the Graveyard_View moves focus to the first Group's Remembered_Item (or the next Tab stop when both Groups are empty), and leaving it returns focus to the Door.
- **CR4. P8 extension.** The "no UI input changes time" property includes the view switch, the Details_Card and Roving_Focus moves as UI-only inputs.
- **CR5. Layout.** The left edge band below y = 300 room units stays free for the Door, as `controls-and-access` R8.2 already says. The Door's rectangle is added to the layout placement function and to property P10 of that spec.
- **CR6. Settings.** The setting "ghosts" is read by this spec as defined in `controls-and-access` R11.7; no new setting is added.

## Decisions to Record in the Design

- **D1. Time-zone change.** Days are computed at draw time, so a time-zone change may move a near-midnight session to a neighbouring Day_Shelf (R2.13).
- **D2. S, D, K.** The values of S, D and K, with the derivation from the stage geometry, the minimum hit size and the contrast values (R8.6).
- **D3. G.** The value of G and the derivation from the Ghost_Slots that fit at full size without overlap (R9.7, R9.8).
- **D4. Stub order within a day.** The direction in which Stubs are ordered by end time inside a Day_Shelf (R2.7).
- **D5. Minimum hit size.** The minimum hit size for Stones and Stubs (R4.13).
- **D6. Ghost slot assignment.** How a new Ghost chooses the freed slot, and which slot is first (R9.11, R9.12).

## Out of Scope

- Paging, scrolling or browsing older Items than those drawn.
- Editing, deleting or exporting history.
- Sound, the page title and final wording of dates and counts (`sound-and-title`).
- Any change to the engine or the scene model. The changes to `controls-and-access` (documents, code and tests) are made by this spec's first build task, as listed in design section 6.1.
- Statistics, charts or summaries of history.

## Open Questions

- **Carved_Date wording.** The exact format of the date text (for example "10 Nov") is a placeholder for the strings file; `sound-and-title` finalises it.
- **Overflow_Mark wording.** The "+n" mark and the "+n more" text on a Day_Shelf are placeholders for the strings file.
- **Count_Line wording.** "n older stones not shown" and "n older days not shown" are placeholders for the strings file.
- **Empty-state wording.** "No stones yet" and "No candles on the shelf yet" are placeholders for the strings file.
- **Null-intent placeholder.** The line shown for a session with no intent is a placeholder for the strings file.
- **Derived numbers.** S, D, K and G are settled in the design, not here.
