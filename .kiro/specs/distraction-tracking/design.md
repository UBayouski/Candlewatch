# Design: distraction-tracking

Implements `requirements.md` in this folder (R1-R12, D1-D8, Decisions) on top of the built `session-engine` (`src/engine/`, `src/storage/`). Scope: the engine accounting for distractions, the ghost selectors, session document v2, and the Page Visibility wiring. No drawing, no ghost motion, no settings, no sound.

## 1. Overview

```
 document 'visibilitychange'                                   src/storage (unchanged)
        |                                                        ^ load()/save(prev,next)
 src/distraction/visibility.ts  --send('hide'|'show', now)-->  main.ts: step(state, event, now)
        (injected document, clock, send)                          |
                                                                  v
 +----------------------------- src/engine (pure, no DOM, no clock) -----------------------------+
 | step -> settle -> {light, pause, resume, snuff, hide, show}      distraction.ts: openHide/closeHide |
 | endBurnedOut / endSnuffed / pause close an open hide at the exit instant                          |
 | ghosts.ts: distractionCount, ghostSpansMs, ghostSize         serialize/validate: session v2 (reads v1) |
 +--------------------------------------------------------------------------------------------------+
```

What changes in the engine, in one list:

- `LitState` gains `awaySince` (the open hide). `Session` gains `awaySpansMs` (completed spans).
- `hide` and `show` leave the exemption: they settle first, then act only in `lit` (R6.1).
- Every way out of `lit` (completion by `settle`, `pause`, `snuff`) closes an open hide at the exit instant (R7).
- New pure selectors, new constants, session document v2 with v1 still readable.
- No new events, no new phases. `reload` is unchanged (settle only).

Principles carried over from session-engine: time only from timestamps; `step` is pure and total; same reference when nothing changes; ends dated to the true instant; distractions never touch a timer field (R5).

## 2. Constants

`src/engine/constants.ts` additions and one rename:

```ts
export const GHOST_MIN_SIZE = 0.25;                 // R9.2
export const GHOST_FULL_SIZE_MS = 5 * MS_PER_MINUTE; // R9.2 (300 000)
export const SESSION_SCHEMA_VERSION = 2;            // R10.2: current-session document
export const HISTORY_SCHEMA_VERSION = 1;            // R10.2: history document, unchanged shape
// SCHEMA_VERSION (= 1) is removed; its uses become HISTORY_SCHEMA_VERSION or SESSION_SCHEMA_VERSION.
```

## 3. Type changes

`src/engine/types.ts`:

```ts
export interface Session {
  readonly startedAt: number;
  readonly lengthMin: number;
  readonly intent: string | null;
  readonly pausedTotalMs: number;
  readonly distractions: number;               // === awaySpansMs.length  (R4.2)
  readonly timeAwayMs: number;                 // === sum(awaySpansMs)    (R4.2)
  readonly awaySpansMs: readonly number[];     // NEW (R9.1): completed spans, oldest first
}

export interface LitState extends WithHistory {
  readonly phase: "lit";
  readonly session: Session;
  readonly litSince: number;
  readonly awaySince: number | null;           // NEW (R1): instant of the open hide, or null
}
```

`PausedState`, `BurnedOutState`, `SnuffedState`, `IdleState`, `HistoryEntry` and `Event` are unchanged. A hide cannot be open outside `lit` (R7.3), and the type says so: only `LitState` has the field.

Notes:

- `distractions` and `timeAwayMs` stay as stored fields although they are derivable from the list. `entryOf` and the history already read them, and the invariant (length and sum agree) is checked by validation and by property D3.
- `awaySpansMs` is the only unbounded structure in the state. One integer per distraction; no cap, per Decision Q3.
- `HistoryEntry` keeps only `distractions` and `timeAwayMs` (Decision Q3).

Constructors that must set the new fields: `light` (`awaySpansMs: []`, `awaySince: null`), `resume` (`awaySince: null`; the paused state has none).

## 4. Engine behaviour

### 4.1 Open and close (`src/engine/distraction.ts`, internal)

