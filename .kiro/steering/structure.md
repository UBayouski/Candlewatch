# Candlewatch - Structure

The project is scaffolded. `src/engine/`, `src/storage/`, `src/distraction/` and `src/scene/` are implemented (the `session-engine`, `distraction-tracking` and `candle-scene` specs); the other source folders are empty (`.gitkeep`) until their specs run. Vitest and fast-check tests are colocated next to the source as `*.test.ts` and `*.prop.test.ts`; Playwright tests stay in `e2e/`. Root config files: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `playwright.live.config.ts` (the smoke test against a deployed site), `render.yaml` (the host's Blueprint), `eslint.config.js` (flat), `index.html`. Playwright runs against `vite preview` on port 4173. TypeScript is pinned to 6.0.x because typescript-eslint does not yet support 7.

```
candlewatch/
  .kiro/
    steering/          product.md, tech.md, structure.md, scene.md
    specs/             one folder per spec (see below)
    hooks/             agent hooks
    settings/          mcp.json
  render.yaml          the hosting Blueprint: service, build, publish path and the one copy of the security and cache headers
  playwright.live.config.ts   config for `npm run smoke` (e2e/live.spec.ts against BASE_URL)
  docs/
    BRIEF.md           product brief (input, do not edit unasked)
    screenshots/       current screenshots of every state
  src/
    engine/            pure session engine: types, step/settle, selectors, serialization (no DOM);
                       distraction.ts (openHide/closeHide) and ghosts.ts (ghost selectors) hold the distraction logic;
                       test-kit.ts holds shared test arbitraries and the reference interpreter (test-only, never imported by source);
                       index.ts is the public surface
    storage/           localStorage adapter (the only code that touches it); imports the engine's index
    distraction/       Page Visibility wiring: visibility.ts turns visibilitychange into hide/show events
                       (document, clock and send are injected); fake-document.ts is test-only
    scene/             inline SVG room: candle, wax, flame, light, dawn (ghosts, graveyard and shelf come with later specs);
                       types.ts, constants.ts (room units, flame table, drips, window, ember), flicker.ts (seeded value noise),
                       model.ts (state -> SceneModel, pure), room.ts (static SVG markup), scene.css (palette and custom-property rules),
                       render.ts (writes custom properties and data attributes), index.ts is the public surface;
                       scene-kit.ts holds the scene test arbitraries and trace helpers (test-only, never imported by source)
    hosting/           test-only: blueprint.ts reads and understands render.yaml; render-blueprint.test.ts and static-only.test.ts
                       keep it and the shipped source honest. No shipped file imports it
    ui/                controls, dialogs, settings, keyboard handling, views
    audio/             Web Audio cues
    strings.ts         all flavour text and UI copy in one file
    main.ts            wiring
  e2e/                 Playwright tests: scene.spec.ts (states, reduced motion, viewports, zone, ember, window, halo),
                       screenshots.spec.ts (takes the 21 PNGs in docs/screenshots/), scene-fixtures.ts (stored sessions and pixel helpers),
                       fixtures-imports.spec.ts, smoke.spec.ts,
                       headers-local.spec.ts (the real build under the Blueprint's headers),
                       live.spec.ts (the smoke test: runs under `npm run e2e` against vite preview, and under `npm run smoke` against BASE_URL)
  KIRO_USAGE.md        running log of Kiro usage
```

## Naming

- Files and folders: kebab-case. Types and classes: PascalCase. Functions and variables: camelCase. Constants: UPPER_SNAKE_CASE.
- Tests are colocated with the source: `*.test.ts` for Vitest, `*.prop.test.ts` for property-based (fast-check). Playwright tests are `*.spec.ts` in `e2e/`.
- Spec names (kebab-case, in order): `session-engine`, `distraction-tracking`, `candle-scene`, `ghosts-and-graveyard`, `controls-and-access`, `sound-and-title`, `hosting`.

## Boundaries

- `src/engine/` imports nothing from the DOM, `scene/`, `ui/`, `audio/`, `storage/` or `distraction/`.
- `src/distraction/` and `src/storage/` import from `src/engine/` (its index), never the other way. Test-only helpers (`test-kit.ts`, `fake-document.ts`) are never imported by source files.
- Only `main.ts` and `ui/` own the clock source and pass `now` into the engine.
- `src/scene/` imports only the engine's `index.ts`, `src/strings.ts` (the five accessible names) and its own files; the engine never imports it. `scene-kit.ts` is test-only and never imported by source files.
- The scene shows state only: no element is decoration (a wall grain was tried and removed for that reason).
- `src/hosting/` is test-only: `blueprint.ts` is imported by tests and by `e2e/` specs, never by shipped code.
- All user-visible text lives in `src/strings.ts`.
- Never add `.kiro/` to `.gitignore`.
