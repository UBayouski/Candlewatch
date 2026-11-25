# Design Document: visual-polish

## 0. Status

Requirements and design approved with amendments. This design records the geometry and the checks for the built app. The candle measurements are projections from the current SVG and the proposed geometry. The ghost clearances are calculated from conservative bounds. Visual review and performance measurements belong to the built result.

**Build order:** landscape framing (R2), ghosts (R1), dawn (R3), graveyard (R4). Each goal stands on its own. The framing keeps the legacy ghost layout usable until the new placements ship.

## 1. Architecture

The room, ghost layer, controls and graveyard retain the existing 600 × 1000 meet transform. The landscape composition uses the visible room outside those nominal bounds, with the candle and the time still centred. The existing resize measurement in `src/ui/index.ts` supplies the viewport and composition to the presentation layers. `src/ui/layout.ts` supplies the screen rectangles for controls and overlays. Pass the measured geometry through the existing wiring. Apply layout changes together before paint, and recompute the geometry only when the viewport changes. An open opaque dialog covers the artwork beneath it through the existing layer order.

Scene SVG and CSS consume layout values alongside the existing scene properties. The pure geometry belongs in the existing layout, scene and ghost modules within their current import boundaries. Keep shared numbers consistent with contract tests across the layer boundaries. The scene model, dispatch, clock, stores, user copy and accessible names remain the sources already defined in steering. The graveyard uses the same history selection and interaction model.

## 2. Decisions

### D2. Landscape framing (R2)

Use the larger composition when the viewport is landscape and the side gutter `ox` is at least the existing 360 CSS px wide-layout threshold. This includes all three landscape reference sizes. Use the current composition elsewhere, including narrow landscape and phone portrait. The wide setup and modal columns, zone, Door, graveyard and screen-to-room transform retain their anchors. `backdropExtent` still computes the inverse meet transform. The extended wall, table and time band cover the available viewport.

- Set full wax-body height to **550 room units** in the larger composition, anchored at the raised foot `y = 882`. The same wax fraction gives `550 × waxHeight` of body. The full body begins at `y = 332`. The head and the centres of the candle pool and warm tint rise by `18 + 130 × waxHeight` from the compact positions. Keep the existing wick, flame, flicker, smoke and pool radius rules. Raise the stub and the drip clip to the same foot. Offset the halo by 18 units within the lifted head so its upper bound and window and ghost clearances stay as approved.
- Fit the complete framed window and panes into `x = 105..225, y = 24..149`, including the star field in that remapping. The protected rectangle for frame, pane and blur is `[102,18]–[231,155]`. The halo starts at `y = 160` at full wax and descends thereafter. The new window sits above the halo, outside the control columns and above the first legacy ghost cell. Retain the coarse night ambient contribution from the window. D3 gives the dawn patch a separate window-aligned profile.
- At landscape scale, start the table at `y = 868` with a shallow wood top, a narrow lit front lip and a darker front face ending at `y = 898`. Keep the dish centred at `x = 300`, with the oval back rim and recess above the wax foot and a contact shadow that ends at `y = 887`. Draw the near rim and front over the wax, using the same material contour, shared night mask and matching dawn overlay. The rim covers about 2 units of wax at the centre and ends at `y = 887`. The dish and its shadow leave 11 room units of table below them, at least 8.8 CSS px at the reference sizes. The zone still begins at `y = 900`. Use existing setting colours and light. Compare the rim and table lip at lit start, half time and last minute.
- At 360 × 640 keep the existing scene geometry and the 44 CSS px touch targets. In forced colours the setting is hidden and the landscape wax foot returns to the time-band boundary. In all modes keep the time and status band above the artwork at the same pixel position as today. Check the state-bearing geometry, responsive control rectangles, full wall coverage and scroll bounds throughout the existing viewport matrix.

| Viewport | Current body | Proposed body | Proposed fraction | Acceptance floor |
|---|---:|---:|---:|---:|
| 1280 × 800 | 336 px | 440 px | 55.0% | 436.8 px |
| 1920 × 1080 | 453.6 px | 594 px | 55.0% | 589.68 px |
| 3840 × 2160 | 907.2 px | 1188 px | 55.0% | R2.3 visibility check |
| 360 × 640 | 252 px | 252 px | 39.375% | Preserve portrait |

