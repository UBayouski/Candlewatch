# Requirements: distraction-tracking

Source: `docs/BRIEF.md` section 3 (Distraction) and section 4 (Ghosts row), constrained by `.kiro/steering/product.md` and `tech.md`. It builds on the finished `session-engine` spec in `.kiro/specs/session-engine/` (requirements R1-R12, design, Decisions), whose `Session` and `HistoryEntry` already carry `distractions` and `timeAwayMs`, and whose `hide` and `show` events are currently no-ops that never settle.

## Introduction

While a session is `lit`, each time the page goes hidden and comes back is one distraction, with its time away measured from timestamps. A distraction never changes the timer; it only summons a ghost. This spec adds the accounting to the pure engine, the selectors the scene will read to size its ghosts, the persistence of the new fields, and the thin browser wiring that turns the Page Visibility API into `hide` and `show` events. Drawing ghosts, drifting them, the ghosts on/off setting and sound belong to other specs.

Where this spec changes a session-engine rule, the change is listed under "Changes to session-engine" (approved). The session-engine design Decisions (item 9) records it; its requirements, code and tests change when this spec's tasks run.

## Glossary

- **Open hide**: a `hide` accepted while `lit` that has not yet been closed. At most one exists at a time. It is part of the running state.
- **Distraction**: one completed hide-and-return while the session was `lit`. It has a **time away** (span) in ms.
- **Closing a hide**: turning the open hide into a distraction: `distractions + 1`, `timeAwayMs + span`, and the span added to the list of spans.
- **Span**: `close instant - open instant`, never negative.
- **Exit instant**: the true instant a session leaves `lit`: the pause instant, the snuff instant, or the completion instant (session-engine R3, R5, R6).
- **Settled**: handled after the session-engine `settle` step has applied any completion or pause-limit that is already due (session-engine R5.4).

## Requirements

### R1. Opening a hide

**User story:** As a user, I want leaving the page while my candle burns to be noticed.

1. WHEN `hide` is received while the (settled) phase is `lit` and no hide is open, THE engine SHALL record an open hide at the instant `max(now, litSince)`.
2. Opening a hide SHALL NOT change the distraction count or time away yet; a distraction is counted when it is closed (R2, R6).
3. The open hide SHALL be at most one: a second `hide` while one is open is ignored (R3).

### R2. Closing a hide on return

**User story:** As a user, I want coming back to the page to produce a ghost.

1. WHEN `show` is received while the (settled) phase is `lit` and a hide is open, THE engine SHALL close the hide at the instant `max(now, open instant)`.
2. Closing SHALL add one to the distraction count, add the span to the total time away, append the span to the session's list of spans (R9), and clear the open hide.
3. Each pair of `hide` then `show` while `lit` SHALL therefore count exactly once, however many `tick` events or other `hide`/`show` events (R3) happen in between.

### R3. What does not count

**User story:** As a user, I do not want ghosts for times when the candle was not burning.

1. WHEN `hide` is received while the (settled) phase is `idle`, `paused`, `burned-out` or `snuffed`, THE engine SHALL leave the distraction fields unchanged. It returns the settled state, as any invalid event does (session-engine R1.3).
2. WHEN `hide` is received while a hide is already open, THE engine SHALL return the state unchanged (the same value).
3. WHEN `show` is received and no hide is open (any phase), THE engine SHALL return the settled state with the distraction fields unchanged.
4. A page hidden during a pause and shown again during the same pause SHALL leave no trace. Because `hide` is ignored while `paused`, the later `show` has no open hide to close and is ignored (R3.3).

### R4. Time away from timestamps

**User story:** As a user, I want the time away to be right even if the page was throttled or the clock jumped.

1. A span SHALL be computed from stored timestamps only: `close instant - open instant`, where the close instant is `max(now, open instant)` (session-engine R4.5), so a span is never negative.
2. `timeAwayMs` SHALL be the sum of the session's spans, and the distraction count SHALL be their number.
3. WHEN `now` does not decrease between events, the total time away of a session SHALL NOT exceed its wall-clock duration (end time minus start time), because every span lies inside a `lit` interval. If the clock moves backwards, a span is still never negative and the count, the list of spans and their sum still agree (D3); only this wall-clock bound is not guaranteed.
4. All values SHALL be integer milliseconds (session-engine R12.4: `now` is floored).

### R5. Distractions never change the timer

**User story:** As a user, I want a distraction to cost me a ghost, not time.

