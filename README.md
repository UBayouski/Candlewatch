# Candlewatch

**Keep the candle lit.**

Candlewatch is a focus timer where a candle is the clock, ghosts are your distractions and abandoned sessions get a grave. You light a candle for a focus session. It burns down as time passes. If you leave the page, a ghost appears. If you give up, the session gets a gravestone. It is an entry for the Kiroween 2026 Costume Contest.

## Live

Candlewatch is a static site on Render's free tier: https://candlewatch.onrender.com

It has no accounts, no tracking and no server. It is rebuilt and redeployed from `main` on every push. To check the live site, run `npm run smoke`.

**What you will see today:** a dark room with an unlit candle, a length chooser (15, 25, 50 or a custom 5 to 90 minutes), an optional one-line intent, and a Light button. Light a focus session, pause and resume it, and let it go dark, with the keyboard (Enter, Space, Esc) or by touch, and open the settings panel. No ghosts, graveyard, shelf or sound yet. See Status below.

## The rule

**The costume is the function.** Every spooky element shows one piece of state. Nothing is only decoration. Take the costume off and nothing is left to read.

| Element | Shows | Behaviour |
|---|---|---|
| The candle | Time left | Wax height is exactly the fraction of the session left. A drip runs down at each quarter. |
| The flame | Session state | Steady while `lit`; small and blue while `paused`; gutters and sputters in the last minute; smoke when out. |
| The room's light | Progress | The pool of light shrinks with the wax. The room is darkest just before the end. |
| Ghosts | Distractions | One ghost per distraction this session, drifting at the room's edge. Size grows with time away. |
| The graveyard | Snuffed sessions | Each abandoned session leaves a gravestone carved with its intent and date. |
| The shelf | Finished sessions | Each burned-out session leaves a candle stub on a shelf, one shelf per day. |
| The dawn | Completion | When the candle burns out the room fills with early light and a short chime plays. |

## Status

Built and tested:

- A pure session engine (`src/engine/`), with serialization and validation, and a storage adapter (`src/storage/`).
- Distraction tracking: the engine counts each time the page goes hidden and comes back, and `src/distraction/` turns the Page Visibility API into events. The page now sends them to the engine, but nothing is drawn for them yet.
- The controls (`src/ui/`): choose a length, add an intent, Light, Pause and Resume, "Let it go dark" with a confirm that starts on "Keep burning", and a settings panel (sound and ghosts switches, the default length). The time left is shown as text in a lining-figure display serif, with a status line under it, and a live region speaks the state changes. Everything works from the keyboard alone, focus is always visible, and the colours meet WCAG AA contrast (checked by a test that reads the stylesheet). Two self-hosted open-licence fonts carry the text: Cormorant Garamond for the time and headings, Alegreya Sans for the rest (SIL OFL 1.1, files and licences in `src/ui/fonts/`). A pure layer decides everything (key map, state machine, view model, layout, announcements) and is property-tested; a thin DOM layer draws it.
- The candle scene (`src/scene/`): the room, the candle with wax height and a drip at each quarter, the flame in its five looks, the pool of light, the dawn and the break glow, with a still version for reduced motion. Screenshots of every state are in `docs/screenshots/`: 21 `candle-*` files (seven states at desktop, phone and desktop with reduced motion) and 20 `controls-*` files (first visit, invalid length, snuff dialog, settings On and Off, keyboard focus, a lit session with an intent), retaken with `CANDLEWATCH_SHOTS=1 npx playwright test e2e/screenshots.spec.ts e2e/controls-screenshots.spec.ts` (grayscale text antialiasing, so no colour fringes).
- Hosting: a Blueprint (`render.yaml`) with security and cache headers, tests that keep it honest, and a smoke test for the live site.
- Unit tests and property-based tests for the engine and the scene, and end-to-end tests with a faked clock.

**What a visitor sees today:** they can light a focus session, watch the candle burn down with the time left in text, pause and resume it, and let it go dark, by keyboard or touch. A session survives a reload. When it ends, the room fills with early light and "Light another" appears.