Measure the body rectangle and visible wax in the browser at lit start using the test clock. At the three landscape reference sizes verify the rim obscures the wax foot and measure the gaps below the dish and table. The previous fixed candle size and fixed window coordinates in `candle-scene`, `room-art` and `controls-and-access` become composition-specific checks. During this goal also check the existing ghost columns, mark, compact dialog bounds, Door and graveyard. Framing must pass its own release checks with those layers in place.

| Viewport | Visible wax height | Visible wax bottom / front rim bottom (screen y) | Table below the dish | Dish above the band |
|---|---:|---:|---:|---:|
| 1280 × 800 | 438.39 px (54.80%) | 704.00 / 709.60 px | 8.80 px | 10.40 px |
| 1920 × 1080 | 591.42 px (54.76%) | 950.00 / 957.96 px | 11.88 px | 14.04 px |
| 3840 × 2160 | 1182.85 px (54.76%) | 1900.00 / 1915.92 px | 23.76 px | 28.08 px |

### D1. Ghost placement feasibility (R1)

#### 2.1 Scale and proof method

The maximum applies to the existing `ghostSize` fraction. In the formulas below, `m` is the maximum scale relative to the 70 × 75 source box, `s` is the meet scale, and CSS coordinates are `(ox + s × x, oy + s × y)`.

| Viewport | `s` | `(ox, oy)` in CSS px | `m` | Full-size box in room units | Full-size box in CSS px | Placement half-width, half-height in room units |
|---|---:|---:|---:|---:|---:|---:|
| 360 × 640 | 0.6 | (0, 20) | 1 | 70 × 75 | 42 × 45 | (48, 51) |
| 1280 × 800 | 0.8 | (400, 0) | 1.7 | 119 × 127.5 | 95.2 × 102 | (75, 79) |
| 1920 × 1080 | 1.08 | (636, 0) | 1.7 | 119 × 127.5 | 128.52 × 137.7 | (75, 79) |
| 3840 × 2160 | 2.16 | (1272, 0) | 1.7 | 119 × 127.5 | 257.04 × 275.4 | (75, 79) |

The body paths, eyes and inner glow fit the 70 × 75 box. The 1.5-unit round-joined outline adds 0.75 unit to each edge before scaling. For up to 3° of tilt, bounding all these marks by the rotated padded box gives half-extents at most 37.71 × 40.07 before scaling. Multiply by `m`, add up to 2 units of deterministic resting offset and 8 units of drift in each axis, and round the result outwards to the placement half-extents in the table. The rendered transform order is anchor and identity offset, translation for drift, then tilt and scale. Putting drift outside the scale group keeps its bound at 8 room units even for the largest ghost. Reduced motion uses drift zero and the same resting geometry.

#### 2.2 Twelve full-size placements

All coordinates below are room units. An area is `[left, top]–[right, bottom]`, inclusive. Rows are the order of first arrival. The landscape table applies at each of the three landscape reference viewports.

| Slot | Phone anchor | Phone area | Landscape anchor | Landscape area |
|---:|---:|---|---:|---|
| 1 | (179, 230) | [131,179]–[227,281] | (315, 80) | [240,1]–[390,159] |
| 2 | (424, 212) | [376,161]–[472,263] | (545, 186) | [470,107]–[620,265] |
| 3 | (117, 384) | [69,333]–[165,435] | (60, 306) | [−15,227]–[135,385] |
| 4 | (548, 307) | [500,256]–[596,358] | (650, 560) | [575,481]–[725,639] |
| 5 | (54, 274) | [6,223]–[102,325] | (−412, 667) | [−487,588]–[−337,746] |
| 6 | (478, 421) | [430,370]–[526,472] | (502, 369) | [427,290]–[577,448] |
| 7 | (58, 490) | [10,439]–[106,541] | (97, 507) | [22,428]–[172,586] |
| 8 | (535, 527) | [487,476]–[583,578] | (808, 599) | [733,520]–[883,678] |
| 9 | (122, 599) | [74,548]–[170,650] | (−77, 820) | [−152,741]–[−2,899] |
| 10 | (486, 638) | [438,587]–[534,689] | (575, 750) | [500,671]–[650,829] |
| 11 | (73, 730) | [25,679]–[121,781] | (−245, 700) | [−320,621]–[−170,779] |
| 12 | (551, 753) | [503,702]–[599,804] | (982, 781) | [907,702]–[1057,860] |

