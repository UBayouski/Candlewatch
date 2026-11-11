# Design: candle-scene

Implements `requirements.md` in this folder (R1-R13, P1-P8, Decisions Q1-Q5). Scope: a pure scene model, a thin SVG and CSS renderer, the minimal `main.ts` wiring, and the browser tests. No ghosts, graveyard, shelf, controls, time text, sound or page title.

Status: **costume review applied.** The review was done in the Kiro CLI against the three rules of the `costume-reviewer` agent, on the previous draft: verdict CHANGES NEEDED, then applied (findings F1 to F6 and the closing of P1 and P2 are in Decisions). Design only. The tasks are in `tasks.md`.

## 1. Overview

```
engine State ──(timeLeftMs, waxFraction, isBreak, phase)──> sceneModel(state, now, options) ──> SceneModel (plain data)
                                                                                                      │
main.ts: Date.now() ── now ──────────────────────────────────────────────────────────────────────────┤
                                                                                                      v
                                                          renderer.apply(model): CSS custom properties + data attributes on #scene
                                                                                                      │
                                                                  scene.css + inline SVG (static markup) draw everything
```

- `sceneModel` is pure, total and DOM-free. It holds every decision: which flame mode, how tall the wax, how many drips, how big the light.
- The renderer copies model fields to the DOM. It has no `if` on phase, time or wax.
- The stylesheet turns those numbers into shapes (transforms, opacity, gradients). Easing between looks is CSS transitions, which reduced motion switches off.
- `main.ts` owns the clock and the redraw loop, and passes `now` in (steering `structure.md`).

### 1.1 Files

```
src/scene/
  types.ts        SceneModel, FlameMode, SceneOptions, MOTION_FIELDS, RANGES          (pure)
  constants.ts    every number in this design (thresholds, tables, geometry)          (pure)
  flicker.ts      hash32, noise, flicker(seed, now, mode)                              (pure)
  model.ts        sceneModel                                                           (pure)
  room.ts         ROOM_SVG: the static SVG markup as a string                          (no logic)
  render.ts       createScene(root) -> { apply(model) }                                (DOM, no engine import)
  scene.css       palette, layout, transitions, reduced-motion block                   (CSS)
  index.ts        re-exports sceneModel, createScene and the types
  *.test.ts, *.prop.test.ts   colocated tests
src/main.ts       load, reload, tick, redraw loop (section 10)
src/strings.ts    adds the five accessible names (section 6.4)
e2e/scene.spec.ts Playwright fixtures, assertions and screenshots (section 11)
docs/screenshots/ 21 screenshots (section 11.4)
```

"Pure" files are the **model files**: `types.ts`, `constants.ts`, `flicker.ts`, `model.ts`. The purity test (section 12.2) is strict for them. `src/scene/.gitkeep` is removed once the folder has files.

### 1.2 Dependencies and the engine's public surface

- `model.ts` imports only from `../engine` (the public `index.ts`): `timeLeftMs`, `waxFraction`, `isBreak`, and `import type { State }`. It never reaches into `../engine/<file>` and it reads no other state field (R1.1, R1.2).
- `render.ts` imports nothing from the engine. It imports `types.ts` and `STRINGS`.
- The `distraction-tracking` spec changes the engine's public surface (new selectors, session document version 2, `Session` gets more fields). None of that reaches the scene: the four things the scene reads keep their signatures. The scene tests build states only through the engine (`step`, `serializeSession`), so they follow those changes. This is why the code tasks run after `distraction-tracking` (R13.9): `main.ts` and the e2e fixtures touch the storage format.

## 2. The SceneModel

All fields are plain values. Ranges are enforced in `RANGES` (types.ts) and checked by P6. "Motion" marks the motion values of R9.1: zero or false under `reducedMotion`.

```ts
export type FlameMode = "unlit" | "steady" | "paused" | "guttering" | "smoke";

export interface SceneOptions {
  readonly reducedMotion?: boolean; // default false
  readonly seed?: number;           // default DEFAULT_SEED; non-finite falls back to it
}

export interface SceneModel {
  // --- state (not motion) ---
  readonly phase: State["phase"];        // echo of state.phase; the renderer writes data-phase
  readonly waxHeight: number;            // [0, 1]
  readonly drips: 0 | 1 | 2 | 3;
  readonly flameMode: FlameMode;
  readonly flameHeight: number;          // [0, 1]  fraction of the full flame
  readonly flameBlue: number;            // [0, 1]  0 amber, 1 blue
  readonly flameRagged: number;          // 0 or 1  1 = leaning, ragged tip
  readonly flameGlow: number;            // [0, 1]  strength of the flame's own light
  readonly smoke: number;                // 0 or 1  the wisp
  readonly stub: number;                 // 0 or 1  the stub of an ended candle (burned-out, snuffed)
  readonly lightRadius: number;          // [0, 1]  fraction of LIGHT_FULL_UNITS
  readonly dawn: number;                 // 0 or 1
  readonly cooling: boolean;             // isBreak(state, now)
  // --- motion ---
  readonly flickerLean: number;          // [-12, 12] degrees
  readonly flickerHeight: number;        // [-0.6, 0.2] added to 1, scales the flame's height
  readonly flickerGlow: number;          // [-0.6, 0.25] added to flameGlow
  readonly animateDrips: boolean;        // a new drip may run down
  readonly animateSmoke: boolean;        // the wisp may sway
  readonly animateEase: boolean;         // looks may ease between modes, dawn may ease in
}

export const MOTION_FIELDS = [
  "flickerLean", "flickerHeight", "flickerGlow",
  "animateDrips", "animateSmoke", "animateEase",
] as const;
```

Notes:

- `flameRagged`, `smoke`, `stub` and `dawn` are 0 or 1 today but typed as numbers, so a later spec can ease them in the model without changing the renderer.
- The model has no strings except the two fixed unions (`phase`, `flameMode`), and no user text (R2.5).
- `animateSmoke` is `!reducedMotion && flameMode === "smoke"`. `animateDrips` and `animateEase` are `!reducedMotion`.

## 3. `sceneModel(state, now, options)`

```ts
export function sceneModel(state: State, now: number, options: SceneOptions = {}): SceneModel
```

Inputs read: `state.phase`, `timeLeftMs(state, now)`, `waxFraction(state, now)`, `isBreak(state, now)`. Nothing else. The selectors already return 0 or `false` for a non-finite `now` (R1.5), so no separate branch is needed for it.

### 3.1 Constants (constants.ts)

| Name | Value | Meaning |
|---|---|---|
| `GUTTER_MS` | 60 000 | "last minute" threshold (R5.1) |
| `LIGHT_MIN` | 0.2 | smallest light radius while a candle exists (R7.2) |
| `LIGHT_MAX` | 1 | light radius at a whole candle |
| `LIGHT_FULL_UNITS` | 700 | radius, in room units, when `lightRadius` is 1 |
| `DRIP_MARKS` | `[0.75, 0.5, 0.25]` | wax heights at which drips 1, 2, 3 appear |
| `DEFAULT_SEED` | 20261031 | flicker seed when none is given |

### 3.2 Formulas

```
phase      = state.phase
running    = phase is "lit" or "paused"
ended      = phase is "burned-out" or "snuffed"
timeLeft   = timeLeftMs(state, now)
frac       = waxFraction(state, now)

waxHeight  = idle ? 1 : running ? frac : 0                 // R3.1, R3.3, R3.4; exact, no clamp, no rounding
drips      = !running ? 0
           : frac <= 0.25 ? 3 : frac <= 0.5 ? 2 : frac <= 0.75 ? 1 : 0       // R4.1 (non-increasing wax gives non-decreasing drips)
lightRadius= idle ? LIGHT_MIN
           : running ? LIGHT_MIN + (LIGHT_MAX - LIGHT_MIN) * frac            // R7.2, linear in wax height
           : 0                                                                // R7.5
dawn       = phase === "burned-out" ? 1 : 0                                   // R8.2, whole phase
stub       = ended ? 1 : 0                                                    // R3.4, R3.7: the fixed stub is drawn only after the end
cooling    = isBreak(state, now)                                              // R8.5
```

