# Implementation Plan: visual-polish

## Overview

Implements the approved `design.md` against `requirements.md` in four Kiro CLI batches. Each batch ends at a shippable checkpoint. The landscape framing ships with the legacy ghost placement in place. The ghost batch uses the room that framing establishes.

| Batch | Tasks | Goal | Requirements |
|---|---|---|---|
| 1 | 1–3 | Landscape framing | R2, R5, R6 |
| 2 | 4–6 | Ghosts around the light pool | R1, R2.4, R5, R6 |
| 3 | 7–8 | Dawn through the window | R3, R5, R6 |
| 4 | 9–11 | Graveyard, cards and shelf | R4, R5, R6 |

**Status.** All four batches and the graveyard follow-up are complete. Task 11 records the final verification and both Kiro costume-review verdicts.

### Conventions

- Keep the engine and storage contracts, existing copy, controls and accessibility behaviour. Follow steering for TypeScript, module boundaries, inline SVG and CSS, contrast, reduced motion, forced colours and Content Security Policy.
- Keep unit and property checks beside the source and browser checks in `e2e/`. Use `PROP_PARAMS` for fast-check and the existing paused-clock and serializer fixtures for Playwright. Replace tests tied to superseded artwork with checks for the approved geometry while preserving coverage of unchanged behaviour.
- At every checkpoint run `npm run verify`, record raw built JS+CSS bytes and maximum-content element counts, and measure 600 real-clock lit frames at 1920 × 1080 with the GPU renderer using `scripts/frame-budget.mjs`. Enforce 130 000 bytes, 415 elements, GPU median ≤ 17.5 ms and p95 ≤ 25 ms, and the existing filter restrictions. Record the GPU renderer and results.
- At every checkpoint retake and visually inspect the affected screenshots in `docs/screenshots/`. Use the capture specs and `CANDLEWATCH_SHOTS=1` as described in README. Send the finished changes, screenshots and measured results to the read-only `costume-reviewer`. Address blocking findings and record a PASS. Update README and steering where they describe the look that can ship at this checkpoint.
- If a checkpoint is the final stopping point, retake and inspect all 62 screenshots and verify the inventory against `e2e/screenshot-list.ts`. Record the captures and review results in the task summary. Record the session in `KIRO_USAGE.md` with the existing dated format and `Surface: Kiro CLI`.
- Stop after checkpoints 3, 6, 8 and 11. Report what changed, measured bytes and element count, GPU median/p95, costume-review verdict and the filenames retaken. Wait for the owner's go-ahead before starting the next batch. The owner handles version control. Run no Git commands. Tick completed tasks and record their results as work proceeds.

## Tasks

### Batch 1 — Landscape framing

- [x] 1. Record the current build and apply the approved performance ceiling
  - [x] 1.1 Build the current app and record raw JS+CSS bytes and the maximum-content element counts for the room, 12 ghosts and Place. Read the current wax-body geometry at lit start at 1280 × 800 and 1920 × 1080 in Chromium and record its CSS pixel height and viewport fraction next to the requirements baseline.
    - Result: 119 989 raw bytes and 390 elements (184 scene, 78 ghosts, 128 Place). Chromium measured 335.99 px and 453.59 px, respectively, both 42.0% of viewport height.
  - [x] 1.2 In `src/scene/budget.test.ts`, `e2e/room-art-build.spec.ts` and `.kiro/steering/tech.md`, use the approved 130 000 raw-byte ceiling. Keep the 415-element and filter checks and the existing GPU limits. Use these checks for each batch's measurements.
    - Result: The production-file assertion and steering-consistency test use the shared 130 000-byte limit. The element test reports the breakdown against 415, and the existing GPU and filter limits apply.
  - _Requirements: R2.1, R6.2–R6.4. Design: D2, D5._