The landscape anchor above the candle occupies the strip above the highest halo and lies to the right of the window. The two highest portrait positions sit to either side of the window and above the full candle. Lower positions alternate closer to and farther from the pool. Actual contour, scale and tilt vary inside the stated areas. A maximum-size screenshot with all slots occupied is the visual check for apparent rows or columns. At minimum scale the source silhouette renders in a 10.5 × 11.25 CSS px box at 360 × 640. Keep the face and outline recognisable at that size.

For the landscape witness, separately sort the 12 anchor coordinates on each axis. Every consecutive triple must span more than 60 room units. The minimum spans are 73 units in x and 70 units in y. These remain at least 69 and 66 after the worst opposing resting offsets of 2 units per anchor. The resting spans measure 74.89 and 72.34 room units with twelve full-size distractions, and 73.22 and 72.23 with 21 distractions and twelve drawn. The right-side pairs 2/6 and 4/10 had only 16 room units of horizontal separation in the first captures. The final separations are 43 and 75, with the positions alternating horizontally down the wall. The portrait positions retain the original zigzag.

#### 2.3 Protected geometry

| Protected feature | Phone rectangle | Landscape rectangle |
|---|---|---|
| Candle, flame and flicker, halo, holder and moving pool centre over all wax heights | [218,284]–[382,316], [190,316]–[410,350], [175,350]–[425,900] | [174,160]–[426,900] |
| Entire window, frame and blur | [235,44]–[365,266] | [102,18]–[231,155] |
| Door and clearance | [10,794]–[110,900] | Same |
| Overflow mark | [448,833]–[600,900] | Same |
| Time text, status and zone controls | All x at y ≥ 900 | Same |

The candle guard covers the halo's full 120-unit radius and every head position with the above-floor clip. Flame flicker stays within that guard. The Door guard includes 6 CSS px of focus clearance at the smallest scale. The overflow mark stays real text, centred at `(524,872)` at 24 units. Verify its measured bounds for narrow and long counts against the reserved rectangle. Keep its existing text contrast.

For controls, measure the union of the applicable rectangles with a 6 CSS px focus margin. The phone setup envelopes below are expressed in CSS pixels. The wide envelopes include the open settings and snuff dialogs as well as setup and invalid-length controls. Their room coordinates are rounded outwards.

| Viewport | Setup and overlay envelopes |
|---|---|
| 360 × 640 | Ordinary setup in CSS px: chooser [2,0]–[358,54], intent [2,50]–[142,106], Light [230,50]–[358,114]. Compact modals are discussed below. |
| 1280 × 800 | Left [−477.5,112.5]–[−22.5,577.5], right [622.5,112.5]–[1077.5,452.5] |
| 1920 × 1080 | Left [−572.23,83.33]–[−227.77,427.78], right [827.77,83.33]–[1172.23,335.19] |
| 3840 × 2160 | Left [−580.56,41.66]–[−408.33,213.89], right [1008.33,41.66]–[1180.56,167.60] |

For two rectangles, take the largest of the four signed separations between opposing edges. A positive result proves a gap on at least one axis. The following minima include worst-case scale, orientation and drift. The landscape guard results also include the wide dialog envelopes as an extra composition check.

| Viewport | Minimum gap across the 66 area pairs | Minimum gap to a guard | Minimum viewport inset |
|---|---:|---:|---:|
| 360 × 640 | 4 | 3 | 1 |
| 1280 × 800 | 8 | 1 | 1 |
| 1920 × 1080 | 8 | 1 | 1 |
| 3840 × 2160 | 8 | 1 | 1 |