```ts
/** R1: opens a hide at max(at, litSince). No-op when one is already open. */
export function openHide(s: LitState, at: number): LitState {
  if (s.awaySince !== null) return s;                       // R3.2: same reference
  return { ...s, awaySince: Math.max(at, s.litSince) };
}

/** R2, R4, R7: closes the open hide at max(at, awaySince). No-op when none is open. */
export function closeHide(s: LitState, at: number): LitState {
  if (s.awaySince === null) return s;
  const closeAt = Math.max(at, s.awaySince);                // never earlier than the open instant (R4.1)
  const span = closeAt - s.awaySince;                       // >= 0, integer
  return {
    ...s,
    awaySince: null,
    session: {
      ...s.session,
      distractions: s.session.distractions + 1,
      timeAwayMs: s.session.timeAwayMs + span,
      awaySpansMs: [...s.session.awaySpansMs, span],
    },
  };
}
```

Neither function reads or writes `startedAt`, `pausedTotalMs`, `litSince`, `pausedAt`, `endedAt` or `breakEndsAt` (R5.1). `closeHide` rebuilds only `session.distractions`, `timeAwayMs`, `awaySpansMs` and `awaySince`.

### 4.2 `step`

`hide` and `show` move from the first switch (state returned as is) to the second one, after `settle`:

```ts
export function step(state: State, event: Event, now: number): State {
  if (!Number.isFinite(now)) return state;
  const t = Math.floor(now);

  switch (event.type) {
    case "reload": return isStateLike(event.state) ? settle(event.state, t) : state;
    case "tick":   return settle(state, t);
    default:       break;
  }

  const s = settle(state, t);                              // R6.1: hide and show settle like everything but tick/reload
  switch (event.type) {
    case "light":  return light(s, event, t);
    case "pause":  return s.phase === "lit" ? pause(s, t) : s;
    case "resume": return s.phase === "paused" ? resume(s, t) : s;
    case "snuff":  return s.phase === "lit" || s.phase === "paused" ? snuff(s, t) : s;
    case "hide":   return s.phase === "lit" ? openHide(s, t) : s;          // R1, R3.1, R3.2
    case "show":   return s.phase === "lit" ? closeHide(s, t) : s;          // R2, R3.3
    default: { const unreachable: never = event; void unreachable; return s; }
  }
}
```

Behaviour follows from the structure:

- R3.1: `hide` in any phase but `lit` (after settling) returns `s`, the settled state; no distraction field is touched.
- R3.2 and R3.3: a second `hide`, and a `show` with nothing open, return the same reference as `s` (`openHide`/`closeHide` return their input), so with nothing due they return the input state.
- R6.3, R6.4: a `hide` or `show` after the true end settles first; the session is final; the event falls into the `s.phase === "lit"` guard and is ignored.
- R5.3: `hide`/`show` at `T` equals `tick` at `T` apart from the distraction fields, because both start with the same `settle(state, T)` and the rest only changes `awaySince` and `session` distraction fields.
- `reload` is untouched: it settles `event.state`, so an open hide persisted before the reload stays open (R10.4) unless the session completed meanwhile, in which case settle closes it (4.3).

### 4.3 Exits from `lit` close the open hide at the exit instant (R6.2, R7)

All three exits close through the same helper, so the rule has one implementation. The timer values are computed exactly as before; only the session record handed on gets the closed hide.

```ts
// settle.ts
export function endBurnedOut(s: LitState, end: number): BurnedOutState {
  const closed = closeHide(s, end);                       // end = completionAt(s), the true instant (R6.2, R7.1)
  return {
    phase: "burned-out", session: closed.session, endedAt: end, breakEndsAt: end + BREAK_MS,
    history: appendEntry(s.history, entryOf(closed.session, end, "burned-out")),   // R8.1
  };
}

export function endSnuffed(s: LitState | PausedState, end: number): SnuffedState {
  const session = s.phase === "lit" ? closeHide(s, end).session : s.session;        // paused: nothing open (R6.5)
  return { phase: "snuffed", session, endedAt: end, history: appendEntry(s.history, entryOf(session, end, "snuffed")) };
}

// step.ts
function pause(s: LitState, t: number): PausedState {
  const pausedAt = Math.max(t, s.litSince);               // unchanged timer value (R5.1)
  const closed = closeHide(s, pausedAt);                  // R7.1: close and count at the pause instant (Decision Q2)
  return { phase: "paused", history: s.history, session: closed.session, pausedAt };
}
// snuff(): end = max(t, anchor) as before; endSnuffed closes the hide at that same instant.
```

