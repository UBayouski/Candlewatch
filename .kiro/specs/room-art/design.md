# Design Document: room-art

## 0. Status and how to read this document

- **Phase:** design and prototype are complete, and **the owner approved the prototype on 2026-11-15** (D14). `tasks.md` is written. No task has been started and nothing outside `.kiro/specs/room-art/` has been edited.
- **Edits outside `.kiro/specs/room-art/`: none.** Every change to `src/`, `e2e/`, steering, `docs/BRIEF.md`, `KIRO_USAGE.md`, the agent file and other specs is listed in section 8 as a change for the first build task (task 1 of `tasks.md`), not made. In this folder, `requirements.md` was amended (section 9 says where, Q19 to Q42).
- **The prototype** is `.kiro/specs/room-art/prototype/` (section 10). Every figure marked "measured" was read from Chromium on that prototype by `prototype/measure.mjs` (all seven sizes of VIEWPORTS_ART, seven states) and printed by `report.mjs`, not computed by hand. The prototype is a picture of the finished look, not the shipped code; the numbers will be re-measured on the real build by the tests of section 6.
- **The final look** (what the owner approved): the Window_Light at night level 0.5 with a 3 s ease and an edge shade of 0.82 beyond 320 units from its axis (3.3, D3); **wall B**, eight uneven courses of laid stone with staircase joints, under a Wall_Veil that flattens it toward the edges (D1); the warm tint of the pool (F16) and no pool drawn in idle (F15); the table with its lit lip high on the front and the dish with its full rim, under a short zone shadow (**base B2**, D2, change request CR12); the three ghost shapes (3.5, D7); the redrawn Door (D8) and Place (D9); the zone buttons (D10). F18 (the unlit upper right of the graveyard view) is left as it is.
- Room units are the 600 by 1000 stage units. CSS pixels are written "px".

Section list: 1 Overview and layer order, 2 Boundaries, 3 Architecture (3.1 pure modules, 3.2 Setting_Group, 3.3 Window_Light, 3.4 Backdrop, 3.5 ghosts, 3.6 Door wood, 3.7 Place, 3.8 zone buttons, 3.9 renderer, CSS, CSP, forced colours), 4 Decisions D1 to D16, 5 Correctness properties, 6 Playwright tests, 7 Tests that change on purpose, 8 Changes for the first build task, 9 Findings against the requirements and what the requirements now say, 10 The prototype.

---

## 1. Overview and layer order

The art is a **delta over the real room**. `src/scene/room.ts` keeps the candle, flame, halo, drips, ember, smoke, pool mask and zone exactly as they are; the prototype builds its pictures from the real `ROOM_SVG` string and patches four places in it (`build.mjs`, function `roomSvg`). So "the candle, flame, halo and light pool stay exactly as they are" is true by construction in the pictures.

The Lit Setting rule (R1): things that move or change show state; a still thing is drawn only where the candle's light or the window's light falls on it; no still thing looks like a state element; no ornament.

**Layer order of the room SVG, back to front** (new layers in bold):

