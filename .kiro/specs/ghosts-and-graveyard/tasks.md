# Implementation Plan: ghosts-and-graveyard

## Overview

Implements `design.md` against `requirements.md` in this folder. The plan follows the design's order: first the change requests of design 6.1 are applied to `controls-and-access` (task 1), then the pure modules with their required property tasks (ghosts, then the graveyard data modules, then geometry, focus, card, view, keys), the purity tests, the DOM layers, the scene `labelSuffix` change, the `main.ts` wiring, the browser tests E1 to E7, the screenshots, the costume review and the wrap-up.

The plan runs in **four CLI batches**. Each batch ends with a checkpoint and a marker line ("Batch N ends here"). Start a new CLI session per batch, run the tasks of that batch in order, and stop at the marker.

| Batch | Tasks | Content |
|---|---|---|
| 1 | 1 to 4 | Change requests applied to `controls-and-access`, strings, ghost pure modules, graveyard data modules (days, visible, text) |
| 2 | 5 to 12 | Geometry, focus, card, view, keys, the UI-only property (P6), purity tests |
| 3 | 13 to 18 | Scene `labelSuffix`, DOM layers, CSS, `main.ts` wiring, strings use check |
| 4 | 19 to 28 | Browser tests E1 to E7, screenshots, costume review, wrap-up |

Conventions for every task:

- TypeScript strict, no `any`, exact dependency versions, **no new dependencies** (R1.9). No DOM library for Vitest: the DOM layers are exercised by the Playwright tasks.
- Tests are colocated next to the source (`*.test.ts`, `*.prop.test.ts`); Playwright tests are `*.spec.ts` in `e2e/`.
- The pure files of `src/ghosts/` and `src/graveyard/` import only `../engine` (the public index), `../strings`, `../ui/format`, `../ui/layout` and their pure siblings (design 2.1, 2.2). They contain none of `window`, `document`, `localStorage`, `Date`, `performance`, `Math.random`, `matchMedia`, `setTimeout`, `setInterval`, `requestAnimationFrame` (R1.4). `src/graveyard/day-key.ts` is the only file in the two folders that reads `Date`.
- User text (the intent) reaches the page only through `textContent` and `setAttribute` of non-style attributes. No `innerHTML`, `insertAdjacentHTML`, `document.write`, `style.cssText` or `setAttribute("style", ...)` (R1.7). The word "Pomodoro" appears nowhere (R1.8).
- All user-visible text is in `src/strings.ts` (R1.6).
- Property-test tasks are **required**, not optional. Every property test uses the engine's shared `PROP_PARAMS` (300 runs) from `src/engine/test-kit.ts`, and carries the tag `Feature: ghosts-and-graveyard, Property N: <title>`. Never lower the runs and never weaken a property to make it pass. If a property fails, report the shrunk counterexample and the seed, say whether the bug is in the code or the test, fix the right one, and record it in `KIRO_USAGE.md`.
- **Mutation check** (design 8.4): where a property task names one, apply the named fault to the source by hand, run only that property file (`npx vitest --run <file>`), confirm it fails, then revert the fault in a `finally`-style step (check with `git diff` that the source is back). If the property survives, strengthen the test (a sharper assertion or generator), never the code under test, and record it in the task note. A property that cannot fail is not accepted.
- Test-only helpers (`src/ghosts/test-kit.ts`, `src/graveyard/test-kit.ts`, `src/graveyard/fake-*`) are never imported by source files. Shared arbitraries go into the kit in the first task that needs them; arbitraries used by one property file stay in that file.
- A task is done only when `npm run verify` passes (type-check and lint, unit tests, build, e2e) unless its note says a narrower check applies until the e2e tasks exist.
- Any task that changes what a user sees names the screenshots it affects; all of them are retaken in task 26.
- Each batch's checkpoint records the unit file and test counts from `npm run verify`.

## Tasks