| Exit | Exit instant | Where it is closed |
|---|---|---|
| Completion (found by `tick`, `reload`, `hide`, `show` or any event) | `completionAt(s)` | `settle` -> `endBurnedOut` |
| `snuff` | `max(now, litSince)` | `snuff` -> `endSnuffed` |
| `pause` | `max(now, litSince)` (= `pausedAt`) | `pause` |
| Pause limit while `paused` | `pauseLimitAt` | `settle` -> `endSnuffed` (nothing open) |

`closeHide` closes at `max(exit instant, awaySince)`. When the clock has moved backwards the exit instant can be earlier than the open instant; the span is then 0 and the timer fields keep their own (clamped) values. A worked example:

```
t0 = 0, 25-minute candle (completion C = 25:00)
20:00 hide   -> awaySince = 20:00
40:00 show   -> settle first: C passed -> burned-out at 25:00, hide closed at 25:00:
                span = 5:00, distractions 1, timeAwayMs 300 000; history entry carries both
              then show is ignored (phase burned-out)
```

### 4.4 Hide at the exact completion instant

`settle` runs first with `now >= completionAt`, so a `hide` at exactly `C` finds the session already `burned-out` and is ignored (R6.3). A `hide` at `C - 1` opens a hide, and `settle` at `C` closes it with span `1`.

### 4.5 Resume

`resume` builds the `lit` state from the `paused` one and sets `awaySince: null`. A page that is hidden when the user resumes is not tracked until its next `hide` (hide while the page is already hidden does not fire), which matches R3.4.

### 4.6 Backward clock

A backward clock cannot make a negative span (`max(at, awaySince)`), and the list/sum/count invariants always hold. The guarantee that total time away is at most `endedAt - startedAt` (R4.3, R8.3) holds when `now` does not decrease between events, which is how a real clock behaves. With a clock that steps back, spans recorded before the step can overlap later lit time, so the bound is not guaranteed. See Decisions, item 1.

## 5. Selectors (`src/engine/ghosts.ts`)

```ts
export function distractionCount(state: State): number {
  return state.phase === "idle" ? 0 : state.session.distractions;
}

const NO_SPANS: readonly number[] = Object.freeze([]);
export function ghostSpansMs(state: State): readonly number[] {
  return state.phase === "idle" ? NO_SPANS : state.session.awaySpansMs;       // R9.1, R9.3: no `now`
}

/** R9.2: floor 0.25, saturating square-root curve, full size from 5 minutes. */
export function ghostSize(spanMs: number): number {
  const f = Number.isNaN(spanMs) ? 0 : Math.min(1, Math.max(0, spanMs) / GHOST_FULL_SIZE_MS);
  return GHOST_MIN_SIZE + (1 - GHOST_MIN_SIZE) * Math.sqrt(f);
}
```

- Range: `f` is in `[0, 1]`, `sqrt` is in `[0, 1]`, so the result is in `[0.25, 1]`. At span 0 it is exactly `0.25`; at `f = 1` it is `0.25 + 0.75 = 1` exactly in floating point.
- Monotone: `min`, `/`, `sqrt` (correctly rounded), `*` by a positive constant and `+` are each non-decreasing in floating point, so the composition never decreases.
- A negative or `NaN` span (not produced by the engine) maps to the floor; `Infinity` maps to `1`.
- Burned-out and snuffed states still return their session's spans, so the scene can keep the ghosts through the dawn or the grave until the next `light`.
- Exports added to `src/engine/index.ts`: `distractionCount`, `ghostSpansMs`, `ghostSize`, `GHOST_MIN_SIZE`, `GHOST_FULL_SIZE_MS`, `SESSION_SCHEMA_VERSION`, `HISTORY_SCHEMA_VERSION`.