- [x] 2. Render and verify the larger landscape composition
  - [x] 2.1 Compute the composition from the existing viewport measurement and side gutter in `src/ui/`, and pass it to the scene via the existing wiring. Keep the meet transform shared by the scene, ghost layer, Door, controls and graveyard. Test the boundary into the larger composition and the compact fallback.
    - Result: The interface sets the landscape presentation from its existing resize measurement. The threshold, compact fallback and shared meet transform pass the layout checks.
  - [x] 2.2 In `src/scene/`, implement the 550-unit wax body, head and pool alignment, framed window remap and taller lit table and dish from D2. Use the existing wax fraction, flame shapes, pool radius, compact geometry and time-band anchors. Update the paired geometry checks in `room.test.ts`, `setting.test.ts`, `scene.css.test.ts` and `src/ui/layout.test.ts` where they pin the changed composition.
    - Result: The landscape transforms reuse the existing SVG elements. Tests cover the head offset shared by both light layers and the transformed keep-clear geometry. The focused unit run passed all 102 checks and measured 390 elements.
  - [x] 2.3 Extend the existing scene, wide-room, base and controls browser checks. Measure the rendered wax body at lit start against the 54.6% floor at both specified landscape sizes. Check the window, flame, table and dish, edge coverage, time and status band, and keep-clear geometry across the supported sizes, wax heights, controls and motion preferences. Check phone touch targets and portrait geometry, and verify the legacy ghost columns, overflow mark and Door before the ghost batch.
    - Result: The rendered full wax body is 439.99 px at 1280 × 800 and 593.98 px at 1920 × 1080 (55.0% at both), 1187.97 px at 4K and 251.99 px in phone portrait. The wall samples follow the changed window geometry. A landscape-only mix of existing frame and sill colours keeps the last-minute frame/glass ratio at 1.124:1 and the dawn frame/glass ratio at 1.273:1, above the existing test floors.
  - _Requirements: R2.1–R2.4, R5. Design: D2._

- [x] 3. Checkpoint — Landscape framing ready to ship
  - Apply the checkpoint procedure. Record the browser-measured candle heights and fractions. Retake and inspect the framing-affected room and overlay shots, including the landscape candle, controls and legacy ghost views. Record the costume review of the candle, framed window, lit table/dish and portrait parity.
  - Result: `npm run verify` passed with 1 585 unit tests across 122 files and 560 browser tests passed, 9 skipped. The build measured 121 685 raw JS+CSS bytes and 390 elements. Intel UHD Graphics on Direct3D 11 measured a 16.700 ms median and 16.800 ms p95 over 600 lit frames at 1920 × 1080.
  - Costume review: PASS. The first pass requested clearer table and dish edges at lit start. The revised landscape base uses separate geometry for the top, lip, front, rim and recess. At desktop lit start, rim/recess measured 1.555:1 and lip/top 1.119:1. The final reviewer looked at all 33 retakes in contact sheets and inspected the full-size desktop lit-start, wide half, 4K half and phone half pictures. The faint lip and partly obscured dish at 1280 × 800 were advisory. The author measured the test and performance results separately.
  - Retaken and inspected (33 files in `docs/screenshots/`).
    - Candle: `candle-burned-out-desktop-reduced.png`, `candle-burned-out-desktop.png`, `candle-idle-desktop-reduced.png`, `candle-idle-desktop.png`, `candle-lit-half-4k.png`, `candle-lit-half-desktop-reduced.png`, `candle-lit-half-desktop.png`, `candle-lit-half-wide.png`, `candle-lit-last-minute-desktop-reduced.png`, `candle-lit-last-minute-desktop.png`, `candle-lit-start-desktop-reduced.png`, `candle-lit-start-desktop.png`, `candle-paused-desktop-reduced.png`, `candle-paused-desktop.png`, `candle-snuffed-desktop-reduced.png`, `candle-snuffed-desktop.png`.
    - Controls: `controls-focus-light-desktop.png`, `controls-focus-pause-desktop.png`, `controls-idle-returning-desktop-reduced.png`, `controls-idle-returning-desktop.png`, `controls-invalid-length-dawn-desktop.png`, `controls-invalid-length-desktop.png`, `controls-lit-intent-desktop.png`, `controls-settings-desktop-reduced.png`, `controls-settings-desktop.png`, `controls-settings-off-desktop.png`, `controls-snuff-dialog-desktop-reduced.png`, `controls-snuff-dialog-desktop.png`.
    - Ghosts: `ghosts-0-desktop.png`, `ghosts-1-desktop.png`, `ghosts-g-desktop.png`, `ghosts-g-plus-9-desktop-reduced.png`, `ghosts-g-plus-9-desktop.png`.
  - _Requirements: R2, R5, R6. Design: D2, D5._

  - [x] 3.1 Seat the landscape candle foot inside the dish
    - Draw the near rim after the wax, raise the base above the time band, and leave at least 8 CSS px of table below the dish at the three landscape reference sizes. Verify occlusion in rendered pixels and retain the 54.6% visible height floor. Keep the portrait art and control geometry.
    - Retake affected screenshots, inspect the 1280 × 800 foot at 2×, run `npm run verify`, measure the performance budgets, and get a foot-specific costume review before closing the follow-up.
    - Result: The near rim covers the foot. At 1280 × 800, 1920 × 1080 and 4K respectively, the visible wax is 438.39, 591.42 and 1182.85 CSS px. Table below the dish measures 8.80, 11.88 and 23.76 CSS px. D2 records the rim and band coordinates. The forced-colours check verifies the wax reaches the band in that mode.
    - Verification: `npm run verify` passed with 1 585 unit tests and 560 browser tests passed, 9 skipped. The build measured 122 722 raw JS+CSS bytes and 395 elements. Intel UHD Graphics on Direct3D 11 measured a 16.700 ms median and 16.700 ms p95 over 600 lit frames at 1920 × 1080.
    - Costume review: PASS after inspection of the 2× desktop crop and the full-size desktop, wide, 4K and phone references. The reviewer noted that the curve across the wax is subtle. The forced-colours fallback was checked separately after incorporating the reviewer's note. Retook and inspected the same 33 files listed under task 3, including the 1280 × 800 foot at 2×.
    - _Requirements: R2.5, R5, R6. Design: D2, D5._