| # | Layer | Class | Notes |
|---|---|---|---|
| 1 | wall gradient | `.wall` | unchanged, `--wall-top` to `--wall-low` |
| 2 | **the setting** | `.setting` | wall (the stone tile of wall B), **Wall_Veil**, table top, holder, frame, Door wood; one group, no animation, no opacity, no model property |
| 2b | **warm tint** | `.warm-tint` | one rect between `.setting` and `.night`, through its own mask (the pool's profile, moved and scaled like `.pool`); not drawn in idle (F15, F16) |
| 3 | night | `.night` | unchanged rect, masked by `#cw-pool-mask`; the mask gets the Window_Light hole, the Edge_Shade rect and the existing pool hole |
| 4 | dawn wash | `.dawn-wash` | unchanged, above the setting |
| 5 | glass | `.window` | same two rects, same area, same blur; **masked to four panes** |
| 5b | **stars** | `.stars` | 9 fixed dots, opacity `1 - --dawn` (Window_Sky) |
| 6 | candle | `.candle` | unchanged |
| 7 | lit | `.lit` | unchanged (head, halo, flame, drips, ember, smoke) |
| 8 | zone | `.zone` | unchanged, topmost |

In idle the candle's pool is not drawn (CSS from the existing `data-phase`, F15): the `.pool` hole of the mask is `display: none` while `data-phase="idle"`, so no light appears to come from an unlit candle.

Above the SVG: the ghost layer (its own SVG), then `#ui` (controls, then the graveyard root with the Place at its back).

---

## 2. Boundaries (R2)

- `src/engine/`, `src/storage/`, `src/distraction/`, `SceneModel`, the property table of `render.ts` and `main.ts` are **not changed**. No new CSS file is added: the new rules are appended to `scene.css`, `ghosts.css` and `graveyard.css`, which `main.ts` already imports, so `main.ts` needs no import line and CR8 is not triggered.
- The Place needs `--dawn` for its sky. `--dawn` is written on `.candle-scene`, and the graveyard root is not inside it. `view-dom.ts` already receives the engine `State`; it writes `--dawn` itself on its root with its existing `writeVar` (`state.phase === "burned-out" ? 1 : 0`, the same rule as `sceneModel`). A test compares the two (P6b of section 5). No change to `main.ts`.
- Folders keep their import rules: `scene/` and `ghosts/` and `graveyard/` import none of each other; each keeps its own copy of a shared number and a test compares the copies (R2.9).

---

## 3. Architecture

### 3.1 The five new pure modules (R2.3)

All five import only what their folder may import, read no DOM, clock, storage, `Math.random`, `Date`, `performance`, `matchMedia` or timer, and are added to the `purity.test.ts` allow-lists of their folders.

**`src/scene/setting.ts`**: constants and two small seeded generators. Exports: `TABLE = { y: 884, h: 16, topEnd: 889, lipEnd: 891.4, underY: 891.9, faceY: 892.4 }`, `HOLDER = { x: 238, w: 124, y: 886, h: 14, rim: { cy: 890.8, rx: 62, ry: 4.8 }, inside: { cy: 891.5, rx: 50, ry: 2.6 } }`, `PANE_FRAME` (frame 8 units, mullions `{ vx: 276, vw: 6, hy: 110, hh: 6 }`, sill y 250..260), `PANES` (4 rects), `STARS` (9 `[x, y, r]`), `WALL = { seed: 20261204, tileW: 960, courses: 8, minWidth: 105, maxWidth: 240, inset: [2.1, 3.3], step: 6, gap: 30 }`, `wallCoursesB(seed)` (the eight courses: mulberry32, widths 105 to 240 summing to 960, a start offset per course so that vertical joints of neighbouring courses are at least 30 units apart, a bottom offset in -6..6 per block with neighbours differing by at least 3, a tone class per block with no accent touching an accent above or below it; accents may sit beside each other (Q49; corrected by Q49), per-block insets and corner jitter from a fixed 16-number draw; see D1), `wallBlocks(seed)` (the polygons and nullable joint below each block that the tile, the Wall_Sample fixtures and the tests read; null where the centre lies over a vertical joint below (corrected by Q44)), `WALL_ORIGIN_X` (-2195), `DOOR_WOOD` (arch, recess, planks, hinges, latch plate, threshold), `SETTING_TOKENS` (the names of the `--set-*` custom properties, for the token test), `WINDOW_LIGHT = { cx: 300, cy: 155, r: 2600, profile: [[0,1],[0.08,0.92],[0.2,0.78],[0.4,0.66],[0.65,0.52],[0.85,0.4],[1,0.3]], night: 0.5, snuffed: 0.09, dawn: 1 }`, `EDGE = { near: 320, far: 800, windowShade: 0.82, veil: 0.75 }` (the horizontal attenuation of the Window_Light and the Wall_Veil, both functions of `abs(x - 300)` only) and `WARM_TINT = { token: "--set-warm-tint", alpha: 0.42 }`. `room.ts` builds the `.setting` markup from these constants (no number is typed twice). The generators take a seed and nothing else: no `Math.random`, no `Date`.

**`src/scene/light.ts`**: the pure model of what the mask, the Wall_Veil and the tint draw. It mirrors the picture, so every number below is also a stop or a constant of the markup, and P6 compares them.

```ts
poolLight(dx, dy, r): number          // 0 when r <= 0 or the point is outside r * LIGHT_FULL_UNITS; else the mask's profile:
                                      // stops (0 -> 1, 0.6 -> 0.75, 1 -> 0) linear in d / (700 r); (dx, dy) = (x - 300, y - flameY)
poolRadiusDrawn(phase, r): number     // 0 in idle (F15: the pool and its tint are not drawn), else r
edgeShade(x): number                  // the Window_Light's horizontal attenuation e(x): 0 for |x - 300| <= EDGE.near (320); linear to
                                      // EDGE.windowShade (0.82) at |x - 300| = EDGE.far (800); held beyond. It is the mask's `win-edge` rect
                                      // (white, alpha e(x)). It reads neither r nor dawn
windowLight(r, dawn): number          // level(r) + (WINDOW_LIGHT.dawn - level(r)) * dawn, with level(r) = r > 0 ? night : snuffed;
                                      // reads the model's r only as "is it zero" (idle is lit by the window at the night level)
windowLightAt(x, y, r, dawn)          // windowLight(r, dawn) * profile(distance from (300, 155) / 2600) * (1 - edgeShade(x))
lightAt(x, y, flameY, rDrawn, r, dawn)  // 1 - (1 - poolLight(x - 300, y - flameY, rDrawn)) * (1 - windowLightAt(x, y, r, dawn))
                                      // (probabilistic union: what two stacked black alpha holes in one mask compose to)
tintAt(x, y, flameY, rDrawn): number  // WARM_TINT.alpha (0.42) * poolLight(x - 300, y - flameY, rDrawn): the tint rect's mask is the pool's
                                      // profile as white alpha, moved and scaled by the same rule as `.pool` (F16)
veilAt(x): number                     // the Wall_Veil's alpha: 0 for |x - 300| <= 320; linear to EDGE.veil (0.75) at 800; held beyond;
                                      // it covers the wall only (the table, the frame and the Door's wood are drawn after it)
settingColour(token, isWall, x, y, flameY, rDrawn)   // mix(mix(token, VEIL, isWall ? veilAt(x) : 0), TINT, tintAt(x, y, flameY, rDrawn)):
                                      // the setting before the night mask (the tint rect lies over everything of `.setting`)
litColour(token, isWall, x, y, flameY, rDrawn, r, dawn)  // mix(night, settingColour(...), lightAt(x, y, flameY, rDrawn, r, dawn))
```

The combination rule is the union `1 - (1 - a)(1 - b)`. It is not chosen: it is what the SVG mask computes when a second black, partly transparent hole is drawn over the same white rect, so the function mirrors the picture. It is in [0, 1], non-decreasing in each input, and equals the other input when one is 0. **The edge shade lies inside the window's hole, before the pool's hole is drawn:** a white rect of alpha `e` over a black hole of alpha `h` leaves a hole of `h (1 - e)`, so the window's light is multiplied by `1 - e(x)` and the pool's light is never attenuated (the pool is drawn after it). **The veil and the tint are not light but colours of the setting before the night mask:** each is a mix of two tokens at or under the ceiling, so `settingColour` is again between the two stops (P8), and `litColour` is the picture's resolved colour at a point. The veil and the edge shade depend on `x` only, because the Door's wood and the Table_Top sample (200 to 250 units from the window's axis) have floors that leave no room to lose light (D3).

**`src/scene/backdrop.ts`**: `backdropExtent(vw, vh) -> { x0, x1, y0, y1 }` in room units: the part of the room the viewport shows, with the `meet` rule copied (`scale = min(vw / 600, vh / 1000)`, `ox = (vw - 600 scale) / 2`, `oy = (vh - 1000 scale) / 2`; `x0 = -ox / scale`, `x1 = 600 + ox / scale`, likewise y). `BACKDROP = { x0: -2200, x1: 2800, y0: -600, y1: 1600 }` is the drawn extent; P4 says the shown extent is inside it with 50 units to spare.

**`src/ghosts/place.ts`**: `ghostLook(index)` and `placeGhost(slot, index, size)` (3.5). The three body paths live in `silhouette.ts` next to the existing one (`ghostShape(variant)`, `GHOST_EYES`).

**`src/graveyard/place.ts`**: the Place's rectangles and seeded marks in room units: `HORIZON_Y = 224`, `HAZE = 60`, `DOORWAY = { cx: 60, cy: 847.5, r: 760, sx: 1.7 }`, `PLACE_CLIP_Y = 900`, `shelfBoard(rowY, count)`, `stoneSide(rect)`, `stoneMound(rect)`, `stoneShadow(rect)` (cast away from the doorway), `groundMarks(seed, avoid)` (fixed-seed dart throwing, minimum gaps 26 and 40 units, off every text rectangle). Pure functions of the rectangles `geometry.ts` already gives.

### 3.2 The Setting_Group (R1, R3)

`<g class="setting">` is inserted between `.wall` and `.night`, inside no other group, with no attribute but its class. Its children:

- `<defs>` as its first child with the `<pattern id="cw-stone">`, the table gradient and the door clip. This keeps every `<pattern>` inside `.setting` (R11.3, test 2) and no id contains "grain".
- `.wall-stone`: one rect, x -2200..2800, y -600..884, `fill="url(#cw-stone)"`. The pattern is a 960 by 628 tile of eight uneven courses, 6 elements (D1).
- `.wall-veil`: one rect over the same area, `fill="url(#cw-veil-grad)"`, the Wall_Veil of D1 (a horizontal gradient of `--set-veil`, alpha 0 within 320 units of x = 300 and 0.75 from 800 units).
- `.table`: a top surface, a lit lip, an under-line and a front face over y 884..900 (16 units, edge to edge, D2).
- `.holder`: a pewter dish (D2).
- `.frame`: the whole pane rectangle as frame wood, a top and left highlight, a sill y 250..260 (D6).
- `.door-wood`: stone surround, recess, four planks, joints, fibre lines, two iron hinges, a latch plate, a threshold (3.6).

Every colour is a `--set-*` custom property or an existing wall token. No child has an animation, a transition or a model custom property (R1.6). The group is static, so the browser rasterises it once; the per-frame custom properties (`--flicker-*`, `--flame-*`) are not read by any rule below `.setting` (R10.11). The mask and `.night` are re-evaluated when `--light-radius` changes, as today. The `.warm-tint` rect is outside the group (it reads `--wax-height` and `--light-radius` through its mask, as `.pool` does).

**Surfaces and the Impostor test.** R1.8(b) says no Still_Setting's bounding box may meet the flame, halo, wax body, Door, a Ghost_Cell or the zone. The wall is a Surface that spans all of them by definition. The test reads (b) for **Props only** (frame, table, holder, door wood, shelf boards) and lists the Surfaces by class (`wall-stone`, `p-ground`, `p-sky`). See section 9, F4.

### 3.3 The Window_Light and how it is drawn (R4, D3)

The window is a second, constant light. It is drawn **in the pool mask**, so `.night` stays one constant rect:

```
<mask id="cw-pool-mask">
  <rect class="mask-all" fill="#fff"/>                         white: night shows everywhere
  <circle class="win-light" cx="300" cy="155" r="2600" fill="url(#cw-win-hole)"/>   black hole, seven stops
  <circle class="pool" .../>                                   the existing pool hole (not drawn in idle)
</mask>
```

Two black, partly transparent holes over white compose to `(1 - a)(1 - b)` of night, so the light is the union `1 - (1 - a)(1 - b)`: where the pool is 0 the room is lit by the window alone; where both reach, the room is brighter than either; the pool can never darken what the window lights.

The hole's **level** is CSS only, from two inputs, `--dawn` and whether `--light-radius` is 0:

```
--wl-k:   var(--dawn);                       /* a registered number: @property --wl-k { syntax: "<number>"; inherits: true; initial-value: 0 } */
--wl-now: calc(var(--wl-snuffed) + (var(--wl-night) - var(--wl-snuffed)) * min(1, calc(var(--light-radius) * 1000)));
--wl:     calc(var(--wl-now) + (var(--wl-dawn) - var(--wl-now)) * var(--wl-k));
.st-wl { stop-opacity: calc(var(--wl) * var(--k)) }       /* --k is the stop's fixed fraction of the profile */
.candle-scene[data-settled="true"][data-ease="true"] { transition: --wl-k 3s ease }
```

`min(1, r * 1000)` is 1 for every `r` the model can produce while a candle exists (`LIGHT_MIN` is 0.2) and 0 only at `r = 0`, so the level takes the amount of the radius nowhere (R4.19). **The level eases over 3 s with the dawn** (the owner's decision, F9): `--wl-k` follows `--dawn` through a registered custom property, gated by `data-settled` and `data-ease` like `.dawn-wash`; the scene's reduced-motion rule (`transition: none !important` on `.candle-scene *`, and on the element itself in the build) makes it 0 s. In the static prototype no transition runs; the CSS is in `art.mjs` (`ART_CSS`) and the computed value resolves (the pictures show the dawn level). Per phase:

| phase | `--light-radius` | `--dawn` | level `--wl` |
|---|---|---|---|
| idle, lit, paused | 0.2 to 1 | 0 | **0.5** (`--wl-night`), constant |
| snuffed | 0 | 0 | **0.09** (`--wl-snuffed`), the minimum |
| burned-out | 0 | 0 to 1 (eased 3 s) | `0.09 + 0.91 * k`, 1.0 at the dawn (the wash then sits above it) |

The falloff is a radial profile with seven stops from 1 at the window to 0.3 at 2600 units, so the light reaches the edges of a 3840 by 2160 page (1200 units from the window) at about 0.5 of its peak.

Colour: the Window_Light changes brightness only; its coolness comes from the tones it falls on. A coloured light layer of the window would break "Lit_By_The_Light" (R1, glossary), so none is added. The candle's warmth is the pool's tint (F16, adopted).

**The edge shade (third pass).** One more rect in the mask, after `.win-light` and before `.pool`: `<rect class="win-edge" fill="url(#cw-win-edge-grad)"/>`, white with a horizontal gradient whose alpha is 0 for `|x - 300| <= 320` units, rises to `--wl-edge` (**0.82**) at `|x - 300| = 800`, and stays there beyond. White over the black hole restores night in proportion, so the window's light is multiplied by `1 - e(x)` (0.18 at the far edges); the pool's hole is drawn after it, so the candle's light is untouched. It depends on x only, because the Door's wood (x 20..100, 1.112 against night in idle, floor 1.10) and the Table_Top sample lie at 200 to 250 units from the window's axis and must not lose light; the edges of a 1280 page are at 800 units and those of 1920, 2560 and 3840 pages at 889 (all 16:9). Beyond 800 units the level is held, so a 32:9 page (1185 units each side) is no darker at its edge than a 16:9 one (measured at 2560 by 1080: 10 against 11).

### 3.4 The Backdrop (R7, D4)

At 1920 by 1080 and 3840 by 2160, the meet formula gives x -588.888889..1188.888889 and y 0..1000 (corrected by Q46).

The drawn extent stays `x -2200..2800, y -600..1600` (wall and night rects, mask, zone). `backdropExtent` shows that every viewport of VIEWPORTS_ART and every aspect from 1:3.5 to 32:9 is inside it with 50 units to spare: at 1:3.5 the shown extent is y -550..1550 (see D4); at 32:9 and a height of 1000 units the width is 3556 units, x -1478..2078, and 2078 + 50 < 2800. The `stageBox` letterbox, `placeControls`, `keepClear` and every control rectangle outside the zone buttons are unchanged (R7.4). No scrollbar: the SVG keeps `overflow: visible` inside a `position: fixed; inset: 0; overflow: hidden` host.

### 3.5 Ghosts (R5, D7)

Each ghost is one `<g class="ghost">` with `transform = translate(x y) rotate(tilt) scale(size)` and inside it `<g class="drift">` holding: the body path, an inner glow ellipse (a radial gradient inside the body), and two eyes. The layer keeps `aria-hidden`, the 12 slots, the drift keyframes (`DRIFT_UNITS = 8`) and the fade. The arcade shape (dome, straight sides, scalloped hem) is gone.

- **Three body shapes of their own** by `index mod 3`, each inside the 70 by 75 box, none symmetric, shoulders 38 to 48 units wide instead of 70:
  - variant 0: the body narrows to a wisp that trails **down and to the right** (tip at x 35, y 37.5); a short flick hangs on the left;
  - variant 1: a ragged little hem on the right and a long thin wisp that sweeps **to the left and down** (tip at x -35, y 37.5);
  - variant 2: a **hooked tail curling to the right** (tip at x 30, y 37.5) and one arm lifted on the left (reaching x -35).
  The paths are `GHOST_SHAPES` in `prototype/art.mjs` and become `ghostShape(variant)` in `silhouette.ts`. Every point lies in the box; each shape touches the top and the bottom, and the side of its wisp (the opposite side is within 14 units of the box: see section 7 for the changed test).
- **Eyes:** two ellipses `rx 3.7, ry 5.3`, fill `#0b1020`; their place depends on the variant only (`(-8,-19) (5,-19)`, `(-4,-19) (9,-19)`, `(-11,-21) (2,-21)`), so they are identical on every ghost of a variant (R5.3) and carry no state.
- **Glow:** inner only (an ellipse 17 by 24 inside the body, white at 0.85 to 0). It never leaves the box, so the Ghost_Extent is the box.
- **`ghostLook(index)`** (pure): `variant = index mod 3`; `tilt = (frac(index * 0.7548776662) * 2 - 1) * 3` degrees (|tilt| at most 3); `fx = frac(index * 0.6180339887) * 2 - 1`; `fy = frac(index * 0.4142135623 + 0.3) * 2 - 1`. Golden-ratio steps keep any run of consecutive indexes well spread (P3).
- **`placeGhost(slot, index, size)`** (pure): the slot centre plus `(fx * spareX, fy * spareY)` with the spare room of the cell (90 by 95) after the drift (8) and the box at this size under the worst tilt (3 degrees):

```
spareX = max(0, 45   - 8 - size * (35 cos 3deg + 37.5 sin 3deg))     = 0.085 at size 1, 18.543 at size 0.5, 27.771 at 0.25 (corrected by Q47)
spareY = max(0, 47.5 - 8 - size * (37.5 cos 3deg + 35 sin 3deg))     = 0.220 at size 1, 19.860 at size 0.5, 29.680 at 0.25 (corrected by Q47)
```

The bound uses the whole box, so it holds for any shape inside it. At size 1 the offset is under 1 unit (R5.7 allows 2). The tilt is capped at 3 degrees (F5, Q23).
- **Legibility at the smallest drawn size (0.25 of the box, 17 by 19 units).** Judged on the prototype's pictures and on a strip of the three shapes at sizes 1, 0.5 and 0.25 (scratch image, deleted): at 1 and at 0.5 the three are told apart at both sizes of the page (wisp right with a flick, wisp left with a ragged hem, hooked tail with a raised arm). At 0.25 the body is about 14 by 15 px on a 1280 by 800 page: the eyes read as two dots and the wisp direction is visible, so variant 1 (wisp to the left) is told from the other two, and the hooked tail of variant 2 against the straight tail of variant 0 is barely visible. At 360 by 640 (10 by 11 px) only the side of the wisp is visible: variants 0 and 2 can not be told apart. This is accepted: the variant carries no information (Q5); size is the state, and the smallest ghost is still a ghost with two eyes.

### 3.6 The Door's wood (R6, D8)

The wood is `.door-wood` inside `.setting`, at `DOOR_RECT` x 20..100, y 805..890. It reads as a door at 80 by 85 units (64 by 68 px at 1280 by 800):

- a **stone surround** (the arch, radius 40 about y 845), then a **recess**: the opening is the arch inset by 4, with a dark reveal (`--set-recess`, 3.4 wide) along its top and left edges, so the door stands back from the wall;
- four **planks** of 18 units in two clearly different tones (`#7a5a38`, `#4a3724`), dark joint lines, eight fibre lines;
- two **iron hinges** on the left (a strap tapering to a point with a pin and two rivets, at y 826 and 866) and an iron **latch plate** on the right with four rivets, behind where the handle or the bar is drawn;
- a **threshold**: a stone step x 20..100, y 885.5..890 with a lit top line. Nothing leaves the rectangle.

It is lit by the same `lightAt` as the wall. The HTML Door keeps its rectangle, key, tab and accessibility rules and, **unchanged in this pass**, its transparent face, its 2 px ivory outline, its amber handle (11 units, 1 px night ring) on the usable Door and its full-width bar (7 units, `--g-text-subtle`, ring) on the shut Door. Handle against bar is a shape difference (R6.4). Forced colours: the wood group is `display: none`, the outline and bar take `CanvasText` (D12). No transition on the Door in any mode.

### 3.7 The Place (R8, D9)

The Place is an `<svg class="place" aria-hidden="true" viewBox="0 0 600 1000">` as the **first child of the graveyard root** (before the items), `position: absolute` over the stage box with `overflow: visible`, clipped to y <= 900 so the zone, the time text and Settings stay as they are (R8.4). It replaces the opaque `.panel`. It exists only while the view is open (R8.7). Layers, back to front:

1. **Sky** (`.p-sky`): a rect from y -600 to the horizon plus the haze (224 + 60), a vertical gradient of three stops from `--window-night`, `--window-moon` and `--set-sky-low`, each mixed with the dawn colours by `--dawn` (`color-mix`), so the sky follows the dawn as the Window_Sky does (R8.5, Q13). **30 fixed stars** (dart throwing with a seed, at least 70 units apart, x -1100..1700; opacity `1 - --dawn`).
2. **Hills** in three layers (far, middle, near; sums of sines with fixed phases) and **one unlit lighthouse** (tower x 681..719, from the horizon up to y 48, a gallery, a lantern room and a dome, no lamp, no beam), all drawn in the three hill tones, unlit. They count as the sky Surface (R1.16, Q32).
3. **The setting** (`.p-setting`): the **ground** (horizon 224; a vertical gradient from `--set-earth-a` to `--set-earth-b` whose first 60 units fade in from transparent, so the far ground melts into the sky's low colour: the **haze**); **150 pebbles and 90 grass blades** placed by fixed-seed dart throwing (minimum gaps 26 and 40 units), kept off every text rectangle, in two single paths; for every Stone a **side face** (four copies of its arch offset up and to the right by a total of (9, -6), in `--set-stone-side`), a **mound** at its foot (26 units wider each side, 12 below the foot (corrected by Q50)), four grass tufts and a **shadow** on the ground cast away from the Doorway_Light (a quadrilateral 46 long from the foot, along the direction from the doorway to the Stone, flattened to 0.45 on the ground plane, `--set-shadow` at 0.6); and for every Day_Shelf a **board** (x 109, y = row top + 69, 12 high, `84 * count + 8` wide, lighter top face, darker front, grain, two iron brackets).
4. **The Doorway_Light** (`.p-night`): one rect y 224..900 filled `--room-night`, masked by a mask whose white part fades in over the haze (a black to white ramp, so the night rect does not cover the haze) and which has **one black hole** centred on the return control `(60, 847.5)`: radius **760**, stretched **1.7** in x (an ellipse 1292 by 760 units), the pool's three-stop profile at a peak of 0.95. Constant radius, constant position (R8.6). The sky is not under this layer.

Stones, Stubs, labels, cards and the return control keep every rectangle; the Place's art lies behind them.

**Measured reach** (prototype, 1280 by 800, ground pixels beside the art): near the Door (room 60, 700) `(60, 48, 42)`; the Stones' row on the right (560, 300) `(31, 28, 28)`; the shelf rows (300, 620) `(59, 48, 43)`; right of the stage (1000, 700) `(32, 27, 27)`; against `--room-night` `(5, 7, 13)`. The upper right beyond about x 900 at y 300 stays unlit `(5, 7, 13)` (F18).

**Text backing (R8.8, Q14).** Every Place setting tone is at most `#7a5c3c` (luminance 0.121) and the ground tones are 0.075 and 0.031 before lighting. Ivory text (0.80) on a surface of 0.121 is 4.97:1; the subtle text `#cfc2a2` (0.54) needs the surface at or below 0.08: the ground tones are never brighter after lighting, and no text sits on a board, a pebble (the marks avoid the text rectangles) or a mound (the mounds end at foot + 12, leaving 2 units before the Stone count line after the second row (corrected by Q50)). So no new Text_Backing is needed. The `Graveyard` label (bold ivory) sits across the horizon: above its baseline the hills are the near tone and below it the ground, both under 0.08.

The 60-unit fading margin of D18 is **removed with the panel** (D9).

### 3.8 The zone buttons (R9, D10)

Wide layout only (the compact layout is unchanged: 44 by 44, icon 24, 10 px each side, gaps 72, 20 and 8 at 360 by 640).

**Rule:** a button's width is `2 P + 28 + label`, with the icon 20 px, the icon-to-label gap 8 px, and one padding `P = 16.1 px` (border included). `justify-content: center` then gives the same distance from the border to the icon and from the label to the border. The Pause button's right edge stays at `textArea.x - 16`, the Let it go dark button's left edge stays at `textArea.right + 16`, and the Settings button follows Let it go dark at the gap `G = 8`. So `T` (button to time-text box) is unchanged and equal on both sides.

| button | label (measured px) | width | left padding | right padding | baseline (icon edge / label edge) |
|---|---|---|---|---|---|
| Pause | Pause 36.77 | 98 | 16.61 | 16.63 | 31.6 / 31.6 |
| Resume (same button) | Resume 49.78 | 110 | 16.11 | 16.11 | (was 128 wide) |
| Let it go dark | 79.47 | 140 | 16.27 | 16.27 | 26.3 / 26.3 |
| Settings | 50.66 | 111 | 16.17 | 16.17 | 8.7 / 8.7 |

Measured on the prototype at 1280 by 800 (`measurements.json`, key `zone`): the padding spread is **0.46 px** at lit start (16.17 to 16.63) and 0.16 px with Resume; the baseline spread was 22.9 px. Heights 44. Gap Let it go dark to Settings: 956 - 948 = **8 px = G**. `T` left: 572 - 472 = **100**; `T` right: 808 - 708 = **100**; the two agree to 0 px.

New rectangles at 1280 by 800: Pause `{374, 738, 98, 44}` (Resume `{362, 738, 110, 44}`), Let it go dark `{808, 738, 140, 44}`, Settings `{956, 738, 111, 44}`; the status line at rest, which depends on Settings' left edge, becomes `{332, 764, 616, 20}` (was `{312, 764, 656, 20}`); the running status line `{488, 764, 304, 20}` is unchanged.

**Label bound (R9.7).** Keep at least 12 px of padding: label width at most `W - 28 - 24`: Pause 46 px (6 characters at the measured 7.4 px each), Resume 58 px (7 characters), Let it go dark 88 px (15 characters at the measured 5.7), Settings 59 px (9 characters at 6.3). A test measures each string of `strings.ts` with the real font in e2e and fails when it exceeds the bound; a unit test checks the character counts (6, 6 or 7, 14, 8).

**How the layout learns the width.** `placeControls(vw, vh)` returns `zoneControls.pause` for the "Pause" label and a new `zoneControls.resume` rectangle for the "Resume" label (the button grows to the left, right edge fixed); `main.ts`/`ui` already choose rectangles by state through `view.ts`, which picks `resume` when the phase is `paused`. The widths are constants `ZONE_WIDTHS` in `layout.ts`, guarded by the e2e measurement above (plus or minus 1 px).

### 3.9 Renderer, CSS, CSP, forced colours, reduced motion (R10)

- The renderer writes only custom properties and data attributes; no new property is written (the Window_Light and the stars read `--dawn` and `--light-radius`, which exist).
- No `style` attribute, no inline `<style>`, no data URL, no remote reference in the shipped markup. (The prototype uses `style` attributes for its room-unit positions because it is not shipped; the real `view-dom.ts` keeps `style.setProperty`.)
- Stars: `.stars { opacity: calc(1 - var(--dawn)) }`, with the 3 s dawn transition added to the existing selector list in `scene.css` (`data-settled`, `data-ease`); the Window_Light level has its own registered property and the same 3 s transition (3.3). Reduced motion (`transition: none !important`) is already the last rule of `scene.css` and covers `.candle-scene *`; the build adds the element itself to that selector.
- The Window_Light level eases over 3 s with `--dawn` (3.3), 0 s with reduced motion, so the setting no longer jumps under a wash that is still fading in (F9 is closed).
- No filter other than the existing glass blur; no `feTurbulence`, `feDisplacementMap`, `feMorphology`, `feConvolveMatrix`. The ghost layer has no filter (it animates).

---

## 4. Decisions

### D1. The wall's texture recipe

**Wall B, adopted by the owner on 2026-11-15 (F19).** Laid stone from a fixed seed (`wall-b.mjs`, seed 20261204), in a **960 by 628 unit tile** of eight uneven courses, anchored at x -2195, y -600. The first three passes used a regular ashlar wall (five courses of 60 units, a 960 by 300 tile); the owner found it still a grid, most of all at 360 by 640 and at lit start, and chose this alternative after seeing both side by side. The wall is under the Wall_Veil, the Window_Light's edge shade, the night mask and the Warm_Tint exactly as before; only the tile differs.

- **Fewer courses, larger stones of uneven proportions.** Eight courses of 79, 84, 75, 68, 78, 81, 95 and 68 units (heights drawn from 64 to 96 by the seed, 628 in all); 42 blocks of 105 to 240 units (mean 183). Each course has its own start offset; the vertical joints of neighbouring courses (and of the last and the first, for the repeat) are at least 30 units apart, which keeps the old columns away.
- **Joints that are not continuous straight lines.** (1) **Every horizontal joint is a staircase:** each block's bottom edge sits at its own offset of -6 to +5.5 units, neighbours in a course differ by at least 3, and the block below follows the staircase with its top edge, so the joint steps at every vertical joint of the course above (about every 180 units). (2) **Joint width varies:** each block is inset 2.1 to 3.3 units on every side, so a joint is 4.2 to 6.6 units before the corner jitter (measured at the block centres that have a joint below: 3.4 to 7.1, mean 5.5; corrected by Q44; the old wall's was 6 everywhere). (3) **Edge shape varies:** each block is a six-point polygon whose corners move by up to 1.3 units, whose bottom edge bows by up to 0.7 and whose midpoint moves by up to 8 units along the edge, from `mulberry32(20261204 ^ 0x51ed270b)` (a 16-number draw per block, fixed). (4) **No highlight or shade lines:** they were the straightest lines left.
- **Tones that differ less.** Five classes with the weights 0.30, 0.30, 0.22, 0.12 and 0.06: three cool tones (`#566683`, `#51607e`, `#4c5a78`), one neutral (`#58607a`) and one muted warm one (`#5e5c6e`; the old wall's was a brown `#6a5646`); the neutral and the warm class are the accents, and no accent touches an accent above or below it, including across the tile edge and last/first course; accents may sit beside each other (Q49; corrected by Q49). Result: 12, 11, 11, 6 and 2 blocks; accents 19 percent; **0 stacked accent columns**; the longest vertical run of one tone at one x is 3 of 8 courses. Blocks are overlays at 0.8 (the accents at 0.78) over the joint rect.
- **The joint** is `--set-joint` `#2b354b` at 0.6 over the wall gradient, so it is dark but never black (F6). The tile is **6 elements**: one joint rect and one path per tone class (the old tile had 38). The first and the last course are drawn once more one tile away, because their joint steps spill over the tile's top and bottom.
- **Reading the wall in a test.** The Wall_Samples are read at the centre of the block nearest the sample (R3.2, Q24); the joint is read below that block at the same x on the joint's own centre line (the joints step, so there is no single y), and the `wallPatch` of R7.7 is the board patch. `wall-b.mjs` exports the blocks and joints that `measure.mjs` reads; the build's `src/scene/setting.ts` exports the same data, and a test compares the two when the prototype is present.

**Sampler correction (corrected by Q44).** 42 blocks give 40 non-null joints; course 2 block 4 and course 5 block 2 have null reads. Unrounded widths are at least 3.402, mean 5.543; the test floor stays 3.4 and mean 5.5 within 0.1.

**The Wall_Veil (periphery, third pass).** One rect over the wall only (`.wall-veil`, x -2200..2800, y -600..884, after `.wall-stone`, before the table) filled with a horizontal gradient of `--set-veil` (`#3f4a62`, luminance 0.068, a mean of blocks and joints) whose alpha is 0 for `abs(x - 300) <= 320` units, **0.75** at 800 and beyond. It washes tones and joints out toward the edges: the wall there reads as a dim stone surface and as blocks only on inspection. It lies under the night mask, so the same light dims it. Beside the candle (the stage is `abs(x - 300) <= 300`) it does nothing.

**Measured on the final default** (all 7 sizes of VIEWPORTS_ART, 7 states, `prototype/measure.mjs`; minima over the four Wall_Samples):

| figure | floor | measured |
|---|---|---|
| joint and board, lit start, near the candle (R3.2) | 1.10 | **1.264** (lit half 1.225, last minute 1.127) |
| joint and board in idle at the Wall_Samples (R3.20) | 1.10 | **1.127** at 360 by 640 (the thinnest margin: 1.144 at 375, 1.157 to 1.163 from 768 up) |
| joint and board at the dawn, under the wash (R3.17) | 1.04 | **1.060** at 360 by 640 (1.062 at 375, 1.069 to 1.076 elsewhere) |
| board against `--room-night` in idle (R3.20) | 1.10 | **1.303** |

The idle joint ratio is the thinnest margin of the wall (0.027 over the floor), because the joints are thinnest in pixels at 360 wide; the dawn margin is 0.020 over its floor. A lighter joint token would raise the first and lower the second, so the token stays.

**Sharpness at the edges against beside the candle** (`measure.mjs`, "sharpness": the mean absolute luminance step between pixels 2 px apart, in a box beside the candle, room x 20..180 and 420..580, y 300..700, and in the outer 12 percent of the page width on each side, rows 20 to 85 percent): step ratio, edge over near, in idle **0.129 at 1280 by 800, 0.090 at 1920 by 1080, 0.081 at 2560 by 1440, 0.094 at 3840 by 2160**; at lit half 0.037, 0.026, 0.024 and 0.028. Divided by each box's mean luminance: 0.495, 0.436, 0.391 and 0.456 in idle. The edges are as soft as the wall B pictures show, and `proto-lit-half-4k.png` and `proto-lit-half-ultrawide.png` show no vertical banding.

**How the repeat was checked (E3).** (1) In code (`measure.mjs`, section "tile"): over every column x of the tile, no two vertically adjacent courses both have an accent block there (**0 stacked accent columns**). (2) In pixels (`stripes.mjs`), with the veil and the edge shade switched off (`.wall-veil` and `.win-edge` hidden) because they are an intentional slope across the page and not a repeat: in the idle wall (window light only, a smooth light) the mean luminance of each pixel column over the wall rows 330..860 is smoothed over one block width (130 units) and the same profile smoothed over 600 units is subtracted; what is left is what repeats down the page. At 1280, 1920 and 2560 wide the residual is **3.0, 3.0 and 3.0 percent** of the mean (standard deviation; limit 6 percent) and **11.6, 12.8 and 12.6 percent** peak to peak. The same measure on the real picture over the whole page width, which includes the fade, is 15.1, 13.9 and 14.0 percent, and within 320 units of the window's axis about 10 percent; neither is a repeat figure (the first contains the fade, the second is dominated by the window light's own falloff over a range of 640 units against a 600-unit trend). (3) By eye on `proto-lit-half-4k.png` and `proto-lit-half-ultrawide.png`: the warm stones return once every 960 units and none sits above another. A repeat every 960 units remains (F8).

### D2. Table_Top and Holder

**Base B2, adopted by the owner on 2026-11-15 (F20), with the `candle-scene` change request CR12.** At lit half the candle appeared to stand on the black control band: the zone's soft shadow, `drop-shadow(0 -8px 6px)` of the band's own colour, reached half darkness at y 891 and so covered the lower half of the table and of the dish. The measurements and the reasoning:

| (lit half) | today's art and shadow | final: B2 art, shadow `0 -2px 3px` |
|---|---|---|
| shadow reaches half darkness at | y 891.3 (1280 by 800), 891.0 (360 by 640) | y **897.2** (1280 by 800), **897.1** (360 by 640) |
| Table_Top (884..900, 16 units) at half darkness or more | 8.7 units = 7.0 px, 9.0 units = 5.4 px (54 and 56 percent) | **2.8 units = 2.2 px, 2.9 units = 1.7 px** (17 and 18 percent) |
| Holder (886..900, 14 units) at half darkness or more | 8.7 units = 7.0 px, 9.0 units = 5.4 px (62 and 64 percent) | **2.8 units = 2.2 px, 2.9 units = 1.7 px** (20 and 21 percent) |
| shadow alpha at y 884, 886, 888, 890, 892, 894, 896, 898 (1280) | 0.11, 0.20, 0.26, 0.43, 0.58, 0.66, 0.82, 0.91 | 0, 0, 0, 0.03, 0.10, 0.19, 0.40, 0.54 |
| shadow alpha, same rows (360) | 0.12, 0.24, 0.32, 0.43, 0.55, 0.64, 0.83, 0.92 | 0, 0, 0, 0, 0.08, 0.09, 0.43, 0.71 |

- **Table_Top:** y 884..900 (16 units, the maximum), x -2200..2800, front face on the floor line. It is drawn in four parts so that its lit edge sits above the shadow's half line: a **top surface** y 884..889 (a gradient from `--set-table-back` `#3b2c1d` to `--set-table-front` `#54402c`, plank seams every 150 units leaning outward by about 2 percent, a dark back-edge line), a **lit lip** y 889..891.4 in `--set-table-edge` `#7d6040` (the brightest brown the ceiling allows), a **dark under-line** at y 891.9 (`--set-table-seam` `#20170f`, 1.1 wide) and a **front face** y 892.4..900 (`--set-table-face` `#3a2b1d`). No flame or wax colour: every tone is a brown at or under luminance 0.131.
- **Holder:** a low dish of pewter grey, `x 238..362` (124 wide, inside 236..364), `y 886..900` (14 high), **its rim at full depth**: a bowl `M238 891.5 Q240 899.8 252 899.8 L348 899.8 Q360 899.8 362 891.5 Z` (`--set-dish` `#3a3d45`), a rim ellipse `rx 62 ry 4.8` at y 890.8 (`--set-dish-rim` `#5f636d`, the brightest grey the ceiling allows, rim y 886..895.6), an inner ellipse `rx 50 ry 2.6` at y 891.5 (`--set-dish-in` `#07090e`) and a lip arc along the rim's top. It is drawn **before** `.candle`, so it covers no pixel of `.body`, `.stub`, `.head` or the drips (R3.10), and it has no wax level (R3.8).
- z-order, back to front: wall, veil, table, holder, frame, door wood, then the tint, night, wash, glass, candle, lit, zone.
- **The Holder's rectangle does meet the candle's rectangle** (a dish stands under a candle); the requirement says so (Q19).
- **B1, not adopted.** B1 kept the shadow and moved the table's lit lip and a flat dish rim (y 886..891.6) above the shadow's half line. It helped the table and not the dish: at 360 wide its rim ring was about 1 px thick and read as a dark disc, as the old art did. B2 reads as a dish on a table at that size, which the owner confirmed in the combined pictures.

**What B2 needs from `candle-scene`: Change Request CR12** (requirements; applied in task 1): `src/scene/scene.css` lines 177 and 178, `0 -8px 6px` becomes `0 -2px 3px` in `.zone-rest` and `.zone-dawn`, and the comment on line 176 says the shadow is short. The time text and the status line are not affected: ivory `rgb(239, 230, 207)` on the zone fill is **15.83 to 1 at rest and 7.53 to 1 at the dawn**, measured on the pixels beside the text at 1280 by 800 and 360 by 640 with the old and the new shadow, identical, because the shadow is cast upward and the text lies below y 900. The candle's last 8 units are no longer faded into the band (shadow alpha 0.11 to 0.91 before, 0 to 0.54 now), so the base meets the band with a crisp edge at y 900.

**Measured** (final default): table against `--room-night` in idle **1.237 at 1280 by 800 (minimum over sizes 1.214)**, 1.562 at lit half at 1280; in the crops `proto-base-crop-desktop.png` and `proto-base-crop-phone.png` (3 times, rendered at device scale 3, room x 160..440, y 850..920) the lit lip runs behind a pewter ring with a dark inside on both sides of the candle. At lit half the dish's ring against its inside is 1.78 to 1 at 1280 by 800 and 1.50 to 1 at 360 by 640, against the table's front face 1.71 and 1.64; the lip against the under-line 1.56 and 1.29 and against the top surface 1.37 and 1.09 (E15 pins floors under these).

### D3. The Window_Light (chosen by eye on the prototype)

Value, reach, falloff, rule and drawing are in 3.3. Chosen values: **night level 0.5** (the owner's decision, F10), **snuffed level 0.09, dawn level 1.0, centre (300, 155), reach 2600 units, seven-stop profile ending at 0.3**, and **the edge shade `--wl-edge` 0.82** from 320 to 800 units either side of the window's axis, held beyond (3.3, R4.22). Combination rule: union `1 - (1 - pool)(1 - window)`. The level eases over 3 s with the dawn. The edge shade was raised from 0.33 (smallest edge patch 33) through 0.70 (18) to 0.82 (11), the highest value that keeps a margin of about a third over the floor of 8.

**Every floor was re-measured on the final default** (wall B, base B2, the warm pool, the receding periphery; all 7 sizes of VIEWPORTS_ART, 7 states, 3 by 3 pixel patches, `prototype/measure.mjs`). **None fails and no floor was changed.**

| floor | requirement | measured |
|---|---|---|
| R3.15 resolved Setting colour between `#05070d` and `#566683` | by construction; scan of the wall pixels outside the halo, the candle column and the window | max wall luminance **0.0953** at lit start (all sizes), 0.0871 to 0.0879 at lit half, 0.0294 at the last minute (ceiling 0.1312); the 44 `--set-*` tokens lie within 0.0030..0.1312 (D5) |
| R3.17 joint against board at the dawn | 1.04 | **1.060** (360 by 640) |
| R3.19 idle: wall, table, frame, Door wood each 1.10 against `--room-night` | 1.10 | wall **1.463**, table **1.214**, frame **1.335**, Door wood **1.112** (minimum over the sizes); glass 1.189. The Door wood is the tightest margin and the reason the edge shade is 0 within 320 units of the axis |
| R3.20 idle wall at the Wall_Samples | 1.10 | board against night **1.303**; joint against board **1.127** (360 by 640; D1) |
| R7.6 edge patch 2 px from the edge at 30, 60 and 80 percent, summed channel difference from `--room-night`, in idle, lit start, lit half, last minute, paused, burned-out | 8 | smallest over all 7 sizes and 6 states: **11** at 1920 by 1080, 2560 by 1440 and 3840 by 2160; **13.8** at 1280 by 800; 76.1 at 768 by 1024 (idle), 85.5 at 375 by 667, 80.9 at 360 by 640 (idle); lit and paused states are higher on the narrow sizes; burned-out 194.5 or more; **2560 by 1080** (not in VIEWPORTS_ART, read for the record) **11**, burned-out 195.1. The tightest margin of the level: an edge shade of 0.88 or more would put the edges near 8 |
| R7.7 idle patch over snuffed patch at each Wall_Sample | 1.10 | **1.422** (200, 150), **1.422** (400, 150), **1.297 to 1.303** (120, 500), **1.261** (480, 500), the same at every size; no snuffed sample is brighter than the same sample in any other state (true at all 7 sizes) |
| R4.10 frame against glass | 1.10 at rest; 1.15 at dawn | idle **1.112**, burned-out **1.294** |

**The candle's light against the window's light, like for like.** One block inside the pool and one outside it, **of the same tone class, at the same distance from the flame and in the same direction as the earlier measurement** (second and third passes), read inside a block at least 4 units from its edges; the ratio is of relative luminance, and the WCAG form `(L_in + 0.05) / (L_out + 0.05)` is next to it. Colours are the mean RGB of a 3 by 3 patch; the same at 360 by 640, 1280 by 800 and 1920 by 1080 (within 0.02).

| picture | inside the pool (tone, position, distance from the flame, RGB; earlier position) | outside the pool (position, distance, RGB; earlier position) | luminance ratio | WCAG ratio |
|---|---|---|---|---|
| lit half (pool radius 420), warm tint on | class 0, (69.2, 658.6), 234, (80.0, 77.1, 83.1); earlier (71, 570) | (28.7, 38.2), **642**, (36, 44, 58); earlier (23, 30) at 652 | **3.08** | **1.691** |
| last minute (pool radius 162), halo on | class 1, (322.9, 750.2), 67, (98.1, 89.0, 82.0); earlier (323, 750) | (347.0, 498.7), 318, (34, 40, 55); earlier (397, 510) | **4.85** | **2.153** |
| last minute, halo hidden (the wall lit by the pool and its tint alone) | class 1, the same point, (82.0, 79.6, 83.0) | the same | **3.80** | **1.836** |

At lit half the earlier outside distance (652) has no point of the tone 4 units inside a block on the 600 by 870 stage, so the distance is 642 (the search moves it by 10 units at a time and reports the distance read). The pool-lit wall is **3.1 times the luminance of the window-lit wall at lit half and 3.8 times at the last minute (4.9 with the halo)**; the pool stays plainly brighter than the wall around it (floor 2.5 to 1, R3.22). Earlier figures for the record: second pass, wall A without the tint, 3.21, 3.42 (halo hidden) and 4.48 (halo on); third pass, wall A with the tint, 3.16, 3.87 and 4.97. The pictures differ plainly by how much wall is lit: at lit start nearly all of it, at lit half a disc of 420 units, at the last minute a patch of about 160 units around the flame.

**The warm tint** (F16, adopted) is in every lit picture; its measured ceiling and cost are in F16.

### D4. Backdrop_Extent

Constants unchanged: `x -2200..2800, y -600..1600`. Aspect range supported: **1:3.5 up to 32:9**. At 1:3.5 (`vw = 360`, `vh = 1260`): scale 0.6, `oy = 330` px, shown y -550..1550, so with the 50-unit margin the need is exactly -600..1600, which is the drawn extent; at 32:9 with `vh = 1000` units: x -1478..2078 (inside by 722 on the left, 722 on the right). The 50-unit margin is exactly met at 1:3.5 and is the limit of the range; a taller page would need a taller backdrop and is not claimed (P4 checks up to 1:3.5).

### D5. The Setting_Tokens

Defined on `.candle-scene` (scene), `.ghost-layer` (ghost eyes) and `#ui .graveyard` (Place, with a contrast test comparing the copied scene tokens, as the existing pattern does). **All 44 `--set-*` tokens of the table are at or below the luminance of `#566683` (0.1312) and at or above that of `#05070d` (0.0021)**; the test of R10.6 reads the stylesheets. (The prototype also has `--sky-star`, a Window_Sky colour and not a Setting_Token.) `--set-mound` was 0.136 in the first draft of this pass and was lowered.

| token | value | L | use |
|---|---|---|---|
| `--set-joint` | `#2b354b` | 0.036 | stone joint (at 0.6 over the wall gradient) |
| `--set-veil` | `#3f4a62` | 0.068 | the Wall_Veil's colour (alpha 0 to 0.75; `--veil` 0.75 and `--wl-edge` 0.82 are numbers, not colours) |
| `--set-stone-0` .. `-4` | `#566683` `#51607e` `#4c5a78` `#58607a` `#5e5c6e` | 0.131 0.116 0.102 0.118 0.112 | block overlays (opacity 0.8, 0.8, 0.8, 0.78, 0.78); classes 3 and 4 are the accents |
| `--set-warm-tint` | `#7d5a34` | 0.119 | the pool's Warm_Tint (alpha 0.42) |
| `--set-table-back` / `-front` / `-seam` / `-edge` / `-face` | `#3b2c1d` `#54402c` `#20170f` `#7d6040` `#3a2b1d` | 0.028 0.057 0.010 0.131 0.027 | table: top surface gradient, under-line, lit lip, front face |
| `--set-dish` / `-rim` / `-in` | `#3a3d45` `#5f636d` `#07090e` | 0.047 0.125 0.003 | holder: bowl, rim, inside |
| `--set-frame` / `-hi` / `--set-sill` / `-hi` | `#3c4660` `#566683` `#4f5b78` `#566683` | 0.062 0.131 0.105 0.131 | window frame, sill |
| `--set-plank-a` / `-b` / `-joint` / `--set-grain` / `--set-recess` | `#7a5a38` `#4a3724` `#140e09` `#33261a` `#0c0906` | 0.117 0.043 0.005 0.022 0.003 | Door planks, joints, fibre, reveal |
| `--set-surround` / `--set-threshold` / `--set-iron` / `-iron-hi` / `--set-rivet` | `#3b4358` `#52607c` `#2c313f` `#4a5268` `#566683` | 0.056 0.116 0.031 0.085 0.131 | arch surround, step, hinges, rivets |
| `--set-earth-a` / `-b` / `-pebble` / `-blade` / `-mound` | `#5b4a3e` `#3a2f28` `#6a5a4c` `#566650` `#745e4c` | 0.075 0.031 0.109 0.121 0.1 | Place ground and relief |
| `--set-stone-side` / `--set-shadow` | `#566683` / `#05070d` | 0.131 / 0.002 | Stone side face, cast shadow (at 0.6) |
| `--set-board-top` / `-front` / `-grain` | `#7a5c3c` `#6a4e30` `#33261a` | 0.121 0.087 0.022 | Shelf board |
| `--set-sky-low` / `--set-hill-far` / `-mid` / `-near` | `#2f3f66` `#121a2e` `#0c1222` `#070a11` | 0.051 0.011 0.006 0.003 | Place sky horizon and hills, lighthouse |
| `--wl-night` / `--wl-snuffed` / `--wl-dawn` | 0.5 / 0.09 / 1 | | Window_Light levels (numbers, not colours) |

Pairs added to the contrast tests (R10.5), with expected figures the build pins (computed estimates; the prototype's own measurement covers the room pixels):

- Ghost eyes `#0b1020` on the body (fill `#c9d6ee` at 0.55 over the brightest room `#566683`): about 8:1 (floor 3).
- Door outline `#efe6cf` on the brightest plank `#7a5a38`: about 5.9:1; handle `#e6c27a`: about 4.1:1; bar `#cfc2a2`: about 4.4:1 (floor 3 each). The Door outline against `--g-face` stays 13.0:1 (the token stays for the existing pair).
- Stub wax `#efe6cf` on `--set-board-top`: about 5:1 (floor 3). Stone edge `#8a93a6` on `--set-earth-a`: at least 3:1 against the ground as drawn under the fixed night mask; the raw 2.73 is not the asserted pair (corrected by Q53).
- Subtle text `#cfc2a2` on `--set-earth-a` (the brightest ground behind text): about 4.7:1 (floor 4.5); ivory on it about 6.8:1.

### D6. Frame, mullions, sill, stars

Inside the pane x 240..360, y 50..260:

- Frame wood: the whole rect (`#3c4660`), highlight lines top and left; glass is drawn above it and masked to four panes.
- Frame width 8: panes x 248..352, y 58..250. **Vertical mullion x 276..282, horizontal mullion y 110..116**: panes `(248,58,28,52)`, `(282,58,70,52)`, `(248,116,28,134)`, `(282,116,70,134)`.
- Sill: y 250..260, full width, lighter top line.
- Stars: nine, `[262,76,r.9] [296,70,.8] [322,66,1] [340,92,.85] [310,100,.8] [292,140,.9] [330,152,1] [318,190,.8] [340,218,.9]`, diameters 1.6 to 2, all inside the panes, none on a mullion. Group opacity `1 - --dawn`.
- The glass keeps `.window-rest` and `.window-dawn`, the two rects `x 240, y 50, 120 by 210`, the group's blur (5) and sRGB, and gains `mask="url(#cw-panes)"`. The blur softens the gradient inside each pane, the mask gives crisp pane edges against the frame.

**The mullion cross is off-centre on purpose.** `scene.spec.ts` samples the glass at the **centre of the pane's box** (300, 155). A centred cross would put a mullion on that pixel and the existing dawn test would fail. With the cross at (279, 113) the centre lies in the large lower right pane, so the existing test is unchanged (R4.11). The window reads as a casement with a narrow fixed light and a transom. F3.

Measured: frame against glass at rest (glass `#1a2540` to `#0d1424`, frame lit by the window): **1.122** in idle (floor 1.10; the frame patch measured `(38, 45, 63)` against glass `(19, 28, 50)` at 1280 by 800), 1.67 at lit start. At dawn the glass takes `--window-dawn` against the frame seen through the wash: **1.294** (floor 1.15). The idle margin is the small one (0.02); `--set-frame` is the knob.

### D7. The ghost look

Three new body shapes, eyes, glow, tilt, offset formula and bound: 3.5. `DRIFT_UNITS` stays 8, `GHOST_BOX` stays 70 by 75, the ghost tokens and opacities stay. Eyes `#0b1020`. The reduced-motion version is the same drawing with the drift and fade off (the prototype's pictures). Legibility at the smallest size: 3.5.

### D8. The Door's construction

Where the wood is drawn, the recess, hinges, latch plate and threshold: 3.6. How the pool values reach it: the Door wood is inside the room SVG, so it reads `.night`'s mask like every setting; no new custom property crosses a boundary (Q10, CR8 not needed). The HTML Door (outline, handle, bar, hit area, key, tab) is **not changed in this pass**.

### D9. The Place

The Prototype mound is 17 units deep; the build mound is 12 by Q50, a known difference too small to require a new prototype picture (corrected by Q50).

Layers, the Doorway_Light, the haze, the stones' side faces, mounds and shadows, the marks and the text backing: 3.7. Decisions:

- **Doorway_Light: an ellipse, radius 760 units stretched 1.7 in x (1292 by 760), peak 0.95**, centred on `(60, 847.5)` (Q28; the first prototype had a 640 ellipse stretched 2; Q1 said about 520). It reaches the Stones' row on the right of the stage and the right edge of a 1280 page near the floor; measured ground colours are in 3.7.
- The sky follows `--dawn` (written by `view-dom.ts`, section 2).
- **Mound:** outer corners at foot + 12; second-row bottom 427 leaves 2 units before count-line y 429 (corrected by Q50).
- **Horizon:** y 224 (it was 196) with a 60-unit haze, three hill layers and the lighthouse. The Stones' row (y 257) and the labels sit on the ground and the haze.
- **Empty dark on the right half of the desktop view:** reduced by the wider ellipse, the haze and the hills only; no new object. The part above about y 400 and beyond x 900 is still unlit (F18).
- The 60-unit fading margin and the opaque core of D18 are removed; the Place covers the room above y = 900 with opaque layers.
- The card keeps its rim `box-shadow` in `--g-panel`.
- Stones and Stubs keep every rectangle (`geometry.ts` unchanged); the Place's rectangles are derived from them, so P11 holds. `ariaSnapshot` of the view is unchanged.
- **Details cards with the current wording** (the first prototype used older words): the Stone card reads `Here lies "…"`, the Stub card `Burned to the end: …`, the lines `Length: 25 minutes`, `Distractions: 5`, `Time away: 6 minutes 50 seconds`, and the unnamed form `an unnamed watch`; the Stone's face says `Unnamed watch`. All come from `src/strings.ts` through `planView`, `visibleHistory` and `cardLines`. **Fit:** with a 77-character intent the card, measured at 360 by 640 and placed by the real `placeCard` with the real label rectangles, is **520 by 167 units** (the maximum is 520 by 240): it wraps to two lines, has seven lines in all, lies inside `CARD_BOUNDS`, covers no label and never covers its item. Both cards (Stone and Stub) are shown at both sizes (`proto-graveyard-card-*.png`, `proto-graveyard-card-stub-*.png`).

### D10. The zone button rectangles and the gap rule

3.8. **G = 8 px** (Let it go dark to Settings). **T = 100 px at 1280 by 800** on both sides (the distance from the outer button to the time-text box; both equal at every viewport because the anchors are symmetric about the stage centre). Padding **P = 16.1 px**, measured spread 0.46 px. Compact layout and compact gaps unchanged.

### D11. The performance budget

| budget | limit | estimate / measured now |
|---|---|---|
| JS + CSS raw in `dist/` | 120 000 bytes (by Q62) | **Measured: 119 760 bytes**, 240 below the cap. The prior 113 to 119 KB estimate was unverified until task 25.2. |
| elements in scene SVG + ghost layer + Place | 415 total (before + 300) | **Measured in the build's maximum-history budget.test.ts setup: 390** (scene 184, ghosts 78, Place 128), 25 below the cap, by Q79. The Prototype's own `count.mjs` count is **375**; the difference comes from counting the maximum history in the build. |
| forbidden filters | none of `feTurbulence`, `feDisplacementMap`, `feMorphology`, `feConvolveMatrix`; no CSS `filter` on a group repainted every frame | none used; the one blur is on the glass group, which has no per-frame property |
| frame interval, lit session, 1920 by 1080, real clock, at least 600 frames | median 17.5 ms or less, 95th percentile 25 ms or less with GPU rasterisation on the author's machine (by Q62); software recorded, not judged | **Measured 2026-11-16:** GPU rasterisation, Intel UHD Direct3D11, 600 frames, median **16.700 ms**, p95 **16.800 ms**. Default software SwiftShader, 600 frames, median **83.300 ms**, p95 **116.600 ms** (information only, not judged by Q62). The script is outside `npm run verify`. |

Rasterising: the `.setting` group is static and sits under a masked rect whose mask changes with the radius only, so a flame redraw does not invalidate it; the frame script decides, and the fallback is one pre-composed mask. The `@property` transition runs only at the dawn.

### D12. Forced colours

`@media (forced-colors: active)`: the Place SVG, the `.setting` group, the `.warm-tint` rect (outside `.setting`, so it has its own selector), the Door wood and the stars are `display: none`; the Door outline and bar take `CanvasText`, the handle `Highlight`; ghost body and eyes take `CanvasText` strokes, eyes `Canvas` fill; the view's text and cards keep the existing `Canvas` and `CanvasText` rules. The room behind is the plain `Canvas`. (Existing rules for the Door `::before` and `::after` are updated for the new construction.)

### D13. The Costume_Reviewer's findings

**First formal pass, 2026-11-16, Kiro CLI costume-reviewer: CHANGES NEEDED.** The owner ran the agent in a separate logged-in session. It read nine named source files, 10 of the 62 build screenshots and two Prototype pictures; it did not read backdrop.ts, ghosts/place.ts, view-dom.ts, ui.css, requirements.md or design D11/D13. Its token contrast figures were hand calculations; the supplied build figures were quoted, not measured by the agent. Its raw output is in KIRO_USAGE.md. The first pass is not a complete 62-picture review; Q80 and Q81 now give outcomes to all three findings. A second reviewer pass remains required.

Three weakest elements, with the reviewer's suggested improvements and the owner's outcome:
1. **Dish and table base at phone size (F1):** the 1x rim is about 2 px tall and hard to name on its own; the candle reads as standing on a ledge. The reviewer suggested a lighter rim, darker inside or taller compact lip. **Accepted by Q81, not fixed.** Eight in-range rim colours reached at most 1.405 with the inside at its night minimum; the `#62656d` / `#05070d` trial read 1.404. The 3 by 3 patch averages the thin ring with its neighbours; the build matches the approved Prototype under Q71 and the task 28.2 3x crop showed the pewter ring and lit table edge. Tokens remain `#5f636d` / `#07090e`; E15's phone floor remains 1.35. Possible later improvement: a thicker dish ring at the compact layout, which would change the approved shape.
2. **Graveyard ground, shadow wedges and unlit right side (F18):** the reviewer suggested shorter or lower-opacity shadows, another subtle falloff, or stronger ground marks. **Accepted as approved picture by Q80; no change.**
3. **Wall courses:** the reviewer suggested more varied joint highlights and moving accent stones away from the pool centre. **Accepted as approved picture by Q80; no change.**

Findings by rule and outcome:
- **Rule 1, state and setting:** wax, flame, pool and ghosts each carry one state; stars are Window_Sky; Place hills and lighthouse are allowed unlit sky. Wall, veil, table, holder, frame and Door wood are inside `.setting`; `.warm-tint` follows the pool's mask and adds no separate light. The Place has its approved Doorway_Light and F18. No impostor or forbidden ornament was found. **Accepted**, with the fixed-seed variant and warm wall accents remaining as approved.
- **F1, phone dish/table (rule 1/4):** **accepted by Q81, not fixed.** The Q80 colour-only trial changed `--set-dish-rim` from `#5f636d` to `#62656d` and `--set-dish-in` from `#07090e` to `#05070d`: ring/inside 1.404 versus Q80's proposed 1.50 target; ring/front 1.665, lip/under 1.291, lip/top 1.089 at phone. Desktop: 1.626, 1.739, 1.559, 1.361. It was reverted. Seven further in-range rim colours with the minimum inside peaked at 1.405 (`#6a6268`). The roughly 2 px ring is averaged with its neighbours by the 3 by 3 sample. Q71 found the build and approved Prototype equal, task 28.2's 3x crop passed, and the candle reads as standing on a ledge. Tokens and E15's 1.35 phone floor remain; a thicker compact dish ring is the possible later improvement.
- **F2, Door bar (rule 1/4):** **accepted by Q80**. It carries the shut state; Q54 pins its contrast. Suggested darker lower edge or iron end caps would add elements and consume the 240-byte margin.
- **Rule 2, reduced motion:** the agent found scene and ghost animations/transitions suppressed and state retained by size, colour and text. It did not read render.ts or view reduced-motion screenshots. **Accepted with that review limit recorded**; existing reduced-motion tests remain the evidence.
- **Rule 3, contrast:** the agent's hand-computed time, ghost-eye, Door, Stub and subtle-text pairs passed; the owner-supplied drawn-ground Stone edge was 3.208 against floor 3. It could not verify all drawn Text_Backing or Door pairs from code. **Accepted with the evidence limits recorded**; the seven-size E7 and contrast tests cover the sampled backing.
- **F3, Stone edge against side face (rule 3):** **accepted by Q80**. The side belongs to the same Stone; the edge's requirement is against the drawn ground, measured 3.208 against 3. The token-only edge/side estimate 1.88 is not the required pair.
- **Rule 4, composition:** the agent found the lit room readable as a candlelit stone room and the Place readable as outdoors; the three weakest elements and outcomes are above. **Accepted except F1**.
- **Rule 5, edges and states:** the agent saw wall to the 4K edge without an empty band, idle a room, and snuffed the darkest with smoke, stub, Door handle and different status. It saw no 4K banding; it did not see a 2560 screenshot. Supplied E14 at 2560/3840 matches the Prototype within 0.5 percentage points, residual 2.987% against 6. Idle joint 1.127488 against 1.10; dawn joint 1.059564 against 1.04. **Accepted with the 2560 visual limitation recorded**.
- **Other checks:** no trademark, real product name or “Pomodoro” found in files the agent read; retake affected screenshots after any visual fix. **Accepted within the reviewed file scope.**

**Second formal pass, 2026-11-16, Kiro CLI costume-reviewer: PASS.** The owner ran the agent in the same separate logged-in setup. It found no new issue requiring a change. It read backdrop.ts, ghosts/place.ts, view-dom.ts, ui.css and render.ts, D11 to D13, the reduced-motion rules, model.ts and flicker.ts, and a small set of phone and reduced-motion pictures. It did not read R10.5 or all Resolved Questions, open the 2560 picture, or inspect every reduced-motion, graveyard or ghost picture. Its contrast and geometry figures are supplied build readings, not measurements by the agent. The raw second-pass output is in KIRO_USAGE.md.

Three weakest elements on this PASS, with improvement and outcome:
1. **Dish at 360 wide:** a thin line in the Prototype crop and a dark disc under the candle at 1x. A thicker compact dish ring could improve it later. **Accepted by Q81:** build equals approved Prototype, the 3x recognisability check passed, and a shape change would change the approved picture.
2. **Door at 360 wide:** roughly 48 by 52 px; planks are hard to separate from the wall, with a small amber handle. Clearer plank separation could improve it. **Accepted:** it remains state-bearing, its bar/handle/border contrast is pinned, and the reviewer raised this only as a note on a PASS; changing its shape or colours would change the approved picture.
3. **Flat wall faces:** one tone per block. Varied per-block highlights could improve them. **Accepted by Q80:** approved Wall B, with element and byte budget constraints.

Second-pass findings and outcomes:
- **Rule 1:** candle, flame, pool and ghosts each carry one state; still wall, veil, table, dish, frame and Door wood receive pool/window light; the unlit hills and lighthouse are sky, no impostor or ornament was found. **Accepted:** matches the approved structure and pictures.
- **Rule 2:** model.ts suppresses flicker and ease, and reduced-motion CSS suppresses scene, ghost and UI motion; reduced shots retain state through size, colour and text. **Accepted:** no motion-only state was found.
- **Rule 3:** supplied joint, Stone edge, text and dish readings pass their retained floors; the reviewer calculated UI text token pairs at about 14:1 and 9.9:1 and quoted time contrast 15.83/7.53. Door bar, Stub wax and ghost eyes were not recalculated in this pass. **Accepted with that limit:** their existing contrast tests remain green.
- **Rule 4:** no new change required. F1, F2, F3 and the first pass's ground/F18 and wall findings retain their Q80/Q81 accepted outcomes. The three weaknesses and later improvements are above.
- **Rule 5:** the inspected phone and desktop wall reaches both edges, idle shows a room, snuffed is darkest and differs by smoke, stub, no flame and status. The reviewer did not see 2560 by eye; the E14 2560/3840 comparison and 2.987% residual supply that check. Idle joint 1.127488/1.10, dawn joint 1.059564/1.04, edge patch 11/8 pass. **Accepted with the visual limit recorded.**
- **Other checks:** no real product name or trademark found in reviewed files; no visible change was made after Q81, so no new screenshot retake was needed. **Accepted within the read scope.**

**Pass 0 is the author's look at the screenshots** of each prototype pass, recorded so the formal passes can be compared.

**Pass 0e (fourth prototype pass, the combined default look the owner approved on 2026-11-15; 24 pictures).** I looked at every picture of the default set after wall B and base B2 became the default: the 14 state pictures, the six graveyard pictures, `proto-lit-half-ultrawide.png`, `proto-lit-half-4k.png` and the two 3-times crops of the base. The three weakest-looking elements now:
1. **The Stones in the Place and the unlit upper right of the graveyard view** (unchanged this pass; the owner left F18 as it is). The Stones are arches of dark navy on a dark ground, 60 by 44 px at 360 by 640, and the upper right of the desktop view is dark. Improvement: lit stone faces (the face colour is an existing token and the Item is a button this spec does not restyle), or a wider Doorway_Light (`sx` 2.2, which brightens the bottom right).
2. **The wall beside the candle at lit start and in idle.** Wall B breaks the grid (stepped joints, uneven stones, quieter tones), but its faces are still flat, one tone to a block, and the joint is a dark outline round every stone at 1280 wide. The floors bind here: the dawn joint ratio is 1.060 against 1.04 and the Door wood 1.112 against 1.10. Improvement: a per-block luminance variation of 3 to 4 percent (a second fixed-seed draw, which one path per tone class cannot give and which costs elements).
3. **The table and the dish at 360 by 640.** They are now recognisable (a ring of pewter on both sides of the candle, a lit lip behind it), but thin: the lip is 1.4 px and the ring about 1 px. Improvement: none within the rules (the table is at most 16 units high and the dish at most 14); a larger candle base would be a change to the candle.

What the combined pictures show: wall B quietens the room, the periphery goes to near-night at 1920, 2560 and 3840 wide with no banding, the pool's warm stone and the flame are the brightest things, and the candle is the first thing the eye lands on at 1280 by 800 and at 2560 wide in idle, lit start, lit half and paused; at the last minute at 1280 the flame still wins, but the wall's central blocks and the ghosts down the left take the second look. The warm stones inside the pool are now muted (`#5e5c6e`), so nothing in the wall is close to the flame's colour.

**Pass 0d (the A/B pass, 14 pictures; superseded by 0e).** Wall B was better than the old wall at 360 by 640 (largest gain) and at 1280 by 800 (smaller); B2 read as a dish on a table at phone size and B1 did not. Its weakest elements were the old wall, the old base and the Stones; the owner chose wall B and B2.
**Pass 0c (third prototype pass, 21 pictures; the wall and the composition).** I looked at every picture, including `proto-lit-half-4k.png` and `proto-lit-half-ultrawide.png`. The three weakest-looking elements now:
1. **The window-lit wall in the middle third of a 1280 or 1920 page.** Beside the candle, in idle, in the last minute and at the dawn, the wall still reads as a brick wall edge to edge between x 100 and 500: the joints are lighter than before (1.17 in idle), but they are still a dark line round every block, and the last-minute picture (a pool of 160 units) has the candle's small light against a quiet but crisp wall. The floors bind here: the dawn joint (1.064 against 1.04) stops a lighter joint, and the Door's wood (1.112 against 1.10) stops a lower window level. Improvement: bigger blocks (fewer joints per screen) or a window level that falls with the distance from the candle's axis only above the Door's height; neither was tried, both change the tile or a floor's margin.
2. **The table and the Holder** (unchanged this pass). Still a strip of about 9 px under the zone's shadow; the dish is a low grey ellipse. Improvement as in pass 0b.
3. **The Stones in the Place** and the unlit upper right of the graveyard view (unchanged this pass, F18 stays). Improvement as in pass 0b.

What the third pass did to the first impression: at 1280 by 800 and at 2560 by 1080 the edges now go to near-night (edge patches 11 and 10 against the floor 8), the pool's warm stone and the flame are the brightest things, and the candle is the first thing the eye lands on in `lit-half`, `lit-start`, `paused` and `idle`. In the last minute at 1280 the flame still wins, but only just: the wall's central blocks and the ghosts down the left side take the second look. The warm stones inside the pool (brown blocks) are close to the flame's colour and are the one thing I would watch in the owner's pictures.

**Pass 0b (second prototype pass, 23 pictures; superseded by 0c, kept for comparison).** The three weakest-looking elements then:
1. **The table and the Holder.** Better than before (a top surface, a lit edge, a pewter rim on both sides of the candle) but still a strip about 9 px high under the zone's shadow; the dish is a low grey ellipse. Improvement: a taller Table_Top is not allowed (16 units); a rim highlight above the shadow line and a table-edge reflection of the flame (a state element) would help, or the zone's 8-unit drop shadow could be shorter (it belongs to `candle-scene`).
2. **The Stones in the Place.** They now have a side face, a mound and a cast shadow, but they are still arches of dark navy on a dark ground, small beside the page (60 by 44 px at 360 by 640), and the unlit upper right of the desktop view is empty. Improvement: lit stone faces (the face colour is an existing token, `--g-stone`, and the Item is a button that this spec does not restyle), or a second light, which Q1 forbids.
3. **The wall reads as a cool grey-blue brick wall, not a candle-lit one.** The pool is clearly lighter (3.2 to 4.5 times in luminance) but it is blue-white; only the halo is warm. The owner adopted the warm tint (F16) and pass 0c is the result.

Also noted: the Door is small (80 by 85 units against a candle of 420) but now reads as a recessed door with hinges and a latch; the snuffed room is dim to the point where the wall is hard to see (it is still 1.03 above night, and darker than idle by 1.28).

**Pass 0 (first prototype pass)** is replaced by the above: its three weakest were the table and the Holder, the Stones in the Place and the wall's repeat.

### D14. The Prototype approval gate

**Approved by the owner on 2026-11-15** (after four prototype passes). The owner's words, as given: "The owner approves the room-art prototype on 2026-11-15, with these choices from the last pass: wall B is adopted, and base B2 is adopted with the candle-scene change request F20 (the zone shadow shortened to 0 -2px 3px). Earlier decisions stand: the warm pool tint (F16), no pool drawn in idle (F15, F17), the receding periphery, the ghost shapes, and F18 left as it is. The approval is final only once the owner has confirmed the combined pictures." After the retake of the 24 default pictures (the A/B files and their jobs removed, every floor re-measured at all seven sizes and seven states, the like-for-like pool figure measured), **the owner confirmed the combined pictures** ("The owner confirms the combined pictures. Continue with steps 2 to 4."), so the approval is final. The choices:

- **Wall B** (F19, D1): adopted. **Base B2** (F20, D2): adopted, with the `candle-scene` change request CR12 (the zone's shadow `0 -2px 3px`).
- **Standing decisions:** the warm pool tint (F16); no pool drawn in idle (F15, F17); the receding periphery (the Wall_Veil and the Window_Light's edge shade, D1 and D3); the three ghost shapes (D7); F18 left as it is (the upper right of the graveyard view stays unlit).
- `tasks.md` is written (R12.9). Requirements amended: Q35 to Q42 and the criteria they name. The design's section 8 lists the changes to other specs and to `src/` as changes for the first build task; none is made yet.

### D15. The idle and snuffed difference

- Chosen: Window_Light **0.5 at night, 0.09 snuffed**, with the edge shade (3.3). **Measured on the final default (wall B, base B2; all 7 sizes, `measure.mjs`):** idle patch over snuffed patch at the four Wall_Samples **1.422 (200, 150), 1.422 (400, 150), 1.297 to 1.303 (120, 500), 1.261 (480, 500)**, the same at all 7 sizes (the Wall_Samples are read at the centre of the nearest block, D1); floor 1.10. Idle against `--room-night` at 1280 by 800: wall **1.463**, table **1.237**, frame **1.335**, Door wood **1.123**, glass 1.189 (floor 1.10 for the first four; minima over all sizes 1.463, 1.214, 1.335, 1.112). The second pass's figures (1.311, 1.344, 1.325, 1.277; wall 1.353) and the old wall's (1.346, 1.389, 1.350, 1.309; wall 1.398) are not true of the final look.
- Snuffed against `--room-night` at 1280 by 800: wall **1.039**, table 1.029, frame 1.032, Door wood 1.018 (it is the darkest state; the wall is hard to see).
- Three differences that are not brightness, all read from what the scene already draws (R4.21): **the smoke wisp** (`opacity` 1 in snuffed, 0 in idle: `--smoke`), **the candle** (a whole candle of 420 in idle, the 28-unit stub in snuffed), **the status line** (`The candle waits.` and `The flame is out.`). In idle the pool and its tint are not drawn (F15). E12 checks all three, the luminance ratio, and that the pool is not drawn in idle.

### D16. The fourth reviewer rule and how its findings are stored

The rule is the exact sentence of CR1 ("The picture reads at a glance as a candlelit room at night, and the graveyard as a place outside it. Name the three weakest-looking elements and what would improve each."). Its findings are stored **in this document, D13**, one dated block per pass (verdict, the three weakest elements, what would improve each), appended by the final task; a PASS without three named elements is not accepted (R11.10). The reviewer's raw output is kept in `KIRO_USAGE.md` by the same task.

---

## 5. Correctness properties

All run through `PROP_PARAMS` (300 runs) in `*.prop.test.ts` colocated with the source. "Mutation" is the change to the code under test that must make the property fail.

| ID | Generator | Checks | Mutation that must fail it |
|---|---|---|---|
| P1 | `fc.integer(0..11)` slot, `fc.nat()` index, `fc.double(0.25..1)` size; drift at the four corners `(Â±8, Â±8)` | the tilted box at `size`, at `placeGhost`'s offset plus the drift, lies inside `GHOST_CELLS[slot]` (R5.6, R5.7, R5.11); at size 1 `|dx|, |dy| <= 2` | allow tilt 6 degrees; drop the `- 8` drift from `spareX`; `spareY` with `47.5` replaced by `50` |
| P2 | same triple, plus a second array of other ghosts | `placeGhost` and `ghostLook` equal themselves on recompute and ignore other indexes (R5.5, R5.9, R1.11) | read `Math.random` in `ghostLook`; make `fx` depend on the count of ghosts |
| P3 | `fc.integer` start index, 6 consecutive same-parity indexes, size array each <= 0.5 | resting x span >= 8; `variant` in {0,1,2} and `= index mod 3` (R5.5, R5.8) | set `fx` constant; use `index mod 4` |
| P4 | `vw 360..3840`, `vh 640..2160`, aspect filter 1:3.5..32:9 | `backdropExtent` contains the viewport's room rectangle with a 50-unit margin inside the drawn extent (R7.2, R7.5) | shrink `BACKDROP.x1` to 2400; drop the `oy / scale` term |
| P5 | same viewports | `backdropExtent` scale and offsets equal `stageBox` of `layout.ts` (R7.4, R7.5) | use `max` instead of `min` for the scale |
| P6 | `x` in -2200..2800, `y` in -600..1000, `flameY` in 400..820, `r` in 0..1, `dawn` in 0..1, `phase` | `lightAt` in [0, 1]; non-increasing in distance (pool and window each); non-decreasing in `r`; `poolLight = 0` outside the pool and at `r = 0`; outside the pool `lightAt = windowLightAt`; **`windowLightAt` at fixed `y`, `r`, `dawn` is non-increasing in `abs(x - 300)`, equals its unshaded value for `abs(x - 300) <= 320`, and equals 0.18 of it for every `abs(x - 300) >= 800` (the same at 800 and at 1500: an ultrawide page is no darker at its edge than a 16:9 one); `edgeShade` reads neither `r` nor `dawn`; with the pool over a point at `abs(x - 300) >= 800` `lightAt` still equals the pool's value or more (the pool is not attenuated); `tintAt = 0` outside the pool, at `r = 0` and in idle (`poolRadiusDrawn`), and `tintAt <= 0.42`; `veilAt` is 0 up to 320 and 0.75 from 800**; the `poolLight` stops equal the stops of `#cw-pool-hole` parsed from `ROOM_SVG`; `windowLight`'s profile stops equal the stops of `#cw-win-hole`; **the stops of `#cw-win-edge-grad` equal `0.82 * edgeShade`'s shape, the stops of `#cw-veil-grad` equal `veilAt`, and the stops of `#cw-tint-hole` equal `poolLight`'s stops with alpha `WARM_TINT.alpha` (R1.6, R1.7, R3.18, R4.15, F16)** | change one stop of `ROOM_SVG`'s hole; use `max` for the union; let `poolLight` return 1 at the edge; **drop the `(1 - edgeShade)` factor; apply the shade to the pool; let `edgeShade` fall again beyond 800; read `dawn` in `edgeShade`; set the veil's far alpha to 1; draw the tint in idle** |
| P6b | `fc.constantFrom(phases)` and engine scripts | the Place's `--dawn` equals `sceneModel(state).dawn` for every state (section 2) | write `1` for `idle` |
| P7 | the `STARS` list, `dawn` in 0..1 | every star circle (centre Â± r) lies inside one pane and on no mullion; the list is constant between calls; opacity function `1 - dawn` is 1 at 0 and 0 at 1; at most 9 stars, diameter 1 to 2 (R4.4 to R4.7) | move a star onto a mullion; make a star's radius 1.4; make opacity depend on `r` |
| P8 | every `--set-*` token parsed from `scene.css`, `ghosts.css`, `graveyard.css` (**including `--set-veil` and `--set-warm-tint`**); `fc` over `x`, `y`, `flameY`, `r`, `dawn`, `phase` and `isWall` | luminance in `[L(#05070d), L(#566683)]`; **`settingColour` (the token mixed with the veil by `veilAt` and with the tint by `tintAt`) stays in the range for every token, and `litColour` stays in the range at any point and phase** (R3.15, R10.6) | set one token to `#8e96a9`; **set `--set-warm-tint` to `#ffb347`; set `--set-veil` to `#8e96a9`** |
| P9 | `fc.double(0..1)` wax height | the Holder's and the table's markup is **before** `.candle` in `ROOM_SVG`; the holder's box is inside x 236..364, height <= 14; the table is <= 16 high; the drawn candle height equals `candleHeightUnits(model)`; no Holder or table path lies above y 886 (R3.9, R3.10; see F1) | move `.holder` after `.candle`; make the holder 16 high |
| P10 | every integer `vw 360..2560`, `vh 640..1440` (`fc.integer` pairs plus the four named sizes) | the placed zone buttons are 44 high; wide: padding `(W - 28 - label) / 2` is within 1 px across the three buttons and across the two Pause/Resume states, using the label table; `G = 8`; the two `T` agree within 1 px; and every clause of `controls-and-access` P10 (inside the viewport, at least 44 by 44, at least 4 px apart, clear of the keep-clear rectangles, order Pause or Resume, time text, Let it go dark, Settings) (R9.1 to R9.5) | set Settings' width to 96; anchor Pause at `textArea.x - 8` |
| P11 | `fc.array` of history entries, the real limits `S`, `D`, `K` | sky, hills and ground are Surfaces exempt as Text_Backing under R8.12/Q22; no board, mound, stone side, stone shadow or ground mark intersects any text-line rectangle (labels, date labels, "+n more", count lines); ground contains every Stone foot and Stub; every Item rectangle equals `geometry.ts` (corrected by Q48) | widen a board to 130 past the "+n more" rectangle; let one ground mark ignore avoid and land on the Graveyard label rectangle (corrected by Q48) |
| P12 | engine scripts of `light`, `pause`, `resume`, `snuff`, `tick`, `hide`, `show` interleaved with `{ viewSwitch, openCard, reducedMotion, ghostsOff }` | the engine state after the script equals the state of the script without the art-only inputs (R2.1, R2.2) | make `openCard` dispatch `tick` |
| P13 | `r` in `(0, 1]` pairs, `dawn` 0 and 1, `x` | `windowLight(r, 0)` equal for all `r > 0`; `windowLight(0, 0) <= windowLight(r, 0)`; `windowLight(r, 1)` equals the dawn level for every `r`; `lightAt` non-decreasing in `dawn` at night levels; **`windowLightAt(x, y, r, dawn)` at `abs(x - 300) >= 800` equals 0.18 of `windowLight(r, dawn)` times the profile, for every `r > 0` and at both `dawn` 0 and 1 (the shade applies at the dawn too), and at `x = 300` equals the unshaded value** (R4.15 to R4.19) | let `windowLight` return `night * r`; set `snuffed` above `night`; **let the shade depend on `dawn` or on `r`** |
| P14 | `fc.integer()` seeds plus the shipped seed 20261204 | wall B's generator (`wallCoursesB(seed)`): eight courses of 64 to 96 units (corrected by Q45); each course's widths lie in 105..240 and sum to 960; vertical joints of neighbouring courses (and of the last and the first) at least 30 units apart; every bottom offset in -6..6 and neighbours in a course differ by at least 3; no accent touches an accent above or below it, including across the tile edge and last/first course; accents may sit beside each other (Q49; corrected by Q49); two calls equal and independent of anything but the seed; for the shipped seed the joint width at every block centre that has a joint below (corrected by Q44) is at least 3.4 units (R1.11, R3.1, R3.2) | set the stagger gap to 10; allow a width of 250; let neighbouring offsets differ by 1; drop the courses above and below from the accent check (corrected by Q49); read `Math.random`; shrink the inset so a joint is 2 units |

Properties kept unchanged: `candle-scene` P1 to P8, `controls-and-access` P1 to P10 (P10 extended by CR2), `ghosts-and-graveyard` P1 to P16. The properties of this spec are P1 to P14 (P6b is the sixth's companion).

---

## 6. Playwright tests

All pause `page.clock` before load (`pauseAt`, `goto`, `runFor`), build stored sessions with the engine's serializers, and use no test hook in shipped code. Pixel reads are 3 by 3 patches converted from room units by `stageBox`; the Wall_Samples are moved to the block centre beside the sampled joint by a fixture helper that skips null joints (corrected by Q44) and reads the blocks of `wallBlocks` (never fixed pixels; the joint is read on its own centre line below the block). Mutation = the change that must fail the test.

| ID | Test | Criteria | Mutation |
|---|---|---|---|
| E1 | At lit start and last minute: a wall point between the two pool edges is brighter at lit start; a point inside both pools differs by 2 units or less; a point outside both pools in the window's reach differs by 2 or less; the glass differs by 2 or less | R1.7, R4.8, R4.16 | scale the window level with `--light-radius` |
| E2 | At each of the 7 VIEWPORTS_ART sizes, in idle, lit start, paused, burned-out: left and right edge patches (2 px in, at 30, 60, 80 percent) at least 8 summed units from `--room-night`; no scrollbar; **at 2560 by 1080 (a 32:9-like page, not in VIEWPORTS_ART) the same patches are at least 8 too: the edge shade is held beyond 800 units (the mutation: let it fall again)**. **The test also asserts that a patch on a horizontal joint passes** (it picks the 1920 by 1080 case) | R7.1, R7.6, R7.8 | set `--set-joint` opacity 1 |
| E3 | Wall joint and board at least 1.10 near the candle at lit start and, in idle, at the two top Wall_Samples (the board read at the block's centre, the joint on its own centre line below it; at 360 by 640 the idle joint ratio, the thinnest margin at 1.127, is read and asserted at least 1.10); the Frame seen at lit start and in idle, with the computed fill and stroke of `.f-wood`, `.f-hi`, `.f-sill` and `.f-sill-hi` identical at lit start and last minute and frame/glass at least 1.10 in both (by Q64); the column residual of `stripes.mjs` **read with the edge shade and the Wall_Veil switched off** (`.wall-veil` and `.win-edge` hidden, the whole page width) at most 6 percent of the mean at 1280, 1920 and 2560 wide (measured 2.9, 3.2 and 3.1 percent; the intentional edge fade is checked by E2 and is not counted as a repeat; the limit is not raised; the figure within 320 units of the window's axis is recorded but is dominated by the window light's own falloff over so narrow a range, so it is not a limit); stars seen in every non-dawn state, hidden at dawn; the existing dawn-glass test uses summed channels and `--window-dawn` within 6 (by Q64) | R3.2, R3.20, R4.2 to R4.11 | remove the mask from `.window` (the frame vanishes); move the cross to the centre (the dawn test fails) |
| E4 | The candle body's height over its start height equals the wax height at five wax heights (existing); the Holder covers no `.body` pixel (compare the body's patch with and without the holder group hidden) | R3.9, R3.10 | draw the holder after the candle |
| E5 | With 1, 5, 12 and 21 distractions at 1280 by 800 and 360 by 640: every ghost box inside its cell and outside the candle column, the Door and the controls; x in a column not all equal; reduced motion gives the same positions and zero animations; ghosts off shows none | R5.6, R5.8, R5.11 to R5.13 | drift 12; constant `fx` |
| E6 | Usable Door: handle, no bar (DOM and a pixel patch at the handle); shut Door: bar, no handle; hit box at least 44 by 44; Tab never reaches the shut Door; forced colours drop the wood | R6.2 to R6.9 | show both |
| E7 | The Place at 7 sizes: no scroll; the sky and the ground reach both edge patches; every Item and card inside the viewport; **each text line measured at least 4.5:1 against its worst of eight backing pixels just outside its box but inside its own item or line rectangle, after only text-bearing leaf elements are hidden for two animation frames (by Q77, amending Q76/Q70)**; the `graveyard-a11y.spec.ts` snapshots pass unchanged; no pixel of the candle, flame, halo or a room ghost inside a text line's rectangle; forced colours hide Place and other art via selectors that win over normal display (by Q66) | R8.2, R8.3, R8.9, R8.13 | lengthen the Doorway ellipse to cover the subtle text with a bright board; remove the Place hide rule (by Q66) |
| E8 | The three zone buttons are 44 px high; at 1280 by 800 and 1920 by 1080 the padding spread is at most 1 px at lit start **and paused**; the Let it go dark to Settings gap is 8 within 1 px; the two T agree within 1 px; the label strings of `strings.ts` fit the bound of 3.8 with the real font | R9.1 to R9.3, R9.7, R9.9 | restore the old widths |
| E9 | For each state, reduced motion on and off: every Still_Setting reading (wall, table, frame, Door wood patches) equals within 2 units, ghost positions equal, and computed art animation/transition durations are 0 s; flame and halo patches are exempt while the flicker properties hold their still values over two frames 500 ms apart (by Q65) | R10.7 | add an animation to a setting rule |
| E10 | `headers-local.spec.ts` and `live.spec.ts` unchanged; the console shows no CSP violation | R10.2 | add a `style` attribute |
| E11 | The 62 screenshot files exist and are retaken by the screenshot tests | R11.8, R11.9, R11.14 | skip one |
| E12 | In idle the `.pool` circle has `display: none` (computed) and, at lit start, it has not; in idle, Wall_Samples at least 1.10 brighter than in snuffed; the setting at least 1.10 from `--room-night` in idle; computed opacity of `.smoke-wisp` 1 and 0; the `.body` and `.stub` boxes (`STUB_H` against `CANDLE_H`); the status text equals `strings.status.snuffed` and `.idle` | R3.19, R4.21, R7.7 | set `--wl-snuffed` to 0.6 |
| E13 | Outside `npm run verify`: with JavaScript disabled `prototype/index.html` opens; every non-idle section id shows its picture (`:target`), with count equal to the HTML section inventory (currently ten plus idle, by Q72); the 24 screenshot files exist; a Vitest check compares `tokens.json` with the stylesheets and the geometry constants of `src/`; after `npm run build` no file of the prototype is in `dist/` | R12.1 to R12.6, R12.11 | rename a section id |
| E14 | The periphery at 1920 by 1080, 2560 by 1440 and 3840 by 2160 (and 2560 by 1080): with `.setting`, `#ui` and ghosts hidden, the wall's mean-luminance outward rise and four-pixel step each agree with the served Prototype within 0.5 percentage points (by Q69, amending Q63); the edge patches are at least 8 summed units from `--room-night`; no vertical banding (largest step read between neighbouring 4-pixel column means beyond 320 units from the axis); with setting shown but `.wall-veil` and `.win-edge` hidden the idle wall's column residual is at most 6 percent at 1280, 1920 and 2560 wide | R7.6, R7.11, R7.12 | let the edge shade fall again beyond 800 units; put a step in the veil gradient; raise the shade to 0.9 |
| E15 | The candle's base at lit half, at 360 by 640 and 1280 by 800: the dish ring (room x 244, y 891) against its inside (x 259, y 891.6) at least 1.35 at phone (Q71, retained by Q81) and 1.4 at desktop and against the table's front face (x 150, y 896) at least 1.5 to 1; the table's lip (exact-pixel row mean at y 890.2, by Q71) against its under-line (y 891.9) at least 1.2 to 1 and against its top surface (y 886.5) at least 1.05 to 1; the zone's shadow (the picture with the zone's filter on and off) has its first half-dark row at room y at least 896.5 (by Q71); the time text and the status line keep their 15.83 rest and 7.53 dawn figures. The paired Prototype/build read was completed; Q71 resolves the measurement method. | R3.24 | restore `0 -8px 6px`; draw the dish rim at y 886..891.6 |

Existing Playwright files that must pass unchanged are those listed in the requirements, with the edits of section 7.

---

## 7. Existing tests that change on purpose (R11.3, CR2, CR3, CR4)

**Owner-approved batch 1 CR12 exception: `e2e/controls-polish.spec.ts`, "the top edge of the zone band melts into the room instead of ending in a line" (Q43).** Only this test changes. Its fixture remains `FIXTURES.burnedOut`, viewport 1280 by 800, x = 100, floorY = 720; `colourAt` remains the 3 by 3 mean and distance remains the maximum channel difference from `--zone-bg-brightest` (`[75, 67, 88]`). The approved B2 shadow remains `0 -2px 3px`.

| px above floor | distance from zone colour |
|---|---|
| 1 | 4.777778 |
| 2 | 8.444444 |
| 3 | 10.888889 |
| 4 | 13.111111 |
| 5 | 14.777778 |
| 6 | 15.666667 |
| 8 | 16.333333 |
| 30 | 15.000000 |

- **Old assertion:** sample 2, 8 and 30 px above the floor; assert `near < middle < far` and `near < 8`. With the short shadow, 2 px reads 8.444444, and the 8 px sample (16.333333) is not below the 30 px sample (15). The latter two are outside the useful short-shadow transition; the dawn wash there is not monotone.
- **New assertion:** sample 1, 3 and 5 px inside the shadow's reach and assert `near < middle`, `middle < far`, and the unchanged `near < 8` (4.777778 < 10.888889 < 14.777778). Sample 30 px separately as `room` and assert only `room > 8` (15), showing that the surrounding room differs from the band; assert no order between `room` and the shadow samples. This tests a gradual edge rather than a hard one-pixel step, without weakening the nearest limit or changing the shadow.
- **Mutation:** remove only `.zone-dawn`'s drop-shadow, rebuild and run this test. It fails at `middle < far` (16.222222 is not below 16.111111). Restore the shadow; a guard and `git diff` confirm that `scene.css` contains exactly CR12 relative to HEAD. The rewritten test passed before the mutation; the restored build is checked again by batch 1's full verification. No screenshot file is saved by this measurement.


**`src/scene/room.test.ts` (CR4, R11.3):**

1. *"has the seven layers in the documented order, with .zone last"* (`describe` "layers"). Old: `order = [wall, night, dawn-wash, window, candle, lit, zone]` found in that order. New: `order = [wall, setting, night, dawn-wash, window, candle, lit, zone]` (eight layers) and the new assertion that `class="stars"` lies between `window` and `candle`. Reason: R3.12 inserts `.setting`; the stars belong to the window layer. The "nothing is painted after the zone's group closes" half is unchanged.
2. *"has no grain, texture or other decoration-only layer (costume review, second pass)"*. Old: `not.toMatch(/grain|feTurbulence|<pattern\b/)`. New: zero `feTurbulence`; zero `<pattern>` outside `.setting`; no `id="..."` containing "grain" (class names are not checked). Reason: A16 and R3.1: a lit wall texture is allowed, the expensive filter is not.
3. *"has no table, dish or floor element (F1, F2)"*. Old: `not.toMatch(/class="[^"]*\b(table|dish|floor)\b/)`. New: every element whose class token is `table`, `holder`, `dish` or `floor` is a descendant of `.setting`. Reason: A13, R3.4, R3.7.
4. *"is only its two pane rects, with no frame, sill or curtain"* (`describe` "the window (F3)"). Old: the `.window` group's inner markup has exactly 2 rects and nothing else. New: the same (still exactly the two rects with classes `window-rest` and `window-dawn`); the group has `mask="url(#cw-panes)"`; the frame and sill exist only inside `.setting .frame`. The test "the two panes cover the same area: x 240..360, y 50..260" and "soft edges" stay unchanged (R11.4).

Tests that **must keep passing unchanged** and were checked by reading against the new markup: "uses no raster ... every url is `#cw-...`" (my ids are `cw-win-hole`, `cw-panes`, `cw-door-clip`, `cw-table-grad`, `cw-stone`, all `[a-z-]`), "prefixes every id with cw-", "nothing but the zone is painted below the floor line" (the table is exactly y 884..900), ".wall and .night end at the floor line" (`class="wall"` is exact; `wall-stone` is a different class), the mask test, the pool test (the new circle has class `win-light`, not `pool`), the `.lit` group and clip tests.

**Additions to the same file and checks of other files (fourth pass).** `room.test.ts` gains: the `.warm-tint` rect lies between `.setting` and `.night`; the pool mask holds `.win-light`, `.win-edge` and `.pool` in that order and `.mask-all` first; `.wall-veil` lies inside `.setting` after `.wall-stone` and before `.table`. `scene.css.test.ts` *"has no table, dish or floor in the stylesheet (F1, F2)"* passes unchanged: the setting's selectors are `.t-*`, `.h-*`, `.s-*` and `--set-*`, none is `.table`, `.dish`, `.floor` or `--table`, `--dish`, `--floor`; if the build names such a selector the test changes on purpose, with its reason recorded. Its zone-shadow test (lines 158 and 159) matches any pixel numbers and passes with `0 -2px 3px` (CR12). The `scene.spec.ts` idle tests that read the pool region are checked in the build (CR13).

**`src/ui/layout.test.ts`, `layout.prop.test.ts`, `e2e/controls-layout.spec.ts` (CR2):**

- `controls-layout.spec.ts`, *"1280 x 800 at rest and while a session runs"*. Old assertions: at rest `#settings-button` `[976, 738, 96, 44]`, `#status` `[312, 764, 656, 20]`; running `#pause` `[344, 738, 128, 44]`, `#snuff` `[808, 738, 160, 44]`, `#settings-button` `[976, 738, 96, 44]`, `#status` `[488, 764, 304, 20]`. New: at rest `#settings-button` `[956, 738, 111, 44]`, `#status` `[332, 764, 616, 20]`; running `#pause` `[374, 738, 98, 44]`, `#snuff` `[808, 738, 140, 44]`, `#settings-button` `[956, 738, 111, 44]`, `#status` `[488, 764, 304, 20]` (unchanged). Reason: R9; the status rectangle follows Settings' left edge.
- `layout.test.ts` gains a wide-layout table for 1280 by 800 with these rectangles (today it has no zone assertions for the wide layout; its compact table and the keep-clear table are unchanged).
- `layout.prop.test.ts` (P10): gains the equal-padding, G and T clauses (P10 of section 5) and the `resume` rectangle; every existing clause stays.
- `controls-a11y.spec.ts` keeps names, roles, Tab order and focus ring (R9.6) and gets a new comparison with the values before the change; `view.test.ts`'s "narrow rectangle while Pause and Let it go dark are shown" compares with the function result and is unchanged, plus a case for the `resume` rectangle.

**`ghosts-and-graveyard` (CR3):**

- `slots.test.ts`: *"the slot table of L4, row by row"* and the constants test: unchanged (`GHOST_SLOTS` stay the cell centres, `DRIFT_UNITS` 8, `GHOST_BOX` 70 by 75).
- `silhouette.test.ts`: the four existing tests are run for each of the three body shapes (`it.each`). "Fits the box" and "one closed subpath" and "finite numbers in pairs" hold unchanged. **"Touches the box on all four sides" changes on purpose:** old: min and max x are -35 and 35 and min and max y are -37.5 and 37.5; new: the shape touches the top (y -37.5) and the bottom (y 37.5), reaches 35 on the side of its wisp, and its other side is within 14 units of the box (at x <= -21 or >= 21). Reason: the new shapes are narrow-shouldered and asymmetric (R5.5, Q33); the box and the cell bound are unchanged, which P1 checks.
- `e2e/ghosts.spec.ts` and `e2e/graveyard-fixtures.ts` ("ghost readings"): they read `GHOST_SLOTS[k]` as the resting centre today; they read `placeGhost(slot, index, size)` instead (R11.5). Old: expected centre `(cx, cy)`; new: `(cx + fx * spareX, cy + fy * spareY)`.
- `contrast.test.ts` (ghosts): adds the eyes pair; the stroke and fill pairs unchanged. `contrast.test.ts` (graveyard): adds the Door bar, handle and border pairs and the Place's text pairs; every existing pair keeps its figure.
- `purity.test.ts` in the three folders: each new file added to the pure lists; every check kept.
- `view-dom` hidden panel: the `.panel` element is no longer built; `plan.test.ts`, `geometry.test.ts` and the other view tests do not read it.

**E-tests (corrected by Q44):** the Wall_Sample fixture helper skips blocks whose joint is null.

`scene.css.test.ts` figures, `model.test.ts`, `model.prop.test.ts`, `flicker.*`, `types.test.ts`, `render.test.ts`, `scene-kit.test.ts`, `purity.test.ts` (scene) pass unchanged (R3.13, R3.14).

---

## 8. Changes the first build task applies to other files (listed, not made)

Not edited by this design phase. All are from the Amended Rules table and the Change Requests, applied by the first build task and recorded in `KIRO_USAGE.md`:

- **A1, A2, A9, CR5** `.kiro/steering/product.md` (the rule paragraph, the new row "Setting (wall, table, holder, window frame, door wood, ground)" in the table), `.kiro/steering/tech.md` (the Scene paragraph and the performance budget of D11).
- **A3 to A6** `.kiro/steering/scene.md` (first paragraph, the look bullets 3 and 4, the contrast bullets: the new pairs and the "setting colours stay between the stops" bullet).
- **A7, A8, CR6** `.kiro/steering/structure.md` (line 98 and the folder list: `setting.ts`, `light.ts`, `backdrop.ts`, `ghosts/place.ts`, `graveyard/place.ts`; 62 screenshots).
- **A10, CR7** `docs/BRIEF.md` section 4 first paragraph.
- **A11 to A16** `candle-scene` `requirements.md` (R11.8, R8.7) and `design.md` (F1, F2, F3, 17.3 pass 2).
- **A17 to A21** `ghosts-and-graveyard` `requirements.md` (Introduction last bullet, R4.8) and `design.md` (D8 and D18, D23, the L11 table rows).
- **A22, CR2** `controls-and-access` `requirements.md` R8.6 and `design.md` section 6 (zone widths); `src/ui/layout.ts` (`ZONE_WIDTHS`, `zoneControls.resume`, the wide rectangles), `layout.test.ts`, `layout.prop.test.ts`, `e2e/controls-layout.spec.ts`; `src/ui/view.ts` (choose the `resume` rectangle).
- **A23, A24, CR1** `.kiro/agents/costume-reviewer.json` (description and prompt: the four checks of rule 1, rule 2 and 3 additions, the fourth rule exactly, rule 5).
- **A26, CR9, CR10** `.kiro/specs/sound-and-title/tasks.md` (25.x, 26.1), `design.md` (8.6, 8.5), `requirements.md`: new art, the 62-file list, the rule, the checklist, fixtures that read room units; only after `sound-and-title` batch 3 is committed and never while its build runs.
- **CR3** `src/ghosts/layer.ts`, `silhouette.ts`, `ghosts.css`, `src/graveyard/view-dom.ts`, `graveyard.css`.
- **CR4** `src/scene/room.test.ts` (section 7).
- **CR8** not needed (section 2): no change to `main.ts`.
- **Decided by the owner, for the build:** F15 and F17 (`scene.css`: the idle rule for `.pool` and `.pool-tint`, `scene.spec.ts` idle checks, CR13), F16 (the warm tint: its rect, mask and tokens, with the amendments of F16), F19 (wall B: the generator, the pattern, `setting.ts`), F20 (base B2 with CR12).
- **A27 to A29, CR12, CR13** `candle-scene`: `src/scene/scene.css` lines 176 to 178 (the zone's shadow `0 -8px 6px` becomes `0 -2px 3px` in `.zone-rest` and `.zone-dawn`, and the comment), the rule that hides `.pool` and `.pool-tint` in `idle`; `requirements.md` R7.4 and Decision Q1, R7 (constant intensity), and `design.md` 6.3; the 21 `candle-*` screenshots are retaken (62-file list). `scene.css.test.ts` lines 158 and 159 pass unchanged.
- **For `src/`, by the build tasks (not task 1):** `src/scene/setting.ts`, `light.ts`, `backdrop.ts` (new, pure, with their property tests P4 to P8, P13, P14); `room.ts` (the `.setting` group with the wall pattern of wall B, the Wall_Veil, the table, the holder, the frame, the Door wood; the `.warm-tint` rect and its mask; the Window_Light hole, the `win-edge` rect, the star group and the pane mask), `scene.css` (the setting rules, the `@property --wl-k` level easing, the stars, the tint and idle rules, the zone shadow), `src/ghosts/place.ts`, `layer.ts`, `silhouette.ts`, `ghosts.css`; `src/graveyard/place.ts`, `view-dom.ts`, `graveyard.css`; `src/ui/layout.ts` (`ZONE_WIDTHS`, `zoneControls.resume`, the wide rectangles), `view.ts`, `ui.css`; the tests of section 7; `e2e/` (E1 to E15 and their fixtures); `scripts/frame-budget.mjs` and the budget tests (D11); `eslint.config.js` already ignores `.kiro/specs/room-art/prototype`.

---

## 9. Findings against the requirements, and what the requirements now say

F1 to F14 were put to the owner after the first pass. The owner accepted F1 to F7, F11, F12, F13 and F14 as proposed, decided F9 and F10, and asked for the lighthouse; `requirements.md` was amended for each (Q19 to Q34). The rest of this pass adds F15 to F18.

| # | Finding | Status |
|---|---|---|
| F1 | P9 and R3.7: a dish under a candle meets the candle's rectangle | **Accepted**; R3.10 and P9 now say "covers no pixel, drawn before the candle" (Q19) |
| F2 | E3 "Frame is dark at the last minute" contradicts the constant Window_Light | **Accepted**; E3 reworded (Q20) |
| F3 | A symmetric mullion cross would sit on the pixel the dawn test samples | **Accepted**; mullions off-centre, R4.1 (Q21) |
| F4 | R1.8(b) makes the wall an Impostor | **Accepted**; applied to Props, Surfaces listed (Q22) |
| F5 | Tilt 6 degrees leaves the cell at size 1 | **Accepted**; 0 to 3 degrees, R5.5 (Q23) |
| F6 | A 3 by 3 patch can land on a joint | **Accepted**; joints never black, tests read the block centre; R3.1, R3.2, R3.20, R7.6 (Q24) |
| F7 | Dawn margin of frame against glass | **Accepted**; the margin is recorded, 1.294 (Q25) |
| F8 | The wall repeats every 960 units | Stays; no column of like stones (D1) |
| F9 | The Window_Light level jumps at the dawn | **Done**: 3 s transition, 0 s with reduced motion (Q26, 3.3) |
| F10 | The window makes the last minute less dark | **Decided**: night level 0.5, every floor re-measured, none fails (Q27, D3) |
| F11 | The Doorway_Light is not 520 | **Accepted**; now an ellipse 760 by 1.7 (Q28) |
| F12 | The prototype keeps the pattern in the top `<defs>` | **Accepted**; the build puts it in `.setting` (Q29) |
| F13 | One width cannot give equal padding for "Pause" and "Resume" | **Accepted**; two widths (Q30) |
| F14 | Say what was measured where | **Accepted**; now all seven sizes and seven states (Q31) |
| **F15** | **In idle the pool at `LIGHT_MIN` shows as a pale patch above an unlit candle.** | **Accepted by the owner (no pool drawn in idle)** |
| **F16** | **The pool is blue-white, not candle-warm.** | **Adopted by the owner: the warm tint is the default look; the pool must stay plainly brighter than the window-lit wall (ratio recorded in D3)** |
| **F17** | **Seven requirement lines use "the pool at LIGHT_MIN in idle".** | **Accepted by the owner** |
| **F18** | **The upper right of the graveyard view is still unlit.** | **Stays as it is (owner's decision)** |
| **F19** | **The central wall is still a grid (most of all at 360 by 640 and at lit start).** | **Adopted by the owner on 2026-11-15: wall B (D1, Q40)** |
| **F20** | **The candle appears to stand on the black control band; the dish and the table are not recognised.** | **Adopted by the owner on 2026-11-15: base B2 with change request CR12 (D2, Q41)** |

**F15. Idle pool.** At `phase = "idle"` the scene model gives `lightRadius = LIGHT_MIN` (0.2), so the pool's hole (140 units) reveals the wall around an unlit candle and reads as light coming from it. Fix, in CSS only from the existing `data-phase` attribute, no change to the model: `.candle-scene[data-phase="idle"] .pool { display: none }` (and the same for the tint's circle). Idle is then lit by the window alone; the first lit frame is the candle's. The prototype does this. **Requirement lines it touches (amended in `requirements.md` by R3.20, R3.23, A28, CR13 and Q36; the tests are build work):** `candle-scene` R7.4 and Decision Q1, and its design 6.3 (the drawn idle pool; target references corrected by room-art task 1.3); room-art R3.20 ("outside the pool at `LIGHT_MIN`": now there is no pool, so the Wall_Samples are outside it by definition), R7.6 ("idle is included on purpose": still true, the Window_Light reaches the edges), P6 (`poolLight` at idle: the art draws 0, `lightAt` in idle equals `windowLightAt`), E1 and E12 (add "the pool is not drawn in idle"), the glossary of Pool_Light ("scaled by `--light-radius`"); `controls-and-access` R8.3 and `layout.test.ts` (`KEEP_CLEAR_COLUMN_UNITS` was sized to contain the idle pool: it stays correct, only larger than needed); the existing `scene.spec.ts` idle pixel tests that read the pool region, if any, must be checked in the build. Measured effect (1280 by 800): idle wall points beside the candle read like the rest of the idle wall (the four Wall_Samples are outside the 140-unit pool either way, so none of the floors moved).

**F16. The warm pool: decided, adopted by the owner.** One decision, one list of amendments.

*Decision.* The pool of light carries a warm tint. Stone inside the pool reads as candle-lit, the stone the window lights stays cool, and the pool stays plainly brighter than the window-lit wall around it (3.2 times in luminance at lit half, D3). In the untinted look the pool read as a blue-white spotlight and only the halo was warm.

*What is drawn.* One rect `.warm-tint` between `.setting` and `.night`, filled with `--set-warm-tint` (`#7d5a34`, luminance 0.119) at 0.42, through its own mask: a copy of the pool's profile with the stops as white alpha, moved and scaled by the same rule as `.pool`, so its size is the pool's size; it is not drawn in idle with the pool. It lies over everything of `.setting` (wall, table, Holder, frame, the Door's wood) and under `.night`, so the night mask dims it like the rest. Every blended colour is a convex mix of two colours at or under the ceiling, so it stays under it: measured wall maximum 0.0894 at lit half and 0.0953 at lit start (ceiling 0.1312). Cost: 3 elements and one mask, counted in D11. Its model is `tintAt` and `settingColour` in 3.1.

*Amendments the build must carry (items 1 to 5 are made in `requirements.md`: the Introduction, the glossary, R1.6, R3.15, R3.22, R3.23, P6, P8, P13, A29 and Q37; the rest is build work):*
1. Introduction and "Fixed inputs": "the candle, the flame, the halo and the light pool stay exactly as they are" stays true (the pool does not change); add that the pool gains a tint layer.
2. Glossary: Light_At_Point, Lit_By_The_Light ("the setting's own tone mixed with the night by the Light_At_Point, and by nothing else": add the tint, and the Wall_Veil) and Pool_Light (add `tintAt`).
3. R1.6: the Setting_Group stays free of model properties; the tint rect is outside it and reads `--wax-height` and `--light-radius` through its mask, as `.pool` does. R1's "no coloured light layer of the window" is unchanged: the tint belongs to the pool, not to the window.
4. R3.15 and R10.6: the ceiling check also covers `--set-warm-tint` (and `--set-veil`).
5. P6, P8 and P13: done in section 5 (`tintAt`, `settingColour`, `litColour`); E1 adds the tint's stops and that it is not drawn in idle.
6. `scene.css`: one rule for `.pool-tint` (translate and scale from `--wax-height` and `--light-radius`) and one for `.warm-tint`; the idle rule hides `.pool-tint` with `.pool`; the forced-colours rule hides `.warm-tint` with `.setting` (D12: it is outside `.setting`, so it needs its own selector).
7. Amended Rules A4 and A9 (the list of what the scene draws) and `candle-scene` R7 (the light pool "constant intensity: it shows progress only by its radius": the tint keeps that, its alpha is constant).
8. The `candle-scene` lit-state tests that read the pool's colour are checked in the build.

**F17. Where "idle pool" is assumed** is listed under F15; it is the same decision.

**F18. The graveyard's upper right.** With the wider Doorway_Light and the haze the lower two thirds of the desktop view are lit, and the upper right beyond about x 900 and above about y 400 (room units) is unlit `(5, 7, 13)`. More light there needs either a second light or a wider ellipse that would light the text on the right (which holds no text), so I stopped here. If the owner wants it lit, widen `sx` to 2.2; the cost is a brighter bottom right.

**F19. The central wall is still a grid.** Raised by the owner after the third pass (most of all at 360 by 640 and at lit start). Answer: **wall B** (D1: fewer, larger, uneven stones; stepped, varying joints; tones that differ less; the same light and floors). Status: **adopted by the owner on 2026-11-15** (Q40). The build takes `wall-b.mjs`'s recipe as `WALL` and `wallCoursesB` in `setting.ts` (section 3.1) with the tone tokens `--set-stone-0` to `-4`, and E3, E12 and the Wall_Sample fixtures read the board at the block's centre and the joint on its own centre line (R3.2, Q24).

**F20. The candle appears to stand on the black control band.** Raised by the owner at lit half. Measured and answered in D2: B1 (within today's rules) and B2 (the zone's shadow shortened). Status: **adopted by the owner on 2026-11-15** (Q41, CR12). B2 needs a change to the `candle-scene` spec and to `src/scene/scene.css`, which this spec does not edit. **Change request for `candle-scene` (the exact change):**
1. `src/scene/scene.css` line 177: in `.zone-rest { ... filter: drop-shadow(0 -8px 6px color-mix(in srgb, var(--zone-bg-darkest) calc((1 - var(--dawn)) * 100%), transparent)); }` replace `0 -8px 6px` by `0 -2px 3px`.
2. `src/scene/scene.css` line 178: in `.zone-dawn { ... filter: drop-shadow(0 -8px 6px var(--zone-bg-brightest)); }` replace `0 -8px 6px` by `0 -2px 3px`.
3. `src/scene/scene.css` line 176, the comment ("The top edge of the band melts into the room: a soft shadow of the band itself, in its own colour, above the floor line"): add "a short one (2 units up, 3 of blur), so that the table and the Holder above the floor line stay lit".
4. `src/scene/scene.css.test.ts` lines 158 and 159 read `drop-shadow\(0 -\d+px \d+px ...` and so pass unchanged; the `candle-scene` design text and requirement that name the shadow's size (if any) change to 2 and 3 (none was found in `.kiro/specs/candle-scene/` by search for "drop-shadow", "8px 6px" and "soft shadow"; the only mention is the stylesheet comment).
5. The 21 `candle-*` screenshots in `docs/screenshots/` change in the 8 units above the floor line (the candle's last 8 units are no longer darkened) and are retaken by the build.
**What it affects, with the contrast figures:** the time text and the status line are **not** affected: ivory `rgb(239, 230, 207)` on `#080b12` is **15.83 : 1 at rest** and on `#4b4358` **7.53 : 1 at the dawn**, measured on the pixels beside the text at 1280 by 800 and 360 by 640 for the current art, B1 and B2, and identical (the shadow is above y 900, the text below it). The candle's own pixels change: its last 8 units are no longer faded into the band (alpha 0.11 to 0.91 today, 0.00 to 0.54 with B2 at y 884 to 898), so the base meets the band with a crisp edge at y 900.

## 10. The prototype

**Where:** `.kiro/specs/room-art/prototype/`. **Open:** `index.html#idle` (default), `#lit-start`, `#lit-half`, `#last-minute`, `#paused`, `#burned-out`, `#snuffed`, `#graveyard-small`, `#graveyard-card`; also `#graveyard-card-stub`, and `#ghost-sizes` (the strip of the three ghost shapes at sizes 1, 0.5 and 0.25). No script is needed (the screenshots are taken with JavaScript disabled). The page links the real stylesheets of `src/` (`scene.css`, `ui.css`, `ghosts.css`, `graveyard.css`) and the fonts they name, so a font file is not copied and a token is not typed.

**The real layout.** The interface is laid out at exactly eight sizes (VIEWPORTS_ART and 2560 by 1080) by the **real `placeControls`**: for each size `build.mjs` calls it, reads `mode`, and writes an `@media (width: W) and (height: H)` block that shows the compact or the wide copy and gives every control its rectangle (the first pass chose the copy by fixed width ranges, and 768 by 1024 got the wrong one: it is compact, as `placeControls` says). The only change to the real rectangles is the zone buttons of R9 (3.8). Between those sizes the art is fluid and the controls are not placed (a limit of a no-script prototype).

**The real graveyard text.** The history is a list of real `HistoryEntry` values; `build.mjs` runs `visibleHistory` (with `DEFAULT_LIMITS`) and `planView`, which use `cardLines`, `stoneIntent`, `formatCarvedDate` and `strings.ts`; the card is placed by the real `placeCard` at the size `measure.mjs --cards` read from the real card CSS.

**The 24 screenshots of the final default**, in the prototype folder (1280 by 800 "desktop", 360 by 640 "phone", 2560 by 1080 "ultrawide", 3840 by 2160 "4k"): `proto-{idle,lit-start,lit-half,last-minute,paused,burned-out,snuffed,graveyard-small,graveyard-card}-{desktop,phone}.png` (18), `proto-lit-half-ultrawide.png`, `proto-lit-half-4k.png`, `proto-graveyard-card-stub-desktop.png`, `proto-graveyard-card-stub-phone.png`, and the 3-times crops of the base, `proto-base-crop-desktop.png` and `proto-base-crop-phone.png` (rendered at a device scale of 3, 280 by 70 units: x 160..440, y 850..920). The warm A/B pictures, the wall B and base B1/B2 A/B pictures and their crops were removed when wall B and base B2 became the default; the ghost-size strip was a scratch image, looked at and deleted. Retake all with `node run-all.mjs`, then `node stripes.mjs` and `node base.mjs`.


**Files of the final prototype:** `source.mjs`, `art.mjs` (the art and its CSS), `wall-b.mjs` (wall B's seeded generator, the blocks and joints that `measure.mjs` reads, and `locate(x, y)` for the like-for-like pool figure), `build.mjs`, `shoot.mjs` (`node shoot.mjs crops` takes only the base crops), `measure.mjs` (every figure; `--cards` writes `card-sizes.json`), `report.mjs`, `stripes.mjs` (the repeat with the edge fade removed), `base.mjs` (the shadow's coverage of the table and the dish, and the text contrast, into `base-measurements.json`), `count.mjs` (the element budget), `run-all.mjs`.

**What the prototype does not show:** the dialogs, the focus ring, hover, forced colours, reduced motion as a switch (the ghosts are drawn still, which is the reduced-motion version), any animation or transition (including the 3 s level easing), the real frame interval, and the real `view-dom.ts`. The ghosts' offsets use the formula of 3.5 (a copy in `art.mjs`, to be replaced by `placeGhost`).