1. `hide` and `show` SHALL NOT change the burn time, time left, wax fraction, `startedAt`, `lengthMin`, `pausedTotalMs`, `litSince`, `pausedAt`, completion instant, pause-limit instant, `endedAt` or `breakEndsAt`.
2. The only fields `hide` and `show` may change are the open hide, the session's distraction count, total time away and list of spans, and the corresponding fields of a history entry created in the same step by settling (R6, R8).
3. The state after `hide` or `show` at time `T` SHALL equal the state after `tick` at time `T`, except for those distraction fields.

### R6. Settling and the true instant

**User story:** As a user, I want a distraction to be dated to what really happened, even if the page only noticed late.

1. `hide` and `show` SHALL settle the session first, like every other event except `tick` (this removes the session-engine R5.4 exemption; see "Changes to session-engine").
2. WHEN a candle completes while a hide is open, THE engine SHALL close that hide at the completion instant (the true end), count it, and put the result in the history entry. The time away is `completion instant - open instant`, however late the page returns.
3. A `hide` that arrives after the true end SHALL NOT count (R3.1), even if the engine has not yet seen the end: the event settles the session first, then finds it final.
4. A `show` that arrives after the true end SHALL find the session already settled with its hide closed at the true end (R6.2), and is then ignored (R3.3).
5. A session in `paused` never has an open hide (R7.1), so a session snuffed by the pause limit keeps exactly the counts it had when it was paused.

### R7. Leaving `lit` with an open hide

**User story:** As a user, I want a hide that was still open when the candle stopped burning to be accounted for exactly once.

1. WHEN a session leaves `lit` for any reason while a hide is open, THE engine SHALL close the hide at the exit instant (`max(exit instant, open instant)`), count it, and clear the open hide:
   - `pause`: the exit instant is the pause instant (`pausedAt`);
   - `snuff`: the exit instant is the snuff end time;
   - completion: the exit instant is the true completion instant.
2. The distraction counts once, as one closed hide, with the span up to the exit instant. A hide still open at the end therefore appears in the history entry as a distraction (the user did leave during the session).
3. No open hide SHALL exist in any phase other than `lit`.

### R8. History

**User story:** As a user, I want the graveyard and shelf to know how distracted each session was.

1. WHEN a session enters `burned-out` or `snuffed`, THE history entry SHALL carry the session's distraction count and total time away as they stand after any open hide is closed (R7).
2. Entries are otherwise unchanged (session-engine R10): immutable once added, one per ended session.
3. WHEN `now` does not decrease between events, an entry's time away SHALL NOT exceed `endedAt - startedAt`. If the clock moves backwards, an entry's spans are still never negative and the count and total still agree with them (D3); only this bound is not guaranteed.

### R9. Ghost inputs (selectors only)

**User story:** As the scene author, I want pure numbers to size ghosts from, not drawing code.

1. The session SHALL keep the list of completed spans, in order, for the running session (the current or just-ended one). Its length equals the distraction count and its sum equals `timeAwayMs`.
2. The engine SHALL provide pure selectors, total for every state:
   - `distractionCount(state)`: the count for the current session, `0` for `idle`;
   - `ghostSpansMs(state)`: the completed spans of the current session, oldest first, `[]` for `idle`. One ghost per element (brief section 4, Ghosts row);
   - `ghostSize(spanMs)`: a number in `[0.25, 1]`, defined as `GHOST_MIN_SIZE + (1 - GHOST_MIN_SIZE) * sqrt(min(1, span / GHOST_FULL_SIZE_MS))` with `GHOST_MIN_SIZE = 0.25` and `GHOST_FULL_SIZE_MS = 5 minutes`. It equals `0.25` at span `0`, never decreases as the span grows, and equals `1` from 5 minutes on. The floor guarantees that every counted distraction has a visible ghost (product rule: every element shows state).
3. The selectors SHALL NOT depend on `now`: an open hide has no ghost until it is closed.
4. History entries keep only the count and total time away; ghost spans are not stored in history.

### R10. Persistence and reload

**User story:** As a user, I want my ghosts and my open hide to survive a reload.

