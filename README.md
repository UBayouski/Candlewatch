# Candlewatch

**Keep the candle lit.**

Candlewatch is a focus timer where a candle is the clock, ghosts are your distractions and abandoned sessions get a grave. You light a candle for a focus session. It burns down as time passes. If you leave the page, a ghost appears. If you give up, the session gets a gravestone. It is an entry for the Kiroween 2026 Costume Contest.

The rule: **the costume is the function.** Every spooky element shows one piece of state. Nothing is only decoration. Take the costume off and nothing is left to read.

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

Only the session engine is built so far. It has:

- A pure session engine (`src/engine/`).
- Serialization with validation (`src/engine/serialize.ts`, `src/engine/validate.ts`).
- A storage adapter (`src/storage/`).
- Unit tests and property-based tests for all of the above.

**The scene and the UI are not built yet.** There is no candle, no flame, no ghosts and no graveyard on screen. `npm run dev` serves only a placeholder page. Everything in the table above is planned, not done.

Also planned: distraction tracking, sound and the page-title countdown, and hosting. There is no live URL yet.

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
- `npm run check`: type-checks with `tsc --noEmit`, then lints with ESLint.
- `npm run verify`: runs check, test, build and e2e in order.

## How it is built

- **A pure engine.** The session logic is one function shape: `(state, event, now) -> state`. It does not touch the DOM, storage or the clock. The caller passes `now` in. A test checks that the engine source does not use `window`, `document`, `localStorage`, `Date.now`, `performance` or `Math.random`.
- **Time from timestamps, not ticks.** Time left is computed from the timestamps of start, pause and resume. A tick only asks for a redraw. A slow frame rate, a throttled tab or a sleeping laptop cannot make the timer drift.
- **Colocated tests.** Each test file sits next to its source file: `*.test.ts` for examples and `*.prop.test.ts` for properties. End-to-end tests are in `e2e/`.
- **Property-based testing with fast-check.** The engine has eleven properties. They cover things like time left never growing while lit, pausing never changing the total burn time, the same result at any tick rate, and the history surviving a save and load unchanged. Each runs 300 cases.
- **Strict TypeScript, no UI framework, exact dependency versions.**

## Built with Kiro

Kiro wrote most of this repo from the brief in `docs/BRIEF.md`.

- **Steering.** `.kiro/steering/` holds `product.md`, `tech.md` and `structure.md`. They are always loaded. `scene.md` loads only when work touches `src/scene/**` or CSS.
- **Specs.** `.kiro/specs/session-engine/` has requirements, design and tasks. All 24 tasks are ticked. The other planned specs are not written yet.
- **Hooks.** One runs `npm test` when a file under `src/` is saved. One runs `npm run check` when the agent stops. One plays a chime when the agent stops.
- **MCP.** `.kiro/settings/mcp.json` configures the Playwright MCP server. It is meant for capturing screenshots once there is a scene.
- **Custom agent.** `costume-reviewer` is a read-only agent. It checks scene changes against the table above. There is no scene yet, so it has not had real work to review.

For the full log of what was asked, what Kiro produced and what was changed by hand, see [KIRO_USAGE.md](KIRO_USAGE.md).

## Disclosure

Candlewatch was written from scratch during the hackathon. No code is shared with any other project.

## License

MIT. See [LICENSE](LICENSE).