## 6. Serialization and validation

### 6.1 Session document v2 (`serializeSession`)

Always written as version 2. New fields are `session.awaySpansMs` (all phases) and `awaySince` (`lit` only):

```json
{ "v": 2, "phase": "lit",
  "session": { "startedAt": 1788000000000, "lengthMin": 25, "intent": "write the report",
               "pausedTotalMs": 0, "distractions": 2, "timeAwayMs": 95000,
               "awaySpansMs": [30000, 65000] },
  "litSince": 1788000000000, "awaySince": null }
```

`paused` has `pausedAt`, `burned-out` has `endedAt` and `breakEndsAt`, `snuffed` has `endedAt` (as in session-engine); none has `awaySince`. The history document is untouched: `{ "v": 1, "entries": [...] }`, entries as before (`distractions`, `timeAwayMs`, no spans).

### 6.2 Reading v1 (migration)

`readSession` and `restoreState` accept `v` of 1 or 2. A v1 session document has no `awaySpansMs` and no `awaySince`:

- missing `awaySpansMs` is `[]`, missing `awaySince` is `null`;
- v1 documents were written when the engine never counted, so they must have `distractions === 0` and `timeAwayMs === 0`; otherwise the consistency rule below rejects them;
- the restored state is a normal v2 state; the next save writes version 2.

Any other `v` is unreadable and the session-engine backup rule (R11.4) applies unchanged.

### 6.3 New validation rules (`validate.ts`)

In `parseSession(v, version)`:

1. `awaySpansMs` (v2: required; v1: absent means `[]`) is an array of non-negative safe integers.
2. `awaySpansMs.length === distractions`.
3. The sum of `awaySpansMs` is a safe integer equal to `timeAwayMs`.

In `parseSessionDoc`:

4. `awaySince` may be present only for `lit`; for any other phase it must be absent or `null` (R10.3: no open hide outside `lit`).
5. For `lit`: `awaySince` is `null` or a non-negative safe integer with `litSince <= awaySince < completionAt`.
6. Any failure returns `null`, so `restoreState` falls back to idle with the history (session-engine R9.4), and `readSession` reports `unreadable` so the adapter backs the text up.

`parseEntry` (history) is unchanged.

### 6.4 Reload

`reload` is `settle(event.state, now)` as before (session-engine P8: reload equals tick). A persisted open hide reappears in the restored `lit` state and stays open (Decision Q5). If the candle completed meanwhile, `settle` closes it at the true completion instant. The wiring then reports the page's visibility (section 8).

## 7. Storage adapter

`src/storage/storage.ts` needs no code change: it calls `readSession`, `readHistory`, `restoreState`, `serializeSession`, `serializeHistory`, which now speak v2. Its saving rule (write the session on every change, history when its reference changes) already covers a `hide`/`show` that only changes the session. Tests stay valid except where they assert version text (section 9).

## 8. Browser wiring (`src/distraction/visibility.ts`)

Outside the engine; the engine does not import it. All globals are injected.

```ts
export type VisibilityEventType = "hide" | "show";

/** What the module needs from `document`. The real `document` satisfies it. */
export interface VisibilityTarget {
  readonly visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface VisibilityWiring {
  readonly target: VisibilityTarget;
  readonly clock: () => number;                                  // main passes Date.now
  readonly send: (type: VisibilityEventType, now: number) => void; // main: step + save
}

/** 'hidden' -> 'hide'; everything else ('visible', unknown) -> 'show'. */
export function eventFor(visibilityState: string): VisibilityEventType;

/** Subscribes to visibilitychange. Returns the function that unsubscribes. */
export function watchVisibility(w: VisibilityWiring): () => void;

/** Sends the event that matches the current visibilityState once. Call right after a reload (R11.3). */
export function syncVisibility(w: VisibilityWiring): void;

/** `document` when it exists and works, else null (tests, other environments). */
export function browserVisibilityTarget(): VisibilityTarget | null;
```

