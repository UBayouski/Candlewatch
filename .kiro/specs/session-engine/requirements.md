# Requirements: session-engine

Source: `docs/BRIEF.md` sections 3 (core model) and 5 (interaction), constrained by `.kiro/steering/product.md` and `tech.md`.

## Introduction

The session engine is the pure core of Candlewatch. It holds the life of one focus session (a candle) and the history of past ones. It is a function `(state, event, now) -> state` with no DOM, no clock reads and no storage access. All elapsed time is derived from timestamps; ticks never count time. Rendering, sound, keyboard handling and the confirm dialog are other specs; this spec only defines the state and the events they will send.

## Glossary

- **Engine**: the pure function `step(state, event, now)` and the types it uses.
- **Session**: optional intent, length in whole minutes, start time, paused spans, outcome.
- **Phase**: one of `idle`, `lit`, `paused`, `burned-out`, `snuffed`.
- **Burn time**: time elapsed while the session was not paused, counted from timestamps.
- **Time left**: session length minus burn time, never below zero.
- **Break**: the optional 5-minute "wax cools" period after a `burned-out` session, defined by `breakEndsAt` (end time plus 5 minutes); not a phase.
- **History**: the list of finished (`burned-out`) and abandoned (`snuffed`) sessions.

## Requirements

### R1. Phases and transitions

**User story:** As a user, I want a session to move only through states that make sense, so that the candle never shows something false.

1. The engine SHALL have exactly five phases: `idle`, `lit`, `paused`, `burned-out`, `snuffed`.
2. The engine SHALL allow only these transitions: `idle -> lit`, `lit -> paused`, `paused -> lit`, `lit -> burned-out`, `lit -> snuffed`, `paused -> snuffed`.
3. WHEN an event is not valid in the current phase, THE engine SHALL return the state unchanged (same value, no error thrown).
4. `burned-out` and `snuffed` SHALL be final for the session that produced them.
5. WHEN `light` is received in `burned-out` or `snuffed`, THE engine SHALL start a new session (the final session is already in history). There is no `reset` event.

### R2. Light (start a session)

**User story:** As a user, I want to choose a length and optionally an intent, then light the candle.

1. WHEN `light` is received in `idle` with a valid length and intent, THE engine SHALL enter `lit`, set the start time to `now`, and record the length and intent.
2. The length SHALL be a whole number of minutes. Valid lengths are the presets 15, 25 and 50, and any whole number from 5 to 90 inclusive (custom).
3. IF the length is not a whole number or is outside 5 to 90, THEN THE engine SHALL treat the event as not valid (R1.3). Presets are a subset of this range; the engine does not distinguish them.
4. The intent SHALL be optional. When present it SHALL be a single line: leading and trailing whitespace trimmed, internal line breaks replaced by a single space, and limited to 80 characters, counted as Unicode code points (longer input is cut after the 80th code point, so a surrogate pair such as an emoji is never split). An empty result means no intent.
5. WHEN `light` is received in any phase other than `idle`, `burned-out` or `snuffed`, THE engine SHALL ignore it (R1.3).

### R3. Pause and resume

**User story:** As a user, I want to pause and resume, so that a real interruption does not cost me the candle.

1. WHEN `pause` is received in `lit`, THE engine SHALL enter `paused` and record the pause start as `now`.
2. WHEN `resume` is received in `paused`, THE engine SHALL enter `lit` and add the closed pause span (`now` minus pause start) to the total paused time.
3. Pausing and resuming SHALL NOT change burn time: burn time only grows while the phase is `lit`.
4. The total paused time of a session, including the pause in progress, SHALL be at most 10 minutes (600 000 ms). Exactly 10 minutes is allowed.
5. WHEN the total paused time would exceed 10 minutes, THE engine SHALL enter `snuffed` with the end time set to the instant the limit was reached (pause start plus the remaining allowance), not to the `now` of whichever event or tick noticed it.
6. IF `resume` arrives after the limit has already been passed, THEN THE engine SHALL snuff the session (R3.5) instead of resuming.

### R4. Time from timestamps only

**User story:** As a user, I want the timer to be right even if my tab was throttled or my laptop slept.

1. Burn time SHALL be computed from stored timestamps and `now` only: `now` minus start time, minus total paused time (closed spans plus the open span if paused).
2. The engine SHALL NOT count ticks, hold a running counter, or use anything but the supplied `now` as the current time.
3. The state after a given sequence of events at given timestamps SHALL NOT depend on how many `tick` events were sent in between, or when.
4. Time left SHALL be the session length in ms minus burn time, clamped to the range 0 to the session length.
5. IF `now` is earlier than a stored timestamp (the clock moved backwards), THEN THE engine SHALL treat the elapsed span as zero rather than negative.
6. The engine SHALL provide pure selectors for time left in ms and for the wax fraction (time left divided by session length, in [0, 1]) so other specs read time through the engine and never compute it.