**Compact modals.** At 360 × 640 the padded Settings envelope `[2,0]–[358,286]` CSS px intersects placement areas 1 through 7. The padded snuff envelope `[2,2]–[358,192]` intersects areas 1, 2, 4 and 5. The opaque modal covers whatever artwork lies under its actual panel. The ghost layer continues to draw the same plan, with identical resting transforms, active drift, overflow count and accessible count. Closing the modal exposes the same ghost layer. Modal occlusion requires only the existing layer order.

#### 2.4 Stable selection and responsive behaviour

Keep the newest-12 selection and use `index mod 12` to pick the area. Derive variant, tilt and the bounded offset from the index. Multiply `ghostSize` by the viewport maximum. Retained elements keep the same transform when a distraction arrives. At the cap, release the exiting slot before showing its new ghost, so there is no overlapping fade or thirteenth painted ghost. The entering fade still runs when motion is allowed. Outside cap replacement keep existing fade behaviour within the 12-ghost limit. With reduced motion apply the swaps immediately.

At each reference size use the verified anchors. On other sizes start with the corresponding composition's anchors. Validate fully swept rectangles against the visible extent and the actual layout's projected guards, then resolve conflicts using a bounded search over nearby alternate anchors, including separate compact top-row and left-region candidates where their setup bounds differ. Build the complete 12-slot plan from viewport geometry and the union of ordinary control bounds, before assigning any history. Use a fixed candidate order and cache the plan per viewport. Use the 1.0 source scale on compact; wide sizes outside the references can reduce the 1.7 scale as needed, down to 1.0. The extended viewport matrix and aspect-ratio sweep must verify the resolved plan before shipping. The numerical witness here covers the four requested reference sizes. If another supported size still cannot accommodate the plan, bring its failing geometry back for review before shipping.

Replace the old column-specific region and clearance assertions in `room-art` R5, `ghosts-and-graveyard` R9/R10 and `controls-and-access` keep-clear checks with the viewport-area contract. Preserve contrast over the brightest composite actually reachable by any ghost, including after D3, and preserve the eyes' contrast on the composed body. Ghosts remain outside the accessibility tree. The scene continues to report the total through its existing label.

### D3. Dawn from the window (R3)

Remove the full-room colour wash and its matching foreground-dish overlay together. Keep the existing completion property and timing. Preserve the broad ambient night window contribution in the night states. At dawn use a subdued ambient lift and concentrate the brighter light and warmer tint in the same elliptical field, within the setting light stack. The stone pattern, mortar and table remain visible through the tint. The pool and the candle's warm tint retain their rules.

| Design input | Compact | Larger landscape composition |
|---|---:|---:|
| Top of field within the glass | (300, 135) | (165, 75) |
| Ellipse centre at the floor line | (300, 900) | (305, 900) |
| Radii before shear | 155 × 765 | 210 × 825 |
| Horizontal shear from top to floor | 0 | 140 room units to the right |

Both gradients start within the glass and widen down to the floor clip. The landscape shear directs their centreline across the table at the dish. The focus remains near the sill at 6% of each ellipse's full height. Both gradients use strengths of 1, 0.98, 0.74 and 0 at normalised radii of 0, 0.55, 0.84 and 1. The field uses 0.92 peak local exposure and 0.77 peak warm tint, both scaled by the eased dawn amount and field strength. Completion retains the 0.50 night ambient level. The glass blur is clipped at the top of the frame, and the wall above the window retains its night brightness. The exposure multiplies residual darkness in the existing night mask, so wall and mortar show through. The warm tint sits beneath that mask and has its own floor clip, which keeps it above the zone and allows it to reach below the raised landscape wax foot. The foreground dish uses the same exposure mask. `light.ts` mirrors the shear, shifted gradient focus, colour mixing and clip. The field appears immediately under reduced motion and eases in over the existing three seconds otherwise.

