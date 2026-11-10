# Design: session-engine

Implements `requirements.md` in this folder (R1-R12, P1-P11, Decisions). Scope is the pure engine, its serialization, and the thin `localStorage` adapter. No rendering, no distraction counting, no UI.

## 1. Overview

```
 main.ts / ui (owns the clock)            src/storage (owns localStorage)
        |  step(state, event, Date.now())          ^ load(): State
        v                                          | save(prev, next)
 +------------------------ src/engine (pure, no DOM, no clock) ----------------+
 | step -> settle -> transitions     selectors (timeLeftMs, waxFraction, isBreak) |
 | serialize / restoreState / parseHistory  (strings in, strings out, no I/O)     |
 +--------------------------------------------------------------------------------+
```

Principles that drive every decision below:

- The state is a value. `step` never mutates and never reads a clock; `now` is an argument (R4.2, R11.1, R12.3).
- Time is always `timestamp - timestamp`. A tick carries no information except `now` (R4.3).
- Every session end is dated to its true instant, computed from stored timestamps (R3.5, R5.1, Decision Q4).
- `step` returns the same object reference when nothing changed. Callers can detect change with `!==` (R1.3), and storage uses that to decide whether to write.

All times are integer milliseconds since the Unix epoch. `step` floors `now` with `Math.floor` and returns the state unchanged for a non-finite `now`, so stored timestamps are always integers (this keeps validation in section 6 simple and the engine total, R12.2).

## 2. Constants

`src/engine/constants.ts`

```ts
export const MS_PER_MINUTE = 60_000;
export const PRESET_LENGTHS_MIN = [15, 25, 50] as const; // for the UI; the engine treats them as ordinary lengths (R2.3)
export const MIN_LENGTH_MIN = 5;
export const MAX_LENGTH_MIN = 90;
export const INTENT_MAX_CODE_POINTS = 80;
export const PAUSE_LIMIT_MS = 600_000;  // R3.4
export const BREAK_MS = 300_000;        // R7.1
export const SCHEMA_VERSION = 1;        // R10.4
```

## 3. Types

`src/engine/types.ts`

```ts
export type Outcome = 'burned-out' | 'snuffed';

/** One focus session. Immutable; every change makes a new object. */
export interface Session {
  readonly startedAt: number;       // ms epoch, set by `light`
  readonly lengthMin: number;       // integer 5..90
  readonly intent: string | null;   // normalized (section 5.1), null when empty
  readonly pausedTotalMs: number;   // CLOSED pause spans only, 0..PAUSE_LIMIT_MS
  readonly distractions: number;    // R8: field only, always 0 in this spec
  readonly timeAwayMs: number;      // R8: field only, always 0 in this spec
}

export interface HistoryEntry {     // R10.1
  readonly startedAt: number;
  readonly endedAt: number;
  readonly lengthMin: number;
  readonly intent: string | null;
  readonly outcome: Outcome;
  readonly distractions: number;
  readonly timeAwayMs: number;
}

interface WithHistory {
  /** Oldest first, append-only (R10.2). Carried by every phase. */
  readonly history: readonly HistoryEntry[];
}

export interface IdleState     extends WithHistory { readonly phase: 'idle' }
export interface LitState      extends WithHistory {
  readonly phase: 'lit';
  readonly session: Session;
  /** Start of the current burning segment: startedAt, or the instant of the last resume. */
  readonly litSince: number;
}
export interface PausedState   extends WithHistory {
  readonly phase: 'paused';
  readonly session: Session;
  readonly pausedAt: number;        // start of the open pause span
}
export interface BurnedOutState extends WithHistory {
  readonly phase: 'burned-out';
  readonly session: Session;
  readonly endedAt: number;         // true completion instant
  readonly breakEndsAt: number;     // endedAt + BREAK_MS (R7.1)
}
export interface SnuffedState  extends WithHistory {
  readonly phase: 'snuffed';
  readonly session: Session;
  readonly endedAt: number;
}

export type State = IdleState | LitState | PausedState | BurnedOutState | SnuffedState;

export type Event =
  | { readonly type: 'light'; readonly length: number; readonly intent?: string }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  | { readonly type: 'snuff' }
  | { readonly type: 'tick' }
  | { readonly type: 'hide' }
  | { readonly type: 'show' }
  | { readonly type: 'reload'; readonly state: State };

export const INITIAL_STATE: IdleState = { phase: 'idle', history: [] };
```

Notes:

- History lives on the state so `step` stays a single `(State, Event, number) -> State` function and R10.1 ("the engine adds one entry") needs no second return value.
- `litSince` is the one field beyond what the brief names. It is the anchor that makes the clock-moved-backwards rule (R4.5) hold after a resume, see section 4.2. It is derivable (`startedAt` plus total paused time before the current segment), so it adds no new information, only a place to clamp against.
- The union is closed. `src/engine/types.ts` uses no `any`; `step` ends each `switch` with an exhaustive `never` check at compile time plus a runtime default that returns the state (R12.2).
- `snuffed` keeps no pause or burn anchor. Selectors treat it like `idle` and `burned-out` (no running candle, section 4.3). The graveyard reads from history, not from the live state.

## 4. Functions

Files: `time.ts` (formulas), `settle.ts`, `step.ts`, `selectors.ts`, `history.ts`, `intent.ts`.

### 4.1 Time formulas

Let `L = session.lengthMin * MS_PER_MINUTE` and `clamp(x, lo, hi) = min(max(x, lo), hi)`.

```ts
// time.ts  (pure; no Date)
completionAt(s: LitState)   = s.session.startedAt + s.session.pausedTotalMs + L        // R5.1
pauseLimitAt(s: PausedState) = s.pausedAt + (PAUSE_LIMIT_MS - s.session.pausedTotalMs) // R3.5

burnMs(state, now):
  lit:    clamp(max(now, litSince) - startedAt - pausedTotalMs, 0, L)   // R4.1, R4.5
  paused: clamp(pausedAt           - startedAt - pausedTotalMs, 0, L)   // frozen while paused, R3.3
  other:  0
```

Why these match the requirements:

- R4.1: while lit, burn time is `now - startedAt - pausedTotal`. The closed spans are in `pausedTotalMs`; the open span only exists while paused, where burn is frozen at `pausedAt`, which is the same formula with the open span removed.
- R4.5: `max(now, litSince)` is the clamp. If the clock moves backwards, elapsed time is treated as zero since the last stored instant, never negative, and burn can never fall below its value at `litSince`. A formula that only clamped at `startedAt` would let time left grow again after a resume; `litSince` prevents that.
- R3.5: pause limit instant = pause start plus remaining allowance. The limit is **exceeded** only when `now > pauseLimitAt`, so exactly 10 minutes is allowed.
- R5.1: the candle completes at `completionAt`, which already includes every closed pause span. Completion happens when `now >= completionAt`.

### 4.2 Settle (R5.1, R5.2, R5.4, R3.6)

`settle(state, now)` moves a session that has already ended, by timestamps, into its final phase. It is idempotent and returns the same reference when nothing is due.

```ts
export function settle(s: State, now: number): State {
  if (s.phase === 'lit') {
    const c = completionAt(s);
    if (now >= c) return endBurnedOut(s, c);          // end = true instant, not `now`
  } else if (s.phase === 'paused') {
    const l = pauseLimitAt(s);
    if (now > l) return endSnuffed(s, l);             // end = limit instant, not `now`
  }
  return s;
}

function endBurnedOut(s: LitState, end: number): BurnedOutState {
  return { phase: 'burned-out', session: s.session, endedAt: end, breakEndsAt: end + BREAK_MS,
           history: appendEntry(s.history, entryOf(s.session, end, 'burned-out')) };
}
function endSnuffed(s: LitState | PausedState, end: number): SnuffedState { /* same, outcome 'snuffed', no breakEndsAt */ }
```

Settle only ever looks at one condition per phase, and a settled state is final, so one pass is enough (no loop).

### 4.3 `step`

```ts
export function step(state: State, event: Event, now: number): State {
  if (!Number.isFinite(now)) return state;
  const t = Math.floor(now);

  switch (event.type) {
    case 'hide':
    case 'show':   return state;                      // R8.2: no field changes, and no settling either
    case 'reload': return settle(event.state, t);     // R9.2; event.state comes from restoreState (validated)
    case 'tick':   return settle(state, t);           // R5.3: same reference when nothing is due
  }

  const s = settle(state, t);                         // R5.4: settle BEFORE handling any other event
  switch (event.type) {
    case 'light':  return light(s, event, t);
    case 'pause':  return s.phase === 'lit' ? pause(s, t) : s;
    case 'resume': return s.phase === 'paused' ? resume(s, t) : s;
    case 'snuff':  return s.phase === 'lit' || s.phase === 'paused' ? snuff(s, t) : s;
    default:       return s;                          // unknown event at runtime: unchanged, never throws (R12.2)
  }
}
```

