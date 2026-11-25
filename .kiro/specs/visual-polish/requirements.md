# Requirements Document

## Introduction

Candlewatch is entered in the Costume Contest for "a haunting user interface that's polished and unforgettable". The costume already carries the timer's state. The visual polish makes the ghosts, candle, dawn and graveyard easier to read at a glance.

The current screenshots establish the baseline:

- `ghosts-g-plus-9-desktop` and `ghosts-g-plus-9-phone` show two narrow columns. `GHOST_SLOTS` centres them at x = 55 and x = 545 room units. Even with the offsets in `place.ts`, twelve ghosts read as a list.
- `candle-lit-half-wide` shows the candle and controls in a narrow central strip of a broad wall. In the wide and phone pictures the table and dish are easy to miss.
- `candle-burned-out-desktop` and `candle-burned-out-phone` show a lilac wash over the room. The wall's stonework recedes and the light has little direction. The current wash uses `--dawn-cool`, `--dawn-warm` and `--dawn-alpha: 0.85`.
- `graveyard-large-wide` shows two even rows of button-like stones. `graveyard-small-desktop` and the two phone pictures show the same silhouettes and the small shelf stubs.

**Build order.** Landscape framing, ghosts, dawn, then graveyard. The framing defines the space available for ghost placement. Each goal is a shippable stopping point with its own checks, screenshot review and costume review. Requirements approval comes before design. The design and task plan are later deliverables.

## Glossary

- **Full candle** — the wax body at `waxHeight = 1` at lit start. Its height is measured in CSS pixels from the rendered wax-body rectangle. The flame, wick, rim, holder and table are outside this measurement.
- **Resting extent** — the rendered footprint of a ghost's silhouette, outline, eyes and glow after placement, scale and tilt, before drift.
- **Drift extent** — the area the resting extent sweeps over the whole drift.
- **Overflow mark** — the existing `+n` text reporting the distractions whose ghosts are outside the draw cap.
- **Reference viewports** — phone portrait at 360 × 640 and landscape at 1280 × 800, 1920 × 1080 and 3840 × 2160, in CSS pixels. These are required checks within the existing supported viewport range.

## Requirements

### Requirement 1: Ghosts around the light pool

**User Story:** As a user, I want distractions to haunt the room around my candle, so that I can see how many times I left and how long I was away.

#### Acceptance Criteria

1. THE ghost field SHALL use both dimensions of the dark room around the pool. At the draw cap, ghosts SHALL appear to the left, right and above the candle at varied distances and heights. The composition SHALL show no visible rows or columns at any reference viewport, including when all ghosts have the same size.
2. THE resting position and visual variant SHALL be deterministic from the distraction's index for a given history and viewport. WHEN a distraction is appended, every ghost that remains drawn SHALL keep its resting position, variant, tilt and size at the same viewport, including at overflow.
3. AT every reference viewport, no resting extent SHALL overlap another resting extent, the candle, the flame, the holder, the time text, any ordinary visible control or the Door. An open modal may cover ghosts. Ghosts SHALL also keep clear of the window, the centre of the light pool, the time-text band and the overflow mark. Checks SHALL cover full-size ghosts and mixed sizes across the supported range of candle heights and ordinary visible control layouts.
4. AT the landscape reference viewports, THE largest ghost SHALL be visibly larger than today's, with a full-size target of about 1.7 times the current `GHOST_BOX` in each dimension, about 119 × 127.5 room units from 70 × 75. AT 360 × 640 phone portrait, THE full-size ghost MAY be smaller than the landscape target and SHALL be at least today's 70 × 75 room units. THE maximum MAY depend on viewport class and SHALL preserve the determinism and stability on append of R1.2. Size SHALL continue to scale with `ghostSize` of the distraction's time away. The smallest ghost SHALL still read as a ghost at every reference viewport.
5. THE room SHALL draw at most 12 ghosts at any time, including during replacement at the cap. It SHALL draw the newest 12 when the history exceeds the cap and retain a single legible `+n` with the exact hidden count. At or below the cap, the mark SHALL be absent. The ghosts setting and the existing accessible distraction count SHALL keep their behaviour.
6. WHILE motion is allowed, THE ghosts SHALL keep the slow, bounded drift of `ghosts-and-graveyard` R10.8, with at most the existing `DRIFT_UNITS` of travel from rest on each axis. Each drift extent SHALL stay in its own placement area, clear of the other ghosts' areas, the candle, the centre of the pool and the time-text band. The keep-clear areas in criterion 3 SHALL also hold during drift.
7. WHERE reduced motion is requested, THE ghosts SHALL appear and disappear instantly as still silhouettes with the same resting positions, sizes and count. THE outline SHALL keep at least 3:1 contrast against its adjacent composited background, and the eyes SHALL keep at least 3:1 against the composited ghost body, including at the lightest background the placement can encounter.

### Requirement 2: The candle as the landscape subject

**User Story:** As a user on a landscape screen, I want the candle, its dish and the lit table to hold my attention, so that the timer is the subject of the room.