1. The serialized current-session document SHALL carry the new fields: the list of spans, and, for `lit`, the open hide (or none).
2. The session document version SHALL become `2`. Version `1` session documents SHALL still be read: a missing open hide means none, and a missing list of spans means `[]` (version 1 documents always have zero distractions). The history document is unchanged and stays at version `1`.
3. Validation SHALL reject (falling back to idle, session-engine R9.4) a session document where: spans are not non-negative integers; the number of spans differs from `distractions`; their sum differs from `timeAwayMs`; an open hide appears in a phase other than `lit`; or the open instant is before `litSince` or not before the completion instant.
4. A `lit` state with an open hide SHALL survive a reload: the open hide stays open across the reload (the engine's `reload` only settles; session-engine R9.2). If the session completed while the page was closed, the settle closes the hide at the true completion instant (R6.2).
5. The browser wiring tells the engine what the page is doing right after a reload (R11.3). Time spent with the page closed after an open hide counts as time away, because it is measured from the stored open instant.
6. Serializing a state and restoring it SHALL give an equal state, for every state the engine can produce, including states with an open hide and with spans. Reload at time `T` SHALL still equal `tick` at time `T` (session-engine P8).
7. The unreadable-text backup (session-engine R11.4) applies unchanged to the new version.

### R11. Browser wiring (outside the engine)

**User story:** As a maintainer, I want the Page Visibility API kept out of the pure engine.

1. A module in `src/distraction/` SHALL translate visibility changes into `hide` and `show` events. The engine SHALL NOT import it or touch `document`, `window` or any event target (session-engine R11.1; the purity test keeps checking this).
2. The module SHALL be given its inputs rather than reaching for globals: a document-like object (`visibilityState`, `addEventListener`, `removeEventListener`), a clock function returning `now`, and a `send(type, now)` callback. It SHALL return a function that stops listening.
3. `watchVisibility` SHALL map `visibilityState === 'hidden'` to `hide` and `'visible'` to `show` on each `visibilitychange`. A separate `syncVisibility` SHALL send the event that matches the current `visibilityState` once, for use right after a reload: `show` closes a persisted open hide; `hide` is ignored when a hide is already open (R3.2).
4. `main.ts` (not part of this spec's code) will call `step` with the event and `Date.now()` and then `save` as it does for every other event (session-engine R11.3).

### R12. Engine contract preserved

1. The event set SHALL stay exactly `light`, `pause`, `resume`, `snuff`, `tick`, `hide`, `show`, `reload`. No new events.
2. `step` SHALL stay total, pure, non-mutating, and SHALL keep returning the same reference when an event changes nothing (session-engine R12).
3. Non-finite `now` SHALL still return the state unchanged and floor otherwise (session-engine R12.4).

## Property-based tests (fast-check)

Files: `*.prop.test.ts`, colocated in `src/engine/` and `src/distraction/`. Same rules as session-engine: at least 300 runs each, no weakening a property to make it pass. Scripts reuse the session-engine test kit (`hide`/`show` steps already exist in it), extended with a reference model where noted.

| ID | Property | Covers |
|---|---|---|
| D1 | Distractions never change the timer: running any script with every `hide`/`show` step replaced by a `tick` at the same time gives, at every step, the same phase, the same time left, wax fraction, `startedAt`, `pausedTotalMs`, `litSince`, `pausedAt`, `endedAt` and `breakEndsAt`, and the same history apart from the distraction fields. | R5, brief section 12 |
| D2 | The distraction count equals the number of completed hide-show pairs while lit, plus one for a hide still open when the session leaves `lit`. A small independent reference interpreter of R1-R3 and R7 over the same script is compared with the engine. | R1, R2, R3, R7 |
| D3 | Time away is the sum of the spans and never negative: in every state of every run, including a clock that moves backwards, every span is an integer `>= 0`, the number of spans equals the count and their sum equals `timeAwayMs`. When `now` does not decrease between events, a final session's total also never exceeds `endedAt - startedAt` (and, for a burned-out session, the session length). | R4, R8.3, R9.1 |
| D4 | True-instant dating: for a hide opened at `h` that is still open when the candle completes at `C` (or is paused or snuffed at `x`), whatever event notices it, however late, the history entry has exactly one more distraction and time away `C - h` (or `x - h`). A `show` after the end never changes the entry. | R6, R7, R8 |
| D5 | What does not count: `hide` in `idle`, `paused`, `burned-out` or `snuffed`, a second `hide` while open, and a `show` with no open hide never change the distraction fields; duplicate and stray events return the settled state unchanged. | R3 |
| D6 | Serialization: for every state of generated runs, including an open hide and spans, restore of serialize is the identity, and `reload` at `T` equals `tick` at `T`. Version 1 session documents (generated from states with no distractions) restore to the same states with `[]` spans and no open hide. Corrupted new fields give idle without throwing. | R10 |
| D7 | History matches the session: every history entry's count and time away equal the session totals at the moment it ended, entries are never changed afterwards, and, when `now` does not decrease between events, `timeAwayMs <= endedAt - startedAt`. | R8 |
| D8 | Ghost selectors: `ghostSpansMs(state)` has `distractionCount(state)` elements summing to `timeAwayMs`; `ghostSize` stays in `[0.25, 1]`, equals `0.25` at span `0`, never decreases as the span grows, and equals `1` from 5 minutes on. | R9 |

Example-based tests (not property-based) cover: a hide and show in the middle of a candle (count 1, span exact); hide at minute 20 of 25 with the show at minute 40 (span 5 minutes, ended at minute 25); pause while hidden; hide while paused ignored; hide at the exact completion instant (ignored, not counted); the same-millisecond hide and show (span 0, counted); version 1 document migration; and the visibility wiring with a fake document (hide/show mapping, `syncVisibility`, unsubscribe).

## Changes to session-engine (approved)

This spec reverses one session-engine decision and extends three others. The changes are approved. Session-engine design Decisions item 9 records this; the rest is done when this spec's tasks run, with these edits in its documents and tests:

1. **`hide`/`show` settle again.** Decision 2 of the design ("`hide`/`show` do not settle") and the `hide`/`show` exemption in R5.4 are removed. Argument: a `hide` after the true end must not count (R3.1), and a `show` after the true end must date the away time to the end (R6.2). Both require the session to be settled before the event is handled. If `hide` and `show` stayed exempt, an unsettled `lit` state would accept a hide that happened after the candle had already burned out. Settling on every event also removes the narrowing of P3 (Decision 8): P3 goes back to strict equality after every event, with no `hide`/`show` exception.
2. **R8.2** ("`hide` and `show` ... SHALL return the state unchanged") is replaced by this spec's R1-R6; session-engine P9 ("`hide` and `show` never change state") is replaced by D1 and D5.
3. **Types and schema.** `LitState` gains the open hide; `Session` gains the list of spans; the session document goes to version 2 with version 1 still readable (R10). History entries and the history document are unchanged.
4. **Tasks.** Session-engine tests that assert `step(s, hide|show) === s` (the `hide`/`show` example tests and P9) and the P3 exemption need updating in this spec's tasks.

## Out of scope

Drawing, drifting or hiding ghosts, the ghosts on/off setting, sound, the page title, per-distraction details in the graveyard or shelf hover (history keeps only the count and total), notifications, focus/blur events other than visibility, and the `main.ts` wiring beyond what R11 states.

## Decisions

Review outcomes for the five open questions.

- **Q1. `hide` and `show` settle (R6.1): yes.** The "Changes to session-engine" section is approved as written. Session-engine design Decisions item 9 now reads "approved, applied by distraction-tracking tasks".
- **Q2. Pause with a hide open (R7.1): yes.** The open hide is closed and counted at the pause instant.
- **Q3. Spans (R9.1): yes.** The list of spans is stored on the running session only. History keeps only the count and the total time away.
- **Q4. Ghost size (R9.2): changed.** The curve has a floor so that a counted distraction always has a visible ghost: `ghostSize(span) = GHOST_MIN_SIZE + (1 - GHOST_MIN_SIZE) * sqrt(min(1, span / GHOST_FULL_SIZE_MS))`, with `GHOST_MIN_SIZE = 0.25` and `GHOST_FULL_SIZE_MS = 5 minutes`. The result is in `[0.25, 1]`, equals `0.25` at span 0, never decreases, and equals `1` from 5 minutes on. R9.2 and D8 are updated.
- **Q5. Open hide across a reload (R10.4, R10.5): yes.** The open hide stays open across a reload and the whole gap counts as time away. Every hide-and-return counts, including span 0. A page refresh during a lit session therefore counts as one short distraction, because browsers report the page hidden while it unloads. This is accepted as consistent with "leaving the page".
- **Design review: backward clock (R4.3, R8.3, D3, D7): narrowed.** The wall-clock bound on total time away (`endedAt - startedAt`) is guaranteed only when `now` does not decrease between events. A backward clock still never gives a negative span, and the count, the list of spans and their sum still agree (D3). Reason: closing the gap fully would need a second anchor that moves timer state forward, which R5 forbids.
