# Design Document

## Overview

This design covers ghosts in the room and the graveyard view (Graveyard stones, Shelf stubs, details card, Door) for Candlewatch. It reads the engine selectors and the history document, and it stores and sends nothing new.

The text refers to its parts by number ("section 3.5", "section 7"). The headings are:

1. Section 1: Layout numbers (L1 to L11): G, S, D, K and every rectangle, derived from the stage geometry. This is the source of truth for all numbers.
2. Architecture (section 2): the files, the boundaries and the per-frame flow.
3. Components and Interfaces (section 3): the pure modules, with signatures and rules.
4. Data Models: the in-memory shapes; nothing is stored.
5. Section 4: The DOM layer: the ghost layer, the graveyard view, the Door and the wiring in `main.ts`.
6. Section 5: Accessibility: roles, names, descriptions and announcements.
7. Section 6: Change requests to other specs and files.
8. Error Handling (section 7).
9. Testing Strategy (section 8).
10. Correctness Properties (section 9).
11. Section 10: Decisions (D1 to D13).

Every later section reads G, S, D, K and the units from Section 1 and never restates them as new choices.

Conventions:

- All positions are room units in the 600 by 1000 stage (`viewBox 0 0 600 1000`, `xMidYMid meet`). Screen px = ox + s*u horizontally and oy + s*u vertically.
- At 360x640 (the smallest supported scale): s = min(360/600, 640/1000) = min(0.6, 0.64) = 0.6, ox = 0, oy = (640 - 600)/2 = 20. So 1 unit = 0.6 CSS px and 44 CSS px = 44/0.6 = 73.3 units.
- Other scales: 375x667 gives s = 0.625; 480x800 gives 0.8; 768x1024 gives 1.024; 1280x800 gives 0.8 (ox = (1280 - 480)/2 = 400); 1920x1080 gives 1.08. The smallest s is 0.6, so a size that passes at 0.6 passes everywhere.
- Fixed inputs: window pane x 240..360, y 50..260; candle body x 268..332, y 480..900; halo circle cx 300, cy 410, r 120; light pool centre (300, 400 + (1 - wax)*420), so y 400..820; floor band y 900..1000; reserved edge bands x 0..110 and x 490..600 at every y; controls keep-clear column x 160..440, y 260..900.
- Setup-control clearance: the ghost area starts at y = 215. That the setup controls never overlap the ghost cells (x 10..100 and x 500..590, y 215..785) or the Door is asserted by `controls-and-access` P10 after CR5, not by a number in this spec.

## Section 1: Layout numbers

### 1.1 The door (L1)

**Decision L1: the Door rectangle is x 20..100, y 805..890.**

- Width = 100 - 20 = 80 units. Height = 890 - 805 = 85 units.
- At 360x640 the size is 80*0.6 = 48 px by 85*0.6 = 51 px. Both are at least 44, so it passes (R3.9, R4.13). The screen box is x 12..60 px, y 20 + 0.6*805 = 503 px to 20 + 0.6*890 = 554 px.
- It lies in the left band (20..100 is inside 0..110) and below y = 300 (805 > 300), as `controls-and-access` R8.2 requires. It is outside the candle column (100 < 160 gives 60 units = 36 px clear, above the 6 px minimum). It is clear of the window pane, and 10 units above the floor band (890 < 900).
- The Graveyard_View's return control uses the same rectangle, so focus returns to the same place (R3.14).

### 1.2 Ghost box, drift and slots (L2 to L5)

**Decision L2: the full-size ghost box (ghostSize 1.0) is 70 by 75 units.**

- At 360x640: 70*0.6 = 42 px by 75*0.6 = 45 px. This is legible as a silhouette with a face-sized body.
- Size scales the box linearly about the slot centre, as `ghostSize` returns a factor from 0.25 to 1.0. The smallest ghost is 17.5 by 18.75 units (10.5 by 11.25 px). It shows size only and has no text, so it needs no hit size.

**Decision L3: the drift allowance inside each slot is 8 units in each direction, in x and in y.**

- Each slot owns a cell of 90 by 95 units. The resting box sits 10 units from each side: 90 - 70 = 20, so 10 each side; 95 - 75 = 20, so 10 each side.
- Drift of 8 units leaves 10 - 8 = 2 units inside the cell at the extreme. Two drifted boxes in adjacent cells stay at least 2 + 2 = 4 units apart.
- A drifted box cannot enter another slot's cell, the door, the setup-control area, or the floor band (see 1.2 table checks).

**Decision L4: G = 12.** The geometry allows 12 (R9.7, R9.8).

- Usable height: from y = 215 (the top of the ghost area; setup-control clearance is asserted by `controls-and-access` P10 after CR5) to y = 900 (floor band) gives 685 units. The right band has 685 / 95 = 7.2 cells of room, so 6 cells (570 units, y 215..785) fit with 115 units left. 6 cells are used there, and the leftover holds the overflow mark (L5).
- The left band must also hold the Door (y 805..890, 85 units). Cells must end by y = 805 - 10 = 795. Left cells: 6 * 95 = 570, from y 215 to 785. 785 <= 795, so 6 fit.
- Cells in the bands: left x 10..100 (box x 20..90, centre 55). Right x 500..590 (box x 510..580, centre 545). Both are inside the bands 0..110 and 490..600.
- G = 6 left + 6 right = 12.
- The candle column (x 160..440), the halo (x 180..420) and the pool centre (x = 300) are outside the bands by construction, since 110 < 160 and 440 < 490. So no slot can overlap them, and the window pane (x 240..360) is also outside. Nothing needs checking per slot.
- The floor band: the lowest drifted box ends at 775 + 8 = 783 < 900. Clear.
- The setup controls: ghosts stay drawn in `burned-out` and `snuffed` while the setup controls are visible (R9.18). The ghost cells (x 10..100 and x 500..590, y 215..785) are keep-clear rectangles for the controls' placement function, asserted by `controls-and-access` P10 after CR5.
- The Door: lowest left cell ends at 785 and the door starts at 805, 20 units apart. Clear.
- Slot order (fill order, R9.11, R9.12): slot k has row r = floor(k / 2) and side left when k is even, right when k is odd. Slot centres are listed below.

| Slot | Side | Row | Cell x | Cell y | Centre (cx, cy) | Resting box x | Resting box y |
|---|---|---|---|---|---|---|---|
| 0 | left | 0 | 10..100 | 215..310 | (55, 262.5) | 20..90 | 225..300 |
| 1 | right | 0 | 500..590 | 215..310 | (545, 262.5) | 510..580 | 225..300 |
| 2 | left | 1 | 10..100 | 310..405 | (55, 357.5) | 20..90 | 320..395 |
| 3 | right | 1 | 500..590 | 310..405 | (545, 357.5) | 510..580 | 320..395 |
| 4 | left | 2 | 10..100 | 405..500 | (55, 452.5) | 20..90 | 415..490 |
| 5 | right | 2 | 500..590 | 405..500 | (545, 452.5) | 510..580 | 415..490 |
| 6 | left | 3 | 10..100 | 500..595 | (55, 547.5) | 20..90 | 510..585 |
| 7 | right | 3 | 500..590 | 500..595 | (545, 547.5) | 510..580 | 510..585 |
| 8 | left | 4 | 10..100 | 595..690 | (55, 642.5) | 20..90 | 605..680 |
| 9 | right | 4 | 500..590 | 595..690 | (545, 642.5) | 510..580 | 605..680 |
| 10 | left | 5 | 10..100 | 690..785 | (55, 737.5) | 20..90 | 700..775 |
| 11 | right | 5 | 500..590 | 690..785 | (545, 737.5) | 510..580 | 700..775 |

Row y is cell top = 215 + 95*r, and the box top is cell top + 10. Cells tile with no overlap (each ends where the next begins), and the drift margin keeps drifted boxes at least 4 units apart.

**Decision L5: the Overflow_Mark "+n" is centred at x = 545, baseline y = 860, font size 24 units.**

- At 360x640 the font is 24*0.6 = 14.4 px (at least 12 px).
- Width for up to five characters ("+9999"): 5 * 0.6 * 24 = 72 units, so x 509..581 (inside the band 490..600). Height about 26 units, so y 838..864.
- Clear of slots: the lowest drifted box ends at 783 < 838. Clear of the door (x <= 100 against x >= 509). Clear of the floor band (864 < 900). Clear of the setup controls (asserted by `controls-and-access` P10 after CR5; the mark sits below the ghost cells). It is in the room, not in the band below y = 900 (R9.14).
- Colour: ivory `#efe6cf`. Contrast on the room's brightest background `#566683` is 4.66:1, which is at least 4.5 (every room background stop lies between the darkest and the brightest, so it is at least 4.66 anywhere in the room).
- It shows one piece of state only: n, the number of distractions not drawn (R9.15).

### 1.3 The graveyard view geometry (L6 to L8)

**Decision L6: the Graveyard_View uses the stage scale, not the viewport.**

- Argument 1: one coordinate system means one derivation. A viewport-derived layout would need its own units, and R8.6 and R8.7 need a single set of limits (S, D, K) across viewports. With the stage, hit sizes only grow with s (smallest s = 0.6), so the numbers derived at 360x640 hold at 375x667, 480x800, 768x1024, 1280x800 and 1920x1080.
- Argument 2: the floor band, the Door position and the controls that stay visible are already placed in stage units, so the view stays clear of them in the same units.
- Argument 3: at 360 px wide the stage is the viewport width (600 * 0.6 = 360), so nothing is lost on the phone. At 1280x800 the stage is 480 px wide with the backdrop around it, so the view is larger in px (s = 0.8) and fits, since the stage fits (checked in 1.3 below).
- The view is HTML positioned on the stage box, with the stage scale as a CSS variable (px per unit). The view cannot scroll.

**Decision L7: the grid.** Each item has a hit size of at least 44 CSS px at s = 0.6, which is 73.3 units, plus a gap of 10 units (6 px). All y values are in units.