### R5. Tick and completion

**User story:** As a user, I want the candle to burn out exactly when the time is up, however late the page noticed.

1. WHEN `tick` is received in `lit` and burn time has reached the session length, THE engine SHALL enter `burned-out` with the end time set to the instant of completion (start time plus total paused time plus length), not to `now`.
2. WHEN `tick` is received in `paused` and the pause limit has been passed, THE engine SHALL enter `snuffed` as in R3.5.
3. In every other case `tick` SHALL return the state unchanged, and it SHALL be safe to send any number of times (idempotent for a fixed `now`).
4. Any event other than `tick`, `hide` and `show` that arrives after a session's completion instant or pause-limit instant but before the engine has seen it SHALL first settle the session (R5.1, R5.2) and then be handled in the settled phase. `hide` and `show` are exempt: they never settle and return the state unchanged (R8.2).

### R6. Snuff

**User story:** As a user, I want snuffing to end the session on purpose.

1. WHEN `snuff` is received in `lit` or `paused`, THE engine SHALL enter `snuffed` with the end time set to `now`. If the session had already completed or passed the pause limit before `now`, R5.4 applies first and `snuff` is then ignored.
2. The confirmation dialog ("Let it go dark?") is not part of the engine. The engine treats `snuff` as already confirmed.

### R7. Break

**User story:** As a user, after a finished session I may take a 5-minute break, or skip it.

1. WHEN a session enters `burned-out`, THE engine SHALL record `breakEndsAt` in the state, equal to the session's end time plus 5 minutes (300 000 ms). A session that enters `snuffed` SHALL have no `breakEndsAt`.
2. The break SHALL add no new event and no new phase. The break is in progress exactly while the phase is `burned-out` and `now` is earlier than `breakEndsAt`. The engine SHALL provide a pure selector for this, computed from timestamps only.
3. The break SHALL NOT be paused, and SHALL NOT enter history or count as a session.
4. A break SHALL never be offered after `snuffed`.
5. Skipping the break is lighting a new session (R1.5), which is allowed at any time, including while the break is in progress. Ignoring the break is also allowed; nothing happens when it ends except that the selector turns false.
6. `breakEndsAt` is part of the serialized state, so a break in progress survives a reload (R9) with the same timestamp math.

### R8. Distraction hooks (field only)

**User story:** As a future spec author, I want a place for distractions without the engine doing anything with them yet.

1. The session state and each history entry SHALL include a distraction count (integer, starting at 0) and a total time away in ms (starting at 0).
2. The engine SHALL accept `hide` and `show` events. In this spec they SHALL NOT change any field, including the timer, and SHALL return the state unchanged.
3. Counting distractions is out of scope here and belongs to the `distraction-tracking` spec.

### R9. Reload recovery

**User story:** As a user, I want my candle to still be burning after I reload the page.

1. The engine state of a running session (`lit`, `paused`) or of a `burned-out` session with its `breakEndsAt` SHALL be fully serializable to JSON and back without loss.
2. WHEN `reload` is received with a restored state and `now`, THE engine SHALL settle it using R5: a candle whose time ran out while the page was closed becomes `burned-out` at its true completion instant; a pause that passed the limit becomes `snuffed` at the limit instant; otherwise the phase and burn time continue as if the page had never closed.
3. Time spent with the page closed SHALL count as burn time if the phase was `lit`, and as paused time if it was `paused`.
4. IF the restored value is missing, malformed, or fails validation, THEN THE engine SHALL start from `idle` with no error thrown.
5. A session settled by `reload` into `burned-out` or `snuffed` SHALL be added to history exactly once.

### R10. History

**User story:** As a user, I want a record of every session that ended, so the graveyard and shelf have something to show.

1. WHEN a session enters `burned-out` or `snuffed`, THE engine SHALL add one entry to history with: start time, end time, length in minutes, intent (or none), outcome (`burned-out` or `snuffed`), distraction count and time away (R8).
2. History SHALL be ordered oldest first, and an entry SHALL never be added twice or changed after it is added.
3. History SHALL serialize to JSON and deserialize back to an equal value (lossless round-trip), for every history the engine can produce, including intents with quotes, backslashes, emoji and non-Latin text.
4. The serialized form SHALL carry a schema version number so a later change can migrate it.
5. IF stored history is missing or malformed, THEN deserializing SHALL return an empty history and SHALL NOT throw. Valid entries SHALL NOT be silently altered.

### R11. Persistence boundary

**User story:** As a maintainer, I want the engine to stay pure and testable.