Transition functions (all return new objects; none mutate):

```ts
function light(s: State, e: LightEvent, t: number): State {
  if (s.phase === 'lit' || s.phase === 'paused') return s;                 // R2.5
  if (!Number.isInteger(e.length) || e.length < 5 || e.length > 90) return s; // R2.2, R2.3
  return { phase: 'lit', history: s.history, litSince: t,                  // R1.5: also from burned-out / snuffed
           session: { startedAt: t, lengthMin: e.length, intent: normalizeIntent(e.intent),
                      pausedTotalMs: 0, distractions: 0, timeAwayMs: 0 } };
}

function pause(s: LitState, t: number): PausedState {
  return { phase: 'paused', history: s.history, session: s.session, pausedAt: Math.max(t, s.litSince) };
}

function resume(s: PausedState, t: number): LitState {
  const at = Math.max(t, s.pausedAt);                    // R4.5: never a negative span
  const span = at - s.pausedAt;                          // <= allowance, because settle already ran (R3.6)
  return { phase: 'lit', history: s.history, litSince: at,
           session: { ...s.session, pausedTotalMs: s.session.pausedTotalMs + span } };
}

function snuff(s: LitState | PausedState, t: number): SnuffedState {
  const end = Math.max(t, s.phase === 'lit' ? s.litSince : s.pausedAt);  // R6.1: `now`, never before the last anchor
  return endSnuffed(s, end);
}
```

How each rule falls out of the structure:

- R1.2: the only code paths that change `phase` are `light` (idle/burned-out/snuffed -> lit), `pause`, `resume`, `snuff`, and `settle`. No other path exists.
- R1.3 / R12.2: every non-matching combination returns `s` (the settled state), which is the input reference when settle did nothing.
- R3.6: a `resume` that arrives after the pause limit is first settled to `snuffed` at the limit instant, then `resume` finds the phase is not `paused` and is ignored.
- R5.4 and `light`: if a candle finished while the page was away and the user presses Light, settle ends it (history gets its entry at the true instant) and then `light` starts the new session.
- R6.1: if the session had already ended before `now`, settle runs first and `snuff` is ignored.
- R7.1 / R7.4: only `endBurnedOut` sets `breakEndsAt`. `SnuffedState` has no such field.
- R8.2: `hide` and `show` return the input reference and skip settling. This follows R8.2's "return the state unchanged" literally; a session due to end is settled by the next `tick`, which the UI sends anyway. (R5.4 exempts `hide` and `show` for this reason.)
- R9.5: see 4.5.

### 4.4 Selectors (R4.4, R4.6, R7.2)

`src/engine/selectors.ts`, all pure and total:

```ts
export function timeLeftMs(s: State, now: number): number {
  if (s.phase !== 'lit' && s.phase !== 'paused') return 0;          // no running candle
  const L = s.session.lengthMin * MS_PER_MINUTE;
  return L - burnMs(s, Math.floor(now));                             // in [0, L] by the clamp in burnMs
}
export function waxFraction(s: State, now: number): number {
  if (s.phase !== 'lit' && s.phase !== 'paused') return 0;
  return timeLeftMs(s, now) / (s.session.lengthMin * MS_PER_MINUTE); // in [0, 1]
}
export function isBreak(s: State, now: number): boolean {
  return s.phase === 'burned-out' && now < s.breakEndsAt;           // R7.2, exactly
}
```

- `idle`, `burned-out` and `snuffed` return 0: there is no running candle to measure. How an unlit or finished candle is drawn is for `candle-scene`, which can read the phase.
- Selectors do not settle. A `lit` state whose completion has passed reports `timeLeftMs = 0` and `isBreak = false` until the next `tick` settles it. The UI ticks on every redraw, so this window is one frame.
- Non-finite `now` yields `NaN` from arithmetic. Selectors treat it like `step` does: `Number.isFinite(now) ? ... : 0` (omitted from the snippets above for brevity).

### 4.5 History (R10.1, R10.2, R9.5)

`history.ts`:

```ts
entryOf(session, endedAt, outcome): HistoryEntry
appendEntry(history, entry): readonly HistoryEntry[]
//   returns the same array when an entry with the same (startedAt, endedAt) already exists,
//   otherwise [...history, entry]. Never edits or reorders existing entries.
```

The `(startedAt, endedAt)` key makes the append idempotent. That gives "exactly once" (R9.5) even when a crash left the saved session already ended but the saved history without its entry (section 7).

### 4.6 Intent normalization (R2.4, Decision Q2)

`intent.ts`:

```ts
export function normalizeIntent(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const flat = raw.replace(/[\r\n\u2028\u2029]+/g, ' ').trim();       // flatten line breaks, trim ends
  const cut = Array.from(flat).slice(0, INTENT_MAX_CODE_POINTS).join('').trimEnd();
  return cut === '' ? null : cut;
}
```

`Array.from` iterates by code point, so a surrogate pair is never split (the 80th code point may be an emoji). The final `trimEnd` removes a space exposed by the cut, which makes the function idempotent.

## 5. Serialization and validation

`src/engine/serialize.ts` (formats and functions) and `validate.ts` (type guards). Pure: strings in, strings out. No `JSON` errors escape; no I/O.

### 5.1 Formats

Two documents, two storage keys (R11.2), each versioned (R10.4).

Current session (`serializeSession`, returns `null` for `idle`, which the adapter stores by removing the key):

```json
{ "v": 1, "phase": "lit",
  "session": { "startedAt": 1788000000000, "lengthMin": 25, "intent": "write the report",
               "pausedTotalMs": 0, "distractions": 0, "timeAwayMs": 0 },
  "litSince": 1788000000000 }
```

Phase-specific fields: `lit` has `litSince`; `paused` has `pausedAt`; `burned-out` has `endedAt` and `breakEndsAt`; `snuffed` has `endedAt`. Final sessions are saved too, because the break must survive a reload (R7.6).

History (`serializeHistory`):

```json
{ "v": 1, "entries": [
  { "startedAt": 1787990000000, "endedAt": 1787991500000, "lengthMin": 25, "intent": null,
    "outcome": "burned-out", "distractions": 0, "timeAwayMs": 0 } ] }
```

`JSON.stringify` of these shapes is lossless: integers below 2^53, strings (quotes, backslashes, emoji and lone surrogates are escaped and restored by `JSON.parse`), and `null`.

### 5.2 Functions

```ts
serializeSession(s: State): string | null            // null for idle
serializeHistory(h: readonly HistoryEntry[]): string
parseHistory(json: string | null | undefined): HistoryEntry[]    // never throws (R10.5)
restoreState(sessionJson: string | null | undefined,
             historyJson: string | null | undefined): State      // never throws (R9.4)

// Status variants used by the storage adapter (section 6). Same parsing, plus a verdict:
readHistory(json): { entries: HistoryEntry[]; status: 'absent' | 'ok' | 'unreadable' }
readSession(json): { state: State | null;     status: 'absent' | 'ok' | 'unreadable' }
```

`parseHistory(j)` is `readHistory(j).entries`. `restoreState` is built from `readHistory` and `readSession`. Status meaning:

- `absent`: the text is `null`, `undefined` or `""`.
- `unreadable`: the text is present but is not a valid v1 document: invalid JSON, wrong or missing `v`, no `entries` array (history), or a session document that fails the checks in 5.3 (session).
- `ok`: anything else, including a history document from which some invalid entries were dropped.

### 5.3 Validation rules

`parseHistory`:

1. `null`, empty, invalid JSON, wrong `v`, or no `entries` array -> `[]`.
2. Each entry is checked on its own. Valid entries are kept **unchanged** and in order; invalid ones are dropped (R10.5: valid entries are never silently altered).
3. An entry is valid if: all counters and timestamps are integers >= 0 (`Number.isSafeInteger`), `lengthMin` is an integer in 5..90, `endedAt >= startedAt`, `outcome` is one of the two values, and `intent` is a string or `null`.
4. A document with an unknown `v` is treated as malformed and gives `[]` (or idle). On its own this would be unsafe: the next history write would replace the stored text with the in-memory (empty) history and erase every stored entry. The engine therefore only reports the verdict (`status: 'unreadable'`); the storage adapter preserves the raw text before overwriting (section 6). A future migration step is the place to read older versions (R10.4).

`restoreState`:

1. History comes from `parseHistory`. The session comes from the session document.
2. Session is valid only if: `v` matches, `phase` is one of `lit`, `paused`, `burned-out`, `snuffed`, the `session` object passes the same field checks as above (plus `pausedTotalMs <= PAUSE_LIMIT_MS`), and the phase fields are consistent:
   - `lit`: `startedAt + pausedTotalMs <= litSince < completionAt`.
   - `paused`: `startedAt + pausedTotalMs <= pausedAt`, and burn at `pausedAt` is `< L`.
   - `burned-out`: `endedAt >= startedAt` and `breakEndsAt === endedAt + BREAK_MS`.
   - `snuffed`: `endedAt >= startedAt`.
