# Design: candle-scene

Implements `requirements.md` in this folder (R1-R13, P1-P8, Decisions Q1-Q5). Scope: a pure scene model, a thin SVG and CSS renderer, the minimal `main.ts` wiring, and the browser tests. No ghosts, graveyard, shelf, controls, time text, sound or page title.

Status: **draft for review.** Design only. Tasks are not written.

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

- `flameRagged`, `smoke` and `dawn` are 0 or 1 today but typed as numbers, so a later spec can ease them in the model without changing the renderer.
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
cooling    = isBreak(state, now)                                              // R8.5
```

Why `<=` and no rounding for drips: lengths are whole minutes, so session length in ms is a multiple of 4. A quarter mark is then a whole number of ms and `timeLeft / length` is exactly 0.75, 0.5 or 0.25 there. A mark is therefore reached at exactly the right millisecond, and P1's example tests pin 0.76, 0.75, 0.5, 0.25 and 0.

Why linear light: the requirement is "a non-decreasing function of wax height with a minimum above 0" (R7.2). Linear is the simplest function that follows the wax exactly, and it makes P2 easy to state. The perceived darkening is helped by the flame glow (section 4), not by a curve here.

Idle is a state with no session, so `frac` is 0 there; the table above is the Q1 decision. In `idle` the room is dim (`LIGHT_MIN`) and the flame is `unlit`, so the pool is faint (section 6.3).

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
- `unlit` vs `smoke`: neither has a flame, so only the shape differs at flame level (no mark vs wisp). See Point for review P1 below: the scene as a whole differs in wax height (1 vs stub), light radius (0.2 vs 0) and the wisp.
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

The renderer applies `flickerLean` as a rotation of the flame, `flickerHeight` as a vertical scale and `flickerGlow` as the strength of the flame's halo and the depth of the light pool's centre. It does not touch `lightRadius` (R7.6). The wax and the light radius have no flicker.

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

All shapes are static markup in `room.ts`. IDs are prefixed `cw-`. Classes carry the CSS hooks.

| # | Layer (class) | Contents | Shows (R11.8) |
|---|---|---|---|
| 1 | `.wall` | Large rect, vertical gradient (lit wall colours). Floor rect below y = 900. | Structure for the light to fall on. No state. |
| 2 | `.window` | A pane at x 190..410, y 70..250, drawn on the wall behind the candle. Fill is night blue; `--dawn` blends it to dawn light (opacity of a second pane). | Dawn (completion). |
| 3 | `.night` | Large rect filled `--room-night`, masked by `#cw-pool-mask` (section 5.3). Opacity `calc(1 - var(--dawn) * 0.6)`. | Progress (the dark outside the pool). |
| 4 | `.dawn-wash` | Large rect with a vertical gradient (cool at the top, warm low), opacity `var(--dawn)`. | Dawn. |
| 5 | `.table` | Dark band y 840..900 spanning the stage and beyond; a brass `.dish` ellipse at (300, 840), rx 70, ry 10. | The candle's support. No state. |
| 6 | `.candle` | `.stub` (x 268..332, y 812..840, fixed). `.body` (x 268..332, y 420..812, `scaleY(var(--wax-height))` from the bottom). | Time left. |
| 7 | `.head` | A group translated down by `(1 - var(--wax-height)) * 392px`. Contains the rim ellipse (the melt pool), `.wick`, `.drip-1..3`, the `.flame` stack and `.ember`. | Wax top follows time left. |
| 8 | `.smoke-wisp` | A curling path above the wick, inside `.head`. Opacity `var(--smoke)`. | An ended session. |
| 9 | `.halo` | Radial gradient circle around the flame, inside `.head`, opacity from flame glow. | Flame state. |

Furniture (the wall, the table, the dish, the window frame) carries no state. It is kept to the minimum needed to hold the candle and give the light something to fall on. Point for review P2 asks `costume-reviewer` to confirm.

### 5.3 The light pool

```svg
<mask id="cw-pool-mask" maskUnits="userSpaceOnUse" x="-2200" y="-600" width="5000" height="2200">
  <rect class="mask-all" x="-2200" y="-600" width="5000" height="2200"/>      <!-- white: night shows -->
  <circle class="pool" cx="0" cy="0" r="700" fill="url(#cw-pool-hole)"/>        <!-- black centre, clear edge -->
</mask>
```