> **Batch 1 ends here.** The owner approved checkpoint 3 and the candle-foot follow-up before task 4 began.

### Batch 2 — Ghosts around the light pool

- [x] 4. Build and prove the 12-area layout
  - [x] 4.1 Use `src/ghosts/slots.ts`, `place.ts` and `visible.ts` for the viewport-dependent plan. Use the D1 anchors and full-size scales of 1.0 at the phone reference and 1.7 at the three landscape references. Derive the complete 12-slot plan from viewport geometry before assigning distraction history. Resolve sizes outside the reference set by the bounded, deterministic layout procedure in D1. Validate it across the existing viewport matrix and aspect-ratio sweep before shipping.
    - Result: The four reference plans and the 18 599-case responsive sweep fit all twelve swept areas. The solver runs when it first needs ghost placements or the viewport changes.
  - [x] 4.2 Add or extend P1 and P2 in `src/ghosts/` and the related UI layout checks. Cover identical inputs, append stability before and after overflow, mixed sizes, all-largest sizes, full swept bounds, and the guarded scene and ordinary control rectangles. Test all 66 area pairs at each reference. Pin the D1 minima for area separation, guard clearance and viewport inset. Sort the landscape x and y coordinates independently and assert that every consecutive triple spans more than 60 units for anchors and resting placements.
    - Result: All 66 comparisons at each reference preserve a minimum swept pair gap of 4 phone and 8 landscape room units. Guard clearance is 3 phone and 1 landscape. The minimum viewport inset is 1 at every reference. P1 and P2 check deterministic append, capped replacement and full drift clearance.
  - _Requirements: R1.1–R1.6, R2.4, R6.5. Design: D1, P1, P2._