1. The engine and serialization functions SHALL be pure and SHALL NOT touch `window`, `document`, `localStorage` or the clock (steering `tech.md`).
2. A separate thin module under `src/storage/` SHALL read and write `localStorage`: the current session and the history under distinct keys. It SHALL write after each state change and SHALL tolerate `localStorage` being unavailable or full without throwing (the app keeps working, only without persistence).
3. Only `main.ts` and `src/ui/` own the clock and pass `now` into the engine.
4. IF a stored session or history text is present but unreadable (invalid JSON, wrong or missing version, or failing validation), THEN THE storage adapter SHALL copy the raw text once, unchanged, to a backup key before its first write to that key, SHALL NOT overwrite an existing backup, and SHALL leave the original text untouched if the backup write fails.

### R12. Event contract

1. The events are exactly: `light` (with length and optional intent), `pause`, `resume`, `snuff`, `tick`, `hide`, `show`, `reload` (with the restored state). Each is handled with a `now` argument.
2. The engine SHALL be total: for every state and every event it returns a state, never throws.
3. The engine SHALL NOT mutate its input state or event.
4. `step` SHALL floor `now` to an integer, and SHALL return the state unchanged (the same value) when `now` is not finite. The selectors (time left, wax fraction, break) SHALL return 0 (or `false` for the break selector) when `now` is not finite.

## Property-based tests (fast-check)

Each property uses generated event sequences with non-decreasing (and, where stated, arbitrary) timestamps. Files: `*.prop.test.ts`, colocated in `src/engine/`.

| ID | Property | Covers |
|---|---|---|
| P1 | While the phase is `lit`, time left never increases from one event to the next. | R4.4, R3.3 |
| P2 | For any number of pause and resume pairs (each within the 10-minute total limit), the session still burns for exactly its length: the completion instant moves later by exactly the total paused time, and burn time at completion equals the session length. | R3.3, R4.1 |
| P3 | The same events at the same timestamps, with any number of extra `tick` events inserted at any timestamps, produce the same final state (except where a tick is the first to settle a completion, which yields the same end time per R5.1). | R4.3, R5 |
| P4 | No event sequence, including invalid events, reaches a phase outside the five, or a transition outside R1.2. | R1, R12 |
| P5 | Wax fraction is always in [0, 1]. For a probe time at or before the state's anchor (`litSince` when lit, `pausedAt` when paused) it equals the fraction at the anchor; for a probe past the anchor it never exceeds the fraction at the anchor. | R4.4, R4.5, R4.6 |
| P6 | History serialize then deserialize is the identity, for generated histories with arbitrary intents. | R10.3 |
| P7 | Total paused time never exceeds 10 minutes in a non-snuffed session; any session that would exceed it ends `snuffed` with end time at the limit instant. | R3.4, R3.5 |
| P8 | Reload equivalence: serializing a running state, then `reload` at time T, equals feeding a `tick` at T to the original state. | R9.2, R9.3 |
| P9 | `hide` and `show` never change state. | R8.2 |
| P10 | Every session that ends adds exactly one history entry; history length never decreases. | R10.1, R10.2 |
| P11 | The break selector is true exactly when the phase is `burned-out` and `now` is earlier than `breakEndsAt`, for any event sequence. In every other phase it is false, and `breakEndsAt` is present only on `burned-out` states. | R7.1, R7.2, R7.4 |

Example-based unit tests (not property-based) cover: valid and invalid lengths (4, 5, 90, 91, 25.5), intent normalization, a surrogate-pair intent (80 emoji kept whole; 81 emoji cut to exactly 80 with no lone surrogate; 79 ASCII characters followed by an emoji keep the emoji whole as the 80th code point, and 79 ASCII characters followed by two emoji keep only the first), exactly 10 minutes of pause, break timing (`breakEndsAt` equals end time plus 300 000 ms, selector false at and after it), and corrupt storage input.

## Out of scope

Distraction counting and ghosts, the confirm dialog, keyboard bindings, rendering, sound, the page title, settings, the graveyard and shelf views, and the `localStorage` wiring in `main.ts`.

## Decisions

- **Q1. Starting again after a final state:** keep R1.5. `light` from `burned-out` or `snuffed` starts a new session. No `reset` event.
- **Q2. Intent limits:** trim, flatten line breaks, 80 characters, counted as Unicode code points so a surrogate pair (emoji) is never split. An example test covers it.
- **Q3. Break model:** no new events and no sixth phase. On entering `burned-out` the state records `breakEndsAt` (end time plus 5 minutes). The break is in progress while `now < breakEndsAt`, via a pure selector. Skipping is lighting a new session at any time, or ignoring it. It cannot be paused, never enters history, and is never offered after `snuffed`. R7 rewritten, old R7.7 dropped, property P11 added.
- **Q4. End time on late discovery:** confirmed. Ends are dated to the true instant, not the late `now`.