The tint is `#855b3d`. The dawn panes brighten from `#655750` at the top to `#7d6041` at the sill. Their relative luminances are 0.12806, 0.10162 and 0.13107 against the published ceiling of 0.13120 (`#566683`). The graveyard retains its established sky and earth colours. The separate dusk and dawn time-band fills retain `#4b4358` at dawn. The ivory time on that fill computes to 7.53:1. The browser checks the full time and status backing, adjacent pixels around the main control and Door, and the ghost sweep with the new field. It compares light below and beside the window against the surrounding wall, a mortar joint against its stone under the patch, and the table where the light reaches it. It checks dawn against lit start, half time, last minute, paused, idle and snuffed.

At each reference viewport, compare the luminance of overlapping 3 × 3 CSS-pixel patches wholly above the window frame with their idle-night counterparts. The maximum relative difference must stay within 2%. Check that the exposed tabletop beside the dish is brighter than the table farther out.

### D4. Graveyard, cards and shelf (R4)

Use `geometry.ts` and `plan.ts` to keep the original indexed order, with two staggered rows of up to five stones. Keep 100 × 74-unit button bounds at both depths. Back-row centres are `90, 200, 310, 420, 530` at `y = 257` to `331`. Front-row centres are `75, 185, 295, 405, 515` at `y = 341` to `415`. The first five items in the existing sort order fill the back row. The 44.4 CSS px minimum height at phone scale, one visible focus ring and current hit geometry behaviour remain usable. Check the ring against the drawn faces and text at phone scale. Continue to place the card relative to the button rectangle through `placeCard`.

Derive the crown, face size and offset from each stone's existing item identity. Back faces are 70–88 units wide and 54–70 high. Front faces are 76–96 units wide and 60–74 high. Offset each face by up to ±8 units from horizontal centre and its foot by up to ±5 units from the five-unit base inset. Clamp the offsets to the available slack on each axis and reserve two units for the side bevel. A front face at the full 74-unit height reaches the bottom of its hit box. Use a round arch, a pointed arch or a flat top with rounded shoulders, chosen deterministically. Let the crown lean by at most 4 units. Counter-taper its sides and keep the button and text upright.

Give each stone an irregular shoulder and a chipped crown. Shape the side bevel with the same contour and shade the faces with matte mineral tones, lichen and intermittent surface cracks. Use the existing pebble path to draw the rise of the slope and the existing mound, shadow and grass paths to seat the irregular feet in the earth. Bound the soil lip to 10 units below the foot. Position the date and intent in an upright, crown-aware inset with tighter line spacing, preserving the existing ellipsis and full accessible content. Check the text, focus ring and overflow lines at the smallest scale.

The final checkpoint widens the desktop intent line within the stone and allows two lines when both fit above the uneven foot. Overflow receives an ellipsis. Phone retains one line. The face uses untiled mineral shading across all crown variants.

Use a weathered stone plaque for stone details with a quiet face near `#242737` and a local rim. Ivory on that face computes to 11.89:1. Use `#b5bcc9` as the candidate thin stone edge, which computes to 4.41:1 against earth of `#5b4a3e`; check the lightest actual earth at the edge and retain the current edge-on-ground floor. The card's text, wrapping, target clearance, focus marker and open/dismiss rules remain in the existing card and tap-guard logic. Keep hover, keyboard, tap and mixed-input coverage.

On desktop draw shelf wax at 40 × 42 room units instead of 28 × 30, anchored to the same board height and centred in the same hit target. Shape the wax with a rounded top, a dark wick recess and a short drip. Lengthen the wick just enough to clear the wax top. Keep the compact shelf rendering. Verify wax contrast against the lightest board and retain every overflow line. Keep the horizon's `.p-tower` lighthouse silhouette, its path coordinates and its sky-layer ordering as they are. It is the keeper's lighthouse and belongs to the still sky setting.

The stone faces use the existing buttons and their CSS boxes, and the setting reuses the existing Place paths. Batch 4 added **zero DOM elements** at maximum history. The production build rose from 125 033 to 128 523 raw JS+CSS bytes, a cost of 3 490 bytes.

### D5. Budgets and release evidence (R5, R6)