- [x] 5. Draw the ghost plan and verify it in the browser
  - [x] 5.1 In `src/ghosts/layer.ts`, `ghosts.css` and the existing viewport wiring, apply the new coordinates and keep drift outside the scale transform. Keep displacement within 8 room units on each axis. At the cap, release the old slot before drawing its replacement. Keep the overflow mark legible and exact and retain the accessible count and ghost setting.
    - Result: Reused the original SVG nodes and added zero elements. Drift translates in room units before rotation and scale. A capped replacement releases the previous node synchronously.
  - [x] 5.2 Extend `e2e/ghosts.spec.ts`, `e2e/room-art-ghosts.spec.ts` and the control layout checks. Exercise twelve full-size ghosts and an overflowing history at every reference size, the mixed-size and minimum cases, focus and setup controls, resize and reduced motion. Verify the rendered extents and stable transforms through append. Open and close compact Settings and snuff with twelve ghosts present. The opaque panel covers the artwork through the layer order. Assert the same 12 ghost nodes and resting transforms throughout, with the same overflow and accessible counts.
    - Result: Chromium confirmed the same twelve nodes, both transform attributes, active drift, +9 mark and 21-distraction accessible count before, during and after both compact modals. The open panels cover the intersecting artwork after their existing 120 ms entrance. The resize check restores the same placements on return to desktop.
  - [x] 5.3 Check at least 3:1 for the outline against the brightest adjacent composite and the eyes against the composed ghost body. Inspect a twelve-at-full-size frame at each reference viewport for the two-dimensional composition and a minimum-size frame for face readability.
    - Result: Sampled the lit, burned-out and snuffed rooms over all swept areas at all four references. The computed floors were 4.73:1 for the outline, 4.34:1 for the eyes and 6.76:1 for the overflow mark. Inspected four full-size witnesses and the quarter-size silhouette and eyes at each reference.
  - _Requirements: R1, R2.4, R5, R6.5. Design: D1, P1, P2._

- [x] 6. Checkpoint — Ghost placement ready to ship
  - Apply the checkpoint procedure. Record the landscape triple spans and clearance minima from the implemented placement. Retake and inspect the affected ghost and room shots, including overflowing and reduced-motion views, and check compact modal occlusion. Record a costume-review PASS for the new placement, scale and motion.
  - In the twelve-at-full-size landscape screenshots, inspect the right-side pairs 2 and 6 (x = 524 and 540) and 4 and 10 (x = 634 and 650). If either reads as a short column, separate its anchors horizontally within the existing clearances. Rerun P2, confirm the landscape triple-span rule, retake and inspect the affected captures, and report any anchor changes.
  - Geometry result: The first full-size landscape captures showed both pairs as short columns. The first revision widened both pairs, and costume review found a regular diagonal down the right and another at lower left. The final x coordinates are 545 for slot 2 (was 524), 502 for slot 6 (was 540), 650 for slot 4 (was 634) and 575 for slot 10 (was 650). The pair gaps are 43 and 75 room units. Slot 11 moved up from y = 733 to 700 to break the left diagonal. Slot 12 moved up from y = 818 to 781 to clear the table edge, and slot 9 moved down from y = 800 to 820 to preserve the triple span. Minimum anchor triple spans are 73 in x and 70 in y. The resting minima across the full-size and overflow captures are 73.22 and 72.23. The final landscape swept minima are 8 between areas, 1 to guards and 1 to viewport edges, all in room units.
  - Verification and budget result: `npm run verify` passed, with 1 562 unit tests and 587 browser tests passed, 9 skipped. The build measured 124 623 raw JS+CSS bytes (94 357 JS, 30 266 CSS), 1 901 above checkpoint 3.1 and 5 377 below the ceiling. Maximum content remained 395 of 415 elements (189 scene, 78 ghosts, 128 Place). The standard 600-frame run at 1920 × 1080 on Intel UHD Graphics with Direct3D 11 measured median 16.700 ms and p95 16.700 ms. A second hardware run with all twelve full-size ghosts drifting also measured 16.700 and 16.700 ms. Software measured 16.700 and 33.400 ms for information.
  - Retaken and inspected: `ghosts-0-desktop.png`, `ghosts-0-phone.png`, `ghosts-1-desktop.png`, `ghosts-1-phone.png`, `ghosts-g-desktop.png`, `ghosts-g-phone.png`, `ghosts-g-plus-9-desktop.png`, `ghosts-g-plus-9-desktop-reduced.png` and `ghosts-g-plus-9-phone.png`. The full-size witnesses, minimum-size crops and compact modal images were also captured for review.
  - Costume review: PASS on the final witness and gallery sheets. The reviewer confirmed that both diagonals had broken up and the compact panels were opaque. The reviewer noted a ghost close to the Door and two near-level pairs, with no changes required. The closest landscape swept area stays 12 room units beyond the padded Door guard. The browser fixtures for the candle and controls gallery contain zero ghosts.
  - _Requirements: R1, R5, R6. Design: D1, D5._

> **Batch 2 ends here.** The owner approved checkpoint 6 before task 7 began.

### Batch 3 — Dawn through the window