- `watchVisibility` registers one listener that calls `send(eventFor(target.visibilityState), clock())`, and returns `() => target.removeEventListener("visibilitychange", listener)`. The same function reference is used to add and remove.
- `syncVisibility` is the reload step: `show` closes a persisted open hide; `hide` is ignored by the engine if one is open (R3.2) and otherwise opens one.
- A refresh during a lit session: the browser fires `visibilitychange` to hidden while unloading, the handler runs `step(hide)` and `save` synchronously (`localStorage` is synchronous), the new page loads, `syncVisibility` sends `show`, and the session counts one short distraction (Decision Q5, accepted).
- `browserVisibilityTarget()` returns `document` guarded by `typeof document !== "undefined"` inside `try/catch`; if the DOM typings object does not match `VisibilityTarget`, the function wraps it in a small adapter instead of a cast.

### 8.1 Fake document for tests (`src/distraction/fake-document.ts`, test-only)

```ts
export function createFakeDocument(initial: "visible" | "hidden" = "visible"): VisibilityTarget & {
  setVisibility(state: string): void;     // sets visibilityState, then calls every registered listener
  listenerCount(): number;
};
```

It stores listeners in a `Set`, so `listenerCount()` shows that unsubscribing removed the listener. Like `test-kit.ts`, it is imported only by tests; the purity test's "test-only" check is extended to also reject non-test imports of `fake-document`.

## 9. File layout and what changes in session-engine

```
src/engine/
  constants.ts        + GHOST_MIN_SIZE, GHOST_FULL_SIZE_MS, SESSION_SCHEMA_VERSION, HISTORY_SCHEMA_VERSION; - SCHEMA_VERSION
  types.ts            Session + awaySpansMs; LitState + awaySince
  distraction.ts      NEW  openHide, closeHide              distraction.test.ts  NEW
  settle.ts           endBurnedOut / endSnuffed close the open hide
  step.ts             hide/show handled after settle; light/resume/pause set or close the new fields
  ghosts.ts           NEW  distractionCount, ghostSpansMs, ghostSize     ghosts.test.ts  NEW
  validate.ts, serialize.ts   v2 write, v1 read, new rules
  index.ts            new exports
  test-kit.ts         visibility-heavy script arbitrary, extended assertInvariants, reference interpreter
  distraction.prop.test.ts  NEW  D1-D5, D7
  ghosts.prop.test.ts       NEW  D8
  serialize.prop.test.ts    + D6
src/distraction/
  visibility.ts       NEW  wiring              visibility.test.ts  NEW
  fake-document.ts    NEW  test-only
```

### 9.1 Existing session-engine tests that change

These assert behaviour this spec reverses or construct the changed types:

| File | Test | Change |
|---|---|---|
| `step.prop.test.ts` | **P3** | Remove the `hide`/`show` exception and its comment about the narrowing: strict `toStrictEqual` after every original event, in both variants. Settling on every event makes the strict form hold again. |
| `step.prop.test.ts` | **P9** | Delete. Replaced by D1 (timer unchanged) and D5 (what does not count), in `distraction.prop.test.ts`. |
| `step.test.ts` | "returns the same reference for hide and show in every phase" | Replace: in `idle`, `paused`, `burned-out`, `snuffed` and for a duplicate `hide`/stray `show` in `lit`, the result is the same reference; in `lit` a first `hide` and a matching `show` do change the state. |
| `step.test.ts` | "does not settle on hide or show" | Reverse: a `hide`/`show` after the due time returns the settled state (`burned-out`). |
| `step.test.ts` | Session/LitState helpers (`session()`, `lit()`) and `light` examples | Add `awaySpansMs: []` and `awaySince: null`; no behaviour change. |
| `step.test.ts` | "returns the same reference ... non-finite now" | Unchanged. |
| `history.test.ts` | `session()` helper | Add `awaySpansMs: []`. |
| `serialize.test.ts` | documented lit JSON example, `withDoc({ v: 2 })` "wrong version" case | The example becomes the v2 format; version `2` is now valid, so the wrong-version case uses `v: 3`. Add the v1 migration cases. |
| `serialize.prop.test.ts` | P6 | `SCHEMA_VERSION` becomes `HISTORY_SCHEMA_VERSION`. |
| `constants.test.ts` | schema version assertion | Assert the two new version constants and the ghost constants. |
| `test-kit.ts` / `test-kit.test.ts` | `assertInvariants`, helper states | Add the distraction invariants (section 10.2); update rejecting-states cases. |
| `purity.test.ts` | "test-kit is test-only" | Also forbid non-test imports of `fake-document`. |
| `storage.test.ts` | any literal v1 session text | `'{"v":1,"phase":"lit"}'` (unreadable) stays unreadable; no change expected. |