3. Anything missing, malformed or inconsistent -> `{ phase: 'idle', history }` (R9.4). Unknown extra properties are ignored.
4. Crash repair: for a restored `burned-out` or `snuffed` session, `appendEntry` adds its history entry if absent. Because append is idempotent, a normal restore adds nothing (R9.5).

`restoreState` does not settle; the `reload` event does. This keeps one place (`settle`) that decides when a session ended, and makes P8 a direct comparison with `tick`.

### 5.4 Reload flow

```
boot:  state0 = store.load()                       // restoreState(...) inside, never throws
       state  = step(state0, { type: 'reload', state: state0 }, Date.now())
```

`reload` ignores the current state argument and settles `event.state` at `now`: a candle that ran out while the page was closed becomes `burned-out` at its true instant with one history entry; a lapsed pause becomes `snuffed` at the limit instant; otherwise it carries on, with closed-page time counted as burn time (lit) or paused time (paused) automatically because both come from timestamps (R9.3).

## 6. Storage adapter (R11.2)

`src/storage/storage.ts`. The only code that knows about `localStorage`. Imports from `src/engine`, never the other way.

```ts
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export const SESSION_KEY = 'candlewatch:session';
export const HISTORY_KEY = 'candlewatch:history';

export function browserStore(): KeyValueStore | null;      // try { return window.localStorage } catch { return null }
export function createStorage(kv: KeyValueStore | null): {
  load(): State;                                           // restoreState(read(SESSION_KEY), read(HISTORY_KEY))
  save(prev: State | null, next: State): void;             // call only when next !== prev
};
```