Why `<=` and no rounding for drips: lengths are whole minutes, so session length in ms is a multiple of 4. A quarter mark is then a whole number of ms and `timeLeft / length` is exactly 0.75, 0.5 or 0.25 there. A mark is therefore reached at exactly the right millisecond, and P1's example tests pin 0.76, 0.75, 0.5, 0.25 and 0.

Why linear light: the requirement is "a non-decreasing function of wax height with a minimum above 0" (R7.2). Linear is the simplest function that follows the wax exactly, and it makes P2 easy to state. The perceived darkening is helped by the flame glow (section 4), not by a curve here.

Idle is a state with no session, so `frac` is 0 there; the table above is the Q1 decision. In `idle` the room is dim (`LIGHT_MIN`) and the flame is `unlit`, so the pool is small (section 6.3).

### 3.3 The flame table

`flameMode` is a pure function of `phase` and `timeLeft` (R5.2):

```ts
function flameModeOf(phase: State["phase"], timeLeft: number): FlameMode {
  switch (phase) {
    case "idle": return "unlit";
    case "paused": return "paused";                    // wins over guttering (R5.3)
    case "burned-out":
    case "snuffed": return "smoke";
    case "lit": return timeLeft <= GUTTER_MS ? "guttering" : "steady";   // time left 0 while still lit: guttering (R5.4)
  }
}
```

Per-mode look constants (`FLAME_LOOK`), all fixed per mode (R5.5):

| Mode | `flameHeight` | `flameBlue` | `flameRagged` | `flameGlow` | `smoke` |
|---|---|---|---|---|---|
| `unlit` | 0 | 0 | 0 | 0 | 0 |
| `steady` | 1 | 0 | 0 | 1 | 0 |
| `guttering` | 0.6 | 0 | 1 | 0.55 | 0 |
| `paused` | 0.35 | 1 | 0 | 0.35 | 0 |
| `smoke` | 0 | 0 | 0 | 0 | 1 |

R5.6 check (still version, size, colour, shape):

- `steady` vs `guttering`: size (1 vs 0.6) and shape (teardrop vs ragged).
- `steady` vs `paused`: size (1 vs 0.35) and colour (amber vs blue).
- `guttering` vs `paused`: size, colour and shape.
- `unlit` vs `smoke`: neither has a flame, so at flame level only the shape differs (no mark vs wisp). R5.6 is read at scene level for this one pair (Decision P1, accepted): the whole still scene differs in the candle (whole candle vs stub), the pool (small vs none) and the wisp.
- A flame mode vs `unlit` or `smoke`: size and shape.

### 3.4 Motion values

```
rm = options.reducedMotion === true
flicker = rm ? ZERO : flicker(seed, now, flameMode)         // section 4
animateDrips = !rm;  animateEase = !rm;  animateSmoke = !rm && flameMode === "smoke"
```

`seed = Number.isFinite(options.seed) ? Math.trunc(options.seed) | 0 : DEFAULT_SEED`. The model with `reducedMotion: true` is built by the same code with only these lines different, so P5 (equal in every non-motion field) holds by construction and is checked anyway.

## 4. The seeded flicker (flicker.ts)

`flicker(seed, now, mode) -> { lean, height, glow }`. A pure function of its three arguments (R6.2, R6.6). No `Math.random`, no state, no history.

### 4.1 Hash

A 32-bit integer hash (a "lowbias32" style mixer), using only `Math.imul` and shifts:

```ts
function hash32(a: number, b: number, c: number): number {
  let h = (a ^ Math.imul(b, 0x9e3779b1) ^ Math.imul(c, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}
const unit = (h: number): number => h / 4294967296;        // [0, 1)
const signed = (h: number): number => unit(h) * 2 - 1;      // [-1, 1)
```

`now` is large (about 1.7e12), so a lattice index `i = Math.floor(now / step)` is reduced before hashing: `idx = ((i % 2**32) + 2**32) % 2**32` (works for negative `i`). A non-finite `now` is treated as 0.

### 4.2 Value noise

Smooth 1-D value noise per channel `ch`, sampled at a fixed step in ms and interpolated with a smoothstep:

```
t  = now / step[ch];  i = floor(t);  f = t - i;  s = f*f*(3 - 2f)
n  = lerp(signed(hash32(seed, idx(i),   ch)),
          signed(hash32(seed, idx(i+1), ch)), s)             // in [-1, 1]
```

| Channel | `ch` | Step (ms) | Used for |
|---|---|---|---|
| lean | 0 | 120 | sideways lean |
| height | 1 | 70 | flame height jitter |
| glow | 2 | 90 | glow jitter |

Because the lattice values are in [-1, 1) and the interpolation is convex, `|n| <= 1`. Because the smoothstep slope is at most 1.5 and the lattice step is the time between samples, two instants `d` ms apart differ by at most `3 * d / step` in `n` (R6.4). P4 uses this bound.

### 4.3 Amplitude per mode (R6.5)

`FLICKER_AMPLITUDE[mode] = { lean (deg), height, glow, sputter }`:

| Mode | lean | height | glow | sputter |
|---|---|---|---|---|
| `unlit` | 0 | 0 | 0 | no |
| `steady` | 3 | 0.06 | 0.08 | no |
| `paused` | 1 | 0.03 | 0.04 | no |
| `guttering` | 7 | 0.12 | 0.15 | yes |
| `smoke` | 0 | 0 | 0 | no |

`lean = A.lean * n0`, `height = A.height * n1`, `glow = A.glow * n2`. For `unlit` and `smoke` all three are exactly 0.

### 4.4 The sputter dips (guttering only)

Time is cut into windows of `DIP_WINDOW_MS = 1500`. In window `w = floor(now / 1500)`:

```
active = unit(hash32(seed, idx(w), 3)) < 0.35                     // about one window in three
width  = 400 ms
centre = w*1500 + width/2 + unit(hash32(seed, idx(w), 4)) * (1500 - width)   // pulse stays inside its window
depth  = 0.25 + 0.20 * unit(hash32(seed, idx(w), 5))              // 0.25 .. 0.45
pulse  = active ? 0.5 * (1 + cos(pi * clamp(|now - centre| / (width / 2), 0, 1))) : 0
height -= depth * pulse
glow   -= 0.9 * depth * pulse
```

A dip is a smooth, short drop of the flame (it nearly dies, then recovers): a sputter. It never leaves its window, so it is a pure function of `now` and the seed.

Ranges (the RANGES in `types.ts`): lean `[-7, 7]` (documented `[-12, 12]` leaves room); height `[-0.12 - 0.45, 0.12] = [-0.57, 0.12]`, documented `[-0.6, 0.2]`; glow `[-0.15 - 0.405, 0.15] = [-0.555, 0.15]`, documented `[-0.6, 0.25]`.

### 4.5 What flicker may touch

The renderer applies `flickerLean` as a rotation of the flame, `flickerHeight` as a vertical scale and `flickerGlow` as the strength of the flame's halo. It does not touch `lightRadius` (R7.6). The wax and the light radius have no flicker.

## 5. The room (SVG)

### 5.1 Coordinates and scaling

One inline `<svg>` with `viewBox="0 0 600 1000"` (the **stage**) and the default `preserveAspectRatio="xMidYMid meet"`. The SVG fills a fixed full-viewport container and has `overflow: visible`. The backdrop layers are drawn far beyond the stage: x from -2200 to 2800 and y from -600 to 1600.

Result:

| Viewport | Scale (viewport / stage) | What you see |
|---|---|---|
| 360 x 640 (phone portrait) | 0.6 (width-bound) | The stage fills the width. The candle is about 250 px tall. A little backdrop above and below. |
| 768 x 1024 | 1.28 (width-bound) | The stage is about 768 px wide. |
| 1280 x 800 | 0.8 (height-bound) | The stage is 480 px wide, centred; 400 px of room on each side. |
| 1920 x 1080 | 1.08 (height-bound) | The stage is 648 px wide; 636 px of room on each side. |

The candle is always centred on x = 300 and always sits in the stage, so it is fully visible at every size (R3.5, R10.2). In landscape the extra width shows more wall (R10.3), because the candle's size depends on the stage, and the stage depends on the smaller dimension only. Backdrops cover aspect ratios up to about 5:1.

The container is `position: fixed; inset: 0; overflow: hidden`, with `html, body { margin: 0; overflow: hidden }`, so the scene never causes a scrollbar (R10.2). The stage uses no fixed pixel size, no fixed aspect ratio and no hover (R10.5).