P1, P2, P4, P5, P7, P8, P10, P11 keep their statements. P10's "growth by 1" still holds when `hide`/`show` settle a session, and P4's allowed moves are unchanged. The session-engine requirements (R5.4, R8.2) and design (Decision 2, Decision 8 hide/show part, Decision 9) are edited in the tasks of this spec.

## 10. Test plan

### 10.1 Example tests (Vitest)

- `distraction.test.ts`: `openHide` clamps to `litSince` and keeps the same reference when already open; `closeHide` computes the span, appends it, bumps the count and total, clears the open hide, and clamps a close earlier than the open instant to span 0; neither touches a timer field.
- `step.test.ts` (new cases): hide then show in the middle of a candle (count 1, exact span); hide at minute 20 of 25 and show at minute 40 (one distraction of exactly 5 minutes, `endedAt` minute 25, `show` ignored); hide at exactly the completion instant is ignored; hide at `C - 1` gives span 1; pause while hidden closes and counts at the pause instant; snuff while hidden counts; hide while paused ignored and the later show ignored; duplicate hide and stray show return the same reference; same-millisecond hide and show counts with span 0; second light starts with no spans and no open hide.
- `ghosts.test.ts`: `ghostSize(0) === 0.25`; `ghostSize(300_000) === 1`; larger spans stay `1`; sample values (for example `ghostSize(75_000) === 0.625`, since `sqrt(0.25) = 0.5`); negative and `NaN` map to `0.25`; `ghostSpansMs` and `distractionCount` for idle, lit, burned-out; spans equal the list in order.
- `serialize.test.ts` (new cases): the v2 example round-trips; a v1 lit document restores with `[]` spans and no open hide; a v1 document with `distractions > 0` is unreadable; v2 document with spans whose length or sum disagrees, a negative or fractional span, `awaySince` on `paused`, `awaySince` before `litSince` or at/after completion are all unreadable and fall back to idle with the history; the storage backup still triggers on those texts (`storage.test.ts` gets one case).
- `visibility.test.ts` (fake document): `eventFor` mapping; `watchVisibility` sends `hide` then `show` with `clock()` values; the unsubscribe function removes the listener (`listenerCount() === 0`) and later changes send nothing; `syncVisibility` sends `show` when visible and `hide` when hidden, once, with `clock()`; sending does not require a real `document`.

### 10.2 Test kit additions (`test-kit.ts`)

- **Visibility-heavy scripts.** `makeArbScript` gains an optional `kinds` arbitrary. `arbVisibilityScript = makeArbScript({ gap: arbGap, kinds: weighted })` with weights roughly: `hide` 4, `show` 4, `tick` 3, `light` 2, `pause` 2, `resume` 2, `snuff` 1, `reload` 1. A wild variant with signed gaps (`arbSignedVisibilityScript`) is used where the clock may go backwards.
- **`assertInvariants` additions.** For every state with a session: `awaySpansMs` is an array of non-negative safe integers, its length equals `distractions`, its sum equals `timeAwayMs`. For `lit`: `awaySince` is `null` or in `[litSince, completionAt)`. For other phases the key `awaySince` is absent. Every history entry's counters are non-negative integers.
- **Reference interpreter `referenceTrace(script, t0)`** (D2), see below.

### 10.3 The reference interpreter (D2)