Not built yet: ghosts (the page counts distractions but draws none), the graveyard and the shelf, sound, and the page-title countdown. The table above describes the finished app: the candle, flame, light and dawn rows are live today; the ghosts, graveyard and shelf rows are not.

## Quick start

You need Node 22 or newer.

```
npm install
npm test
```

Scripts from `package.json`:

- `npm run dev`: starts the Vite dev server.
- `npm run build`: makes a production build with Vite.
- `npm test`: runs the unit and property tests once with Vitest.
- `npm run e2e`: runs the end-to-end tests with Playwright.
- `npm run smoke`: checks a deployed site. It runs `e2e/live.spec.ts` against `BASE_URL` (default: the live URL above), and sends only GET and HEAD requests.
- `npm run check`: type-checks with `tsc --noEmit`, then lints with ESLint.
- `npm run verify`: runs check, test, build and e2e in order.

## How it is built

- **A pure engine.** The session logic is one function shape: `(state, event, now) -> state`. It does not touch the DOM, storage or the clock. The caller passes `now` in. A test checks that the engine source does not use `window`, `document`, `localStorage`, `Date.now`, `performance` or `Math.random`.
- **Time from timestamps, not ticks.** Time left is computed from the timestamps of start, pause and resume. A tick only asks for a redraw. A slow frame rate, a throttled tab or a sleeping laptop cannot make the timer drift.
- **Colocated tests.** Each test file sits next to its source file: `*.test.ts` for examples and `*.prop.test.ts` for properties. End-to-end tests are in `e2e/`.
- **Property-based testing with fast-check.** The engine has eleven properties. They cover things like time left never growing while lit, pausing never changing the total burn time, the same result at any tick rate, and the history surviving a save and load unchanged. Each runs 300 cases.
- **Strict TypeScript, no UI framework, exact dependency versions.**
- **A static site.** The app makes no network calls. `render.yaml` describes the host: it builds with `npm ci`, `npm run check`, `npm test` and `npm run build`, publishes `dist/`, and holds the one copy of the security and cache headers, under a strict Content-Security-Policy. Tests read that file, and a browser test loads the real build under those headers.

## Built with Kiro

Kiro wrote most of this repo from the brief in `docs/BRIEF.md`.

- **Steering.** `.kiro/steering/` holds `product.md`, `tech.md` and `structure.md`. They are always loaded. `scene.md` loads only when work touches `src/scene/**` or CSS.
- **Specs.** `.kiro/specs/` has requirements, design and tasks for `session-engine`, `distraction-tracking`, `candle-scene`, `controls-and-access` and `hosting`. The first three are built, and so is `hosting` apart from two dated smoke checks that are still to be run. `controls-and-access` is built and reviewed: the pure modules, the DOM layer, the stylesheet, its end-to-end tests, mutation checks and the 41 screenshots. `ghosts-and-graveyard` and `sound-and-title` are specified (requirements, design and tasks) but not built; only the first task of `ghosts-and-graveyard` is done.
- **Hooks.** One runs `npm test` when a file under `src/` is saved. One runs `npm run check` when the agent stops. One plays a chime when the agent stops.
- **MCP.** `.kiro/settings/mcp.json` configures the Playwright MCP server. It is used to look at the scene in a real browser and to capture screenshots.
- **Custom agent.** `costume-reviewer` is a read-only agent. It checks scene and interface changes against the table above: every spooky element shows one piece of state, the reduced-motion version still shows it, and the time text keeps its contrast. It has reviewed the finished scene (once) and the finished controls (four passes, the last a PASS).

For the full log of what was asked, what Kiro produced and what was changed by hand, see [KIRO_USAGE.md](KIRO_USAGE.md).

## Disclosure

Candlewatch was written from scratch during the hackathon. No code is shared with any other project.

## License

MIT. See [LICENSE](LICENSE).
