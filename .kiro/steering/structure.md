# Candlewatch - Structure

The project is scaffolded. `src/engine/`, `src/storage/`, `src/distraction/`, `src/scene/` and `src/ui/` are implemented (the `session-engine`, `distraction-tracking`, `candle-scene` and `controls-and-access` specs); `src/audio/` is empty (`.gitkeep`) until its spec runs. Vitest and fast-check tests are colocated next to the source as `*.test.ts` and `*.prop.test.ts`; Playwright tests stay in `e2e/`. Root config files: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `playwright.live.config.ts` (the smoke test against a deployed site), `render.yaml` (the host's Blueprint), `eslint.config.js` (flat), `index.html`. Playwright runs against `vite preview` on port 4173. TypeScript is pinned to 6.0.x because typescript-eslint does not yet support 7.

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
    screenshots/       current screenshots: 21 `candle-*` (every state) and 20 `controls-*` (screens, focus, dialogs); taken with CANDLEWATCH_SHOTS=1
  src/
    engine/            pure session engine: types, step/settle, selectors, serialization (no DOM);
                       distraction.ts (openHide/closeHide) and ghosts.ts (ghost selectors) hold the distraction logic;
                       test-kit.ts holds shared test arbitraries and the reference interpreter (test-only, never imported by source);
                       index.ts is the public surface
    storage/           localStorage adapter (the only code that touches it); imports the engine's index;
                       storage.ts (session and history), settings.ts (the Settings type, parseSettings/serializeSettings and the
                       settings store under the key `candlewatch:settings`: sound, ghosts, default length)
    distraction/       Page Visibility wiring: visibility.ts turns visibilitychange into hide/show events
                       (document, clock and send are injected); fake-document.ts is test-only
    scene/             inline SVG room: candle, wax, flame, light, dawn (ghosts, graveyard and shelf come with later specs);
                       types.ts, constants.ts (room units, flame table, drips, window, ember), flicker.ts (seeded value noise),
                       model.ts (state -> SceneModel, pure), room.ts (static SVG markup), scene.css (palette and custom-property rules),
                       render.ts (writes custom properties and data attributes), index.ts is the public surface;
                       scene-kit.ts holds the scene test arbitraries and trace helpers (test-only, never imported by source)
    hosting/           test-only: blueprint.ts reads and understands render.yaml; render-blueprint.test.ts and static-only.test.ts
                       keep it and the shipped source honest. No shipped file imports it
    ui/                the interface layer: a pure core and a thin DOM layer.
                       Pure (no DOM, `Date` or `Math.random`; a purity test enforces it): format.ts (time text), length.ts (length and intent
                       parsing), light.ts (the light request), keys.ts (key map), ui-state.ts (UI state machine), view.ts (state -> view model
                       and status line), announcer.ts (live-region texts), layout.ts (rectangles for the controls and the keep-clear rule);
                       index.ts is the public surface (`createInterface`). test-kit.ts is test-only.
                       dom/: build.ts (elements, built once), apply.ts (writes a view model), events.ts (DOM events to UI actions, Tab
                       containment), focus.ts (focus moves), live.ts (the live region); no branching on phase or time.
                       ui.css (tokens, controls, dialogs, focus ring, forced colours, reduced motion; style.test.ts reads it)
                       fonts/: the two self-hosted latin woff2 families and their licences (SIL OFL 1.1):
                         Cormorant Garamond 700 (display: time text, dialog headings): cormorant-garamond-latin-700.woff2, OFL-cormorant-garamond.txt
                         Alegreya Sans 400 and 700 (text): alegreya-sans-latin-400.woff2, alegreya-sans-latin-700.woff2, OFL-alegreya-sans.txt
    audio/             Web Audio cues
    strings.ts         all flavour text and UI copy in one file
    main.ts            wiring: the one dispatch, the clock, storage, the scene and the interface
    wiring.ts          visibility wiring helpers for main.ts (injected document, clock and dispatch)
  e2e/                 Playwright tests: scene.spec.ts (states, reduced motion, viewports, zone, ember, window, halo),
                       screenshots.spec.ts (takes the 21 `candle-*` PNGs in docs/screenshots/), scene-fixtures.ts (stored sessions and pixel helpers),
                       controls.spec.ts (whole sessions by keyboard and touch), controls-layout.spec.ts (geometry, keep-clear rule),
                       controls-a11y.spec.ts (roles, names, live region, focus, reduced motion), controls-polish.spec.ts (fonts, figures, palette,
                       hover and selected look, costume-review findings), settings.spec.ts, controls-screenshots.spec.ts (takes the 20 `controls-*`
                       PNGs), controls-fixtures.ts (openApp, settle, placement helpers), font-fixtures.ts (font loading and figure measuring),
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
- `src/ui/` imports the engine's `index.ts`, `src/strings.ts` and the `Settings` type from `src/storage/settings.ts`, and its own files; the engine never imports it. `ui/test-kit.ts` is test-only and never imported by source files.
- `src/scene/` imports only the engine's `index.ts`, `src/strings.ts` (the five accessible names) and its own files; the engine never imports it. `scene-kit.ts` is test-only and never imported by source files.
- The scene shows state only: no element is decoration (a wall grain was tried and removed for that reason).
- `src/hosting/` is test-only: `blueprint.ts` is imported by tests and by `e2e/` specs, never by shipped code.
- All user-visible text lives in `src/strings.ts`.
- Never add `.kiro/` to `.gitignore`.