| Element | x (units) | y (units) | Size (units) | Size at 360x640 |
|---|---|---|---|---|
| View header ("The graveyard", font 22) | 20..580 | 215..243 | 28 high | 16.8 px high |
| Graveyard label (font 20) | 20..580 | 247..269 | 22 high | 13.2 px high |
| Stone row 1 (5 stones, x = 30 + 110*i) | 30..570 | 273..363 | 100 by 90 each | 60 by 54 px |
| Stone row 2 | 30..570 | 373..463 | 100 by 90 each | 60 by 54 px |
| Graveyard Count_Line (font 20) | 20..580 | 466..488 | 22 high | 13.2 px high |
| Graveyard empty-state line | 20..580 | 273..295 | 22 high | in place of the stones |
| Shelf label (font 20) | 20..580 | 496..518 | 22 high | 13.2 px high |
| Day_Shelf row 1 (date label x 20..100; stubs x = 110 + 84*j; "+n more" x 446..546) | 20..546 | 522..596 | 74 high | 44.4 px high |
| Day_Shelf row 2 | 20..546 | 606..680 | 74 high | 44.4 px high |
| Day_Shelf row 3 | 20..546 | 690..764 | 74 high | 44.4 px high |
| Shelf Count_Line (font 20) | 20..580 | 767..789 | 22 high | 13.2 px high |
| Shelf empty-state line | 20..580 | 522..544 | 22 high | in place of the shelves |
| Back-door control (same rectangle as L1) | 20..100 | 805..890 | 80 by 85 | 48 by 51 px |

- Stone: 100 by 90 units. The face shows the Carved_Date (about 6 characters, "10 Nov", 6 * 0.55 * 20 = 66 units, which fits in 100 - 2*8 = 84 units) and the intent in one line clipped by CSS ellipsis. The full intent stays in the DOM text and in the accessible name. Stone pitch is 100 + 10 = 110.
- Stub: 74 by 74 units (44.4 px, at least 44). Stub pitch is 74 + 10 = 84. The Day_Shelf date label is real text, 80 units wide (48 px, "10 Nov" about 40 px).
- Header, labels, count lines and empty lines are not focusable and need no hit size. The empty-state line sits where the first row of items would be, so nothing shifts.
- Top: the view starts at y = 215, and the setup controls are hidden while the view is open (CR-V1), with their clearance asserted by `controls-and-access` P10 after CR5 (R4.12). Bottom: the last element ends at 789, above the back-door control at 805 (16 units apart) and above the floor band at 900.

**Decision L8: S = 10, D = 3, K = 4.** These are the largest values that fit under the grid (R8.6), with one fixed set across viewports (R8.7).

- Available height, y 215..795 (the back-door control starts at 805, with 10 units gap), is 580 units, of which the header, two labels, two count lines and one 8-unit gap take 28 + 4 + 22 + 4 + 22 + 3 + 22 + 8 + 22 + 4 + 22 + 3 + 22 = 186 (the internal gaps are the ones shown in L7). That leaves 580 - 186 = 394 units for item rows. The L7 stack shows the actual fit: it ends at 789 <= 795.
- Stones per row: n stones need 100n + 10(n - 1) = 110n - 10 units. The width available is 560 (x 20..580). 110n - 10 <= 560 gives n <= 5.18, so 5 per row. Rows r: 100r - 10 units tall (90 plus gaps of 10).
- Day_Shelves: row pitch is 74 + 10 = 84, so D rows take 84D - 10 units.
- Trade-off: item rows must share 394 - (gaps) units. Rule: maximise the Graveyard and the Shelf together, with both groups getting at least 2 rows of stones and 3 shelves. With r = 2 stone rows (190 units) the Shelf keeps 242 units, which is 84D - 10 <= 242, so D = 3 (exactly 242). With r = 3 stone rows, the Shelf would drop to D = 2 (the total would exceed the budget by 100 - 84 = 16 units for D = 3). With r = 1 and D = 4 the totals are (S = 5, D = 4). The choice (S = 10, D = 3) gives 10 + 3 * 4 = 22 items and is kept as the larger total of items drawn. The alternative (5, 4) gives 5 + 16 = 21.
- S = 5 stones per row * 2 rows = 10.
- K: a Day_Shelf row has the date label (80), a gap (10), the stubs, a gap (10) and a reserved "+n more" text. "+n more" for n up to 99 is 8 characters at font 20 (0.55 * 20 = 11 units per character), so 88 units, and 100 units are reserved. The stubs may use 560 - 80 - 10 - 10 - 100 = 360 units. 84K - 10 <= 360 gives K <= 4.4, so K = 4. (K = 5 would need 410 units and 80 + 10 + 410 + 10 + 100 = 610 > 560.) The reserved text slot is x 446..546, which holds the full row at 20..546 <= 580.
- Check at 1280x800: s = 0.8, ox = 400. The stage is 480 by 800 px and it fits in the 1280 by 800 viewport. All items scale by 0.8 / 0.6 = 1.33 and stay inside the stage, which stays inside the viewport. Stone size 80 by 72 px, stub 59.2 px, door 64 by 68 px. No scrolling.
- Check at 360x640: the stage is 360 by 600 px at oy = 20, so the content ends at 20 + 0.6 * 789 = 493 px and the back-door control at 20 + 0.6 * 890 = 554 px. Everything is inside 640 px.

### 1.4 The details card (L9, L10)

**Decision L9: the Details_Card is 520 by 240 units.**