- `#cw-pool-hole` is a radial gradient from opaque black at the centre, through 0.75 alpha at 60 percent, to transparent at the edge. Black in the mask removes the night, so the pool is the lit wall.
- `.pool` is moved and scaled by CSS only:
  `transform: translate(300px, calc(340px + (1 - var(--wax-height)) * 392px)) scale(var(--light-radius));`
  The pool follows the flame down the candle and its radius is `lightRadius * 700` room units (R7.2). At a whole candle the pool (700 units) covers the stage; at `LIGHT_MIN` it is 140 units.
- `.pool` opacity is `calc(0.3 + 0.7 * clamp(0, var(--flame-glow) + var(--flicker-glow), 1))`. A strong flame digs a full hole; an unlit candle (idle) digs only a faint one, so the dim room is dim, not lit.
- The vignette is not a separate layer. It is what is left of `.night` beyond the pool edge.

### 5.4 Candle geometry (room units)

| Name | Value |
|---|---|
| Candle x range | 268 to 332 (width 64, centre 300) |
| Table line | y = 840 |
| Stub | y 812 to 840 (28, always drawn) |
| Body at full height | y 420 to 812 (392) |
| Rim at wax height `h` | y = 812 - 392 h |
| Wick | 20 tall, standing on the rim |
| Flame at full height | 120 tall, base on the wick |
| Reserved edge bands | x 0..110 and x 490..600, all y, and everything beyond |

The reserved bands hold no object. They are for ghosts and the door of later specs (R10.4).

### 5.5 Drips

Three drips, each a rounded stroke hanging from the rim and travelling with it (children of `.head`):

| Drip | x on the rim | Length (units) |
|---|---|---|
| 1 | 268 (left edge) | 80 |
| 2 | 332 (right edge) | 100 |
| 3 | 284 (inside left) | 60 |

Drip `n` is shown when the model's `drips >= n`. In CSS, with a number: `transform: scaleY(clamp(0, calc(var(--drips) - (n - 1)), 1)); transform-origin: top; transform-box: fill-box;`. A clip path at the table line (y = 840) keeps drips from running below the candle at the end of a session. When `animateDrips` is true, a transition on `transform` runs the new drip down over 3.5 seconds; otherwise it appears at once (R4.3, R4.4). After a reload the first paint has no transition (section 6.5), so existing drips appear whole (R4.5).

### 5.6 The flame

Four stacked groups inside `.head`, from the outside in:

1. `.flame-flicker`: `rotate(calc(var(--flicker-lean) * 1deg))` and `scaleY(calc(1 + var(--flicker-height)))`, origin at the base. No transition (it changes every frame).
2. `.flame-shape`: `scale(var(--flame-height))` from the base. A 500 ms transition when `data-ease="true"`.
3. Two flame sets: `.flame-amber` (opacity `calc(1 - var(--flame-blue))`) and `.flame-blue` (opacity `var(--flame-blue)`), each a layered teardrop of two or three radial gradients (outer, mid, core).
4. `.flame-ragged`: a second outline with a lean and a ragged tip, opacity `var(--flame-ragged)`. The plain teardrop's opacity is `calc(1 - var(--flame-ragged))`.

`.halo` radius and opacity follow `clamp(0, var(--flame-glow) + var(--flicker-glow), 1)`.

The wisp (`.smoke-wisp`) is a still S-curve drawn above the wick in `--smoke`. With `data-animate-smoke="true"` it sways (a looping 7 s ease-in-out alternate rotation of a few degrees). It never fades out, so an ended session keeps its mark (R9.3). `.ember` is the cooling glow (section 5.7).

### 5.7 The cooling glow

`.ember` is a small radial gradient dot on the wick tip with opacity `var(--cooling)`. It is a still shape and colour, so it shows in reduced motion (R8.5). With `data-ease="true"` it fades in and out over 800 ms. `--cooling` is 1 while `isBreak` is true and 0 otherwise. It changes nothing else.

### 5.8 Dawn

When `--dawn` is 1: the window pane is pale, `.dawn-wash` is full, `.night` drops to opacity 0.4, and the stub is unlit. With `data-ease="true"` the change eases in over 3 seconds. The dawn differs from the dim idle room in colour (cool and warm wash against blue-black), in brightness, and in the window (R8.4). The dawn does not depend on the break (Decision Q3).