#### Acceptance Criteria

1. THE full candle SHALL occupy at least 1.3 times its baseline fraction of viewport height at both landscape measurement sizes. The baseline uses the shipped 420-unit body in `src/scene/constants.ts` and `src/scene/room.ts`, projected by the existing 600 × 1000 fit in `src/scene/backdrop.ts`. Both viewports are height-limited, so the baseline height is `420 × viewport height / 1000`. THE browser check SHALL measure the rendered full candle at lit start in CSS pixels and compare its height to the viewport height.

   | Viewport | Current full candle | Required full candle |
   |---|---:|---:|
   | 1280 × 800 | 336 px (42.0%) | At least 436.8 px (54.6%) |
   | 1920 × 1080 | 453.6 px (42.0%) | At least 589.68 px (54.6%) |

2. ON landscape, THE candle, holder and lit table SHALL read as one subject at lit start and as the wax burns down. The table and holder defined by `TABLE` and `HOLDER` in `setting.ts` SHALL visibly read as a table and a dish supporting the candle under the light. They SHALL follow the Lit Setting rule.
3. AT all supported viewport sizes, THE window SHALL stay visible as the source of dawn. THE time text and controls SHALL stay fully visible and unobscured. The framing SHALL keep all state-bearing graphics within the viewport and preserve the room's keep-clear, edge coverage and no-scroll rules.
4. ON phone portrait, THE framing SHALL preserve the existing candle readability, window visibility, time and control legibility, touch targets and access to every state. THE ghost placement and clearances of Requirement 1 SHALL still hold after the landscape framing ships.
5. AT 1280 × 800, 1920 × 1080 and 3840 × 2160, THE wax SHALL end inside the dish, with the dish's front rim drawn over the foot of the wax. THE entire dish, including its shadow, and the table's front edge SHALL stay above the controls and time band, with at least 8 CSS px of table visible between the dish and the table's lower edge. THE visible full wax SHALL retain the 54.6% viewport-height floor. THE phone composition SHALL retain its existing foot and dish.

### Requirement 3: Dawn through the window

**User Story:** As a user who finishes a session, I want to see morning light enter the room, so that completion is immediately recognisable.

#### Acceptance Criteria

1. WHEN the candle burns out, THE existing dawn state SHALL show early morning light entering through the window. A warmer, brighter patch SHALL extend from the window onto the wall and table, with a visible falloff into adjacent areas. The stone courses and joints SHALL remain visible through the lit patch and in the surrounding room.
2. THE dawn SHALL be unmistakable beside every night state, including idle, lit at all wax heights, paused and snuffed. The distinction SHALL hold in the still version. The candle pool SHALL continue to show progress and dawn SHALL continue to show completion.
3. THE time text SHALL meet WCAG AA at dawn and throughout the existing lighting range, with at least 4.5:1 for ordinary text and 3:1 where the text qualifies as large. THE contrast checks SHALL cover the brightest dawn patch, the time-text backing and any affected state graphics and controls against their adjacent colours.
4. THE lit setting colours SHALL stay within the published darkest and brightest stops. IF dawn needs a wider range, THE published stops and their contrast tests SHALL be updated together, and every applicable contrast floor SHALL still pass.

### Requirement 4: Gravestones set into the earth

**User Story:** As a user visiting past sessions, I want the graveyard to look like a place I can visit, so that the stones and shelf carry the weight of those sessions.

#### Acceptance Criteria

1. THE stones SHALL read as weathered gravestones, with arched or rounded tops and feet visibly set into the earth. Height, width and slight lean SHALL vary deterministically. In a large history, rows SHALL be staggered, with rows farther back smaller and higher in the scene. A small history SHALL still show stones grounded in the same place.
2. THE stone's details card SHALL read as carved or weathered stone or as a plaque in the scene palette. It SHALL show the same text as today, remain legible, stay clear of its item and preserve its on-screen placement and focus behaviour.
3. THE shelf stubs SHALL be visibly larger at desktop size and read as candle stubs standing on shelves. Each stub SHALL still represent one completed session, and each shelf SHALL still represent one day.
4. THE graveyard SHALL preserve its keyboard order, roving focus, visible focus rings, hit targets and touch behaviour, including the existing keyboard, pointer and tap rules for details cards. The overflow lines "older stones out of sight" and "older days out of sight" SHALL keep their wording, counts and visibility rules.
5. THE stone edges and stub wax SHALL retain at least 3:1 contrast against adjacent surfaces, including the earth at the stone's foot and the shelf under the wax. THE card, item text and focus indicators SHALL continue to meet their existing contrast requirements.
6. THE lighthouse silhouette on the graveyard horizon SHALL stay as it is. It is the lighthouse in the keeper's story in `product.md` and SHALL remain part of the still setting, with no state of its own.

### Requirement 5: Costume, state and accessibility

**User Story:** As a user, I want the richer scene to carry the same information and actions, so that I can read and use it by sight, keyboard, touch or assistive technology.

#### Acceptance Criteria