- At 360x640 this is 312 by 144 px. Padding is 12 units per side, so the text width is 520 - 24 = 496 units (297.6 px).
- Text is font 20 units (12 px), line height 26 units (about 1.3). Average glyph 0.55 * 20 = 11 units gives about 45 characters per line. A wide-glyph worst case ("W", 0.9 * 20 = 18 units) gives 496 / 18 = 27 characters per line.
- Worst case for the intent: 80 code points / 27 = 2.96, so 3 lines (4 lines for safety, after wrapping at word breaks). Then 4 lines of intent + 4 lines (date, planned length, distractions, time away) = 8 lines * 26 = 208 units. Plus 2 * 12 padding = 232, rounded up to 240 units.
- Background `#080b12` (the zone's darkest), 1 unit ivory border, opaque. The card has `pointer-events: none`, so hover on a card does not remove the card.

**Decision L10: placement rule.** Let the Item have top `t` and bottom `b` (units). The gap between card and Item is 8 units.

1. If t - 8 - 240 >= 215 (that is, t >= 463), put the card above: card y = t - 248..t - 8.
2. Else if b + 8 + 240 <= 895 (that is, b <= 647), put the card below: card y = b + 8..b + 248.
3. Horizontal: card x = clamp(cx - 260, 20, 60), where cx is the Item centre; card width 520 so it spans x..x + 520, at most x 20..580.

The two cases always cover every item at the L7 positions:

- Stone row 1: t = 273 < 463, b = 363 <= 647, so below (card y 371..611).
- Stone row 2: t = 373 < 463, b = 463 <= 647, so below (card y 471..711).
- Shelf row 1: t = 522 >= 463, so above (card y 274..514).
- Shelf row 2: t = 606, above (card y 358..598).
- Shelf row 3: t = 690, above (card y 442..682).

Every stone has b <= 463 <= 647, and every shelf item has t >= 522 >= 463, so one of the two cases always holds and the "else" branch is unreachable (R5.10). The card never covers its own Item, because it ends 8 units before or starts 8 units after it.

- Viewport check at 360x640: the highest card top is 274 units, which is 20 + 0.6 * 274 = 184 px; the lowest card bottom is 711 units, which is 20 + 0.6 * 711 = 447 px. The card spans x 20..580 at most, which is 12 px..348 px. All inside 360 by 640 (R5.11). At 1280x800 (s = 0.8): top 0 + 0.8 * 274 = 219 px to bottom 0.8 * 711 = 569 px, and x 400 + 16 = 416 px to 400 + 0.8 * 580 = 864 px; inside 1280 by 800.
- The card stays above the back-door control (711 < 805) and below the top of the panel (274 > 215).
- Assumption: the card is a transient overlay that may cover other Items and the group labels while shown (R5.10 only forbids covering its own Item); R4.11's "clear of one another" is read for the static layout.

### 1.5 Hit sizes and contrast (L11)

**Decision L11: every new element meets the minimum hit size of 44 CSS px at s = 0.6 and the contrast of the scene (4.5:1).**

Contrast values: ivory `#efe6cf` has relative luminance about 0.795 (from 16.20 on `#05070d`, whose luminance is 0.00213: (0.795 + 0.05) / (0.00213 + 0.05) = 16.2). The stone and door face `#1b2030` has luminance about 0.0149 (R 0.0110, G 0.0146, B 0.0296 linearised), so ivory on it is (0.795 + 0.05) / (0.0149 + 0.05) = 13.0.

| Element | Size at 360x640 | Background | Contrast of text or outline | Minimum |
|---|---|---|---|---|
| Door and back-door control | 48 by 51 px (interactive) | face `#1b2030`, outline ivory | outline ivory on face 13.0 (non-text 3:1) | 44 by 44 px |
| Stone (face text: date and clipped intent, 12 px) | 60 by 54 px (interactive) | face `#1b2030` | ivory 13.0 | 44 by 44 px, 4.5:1 |
| Stub (no text) | 44.4 by 44.4 px (interactive) | room, ivory outline | outline ivory on room brightest 4.66 (non-text 3:1) | 44 by 44 px |
| Focus indicator on Items, Door, return control | 3 px ivory ring | room | ivory on room brightest 4.66, on darkest 16.20 | 3:1 (R6.19) |
| View header, group labels, Day_Shelf date labels (12 to 13 px) | not interactive | room | ivory 16.20 (darkest) to 4.66 (brightest) | 4.5:1 |
| Count_Lines and empty-state lines (12 px) | not interactive | room | ivory 16.20 to 4.66 | 4.5:1 |
| "+n more" text at the shelf's end (12 px) | not interactive | room | ivory 16.20 to 4.66 | 4.5:1 |
| Details_Card text (12 px) | 312 by 144 px, not interactive | `#080b12` | ivory 15.83 | 4.5:1 |
| Overflow_Mark "+n" (14.4 px) | not interactive | room | ivory 16.20 to 4.66 | 4.5:1 (R9.14) |
| Ghost (no text) | 42 by 45 px at full size | room | no text | none |

- Room text is placed on room backgrounds only, and every room background stop lies between the darkest and the brightest, so 4.66 is the floor for all room text. The details card uses its own opaque dark background, so its floor is 15.83.
- Hit sizes grow with the scale (s >= 0.6 everywhere), so the table is the worst case.

## Architecture

### 2.1 Files

Two new folders. Every file marked "pure" imports only `../engine` (the public index), `../strings`, the pure helpers `../ui/format` and `../ui/layout` (`fill`, `spokenTime`, `stageBox`), and its pure siblings (R1.1, R1.2, R1.4).

```
src/ghosts/
  slots.ts          GHOST_SLOTS (G = 12), GHOST_BOX, DRIFT, OVERFLOW_MARK            pure   (L2 to L5)
  visible.ts        visibleGhosts(spans, G)                                           pure   (R9)
  label.ts          sceneLabel(mode, count), countWords(n)                            pure   (R10.1)
  layer.ts          createGhostLayer(root) -> { apply }                               DOM
  ghosts.css        silhouette, drift, fade, reduced motion                           CSS
  purity.test.ts    the purity scan for slots, visible, label

src/graveyard/
  days.ts           DayKey, DayKeyFn, groupByDay, formatCarvedDate                    pure   (R2)
  visible.ts        visibleHistory(history, limits), DEFAULT_LIMITS                   pure   (R8)
  text.ts           itemName, cardLines, countLine, moreText                          pure   (R5, R7, R8)
  geometry.ts       DOOR_RECT, stoneRect, stubRect, placeCard, PANEL_RECT             pure   (L1, L6 to L10)
  focus.ts          NavLayout, tabStops, navigate, resolveRemembered                  pure   (R6)
  card.ts           CardState, cardStep                                               pure   (R5)
  view.ts           doorView, doorUsable, View, viewStep                              pure   (R3)
  keys.ts           graveKeyAction                                                    pure   (R6, CR2)
  day-key.ts        localDayKey(ms)                                                   DOM    (the one reader of local time)
  view-dom.ts       createGraveyard(root, hooks) -> { apply, focusFirst, focusDoor }  DOM
  graveyard.css     panel, items, card, door, focus ring                              CSS
  purity.test.ts    the purity scan for days, visible, text, geometry, focus, card, view, keys
```

`src/strings.ts` gains the `graveyard`, `ghosts` and `count` groups (section 4.7). Nothing is added to `src/engine/`, `src/storage/` or `src/scene/model.ts`.

### 2.2 Boundaries

- The Ghost_Module reads `distractionCount` and `ghostSpansMs` through `src/engine/index.ts`, and `ghostSize` inside `visibleGhosts` (R1.1). It never sends an event and never reads a clock (R1.3).
- The Graveyard_Module reads `state.history`, which is the history document (version 1) after `parseHistory` and `appendEntry`. It adds no field and no storage key (R1.2). `visibleHistory` never changes its input.
- The only reader of local time is `day-key.ts`. The only readers of the clock in production remain `main.ts` and `src/ui/dom/events.ts`. Neither new folder reads `Date.now`.
- The pure files contain no `window`, `document`, `localStorage`, `Date`, `performance`, `Math.random`, `matchMedia`, `setTimeout`, `setInterval` or `requestAnimationFrame` (R1.4). The purity tests scan them the way `src/ui/purity.test.ts` does (R1.5).
- User text (the intent) reaches the page only through `textContent` and `setAttribute` of non-style attributes. Neither folder uses `innerHTML`, `insertAdjacentHTML`, `document.write`, `style.cssText` or `setAttribute("style", ...)` (R1.7). SVG is built with `createElementNS`.
- The words "Pomodoro" and "timer app" do not appear in the source; every text that names a session says "focus session" (R1.8). `src/graveyard/purity.test.ts` and `src/ghosts/purity.test.ts` each check this with a whole-word scan.
- No new runtime or test dependency (R1.9).

### 2.3 Data flow per frame

```
main.ts frame (existing):  dispatch(tick) -> scene.apply(model, { labelSuffix }) -> ui.update(...)
  new, in the same frame:
    spans  = ghostSpansMs(state)                    count = distractionCount(state)
    ghosts = visibleGhosts(spans, GHOST_SLOTS.length)           -> ghostLayer.apply({ ghosts, on: settings.ghosts, reduced })
    suffix = countWords(count)                                  -> scene.apply(model, { labelSuffix: suffix })
    view   = viewStep(view, { type: "phase", phase })           -> graveyard.apply({ view, door: doorUsable(phase), ... })
    when view is "graveyard" and (state.history, dayKeyOf) changed:
      visible = visibleHistory(state.history, { ...DEFAULT_LIMITS, dayKeyOf: localDayKey })
      graveyard.apply({ visible, ... })

keys:    keydown -> graveKeyAction(ctx, key) -> viewStep / cardStep / navigate   (UI only, no engine event)
pointer: hover / tap on an item or the Door -> cardStep / viewStep               (UI only, no engine event)
```

The graveyard rebuilds its items only when `state.history` (by identity), the day-key function or the view changes. The engine returns the same array unless `appendEntry` added an entry, so the work per frame is a comparison of two references.

## Components and Interfaces

All text comes from `strings.ts` (section 4.7). The bodies are small; the rules are stated here.

### 3.1 `days.ts`: days, ordering and the carved date (R2)

```ts
import type { HistoryEntry } from "../engine";

/** "YYYY-MM-DD" of a local calendar day. */
export type DayKey = string;
/** Passed in by the caller, so no result depends on the machine's time zone (R2.4). */
export type DayKeyFn = (ms: number) => DayKey;

/** An entry with its position in the history document, so that ties are broken the same way every time (R2.8). */
export interface Indexed {
  readonly entry: HistoryEntry;
  readonly index: number;
  /** `dayKeyOf(entry.endedAt)` (R2.1). */
  readonly dayKey: DayKey;
  /** `${startedAt}:${endedAt}:${index}`: unique, used as the element id and the focus key. */
  readonly id: string;
}

export interface DayGroup {
  readonly dayKey: DayKey;
  /** Newest first (Decision D4). */
  readonly items: readonly Indexed[];
}

/** Every entry in exactly one group; groups newest day first; items newest first. */
export function groupByDay(history: readonly HistoryEntry[], dayKeyOf: DayKeyFn): readonly DayGroup[];

/** Newest first: the order used by the Graveyard, by the Day_Shelves and inside one Day_Shelf. */
export function newestFirst(a: Indexed, b: Indexed): number;

/** "10 Nov" from "2026-11-10". No time of day (R2.10). */
export function formatCarvedDate(dayKey: DayKey): string;

export function dayKeyFromParts(year: number, month1: number, day: number): DayKey;
```

Rules:

- `dayKey = dayKeyOf(entry.endedAt)`: the local day of the end time, never the day of `startedAt` and never the UTC day (R2.1). A session from 23:50 to 00:15 is grouped under the day of 00:15 (R2.2).
- `newestFirst(a, b)` compares `endedAt` descending, then `startedAt` descending, then `index` descending. `appendEntry` is idempotent on `(startedAt, endedAt)`, so in a valid document the pair is already unique, which makes the order independent of the array order (P9). The `index` term makes the order total even for a damaged document with a repeated pair, and it matches R2.8: a later position means a later append, so it sorts as newer.
- Groups are ordered by `dayKey` descending. `"YYYY-MM-DD"` strings sort the same as the dates, so a plain string comparison is enough (R2.6).
- `groupByDay` is generic: it groups whatever history it receives. `visibleHistory` filters by outcome first.
- `dayKeyFromParts(y, m, d)` pads to `YYYY-MM-DD`. It is the only place that builds a key, so the DOM function `localDayKey` and the test functions agree on the format.
- `formatCarvedDate(dayKey)` splits the key, takes the month name from `STRINGS.graveyard.months` and fills `STRINGS.graveyard.carvedDate` (placeholder `"{day} {month}"`, with no leading zero on the day). A key that is not `YYYY-MM-DD` with a month 01 to 12 returns `STRINGS.graveyard.unknownDate` (section 7). The Stone, the Day_Shelf label, the Item name and the Details_Card all call this one function (R2.9, R4.5).
- Days are computed on every build of the view and stored nowhere (R2.12, Decision D1).

### 3.2 `visible.ts` (graveyard): what is drawn (R8)

```ts
export interface Limits {
  readonly S: number;
  readonly D: number;
  readonly K: number;
  readonly dayKeyOf: DayKeyFn;
}

/** From Section 1, Decision L8. */
export const DEFAULT_LIMITS = { S: 10, D: 3, K: 4 } as const;

export interface ShelfView {
  readonly dayKey: DayKey;
  /** The newest K stubs of the day, newest first. */
  readonly stubs: readonly Indexed[];
  /** Stubs of this day that are not drawn: the n of "+n more" (R8.5). */
  readonly hiddenStubs: number;
}

export interface VisibleHistory {
  /** The newest S snuffed entries, newest first (R8.3). */
  readonly stones: readonly Indexed[];
  /** The newest D days that hold a burned-out entry, newest first (R8.4). */
  readonly shelves: readonly ShelfView[];
  /** Snuffed entries not drawn (R8.8). */
  readonly hiddenStones: number;
  /** Days with a burned-out entry that are not drawn (R8.9). */
  readonly hiddenDays: number;
}

export function visibleHistory(history: readonly HistoryEntry[], limits: Limits): VisibleHistory;
```

Rules:

- `stones` is `snuffed` entries sorted by `newestFirst`, cut to `S`. `hiddenStones` is the rest (R4.1, R8.3).
- `shelves` is `groupByDay(burned-out entries)`, cut to `D` days, each cut to `K` stubs. `hiddenDays` is the number of days cut. `hiddenStubs` of a drawn day is the number of stubs cut from it (R4.4, R8.4, R8.5).
- Days that hold only snuffed entries have no Day_Shelf: the Shelf is for burned-out sessions (R4.4).
- Each limit is read as `Math.max(0, Math.floor(x))`; a `NaN` limit is 0 (section 7). The result is a new object; the input array is never changed or trimmed (R8.12).
- When nothing is cut, `hiddenStones`, `hiddenDays` and every `hiddenStubs` are 0 and no Count_Line exists (R8.15).

### 3.3 `text.ts`: the words (R4, R5, R7, R8)

```ts
export function itemName(item: Indexed): string;             // "Write the essay, 10 Nov" (R7.1)
export function stoneIntent(entry: HistoryEntry): string;   // the intent, or the placeholder line (R4.3)
export function cardLines(item: Indexed): readonly string[]; // the five lines of the Details_Card (R5.1)
export function stonesCountLine(hidden: number): string | null; // "38 older stones not shown", or null when 0 (R8.8, R8.10)
export function daysCountLine(hidden: number): string | null;
export function moreText(hiddenStubs: number): string | null;  // "+3 more", or null when 0 (R8.5)
```

- `stoneIntent` returns `entry.intent` when it is a non-empty string, else `STRINGS.graveyard.noIntent` (R4.3, R5.2, R7.2). The Item name, the Stone face and the card all use it.
- `itemName(item) = fill(STRINGS.graveyard.itemName, { intent: stoneIntent(entry), date: formatCarvedDate(item.dayKey) })` (R7.1, R7.2).
- `cardLines` returns exactly five lines, in this order (R5.1, R5.12, R5.13):
  1. the intent or the placeholder;
  2. the Carved_Date;
  3. the planned length: `fill(lengthMin === 1 ? time.minute : time.minutes, { n: lengthMin })` inside `STRINGS.graveyard.card.planned`;
  4. the distractions: `fill(STRINGS.graveyard.card.distractions, { n: distractions })`, with `n` as plain digits and no `countWords` ("Distractions: 3");
  5. the time away: `spokenTime(timeAwayMs)` inside `STRINGS.graveyard.card.away`.
- The count lines use two strings each (one and other) and fill `{n}`. They return `null` for 0, so "no Count_Line" is a missing value, not an empty string (R8.10).
- Every function is total and returns the same text for equal inputs.

### 3.4 `geometry.ts`: positions in room units (Section 1, L1, L6 to L10)

```ts
export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

export const DOOR_RECT: Rect = { x: 20, y: 805, w: 80, h: 85 };            // L1
export const PANEL_RECT: Rect = { x: 0, y: 205, w: 600, h: 595 };          // Decision D8
export const STONES_PER_ROW = 5;                                           // L8

export function stoneRect(i: number): Rect;                                 // x 30 + 110*(i % 5), y 273 + 100*floor(i/5), 100 by 90
export function shelfRowY(r: number): number;                               // 522 + 84*r
export function dateLabelRect(r: number): Rect;                             // x 20, w 80, h 74 at shelfRowY(r)
export function stubRect(r: number, j: number): Rect;                       // x 110 + 84*j, 74 by 74
export function moreRect(r: number): Rect;                                  // x 446, w 100, h 74
export const COUNT_LINE_Y = { stones: 466, shelf: 767 } as const;           // L7, height 22
export const EMPTY_LINE_Y = { stones: 273, shelf: 522 } as const;           // L7, height 22

export const CARD_SIZE = { w: 520, h: 240 } as const;                       // L9
export function placeCard(item: Rect): Rect;                                // L10
```

`placeCard(item)` is exactly the L10 rule: above when `item.y >= 463`, else below; `x = clamp(item.x + item.w / 2 - 260, 20, 60)`. The second branch is chosen by the first test failing, with no third branch: L10 shows that every item rectangle of this file satisfies one of the two conditions. A property test checks this over all `stoneRect(0..9)` and `stubRect(0..2, 0..3)` (Property 16).

All constants are checked against the Section 1 tables by `geometry.test.ts`. The hit-size check multiplies each size by 0.6 and asserts at least 44.

### 3.5 `focus.ts`: roving focus (R6)

```ts
export type GroupId = "graveyard" | "shelf";
export type NavKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";

/** The drawn items by id, in Group order. The Shelf is one array per Day_Shelf, newest day first. */
export interface NavLayout {
  readonly graveyard: readonly string[];
  readonly shelf: readonly (readonly string[])[];
}

export interface FocusMemory {
  readonly graveyard: string | null;
  readonly shelf: string | null;
}

export const NO_MEMORY: FocusMemory = { graveyard: null, shelf: null };

/** The id with tabindex 0 in each Group, or null for an empty Group (R6.2 to R6.6). */
export function tabStops(layout: NavLayout, memory: FocusMemory): FocusMemory;

/** The id to focus after a key; the current id when nothing moves (R6.7 to R6.12). */
export function navigate(layout: NavLayout, group: GroupId, current: string, key: NavKey): string;

/** Records the focused item as the Remembered_Item (R6.18). */
export function remember(memory: FocusMemory, group: GroupId, id: string): FocusMemory;
```

Rules:

- The Group order is the array order: Stones newest first; Stubs newest day first, and inside a day newest first. The "newest Item" of a Group is its first id, which is the Remembered_Item until the user focuses another (R6.6).
- `tabStops` returns the remembered id when it is still drawn, else the first id of the Group, else `null` (R6.3, R6.4). A remembered id that is no longer drawn (the history changed) falls back to the first.
- `navigate`: Left and Right step through the flattened order of the Group; Home and End go to its first and last id; none wraps (R6.7, R6.10, R6.11). On the Shelf, Up goes to the row `r - 1` (a newer day) and Down to `r + 1` (an older day) at column `min(j, rowLength - 1)`; with no such row the current id stays (R6.8, R6.9). On the Graveyard, Up and Down return `current` (the Stones have no vertical meaning beyond Left and Right; the keys are not captured, see 3.8).
- The returned id is always in the same Group as `current` (R6.12). An unknown `current` returns the Group's first id.

### 3.6 `card.ts`: the Details_Card state machine (R5)

```ts
export interface CardState {
  /** The id whose card is shown, or null (R5.9: at most one). */
  readonly shown: string | null;
  readonly source: "focus" | "hover" | "tap" | null;
  /** The id with keyboard focus inside a Group, or null. */
  readonly focused: string | null;
}

export type CardInput =
  | { readonly type: "focus"; readonly id: string }       // keyboard focus (not a pointer's)
  | { readonly type: "blur"; readonly id: string }
  | { readonly type: "hover"; readonly id: string }       // mouse enters
  | { readonly type: "unhover"; readonly id: string }     // mouse leaves
  | { readonly type: "tap"; readonly id: string }         // touch or pen
  | { readonly type: "tap-away" }                         // touch elsewhere
  | { readonly type: "escape" }
  | { readonly type: "clear" };                           // the view closed or the items were rebuilt

export const NO_CARD: CardState = { shown: null, source: null, focused: null };

export function cardStep(state: CardState, input: CardInput): { state: CardState; handled: boolean };
```

Rules:

- `focus(id)`: shown = id, source `focus`, focused = id (R5.3). `blur(id)`: focused becomes null when it was `id`; if the card is shown by `focus` for `id`, it is hidden.
- `hover(id)`: shown = id, source `hover`; `focused` is not touched, so hover never moves keyboard focus (R5.4, R5.5). `unhover(id)`: when the card is shown for `id` by `hover`, it falls back to the focused item (source `focus`) or to null.
- `tap(id)`: when `shown === id`, hide it (R5.7); otherwise show it with source `tap` (R5.6). `tap-away` hides the card (R5.8).
- `escape`: when a card is shown, hide it, keep `focused` and return `handled = true` (R5.14, R6.13); when none is shown, return `handled = false`, so the caller leaves the view (R6.14).
- `clear` returns `NO_CARD`.
- A shown id is never one that was not given in an input, and only one id is ever shown (R5.9).
- Touch-driven focus is not a `focus` input. The DOM layer marks a `pointerdown` of a touch or pen and drops the browser's following focus event for that item (section 4.4), so a tap cannot show and hide the card in one gesture.

### 3.7 `view.ts`: the Door and the view switch (R3)

```ts
import type { State } from "../engine";

export type View = "room" | "graveyard";

/** The pure door model: what the Door is in a phase. `shut` is always `!usable` (R3.1, R3.2, R3.5, R3.6). */
export interface DoorView {
  /** The Door is a button that opens the view. */
  readonly usable: boolean;
  /** The Door is drawn as a closed door and is not focusable. */
  readonly shut: boolean;
}

export function doorView(phase: State["phase"]): DoorView {
  const usable = phase === "idle" || phase === "burned-out" || phase === "snuffed";
  return { usable, shut: !usable };
}

/** The Door is usable only when no candle burns (R3.1, R3.2). */
export function doorUsable(phase: State["phase"]): boolean {
  return doorView(phase).usable;
}

export type ViewInput =
  | { readonly type: "open"; readonly phase: State["phase"] }
  | { readonly type: "leave" }
  | { readonly type: "phase"; readonly phase: State["phase"] };

/** Where focus goes after the step (CR3). */
export type ViewFocus = "first-group" | "door" | "none";

export function viewStep(view: View, input: ViewInput): { view: View; focus: ViewFocus };
```

Rules:

- `open` in the Room with a usable Door gives the Graveyard_View and `first-group`; in every other case it changes nothing (R3.7, R3.3: a shut Door has no effect).
- `leave` in the Graveyard_View gives the Room and `door` (R3.14); in the Room it changes nothing.
- `phase` forces the Room when the Door is not usable (R3.12) and changes nothing otherwise. `main.ts` sends it every frame, so the switch happens in the frame the phase changes (R3.5, R3.6, R3.10).
- The initial view is `"room"` on every page load, whatever phase is stored (R3.11). Nothing about the view is stored.
- `viewStep` does not touch the engine: it takes and returns no engine value. The view, the card state and the focus memory are the "UI-only inputs" of P8 of `controls-and-access` (R3.16, CR4).

### 3.8 `keys.ts` (graveyard): the keys (R6, CR2)

```ts
import type { FocusKind, KeyDescriptor } from "../ui/keys";

export interface GraveKeyContext {
  readonly view: View;
  readonly phase: State["phase"];
  readonly overlay: "none" | "snuff" | "settings";
  readonly focus: FocusKind;
  readonly cardShown: boolean;
  /** The Group of the focused item, or null when focus is not on an item. */
  readonly onItem: GroupId | null;
}

export type GraveKeyAction =
  | { readonly type: "open" }
  | { readonly type: "leave" }
  | { readonly type: "hide-card" }
  | { readonly type: "show-card" }
  | { readonly type: "nav"; readonly key: NavKey };

export function graveKeyAction(context: GraveKeyContext, key: KeyDescriptor): GraveKeyAction | null;
```

Rules:

- Like the Room map, a key held with Ctrl, Alt or Meta, or a repeat, does nothing. Shift changes nothing.
- With an overlay open (`overlay !== "none"`) the function returns `null`, so the Settings panel keeps Escape and the Room map handles it.
- **The Door's key is `g`** (Decision D7). In the Room with a usable Door it returns `open`; in the Graveyard_View it returns `leave`; with a text field focused it returns `null` so the letter can be typed; with a shut Door it returns `null` (R3.3, R6.15).
- `Escape` in the Graveyard_View returns `hide-card` when a card is shown, else `leave` (R6.13, R6.14). In the Room it returns `null`, so Escape keeps opening the snuff dialog.
- Arrow keys, Home and End in the Graveyard_View with `onItem` set return `nav`, except Up and Down on a Stone, which return `null` (R6.7 to R6.12). In the Room they return `null`, so the length chooser keeps its arrows (R6.16).
- `Enter` in the Graveyard_View with `onItem` set returns `show-card`: it opens that Stone's or Stub's Details_Card and does nothing else. `Enter` anywhere else in the Graveyard_View (the return control keeps its native button activation) returns `null` (Decision D13, R3.13, R6.17).
- In the Room the only key this map claims is `g`, and the Room map (`keyAction`) returns `null` for `g`.
- **The Room map gets the view context (CR1).** `KeyContext` in `src/ui/keys.ts` gains `view: "room" | "graveyard"`. When `view === "graveyard"`, `keyAction` returns no room action at all: no light, toggle-pause, open-snuff, keep-burning, length change or announce-time. The one exception is closing an open overlay: with the settings overlay open, close-settings keeps working (and the keep-burning answer of an open snuff dialog is not reachable, because the dialog cannot be open in this view). When `view === "room"`, `keyAction` behaves as today. The dispatcher no longer has to route keys by hand: it passes `view` to both maps, so Enter, Space and `t` cannot light, pause or announce in the Graveyard_View even if the dispatcher is wrong (R3.13, R6.16, R6.17). Properties 14 and 22 check this.

### 3.9 `ghosts/slots.ts` and `ghosts/visible.ts`: the ghosts (R9)

```ts
// slots.ts: Section 1, L2 to L5
export const GHOST_BOX = { w: 70, h: 75 } as const;
export const DRIFT_UNITS = 8;
export interface GhostSlot { readonly cx: number; readonly cy: number }
/** Slot k: left band when k is even, right band when odd; row = floor(k / 2). */
export const GHOST_SLOTS: readonly GhostSlot[];          // 12 entries: cx 55 or 545, cy = 262.5 + 95 * row
export const OVERFLOW_MARK = { x: 545, y: 860, fontSize: 24 } as const;
```

```ts
// visible.ts
export interface DrawnGhost {
  /** The distraction's position in `ghostSpansMs`, oldest first; the key of the element. */
  readonly index: number;
  readonly slot: number;
  /** `ghostSize(span)` in [0.25, 1]. */
  readonly size: number;
}

export function visibleGhosts(spans: readonly number[], G: number): { drawn: readonly DrawnGhost[]; hidden: number };
```

Rules:

- `first = max(0, spans.length - G)`. `drawn` holds indices `first .. spans.length - 1`, oldest first. `hidden = first` (R9.6, R9.10, R9.13).
- `slot = index mod G` (Decision D6). In any run of `G` consecutive indices the slots are all different (R9.5, Property 20). Slot 0 is the first: left band, top row. Slot 12 reuses slot 0, which is the slot of the oldest drawn ghost, so the new ghost takes the freed slot and no other ghost moves (R9.11, R9.12).
- `size = ghostSize(spans[index])` (R9.2). A negative or `NaN` span already maps to the floor in the engine.
- For `G = 0` or a non-integer `G`, `G` is read as `max(0, floor(G))`, `drawn` is empty and `hidden` is the full count (section 7).
- When `spans.length <= G`, `hidden = 0` and the page shows no Overflow_Mark (R9.9).
- `visibleGhosts` is the only place that decides which ghosts exist. The DOM layer does not recount.

### 3.10 `ghosts/label.ts`: the scene label (R10)

```ts
import type { STRINGS } from "../strings";
export type SceneMode = keyof typeof STRINGS.scene;

/** "1 distraction" or "14 distractions": the words for a count, used by the scene label only. */
export function countWords(n: number): string;

/** "The candle burns. 3 distractions." */
export function sceneLabel(mode: SceneMode, count: number): string;
```

- `countWords(n)` uses `STRINGS.count.distraction` for 1 and `STRINGS.count.distractions` for every other value, with `n` as plain digits. 0 gives "0 distractions".
- `sceneLabel(mode, n) = STRINGS.scene[mode] + " " + countWords(n) + "."`.
- `main.ts` passes `countWords(distractionCount(state))` to `scene.apply` as `labelSuffix` (Change Request CR-S1). The count is the engine's count, so it is exact with ghosts on, off or capped (R10.1, R10.2, R10.4). It does not depend on `settings.ghosts` or on G.
- The count is not announced through the live region (R10.10).

## Data Models

Nothing is stored. Every model below is in memory and is rebuilt from the engine state (the "section 3.x" references name the module that defines it).

| Model | Fields | Source |
|---|---|---|
| `HistoryEntry` (engine, unchanged) | `startedAt`, `endedAt`, `lengthMin`, `intent`, `outcome`, `distractions`, `timeAwayMs` | the history document, version 1 |
| `Indexed` (3.1) | `entry`, `index`, `dayKey`, `id` | `groupByDay`, `visibleHistory` |
| `DayGroup` (3.1) | `dayKey`, `items` (newest first) | `groupByDay` |
| `Limits` (3.2) | `S`, `D`, `K`, `dayKeyOf` | `DEFAULT_LIMITS` (10, 3, 4) and `localDayKey` |
| `VisibleHistory`, `ShelfView` (3.2) | `stones`, `shelves`, `hiddenStones`, `hiddenDays`; `dayKey`, `stubs`, `hiddenStubs` | `visibleHistory` |
| `NavLayout`, `FocusMemory` (3.5) | ids of drawn items in Group order; remembered id per Group | `visibleHistory` and the user's focus |
| `CardState` (3.6) | `shown`, `source`, `focused` | `cardStep` |
| `View` (3.7) | `"room"` or `"graveyard"` | `viewStep`; starts as `"room"` on every load |
| `DrawnGhost` (3.9) | `index`, `slot`, `size` | `visibleGhosts` |

The element id of an item is `Indexed.id` = `${startedAt}:${endedAt}:${index}`. It is unique in a document, stable while the document only grows (entries are appended, never reordered), and is used as the DOM id, the focus key and the card key.

No storage key, document field or version changes. The history document stays version 1 and complete (R1.2, R8.12).

## Section 4: The DOM layer

The pure parts above decide; these files only build elements once, apply a model and turn events into inputs.

### 4.1 The ghost layer (`ghosts/layer.ts`)

- One `<svg>` element with `viewBox="0 0 600 1000"`, `preserveAspectRatio="xMidYMid meet"`, `aria-hidden="true"`, fixed over the viewport, `pointer-events: none`. It sits above the scene SVG and below the controls, and it uses the scene's scaling rule, so slots land on the same room units as the scene (R9.4).
- It holds up to 12 `<g class="ghost">` groups and one `<text class="overflow">`. A ghost group is `translate(cx cy) scale(size)` around a silhouette drawn in a 70 by 75 box centred on the origin. The silhouette is one path built with `createElementNS`. Colour and opacity come from CSS custom properties.
- `apply({ ghosts, on, reduced })` keeps a map from `index` to element:
  - Ghosts not in `drawn` are removed: with a fade of 400 ms, or at once when `reduced` is true (R10.7).
  - New `index` values are created in their `slot` with a fade-in of 400 ms (instant when reduced).
  - An element's slot and size are never rewritten: both are fixed for a given `index` (R9.11).
  - The Overflow_Mark is `+n` with `textContent`, shown only when `hidden > 0`, at `OVERFLOW_MARK`, fill `#efe6cf` (R9.13, R9.14).
  - When `on` is false, or the view is the Graveyard_View, the layer draws nothing (R10.3). The count in the scene label stays (R10.4).
- Drift (R10.8): a CSS keyframe moves the inner group by at most `DRIFT_UNITS` = 8 units in x and in y. Each slot has its own period (14 to 22 s) and delay, set by a `data-slot` selector, so ghosts do not move together. With `data-reduced="true"` on the layer there is no animation and no fade (R10.6, R10.7, R10.9).
- In `idle` the spans are empty, so nothing is drawn (R9.16). In `burned-out` and `snuffed` the spans of the finished session stay (R9.17), and the slots are clear of the setup controls by L4 (R9.18).

### 4.2 The Door (`graveyard/view-dom.ts`)

- Two elements at `DOOR_RECT`: a `<button class="door">` with the accessible name `STRINGS.graveyard.door`, and a `<span class="door door-shut" aria-hidden="true">` drawn as a closed door.
- The DOM layer applies `doorView(phase)` and nothing else: it sets `hidden` on the button to `!usable` and on the shut door to `!shut`. Usable: button visible, shut door hidden. Shut: the other way round. The DOM flags are checked in browser test E1, not by a property. A `hidden` button is removed from the Tab order and from the accessibility tree, and its key does nothing because `graveKeyAction` also returns `null` (R3.3, R3.4). The swap happens in the frame the phase changes (R3.5, R3.6).
- The shut Door shows one piece of state: a focus session is running. It is not focusable and has no name, because the scene label already says the candle burns.
- In the Graveyard_View the Door button is hidden and the return control takes its place (below).

### 4.3 The graveyard view (`graveyard/view-dom.ts`)

- The root is a `<section class="graveyard">` placed over the stage box: left = `ox`, top = `oy`, width = `600 s`, height = `1000 s`, with the CSS custom property `--u` set to the scale `s` on resize from `stageBox(vw, vh)`. All sizes in CSS are `calc(N * var(--u))` with N from Section 1 (Decision L6). The panel `PANEL_RECT` has the opaque background `#080b12` (Decision D8). The view has no scroll bar and no overflow (R4.10).
- Contents, top to bottom (L7): `<h2>` with `STRINGS.graveyard.title`; a `role="group"` Graveyard with an `aria-label`; its Stones (`<button>` elements) and its Count_Line; a `role="group"` Shelf; per Day_Shelf a date label, its Stub buttons and a "+n more" text; the Shelf's Count_Line; the Details_Card; the return `<button>` at `DOOR_RECT`.
- DOM order is the Tab order: Graveyard group, Shelf group, return button, and then the controls-and-access Settings button, which stays in the zone (R6.1). The Settings opener remains, and the setup controls are hidden while the view is open (R3.13).
- **Items.** Each Stone and Stub is a `<button type="button">` with `id`, `tabindex` from `tabStops` ("0" for the one stop, "-1" for the rest), `aria-label = itemName(item)` and `aria-describedby` pointing to its description `<span>` (section 5). A Stone's face holds the date and the intent, both with `textContent`, the intent clipped by CSS `text-overflow: ellipsis`. A Stub has no text. Both have a 3 px ivory focus ring from the controls' focus rule (R6.19).
- **Counts and empty lines.** A Count_Line is a `<p>` that exists only when its text is not `null`. It is referenced by `aria-describedby` of its Group (R7.7) and is not focusable (R7.8). An empty Group shows its empty-state line, has `tabindex` on no element and is not a Tab stop (R4.9, R6.3).
- **The Details_Card.** One `<div class="card" aria-hidden="true">` with the five `cardLines` as separate `<span>` lines, positioned by `placeCard(itemRect)`, with `pointer-events: none` (L9). It is shown only when `CardState.shown` is not null.
- **Events.**
  - `focusin` on an item: if the previous `pointerdown` on this item was touch or pen, the event is ignored; otherwise `cardStep(focus)` and `remember`.
  - `focusout`: `cardStep(blur)`.
  - `pointerenter` and `pointerleave` with `pointerType === "mouse"`: `cardStep(hover)` and `cardStep(unhover)`.
  - `pointerdown` with a touch or pen on an item: marks the gesture; `click` after it: `cardStep(tap)`. A mouse `click` does nothing extra (the hover card is already shown).
  - A touch `pointerdown` outside any item and card: `cardStep(tap-away)`.
  - `keydown` on the document: builds a `GraveKeyContext`, calls `graveKeyAction`, then `cardStep(escape)` for `hide-card`, `navigate` and `element.focus()` for `nav`, `viewStep` for `open` and `leave`. A key with an action is `preventDefault`ed; a key with no action is left to the browser.
- **Focus moves (CR3).** `focusFirst()` focuses the Graveyard's Remembered_Item, else the Shelf's, else the return button. `focusDoor()` focuses the Door button. Both run after the DOM has been updated in the same frame.
- **Motion.** The view appears and disappears with no transition in every mode, so reduced motion needs no extra rule (R4.15). The ghost layer is the only element that fades.
- **Hit and contrast.** Items, the Door and the return button have the sizes of L7 and L11. Text is ivory on `#1b2030` (Stones) or `#080b12` (the panel and the card) (R4.13, R4.14).

### 4.4 Local day keys (`graveyard/day-key.ts`)

```ts
export function localDayKey(ms: number): DayKey {
  if (!Number.isFinite(ms)) return dayKeyFromParts(0, 0, 0);
  const d = new Date(ms);
  return dayKeyFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
```

It uses the local calendar parts, so a day with a daylight-saving jump is still one key (R2.3, R2.5). It is the only function in the two folders that reads `Date`, and the purity tests exclude only this file. The key `0000-00-00` sorts oldest and formats as the unknown date (section 7).

### 4.5 Wiring in `main.ts`

```ts
const ghostLayer = createGhostLayer(ghostRoot);
const graveyard = createGraveyard(graveRoot, { onKey, onView });
let view: View = "room";

// each frame, after dispatch(tick):
const spans = ghostSpansMs(state);
ghostLayer.apply({ ghosts: visibleGhosts(spans, GHOST_SLOTS.length), on: settings.ghosts && view === "room", reduced: reduced.matches });
scene.apply(sceneModel(state, now, { reducedMotion: reduced.matches }), { labelSuffix: countWords(distractionCount(state)) });
({ view } = viewStep(view, { type: "phase", phase: state.phase }));
graveyard.apply({ view, door: doorView(state.phase), history: state.history, dayKeyOf: localDayKey });
```

- `onKey` and the pointer hooks call `viewStep`, `cardStep` and `navigate` and never call `dispatch`. No engine event comes from this spec, so the "no UI input changes time" property holds by construction (R1.3, R3.8).
- When the view changes, the announcer line is written once through the live region of `controls-and-access` R9.2: `STRINGS.graveyard.announceOpen` on opening and `STRINGS.graveyard.announceLeave` on leaving (R7.10, CR-A1).
- The distraction wiring (`watchVisibility`) is unchanged. A hidden page while the Graveyard_View is open is a `hide` event in a non-`lit` phase, which the engine ignores, and opening the view is not a visibility change (R3.15).

### 4.6 Settings

The ghost layer reads `settings.ghosts` (R11.7 of `controls-and-access`). Turning it on or off redraws the layer and sends no engine event (R10.5). No setting is added (CR6).

### 4.7 Strings

`src/strings.ts` gains these groups. Every wording is a placeholder to be finalised by `sound-and-title` (Open Questions of the requirements).

```ts
count: { distraction: "{n} distraction", distractions: "{n} distractions" },
ghosts: { overflow: "+{n}" },
graveyard: {
  door: "Open the graveyard",
  back: "Back to the room",
  title: "The graveyard",
  graveyardLabel: "Graveyard",
  shelfLabel: "Shelf",
  noStones: "No stones yet",
  noStubs: "No candles on the shelf yet",
  noIntent: "No intent",
  itemName: "{intent}, {date}",
  carvedDate: "{day} {month}",
  unknownDate: "Unknown date",
  months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  olderStone: "{n} older stone not shown",
  olderStones: "{n} older stones not shown",
  olderDay: "{n} older day not shown",
  olderDays: "{n} older days not shown",
  more: "+{n} more",
  card: { planned: "Planned: {time}", distractions: "Distractions: {n}", away: "Time away: {time}" },
  announceOpen: "The graveyard.",
  announceLeave: "Back in the room.",
},
```

`card.distractions` takes `{n}` as plain digits (the entry's `distractions`), so the card line reads "Distractions: 3". `countWords` is used only by the scene label.

## Section 5: Accessibility

| Element | Role and name | State and description |
|---|---|---|
| Door (usable) | `button`, name `graveyard.door` | present only in `idle`, `burned-out`, `snuffed` (R7.11) |
| Door (shut) | none (`aria-hidden`) | absent from the tree as a button (R3.3) |
| Graveyard view | `section` with `<h2>` `graveyard.title` | the heading names the view (R7.9) |
| Graveyard, Shelf | `group`, names `graveyardLabel`, `shelfLabel` | `aria-describedby` the Count_Line when it exists (R7.5, R7.7) |
| Stone, Stub | `button`, name `itemName(item)` | `aria-describedby` its description span (R7.1 to R7.3) |
| Description span | text, visually hidden with the clip technique | holds the five `cardLines`, present for every drawn item whether the card is shown or not (R7.4) |
| Details_Card | `aria-hidden="true"` | the same lines, visible; hidden from assistive technology to avoid reading twice |
| Count_Line | text (`<p>`) | not focusable (R7.8) |
| Return control | `button`, name `graveyard.back` | at `DOOR_RECT` |

- No `listbox`, `option` or `grid` role is used (R7.6). The Groups use `role="group"` and the items are native buttons.
- Roving focus uses the real `tabindex` attribute and `element.focus()`; it does not use `aria-activedescendant`.
- Announcements: the open and the leave each write one line to the polite live region (R7.10). Ghosts are never announced; the label carries the count (R10.10).
- The ghost layer is `aria-hidden="true"`: its meaning (the count) is in the scene label, and the Overflow_Mark's number is the engine count minus G, so it is derivable from the label.

## Section 6: Change requests to other specs and files

This spec owns the change requests. Its first build task applies the whole 6.1 table to `controls-and-access`: it updates that spec's requirements, design and tasks documents wherever they are now wrong, makes the code changes (`src/ui/keys.ts` view context, `viewOf`, the `announce` function, the layout keep-clear rectangles) and extends its tests (P8 ops, P10, the key-map properties). The tasks also make the code changes marked "code" in 6.2 in the same commit as the code that needs them.

### 6.1 Change requests to `controls-and-access` (one batch)

| ID | What | Why | Requirement | Target section in controls-and-access |
|---|---|---|---|---|
| CR1 | The Door joins the Tab order and the key map only in `idle`, `burned-out` and `snuffed`. Its key is `g` (D7), handled by `graveKeyAction`. `KeyContext` in `src/ui/keys.ts` gains `view: "room" \| "graveyard"`; when `view === "graveyard"`, `keyAction` returns no room action (no light, toggle-pause, open-snuff, keep-burning, length change or announce-time), except that close-settings keeps working while the settings overlay is open. Room behaviour is unchanged when `view === "room"`. This also covers the Enter/view-context change (formerly proposed as CR7): Enter on an item is `show-card` in `graveKeyAction`, and Enter elsewhere in the graveyard does nothing (D13). | The Room map must not be reachable from the graveyard, so a key cannot light, pause, snuff or announce there. | R3.3, R3.13, R6.15, R6.16, R6.17 | design 3.4 (key map), 4 (Tab order) |
| CR2 | Arrow keys, Home, End and Escape get a second meaning in the Graveyard_View only. In the Room they keep their meaning (length chooser arrows, snuff dialog). | Keyboard navigation of the Items. | R6.7 to R6.14, R6.16 | design 3.4 |
| CR3 | Two rows in the focus table: opening the Graveyard_View focuses the first Group's Remembered_Item (else the next Tab stop); leaving it focuses the Door. | Focus must not be lost when the view changes. | R3.14, R6.5, R6.6 | R10.5 (focus table) |
| CR4 | The view switch, the card state and the focus moves are UI-only inputs. The generators of `src/ui/test-kit.ts` gain ops for them. | The engine must stay untouched by the view. | R3.16 | P8 |
| CR5 | Keep-clear rectangles are added to the controls' placement function and to P10 (no overlap): `DOOR_RECT` (x 20..100, y 805..890 units) and the ghost cells (x 10..100 and x 500..590, y 215..785 units), because ghosts stay drawn in `burned-out` and `snuffed` while the setup controls are visible (R9.18). P10 asserts that no control intersects any of them; the clearance of the setup controls from the ghosts is therefore asserted by `controls-and-access` P10 after CR5. | The Door and the ghosts must not overlap a control. | R3.9, R4.12, R9.18 | design 6 (`placeControls`, P10) |
| CR6 | None. The setting "ghosts" is read as defined. | No change needed. | R10 (ghost settings) | R11.7 |
| CR-A1 | The DOM layer needs a function `announce(text: string)` that writes one line to the live region. The announcer's pure part (`nextAnnouncement`) is unchanged. | View changes are announced. | R7.10 | design 9 (announcer, live region) |
| CR-V1 | `viewOf` gets the argument `view` and hides the setup controls when `view === "graveyard"`. The zone controls and the Settings opener stay. code | The setup controls have no use in the graveyard. | R4.12, R9.18 | design 3.6 (`viewOf`) |

The Requirement column lists the requirement IDs of this spec that need the request. This table can be handed to the owner of `controls-and-access` on its own.

### 6.2 Change requests to other targets

| ID | Target | Change |
|---|---|---|
| CR-S1 | `candle-scene` design 6 (`render.ts`) | `Scene.apply(model, extra?: { labelSuffix: string })`. The label is `STRINGS.scene[mode] + " " + labelSuffix + "."` and is rewritten when the mode or the suffix changed. Without `extra` the label is as today. The model, the flame modes and the light radius do not change (R10.11). code |
| CR-S2 | `candle-scene` reserved bands | The bands x 0..110 and x 490..600 are now used by ghosts, the Overflow_Mark (right band, y 838..864) and the Door (left band, y 805..890). No scene layer changes. |
| CR-ST | `src/strings.ts` | The groups of section 4.7. `src/strings.test.ts` gains a check that none of the new strings contains "Pomodoro". code |
| CR-E | `e2e` and `docs/screenshots` | The Door is drawn in every Room phase (usable or shut), so every `candle-*` screenshot changes: all 21 files are retaken, and the summary says so (R11.14). |
| CR-K | `KIRO_USAGE.md` | The build tasks add usage-log entries, as the other specs do. |

## Error Handling

The code never throws for a value that can arrive from storage or from the clock.

| Situation | Behaviour |
|---|---|
| History empty or unreadable | `storage.load` already returns an empty history. Both Groups show their empty-state line (R4.9); the Door still works. |
| `endedAt` not finite (damaged entry) | `localDayKey` returns `0000-00-00`. The entry sorts as the oldest, `formatCarvedDate` returns the unknown date. It is drawn like any other entry. |
| `dayKeyOf` returns a malformed key | `formatCarvedDate` returns the unknown date; ordering uses the string as given. |
| A repeated `(startedAt, endedAt)` pair | Both entries are kept; `index` orders them (R2.8). |
| Limits that are negative, fractional or `NaN` | Read as `max(0, floor(x))`, `NaN` as 0. Nothing is drawn for a limit of 0 and the hidden counts show it. |
| `G` is 0, negative, fractional or `NaN` | Same rule; `drawn` is empty, `hidden` is the count. |
| A span that is negative, `NaN` or infinite | `ghostSize` returns the floor for negative and `NaN`, and full size for infinity. The ghost is still drawn. |
| Intent is `null`, empty or very long | Null or empty shows the placeholder. A long intent is clipped by CSS on the Stone and wraps in the card (L9 worst case). The full text is in the DOM and in the Item name. |
| Intent contains markup or control characters | Written with `textContent` and `setAttribute`; shown as text (R1.7). |
| The phase becomes `lit` or `paused` while the view is open | `viewStep(phase)` returns the Room in the same frame; `CardState` is cleared; no focus is moved by this spec. |
| The settings panel is open in the Graveyard_View | `graveKeyAction` returns `null` for every key; Escape closes the panel through the Room map. |
| The remembered item is no longer drawn | `tabStops` falls back to the Group's first id. |
| The viewport is smaller than 360 by 640 | Best effort, as in `controls-and-access` 6.7. Items scale down with `--u`; hit sizes may be below 44 px and the guarantee is not claimed. |
| Time zone or daylight saving changes between visits | Days are computed at draw time. A near-midnight session may move to a neighbouring Day_Shelf (Decision D1). |
| A DOM node is missing (no `#app`) | `main.ts` already skips the wiring when `#app` is missing; the new layers follow the same guard. |

## Testing Strategy

### 8.1 Approach

Both kinds of test are used. Property tests (fast-check, `PROP_PARAMS` with 300 runs, `*.prop.test.ts` colocated with the source) cover every pure rule. Unit tests cover concrete examples, constants and edge cases. Browser tests (Playwright, `page.clock`, a stored state written before load with the engine's serializers, no hook in shipped code) cover the DOM, accessibility, layout and screenshots (R11.1 to R11.4).

Property-based testing is used only for pure logic. It is not used for the DOM wiring, the CSS, the screen reader tree or the screenshots: those get examples in a real browser.

Each property test is tagged `Feature: ghosts-and-graveyard, Property N: <title>` and states the property number of section 9.

### 8.2 Generators (`src/graveyard/test-kit.ts` and `src/ghosts/test-kit.ts`, test-only)

- `arbHistory` and `arbEntry` from `src/engine/test-kit.ts`, extended with: unique `(startedAt, endedAt)` pairs for valid documents; clusters of end times inside a single day; both outcomes; intents from `arbIntentText` and `null`.
- `fixedOffsetDay(hours)`: a `DayKeyFn` for a fixed UTC offset. `dstJumpDay`: a hand-written function with a 23-hour day and a 25-hour day, so no test reads the machine's time zone (R11.2).
- `arbLimits`: `S`, `D`, `K` from 0 to 15, and the defaults.
- `arbNavLayout`: a Graveyard of 0 to 10 ids and a Shelf of 0 to 3 rows of 1 to 4 ids.
- `arbCardInputs`, `arbGraveKey` (the keys of the Room map, the nav keys, `g`, letters, with modifiers and repeats), `arbGhostSpans` (0 to 40 spans, including 0, negative and `NaN`).
- `arbViewScript`: a mix of `open`, `leave` and `phase` inputs over all phases.

### 8.3 Unit tests

- `days.test.ts`: the 23:50 to 00:15 example under a fixed offset (R2.2); `formatCarvedDate` for "2026-11-10", the unknown date and month 13; `dayKeyFromParts` padding.
- `visible.test.ts`: a history of 3 sessions hides nothing; 11 stones show 10 and `hiddenStones = 1`; 5 days show 3 and `hiddenDays = 2`; a day with 6 stubs shows 4 and "+2 more".
- `text.test.ts`: the Item name, the null-intent placeholder, the five card lines for a known entry, the count lines for 0, 1 and 38.
- `geometry.test.ts`: every constant against the Section 1 tables; every size times 0.6 is at least 44 (R4.13); `DOOR_RECT` against the band, the column, the pane and the floor band (R3.9); the ghost slot table row by row, including the band limits and the 20 units above the Door (R9.4, R9.5).
- `contrast.test.ts`: the contrast of ivory on `#1b2030`, `#080b12`, `#566683` and `#05070d`, computed from the hex values with the WCAG formula, against 4.5 (R4.14, R9.14).
- `focus.test.ts`, `card.test.ts`, `view.test.ts` (including `doorView` for each phase), `keys.test.ts`: the examples of the rules in section 3 (Up on the newest shelf stays; Home and End; hover then focus; tap, tap again; Escape twice).
- `strings.test.ts`: no "Pomodoro" anywhere; every new string is used.
- Purity tests: `src/ghosts/purity.test.ts` and `src/graveyard/purity.test.ts` with the same scanner as `src/ui/purity.test.ts`: forbidden identifiers, allowed imports, banned calls, no import of a test helper (R1.4, R1.5, R1.7, R1.8).
- Existing scene, ui and engine tests must keep passing. `scene/render.test.ts` gains the examples for `labelSuffix` (CR-S1).

### 8.4 Property tests

One test per property of section 9, written against the pure functions. Three of them use an independent reference model written in the test:

- Property 1 compares `groupByDay` with a reference that sorts all entries with a comparator written differently and splits by key.
- Property 7 and 8 compare `visibleHistory` with a reference that sorts, filters and slices.
- Property 12 compares `navigate` with a reference that walks a flat list.

The mutation check for each of Properties 1, 8, 12, 13, 15, 19, 20 and 22 tries one deliberate fault by hand (for example `startedAt` instead of `endedAt`, `slice(0, S)` instead of `slice(-S)`, wrapping at the ends, `index` instead of `index mod G`, dropping the `view === "graveyard"` check in `keyAction`) and confirms that the property fails. A property that cannot fail is not accepted.

### 8.5 Browser tests (`e2e/graveyard.spec.ts`, `e2e/ghosts.spec.ts`, `e2e/graveyard-fixtures.ts`)

Fixtures build the session and history with `serializeSession` and `serializeHistory` and write them to `localStorage` through `addInitScript`. They follow `e2e/scene-fixtures.ts`.

- **E1.** During `lit` and `paused`: the Door is a shut door, the Door button's `hidden` flag is set and the shut door's is not, Tab never reaches it, `g` does nothing (R3.3, R11.7). In `idle`, `burned-out` and `snuffed` the flags are the other way round, in the frame the phase changes (R3.5, R3.6; this is the browser check of Property 4). After burn-out: the Door is a button, `g` opens the view, and the Shelf shows the new Stub (R11.8).
- **E2.** Every drawn Item is reachable by keyboard alone (Tab, then arrows, Home, End); every Details_Card is reachable by tap alone, and each card's text equals the stored history values (R11.5, R11.6, R5.15).
- **E3.** A small history and a history of 200 sessions over 45 days at 360x640, 768x1024, 1280x800 and 1920x1080: no scroll in either direction, no overlap among items, Count_Lines, card and return control, and the Count_Lines read the exact numbers (R4.10 to R4.12, R8.8 to R8.11, R11.9).
- **E4.** Ghost counts 0, 1, 12 and 21 (G+9): the right number of ghosts, the Overflow_Mark `+9`, the scene label count, and bounding boxes that do not intersect the candle column or the floor band (R9.x, R10.1, R11.10).
- **E5.** Reduced motion: still ghosts, instant appearance, no transition on the view. Ghosts off: no ghost and no mark, label still true (R10.3 to R10.9).
- **E6.** `ariaSnapshot` of the Graveyard_View: roles, names, descriptions, group labels and Count_Lines; the focus ring computed style on an Item, the Door and the return control; text contrast measured against the values of `contrast.test.ts` (R11.15 to R11.17).
- **E7.** The page opens in the Room on a reload with a stored `lit` session, and the view returns to the Room when a session is lit from the view's phase change (R3.11, R3.12).
- **Screenshots** (`e2e/screenshots.spec.ts`, saved in `docs/screenshots/`): `ghosts-0-desktop.png`, `ghosts-1-desktop.png`, `ghosts-g-desktop.png`, `ghosts-g-plus-9-desktop.png`, the same four at phone size, `ghosts-g-plus-9-desktop-reduced.png`; `graveyard-small-desktop.png`, `graveyard-large-desktop.png`, `graveyard-card-keyboard-desktop.png`, `graveyard-card-touch-phone.png`, each at desktop and phone, and `graveyard-large-desktop-reduced.png` (R11.10 to R11.13). All `candle-*` screenshots are retaken (CR-E, R11.14).

### 8.6 Review

The last task is a review of the finished ghosts, graveyard and shelf by the Costume_Reviewer in the Kiro CLI. Its findings go into Decision D12 (R11.18).

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Reflection on the prework: the requirements' P1 and P3 both concern grouping, but P3 needs its own generator (a DST-jump function), so they stay apart. P9 and P10 of the requirements both check which items are drawn, so the partition and the "newest" selection are kept as two properties (7 and 8) because one failure does not imply the other. P4 and P5 are kept apart: P4 is the Door rule and P5 is the view rule. The ghost properties 19 and 20 are separate because 20 is about change over time. The card text and the Item name (R5.13, R7.1) share one property. The requirements' P6 also covers R1.3, R8.12 and R10.5, so no separate "no event" property is needed.

### Property 1: Entries group by their end day

*For any* history, *for any* `DayKeyFn`, `groupByDay` puts every entry in exactly one group; the group's key equals `dayKeyOf(endedAt)` for each of its entries; groups are in descending key order; items inside a group are in `newestFirst` order; and, for a history whose `(startedAt, endedAt)` pairs are unique, the result is unchanged when the input array is reordered.

**Validates: Requirements 2.1, 2.4, 2.6, 2.7, 2.8**

### Property 2: A daylight-saving day is one shelf

*For any* set of timestamps inside one local calendar day of a `DayKeyFn` with a 23-hour or a 25-hour day, `groupByDay` puts all their entries in the same group, and entries of different local days in different groups.

**Validates: Requirements 2.3**

### Property 3: The carved date comes from the end day

*For any* entry and *any* `DayKeyFn`, the date text of the entry's Stone, Item name and card equals `formatCarvedDate(dayKeyOf(endedAt))` and contains no time of day.

**Validates: Requirements 2.9, 2.10**

### Property 4: The Door is usable exactly when no candle burns

*For any* phase, `doorView(phase).usable` is true if and only if the phase is `idle`, `burned-out` or `snuffed`; `doorView(phase).shut` always equals `!doorView(phase).usable`; and *for any* engine script, `doorView(state.phase)` after every step follows this rule for the step's resulting phase. The model is pure; the DOM `hidden` flags are checked in browser test E1.

**Validates: Requirements 3.1, 3.2, 3.5, 3.6**

### Property 5: The Graveyard_View is open only when the Door is usable

*For any* sequence of `open`, `leave` and `phase` inputs over any phases, starting from the Room, the view is `"graveyard"` only if `doorUsable` holds for the latest phase; `open` while the Door is shut never changes the view; and a `phase` input with a running phase always returns the Room.

**Validates: Requirements 3.7, 3.10, 3.11, 3.12**

### Property 6: UI-only inputs never change the engine state

*For any* engine script and *any* interleaving of view switches, card inputs, focus moves, ghost-setting toggles and Door keys, the final engine state, and the serialized history and session, are deeply equal to the state after the same engine script alone.

**Validates: Requirements 1.3, 3.8, 3.15, 3.16, 8.12, 10.5**

### Property 7: Visible history is a partition of the history

*For any* history and *any* limits, the stones are snuffed entries only, the stubs are burned-out entries only, no entry is counted twice, and `stones.length + hiddenStones` equals the number of snuffed entries; the stubs drawn plus the sum of `hiddenStubs` plus the burned-out entries of the days not drawn equal the number of burned-out entries.

**Validates: Requirements 4.1, 4.4, 8.1, 8.3, 8.4, 8.8, 8.9**

### Property 8: The newest entries are the ones drawn

*For any* history and *any* limits, every drawn Stone is newer (by `newestFirst`) than every hidden snuffed entry; the drawn Day_Shelves are the newest days with a burned-out entry; and in each drawn day the drawn stubs are the newest of that day; `hiddenDays` equals the number of such days beyond `D`.

**Validates: Requirements 8.3, 8.4, 8.5**

### Property 9: Visible history does not depend on the array order

*For any* history with unique `(startedAt, endedAt)` pairs and *any* permutation of it, `visibleHistory` returns equal results.

**Validates: Requirements 8.14**

### Property 10: A history within the limits hides nothing

*For any* history with at most `S` snuffed entries, at most `D` days with a burned-out entry and at most `K` burned-out entries in each day, `visibleHistory` returns all counts equal to 0 and `stonesCountLine`, `daysCountLine` and `moreText` all return `null`.

**Validates: Requirements 8.10, 8.15**

### Property 11: Count lines state the exact hidden number

*For any* hidden count `n > 0`, the Count_Line text contains the decimal digits of `n`, and *for any* `n = 0` the line is `null`; the "+n more" text follows the same rule with `hiddenStubs`.

**Validates: Requirements 8.5, 8.8, 8.9, 8.10**

### Property 12: Roving focus keeps one stop and stays in its Group

*For any* `NavLayout`, *any* memory and *any* sequence of nav keys, each non-empty Group has exactly one id with tabindex 0 (the remembered id if still drawn, else the first) and an empty Group has none; every `navigate` result is an id of the same Group; Left, Right, Home and End never wrap; and the result equals a reference walk over the flattened list.

**Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.10, 6.11, 6.12, 6.18, 8.13**

### Property 13: Up and Down on the Shelf follow the day order

*For any* `NavLayout` and any Stub at row `r`, column `j`, Up goes to row `r - 1` and Down to row `r + 1` at column `min(j, rowLength - 1)`, and when that row does not exist the id does not change.

**Validates: Requirements 6.8, 6.9**

### Property 14: The key maps never clash and the Door key obeys the phase

*For any* key and *any* context in the Room, if `graveKeyAction` returns an action then `keyAction` of the Room returns `null` for the same key; *for any* phase, `g` returns `open` only when `doorUsable(phase)`, `leave` only in the Graveyard_View, and `null` while a text field has focus or an overlay is open; *for any* key in the Room, arrow keys, Home, End and Escape return `null`.

**Validates: Requirements 3.3, 6.15, 6.16, 6.17**

### Property 15: One card at most, shown by the rules

*For any* sequence of card inputs, at most one id is shown; hover never changes `focused`; a tap on the shown id hides it; a tap on another id shows that id; `tap-away` hides; `escape` hides a shown card and reports `handled = true`, and reports `handled = false` when none is shown; and `focus` of an id shows that id.

**Validates: Requirements 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.14, 6.13, 6.14**

### Property 16: The card never covers its item and stays on the stage

*For any* item rectangle produced by `stoneRect(0..9)` and `stubRect(0..2, 0..3)`, `placeCard` returns a rectangle that does not intersect the item, lies inside x 20..580 and y 215..895, and is at least 8 units from the item.

**Validates: Requirements 5.10, 5.11**

### Property 17: The layout fits and does not overlap

*For any* counts of stones up to `S`, days up to `D` and stubs up to `K`, every rectangle (items, labels, Count_Lines, empty lines, "+n more", return control) lies inside `PANEL_RECT`, no two of them intersect, and every ghost slot box at full size and at its drift extremes lies inside its own cell and outside the other cells, the Door, the floor band and the keep-clear column.

**Validates: Requirements 4.10, 4.11, 4.12, 9.4, 9.5, 10.8**

### Property 18: The card text and the Item name equal the entry

*For any* entry, `cardLines` has five lines that contain, in order, the intent (or the placeholder when it is null or empty), the Carved_Date, `lengthMin`, `distractions` and the `spokenTime` of `timeAwayMs`; and `itemName` equals the intent (or the placeholder) and the Carved_Date, joined by the template.

**Validates: Requirements 5.1, 5.2, 5.12, 5.13, 7.1, 7.2**

### Property 19: Visible ghosts are the newest, with the right size

*For any* list of spans and *any* `G`, `drawn.length + hidden` equals the length of the list, `drawn.length <= G`, the drawn indices are the newest ones, each drawn `size` equals `ghostSize` of its span and lies in [0.25, 1], and `hidden = 0` when the length is at most `G`.

**Validates: Requirements 9.1, 9.2, 9.6, 9.9, 9.10, 9.13**

### Property 20: Ghost slots are unique and stable

*For any* list of spans and *any* `G >= 1`, the slots of the drawn ghosts are all different and below `G`; and *for any* list and any added span, every ghost that was drawn before and is still drawn keeps its slot, and the new ghost takes the slot of the oldest ghost that left.

**Validates: Requirements 9.11, 9.12**

### Property 21: The scene label always gives the engine count

*For any* state, *any* flame mode, *any* `ghosts` setting and *any* `G`, `sceneLabel(mode, distractionCount(state))` contains the decimal digits of `distractionCount(state)` followed by "distraction" or "distractions", and does not contain the time.

**Validates: Requirements 10.1, 10.2, 10.4**

### Property 22: The graveyard view never triggers a room action

*For any* key descriptor and *any* `KeyContext` with `view === "graveyard"` and no overlay open, `keyAction` never returns a room action (light, toggle-pause, open-snuff, keep-burning, announce-time or a length change); and *for any* context with `view === "graveyard"` and focus on an item, `graveKeyAction` for Enter returns only `show-card`, while Enter with focus elsewhere in the view returns `null`.

**Validates: Requirements 3.13, 6.16, 6.17**

## Section 10: Decisions

- **D1. Time-zone change (R2.13).** Days are computed at draw time from `endedAt` and the current `DayKeyFn`. If the browser's time zone changes between visits, a session near midnight may move to the neighbouring Day_Shelf. Nothing is stored, so nothing needs migrating.
- **D2. S, D, K (R8.6).** S = 10, D = 3, K = 4, derived in L8 from the 600 by 1000 stage at the smallest supported scale (0.6), the 44 px hit size and the contrast floor.
- **D3. G (R9.7, R9.8).** G = 12: six slots in each edge band, derived in L4.
- **D4. Stub order inside a day (R2.7).** Newest first, left to right. All the orders in the view are newest first (Stones, Day_Shelves, Stubs), so "the newest Item" is always the first one, the hidden ones are always the oldest, and "+n more" at the end of a row hides the oldest stubs of the day.
- **D5. Minimum hit size (R4.13).** 44 CSS px at the smallest scale, which is 73.3 room units. Stones are 100 by 90 units, Stubs 74 by 74, the Door and the return control 80 by 85 (L1, L7, L11).
- **D6. Ghost slot assignment (R9.11, R9.12).** `slot = index mod G`, where `index` is the position in `ghostSpansMs`. Slot 0 is the first slot (left band, top row), and the slots alternate left and right going down. The new ghost reuses the slot of the oldest drawn ghost without any rule other than the arithmetic.
- **D7. The Door's key is `g`.** It is not used by the Room map (Enter, Space, Escape, `t`, arrows in the chooser), it is a letter of "graveyard", and it is ignored while a text field has focus. The wording of the key hint is not added to the status line in this spec.
- **D8. The Graveyard_View has its own opaque panel.** The candle column is ivory, and ivory text on it would fail the contrast rule. The panel `x 0..600, y 205..800` with `#080b12` hides the room's candle and ghosts while the view is open, which gives the text the card's contrast (15.83) and makes the contrast figures of L11 a floor. The panel is the view's background, not decoration: it shows that the user has left the room.
- **D9. Layers.** The ghost layer is a separate SVG above the scene, with the scene's own scaling rule. The scene SVG and its model are untouched (R10.11).
- **D10. The label suffix goes through the scene's `apply` (CR-S1).** One optional argument keeps the scene's label rule in one place and avoids a second writer of `aria-label`. The count is the label's only new content.
- **D11. Tap and focus.** A touch tap focuses a button in most browsers. The DOM layer drops the focus event that follows a touch `pointerdown` on an item, so a tap shows the card once and a second tap hides it (R5.6, R5.7). Keyboard focus and mouse hover are unaffected.
- **D12. Costume review.** To be recorded by the final task: the findings of the Costume_Reviewer on the ghosts, the graveyard and the shelf (R11.18).
- **D13. Enter on an item shows its card; the key map knows the view (R3.13, R6.16, R6.17).** Enter on a focused Stone or Stub opens that item's Details_Card and does nothing else; Enter elsewhere in the Graveyard_View does nothing. Instead of trusting the dispatcher to route keys, `KeyContext` gets `view: "room" | "graveyard"` and `keyAction` returns no room action in the graveyard (CR1), so no room action can be reached from there.