### 5.2 Layers (back to front)

All shapes are static markup in `room.ts`. IDs are prefixed `cw-`. Classes carry the CSS hooks. After the costume review (Decisions F1 to F6) there is no table and no dish, and every layer shows one thing. After the two review passes of the finished scene (17.3) the window is drawn above the dawn wash.

| # | Layer (class) | Contents | Shows (R11.8) |
|---|---|---|---|
| 1 | `.wall` | A large rect from y = -600 down to the floor line (y = 900), vertical gradient `--wall-top` to `--wall-low`. | Nothing of its own. It is the surface the light pool reveals, so it carries progress: the lit part of the wall is the pool. Without it the pool would have nothing to show. |
| 2 | `.night` | A rect over the same area, filled `--room-night`, opacity constant 1, masked by `#cw-pool-mask` (5.3). It ends at the floor line. | Progress (the dark outside the pool). |
| 3 | `.dawn-wash` | A rect over the wall area, vertical gradient from `--dawn-cool` (top) to `--dawn-warm` (low), stops at alpha `--dawn-alpha`, opacity `var(--dawn)`. Layered above `.night`; `.night` is not faded. | Dawn. |
| 4 | `.window` | A night window on the wall: a **portrait** pane at x 240..360, y 50..260 (120 wide, 210 tall), drawn above `.night` so it keeps its colour in the dark, and **above `.dawn-wash`** so the wash does not dim it: the dawn pane (`#566683`) is lighter than the wash beside it (about 1.4:1) and visibly lights up. The group has **soft edges**: a Gaussian blur (`#cw-soft-edge`, standard deviation 5, in sRGB so the dark gradient does not band). `.window-rest` is filled with a **constant faint vertical moonlight gradient** (`#cw-window-grad`) from `--window-moon` at the top to `--window-night` at the bottom; it carries no state. `.window-dawn` is filled `--window-dawn`, opacity `var(--dawn)`. Only the pane: no frame, sill, mullion or curtain. | Dawn (completion): the pane lights up. |
| 5 | `.candle` | `.body`: x 268..332, from the floor line up 420 units, `scaleY(var(--wax-height))` from the bottom. `.stub`: x 268..332, y 872..900, opacity `var(--stub)`. | Time left (body). An ended session (stub). |
| 6 | `.lit` (group) | Not translated; carries `clip-path: url(#cw-above-floor)`, the stage area above y = 900. Inside it, `.head`, translated down by `(1 - var(--wax-height)) * 420px`, holds the rim ellipse, `.wick`, `.drip-1..3`, the `.flame` stack, `.ember`, `.smoke-wisp` and `.halo`. | Wax top (time left), drips (quarters burned), flame (session state), ember (break), smoke (ended), halo (flame state). |
| 7 | `.zone` | An opaque band from the floor line down to y = 1600 and across the whole backdrop. `.zone-rest` is filled `--zone-bg-darkest`; `.zone-dawn` is filled `--zone-bg-brightest`, opacity `var(--dawn)`. Topmost layer. It contains an invisible marker rect, `.zone-text-area` (x 110..490, y 900..1000, no fill), so tests and the controls spec can read where the time text goes. | The reserved time-text zone (5.4, 7.2). It brightens at dawn (completion). |

The floor is the zone (Decision F2). The wall is kept only as the substrate of the light pool (Decision P2). Clipping `.lit` at the floor line and painting `.zone` last each keep the flame, its halo, the drips, the smoke and the light pool out of the zone at any wax height. Either one alone would do; both are tested (12.3, 11.3).

The stage is 600 x 1000 units. The part of the zone inside the stage is the band from y = 900 to 1000.

### 5.3 The light pool

```svg
<mask id="cw-pool-mask" maskUnits="userSpaceOnUse" x="-2200" y="-600" width="5000" height="1500">
  <rect class="mask-all" x="-2200" y="-600" width="5000" height="1500" fill="white"/>  <!-- white: night shows -->
  <circle class="pool" cx="0" cy="0" r="700" fill="url(#cw-pool-hole)"/>                 <!-- black centre, clear edge -->
</mask>
```

- `#cw-pool-hole` is a radial gradient from opaque black at the centre, through 0.75 alpha at 60 percent, to transparent at the edge. Black in the mask removes the night, so the pool is the lit wall.
- `.pool` is moved and scaled by CSS only:
  `transform: translate(300px, calc(400px + (1 - var(--wax-height)) * 420px)) scale(var(--light-radius));`
  The pool follows the flame down the candle and its radius is `lightRadius * 700` room units (R7.2). At a whole candle the pool (700 units) covers the stage; at `LIGHT_MIN` it is 140 units.
- **The pool's intensity is constant** (Decision F4). `.pool` has no opacity rule and does not read the flame glow. The pool shows progress only, by its radius. The flame's glow and flicker act on `.halo` only.
- The night layer and the mask end at the floor line, so the pool is cut off there and never lights the zone.
- The vignette is not a separate layer. It is what is left of `.night` beyond the pool edge.

### 5.4 Candle geometry (room units)

The drawn height of the candle is exactly proportional to the wax height (R3.6, Decision F6): `420 * waxHeight`. Nothing fixed is added to it while the session is running.

| Name | Value |
|---|---|
| Candle x range | 268 to 332 (width 64, centre 300) |
| Floor line | y = 900. The candle's base, the drip clip line and the top of the time-text zone. |
| Full candle height (`CANDLE_H`) | 420 |
| Body at full height | y 480 to 900 |
| Rim at wax height `h` | y = 900 - 420 h |
| Drawn candle height | 420 h exactly, in `idle`, `lit` and `paused`. At `h = 0` the body is gone. |
| Stub | y 872 to 900 (28, `STUB_H`), drawn only in `burned-out` and `snuffed` (`--stub` is 1). It is the whole candle then. |
| Wick | 20 tall, standing on the rim |
| Flame at full height | 120 tall, base on the wick. At a whole candle its tip is at y = 340, below the window (y 50..260). |
| Time-text zone | The stage band below the floor line. The text area is x 110..490, y 900..1000 (380 x 100). |
| Reserved edge bands | x 0..110 and x 490..600 for every y, including the outer parts of the zone band, and everything beyond. |

The pure helper `candleHeightUnits(model)` in `model.ts` returns this drawn height for tests (12.1). The reserved bands hold no object. They are for ghosts and the door of later specs (R10.4). *Amended by ghosts-and-graveyard task 13.1 (CR-S2): the left and right bands are now used by the ghosts, the Overflow_Mark (right band, y 838..864) and the Door (left band, y 805..890). No scene layer changes.* A `lit` state whose time is up but not yet settled draws a body of height 0 and no stub for a frame, until the next tick settles it.

### 5.5 Drips

Drips are the quarter counter (R4), so each one has to read as a drip on its own, at desktop and at 360 x 640. A drip is a **rounded runnel of wax** with a bead at its end, hanging from the rim and travelling with it (children of `.head`). It is a filled shape with a thin outline (`--wax-ivory` fill, `--wax-shade` stroke), not a bare line, so it shows against the candle and against the dark. `dripPath(cx, length, width)` in `room.ts` draws it: a neck that is 0.68 of the bead wide, flaring into a round bead, from `DRIP_TOP_Y` (478, just above the rim) down by `length`. The specs are in `constants.ts` (`DRIPS`):

| Drip | Centre x | Length (units) | Bead width | Where |
|---|---|---|---|---|
| 1 | 272 | 78 | 18 | left edge: the runnel stays on the wax, the bead bulges out of the outline |
| 2 | 328 | 112 | 18 | right edge: the longest, same bulge on the right |
| 3 | 296 | 58 | 15 | down the front, the shortest |

The lengths all differ, so at the half (two drips) the right one is clearly longer than the left. At 360 x 640 (scale 0.6) the beads are about 11 px wide and the runnels 33 to 67 px long. The longest drip ends 112 units below the rim, so on a whole candle it stops at y = 590, and the floor line clips it when the rim is low.