An independent second implementation of R1-R3 and R7 over the same script, written from the requirements text, in a different representation, importing nothing from the engine but `constants`:

```
state:  phase ('idle'|'lit'|'paused'|'done'), start, lengthMs, pausedSpans: number[] (closed pause lengths),
        litSince, pausedAt, hiddenAt: number | null, spans: number[]
settle(now):
  lit:    c = start + sum(pausedSpans) + lengthMs      // recomputed from the list, not accumulated
          if now >= c -> closeHidden(c); phase = 'done'; record entry
  paused: limit = pausedAt + (600000 - sum(pausedSpans))
          if now > limit -> phase = 'done'; record entry   // nothing open (paused)
events (each starts with settle(now), except tick/reload which are settle only):
  light  (valid length, phase idle/done)      -> new session, spans = [], hiddenAt = null
  pause  (lit)   -> closeHidden(max(now, litSince)); pausedAt = max(now, litSince); phase = 'paused'
  resume (paused)-> pausedSpans.push(max(now,pausedAt) - pausedAt); litSince = max(now, pausedAt); phase = 'lit'
  snuff  (lit/paused) -> closeHidden(max(now, anchor)); phase = 'done'; record entry
  hide   (lit, hiddenAt == null) -> hiddenAt = max(now, litSince)
  show   (lit, hiddenAt != null) -> closeHidden(now)
closeHidden(at): if hiddenAt != null: spans.push(max(at, hiddenAt) - hiddenAt); hiddenAt = null
```

For each step the test compares engine and reference: phase (mapping `burned-out`/`snuffed` to `done`), `session.distractions`, `session.awaySpansMs`, `session.timeAwayMs`, `awaySince === hiddenAt`, and, for each history entry, `distractions` and `timeAwayMs` against the reference's recorded entries. The reference reuses no engine code, so a mistake in `closeHide` or in the exit handling shows up as a disagreement. `reload` steps are real round trips in `runScript`, so the reference treats them as `settle` only (the restored state equals the pre-state).

### 10.4 Properties D1-D8 (fast-check, `numRuns` 300 via `PROP_PARAMS`)