- `save` writes the history key only when `next.history !== prev?.history` (reference check, which the engine's reference-preserving design makes reliable), and the session key always: serialized text, or `removeItem` for `idle`.
- Every `getItem`, `setItem` and `removeItem` call is wrapped in `try/catch`. A `null` store (unavailable), a `SecurityError`, or a full-quota `QuotaExceededError` degrades to "no persistence" and never throws (R11.2). `load()` then returns `INITIAL_STATE`.
- Order of writes: history first, then session. If the second write fails, the next load sees an older session and the full history; the idempotent append in `restoreState` and `settle` keeps entries unique.
- `main.ts` (not part of this spec's code) will call `store.save(prev, next)` after each `step` where `next !== prev`, and own `Date.now()` (R11.3).

### 6.1 Never destroy unreadable stored text

Problem: when the stored text cannot be read, `load()` returns an empty history (or idle). The next time a session ends, `save` writes the in-memory history, which would replace the stored text and erase every entry that was in it (for example after a version bump or a half-written value).

Rule: the adapter keeps a copy of the raw text before it overwrites it.

- `load()` reads each key's raw text and asks the engine for a verdict (`readHistory` / `readSession`, section 5.2). When the verdict is `unreadable` (text present, but invalid JSON, wrong `v`, no `entries` array, or a session document that fails validation), the adapter remembers `{ key, rawText }` as pending for that key. `absent` and `ok` set nothing. A history document that only had some invalid entries dropped counts as `ok`: those entries are not recoverable by this rule.
- Backup keys: `candlewatch:history:unreadable` and `candlewatch:session:unreadable`.
- Before the first write to a key that has a pending backup (for the session key, a `setItem` or the `removeItem` for idle), `save` does:
  1. `getItem(backupKey)`. If it already holds text, an older backup exists: do not overwrite it; the pending state is cleared and the write goes ahead.
  2. Otherwise `setItem(backupKey, rawText)`.
  3. If that `setItem` throws (for example the quota is full), the key is **not** overwritten and the pending state stays, so the stored text survives and the next `save` tries again. The app keeps running; that key is simply not persisted.
  4. On success the pending state is cleared and the write goes ahead.
- The raw text is copied byte-for-byte (a string copy, never re-serialized). The backup is written at most once per unreadable text and never read by the app; it is for manual or future migration recovery.
- If a later `save` has no pending backup, none of this code runs (no extra reads on the hot path).

The engine stays free of storage: it only reports the verdict. The decision to copy, and the keys, live in `src/storage/` (R11.1, R11.2).

## 7. File layout

Per `.kiro/steering/structure.md`: kebab-case files, colocated tests, `*.prop.test.ts` for property tests.

```
src/engine/
  constants.ts
  types.ts
  intent.ts            intent.test.ts
  time.ts              (covered by step/selectors tests)
  history.ts           history.test.ts
  settle.ts
  step.ts              step.test.ts           step.prop.test.ts     (P1 P2 P3 P4 P7 P9 P10)
  selectors.ts         selectors.test.ts      selectors.prop.test.ts (P5 P11)
  validate.ts
  serialize.ts         serialize.test.ts      serialize.prop.test.ts (P6 P8)
  test-kit.ts          shared arbitraries and the script runner (imported only by tests)
                       test-kit.test.ts   (sanity checks for the runner and `assertInvariants`)
  purity.test.ts       scans src/engine/*.ts (non-test) for window|document|localStorage|Date.now|performance|Math.random
  index.ts             public API: step, selectors, serialize, types, constants
src/storage/
  storage.ts           storage.test.ts   (fake KeyValueStore: throws, full, null, unreadable text and backups)
```

`index.ts` re-exports only the public surface. `settle`, `time` and `validate` stay internal except what `serialize` needs.

`purity.test.ts` enforces R11.1 mechanically: it reads the engine's non-test sources and fails on any of those identifiers.

## 8. Test plan

### 8.1 Example tests (Vitest)

- `intent.test.ts`: trim, line-break flattening, empty -> `null`, 80 code points, 81 emoji cut to 80 with no lone surrogate, 79 ASCII + emoji keeps the emoji as the 80th code point, 79 ASCII + two emoji keeps only the first, idempotence.
- `step.test.ts`: lengths 4, 5, 90, 91, 25.5, `NaN` ignored; light from each phase; pause of exactly 10 minutes allowed, 10 minutes + 1 ms snuffed at the limit instant; resume after the limit snuffs; completion discovered late is dated to the true instant; `light` after a late completion records the old session once, then starts the new one; `hide`/`show` return the same reference; non-finite `now` returns the same reference; break window (`breakEndsAt = endedAt + 300 000`, `isBreak` false at and after it, true one ms before).
- `serialize.test.ts`: documented JSON examples round-trip; corrupt inputs (`""`, `"{"`, wrong `v`, wrong types, inconsistent phase fields) give idle or `[]` without throwing; invalid entries dropped, valid ones intact.
- `storage.test.ts`: working fake store round-trip; `null` store; `getItem` throws; `setItem` throws quota error; `save` skips the history write when history is unchanged. Unreadable text (fake store with a call log):
  - history text that is invalid JSON, has a wrong `v`, or has no `entries` array: after `load()`, the first history write is preceded by `setItem('candlewatch:history:unreadable', <exact raw text>)`;
  - the same for session text that fails validation, with `candlewatch:session:unreadable`, including when the first session write is the `removeItem` for idle;
  - the backup is written once: a second history write does not copy again;
  - an existing non-empty backup key is not overwritten, and the write still goes ahead;
  - if writing the backup throws, the history (or session) key is not overwritten and keeps the raw text; a later `save` retries the backup;
  - `absent`/empty text and valid text, including a history document with some invalid entries dropped, create no backup and no extra `getItem` of the backup keys.

### 8.2 Property tests (fast-check 4)

Shared in `test-kit.ts`:

```ts
// A script is a list of steps with a relative gap; absolute times come from a start t0.
type StepKind = 'light' | 'pause' | 'resume' | 'snuff' | 'tick' | 'hide' | 'show' | 'reload';
interface ScriptStep { kind: StepKind; gap: number; length?: number; intent?: string }

arbT0        = fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 });        // realistic epoch ms
arbGap       = fc.oneof({ weight: 4, arbitrary: fc.integer({ min: 0, max: 5_000 }) },   // fast ticks
                        { weight: 3, arbitrary: fc.integer({ min: 0, max: 120_000 }) }, // up to 2 min
                        { weight: 1, arbitrary: fc.integer({ min: 0, max: 4 * 3_600_000 }) }); // laptop sleep
arbSignedGap = fc.integer({ min: -60_000, max: 120_000 });                              // clock may go back (P5)
arbLength    = fc.oneof(fc.constantFrom(15, 25, 50), fc.integer({ min: 5, max: 90 }));
arbBadLength = fc.oneof(fc.integer({ min: -10, max: 4 }), fc.integer({ min: 91, max: 500 }),
                        fc.double({ noInteger: true }), fc.constantFrom(NaN, Infinity, -Infinity));
arbIntent    = fc.option(fc.oneof(
                 fc.string({ unit: 'grapheme' }), fc.string({ unit: 'binary' }),        // includes lone surrogates
                 fc.array(fc.constantFrom('a', 'é', '日本', '😀', '\n', '  ', '"', '\\'), { maxLength: 120 })
                   .map((p) => p.join(''))), { nil: undefined });
arbStep      = fc.record({ kind: fc.constantFrom(...all kinds, weighted towards tick/pause/resume),
                           gap: arbGap, length: arbLength, intent: arbIntent });
arbScript    = fc.array(arbStep, { maxLength: 60 });

runScript(script, t0, initial = INITIAL_STATE): Trace   // Trace = Array<{ event, now, before, after }>
```

`runScript` turns a `reload` step into a real round trip: `restoreState(serializeSession(after), serializeHistory(after.history))`, then `step(state, {type:'reload', state: restored}, now)`. It never touches a real clock.

`assertInvariants(state)` (also in `test-kit.ts`) checks structure that must always hold: phase in the five; integer timestamps; `pausedTotalMs` in `[0, PAUSE_LIMIT_MS]`; anchors ordered (`startedAt + pausedTotalMs <= litSince`, etc.); `breakEndsAt === endedAt + BREAK_MS` and present only on `burned-out`; history entries valid and `endedAt >= startedAt`. It runs after every step of P1-P11 as a cheap extra oracle.

Each property runs `numRuns: 300` (raise in CI if time allows) and prints the seed on failure.

| ID | Generation | Assertion |
|---|---|---|
| P1 | `arbT0`, `arbScript` (non-decreasing times). | For consecutive trace entries where both states are `lit` or `paused` and share `session.startedAt`: `timeLeftMs(after, now_i+1) <= timeLeftMs(before, now_i)`. |
| P2 | `arbLength`; `pairs`: up to 10 `{ burn, pause }` with each `burn` in `[1, floor((L-1)/10)]` and each `pause` in `[0, 60_000]` (total pause <= 10 min by construction). Script: light, then per pair: advance `burn`, pause, advance `pause`, resume. | With `P = sum(pause)`: at `t0 + L + P - 1`, a tick leaves the state `lit` with `timeLeftMs = 1`; at `t0 + L + P`, a tick gives `burned-out` with `endedAt = t0 + L + P` and `pausedTotalMs = P`. A pause-free run of the same length ends at `t0 + L`. |
| P3 | A base script from `arbScript`, plus `extras: fc.array(fc.tuple(fc.nat(), fc.double({min:0,max:1})))`: each extra `tick` is inserted after step `i % n` at a time interpolated between its neighbours (so time stays non-decreasing). A second variant inserts a tick every `period` ms between events (`period` in 1..60_000, capped at 500 ticks). | The state after every original event is deep-equal (`toStrictEqual`) in the base run and in the run with extra ticks. |
| P4 | `arbScript` with weights that include invalid steps (`arbBadLength`, `pause` in `idle`, etc.), small negative gaps allowed, and raw junk `reload` events built with `restoreState(fc.string() or fc.json(), fc.string())`. | `step` never throws; `assertInvariants(after)`; each non-`reload` step is an allowed move: `idle -> {idle, lit}`, `lit -> {lit, paused, burned-out, snuffed}`, `paused -> {paused, lit, snuffed}`, `burned-out -> {burned-out, lit}`, `snuffed -> {snuffed, lit}`. Any move into `lit` from `burned-out`/`snuffed`/`idle` has `litSince = startedAt = now` (a new session), and `paused -> lit` keeps the same `startedAt`. Nothing moves to `idle`. |
| P5 | `arbT0`, a script using `arbSignedGap`, and for each state a probe `now` from `fc.integer` around the anchor (`anchor - 120_000 .. anchor + 4h`). | `waxFraction` is in `[0, 1]` at every probe; for probes `<= anchor` it equals the fraction at the anchor (the clamp), and for probes past the anchor it is `<=` that value. The anchor is `litSince` when lit and `pausedAt` when paused. |
| P6 | `arbEntry = fc.record({...})` with valid ranges and `intent: arbIntent.map(normalizeIntent)`, `arbHistory = fc.array(arbEntry, { maxLength: 40 })`. | `parseHistory(serializeHistory(h))` `toStrictEqual` `h`; the JSON has `"v": SCHEMA_VERSION`. Also: `parseHistory(anyString)` never throws and returns an array; injecting invalid entries between valid ones returns exactly the valid ones in order. |
| P7 | Light a session of `arbLength`, then `pause` after a random burn; sample the pause duration `d` from `{allowance - 1, allowance, allowance + 1, ...}` plus `fc.integer(0, 20 min)`, and the noticing event from `{tick, resume, snuff, pause, light, reload}` at `pausedAt + d + extra`, `extra` in `[0, 1h]`. Also multi-pause sequences. | If `d <= allowance`, the next `resume` gives `lit` with `pausedTotalMs` increased by `d`. Otherwise the result is `snuffed` with `endedAt === pausedAt + allowance` **whichever event noticed it and however late**. In every trace state `pausedTotalMs <= PAUSE_LIMIT_MS`. |
| P8 | `arbScript`, then for each running state in the trace (`lit`, `paused`, `burned-out`) a probe `T = now + fc.integer(0, 6h)`. | `restoreState(serializeSession(s), serializeHistory(s.history))` `toStrictEqual` `s`; and `step(s, {reload, state: restored}, T)` `toStrictEqual` `step(s, {tick}, T)`. |
| P9 | Every state in any trace, plus `fc.integer` for `now`. | `step(s, hide, now) === s` and `step(s, show, now) === s` (same reference). |
| P10 | `arbScript`. | For each step: `after.history.length >= before.history.length`; the old entries are the same objects in the same positions; length grows by 1 exactly when the step moved `lit`/`paused` to `burned-out`/`snuffed` (including via settle inside `light`/`reload`), else 0. At the end, `history.length` equals the number of sessions ended in the trace. Reload twice at a late `T` on one running state adds exactly one entry in total (R9.5). |
| P11 | `arbScript` plus probe times `fc.integer` around `endedAt` and `breakEndsAt`. | For every state: `isBreak(s, p) === (s.phase === 'burned-out' && p < s.breakEndsAt)`; `'breakEndsAt' in s` iff `phase === 'burned-out'`; and, using an independent reference (`endedAt` taken from the script's own arithmetic `t0 + L + P`), `breakEndsAt === that + 300_000`. |

## 9. Traceability

| Requirement | Where |
|---|---|
| R1 | 4.3 (single code path per transition), P4 |
| R2 | 4.3 `light`, 4.6 `normalizeIntent`, `step.test.ts`, `intent.test.ts` |
| R3 | 4.1 `pauseLimitAt`, 4.2 `settle`, 4.3 `pause`/`resume`, P2, P7 |
| R4 | 4.1 formulas (`litSince` clamp), 4.4 selectors, P1, P3, P5 |
| R5 | 4.2 `settle`, 4.3 order of `settle` before events, P3, P8 |
| R6 | 4.3 `snuff` |
| R7 | 3 (`breakEndsAt`), 4.2 `endBurnedOut`, 4.4 `isBreak`, P11 |
| R8 | 3 (`distractions`, `timeAwayMs`), 4.3 `hide`/`show`, P9 |
| R9 | 5.3, 5.4 `reload`, P8, P10 |
| R10 | 4.5 `appendEntry`, 5 formats, P6, P10 |
| R11 | 6 adapter, `purity.test.ts` |
| R12 | 3 closed `Event` union, 4.3 default branch and non-finite guard, P4 |

## 10. Decisions

Review outcomes. Items applied to `requirements.md` or to this document are marked; the rest are accepted as designed.

1. **P5 wording (applied).** `requirements.md` P5 now says what the design guarantees: the wax fraction is always in [0, 1], equals the fraction at the anchor (`litSince` or `pausedAt`) for any probe time at or before it, and never exceeds it past the anchor. The claim about remembering an earlier `now` is removed.
2. **`hide` / `show` do not settle (accepted).** `requirements.md` R5.4 now exempts them, so it no longer conflicts with R8.2.
3. **Selectors do not settle (accepted).** After a late discovery a `lit` state reads as `0` left and `isBreak` false until the next `tick`.
4. **`litSince` field on `LitState` (accepted).** It makes the clock-backwards clamp (R4.5) monotone after a resume.
5. **`now` is floored and a non-finite `now` returns the state unchanged (accepted).** `requirements.md` R12.4 now states this, and that selectors return 0 (or `false`) for a non-finite `now`.
6. **Unknown schema version and other unreadable text (resolved, changed).** The earlier text claimed the adapter would not overwrite such text; it would have, because `save` writes the in-memory history after a failed parse. Section 6.1 now copies the raw text once to `candlewatch:history:unreadable` (or `candlewatch:session:unreadable`) before the first write to that key, only if the backup key is empty, and leaves the key untouched if the backup cannot be written. Section 5.3 rule 4 and the `storage.test.ts` list are updated to match.
7. **`idle` and `snuffed` selectors return 0 (accepted).** The scene spec can read the phase if it needs more.