Drip `n` is shown when the model's `drips >= n`. In CSS, with a number: `transform: scaleY(clamp(0, calc(var(--drips) - (n - 1)), 1)); transform-origin: 50% 0%; transform-box: fill-box;`. The `.lit` group's clip at the floor line (y = 900) keeps drips from running below the candle's base. Drips hang from the rim and travel with it for a reason (Decision P7): fixed marks on the side would be clipped as the wax burns past them, so the visible drip count would fall, which R4.2 forbids. When `animateDrips` is true, a transition on `transform` runs the new drip down over 3.5 seconds; otherwise it appears at once (R4.3, R4.4). After a reload the first paint has no transition (section 6.5), so existing drips appear whole (R4.5).

### 5.6 The flame

Four stacked groups inside `.head`, from the outside in:

1. `.flame-flicker`: `rotate(calc(var(--flicker-lean) * 1deg))` and `scaleY(calc(1 + var(--flicker-height)))`, origin at the base. No transition (it changes every frame).
2. `.flame-shape`: `scale(var(--flame-height))` from the base. A 500 ms transition when `data-ease="true"`.
3. Two flame sets: `.flame-amber` (opacity `calc(1 - var(--flame-blue))`) and `.flame-blue` (opacity `var(--flame-blue)`), each a layered teardrop of two or three radial gradients (outer, mid, core).
4. `.flame-ragged`: a second outline with a lean and a ragged tip, opacity `var(--flame-ragged)`. The plain teardrop's opacity is `calc(1 - var(--flame-ragged))`.

`.halo` radius and opacity follow `clamp(0, var(--flame-glow) + var(--flicker-glow), 1)`. Its colour follows the flame's: both gradient stops are `color-mix(in srgb, var(--flame-blue-outer) calc(var(--flame-blue) * 100%), var(--halo))`, so the halo is amber while the flame is amber and blue while it is paused (one colour for flame and halo). It reads `--flame-blue` only for the colour; `.halo` stays the only reader of the glow.

The wisp (`.smoke-wisp`) is a still S-curve drawn above the wick in `--smoke`. With `data-animate-smoke="true"` it sways (a looping 7 s ease-in-out alternate rotation of a few degrees). It never fades out, so an ended session keeps its mark (R9.3). `.ember` is the cooling glow (section 5.7).

### 5.7 The cooling glow

`.ember` is a radial gradient glow on the wick tip (`EMBER` in `constants.ts`: centre (300, 456), **radius 15**), with opacity `var(--cooling)`. The gradient has three stops, `--ember` at opacity 1 at the centre, 0.8 at 55 percent and 0 at the edge, so it reads as a warm glow on the stub's rim in `candle-burned-out-*` at 360 x 640 as well (the first version, radius 8 with a two-stop fade, read as a dot). It is drawn under the smoke wisp, so the wisp crosses it. It shows the break ("the wax cools", brief section 3), see 17.3. It is a still shape and colour, so it shows in reduced motion (R8.5). With `data-ease="true"` it fades in and out over 800 ms. `--cooling` is 1 while `isBreak` is true and 0 otherwise. It changes nothing else.

### 5.8 Dawn

When `--dawn` is 1: the window's dawn pane is fully shown, `.dawn-wash` is fully shown above the night layer, `.zone-dawn` is fully shown, and the candle is the stub (`--stub` is 1). `.night` is not faded (Decision F4); the wash is layered above it, so each layer shows one thing. With `data-ease="true"` the change eases in over 3 seconds. The dawn differs from the dim idle room in colour (cool and warm wash against blue-black), in brightness, and in the window (R8.4). The dawn does not depend on the break (Decision Q3).

## 6. The renderer

### 6.1 API

```ts
export interface Scene { apply(model: SceneModel): void; }
// Amended by ghosts-and-graveyard task 13.1 (CR-S1): apply(model: SceneModel, extra?: { labelSuffix: string }): void;
export function createScene(root: HTMLElement): Scene
```

`createScene` sets `root.innerHTML = ROOM_SVG` (a constant string), `root.setAttribute("role", "img")`, and adds the class `candle-scene`. It returns `apply`.

### 6.2 What `apply` writes

`apply` writes only custom properties and data attributes on `root` (R11.5). Each value is written only if it changed since the last call. No branching on phase, time or wax (R11.6): it is a table-driven copy.

| Model field | Written as | Consumed by |
|---|---|---|
| `waxHeight` | `--wax-height` | `.body` scale, `.head` translate, `.pool` position |
| `drips` | `--drips` | `.drip-1..3` scale |
| `flameHeight` | `--flame-height` | `.flame-shape` scale |
| `flameBlue` | `--flame-blue` | `.flame-amber` and `.flame-blue` opacity |
| `flameRagged` | `--flame-ragged` | `.flame-ragged` and teardrop opacity |
| `flameGlow` | `--flame-glow` | `.halo` only |
| `smoke` | `--smoke` | `.smoke-wisp` opacity |
| `stub` | `--stub` | `.stub` opacity |
| `lightRadius` | `--light-radius` | `.pool` scale |
| `dawn` | `--dawn` | `.window-dawn`, `.dawn-wash`, `.zone-dawn` |
| `cooling` | `--cooling` (`1` or `0`) | `.ember` opacity |
| `flickerLean` | `--flicker-lean` | `.flame-flicker` rotation |
| `flickerHeight` | `--flicker-height` | `.flame-flicker` scale |
| `flickerGlow` | `--flicker-glow` | `.halo` only |
| `phase` | `data-phase` | hook for later specs; no rule here |
| `flameMode` | `data-flame` | hook; the e2e tests assert it |
| `animateDrips`, `animateSmoke`, `animateEase` | `data-animate-drips`, `data-animate-smoke`, `data-ease` (`"true"`/`"false"`) | CSS transitions and animations |

Numbers are written with `String(value)`; booleans are converted by the table (`true` becomes `1` for `--cooling`, `"true"` for data attributes).

### 6.3 Pool intensity

The pool's intensity is constant (Decision F4), so there is no idle rule and no rule on the flame glow. In `idle` the pool is at radius `LIGHT_MIN` like the end of a candle, a small patch around an unlit candle.

### 6.4 The accessible name (R12)

`root` has `role="img"`. `apply` sets `aria-label` from `STRINGS.scene[model.flameMode]` only when `flameMode` changes. It does not include the time. *Amended by ghosts-and-graveyard task 13.1 (CR-S1): when `apply` is given `extra`, the label is `STRINGS.scene[mode] + " " + extra.labelSuffix + "."` and is rewritten when the mode or the suffix changed; without `extra` it is as described here. The model, the flame modes and the light radius do not change.* This is the one attribute besides custom properties and data attributes that the renderer writes (R12 allows it). New strings in `src/strings.ts`:

```ts
scene: {
  unlit: "An unlit candle.",
  steady: "The candle burns.",
  paused: "The flame is low and blue.",
  guttering: "The flame gutters.",
  smoke: "Smoke curls from the wick.",
}
```

### 6.5 First paint without transitions

The renderer counts its calls. On the first call it sets `data-settled="false"`; on the second it sets `"true"`. All CSS transitions and animations are conditioned on `[data-settled="true"]`. So a reload at any state draws that state whole, with no run, ease or sway from the defaults, and the renderer needs no timer (R1.3). `main.ts` calls `apply` every frame, so the second call follows within a frame.

## 7. The stylesheet (scene.css)

### 7.1 Palette (named custom properties on `.candle-scene`)

| Property | Value | Used for |
|---|---|---|
| `--room-night` | `#05070d` | the dark outside the pool |
| `--room-bg-darkest` | `#05070d` | **handoff (R7.7):** the darkest room background |
| `--room-bg-brightest` | `#566683` | **handoff (R7.7):** the brightest room background |
| `--zone-bg-darkest` | `#080b12` | **handoff (R7.8):** the time-text zone at rest |
| `--zone-bg-brightest` | `#4b4358` | **handoff (R7.8):** the time-text zone at dawn |
| `--wall-top` | `#14192a` | lit wall, top |
| `--wall-low` | `#3a2a1c` | lit wall, low (amber-lit) |
| `--wax-ivory` | `#efe6cf` | wax, and the reference brightness for the time text |
| `--wax-shade` | `#cfc2a2` | wax shading, drips |
| `--flame-amber-outer` | `#ff9b2f` | amber flame, outer |
| `--flame-amber-mid` | `#ffc25a` | amber flame, mid |
| `--flame-core` | `#ffe9b0` | flame core |
| `--flame-blue-outer` | `#4b86e8` | blue flame, outer |
| `--flame-blue-core` | `#cfe3ff` | blue flame, core |
| `--halo` | `#ffb347` | halo |
| `--smoke-colour` | `#8a93a6` | the wisp (`--smoke` is the 0 or 1 number the renderer writes) |
| `--ember` | `#ff7a2e` | cooling glow |
| `--window-moon` | `#1a2540` | window pane at rest, top of the moonlight gradient: constant, faint |
| `--window-night` | `#0d1424` | window pane at rest, bottom of the gradient: constant, faint |
| `--window-dawn` | `#566683` | window pane at dawn (equals the brightest room background) |
| `--dawn-cool` | `#4a5a78` | dawn wash, top |
| `--dawn-warm` | `#5a4a52` | dawn wash, low |
| `--dawn-alpha` | `0.85` | alpha of both wash stops |