## 6. The renderer

### 6.1 API

```ts
export interface Scene { apply(model: SceneModel): void; }
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
| `flameGlow` | `--flame-glow` | `.halo`, `.pool` opacity |
| `smoke` | `--smoke` | `.smoke-wisp` opacity |
| `lightRadius` | `--light-radius` | `.pool` scale |
| `dawn` | `--dawn` | `.window`, `.night`, `.dawn-wash` |
| `cooling` | `--cooling` (`1` or `0`) | `.ember` opacity |
| `flickerLean` | `--flicker-lean` | `.flame-flicker` rotation |
| `flickerHeight` | `--flicker-height` | `.flame-flicker` scale |
| `flickerGlow` | `--flicker-glow` | `.halo`, `.pool` |
| `phase` | `data-phase` | hook for later specs; no rule here |
| `flameMode` | `data-flame` | hook; the e2e tests assert it |
| `animateDrips`, `animateSmoke`, `animateEase` | `data-animate-drips`, `data-animate-smoke`, `data-ease` (`"true"`/`"false"`) | CSS transitions and animations |

Numbers are written with `String(value)`; booleans are converted by the table (`true` becomes `1` for `--cooling`, `"true"` for data attributes).

### 6.3 Pool intensity when idle

In `idle`, `--flame-glow` is 0, so the pool opacity is 0.3 at radius `LIGHT_MIN`: a faint, small patch. No separate idle rule exists.

### 6.4 The accessible name (R12)

`root` has `role="img"`. `apply` sets `aria-label` from `STRINGS.scene[model.flameMode]` only when `flameMode` changes. It does not include the time. This is the one attribute besides custom properties and data attributes that the renderer writes (R12 allows it). New strings in `src/strings.ts`:

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
| `--wall-top` | `#14192a` | lit wall, top |
| `--wall-low` | `#3a2a1c` | lit wall, near the table (amber-lit) |
| `--floor` | `#120e0a` | floor |
| `--table` | `#1a1410` | table band |
| `--dish` | `#8b6a3a` | brass dish |
| `--wax-ivory` | `#efe6cf` | wax |
| `--wax-shade` | `#cfc2a2` | wax shading, drips |
| `--flame-amber-outer` | `#ff9b2f` | amber flame, outer |
| `--flame-amber-mid` | `#ffc25a` | amber flame, mid |
| `--flame-core` | `#ffe9b0` | flame core |
| `--flame-blue-outer` | `#4b86e8` | blue flame, outer |
| `--flame-blue-core` | `#cfe3ff` | blue flame, core |
| `--halo` | `#ffb347` | halo |
| `--smoke-colour` | `#8a93a6` | the wisp (`--smoke` is the 0 or 1 number the renderer writes) |
| `--ember` | `#ff7a2e` | cooling glow |
| `--window-night` | `#0d1424` | window pane at night |
| `--window-dawn` | `#566683` | window pane at dawn (equals the brightest) |
| `--dawn-cool` | `#4a5a78` | dawn wash, top |
| `--dawn-warm` | `#5a4a52` | dawn wash, low |

The final names are fixed in the tasks.

### 7.2 The contrast handoff (R7.7)

`--room-bg-darkest` (`#05070d`) and `--room-bg-brightest` (`#566683`) are the bounds of every background colour the scene paints under the stage. Ivory (`#efe6cf`, the wax colour) against them has WCAG contrast 16.2 and 4.66. So a light, ivory-like time text stays at 4.5:1 or better against any background in the scene. The time text colour is chosen by `controls-and-access`; this spec only guarantees the bounds. Two consequences, both deliberate:

- The dawn is "muted": early light in hue and softness, not in luminance. A bright white morning would force dark text.
- The flame's halo and core are brighter than the bound. They are small, sit around the flame, and are not a place for text. This is stated so that `controls-and-access` keeps the time text away from the flame.

A palette test (section 12.3) reads `scene.css`, parses the background colour stops, and checks them against the bounds.

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
- What remains in the still version: wax height, three drip shapes, flame size/colour/shape per mode, pool radius, the window and wash at dawn, the wisp as a still curve, the ember dot.

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