- [x] 7. Render and verify the directional dawn
  - [x] 7.1 In `src/scene/room.ts`, `scene.css`, `light.ts` and `setting.ts`, use the D3 light field in place of the wash. Align it to the window in both compositions and carry it onto the table. Keep the existing dawn timing and band fills, the pool's progress mapping and the separate night contribution. Keep the still version immediate.
    - Result: A warm field from the panes crosses the stonework and table, with its soft edges tapering into the surrounding room. Live completion still eases in over three seconds and shows immediately under reduced motion.
  - [x] 7.2 Extend the scene light properties, contrast checks and the browser dawn fixtures. Compare light on the wall and table with adjacent areas, and stone faces with their joints. Check the time text and changed graphics against their worst rendered neighbours, including ghosts, Door and controls. Keep the published stops or update the stops and tests together as specified in R3.4. Compare the completed room against all night states in motion and reduced motion, and check forced colours.
    - Result: The lighting model and rendered neighbours pass the focused checks. The warm tint and panes remain within the published luminance range. Dawn differs from idle, the three running candle heights, paused and snuffed at phone and wide in both motion modes. Forced colours preserve the time and controls.
  - _Requirements: R3, R5, R6.5. Design: D3._

- [x] 8. Checkpoint — Directional dawn ready to ship
  - Apply the checkpoint procedure. Retake and inspect the affected burned-out, dawn-control and comparison shots. Record the wall and table readings, night-state comparison, time-band contrast and costume review. Save this checkpoint's JS+CSS total and element counts as the baseline for the graveyard cost.
  - Rendered measurements at 360 × 640, 1280 × 800 and 1920 × 1080, respectively. Mid-wall patch against adjacent wall measured 2.23:1, 2.24:1 and 2.24:1. Beside-sill patch against wall at the same height measured 2.03:1, 1.99:1 and 1.99:1. Lit tabletop against adjacent tabletop measured 1.63:1, 1.86:1 and 1.87:1. Time and status had a 7.53:1 minimum against all sampled backing pixels at all reference sizes. Stonework joints remained visible within the shaft.
  - Retaken and inspected in `docs/screenshots/` — `candle-burned-out-desktop.png`, `candle-burned-out-desktop-reduced.png`, `candle-burned-out-phone.png` and `controls-invalid-length-dawn-desktop.png`. The supplementary `candle-burned-out-wide.png`, `controls-invalid-length-dawn-wide.png`, `controls-invalid-length-dawn-phone.png` and `candle-burned-out-4k.png` were captured with the browser checks. The 62-file gallery inventory is unchanged. Phone and wide comparison captures covered idle, lit start, lit half, last minute, paused, snuffed and burned-out. Reviewer evidence includes 3× crops of the lit table at phone, desktop and wide.
  - Costume review passed after moving the strongest light toward the sill, warming the shaft, and strengthening the table landing. The pane gradient remains subtle at thumbnail size. The 3× window inspection and browser frame/glass check confirmed the sill gradient and the existing contrast floor.
  - `npm run verify` passed with 1 562 unit tests and 600 browser tests passed, 9 skipped. The frozen prototype periphery matches its pinned readings and the live night periphery. The unchanged time-band shadow keeps its soft edge against the darker dawn periphery.
  - Initial checkpoint build measured 125 132 raw JS+CSS bytes (94 765 JS, 30 367 CSS), 509 above checkpoint 6. Maximum content was 408 of 415 elements (202 scene, 78 ghosts, 128 Place). Dawn added 18 SVG elements and removed 5, for 13 net. At 1920 × 1080 over 600 lit frames, Intel UHD Graphics on Direct3D 11 measured 16.700 ms median and 16.700 ms p95. Software measured 16.700 and 33.400 ms for information.
  - _Requirements: R3, R5, R6. Design: D3, D5._