There is no `--floor`, `--table` or `--dish`: the table and dish are gone, and the floor is the zone (Decisions F1, F2). The final names are fixed in the tasks.

### 7.2 The contrast handoff (R7.7, R7.8)

The scene reserves one place for the time text, the **time-text zone** (Decision F2): the band below the floor line, with the text area at x 110..490, y 900..1000 in room units, marked by `.zone-text-area` (5.2). It has its own two backgrounds, published as `--zone-bg-darkest` (every state except the dawn) and `--zone-bg-brightest` (the dawn). Nothing lit can enter the zone: the lit group is clipped at the floor line, the night layer and the pool end there, and the zone is the topmost layer (5.2). So the flame, its halo, the drips, the smoke and the light pool never sit behind the text, at any wax height.

Contrast figures, from the WCAG relative luminance formula (ivory `#efe6cf` has luminance 0.7945):

| Pair | Ratio |
|---|---|
| ivory on `--zone-bg-darkest` `#080b12` | 15.83 |
| ivory on `--zone-bg-brightest` `#4b4358` | 7.53 |
| ivory on `--room-bg-darkest` `#05070d` | 16.20 |
| ivory on `--room-bg-brightest` `#566683` | 4.66 |
| ivory on the dawn wash over the night layer, cool end (`#404E68`) | 6.74 |
| ivory on the dawn wash over the night layer, warm end (`#4D4048`) | 7.88 |

Every ratio is at least 4.5:1. The two zone ratios are the ones the time text meets. A mix of the two zone colours during the 3 second dawn ease has a luminance between them, so its ratio is between 7.53 and 15.83.

For the window pane at rest (not text, visibility only), after the render check made the first pane much dimmer and closer to the wall: the top stop `--window-moon` `#1a2540` against `--room-night` is 1.33:1 and against `--wall-top` it is 1.15:1; the bottom stop `--window-night` `#0d1424` against `--room-night` is 1.10:1; the two stops differ by 1.21:1. The first pane (`#233152`) was 1.57:1 against the night. The pane is faint, constant and soft-edged, and still visible, so the dawn reads as the window lighting up. At dawn the pane (`#566683`, drawn above the wash since the review in 17.3) against the wash behind it (`#404E68` at the top, over the night layer) is 1.45:1, so the pane is lighter than its surroundings and visibly lights up; before the reorder the wash tinted the pane and the difference was about 1.1:1. Both stops lie between the room bounds, so every contrast figure in the table above stays valid.

**Handoff for `controls-and-access`:**

- Put the time text inside the zone text area (`.zone-text-area`, x 110..490, y 900..1000 in room units; on a 360 by 640 phone that is a band about 60 px tall across the middle). Do not put it over the candle, the flame or the window.
- The time text must be at least as bright as ivory (`#efe6cf`): relative luminance 0.7945 or more. With that, it meets at least 7.53:1 against the zone in every state. Dimmer text may fail at the dawn colour.
- The reserved edge bands (x 0..110 and 490..600) stay free for the ghosts, the door and the controls.

The room bounds cover every background colour the scene paints above the floor line. The flame core and halo are brighter than the room bound; they are small, sit around the flame, and are kept out of the zone by the clip. A palette test (12.3) reads `scene.css` and checks all of the above.

## 8. Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  .candle-scene, .candle-scene * {
    animation: none !important;
    transition: none !important;
  }
}
```

- This holds before the first model is applied (R9.5).
- The model side is separate: `main.ts` reads `matchMedia("(prefers-reduced-motion: reduce)")`, passes `reducedMotion` in the options, and re-reads it on the `change` event (R9.4). The flicker values become 0 and the three `animate*` flags become false.
- What remains in the still version: wax height, three drip shapes, the stub, flame size/colour/shape per mode, pool radius, the window and wash at dawn, the wisp as a still curve, the ember dot.

## 9. Responsive behaviour (summary)

Section 5.1 covers scaling. The Playwright tests check, at 360x640, 768x1024, 1280x800 and 1920x1080 (R10.1): no scrollbar, and `.candle` and `.flame-shape` bounding boxes fully inside the viewport.

## 10. Minimal `main.ts` wiring (R13.1)

```ts
import { INITIAL_STATE, step } from "./engine";
import type { Event, State } from "./engine";
import { browserStore, createStorage } from "./storage/storage";
import { createScene, sceneModel } from "./scene";
import "./scene/scene.css";
import { STRINGS } from "./strings";

const storage = createStorage(browserStore());
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