The existing build is 119 989 raw JS and CSS bytes. The last recorded maximum history count is 390 elements and the last recorded GPU median/p95 is 16.7/16.8 ms. Apply the 130 000-byte ceiling to the budget tests and tech steering. Keep the 415-element ceiling across the room SVG, 12 ghosts and full Place. Reuse existing masks and paths, batch repeated ground marks into paths, and keep the stone plaque styling within the existing DOM. No element-limit increase is proposed.

At each shippable stopping point record built bytes, maximum-content element count and the real-clock GPU frame results from `scripts/frame-budget.mjs`. Enforce 17.5 ms median and 25 ms p95 across 600 lit frames at 1920 × 1080 on the GPU renderer. Keep the current filter rules. Run `npm run verify`, retake and look at the affected screenshots, and record the `costume-reviewer` PASS verdict for the visible changes. On the final stopping point retake and inspect the entire 62-file inventory. Update the shipped visual descriptions in README and steering, and record the session entry in the existing `KIRO_USAGE.md` format with `Surface: Kiro CLI`.

| Checkpoint | Raw JS+CSS | Maximum-content elements | GPU median / p95 |
|---|---:|---:|---:|
| 3, landscape framing | 121 685 bytes (+1 696) | 390 (184 scene, 78 ghosts, 128 Place) | 16.700 / 16.800 ms (Intel UHD Graphics, Direct3D 11) |
| 3.1, raised candle foot | 122 722 bytes (+1 037) | 395 (189 scene, 78 ghosts, 128 Place) | 16.700 / 16.700 ms (Intel UHD Graphics, Direct3D 11) |
| 6, ghost placement | 124 623 bytes (+1 901) | 395 (189 scene, 78 ghosts, 128 Place) | 16.700 / 16.700 ms (Intel UHD Graphics, Direct3D 11) |
| 8, directional dawn | 125 132 bytes (+509) | 408 (202 scene, 78 ghosts, 128 Place) | 16.700 / 16.700 ms (Intel UHD Graphics, Direct3D 11) |
| 8.1, shaft origin | 125 033 bytes (−99) | 408 (202 scene, 78 ghosts, 128 Place) | 16.700 / 16.800 ms (Intel UHD Graphics, Direct3D 11) |
| 11, graveyard build | 128 523 bytes (+3 490) | 408 (202 scene, 78 ghosts, 128 Place) | 16.700 / 16.800 ms (Intel UHD Graphics, Direct3D 11) |
| 11, inscription and texture follow-up | 129 051 bytes (+528) | 408 (202 scene, 78 ghosts, 128 Place) | 16.700 / 16.800 ms (Intel UHD Graphics, Direct3D 11) |

## 3. Correctness checks

| Check | Coverage |
|---|---|
| Framing | Measure lit-start wax at the two R2.1 sizes. Verify visible window, full glass and candle stack, time and controls, Door alignment, and edge coverage through all supported composition classes. Exercise the intermediate framing release with the legacy ghosts and both motion preferences. |
| P1, append stability | With `PROP_PARAMS`, generate indices and duration histories across and beyond the cap. Check repeatability and equality of retained transforms, including both viewport maximum scales. Check the exact hidden count and the transient cap on the browser layer that owns painting. |
| P2, clearance | Check the explicit 12-at-full-size witnesses and generated sizes, phases, viewports and layout variants. Compare rendered outline and glow extents through the entire drift against one another and against the projected guards. Check both landscape triple spans and the minima in D1. Cover normal and invalid-length layouts. Exercise compact modal open and close to verify layer order and stable placements and counts. |
| Dawn | Check luminance contrasts and lit-versus-nearby and stone-versus-joint samples. Verify the source and table patch in both compositions, night-state distinction and the fixed time-band floor. Exercise normal motion, reduced motion, and forced colours. |
| Graveyard | Test small and maximum histories, card placement, item names, overflow, touch, keyboard and mixed input. Compare front and back silhouettes and ring clearance in rendered geometry. Verify the lighthouse and adjacent sky visually at the wide size. |
