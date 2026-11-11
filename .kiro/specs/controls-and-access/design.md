# Design: controls-and-access

Implements `requirements.md` (review answers applied). Read with `docs/BRIEF.md` sections 4, 5, 7, 11; `.kiro/steering/*`; and the finished specs, above all `candle-scene` design 5 (the stage and the zone) and 7.2 (the contrast handoff), `distraction-tracking` R11 (`watchVisibility`, `syncVisibility`) and `session-engine` (the events, `timeLeftMs`, `isBreak`, the pause limit).

Status: **approved with two changes** (design review; both are applied here and recorded in section 17, D14 and D15): the Settings opener lives in the floor-band zone, so nothing persistent is ever in the light pool; and the Tab order equals the visual order in every layout. The tasks are in `tasks.md`. No code is written. Decisions that this design makes beyond the requirements are in section 17.

## 1. Overview

### 1.1 What is built

A layer of controls and text on top of the finished scene, driven by the finished engine. Four rules shape every choice:

1. **One path in.** Every user action, from a key or a pointer, becomes a `UiAction`, goes through one pure function (`uiStep`), and ends as zero or more engine events passed to the one `dispatch(event, now)` in `main.ts`. Nothing else calls `step`.
2. **Logic is pure, the DOM is thin.** Vitest runs in Node with no DOM library. So everything that decides something (the time text, the length, the light request, the key map, the UI state machine, the view model, the announcer, the layout, the settings document) is a pure module with properties. The DOM code builds elements once, applies a view model, turns DOM events into `UiAction`s, and moves focus. It has no branching on phase or time.
3. **Nothing lit is covered.** The persistent interface sits where the flame, the halo, the candle and the window never are (section 6, checked against the scene's geometry).
4. **The engine stays the authority.** The UI never computes time, wax or pause totals. It formats what `timeLeftMs`, `pauseLeftMs` and `isBreak` return.

### 1.2 Data flow

```
 keydown / click / input / submit / dialog cancel   (DOM events, dom/events.ts)
        │  KeyDescriptor + FocusKind  →  keyAction()  →  UiAction | null
        ▼
   uiStep(ui, action, ctx)  ──►  { ui', events[], effects }          (pure, ui-state.ts)
        │                              │
        │                              ├─ events  → dispatch(event, Date.now())   (main.ts)
        │                              │               └─ step → storage.save → state'
        │                              ├─ effects.announce → live writer
        │                              ├─ effects.focus    → focus target (after the next apply)
        │                              (settings changes do not pass through uiStep: the panel calls onSettings → settings store)
        ▼
 every frame (main.ts):  dispatch(tick) → scene.apply(sceneModel(...)) → ui.update(state, now)
        └─ ui.update: engine-phase changes → uiStep; announcer; viewOf(state, ui, settings, now, placement) → apply(view)
```

### 1.3 Files

```
src/engine/selectors.ts           + pauseLeftMs (section 2); index.ts exports it
src/storage/settings.ts           parseSettings, serializeSettings, createSettingsStore (the only settings code that touches localStorage)
src/ui/
  format.ts                       formatTime, spokenTime, fill (template substitution)           pure
  length.ts                       parseLength, LengthChoice, nextChoice (arrow-key movement)     pure
  light.ts                        lightRequest                                                   pure
  keys.ts                         keyAction, KeyDescriptor, FocusKind                            pure
  ui-state.ts                     UiState, UiAction, uiStep, Effects                             pure
  view.ts                         viewOf -> ViewModel (what to show, with text from strings.ts)  pure
  announcer.ts                    nextAnnouncement, timeMessage, AnnouncerMemory                 pure
  layout.ts                       stageBox, placeControls, keep-clear constants                  pure
  dom/build.ts                    creates the elements once (no innerHTML, no style attributes)
  dom/apply.ts                    applies a ViewModel (writes only what changed)
  dom/events.ts                   DOM events -> KeyDescriptor / UiAction
  dom/focus.ts                    focus targets, fallbacks
  dom/live.ts                     the live-region writer
  index.ts                        createInterface(deps) -> { update(state, now) }
  ui.css                          tokens, controls, dialogs, focus ring, reduced motion
src/strings.ts                    + all new text (section 8.9)
src/main.ts                       wiring (section 5)
```

Test-only: `src/ui/test-kit.ts` (arbitraries for key events, UI inputs, settings, text; a reference model of the UI). Never imported by source (the purity test checks it, as for the engine's test kit).

### 1.4 Boundaries (structure.md)

- `src/ui/` imports `src/engine/index.ts` and `src/strings.ts`. It does not import `src/scene/` (the layout keeps its own copy of the few scene numbers it needs, and a test compares them with `src/scene/constants.ts`), `src/distraction/` (wired in `main.ts`), or anything from `src/storage/` at run time: the settings reach it as plain values and a callback, and it takes only the `Settings` type from `src/storage/settings.ts` (a type-only import).
- `src/storage/settings.ts` imports nothing from the engine's internals. It is pure except for the `KeyValueStore` it is given.
- `src/engine/` still imports nothing else. `src/scene/` is unchanged.
- Only `main.ts` and `src/ui/` own `Date.now`. In `src/ui/` the only reads of the clock are in `dom/events.ts` (the moment of a user action, passed on as `now`) and in `index.ts` (`update` receives `now` from `main.ts`).
- The pure modules (`format`, `length`, `light`, `keys`, `ui-state`, `view`, `announcer`, `layout`) import nothing from the DOM, `window`, `document`, `localStorage`, `Date`, `performance` or `Math.random`, and are covered by a purity test like the engine's and the scene's. They import `strings.ts` (plain constants).

## 2. Engine addition: `pauseLeftMs` (R5.6, Decision Q4)

A paused session is snuffed without warning when its 10-minute allowance runs out. The interface shows the allowance left, and that needs one more selector. It is added to `src/engine/selectors.ts`, exported from `index.ts`, and recorded in the session-engine Decisions (item 10).

```ts
import { PAUSE_LIMIT_MS } from "./constants";
import { pauseLimitAt } from "./time";

/** Pause allowance left in ms, in [0, PAUSE_LIMIT_MS]. Zero outside `paused` and for a non-finite `now`. Does not settle. */
export function pauseLeftMs(state: State, now: number): number {
  if (state.phase !== "paused" || !Number.isFinite(now)) return 0;
  const left = pauseLimitAt(state) - Math.max(Math.floor(now), state.pausedAt);
  return Math.min(Math.max(left, 0), PAUSE_LIMIT_MS - state.session.pausedTotalMs);
}
```

- It uses `pauseLimitAt`, the instant `settle` already uses (`pausedAt + (PAUSE_LIMIT_MS - pausedTotalMs)`), so the selector and the engine cannot disagree.
- `max(floor(now), pausedAt)` means a clock that moved backwards cannot make the allowance grow past `PAUSE_LIMIT_MS - pausedTotalMs` (session-engine R4.5).
- At the limit instant the value is 0 and the state is still `paused` (the engine snuffs when `now` is strictly after it). One millisecond later `settle` snuffs it. The interface shows `00:00` for that millisecond at most, then the ended state.
- No new event, phase or field; `step`, `settle` and the serialized formats are unchanged.
- Tests (P9 and examples), in `selectors.test.ts` and `selectors.prop.test.ts`, written by this spec's tasks: examples at the start of a pause, halfway, at the limit, one millisecond past, with an earlier closed pause, in every other phase, and for `NaN` and infinite `now`; the property of the requirements table (range; zero outside `paused`; never increases as `now` grows; the exact formula; positive implies still `paused` after a `tick`; snuffed by a `tick` implies zero; no mutation of the input). The mutation check of section 13.4 tries `>` for `>=`, a missing clamp, and `pausedAt` replaced by `litSince`.

## 3. The pure modules

All text comes from `strings.ts` (section 8.9). Signatures only; the bodies are small.

### 3.1 `format.ts`

```ts
/** mm:ss, minutes at least two digits, rounded UP to whole seconds. Non-finite or <= 0 gives "00:00". */
export function formatTime(ms: number): string;

/** The same time in words: "12 minutes 31 seconds", "1 minute", "45 seconds", "0 seconds". Same rounding. */
export function spokenTime(ms: number): string;

/** Replaces {name} placeholders. Unknown names are left as they are. Used for every template in strings.ts. */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string;
```

- `seconds = ms > 0 ? Math.ceil(ms / 1000) : 0` (and `0` for a non-finite `ms`); `mm = floor(seconds / 60)` padded to at least 2, `ss = seconds % 60` padded to 2.
- Rounding up means the text reads `25:00` for a whole 25-minute candle (time left equals the length), shows `00:00` only at exactly zero, and never shows a time that is already past. It also matches how the candle will look at the same instant: when the text says `00:01` the candle still has a second.
- `spokenTime` uses the unit templates of `strings.ts` (`minute`, `minutes`, `second`, `seconds`), skips a zero unit, and says "0 seconds" for zero. The digits it names equal `formatTime`'s (P1).
- `formatTime` is exported for `sound-and-title` (the page title), unchanged.

### 3.2 `length.ts`

```ts
export type LengthChoice =
  | { readonly kind: "preset"; readonly minutes: 15 | 25 | 50 }
  | { readonly kind: "custom"; readonly text: string };

export type LengthResult = { readonly ok: true; readonly minutes: number } | { readonly ok: false; readonly reason: "empty" | "format" | "range" };

export function parseLength(text: string): LengthResult;                 // R2.4, P2
export function lengthOf(choice: LengthChoice): LengthResult;            // preset -> ok; custom -> parseLength
export function nextChoice(index: 0 | 1 | 2 | 3, key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"): 0 | 1 | 2 | 3;
```

- `parseLength`: `trim()` spaces (ASCII space, tab; text that is empty or only spaces and tabs is `empty`, any other white space is `format`), then `^[0-9]{1,3}$`, then `5 <= value <= 90`. The constants are `MIN_LENGTH_MIN` and `MAX_LENGTH_MIN` from the engine. `reason` is `empty` for empty text, `format` for anything that is not one to three ASCII digits, `range` for digits outside 5..90. No `Number(text)` shortcut (it would accept `+25`, `2e1`, `0x19`, `25.`).
- The chooser has four stops: 15, 25, 50, custom (indices 0 to 3). `nextChoice` implements the arrow keys of a radio group: Left and Up go to the previous stop and Right and Down to the next, wrapping around. In the custom text field only Up and Down leave it; Left and Right move the caret (section 8.2). The index mapping is checked by an example test, and the wrap-around by a small property (P2b: for any index and key the result is in range, and four presses of the same key return to the start).

### 3.3 `light.ts`

```ts
export type LightRequest =
  | { readonly ok: true; readonly event: LightEvent }
  | { readonly ok: false; readonly reason: "empty" | "format" | "range" };

export function lightRequest(choice: LengthChoice, intentText: string): LightRequest;
```

- Valid length: `{ type: "light", length, intent: intentText }`. The intent is passed **unchanged** (R3.3); the engine normalizes it. When the text is `""` the `intent` key is omitted.
- Invalid length: a refusal with the reason, and no event exists to send.

### 3.4 `keys.ts` — the key map

```ts
export interface KeyDescriptor { readonly key: string; readonly ctrl: boolean; readonly alt: boolean; readonly meta: boolean; readonly shift: boolean; readonly repeat: boolean }
export type FocusKind =
  | "body"        // the document, or a non-interactive element
  | "text"        // a text field (intent, custom length)
  | "button"      // any button, switch, radio or link (the Pause and Resume button included): Space and Enter activate it natively
  | "other";      // anything else focusable
export interface KeyContext { readonly phase: State["phase"]; readonly overlay: "none" | "snuff" | "settings"; readonly focus: FocusKind }
export type KeyAction =
  | { readonly type: "light" } | { readonly type: "toggle-pause" } | { readonly type: "open-snuff" }
  | { readonly type: "keep-burning" } | { readonly type: "close-settings" } | { readonly type: "announce-time" };
export function keyAction(context: KeyContext, key: KeyDescriptor): KeyAction | null;
```

The map, row by row (any row not listed gives `null`, and the DOM layer then leaves the browser's default alone):

| Key (no Ctrl, Alt or Meta; not a repeat) | Context | Action |
|---|---|---|
| Enter | overlay none; phase `idle`, `burned-out` or `snuffed`; focus `body`, `text` or `other` | `light` |
| Enter | focus `button` | `null` (the browser activates the button) |
| Space | overlay none; phase `lit` or `paused`; focus `body` or `other` | `toggle-pause` |
| Space | focus `text` or `button` | `null` (a space is typed, or the button is pressed; on the Pause or Resume button the browser's own activation toggles, once, on key up) |
| Escape | overlay `snuff` | `keep-burning` |
| Escape | overlay `settings` | `close-settings` |
| Escape | overlay none; phase `lit` or `paused` | `open-snuff` |
| `t` or `T` | overlay none; phase `lit` or `paused`; focus not `text` | `announce-time` |
| anything with Ctrl, Alt or Meta | any | `null` |
| any key with `repeat` (Space, Enter, `t`, Escape, every key) | any | `null` (a held key never acts twice) |

- With an overlay open nothing else applies: no light, pause or announce. Tab and Shift+Tab are not handled here; the native dialog keeps the focus inside.
- Shift changes nothing (Shift+Space still pauses). Every repeat returns `null`, Escape included: a held Escape would otherwise open the snuff dialog and, on its next repeat, close it again (batch 1 decision 1, section 17).
- No key ever gives a `snuff` action. The only path to the engine's `snuff` is `confirm-snuff`, which comes from activating the confirm button (section 3.5).
- `FocusKind` is computed by `dom/events.ts` from `document.activeElement`: `text` for `input[type=text]` and `textarea`; `button` for `button`, `a[href]`, `[role=radio]`, `[role=switch]` and `select`; `body` for `body` or the scene; `other` otherwise. A key that gives an action is `preventDefault`ed, so the browser does not also act on it; in particular Enter in the intent or custom field gives `light` and the form's native submit does not fire as well (the `submit` event is then only the click or tap on the Light button).

### 3.5 `ui-state.ts` — the UI state machine

```ts
export type FocusTarget = "pause-resume" | "light" | "custom-length" | "keep-burning" | "settings-first" | "settings-button" | "restore" | "none";
export interface UiState {
  readonly length: LengthChoice;          // chosen length (initially the default length from settings)
  readonly intentText: string;            // raw text of the intent field
  readonly overlay: "none" | "snuff" | "settings";
  readonly refusal: "format" | "range" | "empty" | null;   // shown in the status line until the text becomes valid
  readonly customTouched: boolean;        // the custom field has been typed in or Light was pressed: errors may show
  readonly returnFocus: FocusTarget | "element";           // where focus goes when the overlay closes
  readonly pendingFocus: FocusTarget | null;               // a focus move held back while an overlay is open
}
export type UiInput =
  | { readonly type: "action"; readonly action: UiAction }
  | { readonly type: "engine"; readonly from: State["phase"]; readonly to: State["phase"]; readonly typing: boolean };
export type UiAction =                       // KeyAction plus what only a pointer, a form or a field can do
  | { type: "light" } | { type: "toggle-pause" } | { type: "open-snuff" } | { type: "confirm-snuff" } | { type: "keep-burning" }
  | { type: "open-settings" } | { type: "close-settings" } | { type: "announce-time" }
  | { type: "select-preset"; minutes: 15 | 25 | 50 } | { type: "set-custom"; text: string } | { type: "set-intent"; text: string };
export interface Effects {
  readonly events: readonly Event[];       // engine events to dispatch, in order (0 or 1 today)
  readonly announce: AnnounceRequest | null; // "refusal" | "time"
  readonly focus: FocusTarget;             // "none" when focus stays
  readonly clearIntent: boolean;
}
export function uiStep(ui: UiState, input: UiInput, phase: State["phase"]): { ui: UiState; effects: Effects };
```

Transitions (the phase is the engine's, at the moment of the action; an action that is not valid for it gives the same `ui` and empty effects):

| Input | Valid when | New UI state | Events | Other effects |
|---|---|---|---|---|
| `light` | overlay none; phase `idle`, `burned-out`, `snuffed` | `refusal` cleared; `intentText` cleared (on success) | `light` (length, intent) on success; none on refusal | success: focus `pause-resume`, `clearIntent`. Refusal: `refusal` set, `customTouched` true, announce `refusal`, focus `custom-length` |
| `toggle-pause` | overlay none; `lit` or `paused` | unchanged | `pause` if `lit`, `resume` if `paused` | focus `pause-resume` |
| `open-snuff` | overlay none; `lit` or `paused` | overlay `snuff`, `returnFocus` `element` | none | focus `keep-burning` |
| `keep-burning` | overlay `snuff` | overlay none | none | focus `restore` |
| `confirm-snuff` | overlay `snuff` | overlay none; `pendingFocus` `light` | `snuff` if phase is `lit` or `paused`; none if the session already ended | no immediate focus: the move to Light is held in `pendingFocus` and released as `focus: light` by the next `engine` input (the phase change), batch 1 decision 4 |
| `open-settings` | overlay none | overlay `settings`, `returnFocus` `element` | none | focus `settings-first` |
| `close-settings` | overlay `settings` | overlay none | none | focus `settings-button`, or the held `pendingFocus` |
| `announce-time` | overlay none; `lit` or `paused` | unchanged | none | announce `time` |
| `select-preset` | overlay none or `settings`; any phase | `length` preset; `refusal` cleared | none | none |
| `set-custom` | any | `length` custom with the text; `customTouched` true; `refusal` cleared if the text is now valid | none | none |
| `set-intent` | any | `intentText` | none | none |
| `engine` from running to ended (burn-out, pause limit, a confirmed snuff) | any | overlay `snuff` closes (`none`); an open settings panel stays; `pendingFocus` is released | none | focus `light`, except: while `typing` (a text field has focus) focus stays in the field and the move is dropped (`pendingFocus` null); while the settings panel is open the move is held (`pendingFocus` `light`) until `close-settings` releases it (batch 1 decision 3) |
| `engine`, any other change of phase (for example a reload into a running session) | any | unchanged | none | none |

Invariants (they are the properties P5 and P8):
- `overlay === "snuff"` only while the phase is `lit` or `paused`; any `engine` input that leaves those phases closes it in the same step.
- An engine `snuff` event appears only in the effects of a `confirm-snuff` input applied to a state with `overlay === "snuff"`. No other input produces it.
- No `UiInput` changes anything about time: `uiStep` returns events only from the table, and no event is `tick`, `hide`, `show` or `reload`.
- The step is total: for every `UiState`, input and phase it returns a value, and equal inputs give equal outputs (pure, no mutation).

The state is built by `initialUi(settings: Settings)`; the parameter is the `Settings` type of `src/storage/settings.ts` (a type-only import; task 20 switched it from `{ defaultLength }`). `UiState` starts as `{ length: preset(default length) or custom if the default is not a preset, intentText: "", overlay: "none", refusal: null, customTouched: false, returnFocus: "none", pendingFocus: null }`. A default length of 25 selects the 25 preset; a custom default like 40 selects the custom stop with the text `40`.

### 3.6 `view.ts` — the view model

```ts
export function viewOf(state: State, ui: UiState, settings: Settings, now: number, placement: Placement): ViewModel;
```

`ViewModel` is plain data and holds the strings, so `dom/apply.ts` only copies it. The fields:

| Field | Source |
|---|---|
| `phase` | `state.phase` |
| `timeText`, `timeWords` | by phase, table 7.1: `formatTime(timeLeftMs(state, now))` in `lit` and `paused`; the chosen length in `idle` (`--:--` when the custom text is invalid); `00:00` in the ended phases |
| `status` | `{ kind, text }` by the table in 7.2 |
| `setupVisible`, `runningVisible` | `idle`/`burned-out`/`snuffed` and `lit`/`paused` |
| `light` | `{ label: "light" or "lightAnother" }` |
| `pause` | `{ label: "pause" }` in `lit`, `{ label: "resume" }` in `paused` |
| `chooser` | selected stop, custom text, `customInvalid` (only when `customTouched`), the four cell labels |
| `intent` | the text, `codePoints = Array.from(text).length`, `overLimit = codePoints > INTENT_MAX_CODE_POINTS`, the counter text |
| `overlay` | `ui.overlay` |
| `settings` | the three values and their display texts |
| `placement` | the rectangles of section 6 |

`viewOf` is a pure function of its arguments; `timeText` for the same `(state, now)` is equal on every call. The apply step keeps the last value of each field and writes the DOM only when a value changed (R7.4).

### 3.7 `announcer.ts`

Specified in section 9. Signatures:

```ts
export interface AnnouncerMemory { readonly started: boolean; readonly phase: State["phase"] | null; readonly sessionKey: number | null; readonly done: number /* bitmask of milestones announced in this session */ }
export const INITIAL_ANNOUNCER: AnnouncerMemory;
export type Announcement = { readonly key: AnnouncementKey; readonly timeLeftMs?: number };
export function nextAnnouncement(mem: AnnouncerMemory, state: State, now: number): { mem: AnnouncerMemory; announcement: Announcement | null };
export function timeAnnouncement(state: State, now: number): Announcement | null;   // the T key
export function textOf(a: Announcement): string;                                    // strings.ts + spokenTime
```

### 3.8 `layout.ts`

Specified in section 6. `stageBox(vw, vh)`, `placeControls(vw, vh): Placement`, and the keep-clear constants.

### 3.9 `settings.ts` (in `src/storage/`)

Specified in section 11.

## 4. The thin DOM layer

### 4.1 Rules

- Elements are created with `document.createElement` and `textContent`, once, by `dom/build.ts`. There is no `innerHTML`, `insertAdjacentHTML`, `document.write`, no `setAttribute("style", ...)` and no inline `style` attribute in any markup. Positions and sizes are written with `element.style.setProperty("--x", ...)`, which the CSS object model allows even under a strict Content-Security-Policy (the `hosting` spec plans `style-src 'self'` with no `unsafe-inline`). A unit test scans `src/ui/` for the banned calls.
- User text (the intent) only ever reaches the page through `textContent` or an input's `value`.
- `dom/apply.ts` keeps the last applied `ViewModel` and writes each field only if it changed. It never reads a clock.
- `dom/events.ts` is the only place that listens to DOM events. It builds a `KeyDescriptor` and a `FocusKind`, calls `keyAction`, and, if there is an action, `preventDefault`s the event and calls `handle(action)`. Pointer and form events call `handle` directly with the matching `PointerAction`. `handle` reads `Date.now()` for the moment of the action, runs `uiStep`, sends the events through `dispatch(event, now)`, and passes the effects on.
- A form `submit` (the click or tap on the Light button; Enter in a field is caught earlier, by the key map) is cancelled with `preventDefault` and becomes a `light` action, so every route to Light ends in the same handler.
- All listeners are added once at build time. There are no per-frame listeners.

### 4.2 The elements

All inside a container `#ui` (`position: fixed; inset: 0`, above the scene, `pointer-events: none`, with the interactive children set back to `pointer-events: auto`). DOM order is the Tab order (section 12.2). Positions come from `Placement` (section 6) through `--x --y --w --h` on each element.

```
#ui
├─ form#setup[aria-label=…]                           hidden while lit/paused
│    ├─ div#length[role=radiogroup][aria-labelledby]  four stops
│    │     ├─ button[role=radio][data-minutes=15]  …25  …50
│    │     └─ input#custom[type=text][inputmode=numeric][aria-label][aria-describedby=status]
│    ├─ div (label + counter) · input#intent[type=text][aria-label][autocomplete=off]
│    └─ button#light[type=submit]
├─ section#watch[aria-label=…]                        always (the floor-band zone UI)
│    ├─ div#time[role=timer]                           the time text
│    ├─ p#status                                       the status line (also the aria-describedby of #custom)
│    ├─ button#pause                                   hidden while idle/ended
│    ├─ button#snuff                                   hidden while idle/ended
│    └─ button#settings-button[aria-haspopup=dialog]   always; the rightmost zone control
├─ div#live[role=status]                               visually hidden
├─ dialog#snuff-dialog[aria-labelledby][aria-describedby]
│    ├─ h2 · p · button#keep[autofocus] · button#confirm
└─ dialog#settings-dialog[aria-labelledby]
     ├─ h2 · button[role=switch]#sound · button[role=switch]#ghosts
     ├─ the default-length chooser (the same builder as #length) · button#close
```

- `hidden` is used (not `display: none` from CSS alone), with a stylesheet rule `[hidden] { display: none !important }` so a `display` set by a class never overrides it. A hidden element is out of the Tab order and the accessibility tree.
- The two dialogs are native `<dialog>` elements opened with `showModal()`. That gives the modal behaviour for free: the rest of the page is inert, Tab cycles inside, and the dialog is announced with its role and name. `::backdrop` is transparent (R8.7: no dimming). `cancel` (Esc) is cancelled with `preventDefault` and turned into `keep-burning` or `close-settings`, so Esc goes through the one state machine. The dialog's `close` event is not used.
- The scene's `#scene` keeps `role="img"` and its label; `#ui` is a sibling, not a child.
- The existing visually hidden `h1` and tagline stay (candle-scene 10.1).

### 4.3 Applying a view

`apply(view)` per frame (cheap: it only compares) does, in this order: placement (when it changed); visibility (`hidden` flags); texts (`textContent` only if different); chooser state (`aria-checked`, `tabindex`, the custom field's `value` only if it differs and the field is not focused, `aria-invalid`); the intent counter; the overlay (`showModal()` or `close()` only when `view.overlay` changed); then focus effects (section 10), so a button that just became visible can take focus in the same frame.

### 4.4 The live-region writer (`dom/live.ts`)

```ts
say(text: string): void   // remembers the latest text as pending
frame(): void              // called once per frame after apply
```

`frame`: if a text is pending: when the region already holds exactly that text, clear it this frame (the next frame sets it, so a screen reader announces the repeat, for T pressed twice); otherwise set it and drop the pending text. A message is therefore written one frame after it is requested at the latest. If two are requested in one frame the last one wins (the announcer returns at most one per call, so this happens only if the user presses T twice within one frame).

## 5. `main.ts` wiring

`main.ts` stays the one place that owns the clock and the loop (candle-scene R1.3, R13.1). The order matters, and is the order below.

```ts
const kv = browserStore();
const storage = createStorage(kv);                       // session and history (unchanged)
const settingsStore = createSettingsStore(kv);           // new
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

const app = document.getElementById("app");
if (app) {
  // 1. the placeholder h1 and tagline (as now), the scene root, the interface root
  const sceneRoot = div("scene"); const uiRoot = div("ui");
  app.append(sceneRoot, uiRoot, heading, tagline);
  const scene = createScene(sceneRoot);

  // 2. state: restore, then settle by the reload step (as now)
  let state: State = step(INITIAL_STATE, { type: "reload", state: storage.load() }, Date.now());

  // 3. the one dispatch (as now)
  const dispatch = (event: Event, now: number): void => {
    const next = step(state, event, now);
    if (next !== state) { storage.save(state, next); state = next; }
  };

  // 4. visibility: sync once after the reload step, then watch (distraction-tracking R11)
  const target = browserVisibilityTarget();
  if (target !== null) {
    const wiring = { target, clock: Date.now, send: (type, now) => dispatch({ type }, now) };
    syncVisibility(wiring);
    watchVisibility(wiring);
  }

  // 5. settings and the interface
  let settings = settingsStore.load();
  const ui = createInterface({
    root: uiRoot, sceneRoot, dispatch, now: Date.now, getState: () => state,
    settings, onSettings: (next) => { settings = next; settingsStore.save(next); },
  });

  // 6. the loop (as now, plus ui.update)
  const frame = (): void => {
    const now = Date.now();
    dispatch({ type: "tick" }, now);
    scene.apply(sceneModel(state, now, { reducedMotion: reduced.matches }));
    ui.update(state, now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
```

- **Engine.** `dispatch` is unchanged: it is the one place that calls `step` and `save`. The interface receives it, never `step`.
- **Storage.** The session and history adapter is untouched. The settings adapter shares the same `KeyValueStore` (`browserStore()`), so a blocked `localStorage` blocks both without special handling (R11.6).
- **Scene.** Unchanged: `scene.apply` is called each frame as now. The interface reads the scene's size from `sceneRoot` (its bounding box equals the viewport) and re-places its controls on resize (section 6.3).
- **Visibility.** `syncVisibility` runs right after the reload step and before the first frame, so a persisted open hide is closed (`show`) or kept (`hide` ignored) before anything is drawn; then `watchVisibility` listens for the rest of the page's life. Both send through `dispatch`, so `hide` and `show` reach the engine like every other event and are saved. They produce no UI input (R12.4); the interface only notices a change in `state`.
- **Controls.** `createInterface` builds the elements, registers the DOM listeners and returns `update`. Listeners call `dispatch(event, Date.now())` through the effects of `uiStep`. `update(state, now)`: (1) compares the phase with the last one and, if it changed, feeds a `UiInput` of type `engine` to `uiStep`; (2) runs the announcer; (3) computes `viewOf` and applies it; (4) runs the focus effect and the live-region `frame`.
- **Clock.** `Date.now()` is read in three places only: the loop in `main.ts`, the visibility `clock`, and the moment of a user action in `dom/events.ts`. With `page.clock` the three agree.
- **Resize.** A `ResizeObserver` on `sceneRoot` stores the size; the next `update` recomputes `Placement`. If `ResizeObserver` is missing, a `resize` listener is used. First paint: `createInterface` measures once before the first `update`, so the first frame already has its layout.
- **Reduced motion.** The interface needs no JavaScript for it: the stylesheet switches transitions and animations off under the media query (R13.1). The scene still reads `reduced.matches` each frame as before.
- **Errors.** If `uiRoot` cannot be built (no `document`), the app keeps drawing the scene, as today.

## 6. Layout and the no-cover rule

This section is the check the review asked for: where the persistent controls and text go, tested against the scene's own geometry in `candle-scene` design 5. The numbers below come from that design and from `src/scene/constants.ts` and `room.ts`, and the check was run (6.8).

### 6.1 The stage box

The scene is one SVG, `viewBox="0 0 600 1000"`, `preserveAspectRatio="xMidYMid meet"`, in a container that is `position: fixed; inset: 0` (candle-scene 5.1). For a viewport `vw` by `vh` (CSS pixels):

```
s  = min(vw / 600, vh / 1000)            scale, CSS px per room unit
ox = (vw - 600 s) / 2                     left edge of the stage
oy = (vh - 1000 s) / 2                    top edge of the stage
X(u) = ox + u s        Y(u) = oy + u s    room unit -> CSS px
floorY = Y(900)                           the floor line: candle base, clip line, top of the zone
```

`layout.ts` exports `stageBox(vw, vh)` with exactly this rule, so the controls and the SVG agree. A test compares it with the rendered `.zone-text-area` rectangle in the browser (E3).

### 6.2 What must stay clear (from candle-scene design 5)

| Thing | Room units | Source |
|---|---|---|
| The candle | x 268..332; from the rim (y = 900 − 420·wax) down to the floor line, 900 | 5.4 |
| The flame | x about 270..330; tip at y 340 for a whole candle, moving down with the rim | 5.4, 5.6 |
| The halo | circle, centre (300, 410), radius 120, moved down by (1 − wax) · 420; clipped at y 900; so x 180..420 and, over every wax height, y 290..900 | `room.ts` `.halo`, 5.2 (clipped by `.lit`) |
| The idle pool | a disc of radius `LIGHT_MIN · 700` = 140 around (300, 400): x 160..440, y 260..540. In idle there is no flame and no halo (opacity 0). | 5.3, 3.2 |
| The window pane | x 240..360, y 50..260 (its blur adds a soft edge of about 5 units, not counted) | 5.2 layer 4, `WINDOW` |
| The floor line and the zone | y 900; the zone is y 900 to 1600 and the whole width; the flame, halo, drips, smoke and pool never enter it | 5.2 layer 7, 5.4, R7.8 |
| The reserved edge bands | x 0..110 and 490..600 for every y, and everything sideways beyond | 5.4 |

The **keep-clear column** is the union of the candle, the flame, the halo and the idle pool over every wax height: **x 160..440, y 260..900** (the halo's 180..420 and the idle pool's 160..440 are both inside it). The **keep-clear window** is **x 240..360, y 50..260**. These are the two rectangles of R8.3. In `layout.ts` they are constants, and a unit test reads `src/scene/constants.ts` (`WINDOW`, `CANDLE_H`, `FLOOR_Y`, `LIGHT_MIN`, `LIGHT_FULL_UNITS`) and the halo circle in `room.ts`' markup and fails if the scene moves them.

The running light pool (radius up to 700 units) is **not** in the keep-clear column on purpose: it fills the whole stage at the start, so no control above the floor line could avoid it. That is why every persistent control that is shown while a session runs is below the floor line, which the pool never enters (6.4).

### 6.3 The placement function

```ts
export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface Placement {
  readonly mode: "compact" | "wide";
  readonly variant: "top-row" | "left-region" | "column";   // where the setup controls go (below)
  readonly stage: { readonly scale: number; readonly ox: number; readonly oy: number };
  readonly floorY: number;
  readonly zone: Rect;                 // floor line to the bottom of the viewport, full width
  readonly textArea: Rect;             // X(110)..X(490), floorY .. Y(1000): the .zone-text-area marker
  readonly timeSize: number;           // px
  readonly time: Rect;                 // the time text box, centred at X(300)
  readonly statusRunning: Rect;        // the status line while Pause and Let it go dark are shown
  readonly statusResting: Rect;        // in idle and the ended phases (wider; two lines when there is room)
  readonly setup: { readonly chooser: Rect; readonly cells: readonly [Rect, Rect, Rect, Rect]; readonly intent: Rect; readonly light: Rect };
  readonly zoneControls: { readonly pause: Rect; readonly snuff: Rect; readonly settings: Rect; readonly labelled: boolean };
  readonly snuffDialog: Rect;
  readonly settingsPanel: Rect;
  readonly keepClear: { readonly column: Rect; readonly window: Rect };
}
export function placeControls(vw: number, vh: number): Placement;
```

Constants: touch target `T = 44`, gap `G = 8`, margin `M = 8`, pads `PAD_COLUMN = 6`, `PAD_WINDOW = 1`.

**Mode.** `wide` when `ox >= 360` (at least 360 px free on each side of the stage), else `compact`.

**The zone, both modes.** The zone is `y = floorY` down to `vh`, `zoneH = vh − floorY`. Zone buttons are vertically centred: `by = floorY + (zoneH − T) / 2`. The time text is centred at `cx = X(300)` (the candle's axis), its box starts at `floorY + 2` and is `timeSize` high and about `3.1 · timeSize` wide; the status line is directly under it, 20 px high. `timeSize` is 36 in the compact mode and `clamp(zoneH − 28, 32, 44)` in the wide mode. Left to right the zone controls are always: **Pause or Resume, the time text and status line, Let it go dark, Settings**. In `idle` and the ended phases Pause and Let it go dark are hidden and Settings stays where it is, so it never moves.

**Compact zone.** Pause at `(M, by)`, Settings at `(vw − M − T, by)`, Let it go dark at `(settings.x − G − T, by)`, all `T × T` (icons with text names). The status line is centred on `cx` and bounded by the buttons: while running, its half-width is `min(cx − (pause.x + T + G), (snuff.x − G) − cx)`; at rest it is `min(cx − M, (settings.x − G) − cx)`, and it may take two lines (40 px) when `zoneH >= 80`.

**Wide zone.** Pause `128 × T`, its right edge 16 px before the text area; Let it go dark `160 × T`, 16 px after it; Settings `96 × T`, `G` after Let it go dark. All labelled. The status line is the width of the text area while running; at rest it is centred on `cx` and bounded by `M` and `settings.x − G`.

**Setup controls** (idle and the ended phases; always above the floor line; reading order chooser, intent, Light):
- **Compact, `top-row`** (the window pane starts at `window.y >= 50`, which holds at 360 × 640): the chooser is a row of four cells across the viewport, `(M, 4)`, width `vw − 2M`, `T` high, each cell `(vw − 2M − 3G) / 4` wide. Under it, at `y = 56`: the intent field at `x = M`, width `window.x − G − M`, `T` high; and Light, `116 × 52`, at `x = vw − M − 116`.
- **Compact, `left-region`** (the window pane starts higher, a stage limited by height in a narrow viewport): the chooser is a 2 × 2 grid of `54 × 44` cells (`116 × 96`) at `(M, 4)`. Under it, at `y = 108`: the intent field at `x = M`, width `window.x − G − M` (at least 120), and Light at `x = vw − M − 116`. Reading order stays chooser, intent, Light.
- **Wide, `column`**: width `cw = min(360, ox − 48)` and `x0 = vw − 24 − cw`, in the free side area to the right of the stage: the chooser (four cells of `(cw − 3G) / 4`) at `y = 96`, the intent field at `y = 152`, Light (`52` high) at `y = 212`.

**Overlays.** The snuff dialog and the settings panel (6.6) are placed here too.

**Resizing.** `update` recomputes `placeControls(width, height)` only when the size changed; `dom/apply.ts` writes `--x --y --w --h` for each element, and `--time-size`.

### 6.4 The pool: no exception

Review change 1 (D14): nothing persistent is ever in the light pool.

- **While a session runs** (`lit`, `paused`) the persistent interface is only the zone controls, the time text and the status line. They are below the floor line, which the pool never enters (candle-scene R7.8): the pool is masked at the floor line, and the zone is the topmost layer with its own backgrounds. At the start of a session the pool has a radius of 700 room units and fills the whole stage; the zone is still clear of it. So at every size and wax height the rule holds with no special case, and there is nothing to measure.
- **In `idle`** the pool is the small idle disc (radius `LIGHT_MIN · 700` = 140 units around (300, 400)), which lies inside the keep-clear column x 160..440, y 260..540. The setup controls stay at least 6 px from the column.
- **In `burned-out` and `snuffed`** the pool has radius 0 (candle-scene R7.5); the dawn is a wash, not a pool.
- **Overlays** are the exemption the review allowed (Decision Q2).

The earlier design put the Settings button in the top-right corner. At 360 × 640 it was inside the pool while the wax was above about 0.7 (and above 0.82 at 390 × 844); that analysis is dropped with the corner button.

### 6.5 The two stated layouts

**360 × 640** (compact, `top-row`). `s = 0.6`, `ox = 0`, `oy = 20`: the stage is 360 × 600 from `y = 20`. `X(u) = 0.6 u`, `Y(u) = 20 + 0.6 u`. `floorY = 560`; the zone is `y 560 .. 640` (80 px); `cx = 180`. The text area is `x 66..294`, `y 560..620`.

| Thing | Rectangle (x, y, w, h) | Checked against |
|---|---|---|
| Keep-clear column | 96, 176, 168, 384 | — |
| Window pane | 144, 50, 72, 126 | — |
| Length chooser, four cells of 80 × 44 with 8 px gaps | 8, 4, 344, 44 | 2 px above the window top (50); above the intent row |
| Intent field | 8, 56, 128, 44 | 8 px left of the window; 76 px above the column top (176) |
| Light | 236, 56, 116, 52 | 20 px right of the window (216); 8 px below the chooser row |
| Time text (box about 112 wide, 36 high) | 124, 562, 112, 36 | inside the text area (66..294) |
| Status line while running | 112, 598, 136, 20 | between Pause (ends 52) and Let it go dark (starts 256) |
| Status line at rest (idle, ended) | 60, 598, 240, 40 | clear of Settings (starts 308) |
| Pause or Resume (icon) | 8, 578, 44, 44 | zone, left |
| Let it go dark (icon) | 256, 578, 44, 44 | zone; 8 px before Settings |
| Settings (icon) | 308, 578, 44, 44 | zone, right; 8 px from the right edge |
| Left door slot | x 0..66, y ≥ 200 | the chooser, intent and Light all end at y 108: clear |
| Snuff dialog | 8, 8, 344, ≤ 178 | stops 8 px above the halo's highest point, y = 194 |

While running, the upper room has nothing persistent. While idle or ended it has the chooser row, the intent field and Light, and nothing in the column or the window. The status line carries the refusal message for an invalid custom length (Decision Q1). The icon buttons have text names; the zone is 80 px tall, so 44 px targets sit 18 px from the floor line and the bottom edge.

**1280 × 800** (wide, `column`). `s = 0.8`, `ox = 400`, `oy = 0`: the stage is 480 × 800 from `x = 400`. `floorY = 720`; the zone is `y 720 .. 800` (80 px) across all 1280 px; `cx = 640`. The text area is `x 488..792`, `y 720..800`.

| Thing | Rectangle | Checked against |
|---|---|---|
| Keep-clear column | 528, 208, 224, 512 | — |
| Window pane | 592, 40, 96, 168 | — |
| Chooser (four cells of 82 × 44) | 904, 96, 352, 44 | 24 px right of the stage's right edge (880); 150 px from the column |
| Intent field | 904, 152, 352, 44 | same |
| Light | 904, 212, 352, 52 | same |
| Time text (box about 136 wide, 44 high) | 572, 722, 136, 44 | inside the text area |
| Status line while running | 488, 766, 304, 20 | the width of the text area |
| Status line at rest | 312, 766, 656, 20 | 8 px short of Settings (starts 976) |
| Pause or Resume (labelled) | 344, 738, 128, 44 | ends 16 px before the text area |
| Let it go dark (labelled) | 808, 738, 160, 44 | starts 16 px after the text area |
| Settings (labelled) | 976, 738, 96, 44 | 8 px after Let it go dark |
| Left door slot | x 400..488, y ≥ 240 | nothing of this spec there |
| Snuff dialog | 904, 96, 352, ≤ 260 | right column, clear of the stage |
| Settings panel | 24, 96, 352, ≤ 360 | left side area, clear of the stage |

Other sizes follow from the same rules: 375 × 667 compact `top-row` (the chooser row 359 wide, intent 134, zone 83.5 px); 768 × 1024 compact `top-row` (`s = 1.024`, the window top is 51.2; the chooser row 752 wide, intent 307, zone 102 px); 480 × 800 compact `left-region` (the window top is 40, so the chooser is a 2 × 2 grid at 8, 4, the intent field is 8, 108, 176 wide, Light at 356, 108); 1920 × 1080 wide (`ox = 636`, column 360 wide, Settings at x 1349).
### 6.6 Overlays

Overlays are exempt from the keep-clear rule while open (Decision Q2) but are placed to avoid the flame and halo wherever there is room. Wide: in the free side columns (the stage is not touched at all). Compact: the snuff dialog is anchored to the top and no taller than the space above the halo's highest point (178 px at 360 × 640), so it covers the window and the upper pool but never the flame or the halo, at any wax height. The settings panel is taller (a heading, two switches, the length chooser and a Close button: about 280 px at 360 × 640) and may cover the upper candle; it is a deliberate, brief visit. The room behind is not dimmed or blurred, and the candle keeps burning and redrawing behind and under the dialogs.

### 6.7 Limits

- Viewports shorter than 640 px (a phone on its side, a very small window) are best effort. At 640 × 360 the stage is 216 × 360, the zone is 36 px tall and the window top is at 18 px, so the 44 px targets do not fit and the rules of R8.3 are not guaranteed. The layout does not lose controls (they overlap rather than disappear); the property P10 does not cover those sizes.
- On phones with a notch or a home bar, `env(safe-area-inset-*)` is not used: the viewport meta has no `viewport-fit=cover`, so the browser keeps the page inside the safe area.
- Browser zoom and text size: text is in CSS pixels, and the layout follows the viewport in CSS pixels, so 200 % zoom on a 1280 × 800 window is the layout of a 640 × 400 viewport (best effort, above).

### 6.8 The check, and the property that keeps it true

The placement rules above were run as a throwaway script over **882,601 viewports** (every width 360 to 2560 and every second height 640 to 1440), with the review's two changes in. For every viewport: every rectangle is inside the viewport; every control is at least 44 px in both directions; every pair that is on screen together keeps at least 4 px; every setup control keeps 6 px from the keep-clear column and 1 px from the window pane and is above the floor line; the chooser is above the intent field and the intent field comes before Light in reading order; every zone control, the time text and the status line are wholly inside the zone, in the order Pause, Let it go dark, Settings from left to right; the time text is inside the text area; the status line never touches a button; and the status line never leaves the viewport. **There were no violations.** Measured minima over the whole range: the status line while running is 136 px wide (at 360 × 640 and every phone width), at rest 240 px; the compact intent field is 128 px (at 360 × 640; 176 px in the `left-region` variant at 480 × 800).

The first run found two things that were then fixed in the rules: the wide time text was 44 px even where the zone is only 64 px tall (1104 × 640), so `timeSize` is now `clamp(zoneH − 28, 32, 44)` there; and the wide status line at rest was only the text area wide, too narrow for the first-visit line, so it is now bounded by `M` and Settings. The script is not kept. **P10** (`layout.prop.test.ts`) is that check as a permanent property, plus the exact rectangles of 6.5, the Tab-order check, and the comparison of the constants with `src/scene/constants.ts`. E3 and E14 repeat it in a real browser against the rectangles of `.candle`, `.flame-shape`, `.halo` and `.zone-text-area` read from the page.

What the check shows about the requirements:
- Because the pool never enters the zone (6.4), putting the Settings opener in the zone removes the only exception the first design had, at no cost to the other controls.
- The top row for the chooser needs the window pane to start at least 50 px below the viewport top (`oy + 50 s >= 50`). That holds at 360 × 640, 375 × 667, 768 × 1024 and every taller phone. On a stage limited by height in a narrow viewport (480 × 800, 600 × 800, 900 × 800) the pane starts higher, and the chooser becomes a 2 × 2 grid in the region left of the window (the `left-region` variant). Wide viewports use the side column.
- The compact intent field is narrow (128 px at 360 × 640) because the window pane sits between it and Light. It scrolls its text; the engine keeps the first 80 characters whatever the field shows.
## 7. The time text and the status line

### 7.1 The time text

| Phase | Text | Source |
|---|---|---|
| `idle` | the chosen length, e.g. `25:00`; `--:--` when the custom text is not a valid length | `formatTime(minutes · 60 000)`; `STRINGS.timeUnknown` |
| `lit`, `paused` | the time left, e.g. `12:31` | `formatTime(timeLeftMs(state, now))` |
| `burned-out`, `snuffed` | `00:00` | `formatTime(0)` |

- The element is `div#time[role="timer"]`. `role="timer"` has an implicit `aria-live="off"`, so a screen reader reads it when visited and does not read it every second (R9.1). Its text is the digits; the words come from the live region and the T key.
- It lies in the text area (6.5), is `timeSize` px high (36 compact; 32 to 44 wide, by the zone height, 6.3), bold, with `font-variant-numeric: tabular-nums` so digits do not jitter, and uses `--ui-text` (ivory).
- It is written only when the string changes (`apply` compares), which is once a second in a running session and never in a paused one.
- It is the same value the page title will show; `sound-and-title` calls `formatTime`.

### 7.2 The status line

Centred on the candle's axis, 16 px, `--ui-text`, cut with an ellipsis (`text-overflow: ellipsis; overflow: hidden`); the full text remains in the DOM for screen readers. While Pause and Let it go dark are shown it is **one line and narrow** (136 px at 360 × 640, 6.5); in `idle` and the ended phases it is wider (240 px at 360 × 640, 656 px at 1280 × 800) and, at the compact size when the zone is at least 80 px tall, **up to two lines** (`-webkit-line-clamp: 2`), so the first-visit instructions fit. By phase, first match wins:

| Condition | Kind | Text (key in `strings.ts`) |
|---|---|---|
| `ui.refusal !== null` | refusal | `status.lengthRange` — "Choose {min} to {max} minutes." (numbers from the engine constants) |
| `idle` and history is empty | instructions | `status.firstVisit` — one line naming Enter, Space and Esc |
| `idle` | flavour | `status.idle` |
| `lit` and the session has an intent | intent | the intent, as typed by the user and kept by the engine |
| `lit` | flavour | `status.lit` (and `status.guttering` when `timeLeftMs <= 60 000`, so the last minute has its line when there is no intent) |
| `paused` | allowance | `fill(status.pauseLeft, { time: formatTime(pauseLeftMs(state, now)) })` |
| `burned-out` and `isBreak(state, now)` | cools | `status.cools` — "The wax cools." |
| `burned-out` | flavour | `status.burnedOut` — "The watch is over. Morning." |
| `snuffed` | flavour | `status.snuffed` |

The refusal clears as soon as the custom text becomes valid or a preset is chosen. The first-visit line disappears when the first session is lit (the history is then non-empty) and does not return (R14.2, Decision Q7). The intent is never shown in the other phases (R3.4).

## 8. The controls

### 8.1 Names, roles and what each does

| Control | Element and role | Name (key) | Action |
|---|---|---|---|
| Length chooser | `div[role=radiogroup]` of three `button[role=radio]` and one text input | group `length.group`; radios "{n} minutes" | `select-preset`, `set-custom` |
| Custom length | `input#custom[type=text][inputmode=numeric]` | `length.custom` | `set-custom` (typing selects the custom stop) |
| Intent | `input#intent[type=text][autocomplete=off]` | `intent.label` | `set-intent` |
| Light | `button#light[type=submit]` | `light.light` / `light.again` | `light` |
| Pause / Resume | `button#pause` (icon in the compact layout, labelled in the wide one; the accessible name is always the text) | `pause.pause` / `pause.resume` | `toggle-pause` |
| Let it go dark | `button#snuff`, same | `snuff.open` | `open-snuff` |
| Settings | `button#settings-button[aria-haspopup=dialog]`, in the floor-band zone, the rightmost zone control | `settings.open` | `open-settings` |
| Dialog buttons | `button#keep`, `button#confirm` | `snuff.keep`, `snuff.confirm` | `keep-burning`, `confirm-snuff` |
| Switches | `button[role=switch][aria-checked]` | `settings.sound`, `settings.ghosts` | none in `uiStep`: the DOM layer builds the next `Settings` and calls `onSettings` (11.2) |
| Close | `button#close` | `settings.close` | `close-settings` |

### 8.2 The length chooser

- Roving tabindex: the selected stop has `tabindex="0"` and the others `-1`, so the group is one Tab stop. When the custom stop is selected, the text input is the stop.
- On the radios: Left and Up select the previous stop, Right and Down the next, wrapping (`nextChoice`); Home and End are not handled. Selecting moves focus with the selection (the standard radio group). In the custom text input: Up and Down leave it to the previous or next stop; Left and Right move the caret; typing selects the custom stop.
- The selected stop shows `aria-checked="true"`, a heavier border and a check mark glyph in the compact cell, so the choice is not colour alone.
- The custom input is a chooser cell like the others: 80 px wide in the compact `top-row` variant (a two- or three-digit number with room to spare), 54 px in the `left-region` variant, about 82 px in the wide layout. Its `placeholder` is the unit abbreviation from `strings.ts`; `maxlength` is 3.
- Invalid custom text (only after the user has typed in it or pressed Light): `aria-invalid="true"`, a visible error border (shape: a double border and a "!" glyph), and `aria-describedby="status"`. The message itself is in the status line (7.2).

### 8.3 The intent field

- Single line, no `maxlength` (longer text is allowed and cut by the engine; R3.2). A counter "{n} of 80" sits inside the right end of the field in the wide layout and is hidden in the compact layout, where it shows only when the limit is passed (a short "80+" mark with the accessible description "Only the first 80 characters are kept."). The count uses `Array.from(text).length`, which matches the engine's code points. It is announced politely once when the limit is passed (a `set-intent` action that moves `overLimit` from false to true), not on every key.
- Enter submits the form (Light).

### 8.4 Light, Pause and Resume, Let it go dark

- Light is the submit button of the setup form. The button, Enter in a field and the global Enter all end in the same handler (the key map gives `light` for Enter outside buttons and `dom/events.ts` calls the handler; the form's `submit` event covers the button). Light is always enabled; an invalid length is a refusal, not a disabled button (a disabled button gives no explanation).
- Pause and Resume are one button whose label and icon change with the phase; the accessible name changes with them. It always means "do the other thing".
- Let it go dark opens the dialog; it does not snuff.
- Hover effects exist but nothing depends on them (R8.8). Active (pressed) feedback is a colour and border change, not motion.

### 8.5 The snuff dialog

- `dialog#snuff-dialog`, heading "Let it go dark?", one short body line ("The candle keeps burning while you decide."), buttons **Keep burning** (first in the DOM, `autofocus`) and **Snuff it** (the confirm). Focus starts on Keep burning (R6.3). Tab and Shift+Tab cycle between the two. Enter or Space on the focused button activates it.
- Esc, Keep burning: `keep-burning`. Snuff it: `confirm-snuff`. A click on the transparent backdrop does nothing (there is no backdrop surface to click: the dialog is small and `::backdrop` is `transparent` and non-interactive).
- The timer is not touched; the frame loop and the time text keep running behind and beside it. If the candle burns out while it is open, `uiStep` (input `engine`) closes it and the dialog's `close()` runs in the same frame.
- The confirm path: `confirm-snuff` with `overlay === "snuff"`: if the engine phase is still `lit` or `paused`, one `snuff` event; if it has ended in the meantime, none. Either way the dialog closes.

### 8.6 The settings panel

`dialog#settings-dialog` with heading, two switches ("Sound", "Ghosts", each with visible "On" / "Off" text and `aria-checked`), the default length chooser (the same builder as the main chooser, with its own group name), and **Close**. Each change calls `onSettings` at once (section 11). The first control in the panel (the Sound switch) takes focus on open. Esc closes it.

### 8.7 The Settings button

In the floor-band zone, the rightmost zone control, always shown (review change 1, D14): an icon button `44 × 44` with the accessible name "Settings" in the compact layout, a labelled `96 × 44` button in the wide layout (the rectangles in 6.5). It does not move between phases.

### 8.8 What is not a control

There is no break control (Light skips the break), no "reset", no history view (`ghosts-and-graveyard`), no volume. The tagline is text in the idle zone, not a link.

### 8.9 Strings (`src/strings.ts`)

Every user-visible string is a key here. The keys and the draft wording (final wording is for the review of the tasks; the tone is brief section 6: short and dry):

| Group | Keys → draft text |
|---|---|
| Names | `title` "Candlewatch", `tagline` "Keep the candle lit." (exist) |
| Setup | `setup.label` "Light a candle", `length.group` "Length", `length.preset` "{n} minutes", `length.custom` "Custom length in minutes", `length.placeholder` "min", `intent.label` "What is this candle for? (optional)", `intent.hint` "Only the first {max} characters are kept.", `intent.count` "{n} of {max}" |
| Buttons | `light.light` "Light", `light.again` "Light another", `pause.pause` "Pause", `pause.resume` "Resume", `snuff.open` "Let it go dark", `settings.open` "Settings" |
| Dialog | `snuff.title` "Let it go dark?", `snuff.body` "The candle keeps burning while you decide.", `snuff.keep` "Keep burning", `snuff.confirm` "Snuff it" |
| Settings | `settings.title` "Settings", `settings.sound` "Sound", `settings.ghosts` "Ghosts", `settings.defaultLength` "Default length", `settings.on` "On", `settings.off` "Off", `settings.close` "Close" |
| Time | `timeUnknown` "--:--", `minute` "{n} minute", `minutes` "{n} minutes", `second` "{n} second", `seconds` "{n} seconds", `timeLeft` "{time} left" |
| Status | `status.firstVisit` "Enter lights the candle. Space pauses it. Esc lets it go dark.", `status.idle` "The candle waits.", `status.lit` "The wick catches.", `status.guttering` "The flame gutters.", `status.pauseLeft` "Pause left {time}", `status.cools` "The wax cools.", `status.burnedOut` "The watch is over. Morning.", `status.snuffed` "The flame is out.", `status.lengthRange` "Choose {min} to {max} minutes." |
| Announcements | `announce.lit` "The wick catches. {time} left.", `announce.restored` "The candle is burning. {time} left.", `announce.paused` "Paused.", `announce.resumed` "The flame steadies.", `announce.q75` "A quarter is gone. {time} left.", `announce.q50` "Half is gone. {time} left.", `announce.q25` "Three quarters gone. {time} left.", `announce.lastMinute` "One minute left. The flame gutters.", `announce.burnedOut` "The watch is over. Morning.", `announce.snuffed` "The candle is out.", `announce.refused` "Choose {min} to {max} minutes.", `announce.timeOnRequest` "{time} left.", `announce.timeOnRequestPaused` "{time} left. Paused.", `announce.limit` "Only the first {max} characters are kept." |
| Regions | `region.setup` (the form), `region.watch` "The watch" |

Templates use `{name}` placeholders filled by `fill`. A unit test checks that every key used in `src/ui/` exists, that every key in the groups above is used, that no string literal that is visible text appears in `src/ui/` outside `strings.ts`, and that "pomodoro" appears nowhere in `src/`.

## 9. The live-region policy and screen-reader text

### 9.1 Structure

- **One** live region, `div#live[role="status"]` (implicit `aria-live="polite"`, `aria-atomic="true"`), created at build time, visually hidden with the clip technique, never `display: none`, empty at first. It carries only announcements.
- The time text is `role="timer"` (not live). The scene keeps `role="img"` with its flame-mode label, which never contains the time (candle-scene R12). Overlays are announced by their native `dialog` role and heading.
- Nothing else is `aria-live`. Error text in the status line is *also* announced once through the live region (the refusal), not through `aria-live` on the status line, so the status line can change quietly otherwise.

### 9.2 What is announced, and when

| Trigger | Message | Rule |
|---|---|---|
| A light (phase becomes `lit` from `idle`/`burned-out`/`snuffed`) | `announce.lit` with the time left | once, at once |
| `lit` → `paused` | `announce.paused` | once; no time |
| `paused` → `lit` | `announce.resumed` | once |
| `lit` → `burned-out` | `announce.burnedOut` | once, dated by the state change, not by the time |
| `lit`/`paused` → `snuffed` (user or pause limit) | `announce.snuffed` | once |
| Time left first falls to 75 %, 50 %, 25 % of the length, or to 60 s, while `lit` | `announce.q75`, `q50`, `q25`, `lastMinute` | each once per session; when several are crossed between two calls only the latest is said; not while paused; not re-announced after a pause, resume or reload |
| First call after a page load with a running session | `announce.restored` if `lit`, `announce.paused` if `paused` | once; the milestones already passed are marked done silently; an idle or ended page says nothing |
| Light refused (invalid length) | `announce.refused` | once per refusal (a `uiStep` effect, not a state change) |
| The intent passes 80 code points | `announce.limit` | once on crossing |
| The key T in `lit` or `paused` | `announce.timeOnRequest` or `…Paused` with `spokenTime` | exactly one per press, repeated even when equal (4.4) |
| Distractions (`hide`, `show`), the break ending, ticks, every second, every minute | nothing | — |

The frequency is therefore at most one message per state change plus four milestones per session, plus one per user request (refusal, T, limit). A 25-minute session at any tick rate has at most six automatic messages (lit, three quarters, last minute, end) and one more for each pause and resume.

### 9.3 The announcer

`AnnouncerMemory.done` is a bitmask of the four milestones already said for the session identified by `sessionKey` (the session's `startedAt`). A new `startedAt`, or a phase change to `lit` from a non-running phase, resets it.

```
nextAnnouncement(mem, state, now):
  phase = state.phase; key = state.session?.startedAt ?? null
  if !mem.started:                                   // first call after load
     message = lit→restored, paused→paused, else none
     done = (lit) ? mask of milestones whose threshold has already been crossed : 0
     return { started: true, phase, key, done }, message
  if phase != mem.phase (or key != mem.sessionKey while running):
     message = by (mem.phase → phase):  non-running→lit: lit(time left) · lit→paused: paused · paused→lit: resumed
                                        lit→burned-out: burnedOut · lit|paused→snuffed: snuffed
     // skipped transitions inside one gap: the message is for the final phase
     done = (new session) ? 0 : mem.done          // pause and resume keep it
     return …
  if phase == "lit":
     crossed = milestones with timeLeftMs(state, now) <= threshold and not in mem.done      // 0.75·L, 0.5·L, 0.25·L, 60 000
     if crossed.length > 0: done |= all crossed; message = the latest of them (smallest threshold)
  return mem, message-or-null
```

Thresholds are `L · 0.75`, `L · 0.5`, `L · 0.25` (L the length in ms) and `60 000`, with the same `<=` the scene uses for the drips and the guttering, so the words and the picture change together. For a 5-minute session the quarter at 75 s and the last minute at 60 s are separate milestones. `timeLeftMs <= 0` (an unsettled end) produces no milestone; the burn-out message follows when the engine settles.

`textOf` builds the string with `fill` from `strings.ts` and `spokenTime`. The announcer never reads a clock; `now` is an argument.

### 9.4 Other screen-reader text

- Every control has an accessible name from `strings.ts` (R9.9). The icon buttons have the text name and an `aria-hidden` icon. The chooser is a named `radiogroup`; the switches are `role=switch` with `aria-checked`; the invalid custom field has `aria-invalid` and `aria-describedby` to the status line.
- Landmarks: `main#app`, `form` with the label "Light a candle", `section#watch` with the label "The watch". One `h1` (visually hidden, as now).
- `lang="en"` stays on `html`.
- Focus moves are described by the elements' names; no `aria-live` is used to say where focus went.

## 10. Focus targets per state

`FocusTarget` is resolved to an element by `dom/focus.ts`: `pause-resume` → `#pause`, `light` → `#light`, `custom-length` → `#custom`, `keep-burning` → `#keep`, `settings-first` → the first control in the panel (`#sound`), `settings-button` → `#settings-button`, `restore` → the element recorded when the overlay opened (by reference, kept while it is still connected and visible), else `#pause`. If the target is not visible and enabled, the fallback chain is: `#pause`, `#light`, `#settings-button`, none (the document). Focus is moved after `apply`, in the same frame, so a button that just appeared can take it. The UI never moves focus when the user is typing in a field (the `typing` flag of the `engine` input).

| Change | Focus goes to | Where decided |
|---|---|---|
| Page load, nothing stored | nothing: Tab reaches the chooser first | no effect |
| Page load with a running session | nothing (no auto-focus) | no effect |
| Light sent | `#pause` | `uiStep` `light` |
| Pause sent / Resume sent | `#pause` (same element, new label) | `uiStep` `toggle-pause` |
| Snuff dialog opens | `#keep` | `uiStep` `open-snuff` |
| Dialog closed without snuff (Keep burning, Esc) | the element focused before, else `#pause` | `uiStep` `keep-burning` |
| Snuff confirmed | `#light`, once the phase has changed | `uiStep` `confirm-snuff` → `pendingFocus` |
| Candle burns out, or the pause limit snuffs, no overlay, not typing | `#light` | `uiStep` `engine` |
| Same, with the settings panel open | held; `#light` when the panel closes | `pendingFocus` |
| Same, with the user typing in a field | stays in the field; the move to Light is dropped, not held | `typing` |
| Settings opened | the Sound switch | `uiStep` `open-settings` |
| Settings closed | `#settings-button` (or the held `pendingFocus`) | `uiStep` `close-settings` |
| Light refused | `#custom` | `uiStep` `light` |
| Tab order | chooser → intent → Light (idle, ended); Pause or Resume → Let it go dark (running); Settings last: equal to the visual order in every layout | DOM order = reading order (12.2) |

The scripted keyboard walk of E4 checks, after every key, that `document.activeElement` is a visible, connected element inside the viewport (or the document at load), and that the focus ring is drawn (12.1).

## 11. Settings (R11)

### 11.1 The document

```ts
// src/storage/settings.ts
export interface Settings { readonly sound: boolean; readonly ghosts: boolean; readonly defaultLength: number }
export const DEFAULT_SETTINGS: Settings = { sound: true, ghosts: true, defaultLength: 25 };
export const SETTINGS_KEY = "candlewatch:settings";
export const SETTINGS_SCHEMA_VERSION = 1;

export function serializeSettings(s: Settings): string;           // JSON.stringify({ v: 1, sound, ghosts, defaultLength }) — key order fixed
export function parseSettings(text: string | null): Settings;     // never throws
export interface SettingsStore { load(): Settings; save(s: Settings): void }
export function createSettingsStore(kv: KeyValueStore | null): SettingsStore;
```

- **`parseSettings`**: `null`, text that is not JSON, a non-object, or a `v` that is not `1` gives `DEFAULT_SETTINGS`. For a version-1 object each field is read on its own: `sound` and `ghosts` keep a boolean and default otherwise; `defaultLength` keeps an integer from 5 to 90 (`Number.isInteger` and the engine's range) and defaults otherwise. Unknown fields are dropped. A document with `v` greater than 1 is read as defaults and **not** overwritten until the user changes a setting (the store remembers it was unreadable and writes on the first change only).
- **`serializeSettings`** writes the fixed key order, so `serializeSettings(parseSettings(serializeSettings(s)))` is the same text (P6).
- **`createSettingsStore(kv)`**: `load` reads `SETTINGS_KEY` through `kv.getItem` inside a try; `save` writes inside a try; with `kv === null` both are in-memory only. Nothing throws, nothing is shown (R11.6). Unreadable settings follow the session and history adapter: text that is not JSON, not an object, or not version 1 is read as defaults and, before the first write over it, copied to `SETTINGS_BACKUP_KEY` (`candlewatch:settings:unreadable`), never over an existing backup; if the backup cannot be written the original is left untouched and the new value lives in memory until the next save. A field that is invalid inside a version 1 object is only defaulted (no backup). This replaces "no backup copy" (Decision Q6) on the owner's instruction in batch 2. `readSettings(text)` returns `{ status: "absent" | "ok" | "unreadable", settings }` (as `readSession` does) and `parseSettings` is its `.settings`.

### 11.2 In the interface

`createInterface` takes the loaded `Settings` and an `onSettings` callback. Settings changes are not handled by `uiStep` (it has no settings action or effect; batch 1 decision 2). The panel's switch and chooser handlers in the DOM layer build the next `Settings`, call `onSettings(next)` at once and let the next `viewOf` show it; `main.ts` stores it. To `uiStep` a settings change is a UI-only input that changes nothing the engine sees (P8). Sound on means sound is allowed: nothing plays here, and nothing may play before the first user gesture (Decision Q6, brief section 7); `sound-and-title` reads `settings.sound`. Ghosts off hides ghosts only; the distraction count is untouched, and the setting is not an input of the engine (P8).

The default length sets the initial `UiState.length` the next time the chooser is built (page load) and the selected stop of the main chooser **only if the user has not chosen a length since** (a change in the panel while idle updates the main chooser's selection, a change during a session does not touch the running session).

## 12. Style

### 12.1 Tokens and contrast

New CSS in `src/ui/ui.css`, covered by `scene.md`. Custom properties on `#ui` (the room's own tokens in `scene.css` are reused where they exist):

| Token | Value | Use |
|---|---|---|
| `--ui-text` | `#efe6cf` (ivory; the same as `--wax-ivory`) | all text |
| `--ui-text-subtle` | `#c9c1ad` | counters, hints (never the time text) |
| `--ui-bg` | `#121826` | control fill |
| `--ui-bg-selected` | `#2b3552` | selected radio, pressed |
| `--ui-border` | `#a8afbf` | control border (2 px) |
| `--ui-focus` | `#efe6cf` | focus ring (3 px outline, 3 px offset) |
| `--ui-error` | `#ffb4a3` | error text and the invalid border |

Contrast, computed with the WCAG relative luminance formula (the numbers are checked by a unit test that reads the stylesheet; the zone and room bounds are the published `--zone-bg-darkest #080b12`, `--zone-bg-brightest #4b4358`, `--room-bg-darkest #05070d`, `--room-bg-brightest #566683`):

| Pair | Ratio | Needs |
|---|---|---|
| time text ivory on zone darkest / brightest | 15.83 / 7.53 | ivory-bright, ≥ 4.5 |
| status text ivory on zone darkest / brightest | 15.83 / 7.53 | ≥ 4.5 |
| ivory on `--ui-bg` / `--ui-bg-selected` | 14.26 / 9.74 | ≥ 4.5 |
| subtle text on `--ui-bg`; on zone darkest / brightest | 9.89; 10.98 / 5.22 | ≥ 4.5 |
| error text on `--ui-bg`; on zone darkest / brightest | 10.39; 11.54 / 5.49 | ≥ 4.5 |
| border on `--ui-bg`; on zone darkest / brightest; on room darkest | 8.06; 8.95 / 4.26; 9.16 | ≥ 3 |
| control fill against the room's brightest background | 3.06 | ≥ 3 (the border alone is 2.64 there, so the fill carries it; the real dawn wash behind the controls is darker than that bound) |
| focus ring ivory on zone brightest / room brightest / `--ui-bg` | 7.53 / 4.66 / 14.26 | ≥ 3 |
| selected fill against the plain fill | 1.46 | not relied on: the check mark and the heavier border show the selection |

Text sizes: body and status 16 px, buttons 16 px, time 36 px (compact) or 44 px (wide), bold. The font is the system font stack in one place (`--ui-font`), so the later font spec replaces it in one line. Forced colours and `prefers-contrast: more`: borders use `CanvasText`, focus uses `Highlight`, and nothing depends on the custom colours.

**Focus ring.** `:focus-visible { outline: 3px solid var(--ui-focus); outline-offset: 3px }` on every control; `outline: none` is never used without a replacement (a unit test scans the CSS). It is also applied to programmatic focus moves (`:focus-visible` matches after keyboard use; after a pointer action the browser does not draw it, which is the standard). No ancestor has `overflow: hidden` around a control (the top row, the chooser and the zone buttons are direct children of `#ui`). The ring is 3 px plus the 3 px offset, so on a 44 px target the visible indicator is 56 px; the 4 px minimum gap of R8.6 is measured between controls, and the ring may touch a neighbour's ring without hiding it (the gap in the layout is 8).

### 12.2 Tab order equals the visual order

Review change 2 (D15). DOM order is the Tab order, and it is also the visual reading order (top to bottom, then left to right) in every layout:

| Phase | Visual order = Tab order |
|---|---|
| `idle`, `burned-out`, `snuffed` | `#length` (one stop: the selected cell or the custom field), `#intent`, `#light`, then `#settings-button` (in the zone, last) |
| `lit`, `paused` | `#pause`, `#snuff`, `#settings-button` (left to right in the zone) |

In the compact `top-row` variant the chooser row is at the top, the intent field and Light are on the next row (intent on the left), and the zone is below, so the reading order is chooser, intent, Light, then the zone. In the `left-region` variant the chooser grid is first, the intent field and Light are on the row under it, intent on the left. In the wide layout the order is the column, top to bottom, then the zone. Within the chooser, arrow keys move between the stops in the reading order of the cells (left to right, and in the 2 × 2 grid row by row). The requirement is checked two ways: P10 compares the DOM order of the visible controls with the order of their rectangles (sorted by row, then column), and E4 presses Tab through every state at 360 × 640 and 1280 × 800 and compares the focus order with the rectangles read from the page. There is no focus trap except in an open overlay, and no positive `tabindex`.
### 12.3 Motion

Outside reduced motion, the only transitions are: the dialogs' fade (120 ms opacity), the switches' knob (120 ms), and a button's pressed state (80 ms). No transition touches the time text or the status line. Under `prefers-reduced-motion: reduce`, `#ui, #ui * { transition: none !important; animation: none !important }` is the first rule of the stylesheet, so the still version holds before any script runs (R13.1).

### 12.4 The look

Dark, soft, ivory: controls are rounded 10 px rectangles with a 2 px light border on the dark fill, no gradients beyond a faint inner highlight, no shadows. The icons are simple SVG glyphs (two bars, a triangle, a small cross-flame) with `aria-hidden`. Nothing looks like window chrome. No element is decoration: every one maps to an action or to state (R8.10).

## 13. Tests

### 13.1 Unit tests (Vitest, colocated)

| File | Covers |
|---|---|
| `src/ui/format.test.ts` | `formatTime`, `spokenTime`, `fill` examples (R7.3) |
| `src/ui/length.test.ts` | `parseLength` examples; `lengthOf`; `nextChoice` |
| `src/ui/light.test.ts` | `lightRequest` examples (refusal reasons, intent unchanged, empty intent omitted) |
| `src/ui/keys.test.ts` | the key map, row by row, including the focus kinds |
| `src/ui/ui-state.test.ts` | every row of the 3.5 table; invariants |
| `src/ui/view.test.ts` | status line by phase and condition; time text by phase; hidden/visible flags; the first-visit line |
| `src/ui/announcer.test.ts` | a 25-minute session at 1 s ticks (exactly six messages: lit, q75, q50, q25, last minute, burned out); the same with one tick every 10 minutes (lit, q25 or the latest crossed, burned out); pause and resume; reload; the first call; T |
| `src/ui/layout.test.ts` | the exact rectangles of 6.5 at 360 × 640 and 1280 × 800; the rectangles at 768 × 1024 and 1920 × 1080; the constants against `src/scene/constants.ts` and the halo markup |
| `src/ui/style.test.ts` | reads `ui.css`: the reduced-motion rule is first; no `outline: none` without a replacement; the contrast table of 12.1 from the token values; the focus ring; no `!important` outside the two allowed rules |
| `src/ui/purity.test.ts` | the pure modules import nothing forbidden (no DOM, `Date`, `Math.random`, `localStorage`); `test-kit.ts` is imported by no source file; the banned calls (`innerHTML`, `insertAdjacentHTML`, `document.write`, `setAttribute("style"`, `style.cssText`) appear nowhere in `src/ui/` |
| `src/ui/strings.test.ts` | every key used exists and is used; no visible literal outside `strings.ts`; "pomodoro" appears nowhere in `src/` (case-insensitive) |
| `src/storage/settings.test.ts` | defaults, each fall-back, version handling, the in-memory fallback, nothing thrown with a throwing store |
| `src/engine/selectors.test.ts` | `pauseLeftMs` examples (section 2) |

### 13.2 Property tests (fast-check, `PROP_PARAMS`, 300 runs or more; never weakened)

| ID | File | Notes |
|---|---|---|
| P1 | `src/ui/format.prop.test.ts` | arbitrary `ms` (integers, fractions, negatives, `NaN`, infinities, and 0 to 90 minutes) |
| P2 (and P2b) | `src/ui/length.prop.test.ts` | generated texts: digit strings, padded, signed, decimal, exponent, other scripts, mixed; and `nextChoice` |
| P3 | `src/ui/light.prop.test.ts` | arbitrary Unicode intent; `step` from `idle`, `burned-out`, `snuffed` states built with the engine's test kit |
| P4 | `src/ui/keys.prop.test.ts` | all contexts × generated keys with modifier flags and `repeat` |
| P5 | `src/ui/ui-state.prop.test.ts` | scripts of UI inputs, engine events, time gaps and reloads, driven through `uiStep` and `step` together, checking the engine's invariants (`assertInvariants`) after every step |
| P6 | `src/storage/settings.prop.test.ts` | valid settings; arbitrary text; arbitrary JSON; mutations of valid documents |
| P7 | `src/ui/announcer.prop.test.ts` | generated sessions, call-time sets (every second, every frame, a few, long gaps) containing at least one call after each engine event |
| P8 | `src/ui/ui-state.prop.test.ts` | engine scripts with UI-only inputs interleaved, compared by deep equality |
| P9 | `src/engine/selectors.prop.test.ts` | engine scripts and probe times, as in section 2 |
| P10 | `src/ui/layout.prop.test.ts` | integer viewports from 360 × 640 to 2560 × 1440, plus the four named sizes; every rule of 6.8 (including no persistent control above the floor line while a session runs, and Tab order = visual order) |

Shared generators and the reference model of the UI are in `src/ui/test-kit.ts`, test-only.

### 13.3 End-to-end tests (Playwright, `page.clock`, no hook in shipped code)

Setup: the fixtures of `e2e/scene-fixtures.ts` (stored sessions built with the engine's `serializeSession`/`serializeHistory`), and `openScene`. Whole-session tests start with nothing stored, `page.clock.install({ time: T0 })`, load the page, and drive the page with `page.keyboard` or `page.touchscreen`. Because the frame loop is a faked `requestAnimationFrame`, after each interaction the helper `settle(page)` runs `page.clock.runFor(48)` (three frames) so the view is applied and focus has moved. Time moves only with `runFor`; every `Date.now()` in the page (the loop, the visibility clock, the action time) agrees. Helpers (in `e2e/controls-fixtures.ts`): `storedSession(page)` (reads `localStorage` and parses it with `readSession`), `timeText(page)`, `statusText(page)`, `liveLog(page)` (a `MutationObserver` installed before load, collecting the live region's text with the frame it appeared), `focused(page)` (the accessible name and id of `document.activeElement`), `rectOf(page, selector)`.

| File | Tests |
|---|---|
| `e2e/controls.spec.ts` | **E1** keyboard session at 1280 × 800; **E1b** touch session at 360 × 640; **E2** time text; **E5** keys; **E10** first visit; **E13** T and the pause allowance; **E8** visibility |
| `e2e/controls-layout.spec.ts` | **E3** layout at four viewports × seven phases × (no overlay, snuff dialog, settings); **E14** the rectangles of 6.5 at 360 × 640 and 1280 × 800 during the sessions of E1 and E1b |
| `e2e/controls-a11y.spec.ts` | **E4** focus; **E6** accessibility tree and live-region log; **E9** reduced motion; **E11** text and strings |
| `e2e/settings.spec.ts` | **E7** settings |
| `e2e/scene.spec.ts` | the zone-clear test, changed as R15.2 says (the style that hides `#ui` is added by the test) |

**E1 (keyboard, 1280 × 800).** Nothing stored; `T0`. (a) Tab: focus on the selected length stop (25); ArrowLeft: 15 is selected; Tab: the intent field; type "write the report"; Enter. Expect: the stored session is `lit`, 15 minutes, the intent as typed; `#scene` has `data-phase="lit"`; the time text `15:00`; focus on `#pause`; the live log `The wick catches. 15 minutes left.`. (b) `runFor(5 min)`: `10:00`. Space: `data-flame="paused"`, the status `Pause left 10:00`, the time text still `10:00` after `runFor(3 min)` while the status reads `Pause left 07:00`; Space: lit again, focus on `#pause`. (c) `runFor(1 min)` and T: the live log gains exactly one message with the spoken time. (d) Esc: the dialog is open and the focused element is `Keep burning`; Esc: closed, focus back on `#pause`, the stored session unchanged, the time text still counting. Esc, Tab (to Snuff it), Enter: stored phase `snuffed`, history has one `snuffed` entry, focus on `#light`, the status `The flame is out.`. (e) Enter: `lit` again with 15 minutes (the chosen length is kept) and no intent; `runFor` past the end: `burned-out`, dawn (`data-phase`, `--dawn` is 1), the status `The wax cools.` for 5 minutes then `The watch is over. Morning.`, the live log exactly as expected, focus on `#light`; reload the page: the same ended state, no announcement.

**E1b (touch, 360 × 640).** A context with `hasTouch`. Tap the 25 stop's neighbour (50) and Light; the same checks as E1 through taps on the icon buttons: tap the pause icon (paused), tap it again (resumed), tap the snuff icon (dialog), tap **Keep burning**, tap the snuff icon, tap **Snuff it**; tap Light another. At each step the rectangles of the visible controls equal the table of 6.5 within 1 px, and each is at least 44 × 44.

**E3/E14 (layout).** For each viewport and phase the page's rectangles for `#intent`, `#length`, `#light`, `#pause`, `#snuff`, `#settings-button`, `#time`, `#status` and the dialogs are compared with `placeControls`; none intersects the rectangles of `.candle`, `.flame-shape`, `.halo` or the window pane (read from the page); the time text is wholly inside `.zone-text-area`; there is no scrollbar; while a session runs no control rectangle is above the floor line; the dialog, when open, leaves the flame and halo uncovered at the compact size for the whole range of wax heights (checked at `lit-start`, `lit-half`, `lit-last-minute`) and is allowed to cover them only in the settings panel case.

**E6 (accessibility).** `locator.ariaSnapshot()` of `#ui` and of each dialog is compared with a hand-written expected snapshot per state; the live log of a whole 25-minute session is compared with the list of 9.2, once with one-second steps and once with the clock jumped in one run; the scene's label never contains a digit.

**E8 (visibility).** In a lit session, `document.visibilityState` is redefined to `hidden`, `visibilitychange` is dispatched, `runFor(30 s)`, then `visible`: the stored session shows one distraction and its time away; the time text is what the clock says; no announcement and no focus change. A session stored with an open hide (`awaySince`) is closed by `syncVisibility` on load.

### 13.4 Mutation checks (at the wrap-up, as in the earlier specs: apply, run the suite, revert in a `finally`, record in `KIRO_USAGE.md`)

`formatTime` rounds down instead of up (P1); `parseLength` accepts `+25` or `25.0` (P2); `keyAction` ignores `repeat` (P4); `keyAction` maps Esc to a snuff (P4, P5); `uiStep` keeps the dialog open after the phase ends (P5); the announcer announces every minute (P7); the announcer forgets `done` after a pause (P7); `parseSettings` keeps an invalid default length (P6); `pauseLeftMs` loses its clamp, or uses `>` for `>=` (P9); the Light button's rectangle is moved into the window (P10); the Settings button is put back above the floor line (P10, E14); the chooser is drawn below the intent field, or the DOM order differs from the visual order (P10, E4); the intent is put in with `innerHTML` (the purity test); `T` announces while a text field has focus (P4, E13); the dialog's initial focus is the confirm button (E1, E4).

## 14. Screenshots

By `scene.md`, any change to what a user sees retakes the affected screenshots. This spec changes every state, so:

1. **All 21 `candle-*` screenshots are retaken** (`e2e/screenshots.spec.ts`, unchanged in its list), and each is looked at. They now show the setup controls (idle, burned-out, snuffed), the running controls and the time text.
2. **New screenshots**, `e2e/controls-screenshots.spec.ts`, named `controls-<screen>-<size>[-reduced].png`, desktop 1280 × 800 and phone 360 × 640:

| File (desktop · phone) | What it shows |
|---|---|
| `controls-idle-returning` | idle with a non-empty history: no instruction line, the status flavour line |
| `controls-invalid-length` | an invalid custom length after Light is pressed: the error in the status line, the field marked |
| `controls-lit-intent` | a lit session with an intent in the status line |
| `controls-snuff-dialog` (also `-desktop-reduced`) | the dialog open with **Keep burning** focused and the candle visible |
| `controls-settings` | the settings panel open |
| `controls-focus-light` | keyboard focus on Light, the ring visible |
| `controls-focus-pause` | keyboard focus on Pause during a session |

That is 15 new files (7 screens at two sizes, plus the reduced-motion dialog) and 21 retaken. The first-visit instructions are in `candle-idle-*` (nothing stored); the pause allowance line is in `candle-paused-*`; the ended controls with **Light another** are in `candle-burned-out-*` and `candle-snuffed-*`. Each file is looked at after capture for: its state is clear at its size; no control touches the flame, halo, candle or window; the time text and the status are readable; the focus ring is visible where named.

## 15. Traceability

| Requirement | Sections |
|---|---|
| R1 boundaries and wiring | 1, 2, 4.1, 5 |
| R2 length | 3.2, 8.2 |
| R3 intent | 3.3, 7.2, 8.3 |
| R4 Light | 3.3, 3.5, 8.4 |
| R5 pause and resume, `pauseLeftMs` | 2, 3.5, 7.2, 8.4 |
| R6 snuff | 3.4, 3.5, 8.5, 10 |
| R7 time text | 3.1, 7 |
| R8 layout | 6 |
| R9 screen readers | 9 |
| R10 keyboard and focus | 3.4, 10, 12.1, 12.2 |
| R11 settings | 11, 8.6 |
| R12 visibility | 5 |
| R13 reduced motion and contrast | 12 |
| R14 first visit and flavour | 7.2, 8.9 |
| R15 tests, screenshots, review | 13, 14, 16 |
| P1 to P10 | 13.2 |

## 16. Files touched, and the order of work

Files: section 1.3, plus `e2e/scene.spec.ts` (one test), `e2e/controls*.spec.ts`, `e2e/controls-fixtures.ts`, `docs/screenshots/*`, `.kiro/steering/structure.md` (the `ui/` folder and the settings key, at the wrap-up), `KIRO_USAGE.md`, and the session-engine Decisions (done).

The order of work is in `tasks.md`: (1) the engine selector and its tests; (2) the pure modules; (3) strings and the view model; (4) the DOM layer and the stylesheet; (5) `main.ts` and the visibility wiring; (6) one required task per property; (7) the e2e groups and the zone-clear test change; (8) the screenshots; (9) the mutation checks and the `costume-reviewer` run; (10) wrap-up.

## 17. Decisions

The review answers Q1 to Q8 are in `requirements.md` Decisions. These are the design's own choices, open to review:

- **D1. The pure/thin split with a view model.** Everything that decides is pure and property-tested; the DOM layer copies a `ViewModel` and routes events. Reason: Vitest has no DOM library and none is to be added (R1.9).
- **D2. Layout by computation, not by CSS breakpoints.** `placeControls(vw, vh)` returns pixel rectangles from the scene's own scaling rule, and the DOM layer writes them as custom properties. Reason: the controls must avoid rectangles that depend on the SVG's `meet` scaling, which CSS media queries cannot express; a pure function can be property-tested over every viewport (P10).
- **D3. Superseded by D14.** The first design let a Settings corner button overlap the pool on phones; the review removed that exception.
- **D4. The custom-length error goes in the status line**, not beside the field, because the upper room has no space for a message next to a field that is 54 to 128 px wide (Q1), and it is also announced once through the live region.
- **D5. Native `<dialog>` with `showModal()`** for the snuff dialog and the settings panel: inert background, focus containment and the dialog role come from the browser; Esc is routed through the state machine so there is one path.
- **D6. Light is never disabled.** An invalid length is a refusal with a message, a focus move and an announcement; a disabled button would give no reason.
- **D7. Superseded by D15.** The first design accepted a Tab order that differed from the visual order in the compact layout; the review removed that.
- **D8. Announcement frequency is state changes, four milestones per session and on request**; nothing per second or per minute; the first call after a load says the state once. The T key repeats even identical text by clearing the region for one frame (4.4).
- **D9. The time text rounds up.** A candle with 0.4 s left reads `00:01`, and `00:00` means the time is up. The page title will use the same text.
- **D10. `pauseLeftMs` reuses the engine's own `pauseLimitAt`**, so the allowance shown and the instant of the snuff cannot disagree.
- **D11. No change to the scene.** Its geometry is copied into `layout.ts` as constants and guarded by a test that reads `src/scene/constants.ts`, so a later scene change fails loudly instead of silently putting a control over the flame.
- **D12. Coordination with `ghosts-and-graveyard`.** The left edge band below y = 300 units is the door's slot. In the ended phases the setup controls are on screen while that session's ghosts may still be; the ghosts spec must keep ghosts clear of the control rectangles (`Placement`), or hide them while the controls are shown. This spec exports `placeControls` for it.
- **D14. Design review change 1: the Settings opener is a zone control.** It sits in the floor-band zone with the time text, Pause or Resume and Let it go dark, rightmost, in every phase and at every size (6.3, 6.5). So no persistent control is ever in the light pool, at any size or wax height, and the pool rule has no exception (R8.4). Re-checked at 360 × 640 with 44 px targets: the zone is 80 px tall, the three buttons are 44 × 44 at y 578..622 (x 8..52, 256..300, 308..352), the time text is 36 px, centred at x 180, and the status line is one line 136 px wide while the buttons are shown and up to two lines 240 px wide at rest. At 1280 × 800 the buttons are labelled and Settings is at x 976..1072. The cost is the narrower status line while running (it was 228 px), so a long intent is cut short with an ellipsis (the full text stays for screen readers). The pool analysis of the first design (6.4) is dropped.
- **D15. Design review change 2: Tab order equals the visual order in every layout.** In the compact layout the length chooser is drawn above the intent field, as in the wide layout, so the reading order is chooser, intent, Light, then the zone controls (12.2, 6.3). Two compact variants keep that order: `top-row` (the chooser is a row of four cells across the top) and `left-region` (a 2 × 2 grid on the left, for stages limited by height). The cost is a narrow compact intent field (128 px at 360 × 640, 176 px at 480 × 800), because the window pane sits between it and Light; the field scrolls its text, and the engine keeps the first 80 characters. The order is checked by P10 (rectangles against the DOM order) and E4 (Tab through the real page).

### Decisions from the batch 1 build

Six questions came up while the pure modules were built (tasks 1 to 14). All six were accepted as built; the design above now says the same as the code.

1. **Every key repeat returns `null`, Escape included.** A held Escape cannot open the snuff dialog and close it on the next repeat. R10.3 now says a held key never acts twice (3.4 table and notes).
2. **Settings changes are handled outside `uiStep`.** `UiAction` and `Effects` have no settings action. The panel's DOM handlers call `onSettings` (11.2, 8.1, 1.2).
3. **Typing and settings, one rule.** While the user types in a field, focus stays in the field and the pending move to Light is dropped. While the settings panel is open, the move is held in `pendingFocus` and released when the panel closes. Sections 3.5 and 10 say the same thing.
4. **`confirm-snuff`** sends `snuff` only while a session runs, sets no immediate focus, and holds the move to Light until the next `engine` input (3.5).
5. **`initialUi({ defaultLength })`** takes the one field it needs, because `storage/settings.ts` did not exist yet. Task 20 switches the parameter to the `Settings` type.
6. **`parseLength`** treats text of only spaces and tabs as `empty` (3.2).

### Decisions from the batch 2 build

Tasks 15 to 22 (strings, announcer, layout, settings, view model). Choices made while building; the first one changes an earlier decision.

1. **Settings keep a backup of unreadable text** (owner's instruction for batch 2): `candlewatch:settings:unreadable`, same rules as the session and history keys (11.1). This replaces Q6's "without a backup copy"; `requirements.md` Q6 is updated to say so.
2. **`initialUi` takes `Settings`** (task 20), as decided in batch 1.
3. **The first-visit line is shorter**: "Enter lights. Space pauses. Esc lets it go dark." (48 characters) instead of the 62-character draft, so it fits two lines of the 240 px resting status at the compact size. New key `intent.overLimit` ("{max}+") is the short mark of 8.3.
4. **The announcer** marks the milestones already passed as done on the first call after a load for both `lit` and `paused` (9.3 pseudocode said only `lit`; a paused session reloaded and resumed would otherwise repeat a milestone, against R9.3). A new session starts with none done; a late first call after a light says `lit` and the next call may then say the milestone already crossed.
5. **Layout names and checks**: `Placement.keepClear.windowPane` (the purity scan forbids the word `window`). P10 treats the time text and the status line as one stack (they touch, as the rectangles of 6.5 do) and requires only that the status line is under the time text; every other pair keeps 4 px. The "left edge band" check covers the rows from 300 room units down to the floor line (the zone controls are below the floor line and are not in the door's slot).
6. **View model**: `timeWords` is empty for an invalid custom length (there is no time to say); the first-visit line shows only while the phase is `idle` and the history is empty.
