# Candlewatch - Tech

## Stack

- TypeScript (strict), Vite, no UI framework.
- Vitest for unit tests, fast-check for property-based tests, Playwright for end-to-end tests with a faked clock.
- ESLint for linting.
- Node 22+.
- Static site, no backend, no API keys, no AI calls at run time. Free hosting, always on until Jan 29, 2027.
- Written from scratch. No code is shared with any other project.
- Pin exact dependency versions (no `^` or `~`).

## Non-negotiable rules

1. **Elapsed time comes from timestamps, never from counting ticks.** Use `Date.now()` values captured at start, pause and resume. A throttled background tab, a sleeping laptop or a slow frame rate must not make the timer drift. Ticks only redraw.
2. **The session engine is pure and DOM-free:** `(state, event, now) -> state`. It takes `now` as an argument and never reads the clock, `window`, `document` or storage itself. Events: light, pause, resume, snuff, tick, hide, show, reload.
3. Rendering reads state; it never owns time.
4. The engine only reaches states in the model: `idle` -> `lit` <-> `paused` -> `burned-out` or `snuffed`. Total paused time over 10 minutes snuffs the session.
5. Distractions never change the time left.
6. Sound is generated with Web Audio in code. No sound files. Off until the first user gesture.
7. Fonts: one open-licensed display serif and one open-licensed text face, self-hosted.

## Scene

Inline SVG driven by CSS custom properties. Flame: layered radial gradients with a seeded flicker. Light pool: a radial mask whose radius follows the wax. Ghosts: translucent shapes with a slow drift. See `scene.md` for the look and accessibility rules.

## Scripts

`npm run dev`, `npm test`, `npm run build`, `npm run e2e`, `npm run verify` (type-check, lint, unit, build and e2e in one command).

## Property-based tests to keep true

- Time left never increases while `lit`.
- Pausing and resuming any number of times never changes the total burn time.
- Elapsed time is the same whatever the tick rate.
- No event sequence reaches a state outside the model.
- Wax height stays in [0, 1] and never grows during a session.
- History JSON round-trip is identity.
- Distractions never change the time left.

## Conventions

- Test the engine with an injected `now`; never fake time inside engine code.
- E2E tests use Playwright's clock control to run whole sessions in seconds.
- No `any`; prefer discriminated unions for states and events.