- [x] 1. Apply the change-request table (design 6.1) to `controls-and-access`
  - [x] 1.1 Update the `controls-and-access` requirements, design and tasks documents where they are now wrong
    - Apply CR1 to CR5, CR6, CR-A1 and CR-V1 of design 6.1 to `.kiro/specs/controls-and-access/requirements.md`, `design.md` and `tasks.md`. Read each document first and change only what the table makes wrong; add a short "Amended by ghosts-and-graveyard task 1" note beside every changed passage.
    - Key map and Tab order (CR1, CR2): `KeyContext` gains `view: "room" | "graveyard"`; with `view === "graveyard"` `keyAction` returns no room action, except close-settings while the settings overlay is open; room behaviour is unchanged; the Door and `g` join the Tab order and key map only in `idle`, `burned-out`, `snuffed`; arrows, Home, End and Escape get their second meaning in the graveyard only.
    - Focus table (CR3): add the two rows (opening the view focuses the first Group's Remembered_Item, else the next Tab stop; leaving focuses the Door).
    - P8 and the test-kit (CR4): view switch, card inputs, focus moves and the ghosts toggle are UI-only ops.
    - Layout and P10 (CR5): `DOOR_RECT` (x 20..100, y 805..890) and the ghost cells (x 10..100 and x 500..590, y 215..785) are keep-clear rectangles of `placeControls`; P10 asserts no control intersects them; update the E3 text of its task 31 to include them.
    - `viewOf` (CR-V1): new `view` argument; setup controls hidden when `view === "graveyard"`; the zone controls and the Settings opener stay.
    - Announcer DOM function (CR-A1): `announce(text: string)` writes one line to the live region; `nextAnnouncement` is unchanged.
    - CR6: note that the "ghosts" setting is read as defined (R11.7); no change.
    - Files: the three `controls-and-access` spec files.
    - _Requirements: R3.3, R3.9, R3.13, R3.14, R3.16, R4.12, R6.15, R6.16, R6.17, R7.10, R9.18_

  - [x] 1.2 Make the `controls-and-access` code changes
    - `src/ui/keys.ts`: add `view` to `KeyContext`; with `view === "graveyard"` return `null` for every key except the close of an open settings overlay; behaviour for `view === "room"` is exactly as before. Update `src/ui/dom/events.ts` to pass `view` (the value comes from `createInterface`; until task 16 it is always `"room"`).
    - `src/ui/view.ts`: `viewOf(state, ui, settings, now, placement, view)` hides the setup controls when `view === "graveyard"`; zone controls and Settings stay visible. Update its callers (`src/ui/index.ts`).
    - `src/ui/dom/live.ts` and `src/ui/index.ts`: expose `announce(text)` (the one-line writer, with the existing one-frame clear for a repeated line) on the interface so `main.ts` can announce view changes. `nextAnnouncement` is not touched.
    - `src/ui/layout.ts`: add `DOOR_RECT` and `GHOST_CELLS` to the keep-clear rectangles in room units (the left cells x 10..100 and the right cells x 500..590, both y 215..785), exported next to the existing `keepClear`. `src/ui/` does not import `src/ghosts/` or `src/graveyard/`: the numbers are repeated here as constants and `geometry.test.ts` (task 5) asserts they equal the ones in `src/graveyard/geometry.ts` and `src/ghosts/slots.ts`.
    - Files: `src/ui/keys.ts`, `src/ui/view.ts`, `src/ui/layout.ts`, `src/ui/index.ts`, `src/ui/dom/events.ts`, `src/ui/dom/live.ts`.
    - _Requirements: R3.3, R3.9, R3.13, R4.12, R6.16, R6.17, R7.10, R9.18_

  - [x] 1.3 Extend the `controls-and-access` tests
    - Required: P8 ops. In `src/ui/test-kit.ts` add the UI-only ops (open or leave the view, card inputs, focus moves, ghosts toggle) to the UI script generator and interpreter; they change only UI state. Extend P8 in `src/ui/ui-state.prop.test.ts` to interleave them; the engine state after the script must be deeply equal to the plain run.
    - Required: P10. Extend `src/ui/layout.prop.test.ts` so no control rectangle intersects `DOOR_RECT` or any ghost cell, at every generated viewport and the four named sizes. Mutation check: move the Light button onto the left ghost cells and confirm P10 fails, then revert.
    - Required: key-map properties. Extend `src/ui/keys.test.ts` and `src/ui/keys.prop.test.ts` (P4 of that spec) with `view`: with `view === "graveyard"` and no overlay `keyAction` returns `null` for every key; with the settings overlay open Escape still closes it; with `view === "room"` the existing examples and properties are unchanged.
    - Extend `src/ui/view.test.ts` for `viewOf` with `view === "graveyard"` (setup controls hidden, zone controls and Settings visible, Tab order list updated) and `src/ui/layout.test.ts` for the two new rectangles.
    - Files: `src/ui/test-kit.ts`, `src/ui/ui-state.prop.test.ts`, `src/ui/layout.prop.test.ts`, `src/ui/keys.test.ts`, `src/ui/keys.prop.test.ts`, `src/ui/view.test.ts`, `src/ui/layout.test.ts`.
    - _Requirements: R3.3, R3.13, R3.16, R4.12, R6.16, R6.17, R9.18. Properties: P8 ops, P10, P4 of controls-and-access (these feed P6, P14 and P22 here)_

  - [x] 1.4 Add the strings groups needed early
    - Add the `count`, `ghosts` and `graveyard` groups of design 4.7 to `src/strings.ts` (CR-ST). `label.ts` and `text.ts` need them in the first batch, so they are added now; the wording stays a placeholder for `sound-and-title`.
    - Extend `src/strings.test.ts`: none of the new strings contains "Pomodoro" (spelled in two pieces as the existing check does); `graveyard.months` has 12 entries; every placeholder is one of `n`, `day`, `month`, `intent`, `date`, `time`.
    - Note (controls-and-access review): `src/ui/strings.test.ts` fails when a new string group is added unless the group is in its `NOT_THIS_SPEC` set; `count`, `ghosts` and `graveyard` are in it now. By the end of this spec (task 17.1) these groups must pass its "every key is used" check, so remove them from `NOT_THIS_SPEC` then. Its non-empty and template checks already read the `months` array and the nested `card` group.
    - Files: `src/strings.ts`, `src/strings.test.ts`.
    - _Requirements: R1.6, R1.8, R2.11_

  - [x] 1.5 Add the first `KIRO_USAGE.md` entry
    - Log the CR batch: the passages changed in the three `controls-and-access` documents, the code and tests changed, and the unit counts before and after.
    - Files: `KIRO_USAGE.md`.
    - _Requirements: CR-K_

- [ ] 2. The ghost pure modules
  - [ ] 2.1 `src/ghosts/slots.ts`
    - Create `GHOST_BOX` (70 by 75), `DRIFT_UNITS` (8), `GhostSlot`, `GHOST_SLOTS` (12 entries: slot k has cx 55 when k is even and 545 when odd, cy = 262.5 + 95 * floor(k / 2)) and `OVERFLOW_MARK` (x 545, y 860, font size 24) exactly as design 3.9 and the L2 to L5 table.
    - Create `src/ghosts/slots.test.ts`: the table row by row (all 12 centres, resting boxes and cells); cells tile without overlap; each drifted box stays inside its cell with at least 4 units to the next one; the cells lie inside the bands 0..110 and 490..600, end at y 785 (20 units above `DOOR_RECT`) and clear the floor band and the candle column; the Overflow_Mark box (x 509..581, y 838..864) is clear of the lowest drifted box (783) and the floor band; font size times 0.6 is at least 12; `GHOST_CELLS` of `src/ui/layout.ts` equals the cells of this table.
    - Files: `src/ghosts/slots.ts`, `src/ghosts/slots.test.ts`.
    - _Requirements: R9.4, R9.5, R9.7, R9.8, R9.14, R10.8_

  - [ ] 2.2 `src/ghosts/visible.ts` and the ghost test-kit
    - Create `DrawnGhost` and `visibleGhosts(spans, G)` as in design 3.9: `first = max(0, length - G)`, `drawn` = indices `first..length-1` oldest first, `slot = index mod G`, `size = ghostSize(spans[index])`, `hidden = first`; `G` read as `max(0, floor(G))`, `NaN` as 0, so `drawn` is empty and `hidden` is the full count.
    - Create `src/ghosts/test-kit.ts` (test-only) with `arbGhostSpans` (0 to 40 spans, including 0, negative, `NaN` and infinite) and re-export `PROP_PARAMS`.
    - Create `src/ghosts/visible.test.ts`: 0 spans; 1; 12 (no mark); 13 (hidden 1, slot 0 reused); 21 (hidden 9); `G = 0`, negative, fractional and `NaN`; sizes in [0.25, 1]; the input array is not changed.
    - Files: `src/ghosts/visible.ts`, `src/ghosts/test-kit.ts`, `src/ghosts/visible.test.ts`.
    - _Requirements: R1.1, R1.3, R9.1, R9.2, R9.6, R9.9, R9.10, R9.13, R9.16, R9.17_

  - [ ] 2.3 Required: P19, visible ghosts are the newest, with the right size
    - **Property 19: Visible ghosts are the newest, with the right size**
    - Create `src/ghosts/visible.prop.test.ts` (tag Property 19): `drawn.length + hidden` equals the number of spans; `drawn.length <= G`; the drawn indices are the newest ones, oldest first; each drawn `size` equals `ghostSize` of its span and lies in [0.25, 1]; `hidden` is 0 when the length is at most `G`.
    - Mutation check (P19): make `visibleGhosts` draw the oldest `G` indices (`0 .. G-1`) instead of the newest; confirm P19 fails; revert.
    - Files: `src/ghosts/visible.prop.test.ts`.
    - **Validates: Requirements 9.1, 9.2, 9.6, 9.9, 9.10, 9.13**

  - [ ] 2.4 Required: P20, ghost slots are unique and stable
    - **Property 20: Ghost slots are unique and stable**
    - Add Property 20 to `src/ghosts/visible.prop.test.ts` (tag Property 20): for any spans and `G >= 1` the drawn slots are all different and below `G`; adding a span keeps the slot of every ghost still drawn, and the new ghost takes the slot of the oldest ghost that left (or the next free slot while fewer than `G` are drawn).
    - Mutation check (P20): use `slot = index` instead of `index mod G`; confirm P20 fails; revert.
    - Files: `src/ghosts/visible.prop.test.ts`.
    - **Validates: Requirements 9.11, 9.12**

  - [ ] 2.5 `src/ghosts/label.ts`
    - Create `SceneMode`, `countWords(n)` (`STRINGS.count.distraction` for 1, `STRINGS.count.distractions` otherwise, `n` as plain digits, 0 gives "0 distractions") and `sceneLabel(mode, count)` (`STRINGS.scene[mode] + " " + countWords(count) + "."`) as in design 3.10.
    - Create `src/ghosts/label.test.ts`: counts 0, 1, 2, 14, 1000; each scene mode; the label never contains the time.
    - Files: `src/ghosts/label.ts`, `src/ghosts/label.test.ts`.
    - _Requirements: R10.1, R10.2, R10.4_

  - [ ] 2.6 Required: P21, the scene label always gives the engine count
    - **Property 21: The scene label always gives the engine count**
    - Create `src/ghosts/label.prop.test.ts` (tag Property 21), using the engine's state generators and `arbScript`: for any state, any flame mode, any `ghosts` setting and any `G`, `sceneLabel(mode, distractionCount(state))` contains the decimal digits of `distractionCount(state)` followed by "distraction" or "distractions", the singular only for 1, and no `mm:ss` time; the text does not change with `ghosts` or `G`.
    - Files: `src/ghosts/label.prop.test.ts`.
    - **Validates: Requirements 10.1, 10.2, 10.4**

- [ ] 3. The graveyard data modules
  - [ ] 3.1 `src/graveyard/days.ts` and the graveyard test-kit
    - Create `DayKey`, `DayKeyFn`, `Indexed`, `DayGroup`, `groupByDay`, `newestFirst` (`endedAt` descending, then `startedAt` descending, then `index` descending), `formatCarvedDate` and `dayKeyFromParts` exactly as design 3.1. `Indexed.id` is `${startedAt}:${endedAt}:${index}`. A malformed key gives `STRINGS.graveyard.unknownDate`.
    - Create `src/graveyard/test-kit.ts` (test-only) with `arbEntry` and `arbHistory` (from the engine's generators, with unique `(startedAt, endedAt)` pairs for valid documents, clusters of end times inside one day, both outcomes, intents from `arbIntentText` and `null`), `fixedOffsetDay(hours)`, `dstJumpDay` (a hand-written function with a 23-hour and a 25-hour day, no machine time zone), `arbLimits` (`S`, `D`, `K` from 0 to 15, and the defaults), and re-export `PROP_PARAMS`.
    - Create `src/graveyard/days.test.ts`: the 23:50 to 00:15 example under a fixed offset (R2.2); `formatCarvedDate` for "2026-11-10", the unknown date and month 13; `dayKeyFromParts` padding; equal `endedAt` ordered by `startedAt` then position; groups newest day first.
    - Files: `src/graveyard/days.ts`, `src/graveyard/test-kit.ts`, `src/graveyard/days.test.ts`.
    - _Requirements: R2.1 to R2.10, R2.12_

  - [ ] 3.2 Required: P1, entries group by their end day
    - **Property 1: Entries group by their end day**
    - Create `src/graveyard/days.prop.test.ts` (tag Property 1) with an independent reference model written differently (sort all entries with a different comparator, then split by key): every entry is in exactly one group; the group key equals `dayKeyOf(endedAt)`; groups are in descending key order; items are in `newestFirst` order; for unique pairs the result is unchanged when the input is reordered; the result equals the reference.
    - Mutation check (P1): group by `startedAt` instead of `endedAt`; confirm P1 fails (the generator's clusters must cross a day boundary); revert.
    - Files: `src/graveyard/days.prop.test.ts`.
    - **Validates: Requirements 2.1, 2.4, 2.6, 2.7, 2.8**

  - [ ] 3.3 Required: P2, a daylight-saving day is one shelf
    - **Property 2: A daylight-saving day is one shelf**
    - Add Property 2 to `src/graveyard/days.prop.test.ts` using `dstJumpDay`: for any timestamps inside one local day (including the 23-hour and the 25-hour day) all entries land in the same group, and entries of different local days land in different groups.
    - Files: `src/graveyard/days.prop.test.ts`.
    - **Validates: Requirements 2.3**

  - [ ] 3.4 `src/graveyard/visible.ts`
    - Create `Limits`, `DEFAULT_LIMITS` (S 10, D 3, K 4), `ShelfView`, `VisibleHistory` and `visibleHistory(history, limits)` as in design 3.2: stones are the newest `S` snuffed entries; shelves are the newest `D` days that hold a burned-out entry, each with its newest `K` stubs and `hiddenStubs`; `hiddenStones`, `hiddenDays`; each limit read as `max(0, floor(x))`, `NaN` as 0; the input is never changed; days with only snuffed entries get no shelf.
    - Create `src/graveyard/visible.test.ts`: 3 sessions hide nothing; 11 stones show 10 with `hiddenStones` 1; 5 days show 3 with `hiddenDays` 2; a day with 6 stubs shows 4 with `hiddenStubs` 2; a snuffed-only day has no shelf; limits 0, negative, fractional and `NaN`; the input array is unchanged.
    - Files: `src/graveyard/visible.ts`, `src/graveyard/visible.test.ts`.
    - _Requirements: R4.1, R4.4, R8.1 to R8.5, R8.8, R8.9, R8.12, R8.15_

  - [ ] 3.5 Required: P7, visible history is a partition of the history
    - **Property 7: Visible history is a partition of the history**
    - Create `src/graveyard/visible.prop.test.ts` (tag Property 7) with an independent reference (sort, filter, slice): stones are snuffed only, stubs are burned-out only, no entry is counted twice, `stones.length + hiddenStones` equals the number of snuffed entries, and drawn stubs plus the sum of `hiddenStubs` plus the burned-out entries of undrawn days equal the number of burned-out entries.
    - Files: `src/graveyard/visible.prop.test.ts`.
    - **Validates: Requirements 4.1, 4.4, 8.1, 8.3, 8.4, 8.8, 8.9**

  - [ ] 3.6 Required: P8, the newest entries are the ones drawn
    - **Property 8: The newest entries are the ones drawn**
    - Add Property 8 to `src/graveyard/visible.prop.test.ts` (tag Property 8): every drawn Stone is newer by `newestFirst` than every hidden snuffed entry; the drawn Day_Shelves are the newest days with a burned-out entry; in each drawn day the drawn stubs are the newest of that day; `hiddenDays` equals the number of such days beyond `D`; the result equals the reference.
    - Mutation check (P8): take the oldest `S` stones (`slice(-S)` after a newest-first sort); confirm P8 fails; revert.
    - Files: `src/graveyard/visible.prop.test.ts`.
    - **Validates: Requirements 8.3, 8.4, 8.5**

  - [ ] 3.7 Required: P9, visible history does not depend on the array order
    - **Property 9: Visible history does not depend on the array order**
    - Add Property 9 to `src/graveyard/visible.prop.test.ts` (tag Property 9): for unique `(startedAt, endedAt)` pairs and any permutation, `visibleHistory` returns equal results (compare ids, counts and order).
    - Files: `src/graveyard/visible.prop.test.ts`.
    - **Validates: Requirements 8.14**

  - [ ] 3.8 `src/graveyard/text.ts`
    - Create `itemName`, `stoneIntent`, `cardLines` (exactly five lines: intent or placeholder, Carved_Date, planned length with singular or plural minutes, distractions as plain digits, `spokenTime(timeAwayMs)`), `stonesCountLine`, `daysCountLine` and `moreText` (one and other strings, `null` for 0) as in design 3.3. Uses `fill` and `spokenTime` from `../ui/format`.
    - Create `src/graveyard/text.test.ts`: the Item name "Write the essay, 10 Nov"; the null and empty intent placeholder; the five card lines for a known entry (planned 1 minute and 25 minutes, 3 distractions, time away 1:01); the count lines for 0 (null), 1 and 38; `moreText` for 0 and 3; equal inputs give equal text.
    - Files: `src/graveyard/text.ts`, `src/graveyard/text.test.ts`.
    - _Requirements: R4.3, R5.1, R5.2, R5.12, R5.13, R7.1, R7.2, R8.5, R8.8 to R8.10_

  - [ ] 3.9 Required: P3, the carved date comes from the end day
    - **Property 3: The carved date comes from the end day**
    - Create `src/graveyard/text.prop.test.ts` (tag Property 3): for any entry and any `DayKeyFn`, the date text of the Item name and of the card equals `formatCarvedDate(dayKeyOf(endedAt))` and contains no time of day (no `:` and no `am`/`pm`).
    - Files: `src/graveyard/text.prop.test.ts`.
    - **Validates: Requirements 2.9, 2.10**

  - [ ] 3.10 Required: P10, a history within the limits hides nothing
    - **Property 10: A history within the limits hides nothing**
    - Add Property 10 to `src/graveyard/visible.prop.test.ts` (tag Property 10), with a generator that builds histories with at most `S` snuffed entries, at most `D` days and at most `K` burned-out entries per day: all hidden counts are 0, and `stonesCountLine`, `daysCountLine` and `moreText` return `null` for them.
    - Files: `src/graveyard/visible.prop.test.ts`.
    - **Validates: Requirements 8.10, 8.15**

  - [ ] 3.11 Required: P11, count lines state the exact hidden number
    - **Property 11: Count lines state the exact hidden number**
    - Add Property 11 to `src/graveyard/text.prop.test.ts` (tag Property 11): for any `n > 0` the count line and the "+n more" text contain the decimal digits of `n` (and the one-form only for 1); for `n = 0` they are `null`.
    - Files: `src/graveyard/text.prop.test.ts`.
    - **Validates: Requirements 8.5, 8.8, 8.9, 8.10**

  - [ ] 3.12 Required: P18, the card text and the Item name equal the entry
    - **Property 18: The card text and the Item name equal the entry**
    - Add Property 18 to `src/graveyard/text.prop.test.ts` (tag Property 18): for any entry `cardLines` has five lines that contain, in order, the intent (or the placeholder when it is null or empty), the Carved_Date, `lengthMin`, `distractions` and the `spokenTime` of `timeAwayMs`; `itemName` equals the intent (or the placeholder) and the Carved_Date joined by the template.
    - Files: `src/graveyard/text.prop.test.ts`.
    - **Validates: Requirements 5.1, 5.2, 5.12, 5.13, 7.1, 7.2**

- [ ] 4. Checkpoint - Batch 1 ends here
  - Run `npm run verify`. Ensure all tests pass, ask the user if questions arise. Record the unit file and test counts in `KIRO_USAGE.md`.
  - The e2e suite must still pass after task 1 (the room is unchanged because `view` is always `"room"` until task 16).

> **Batch 1 ends here.** Stop this CLI session. Start batch 2 with task 5.

- [ ] 5. Geometry and contrast
  - [ ] 5.1 `src/graveyard/geometry.ts`
    - Create `Rect`, `DOOR_RECT`, `PANEL_RECT`, `STONES_PER_ROW`, `stoneRect`, `shelfRowY`, `dateLabelRect`, `stubRect`, `moreRect`, `COUNT_LINE_Y`, `EMPTY_LINE_Y`, `CARD_SIZE` and `placeCard` as in design 3.4: above when `item.y >= 463`, else below, 8 units from the item; `x = clamp(item.x + item.w / 2 - 260, 20, 60)`; no third branch.
    - Create `src/graveyard/geometry.test.ts`: every constant against the Section 1 tables (L1, L7, L9); every size times 0.6 is at least 44 for interactive items (R4.13); `DOOR_RECT` against the left band, the candle column, the window pane and the floor band (R3.9); `DOOR_RECT` and the cells equal the constants in `src/ui/layout.ts`; the card positions for stone rows 1 and 2 and shelf rows 1 to 3 equal the L10 values (y 371, 471, 274, 358, 442); the card at 360 x 640 and 1280 x 800 lies inside the viewport.
    - Files: `src/graveyard/geometry.ts`, `src/graveyard/geometry.test.ts`.
    - _Requirements: R3.9, R4.10 to R4.13, R5.10, R5.11_

  - [ ] 5.2 Required: P16, the card never covers its item and stays on the stage
    - **Property 16: The card never covers its item and stays on the stage**
    - Create `src/graveyard/geometry.prop.test.ts` (tag Property 16): for every `stoneRect(0..9)` and `stubRect(0..2, 0..3)`, `placeCard` returns a rectangle that does not intersect the item, lies inside x 20..580 and y 215..895 and is at least 8 units from the item.
    - Files: `src/graveyard/geometry.prop.test.ts`.
    - **Validates: Requirements 5.10, 5.11**

  - [ ] 5.3 Required: P17, the layout fits and does not overlap
    - **Property 17: The layout fits and does not overlap**
    - Add Property 17 to `src/graveyard/geometry.prop.test.ts` (tag Property 17): for any counts of stones up to `S`, days up to `D` and stubs up to `K`, every rectangle (items, labels, Count_Lines, empty lines, "+n more", return control) lies inside `PANEL_RECT` and no two intersect; every ghost slot box at full size and at its drift extremes lies inside its own cell and outside the other cells, `DOOR_RECT`, the floor band and the keep-clear column.
    - Files: `src/graveyard/geometry.prop.test.ts`.
    - **Validates: Requirements 4.10, 4.11, 4.12, 9.4, 9.5, 10.8**

  - [ ] 5.4 `src/graveyard/contrast.test.ts`
    - Compute the WCAG contrast from the hex values of ivory `#efe6cf` on `#1b2030`, `#080b12`, `#566683` and `#05070d`, and assert at least 4.5 and the published figures (13.0, 15.83, 4.66, 16.20, to the second decimal); non-text outlines at least 3:1; the Overflow_Mark on the brightest room stop.
    - Files: `src/graveyard/contrast.test.ts`.
    - _Requirements: R4.14, R9.14_

- [ ] 6. Roving focus
  - [ ] 6.1 `src/graveyard/focus.ts`
    - Create `GroupId`, `NavKey`, `NavLayout`, `FocusMemory`, `NO_MEMORY`, `tabStops`, `navigate` and `remember` as in design 3.5: no wrap; Up and Down on the Shelf go to row `r - 1` or `r + 1` at column `min(j, rowLength - 1)`, else stay; Up and Down on a Stone return `current`; an unknown `current` returns the Group's first id; a remembered id that is no longer drawn falls back to the first.
    - Create `src/graveyard/focus.test.ts`: Up on the newest shelf stays; Down on the oldest shelf stays; column clamp onto a shorter row; Home and End; Left on the first and Right on the last stay; empty Groups have no stop; the remembered id is the stop; a stale remembered id falls back.
    - Files: `src/graveyard/focus.ts`, `src/graveyard/focus.test.ts`.
    - _Requirements: R6.2 to R6.12, R6.18, R8.13_

  - [ ] 6.2 Required: P12, roving focus keeps one stop and stays in its Group
    - **Property 12: Roving focus keeps one stop and stays in its Group**
    - Create `src/graveyard/focus.prop.test.ts` (tag Property 12) with `arbNavLayout` (0 to 10 graveyard ids, 0 to 3 shelf rows of 1 to 4 ids) added to `src/graveyard/test-kit.ts`, and a reference walk over the flattened list: each non-empty Group has exactly one tabindex-0 id (the remembered id if still drawn, else the first) and an empty Group has none; every `navigate` result is an id of the same Group; Left, Right, Home and End never wrap; the result equals the reference.
    - Mutation check (P12): wrap at the ends (Right on the last goes to the first); confirm P12 fails; revert.
    - Files: `src/graveyard/focus.prop.test.ts`, `src/graveyard/test-kit.ts`.
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.10, 6.11, 6.12, 6.18, 8.13**

  - [ ] 6.3 Required: P13, Up and Down on the Shelf follow the day order
    - **Property 13: Up and Down on the Shelf follow the day order**
    - Add Property 13 to `src/graveyard/focus.prop.test.ts` (tag Property 13): for any layout and any Stub at row `r`, column `j`, Up goes to row `r - 1` and Down to row `r + 1` at column `min(j, rowLength - 1)`, and when that row does not exist the id does not change.
    - Mutation check (P13): swap Up and Down (or drop the `min(j, rowLength - 1)` clamp); confirm P13 fails; revert.
    - Files: `src/graveyard/focus.prop.test.ts`.
    - **Validates: Requirements 6.8, 6.9**

- [ ] 7. The details card state machine
  - [ ] 7.1 `src/graveyard/card.ts`
    - Create `CardState`, `CardInput`, `NO_CARD` and `cardStep` as in design 3.6: `focus` shows and sets `focused`; `blur` clears `focused` and hides a focus-shown card; `hover` shows without touching `focused`; `unhover` falls back to the focused item or null; `tap` toggles; `tap-away` hides; `escape` hides a shown card with `handled = true`, else `handled = false`; `clear` returns `NO_CARD`.
    - Create `src/graveyard/card.test.ts`: hover then focus; focus then hover then unhover (falls back to the focused item); tap, tap again; tap, then tap another item; tap-away; Escape twice (true, then false); clear.
    - Files: `src/graveyard/card.ts`, `src/graveyard/card.test.ts`.
    - _Requirements: R5.3 to R5.9, R5.14, R6.13, R6.14_

  - [ ] 7.2 Required: P15, one card at most, shown by the rules
    - **Property 15: One card at most, shown by the rules**
    - Create `src/graveyard/card.prop.test.ts` (tag Property 15) with `arbCardInputs` added to `src/graveyard/test-kit.ts`: at most one id is shown; hover never changes `focused`; a tap on the shown id hides it; a tap on another id shows that id; `tap-away` hides; `escape` hides a shown card and reports `handled = true`, and `false` when none is shown; `focus` of an id shows that id; the shown id was always given in an input.
    - Mutation check (P15): let `hover` set `focused`; confirm P15 fails; revert.
    - Files: `src/graveyard/card.prop.test.ts`, `src/graveyard/test-kit.ts`.
    - **Validates: Requirements 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.14, 6.13, 6.14**

- [ ] 8. The Door and the view switch
  - [ ] 8.1 `src/graveyard/view.ts`
    - Create `View`, `DoorView`, `doorView`, `doorUsable`, `ViewInput`, `ViewFocus` and `viewStep` as in design 3.7: `open` in the Room with a usable Door gives `graveyard` and `first-group`, else nothing changes; `leave` in the graveyard gives `room` and `door`; `phase` forces the Room when the Door is not usable. The initial view is `"room"`.
    - Create `src/graveyard/view.test.ts`: `doorView` for each of the five phases (`usable` and `shut` opposite); `open` in each phase; `leave` in the room and in the graveyard; `phase: lit` closes the view; `phase: snuffed` leaves it open.
    - Files: `src/graveyard/view.ts`, `src/graveyard/view.test.ts`.
    - _Requirements: R3.1, R3.2, R3.5 to R3.7, R3.10 to R3.12, R3.14_

  - [ ] 8.2 Required: P4, the Door is usable exactly when no candle burns
    - **Property 4: The Door is usable exactly when no candle burns**
    - Create `src/graveyard/view.prop.test.ts` (tag Property 4) with `arbViewScript` (a mix of `open`, `leave` and `phase` inputs over all phases) added to `src/graveyard/test-kit.ts`: for any phase `doorView(phase).usable` is true iff the phase is `idle`, `burned-out` or `snuffed`; `shut` always equals `!usable`; and for any engine script (`arbScript`), `doorView(state.phase)` after every step follows the rule for the step's resulting phase. The DOM `hidden` flags are checked in E1 (task 20).
    - Files: `src/graveyard/view.prop.test.ts`, `src/graveyard/test-kit.ts`.
    - **Validates: Requirements 3.1, 3.2, 3.5, 3.6**

  - [ ] 8.3 Required: P5, the Graveyard_View is open only when the Door is usable
    - **Property 5: The Graveyard_View is open only when the Door is usable**
    - Add Property 5 to `src/graveyard/view.prop.test.ts` (tag Property 5): for any sequence of `open`, `leave` and `phase` inputs, starting from the Room, the view is `"graveyard"` only if `doorUsable` holds for the latest phase; `open` while the Door is shut never changes the view; a `phase` input with a running phase always returns the Room.
    - Files: `src/graveyard/view.prop.test.ts`.
    - **Validates: Requirements 3.7, 3.10, 3.11, 3.12**

- [ ] 9. The graveyard key map
  - [ ] 9.1 `src/graveyard/keys.ts`
    - Create `GraveKeyContext`, `GraveKeyAction` and `graveKeyAction(context, key)` as in design 3.8: Ctrl, Alt, Meta and `repeat` do nothing; an open overlay gives `null`; `g` gives `open` in the Room with a usable Door, `leave` in the graveyard, `null` with a text field focused or a shut Door; Escape in the graveyard gives `hide-card` when a card is shown, else `leave`; arrows, Home and End with `onItem` set give `nav` except Up and Down on a Stone; Enter with `onItem` set gives `show-card`, Enter elsewhere in the graveyard gives `null`; in the Room only `g` is claimed.
    - Create `src/graveyard/keys.test.ts`: every rule above, each phase, each focus kind, each overlay, held keys, modifiers.
    - Files: `src/graveyard/keys.ts`, `src/graveyard/keys.test.ts`.
    - _Requirements: R3.3, R3.13, R6.13 to R6.17_

  - [ ] 9.2 Required: P14, the key maps never clash and the Door key obeys the phase
    - **Property 14: The key maps never clash and the Door key obeys the phase**
    - Create `src/graveyard/keys.prop.test.ts` (tag Property 14) with `arbGraveKey` (the Room map's keys, the nav keys, `g`, letters, with modifiers and repeats) added to `src/graveyard/test-kit.ts`: for any key and any context in the Room, if `graveKeyAction` returns an action then `keyAction` returns `null`; for any phase `g` returns `open` only when `doorUsable(phase)`, `leave` only in the graveyard, and `null` with a text field focused or an overlay open; in the Room arrow keys, Home, End and Escape give no graveyard action.
    - Files: `src/graveyard/keys.prop.test.ts`, `src/graveyard/test-kit.ts`.
    - **Validates: Requirements 3.3, 6.15, 6.16, 6.17**

  - [ ] 9.3 Required: P22, the graveyard view never triggers a room action
    - **Property 22: The graveyard view never triggers a room action**
    - Add Property 22 to `src/graveyard/keys.prop.test.ts` (tag Property 22): for any key and any `KeyContext` with `view === "graveyard"` and no overlay open, `keyAction` never returns light, toggle-pause, open-snuff, keep-burning, announce-time or a length change; for any context with `view === "graveyard"` and focus on an item, `graveKeyAction` for Enter returns only `show-card`, and Enter with focus elsewhere in the view returns `null`.
    - Mutation check (P22): drop the `view === "graveyard"` check in `keyAction` of `src/ui/keys.ts`; confirm P22 fails; revert.
    - Files: `src/graveyard/keys.prop.test.ts`.
    - **Validates: Requirements 3.13, 6.16, 6.17**

- [ ] 10. UI-only inputs never change the engine
  - [ ] 10.1 Required: P6, UI-only inputs never change the engine state
    - **Property 6: UI-only inputs never change the engine state**
    - Create `src/graveyard/ui-only.prop.test.ts` (tag Property 6): for any engine script (`arbScript`) and any interleaving of `viewStep` inputs, `cardStep` inputs, `navigate` and `remember` calls, ghosts-setting toggles and `graveKeyAction` results, the final engine state and the serialized session and history are deeply equal to the state after the same engine script alone; none of these functions takes or returns an engine value (checked by their types and by deep-freezing the state).
    - Files: `src/graveyard/ui-only.prop.test.ts`.
    - **Validates: Requirements 1.3, 3.8, 3.15, 3.16, 8.12, 10.5**

- [ ] 11. Purity tests
  - [ ] 11.1 `src/ghosts/purity.test.ts`
    - Use the same comment-stripping, whole-word scanner as `src/ui/purity.test.ts`: `slots.ts`, `visible.ts` and `label.ts` contain none of the forbidden identifiers; they import only `../engine` (index), `../strings`, `../ui/format` and their siblings; `test-kit.ts` is imported by no non-test file; the banned calls (`innerHTML`, `insertAdjacentHTML`, `document.write`, `setAttribute("style"`, `style.cssText`) appear nowhere in `src/ghosts/`; the whole folder has no "pomodoro" (case-insensitive). `layer.ts` is exempt from the identifier scan and is added to the folder-wide scans when it exists (task 14).
    - Files: `src/ghosts/purity.test.ts`.
    - _Requirements: R1.1, R1.3 to R1.5, R1.7, R1.8_

  - [ ] 11.2 `src/graveyard/purity.test.ts`
    - Same scanner: `days.ts`, `visible.ts`, `text.ts`, `geometry.ts`, `focus.ts`, `card.ts`, `view.ts` and `keys.ts` contain none of the forbidden identifiers (including `Date`) and import only `../engine` (index), `../strings`, `../ui/format`, `../ui/layout`, `../ui/keys` (types) and siblings; only `day-key.ts` may read `Date` and the test excludes only that file; the banned calls and "pomodoro" checks apply to the whole folder; no test helper is imported by a source file; `src/ui/` still imports neither `src/ghosts/` nor `src/graveyard/`.
    - Files: `src/graveyard/purity.test.ts`.
    - _Requirements: R1.2 to R1.5, R1.7, R1.8_

- [ ] 12. Checkpoint - Batch 2 ends here
  - Run `npm run verify`. Ensure all tests pass, ask the user if questions arise. Confirm every property test of tasks 2, 3, 5 to 10 ran at 300 runs through `PROP_PARAMS`, with no skipped, `only` or `todo` tests, and that every mutation named above was caught and reverted (`git diff` on the sources is clean). Record counts and mutation results in `KIRO_USAGE.md`.

> **Batch 2 ends here.** Stop this CLI session. Start batch 3 with task 13.

- [ ] 13. The scene label suffix (CR-S1, CR-S2)
  - [ ] 13.1 `Scene.apply(model, extra?)` in `src/scene/`
    - In `src/scene/render.ts` and `src/scene/types.ts` change `Scene.apply` to `apply(model, extra?: { labelSuffix: string })`. The label is `STRINGS.scene[mode] + " " + labelSuffix + "."` and is rewritten when the mode or the suffix changed; without `extra` the label is exactly as today. The model, the flame modes and the light radius do not change (R10.11).
    - Extend `src/scene/render.test.ts`: with and without `extra`; a changed suffix rewrites the label; an unchanged suffix writes nothing; the label for each mode.
    - Update the `candle-scene` spec: design 6 (`render.ts`) for CR-S1, and the reserved-band note for CR-S2 (the bands are now used by ghosts, the Overflow_Mark and the Door). Add an "Amended by ghosts-and-graveyard" note; change nothing else.
    - The scene labels in `e2e/scene.spec.ts` stay valid until task 16 passes a suffix; update the expected text there in task 19.2.
    - Files: `src/scene/render.ts`, `src/scene/types.ts`, `src/scene/render.test.ts`, the `candle-scene` spec files.
    - _Requirements: R10.1, R10.10, R10.11_

- [ ] 14. The ghost layer
  - [ ] 14.1 `src/ghosts/layer.ts` and `src/ghosts/ghosts.css`
    - Create `createGhostLayer(root)` returning `{ apply }` as in design 4.1: one `<svg viewBox="0 0 600 1000" preserveAspectRatio="xMidYMid meet" aria-hidden="true">` over the scene with `pointer-events: none`; up to 12 `<g class="ghost">` groups (`translate(cx cy) scale(size)` around one silhouette path built with `createElementNS`) and one `<text class="overflow">` at `OVERFLOW_MARK`, fill `#efe6cf`. `apply({ ghosts, on, reduced })` keeps a map from `index` to element: removes ghosts not in `drawn` (400 ms fade, immediate when `reduced`), creates new ones in their `slot` (400 ms fade-in), never rewrites an element's slot or size, shows `+n` with `textContent` only when `hidden > 0`, and draws nothing when `on` is false or the view is the graveyard.
    - `ghosts.css`: the silhouette from custom properties; the drift keyframe of at most `DRIFT_UNITS` in x and y with a per-slot period (14 to 22 s) and delay by `data-slot`; `data-reduced="true"` disables drift and fade.
    - Add `layer.ts` to the folder-wide scans of `src/ghosts/purity.test.ts` (no `innerHTML`, no style attribute, no "pomodoro").
    - Files: `src/ghosts/layer.ts`, `src/ghosts/ghosts.css`, `src/ghosts/purity.test.ts`.
    - _Requirements: R1.7, R9.1 to R9.5, R9.11 to R9.18, R10.3, R10.6 to R10.9_

- [ ] 15. The graveyard DOM layer
  - [ ] 15.1 `src/graveyard/day-key.ts`
    - Create `localDayKey(ms)`: `dayKeyFromParts(getFullYear(), getMonth() + 1, getDate())` of `new Date(ms)`; a non-finite `ms` gives `0000-00-00`. It is the only file in the two folders that reads `Date`.
    - Create `src/graveyard/day-key.test.ts` that builds local dates with the `Date` constructor (`new Date(2026, 10, 10, 23, 50)` and `new Date(2026, 10, 11, 0, 15)`) so the expectations hold in any time zone: the keys are "2026-11-10" and "2026-11-11"; a non-finite value gives the unknown date through `formatCarvedDate`.
    - Files: `src/graveyard/day-key.ts`, `src/graveyard/day-key.test.ts`.
    - _Requirements: R2.3, R2.5, R2.12_

  - [ ] 15.2 `src/graveyard/view-dom.ts`
    - Create `createGraveyard(root, hooks)` returning `{ apply, focusFirst, focusDoor }` as in design 4.2 and 4.3: the `<section class="graveyard">` over the stage box with `--u` set from `stageBox`; the Door button (`hidden` = `!doorView(phase).usable`) and the shut door span (`hidden` = `!shut`, `aria-hidden`); `<h2>`, the two `role="group"` Groups with `aria-label`, Stones and Stubs as native `<button type="button">` with `id`, `tabindex` from `tabStops`, `aria-label = itemName`, `aria-describedby` to a visually hidden description span holding the five `cardLines`, Count_Lines and empty lines as `<p>`, the Details_Card (`aria-hidden`, `pointer-events: none`, placed by `placeCard`), and the return button at `DOOR_RECT`. DOM order is the Tab order. Items are rebuilt only when `state.history` (by identity), the day-key function or the view changes. Events as in 4.3: `focusin`/`focusout`, `pointerenter`/`pointerleave` for `mouse`, touch or pen `pointerdown` plus `click` for the tap (dropping the focus event that follows a touch `pointerdown`, D11), tap-away, and one `keydown` listener that builds a `GraveKeyContext` and acts on `graveKeyAction` (`preventDefault` only when there is an action). User text through `textContent` and `setAttribute` only.
    - Files: `src/graveyard/view-dom.ts`.
    - _Requirements: R3.3 to R3.6, R3.13, R3.14, R4.1 to R4.9, R5.3 to R5.9, R6.1 to R6.19, R7.1 to R7.11, R8.8 to R8.11_

  - [ ] 15.3 `src/graveyard/graveyard.css`
    - Panel (`PANEL_RECT`, opaque `#080b12`), items sized `calc(N * var(--u))` from the L7 table, Stone face (date plus intent with `text-overflow: ellipsis`), Stub outline, Day_Shelf rows, the card (opaque `#080b12`, 1 unit ivory border), the Door and shut-door looks, the 3 px ivory focus ring from the controls' focus rule (never `outline: none` without a replacement), the visually hidden description span, `[hidden] { display: none !important }`, no transition anywhere (so reduced motion needs no extra rule), forced-colours and `prefers-contrast: more` rules, no scroll bars, no overflow.
    - Add `view-dom.ts` and `graveyard.css` to the folder-wide scans of `src/graveyard/purity.test.ts` (no `innerHTML`, no style attributes, no "pomodoro", no `outline: none` without a replacement).
    - Files: `src/graveyard/graveyard.css`, `src/graveyard/purity.test.ts`.
    - _Requirements: R3.9, R4.8, R4.13 to R4.15, R6.19_

- [ ] 16. Wire everything in `main.ts`
  - [ ] 16.1 Wiring, announcements and the interface hooks
    - In `src/main.ts` follow design 4.5: create the ghost root and the graveyard root and `createGhostLayer` and `createGraveyard`; keep `let view: View = "room"`; each frame after `dispatch(tick)` compute `spans`, call `ghostLayer.apply({ ghosts: visibleGhosts(spans, GHOST_SLOTS.length), on: settings.ghosts && view === "room", reduced })`, `scene.apply(model, { labelSuffix: countWords(distractionCount(state)) })`, `viewStep(view, { type: "phase", phase })` (clearing the card state when the Room is forced) and `graveyard.apply({ view, door: doorView(state.phase), history: state.history, dayKeyOf: localDayKey })`. The interface receives the current `view` so `keyAction` and `viewOf` see it (CR1, CR-V1); the graveyard hooks (`onKey`, `onView`) call `viewStep`, `cardStep` and `navigate` and never call `dispatch`. On a view change call the interface's `announce` once with `STRINGS.graveyard.announceOpen` or `announceLeave`, then move focus with `focusFirst()` or `focusDoor()` in the same frame (CR3). Import `./ghosts/ghosts.css` and `./graveyard/graveyard.css`. Guard with the existing `#app` check.
    - `Date.now()` stays read only in the loop, the visibility clock and `src/ui/dom/events.ts`; neither new folder reads the clock.
    - Files: `src/main.ts`, and the small `src/ui/index.ts` and `src/ui/dom/events.ts` changes that pass `view` through.
    - _Requirements: R1.3, R3.5 to R3.8, R3.10 to R3.15, R7.10, R10.1 to R10.5_

  - [ ] 16.2 Run the page by hand once
    - Start `npm run dev` as a background process (never in the foreground), then check by hand with the Playwright MCP: the Door is a shut door while a session burns; after a stored burned-out session the Door opens with a click and with `g`; the view shows a stone and a stub; hover and keyboard focus show a card; Escape hides the card, then leaves; focus returns to the Door; hide the tab during a session and see a ghost. Stop the server afterwards and delete anything the check created outside `test-results/`.
    - Files: none.
    - _Requirements: R3, R5, R6, R9_

- [ ] 17. Strings use check
  - [ ] 17.1 Every new string is used
    - Extend `src/strings.test.ts`: every key of `count`, `ghosts` and `graveyard` is used by some file in `src/ghosts/` or `src/graveyard/`; every key those folders use exists; no visible string literal in their non-test files outside `strings.ts` (the heuristic of `src/ui/strings.test.ts`); no "Pomodoro" anywhere.
    - Files: `src/strings.test.ts`.
    - _Requirements: R1.6, R1.8_

- [ ] 18. Checkpoint - Batch 3 ends here
  - Run `npm run verify`. Ensure all tests pass, ask the user if questions arise. Existing `e2e/scene.spec.ts` cases may need the Door and the label suffix taken into account: note which, they are fixed in task 19.2. Record counts in `KIRO_USAGE.md`.

> **Batch 3 ends here.** Stop this CLI session. Start batch 4 with task 19.

- [ ] 19. Browser test helpers and existing suites
  - [ ] 19.1 `e2e/graveyard-fixtures.ts`
    - Build the session and history with `serializeSession` and `serializeHistory` and write them to `localStorage` through `addInitScript`, like `e2e/scene-fixtures.ts`; no hook in shipped code (R11.4). Provide: `openGraveyardApp(browser, options)` (stored session, stored history, viewport, reduced motion, touch, `page.clock.install`); `smallHistory` (3 to 5 entries across 2 days); `largeHistory` (200 sessions over 45 days with both outcomes and long intents); `historyWith(n)`; a session fixture with `n` distractions (0, 1, 12, 21); helpers `doorState(page)` (the `hidden` flags of the button and the shut door), `itemIds(page)`, `rectOf(page, selector)`, `scrolls(page)` and `focused(page)`; the viewport constants (phone 360 x 640, desktop 1280 x 800, 768 x 1024, 1920 x 1080).
    - Add a one-test smoke in `e2e/graveyard.spec.ts` that opens the page with a stored burned-out session and sees the usable Door, to prove the helpers.
    - Files: `e2e/graveyard-fixtures.ts`, `e2e/graveyard.spec.ts`.
    - _Requirements: R11.3, R11.4_

  - [ ] 19.2 Fix the existing suites
    - Run the whole existing e2e suite (`npm run e2e`) and fix every case that the Door, the ghost layer, the new CSS or the label suffix changed, by changing the test, not the scene: the scene label text in `e2e/scene.spec.ts`, any pixel check that now sees the Door, the zone-clear test (the Door is outside the zone), the `getByRole("heading")` smoke test. Check that the live smoke test (`e2e/live.spec.ts`) still passes against `vite preview`.
    - Files: `e2e/scene.spec.ts`, `e2e/smoke.spec.ts`, `e2e/live.spec.ts` only if needed.
    - _Requirements: R11.14_

- [ ] 20. E1 and E7: the Door and the first view
  - [ ] 20.1 Write E1 and E7 in `e2e/graveyard.spec.ts`
    - **E1**: during `lit` and `paused` the Door button's `hidden` flag is set and the shut door's is not (the DOM check for Property 4), Tab never reaches the Door (walk the whole Tab order) and `g` does nothing; in `idle`, `burned-out` and `snuffed` the flags are the other way round, in the frame the phase changes (run the clock past the end and read the flags before and after); after burn-out the Door is a button, `g` opens the view and the Shelf shows the new Stub.
    - **E7**: a reload with a stored `lit` session opens in the Room; a view opened from `burned-out` returns to the Room when a new session is lit (phase change); the view is never stored.
    - Files: `e2e/graveyard.spec.ts`.
    - _Requirements: R3.1 to R3.6, R3.10 to R3.12, R11.7, R11.8_

- [ ] 21. E2: items by keyboard and cards by tap
  - [ ] 21.1 Write E2 in `e2e/graveyard.spec.ts`
    - Every drawn Item is reachable by keyboard alone (Tab, then arrows, Home, End) and each focus shows its card; every Details_Card is reachable by tap alone (`hasTouch`, tap, tap again hides, tap elsewhere hides); the text of each card equals the values of the stored history (planned length, distractions, time away, date, intent or the placeholder); hover shows a card without moving focus; Escape hides the card and keeps focus, a second Escape leaves the view and focuses the Door; the room keys (Enter, Space, `t`) do nothing in the view; Enter on an item shows its card only.
    - Files: `e2e/graveyard.spec.ts`.
    - _Requirements: R5.3 to R5.15, R6, R11.5, R11.6_

- [ ] 22. E3: layout with a small and a large history
  - [ ] 22.1 Write E3 in `e2e/graveyard-layout.spec.ts`
    - For `smallHistory` and `largeHistory` at 360 x 640, 768 x 1024, 1280 x 800 and 1920 x 1080: no scroll in either direction; no two items, Count_Lines, empty lines, "+n more", card and return control overlap; everything lies inside the viewport and inside the stage box; item rectangles equal the `geometry.ts` values scaled by `stageBox` (within 1 px); hit sizes at least 44 px at 360 x 640; the Count_Lines read the exact numbers (the large history: 190 hidden snuffed or the exact counts computed from the fixture, hidden days, "+n more"); the Floor_Band and the visible controls (Settings) do not overlap the view; an empty history shows both empty-state lines and no Tab stop in the Groups.
    - Files: `e2e/graveyard-layout.spec.ts`.
    - _Requirements: R4.9 to R4.12, R8.8 to R8.11, R11.9_

- [ ] 23. E4: ghosts in the room
  - [ ] 23.1 Write E4 in `e2e/ghosts.spec.ts`
    - For 0, 1, 12 and 21 distractions: the right number of `.ghost` groups, the Overflow_Mark `+9` only at 21, the scene's `aria-label` ends with the exact count in words, and the bounding boxes of all ghosts and the mark do not intersect the candle column (x 160..440), the floor band, each other, `DOOR_RECT` or the visible setup controls in `burned-out` and `snuffed`; each ghost keeps its slot when a 22nd distraction is added (read positions before and after) and the oldest fades out; sizes grow with time away; in `idle` nothing is drawn; ghosts stay in `burned-out` and `snuffed`.
    - Files: `e2e/ghosts.spec.ts`.
    - _Requirements: R9, R10.1, R10.2, R11.10_

- [ ] 24. E5: reduced motion and ghosts off
  - [ ] 24.1 Write E5 in `e2e/ghosts.spec.ts`
    - With `prefers-reduced-motion: reduce`: `getAnimations()` is empty on the ghost layer, a new ghost appears and an old one leaves instantly, the view opens and closes with no transition, and the still version shows the same count, sizes and Overflow_Mark as the moving one. With motion allowed the drift stays inside each slot's cell (sample positions over several seconds of clock). With the setting "ghosts" off: no ghost and no mark, the scene label still gives the count, and turning the setting on and off sends no engine event (the stored session is byte-equal before and after). The ghost layer draws nothing while the graveyard view is open.
    - Files: `e2e/ghosts.spec.ts`.
    - _Requirements: R10.3 to R10.9, R4.15_

- [ ] 25. E6: accessibility, focus indicator and contrast
  - [ ] 25.1 `ariaSnapshot` of the Graveyard_View
    - In `e2e/graveyard-a11y.spec.ts` compare `locator.ariaSnapshot()` of the view (small and large history, empty history) with hand-written snapshots: the heading, the two `group` roles with names, each Item as a `button` with its name, each description present in the tree whether or not a card is shown, the Count_Lines as text, the return button; no `listbox`, `option` or `grid` role; the Door as a button only in usable phases and absent while shut; the live log gets exactly one line on open and one on leave; the scene label gives the count in every case of R10.1 (0, 1, 3, 14, ghosts off, count over G).
    - Files: `e2e/graveyard-a11y.spec.ts`.
    - _Requirements: R7.1 to R7.11, R10.1, R11.15_

  - [ ] 25.2 Focus indicator and text contrast
    - In `e2e/graveyard-a11y.spec.ts`: the computed focus ring (3 px, ivory, offset) on an Item, the Door and the return control, plus a pixel check of the ring against its surroundings at least 3:1; measure the contrast of Item text, Count_Lines, empty-state lines, Details_Card text and the Overflow_Mark from computed colours against the real backgrounds and compare with the values asserted by `contrast.test.ts`.
    - Files: `e2e/graveyard-a11y.spec.ts`.
    - _Requirements: R4.14, R6.19, R9.14, R11.16, R11.17_

- [ ] 26. Screenshots
  - [ ] 26.1 Add the new shots to `e2e/screenshots.spec.ts`
    - Add, with `animations: "disabled"` and the opt-in `CANDLEWATCH_SHOTS=1` rule of `controls-and-access` (without it the spec writes under `test-results/` and never into `docs/screenshots/`): `ghosts-0-desktop.png`, `ghosts-1-desktop.png`, `ghosts-g-desktop.png`, `ghosts-g-plus-9-desktop.png`, the same four at phone size (`-phone`), and `ghosts-g-plus-9-desktop-reduced.png` (9 files); `graveyard-small-desktop.png`, `graveyard-large-desktop.png`, `graveyard-card-keyboard-desktop.png`, `graveyard-card-touch-phone.png`, each at desktop and phone, and `graveyard-large-desktop-reduced.png` (9 files). Names follow `<screen>-<state>-<size>[-reduced].png`. The tests do not compare pixels. The 21 existing `candle-*` shots keep their names.
    - Files: `e2e/screenshots.spec.ts`.
    - _Requirements: R11.10 to R11.13_

  - [ ] 26.2 Retake all 21 `candle-*` screenshots, then look at each
    - The Door is drawn in every Room phase (usable or shut), so every `candle-*` screenshot changes (CR-E, R11.14). Run `$env:CANDLEWATCH_SHOTS = "1"; npx playwright test e2e/screenshots.spec.ts`, then clear the variable.
    - **Look at every one of the 21 PNGs** (`docs/screenshots/candle-<state>-<desktop|phone|desktop-reduced>.png`, open each file with the image reader). For each, record in `KIRO_USAGE.md`: it shows the state in its name; the Door is a shut door in `lit-*` and `paused-*` and a usable door in `idle-*`, `burned-out-*` and `snuffed-*`; the Door sits in the left band, clear of the candle, the window, the controls and the floor band; ghosts (if any are stored in the fixture) are in the bands only; nothing else changed. If a shot is wrong, fix the cause (CSS, layout, wiring) and retake every affected shot; do not edit PNGs.
    - Files: `docs/screenshots/candle-*.png` (21 files).
    - _Requirements: R11.14_

  - [ ] 26.3 Take the new `ghosts-*` and `graveyard-*` screenshots, then look at each
    - Take the 18 new shots of 26.1.
    - **Look at every one of the 18 PNGs.** For each, record in `KIRO_USAGE.md`: it shows the screen in its name; `ghosts-0` has no ghost and no mark; `ghosts-1` has one; `ghosts-g` has 12 and no mark; `ghosts-g-plus-9` has 12 and the mark `+9`, clear of the candle and the floor band; the graveyard shots show stones, shelves and Count_Lines readable and inside the frame with no overlap; the keyboard shot shows the focus ring and the card for the focused Item; the touch shot shows a card opened by tap and does not cover its Item; the reduced-motion shots show the same information as the normal ones; text is readable at its size. If a shot is wrong, fix the cause and retake every affected shot.
    - Files: `docs/screenshots/ghosts-*.png` (9 files), `docs/screenshots/graveyard-*.png` (9 files).
    - _Requirements: R11.10 to R11.13_

- [ ] 27. Costume review
  - [ ] 27.1 Run the Costume_Reviewer and record its findings in Decision D12
    - Run the `costume-reviewer` agent in the Kiro CLI (`kiro-cli chat --agent costume-reviewer`) on the finished ghosts, graveyard and shelf, with the new `ghosts-*` and `graveyard-*` screenshots and the retaken `candle-*` shots as input. It applies its three rules: every spooky element shows one piece of state (R4.6, R4.7, R4.8, R9.3); reduced motion still shows it (R10.6, R10.9); the time text keeps WCAG AA contrast (R4.14, R9.14).
    - Record its verdict and findings in `design.md` Decision **D12** (replace the "To be recorded by the final task" text), apply them (fix, retake the affected screenshots, look at them), and repeat until it passes. If the agent cannot be run, say so and stop: do not substitute another review and call it this one. Edit `design.md` only in D12 and keep the file valid for `validate_spec_format`.
    - Files: `.kiro/specs/ghosts-and-graveyard/design.md` (D12), and whatever the findings change.
    - _Requirements: R11.18_

- [ ] 28. Wrap-up
  - [ ] 28.1 Verify, log and summarise
    - Run `npm run verify` and confirm every property test ran with its full number of runs (all through `PROP_PARAMS`, no literal lower `numRuns`, no skipped, `only` or `todo` tests); report the unit file and test counts and the e2e count against the counts recorded at the start of task 1.
    - Update `.kiro/steering/structure.md`: `src/ghosts/` and `src/graveyard/` are implemented (list their files), `e2e/` holds the new specs and fixtures, the boundaries section names the two folders and the new purity tests.
    - Confirm `docs/screenshots/` holds the 21 `candle-*` files, the 9 `ghosts-*` files and the 9 `graveyard-*` files, and that no screenshot is older than the last change to `src/ghosts/`, `src/graveyard/`, `src/ui/`, `src/scene/` or `src/main.ts`.
    - Add the final `KIRO_USAGE.md` entry: surface used, what was produced, the property failures with counterexamples and seeds, the mutation results (P1, P8, P12, P13, P15, P19, P20, P22, and the P10 mutation of task 1.3), the screenshot checks (tasks 26.2 and 26.3), the costume review (task 27.1), and the final counts.
    - Write the summary: it names which `candle-*` screenshots changed. All 21 changed, because the Door is drawn in every Room phase (R11.14); list them by name (`candle-idle`, `candle-lit-start`, `candle-lit-half`, `candle-lit-last-minute`, `candle-paused`, `candle-burned-out`, `candle-snuffed`, each at desktop, phone and desktop-reduced), and say which of them also show ghosts.
    - Files: `.kiro/steering/structure.md`, `KIRO_USAGE.md`.
    - _Requirements: all_

> **Batch 4 ends here.** The spec is complete when `npm run verify` passes and the costume reviewer's last pass is PASS.

## Notes

- Property tasks are required in this plan; none is marked optional. Each one carries its property number from design section 9 and the requirement clauses it validates.
- Mutation checks are listed per property as in design 8.4 (P1, P8, P12, P13, P15, P19, P20, P22); the P10 layout mutation of `controls-and-access` is task 1.3.
- The DOM layers have no unit tests (no DOM library by R1.9); they are covered by E1 to E7 and the accessibility, focus and contrast checks.
- Batch boundaries: batch 1 is tasks 1 to 4, batch 2 is 5 to 12, batch 3 is 13 to 18, batch 4 is 19 to 28. Within a batch, run tasks in order; the dependency graph below is a guide to which tasks touch different files.

## Coverage check

| Requirement | Tasks |
|---|---|
| R1 | 1.4, 2.2, 3.8, 11.1, 11.2, 14.1, 15.1, 15.2, 16.1, 17.1 |
| R2 | 1.4, 3.1, 3.2, 3.3, 3.9, 15.1 |
| R3 | 1.1, 1.2, 1.3, 5.1, 8.1, 8.2, 8.3, 9.1, 10.1, 15.2, 16.1, 20.1 |
| R4 | 1.1, 3.4, 5.1, 5.4, 15.2, 15.3, 22.1, 24.1 |
| R5 | 5.1, 7.1, 7.2, 3.8, 15.2, 21.1 |
| R6 | 6.1, 6.2, 6.3, 9.1, 9.2, 9.3, 15.2, 21.1, 25.2 |
| R7 | 3.8, 3.12, 15.2, 16.1, 25.1 |
| R8 | 3.4 to 3.7, 3.10, 3.11, 22.1 |
| R9 | 2.1 to 2.4, 14.1, 23.1, 25.2 |
| R10 | 2.5, 2.6, 13.1, 14.1, 16.1, 24.1, 25.1 |
| R11 | 19.1, 19.2, 20.1, 21.1, 22.1, 23.1, 24.1, 25.1, 25.2, 26.1 to 26.3, 27.1 |

| Property | Task |
|---|---|
| P1 | 3.2 |
| P2 | 3.3 |
| P3 | 3.9 |
| P4 | 8.2 (DOM flags in 20.1) |
| P5 | 8.3 |
| P6 | 10.1 (extends P8 ops, task 1.3) |
| P7 | 3.5 |
| P8 | 3.6 |
| P9 | 3.7 |
| P10 | 3.10 |
| P11 | 3.11 |
| P12 | 6.2 |
| P13 | 6.3 |
| P14 | 9.2 |
| P15 | 7.2 |
| P16 | 5.2 |
| P17 | 5.3 |
| P18 | 3.12 |
| P19 | 2.3 |
| P20 | 2.4 |
| P21 | 2.6 |
| P22 | 9.3 |

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.4"] },
    { "id": 1, "tasks": ["1.3", "1.5"] },
    { "id": 2, "tasks": ["2.1", "3.1"] },
    { "id": 3, "tasks": ["2.2", "2.5", "3.2", "3.4", "3.8"] },
    { "id": 4, "tasks": ["2.3", "2.6", "3.3", "3.5", "3.9"] },
    { "id": 5, "tasks": ["2.4", "3.6", "3.11"] },
    { "id": 6, "tasks": ["3.7", "3.12"] },
    { "id": 7, "tasks": ["3.10"] },
    { "id": 8, "tasks": ["5.1", "5.4", "6.1", "7.1", "8.1", "9.1"] },
    { "id": 9, "tasks": ["5.2", "6.2", "11.1", "11.2"] },
    { "id": 10, "tasks": ["5.3", "6.3", "7.2"] },
    { "id": 11, "tasks": ["8.2"] },
    { "id": 12, "tasks": ["8.3", "9.2"] },
    { "id": 13, "tasks": ["9.3", "10.1"] },
    { "id": 14, "tasks": ["13.1", "14.1", "15.1"] },
    { "id": 15, "tasks": ["15.2", "15.3"] },
    { "id": 16, "tasks": ["16.1"] },
    { "id": 17, "tasks": ["16.2", "17.1"] },
    { "id": 18, "tasks": ["19.1", "19.2"] },
    { "id": 19, "tasks": ["20.1", "22.1", "23.1", "25.1"] },
    { "id": 20, "tasks": ["21.1", "24.1", "25.2"] },
    { "id": 21, "tasks": ["26.1"] },
    { "id": 22, "tasks": ["26.2"] },
    { "id": 23, "tasks": ["26.3"] },
    { "id": 24, "tasks": ["27.1"] },
    { "id": 25, "tasks": ["28.1"] }
  ]
}
```