The current `main.ts` writes a visible `h1` and a tagline. The scene shows no text (R11.4), and the controls spec owns the visible text. So the placeholder `h1` and tagline stay in the DOM with the class `visually-hidden`, defined in `scene.css` (the standard clip technique, 1 px box, not `display: none`). The existing smoke test (`getByRole("heading")` visible) keeps passing, and the screenshots are text-free. See Point for review P3.

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

For each fixture the test waits for `data-settled="true"` on `#scene`, then reads the root's `data-flame`, `data-phase`, and the computed custom properties (as numbers, with `toBeCloseTo`):

| Fixture | `data-flame` | `--wax-height` | `--drips` | `--light-radius` | `--dawn` | `--cooling` | `--smoke` |
|---|---|---|---|---|---|---|---|
| `idle` | `unlit` | 1 | 0 | 0.2 | 0 | 0 | 0 |
| `lit-start` | `steady` | 1 | 0 | 1 | 0 | 0 | 0 |
| `lit-half` | `steady` | 0.5 | 2 | 0.6 | 0 | 0 | 0 |
| `lit-last-minute` | `guttering` | 0.02 | 3 | 0.216 | 0 | 0 | 0 |
| `paused` | `paused` | 0.6 | 1 | 0.68 | 0 | 0 | 0 |
| `burned-out` (in break) | `smoke` | 0 | 0 | 0 | 1 | 1 | 1 |
| `burned-out` (after break) | `smoke` | 0 | 0 | 0 | 1 | 0 | 1 |
| `snuffed` | `smoke` | 0 | 0 | 0 | 0 | 0 | 1 |

Also: `aria-label` equals the string for the mode (R12); `role="img"`; with reduced motion on, `--flicker-*` are 0 and `data-ease`, `data-animate-drips`, `data-animate-smoke` are `"false"`; and at the four viewports there is no scrollbar (`scrollWidth <= clientWidth`, same for height) and `.candle` and `.flame-shape` lie inside the viewport.

### 11.4 Screenshots (R13.3 to R13.5)

Names: `docs/screenshots/candle-<state>-<size>[-reduced].png`, with state in `idle`, `lit-start`, `lit-half`, `lit-last-minute`, `paused`, `burned-out`, `snuffed` and size in `desktop` (1280x800) or `phone` (360x640). The set is 7 x 2 = 14, plus the 7 reduced-motion shots at desktop (`candle-lit-half-desktop-reduced.png`, and so on): 21 files. The `burned-out` shot is taken inside the break, so it shows the dawn and the ember. The tests write the files with `page.screenshot({ path })`. They do not compare pixels; a wrong state is caught by the assertions above (R13.7).

Following `scene.md`, any later change to what a user sees retakes the affected screenshots, and the task summary names them.

## 12. Unit tests, purity and palette

### 12.1 Example-based tests (`model.test.ts`, `flicker.test.ts`, `types.test.ts`)

- Flame mode at time left 60 001, 60 000, 59 999 and 0 ms (lit), at 0 for paused, and in the last minute for paused.
- Drip count at wax 0.76, 0.75, 0.5, 0.25 and 0.0, and 0 in idle and in the ended phases.
- Idle: wax 1, no flame, light radius 0.2, drips 0. Burned-out: wax 0, dawn 1, light 0, smoke 1. Snuffed: wax 0, dawn 0, light 0, smoke 1.
- The reference table of flicker for seed 20261031 at 8 instants (hard-coded numbers, to catch an accidental change of the hash or steps), for each mode.
- R5.6 on `FLAME_LOOK`: any two of `steady`, `guttering`, `paused` differ in at least two of size, colour, shape; and `unlit` vs `smoke` differ in wax height, light radius and `smoke` (section 3.3).
- `cooling` is true at the end instant and 299 999 ms after, false at `breakEndsAt` and later.

### 12.2 Purity test (`purity.test.ts`)

Reuses the technique of the engine's purity test (comment stripping, whole-word matches):