- [x] 8.1 Anchor the dawn shaft in the window glass
  - The owner requested a narrow origin inside the glass, a beam widening toward the table, and a rightward slope on landscape. Preserve the dawn timing, band fills and still version. Stay within two additional elements.
  - The updated geometry uses the same two gradient fields. The landscape centreline runs from (165, 75) inside the glass to around (301, 874) at the dish. The portrait centreline stays at x = 300. The wall above the window keeps the idle-night ambient level.
  - Chromium compared overlapping 3 × 3 wall patches against the same areas at idle night. The largest luminance difference was 1.25% on phone and 0% on all three landscape references, within the 2% tolerance. Phone, desktop and wide patch-to-wall ratios were 2.22:1 at each size. The table measured 2.18:1, 2.03:1 and 2.05:1 at those sizes. The brightest sampled wood was beside the dish. The time-text minimum remained 7.53:1.
  - Retaken and inspected in `docs/screenshots/` — `candle-burned-out-desktop.png`, `candle-burned-out-desktop-reduced.png`, `candle-burned-out-phone.png` and `controls-invalid-length-dawn-desktop.png`.
  - The origin-specific costume review returned PASS after inspecting all four frames. It confirmed the dark wall over the window, rightward landscape shaft and bright tabletop near the dish. `npm run verify` passed with 1 562 unit tests and 600 browser tests passed, 9 skipped.
  - The Batch 4 baseline is now 125 033 raw JS+CSS bytes (94 764 JS, 30 269 CSS), with 408 of 415 maximum-content elements and zero elements added. The 600-frame 1920 × 1080 hardware run measured 16.700 ms median and 16.800 ms p95 on Intel UHD Graphics with Direct3D 11.

> **Batch 3 ends here.** Wait for the owner's go-ahead before task 9.

### Batch 4 — Graveyard, cards and shelf

- [x] 9. Draw varied, grounded stones within the existing hit targets
  - [x] 9.1 In `src/graveyard/geometry.ts`, `plan.ts` and `place.ts`, use the D4 staggered rows and deterministic face geometry. Keep the 100 × 74 hit bounds and index order. Test the back heights of 54–70, front heights of 60–74, offsets up to ±8 horizontally and ±5 vertically subject to containment, and crown lean up to 4. Cover each of the round, pointed and flat-with-rounded-shoulders crowns. Keep the shared face, shadow and soil geometry aligned to the actual foot.
  - [x] 9.2 In `view-dom.ts` and `graveyard.css`, render the faces and lit edges with the existing buttons, CSS boxes and Place paths. Check face and focus-ring clearance, upright date and intent inside the shortest and most leaned faces, and the edge on its brightest ground. Verify the lighthouse's existing silhouette, sky-layer order and visibility in the wide reference view.
  - _Requirements: R4.1, R4.4–R4.6, R5. Design: D4._

- [x] 10. Finish the plaque and shelf and verify graveyard interactions
  - [x] 10.1 Style the existing stone details card as the D4 plaque and enlarge desktop shelf wax to 40 × 42 with a clear wick. Keep placement, mobile shelf geometry, text, names, focus behaviour and all overflow lines. In the existing graveyard contrast tests, verify at least 3:1 against the adjacent stone ground and shelf, and preserve existing card and text contrast.
  - [x] 10.2 Extend the existing graveyard layout, interaction and accessibility suites. Check the staggered perspective in small and full histories, 44.4 CSS px stone hit heights in phone portrait, card target clearance, roving focus, hover, tap, mixed input and Escape. Check the overflow counts and unchanged wording through both input paths.
  - _Requirements: R4.2–R4.5, R5. Design: D4._