const root = document.getElementById("app");
if (root) {
  // the existing placeholder h1 and tagline are still created here, with class "visually-hidden" (section 10.1)
  const sceneRoot = document.createElement("div");
  sceneRoot.id = "scene";
  root.prepend(sceneRoot);
  const scene = createScene(sceneRoot);

  let state: State = step(INITIAL_STATE, { type: "reload", state: storage.load() }, Date.now());
  const dispatch = (event: Event, now: number): void => {
    const next = step(state, event, now);
    if (next !== state) { storage.save(state, next); state = next; }
  };

  const frame = (): void => {
    const now = Date.now();
    dispatch({ type: "tick" }, now);
    scene.apply(sceneModel(state, now, { reducedMotion: reduced.matches }));
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
```

- `main.ts` owns `Date.now()` and `requestAnimationFrame`; no file in `src/scene/` does (R1.3).
- `dispatch` is the one place that calls `step` and `save`. Later specs add controls and the visibility wiring (`distraction-tracking` R11.3) by calling it. This spec adds no controls and no visibility handling.
- The first `step` with a `reload` event settles a stored session whose time ran out while the page was closed (session-engine R9.2). The first `save` writes the settled state.
- The redraw runs every animation frame. A throttled tab draws less often, but the next frame reads the right `now`, so time cannot drift (R1.3).
- `reduced.matches` is read each frame, so a change of the setting while the page is open applies on the next frame. No `change` listener is needed.
- Storage is unavailable or full: `createStorage` already tolerates it.

### 10.1 The placeholder heading

The current `main.ts` writes a visible `h1` and a tagline. The scene shows no text (R11.4), and the controls spec owns the visible text. So the placeholder `h1` and tagline stay in the DOM, still read by screen readers, with the class `visually-hidden`, defined in `scene.css` (the standard clip technique, 1 px box, not `display: none`). The existing smoke test (`getByRole("heading")` visible) keeps passing, and the screenshots are text-free. See Decision P3.

## 11. Browser tests (e2e/scene.spec.ts)

### 11.1 Fixtures (R13.2)

A helper builds each fixture in Node with the engine only, never hand-written JSON:

```ts
import { INITIAL_STATE, serializeHistory, serializeSession, step } from "../src/engine";
import { HISTORY_KEY, SESSION_KEY } from "../src/storage/storage";

const T0 = Date.UTC(2026, 10, 10, 20, 0, 0);          // fixed start of the session
const MIN = 60_000;

function lit(lengthMin = 25) { return step(INITIAL_STATE, { type: "light", length: lengthMin }, T0); }
```

| Fixture | Built by | Faked clock (`now`) |
|---|---|---|
| `idle` | nothing stored | `T0` |
| `lit-start` | `lit()` | `T0` |
| `lit-half` | `lit()` | `T0 + 12.5 * MIN` |
| `lit-last-minute` | `lit()` | `T0 + 24.5 * MIN` (30 s left) |
| `paused` | `step(lit(), pause, T0 + 10 * MIN)` | `T0 + 11 * MIN` |
| `burned-out` | `step(lit(), tick, T0 + 25 * MIN)` | `T0 + 26 * MIN` (inside the break) |
| `snuffed` | `step(lit(), snuff, T0 + 7 * MIN)` | `T0 + 8 * MIN` |

Each stored fixture is `serializeSession(state)` under `SESSION_KEY` and `serializeHistory(state.history)` under `HISTORY_KEY`, written with `page.addInitScript` before the page loads. The key names come from the storage adapter's exports. The session document version is whatever the engine writes at the time (1 now, 2 after `distraction-tracking`), which is why the fixtures use the serializers (Decision Q5).

A second set checks the reload settle: a stored `lit` session whose clock is past completion draws the dawn; a stored `paused` session past the pause limit draws smoke. And `burned-out` is also checked at `T0 + 31 * MIN` (after the break) for `--cooling: 0`.

Importing `../src/engine` from a Playwright test relies on Playwright resolving extensionless TypeScript imports in an ESM package. The first task checks this; the fallback is to build the fixture strings in a small Node script run by `globalSetup`.

### 11.2 The faked clock and determinism

```ts
async function showAt(page, fixture, now, opts?: { reducedMotion?: boolean }) {
  if (opts?.reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(storeFixture, fixture);          // sets localStorage keys
  await page.clock.install({ time: now - 1100 });
  await page.goto("/");
  await page.clock.pauseAt(now - 100);                      // freeze just before the instant
  await page.clock.runFor(100);                             // a few animation frames, ending exactly at `now`
}
```

The clock is frozen, `requestAnimationFrame` frames are driven by `runFor`, and the flicker is a pure function of the frozen `now` and the default seed. The same fixture therefore draws the same pixels every time. The page loads 1.1 s before `now` and the clock then runs to exactly `now`, so "30 s left" means exactly that when the assertions and the screenshot are taken. For `lit-start` the page loads 1.1 s before the session starts; the engine counts a backwards clock as zero burn (session-engine R4.5), so the wax is whole.

### 11.3 Assertions (R13.7)

For each fixture the test waits for `data-settled="true"` on `#scene` and for finished transitions (`await Promise.all(document.getAnimations().map((a) => a.finished))`), then reads the root's `data-flame`, `data-phase`, and the computed custom properties (as numbers, with `toBeCloseTo`):

| Fixture | `data-flame` | `--wax-height` | `--drips` | `--light-radius` | `--dawn` | `--cooling` | `--smoke` | `--stub` |
|---|---|---|---|---|---|---|---|---|
| `idle` | `unlit` | 1 | 0 | 0.2 | 0 | 0 | 0 | 0 |
| `lit-start` | `steady` | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| `lit-half` | `steady` | 0.5 | 2 | 0.6 | 0 | 0 | 0 | 0 |
| `lit-last-minute` | `guttering` | 0.02 | 3 | 0.216 | 0 | 0 | 0 | 0 |
| `paused` | `paused` | 0.6 | 1 | 0.68 | 0 | 0 | 0 | 0 |
| `burned-out` (in break) | `smoke` | 0 | 0 | 0 | 1 | 1 | 1 | 1 |
| `burned-out` (after break) | `smoke` | 0 | 0 | 0 | 1 | 0 | 1 | 1 |
| `snuffed` | `smoke` | 0 | 0 | 0 | 0 | 0 | 1 | 1 |

Also:

- `aria-label` equals the string for the mode (R12); `role="img"`; with reduced motion on, `--flicker-*` are 0 and `data-ease`, `data-animate-drips`, `data-animate-smoke` are `"false"`.
- At the four viewports there is no scrollbar (`scrollWidth <= clientWidth`, same for height) and `.candle` and `.flame-shape` lie inside the viewport.
- **Candle height is proportional (F6).** For `lit-start`, `lit-half`, `lit-last-minute` and `paused`, the bounding-box height of `.body` divided by its height at `lit-start` equals `--wax-height` (within 0.01), and `.stub` has computed opacity 0. For `burned-out` and `snuffed`, `.body` has height under 1 px and `.stub` has opacity 1.
- **The zone stays clear (F5).** For every fixture, the screenshot region of `.zone-text-area` is decoded in the page (`createImageBitmap` and a canvas, test code only). Every pixel is within 2 per channel of `--zone-bg-darkest`, or of `--zone-bg-brightest` in the dawn fixtures. `lit-last-minute` is the case that matters, because the flame and halo are at their lowest there.

### 11.4 Screenshots (R13.3 to R13.5)

Names: `docs/screenshots/candle-<state>-<size>[-reduced].png`, with state in `idle`, `lit-start`, `lit-half`, `lit-last-minute`, `paused`, `burned-out`, `snuffed` and size in `desktop` (1280x800) or `phone` (360x640). The set is 7 x 2 = 14, plus the 7 reduced-motion shots at desktop (`candle-lit-half-desktop-reduced.png`, and so on): 21 files. The `burned-out` shot is taken inside the break, so it shows the dawn and the ember. The tests write the files with `page.screenshot({ path })`. They do not compare pixels; a wrong state is caught by the assertions above (R13.7).

Following `scene.md`, any later change to what a user sees retakes the affected screenshots, and the task summary names them.

## 12. Unit tests, purity and palette

### 12.1 Example-based tests (`model.test.ts`, `flicker.test.ts`, `types.test.ts`)

- Flame mode at time left 60 001, 60 000, 59 999 and 0 ms (lit), at 0 for paused, and in the last minute for paused.
- Drip count at wax 0.76, 0.75, 0.5, 0.25 and 0.0, and 0 in idle and in the ended phases.
- Idle: wax 1, no flame, light radius 0.2, drips 0, stub 0. Burned-out: wax 0, dawn 1, light 0, smoke 1, stub 1. Snuffed: wax 0, dawn 0, light 0, smoke 1, stub 1.
- The stub (F6): `stub` is 0 in idle, lit and paused at every wax height, including wax 0.02 and a lit state whose time left is 0; it is 1 in burned-out and snuffed.
- Candle height (F6): the pure helper `candleHeightUnits(model)` (in `model.ts`) gives `CANDLE_H * waxHeight` while `stub` is 0 and `STUB_H` when it is 1. Over a sweep of wax heights, `candleHeightUnits / waxHeight` is the constant `CANDLE_H` (420), so the drawn height is exactly proportional. `CANDLE_H` is 420, `FLOOR_Y` is 900, `STUB_H` is 28.
- The reference table of flicker for seed 20261031 at 8 instants (hard-coded numbers, to catch an accidental change of the hash or steps), for each mode.
- R5.6 on `FLAME_LOOK`: any two of `steady`, `guttering`, `paused` differ in at least two of size, colour, shape; and `unlit` vs `smoke` differ in the candle (`stub`), light radius and `smoke` (section 3.3, Decision P1).
- `cooling` is true at the end instant and 299 999 ms after, false at `breakEndsAt` and later.

### 12.2 Purity test (`purity.test.ts`)

Reuses the technique of the engine's purity test (comment stripping, whole-word matches):

- **Model files** (`types.ts`, `constants.ts`, `flicker.ts`, `model.ts`): none of `window`, `document`, `localStorage`, `Date.now`, `performance`, `Math.random`, `matchMedia`, `setTimeout`, `setInterval`, `requestAnimationFrame`; no imports from `storage`, `ui`, `audio`, `distraction`; the only engine import is `../engine` (the index), and only `timeLeftMs`, `waxFraction`, `isBreak` and the `State` type.
- **Every non-test file in `src/scene/`**: no `Date.now`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame` (R1.3); no import of `test-kit`.
- **`render.ts`**: no import from `../engine`.
- **`model.ts`**: does not mention `.session`, `.litSince`, `.pausedAt`, `.history`, `.endedAt` or `.breakEndsAt` (R1.2).

### 12.3 Stylesheet and markup tests (`scene.css.test.ts`, `room.test.ts`, node)

- The file contains an `@media (prefers-reduced-motion: reduce)` block that sets `animation: none` and `transition: none`.
- Every custom property listed in section 6.2 is used by at least one rule (so the renderer never writes a property nobody reads).
- **Palette test.** Parse the colours in `scene.css`:
  - Every background colour stop (`--room-night`, `--wall-*`, `--window-*`, and `--dawn-*` composited over `--room-night` at `--dawn-alpha`) has a relative luminance between that of `--room-bg-darkest` and `--room-bg-brightest`.
  - `--wax-ivory` against `--room-bg-darkest`, `--room-bg-brightest`, `--zone-bg-darkest` and `--zone-bg-brightest` is at least 4.5:1 in each case. The test also asserts the four figures to two decimals (16.20, 4.66, 15.83, 7.53), so a palette edit that changes the handoff shows up.
  - The resting window: `--window-moon` against `--room-night` is 1.33, against `--wall-top` 1.15, and `--window-night` against `--room-night` is 1.10 (asserted to two decimals; at least 1.25, 1.1 and 1.08), the top is lighter than the bottom and dimmer than the first pane, and each colour is declared once and no state rule changes the resting pane.
  - The drips are filled wax with an outline, not a bare stroke.
- **Markup test** on `ROOM_SVG`:
  - `.zone` is the last layer; `.lit` carries `clip-path: url(#cw-above-floor)` and that clip path covers the stage only above y = 900; `.halo` is inside `.lit`.
  - `.wall` and `.night` end at y = 900.
  - There are no `.table`, `.dish` or `.floor` elements, and the window has only its two pane rects (no frame): portrait (120 x 210), blurred in sRGB, with the vertical gradient.
  - The three drips have different lengths of at least 50 units; the two side beads bulge out of the candle's outline; `dripPath` hangs from the rim and ends in a bead at the drip's length.
  - `.pool` has no opacity rule and `.night` has no rule that reads `--dawn` or `--flame-glow` (F4).
  - `.stub` takes its opacity from `--stub`; `.body` is `scaleY(var(--wax-height))` and its full height is `CANDLE_H` (F6).
- No `url(` for a raster file, no `<img>`, `<canvas>` or `image` element in `room.ts` (R11.1).

## 13. How P1 to P8 are generated

All properties use `numRuns: 300` through the engine's shared `PROP_PARAMS`, in `src/scene/model.prop.test.ts` (P1 to P3, P5 to P8) and `src/scene/flicker.prop.test.ts` (P4). Generators come from the engine's `test-kit.ts` (imported by tests only): `arbT0`, `arbScript`, `arbSignedScript`, `runScript`. The scene tests add `arbNow` (finite values near a run's times, large, negative, plus `NaN`, `Infinity`, `-Infinity`), `arbSeed` (any double) and `arbReduced` (boolean).

Each run: draw `t0` and a script, run it with `runScript`, and evaluate the model on `trace[i].after` at `trace[i].now`.

| ID | Generation | Assertion |
|---|---|---|
| P1 | `arbScript` (non-decreasing time, includes pause, resume, snuff, tick, reload, light). For each trace entry whose `after` is `lit` or `paused`, and for probe offsets `d >= 0` drawn per entry. | `model.waxHeight === waxFraction(after, now)` exactly. For two consecutive entries that are both running in the same session (equal `session.startedAt`), `wax(i+1) <= wax(i)` and `drips(i+1) >= drips(i)`. For the same state, `wax(now + d) <= wax(now)` and `drips(now + d) >= drips(now)`. While `paused`, wax and drips equal those at the anchor for every probe. |
| P2 | Same traces. Collect `(waxHeight, lightRadius)` of every running sample in the run. | Sort by wax: light radius is non-decreasing. Along the trace and along probes, `lightRadius` never grows within a session, and it is constant over probes while paused. `LIGHT_MIN <= lightRadius <= 1` while running. |
| P3 | Two parts. (a) Build pairs of lit states with different lengths, intents and different earlier history (a script prefix that ends sessions), each probed at `now` so that time left equals a drawn `T` (from a boundary-biased set: 0, 1, 59 999, 60 000, 60 001, then arbitrary up to the shorter length); also paused states with the same time left. (b) Pool all samples of a run into a `Map` keyed by `(phase, timeLeftMs)`. | In (a) both states give the same `flameMode`. In (b) every key maps to exactly one mode. In both, the mode equals an independent oracle in the test (a plain `if` table of R5.1) for all five phases. |
| P4 | `fc.tuple(arbSeed, arbNow, arbMode)`, plus small `d` (1 to 5 ms) and a second seed. | Calling twice gives equal values. Every value is finite and in range. All three are exactly 0 for `unlit` and `smoke`. `sceneModel` for two different states of the same mode, same `now`, same seed gives the same flicker fields. `|f(now + d) - f(now)| <= 3 * A * d / step` per channel, plus the dip term `0.45 * (pi / 2) / 200 * d` for height and `0.9 *` that for glow in `guttering`. Different seeds give different flicker at most instants (checked on a fixed 200-instant grid: not all equal). |
| P5 | Any trace sample, `arbNow`, `arbSeed`, both values of `reducedMotion`. | The two models are deep equal after removing `MOTION_FIELDS`. With `reducedMotion: true` the three flicker values are 0 and the three flags are false. |
| P6 | Trace samples and extra states from `arbWildScript` (invalid events included), with `arbNow` and `arbSeed`. | No throw. Every number is finite and inside `RANGES`; `drips` is 0, 1, 2 or 3; `stub` is 0 or 1; `flameMode` and `phase` are in their unions; booleans are booleans. |
| P7 | The same samples. The input state is deep-frozen (recursively) before the call, then compared to a `structuredClone` taken before. | Two calls give deep-equal models. The input equals its clone afterwards. Every model value is a number, a boolean, or one of the two fixed unions (no other string, no object, no array). |
| P8 | Trace samples at `arbNow` probes including times inside and after the break. | `dawn === 1` iff `phase === "burned-out"`, whether or not the break is in progress. `lightRadius === 0` iff the phase is `burned-out` or `snuffed`. `stub === 1` iff the phase is `burned-out` or `snuffed` (F6). `cooling === isBreak(state, now)`. For a burned-out state, the models at an instant inside the break and at an instant after it differ only in `cooling` (the flicker of `smoke` is 0, so `now` changes nothing else). |

A mutation check like the engine's is planned in the tasks: remove the `paused` case from `flameModeOf`, change `<=` to `<` in the drip test, make `lightRadius` grow with the flicker, call `Math.random` in the hash, and drop one `MOTION_FIELDS` entry from the reduced path. Each must be caught by at least one property or example.

## 14. Traceability

| Requirement | Where |
|---|---|
| R1 selectors only, no clock | 1.2, 3, 10, 12.2 |
| R2 pure, total, bounded | 2, 3, 12.2, P6, P7 |
| R3 candle and wax | 3.2, 5.2, 5.4, P1 |
| R4 drips | 3.2, 5.5, 6.5, P1 |
| R5 flame | 3.3, 5.6, 12.1, P3 |
| R6 seeded flicker | 4, P4 |
| R7 light | 3.2, 5.3, 7.2, P2 |
| R8 dawn and cooling | 3.2, 5.7, 5.8, P8 |
| R9 reduced motion | 3.4, 8, P5 |
| R10 responsive | 5.1, 5.4, 9 |
| R11 look and construction | 5, 6.2, 7, 12.3 |
| R12 accessible name | 6.4 |
| R13 wiring and tests | 10, 11, 12 |

## 15. Order of work and files touched

- The code tasks run after `distraction-tracking` is complete (R13.9). Writing the tasks does not have to wait.
- Files created or changed by the code tasks: everything under `src/scene/`, `src/main.ts`, `e2e/scene.spec.ts`, `docs/screenshots/` and the five strings in `src/strings.ts`. Nothing in `src/engine/` or `src/storage/` changes. `index.html`, `playwright.config.ts`, `package.json` and the steering files do not change, and no dependency is added.
- The costume review (R13.8): `costume-reviewer` reviews this design in the Kiro CLI (`kiro-cli chat --agent costume-reviewer`) before it is approved, and the finished scene before the spec closes. Findings are recorded under Decisions.

## 16. Points for review

None. P1 is closed (accepted); see Decisions.

## 17. Decisions

### 17.1 Review answers

- **P1. `unlit` vs `smoke` at flame level: accepted.** R5.6 is read at scene level for this one pair. The whole still scene differs: a whole candle, a small pool and no wisp, against a stub, no pool and a wisp (section 3.3, 12.1).
- **P2. Furniture: closed, with the costume-reviewer's verdict.** The wall is kept as the substrate of the light pool, the window pane is kept, the table and the dish are removed (F1), and the floor becomes the time-text zone (F2). See 17.2.
- **P3. Placeholder heading:** yes. The `h1` and tagline become visually hidden and are still read by screen readers (section 10.1).
- **P4. Strings:** yes. The five accessible names go in `src/strings.ts` (section 6.4).
- **P5. Flame brightness: accepted, then superseded by F5.** The contrast bound covers backgrounds, not the flame or its halo. The handoff note that said to keep the text clear of the candle column is replaced by the time-text zone, which the flame and halo cannot enter (section 7.2).
- **P6. Playwright imports:** yes. The first code task proves that Playwright resolves the engine and storage imports in the fixtures. If it does not, the `globalSetup` fallback in section 11.1 is used.
- **P7. Drips follow the rim:** yes. The reason: fixed drips would be clipped as the wax burns past them, so the visible drip count would fall, which R4.2 forbids (section 5.5).

### 17.2 Costume review (R13.8)

The review was done in the Kiro CLI against the three rules of the `costume-reviewer` agent (`.kiro/agents/costume-reviewer.json`), on the previous draft of this design. The default CLI agent applied those rules; the agent itself was not launched with `--agent costume-reviewer`, so task 23 runs it on the finished scene. **Verdict: CHANGES NEEDED, then applied.** It checked the three rules: every element shows one piece of state; the reduced-motion version still shows it; the time text keeps WCAG AA contrast. Rule 2 passed. Each finding and its fix:

- **F1. Table and dish were decoration only (rule 1).** They showed no state; their only jobs were to be a surface and the drip clip line. *Fix:* both are removed (layer 5 of the old design, `--table`, `--dish`). The candle stands on the floor line (y = 900), which is also the drip clip line (5.2, 5.4, 5.5).
- **F2. The floor was a separate rect with no state (rule 1), and there was no usable place for the time text (rule 3, F5).** *Fix:* the floor band below y = 900 is kept and declared the **time-text zone** that `controls-and-access` will use. The wall stays only as the substrate the pool reveals (5.2, 7.2).
- **F3. The window at rest was an invisible dark rectangle (rule 1).** The dawn would then read as something appearing, not as the window lighting up. *Fix:* the pane has a faint, constant night colour, drawn above the night layer so it stays visible in the dark. It is constant and carries no state. Only the pane is drawn: no frame, sill or curtain (5.2, 7.2). *Refined after the render check:* the first version (`#233152`, a flat 220 x 180 rectangle) read as a hard blue square. It is now a portrait pane (120 x 210) with soft edges and a vertical moonlight gradient (`--window-moon` `#1a2540` to `--window-night` `#0d1424`), much dimmer and closer to the wall: 1.33 and 1.10 against the night, 1.15 at the top against the wall.

- **Drips (refined after the render check).** At the half the first drips looked like a slight widening near the top, not two drips. They are now filled runnels with a bead at the end, three different lengths (78, 112, 58), the two side beads bulging out of the candle's outline (5.5).
- **F4. Two elements showed two things (rule 1).** The pool's opacity followed the flame glow, so the pool showed progress and flame state; the night layer was faded by the dawn, so it showed progress and completion. *Fix:* the pool's opacity is constant (it shows progress only, by its radius), and the dawn is a wash layered above the night layer; the night layer is not faded (5.2, 5.3, 5.8, 6.2).
- **F5. No usable place for the time text (rule 3).** The contrast bounds held (ivory on `#05070d` 16.20, on `#566683` 4.66), but the candle column and the reserved edge bands left no room on a phone, and the flame halo is brighter than the bound. *Fix:* the zone has its own darkest and brightest background (`--zone-bg-darkest` `#080b12`, `--zone-bg-brightest` `#4b4358`). The lit group is clipped at the floor line, the night layer and pool end there, and the zone is the topmost layer, so the flame, halo and pool never enter it at any wax height. The contrast of ivory is 15.83 against the darkest and 7.53 against the brightest, both at least 4.5:1. The time text must be at least ivory in brightness (relative luminance 0.7945). The zone is in the contrast handoff (7.2) and in the palette test (12.3), and a pixel test checks it is clear (11.3).
- **F6. The candle was not exactly proportional to the wax (rule 1).** A fixed 28-unit stub was always drawn under the body, so the drawn height was 28 + 392 h, not h (R3.6, brief section 4). *Fix:* the candle's drawn height is exactly `420 * waxHeight`. The fixed stub is drawn only in `burned-out` and `snuffed`, through a new model field `stub` (0 or 1) and `--stub`. The formulas (3.2), the geometry (5.4), the unit tests (12.1) and the e2e assertions (11.3) are updated.

Accepted by the reviewer, no change: three drips instead of four (Q4), and the reduced-motion version (rule 2: every state keeps a still form in size, colour or shape).

### 17.3 Costume review of the finished scene (task 23, R13.8)

The review of the finished scene was run with the `costume-reviewer` agent itself (`kiro-cli chat --agent costume-reviewer`), in three passes. This is the run 17.2 said was still to come. Task 23 is done: the findings are applied.

**Pass 1. Verdict: CHANGES NEEDED.** Findings and what was done:

1. **Ember too small to read (rule 1).** In `candle-burned-out-desktop`, `-phone` and `-desktop-reduced` the cooling glow (radius 8, two stops) read as a dot, so the break was not legible. *Fix:* radius 15 (`EMBER` in `constants.ts`), centre (300, 456), and a third gradient stop at 0.8 opacity, so it reads as a warm glow on the stub's rim (5.7). Checked by `room.test.ts` (radius 14 to 16, three stops), `scene.css.test.ts` (stop opacities) and three e2e tests (size against the stub, an orange pixel beside the wick in `burned-out`, plain wax after the break, the same with reduced motion).
2. **The dawn window did not light up (rule 1).** The wash was drawn over the pane and dimmed it to about 1.1:1 against the wash. *Fix:* `.window` is drawn above `.dawn-wash` (5.2). The dawn pane keeps its colour `#566683` and is 1.45:1 against the wash behind it (7.2). No colour changed. Checked by `room.test.ts` (layer order) and an e2e pixel test (pane centre at least 30 channel units brighter than the wash beside it, and equal to `--window-dawn`).
3. **Paused halo was amber around a blue flame (rule 1).** Flame and halo showed the state in two colours. *Fix:* the halo stops mix `--flame-blue-outer` in by `--flame-blue` (5.6). Checked by `scene.css.test.ts` and e2e tests that read the computed stop colours (blue when paused, amber when steady and guttering).
4. **Flat wall (look).** *Fix proposed:* grain (withdrawn in pass 2).
5. **Drips are clipped in the last minute: accepted.** Below about 25 percent wax the rim is close to the floor line and the `.lit` clip cuts the drips off, so fewer than three are fully visible. The wax height still carries the time, and the drip count is the quarter counter only while there is wax to hang them from.

**Pass 2. Verdict: the ember, the dawn window and the paused halo fixes hold; the wall grain is decoration (rule 1).** It showed no state of its own, and `product.md` says an element that does not map to state does not ship. **The grain was proposed, judged decoration by the costume-reviewer, and removed completely:** the `GRAIN` constants, the filter, the pattern and the `.grain` rect, and every test that mentioned it. The room has no `feTurbulence` and no `<pattern>`, and `room.test.ts` checks that. The wall stays what Decision P2 made it: the surface the light pool reveals, with nothing added.

**Pass 3 (final, R13.8): PASS on the finished scene and all 21 screenshots.**

**Decisions recorded**

- **The ember maps to state although it is not a row in the brief section 4 table.** It shows the break (brief section 3, "the wax cools"), so it follows the rule that every spooky element shows one piece of state. It is a still shape and colour, so it also shows in reduced motion (R8.5).
- **The drips are clipped in the last minute: accepted**, because the wax height carries the time.
- **The grain is out** (pass 2). A flat wall is the accepted look.

All screenshots that show the lit pool or changed with these edits were retaken: idle, lit-start, lit-half, lit-last-minute, paused and burned-out, in desktop, phone and desktop-reduced.