- **Model files** (`types.ts`, `constants.ts`, `flicker.ts`, `model.ts`): none of `window`, `document`, `localStorage`, `Date.now`, `performance`, `Math.random`, `matchMedia`, `setTimeout`, `setInterval`, `requestAnimationFrame`; no imports from `storage`, `ui`, `audio`, `distraction`; the only engine import is `../engine` (the index), and only `timeLeftMs`, `waxFraction`, `isBreak` and the `State` type.
- **Every non-test file in `src/scene/`**: no `Date.now`, `performance.now`, `setTimeout`, `setInterval`, `requestAnimationFrame` (R1.3); no import of `test-kit`.
- **`render.ts`**: no import from `../engine`.
- **`model.ts`**: does not mention `.session`, `.litSince`, `.pausedAt`, `.history`, `.endedAt` or `.breakEndsAt` (R1.2).

### 12.3 Stylesheet tests (`scene.css.test.ts`, node)

- The file contains an `@media (prefers-reduced-motion: reduce)` block that sets `animation: none` and `transition: none`.
- Every custom property listed in section 6.2 is used by at least one rule (so the renderer never writes a property nobody reads).
- The palette test: parse the background colour stops (`--room-night`, `--wall-*`, `--floor`, `--table`, `--window-*`, `--dawn-*`); each has relative luminance between that of `--room-bg-darkest` and `--room-bg-brightest`; the composited brightest dawn colour over the lit wall is within the bounds; and `--wax-ivory` against both bounds is at least 4.5:1.
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
| P6 | Trace samples and extra states from `arbWildScript` (invalid events included), with `arbNow` and `arbSeed`. | No throw. Every number is finite and inside `RANGES`; `drips` is 0, 1, 2 or 3; `flameMode` and `phase` are in their unions; booleans are booleans. |
| P7 | The same samples. The input state is deep-frozen (recursively) before the call, then compared to a `structuredClone` taken before. | Two calls give deep-equal models. The input equals its clone afterwards. Every model value is a number, a boolean, or one of the two fixed unions (no other string, no object, no array). |
| P8 | Trace samples at `arbNow` probes including times inside and after the break. | `dawn === 1` iff `phase === "burned-out"`, whether or not the break is in progress. `lightRadius === 0` iff the phase is `burned-out` or `snuffed`. `cooling === isBreak(state, now)`. For a burned-out state, the models at an instant inside the break and at an instant after it differ only in `cooling` (the flicker of `smoke` is 0, so `now` changes nothing else). |

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

1. **P1. `unlit` vs `smoke` at flame level.** R5.6 asks that any two flame modes differ in two of size, colour, shape. Neither of these two has a flame, so at flame level only the shape differs (nothing vs the wisp). Recommendation: read R5.6 at scene level for this one pair. The whole still scene differs in wax height (whole candle vs stub), light radius (small pool vs none) and the wisp, and the unit test says so (12.1). The alternative is to give `smoke` a dull ember colour on the wick, which adds an element that duplicates the cooling glow.
2. **P2. Furniture.** The wall, floor, table, dish and window frame carry no state. They are the minimum for the candle to stand on and the light to fall on, and the window is part of the dawn. `costume-reviewer` should confirm none of them counts as decoration; if it does, the table and dish can go and the candle can stand on the floor line.
3. **P3. Placeholder heading.** The visible `h1` and tagline become visually hidden, so the scene has no text (R11.4) and the smoke test keeps passing. The controls spec will replace them. The alternative is to leave them visible and let them overlap the scene until then.
4. **P4. A change outside `src/scene/` and `main.ts`.** `src/strings.ts` gets the five accessible names, because steering `structure.md` says all user-visible text lives there. The e2e file and the screenshots are required by R13. If you want `src/strings.ts` untouched, the names can move into `src/scene/` for now and move later.
5. **P5. The halo and core are brighter than the contrast bound.** The bound (section 7.2) covers backgrounds, not the flame itself. `controls-and-access` must keep the time text off the flame. If you would rather the whole stage stay inside the bound, the halo would have to be weaker and the flame would read less warm.
6. **P6. Playwright importing the engine.** The fixtures import `../src/engine` and `../src/storage/storage` from the test. The first task verifies that Playwright resolves these extensionless imports; the fallback is a `globalSetup` script that writes the fixture strings.
7. **P7. Drips follow the rim.** Drips hang from the top of the wax and move down with it, and they are clipped at the table line. They are not fixed marks on the side of the candle, because the wax passes any fixed mark, which would leave a drip hanging in the air. This reads the brief's "a drip runs down at each quarter" as a new runnel at the rim.

## 17. Decisions

None yet. Answer the points for review above and they will be moved here, with this design changed to match.