- [x] 11. Checkpoint — Graveyard ready to ship and visual-polish complete
  - Apply the checkpoint procedure. Record the raw JS+CSS and maximum-content element counts before and after D4 and each delta. Check the zero-extra-elements design allocation for stone variety and the combined implementation budgets.
  - Retake all 62 screenshots and look at each, including the small and full graveyard, keyboard and touch cards, and the wide lighthouse view. Confirm the inventory, record the costume-review PASS for the finished visible changes, and capture the final documentation and usage-log updates.
  - Batch 4 added a shaded hillside, rooted stones with chipped crowns, varied mineral faces and selective fractures, stone plaques, and larger contoured desktop candle stubs. The stones retain the approved 100 × 74-unit targets and existing interaction order. The lighthouse, card content and overflow wording are preserved.
  - The production build measured 128 523 raw JS+CSS bytes (96 072 JS and 32 451 CSS), up 3 490 from the 125 033-byte D3 baseline and 1 477 below the ceiling. Maximum content measured 408 of 415 elements (202 scene, 78 ghosts, 128 Place), a net change of zero.
  - The browser sampled a 5.14:1 minimum stone-edge contrast on the desktop fixture and 5.20:1 minimum text contrast across the graveyard backing checks. Retook and inspected all 62 canonical screenshots in `e2e/screenshot-list.ts` (23 candle, 20 controls, 9 ghost and 10 graveyard). No names changed and no files were added.
  - `npm run verify` passed with 1 560 unit tests and 603 browser tests passed, 9 skipped. The 600-frame GPU run at 1920 × 1080 on Intel UHD Graphics with Direct3D 11 measured a 16.700 ms median and 16.800 ms p95.
  - Earlier costume reviews identified rigid rows, uniform cracks and rectangular stubs. The revised graveyard and all four batches together passed a review outside Kiro against the checked-in costume rubric. At that checkpoint the final Kiro verdict was unavailable because the account reached its overage limit.
  - The inscription follow-up gives desktop text more room inside each stone and allows two lines above the foot where they fit. Short task labels and both “Unnamed watch” labels fit in the full-history fixture at 1280 × 800 and 1920 × 1080. The long lighthouse inspection intent still uses an ellipsis on the stone. Untiled weathering now matches across the faces, including 5 Nov. The silhouette, 100 × 74 hit targets, cards and overflow wording are preserved.
  - The Kiro CLI costume review returned **PASS** for the graveyard and **PASS** for the whole costume across all four batches on visual evidence. The contrast evidence comes from `src/graveyard/contrast.test.ts`, `e2e/room-art-ghosts.spec.ts`, `e2e/room-art-place.spec.ts` and `src/ui/style.test.ts`. The time band's backing bounds give 15.83:1 at its darkest and 7.53:1 at its brightest, including the last lit minute on the night band. At 360 px the idle joints measured 1.226:1 and 1.257:1 against the 1.10:1 floor in `e2e/room-art-wall.spec.ts`.
  - The final build measured 129 051 raw JS+CSS bytes (96 125 JS and 32 926 CSS), up 528 from the 128 523-byte Batch 4 build and 949 below the ceiling. Maximum content was 408 of 415 elements, with zero added. The 600-frame GPU run at 1920 × 1080 measured a 16.700 ms median and 16.800 ms p95 on Intel UHD Graphics with Direct3D 11.
  - Full verification passed with 1 560 unit tests and 603 browser tests passed, 9 skipped. The browser suite ran with eight workers after the default concurrency timed out in a controls test. Retook and inspected ten graveyard files, with 62 files still in the gallery. `graveyard-card-keyboard-desktop.png`, `graveyard-card-keyboard-phone.png`, `graveyard-card-touch-desktop.png`, `graveyard-card-touch-phone.png`, `graveyard-large-desktop-reduced.png`, `graveyard-large-desktop.png`, `graveyard-large-phone.png`, `graveyard-large-wide.png`, `graveyard-small-desktop.png`, `graveyard-small-phone.png`.
  - _Requirements: R4, R5, R6. Design: D4, D5._

## Coverage check

| Requirement or property | Tasks |
|---|---|
| R1.1–R1.7, P1 and P2 | 4–6 |
| R2.1–R2.5 | 1–3.1, with final ghost clearance in 4–6 |
| R3.1–R3.4 | 7–8 |
| R4.1–R4.6 | 9–11 |
| R5.1–R5.3 | Each implementation batch and checkpoint |
| R6.1–R6.8 | 1.1–1.2 and checkpoints 3, 6, 8 and 11 |
## Task Dependency Graph

`1 → 2 → 3` (framing, with follow-up 3.1 inside task 3) → `4 → 5 → 6` (ghosts) → `7 → 8 → 8.1` (dawn) → `9 → 10 → 11` (graveyard). Each task depends on the one before it, so every wave holds one task.

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3"] },
    { "id": 3, "tasks": ["4"] },
    { "id": 4, "tasks": ["5"] },
    { "id": 5, "tasks": ["6"] },
    { "id": 6, "tasks": ["7"] },
    { "id": 7, "tasks": ["8"] },
    { "id": 8, "tasks": ["8.1"] },
    { "id": 9, "tasks": ["9"] },
    { "id": 10, "tasks": ["10"] },
    { "id": 11, "tasks": ["11"] }
  ]
}
```