| ID | Generation | Assertion |
|---|---|---|
| D1 | `arbT0`, `arbVisibilityScript`. Build a second script by replacing each `hide`/`show` step with a `tick` at the same gap. Run both. | At every step the two traces agree on: phase; `timeLeftMs` and `waxFraction` at the step's `now`; `startedAt`, `lengthMin`, `pausedTotalMs`, `litSince`, `pausedAt`, `endedAt`, `breakEndsAt`; and history entries equal after removing `distractions`, `timeAwayMs`. (`isBreak` too.) |
| D2 | `arbT0`, `arbVisibilityScript`. Run the engine via `runScript`; run `referenceTrace` over the same steps and times. | Per step: reference and engine agree on distraction count, the list of spans, the open instant, and every history entry's distraction fields. This also covers "count equals completed pairs while lit, plus one for a hide still open when the session leaves `lit`" because the reference counts exactly that. |
| D3 | `arbT0`, `arbVisibilityScript` and `arbSignedVisibilityScript`. | Signed and unsigned: in every state, spans are integers `>= 0`, their number equals `distractions`, their sum equals `timeAwayMs`, `assertInvariants` holds. Unsigned only (non-decreasing times): every final session has `timeAwayMs <= endedAt - startedAt` and, for burned-out sessions, `timeAwayMs <= lengthMs`. |
| D4 | `arbT0`, `arbLength`, a hide offset `h` in `[0, L)`, an exit kind from `{completion, snuff, pause}`, an exit time `x` within the lit period after `h` (for completion `x = C`), and a noticing event from `{tick, show, hide, resume, light, reload, snuff}` at `x + late`, `late` in `[0, 3 h]` (for completion the noticing time is `>= C`). | Completion: the history entry has `distractions` `+1` and `timeAwayMs` equal to `C - h`, `endedAt = C`, whatever event noticed it and however late; a later `show` leaves the entry unchanged. Snuff and pause: the span is `x - h`. A paused session never gets an extra distraction when later snuffed by the pause limit. |
| D5 | `arbT0`, `arbVisibilityScript`. For every state in the trace and a probe `now` at or after the trace time: apply `hide` where the settled phase is not `lit`; apply a second `hide` where one is open; apply `show` where none is open. | The distraction fields are unchanged and the result equals `step(state, tick, now)`; when nothing is due the result is the same reference as the input. |
| D6 | `arbT0`, `arbVisibilityScript`. | For every state: `restoreState(serializeSession(s), serializeHistory(s.history))` `toStrictEqual` `s` (open hide and spans included); `step(s, reload(restored), T)` `toStrictEqual` `step(s, tick, T)` for `T` up to 6 h later. Version 1: take the serialized session of any state whose `distractions` is 0 and which has no open hide, rewrite it as v1 (set `v` to 1, remove `awaySpansMs` and `awaySince`); it restores `toStrictEqual` to the original state. Corruption: mutate one new field (wrong type, negative, wrong length, sum mismatch, `awaySince` on a non-lit phase, `awaySince` before `litSince`); `restoreState` never throws and returns an idle state with the history intact. |
| D7 | `arbT0`, `arbVisibilityScript`. | For every step that adds a history entry, the entry's `distractions` and `timeAwayMs` equal those of the ended session at that moment (taken from the previous state with the open hide closed by the reference); earlier entries are the same objects (or deep-equal after `reload`); with non-decreasing times, `timeAwayMs <= endedAt - startedAt`. |
| D8 | `fc.integer({ min: 0, max: 3_600_000 })` pairs `a <= b`, plus `arbVisibilityScript` states. | `ghostSize(a) >= 0.25`, `ghostSize(a) <= 1`, `ghostSize(0) === 0.25`, `ghostSize(a) <= ghostSize(b)`, `ghostSize(s) === 1` for `s >= 300_000`. For states: `ghostSpansMs(state).length === distractionCount(state)` and the spans sum to `timeAwayMs` (and `ghostSpansMs(idle)` is empty). |

Each property is a separate required task later; none may be weakened to pass. A failure is reported with its counterexample and seed and recorded in `KIRO_USAGE.md`.

## 11. Traceability

| Requirement | Sections |
|---|---|
| R1 | 4.1 `openHide`, 4.2 `hide` |
| R2 | 4.1 `closeHide`, 4.2 `show` |
| R3 | 4.2 (guards on `lit`, same references) |
| R4 | 4.1 (`max`), 4.6, 6.3 rules 1-3 |
| R5 | 4.1 (what the helpers touch), 4.2, 4.3 |
| R6 | 4.2 (settle first), 4.3, 4.4 |
| R7 | 4.3 |
| R8 | 4.3 (`entryOf` with the closed session) |
| R9 | 3, 5 |
| R10 | 6, 7 |
| R11 | 8 |
| R12 | 4.2 (event set and totality unchanged) |
| D1-D8 | 10.4 |

## 12. Decisions

Design review: approved. Outcomes:

1. **Total time away and a backward clock (R4.3, R8.3, D3, D7): accepted, narrowed.** The bound `timeAwayMs <= endedAt - startedAt` is guaranteed when `now` does not decrease between events. When the clock steps back (an NTP correction, a manual change) after a span was recorded, a later exit can sit earlier than that span's end, and the bound can be exceeded by at most the size of the step. A backward clock still never gives a negative span, and the count, the list of spans and their sum still agree (D3). The timer has the same limitation: it only clamps to its own anchor. Closing the gap fully would need a second anchor that moves timer-adjacent state forward, which R5 forbids. `requirements.md` R4.3, R8.3, D3 and D7 are updated to say so, and the requirements Decisions record it.
2. **Version split (accepted).** `SCHEMA_VERSION` becomes two constants (session 2, history 1), which touches the session-engine tests listed in 9.1.
3. **Unbounded span list (accepted).** One integer per distraction with no cap (requirements Decision Q3). A pathological page that toggles visibility thousands of times grows the persisted session document accordingly; the scene can cap how many ghosts it draws.