1. THE costume SHALL remain the function. Every moving or changing element SHALL show exactly one piece of existing state. A still setting SHALL be visible only where candlelight or window light falls on it, within the existing rules for the Place. The setting SHALL make the light easier to read, contain no stock Halloween ornaments and resemble no state element. Every state SHALL still be readable with the setting removed.
2. THE polish SHALL introduce no new state, stored data, settings, strings or features. THE engine, timer, wax fraction, controls and history SHALL keep their existing behaviour. All steering rules SHALL apply, including the inline SVG and CSS rules, the naming rule to use "focus session", and the ban on trademarks, logos and real product names.
3. THE experience SHALL maintain keyboard and touch operation, focus visibility, accessible names, reduced motion and forced-colours support. State changes SHALL remain legible by size, colour and text with motion disabled. Every contrast floor in steering SHALL apply to the rendered neighbours of the changed element.

### Requirement 6: Budgets, tests and review

**User Story:** As a maintainer, I want each goal to be ready to ship on its own, so that the work can stop at any goal with a tested, reviewed build.

#### Acceptance Criteria

1. THE implementation plan SHALL order the goals as R2, R1, R3 and R4. Each goal SHALL reach a shippable stopping point under the preceding requirements and the checks below, without depending on a later goal.
2. THE built JavaScript plus CSS in `dist/` SHALL total at most 130 000 raw bytes, up from the 120 000-byte ceiling. THE work SHALL record the measured total, update `src/scene/budget.test.ts` and `.kiro/steering/tech.md` with the new ceiling, and update the existing built-file assertion in `e2e/room-art-build.spec.ts` to enforce the same limit.
3. THE combined count across the scene SVG, ghost layer and Place SHALL stay at or below 415 elements at maximum content. A higher limit requires a design decision that explains why it must rise and records the measured count and adopted ceiling. THE work SHALL record the measured count even when the cap holds. The existing filter restrictions SHALL hold.
4. THE GPU frame-time limits in `tech.md` SHALL hold at 1920 × 1080: median at most 17.5 ms and 95th percentile at most 25 ms over 600 real-clock lit frames with GPU rasterisation. THE work SHALL record the renderer and measured frame intervals.
5. `npm run verify` SHALL pass. THE fast-check properties SHALL cover placement determinism, stability on append and non-overlap across the reference viewports. THE browser checks SHALL confirm the rendered geometry and keep-clear areas at those viewports. Assertions tied to superseded art SHALL be updated to test the replacement geometry and lighting while retaining their coverage of unchanged behaviour.
6. THE `costume-reviewer` agent SHALL give a PASS verdict for every visible change in each goal before that goal counts as shippable. THE work SHALL record the verdict and address any blocking findings before shipping.
7. THE work SHALL retake and visually inspect every one of the 62 screenshots in `docs/screenshots/` on the final shippable build, including when the work stops after an earlier goal. During each completed goal, THE author SHALL retake and inspect the affected screenshots and record what was reviewed. THE work SHALL update `README.md` and steering where they describe the shipped look.
8. THE implementation record SHALL include an entry for this session in `KIRO_USAGE.md`, using the existing dated format and `Surface: Kiro CLI`.

## Property-Based Tests

Use the existing fast-check `PROP_PARAMS` in colocated property tests.

| Property | Statement | Requirements |
|---|---|---|
| P1 | For any generated distraction history and each reference viewport, the same inputs give the same resting placement, variant, tilt, size and overflow count. Appending a distraction preserves each retained ghost's placement, variant, tilt and size before and after crossing the cap. The overflow count equals the number of ghosts omitted. | R1.2, R1.5 |
| P2 | At each reference viewport, generated ghost histories, sizes and supported room and control layouts produce disjoint resting extents that stay clear of the protected elements. Drift extents stay inside their respective placement areas and preserve the same clearance. Include a full set of largest ghosts and overflow histories. | R1.3, R1.5, R1.6, R2.4 |

## Decisions to Record in the Design

- **D1. Ghost placement.** Before any placement code is written, record the maximum size per reference viewport and show a concrete layout of 12 full-size ghosts at each one. Give the placement areas, keep-clear areas and drift bounds that demonstrate R1.3 and R1.6 can hold together. If a viewport cannot hold 12 full-size ghosts, identify it and propose the smallest change that makes it hold. Record the distribution, sizing, viewport mapping and replacement behaviour at the cap. Identify the old column and cell assumptions in `room-art`, `ghosts-and-graveyard` and `controls-and-access` that the new geometry supersedes.
- **D2. Landscape framing.** Record the framing rule, rendered measurements against the two baselines, and how the window, scene layers, Door and controls stay aligned and clear.
- **D3. Dawn.** Record the window light's reach and falloff, the palette stops and any resulting contrast-test changes.
- **D4. Graveyard.** Record the stone variation, row depth, contact with the ground, card treatment and stub size, with the checks for keyboard order, focus, touch and contrast.
- **D5. Budgets and review.** Record built bytes, element counts, GPU timings, screenshot review and costume-review verdicts for the shippable stopping points.
