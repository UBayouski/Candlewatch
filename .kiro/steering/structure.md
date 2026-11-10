# Candlewatch - Structure

No source exists yet. This is the planned layout; keep to it when scaffolding and adjust this file if the layout changes.

```
candlewatch/
  .kiro/
    steering/          product.md, tech.md, structure.md, scene.md
    specs/             one folder per spec (see below)
    hooks/             agent hooks
    settings/          mcp.json
  docs/
    BRIEF.md           product brief (input, do not edit unasked)
    screenshots/       current screenshots of every state
  src/
    engine/            pure session engine: types, transitions, time math (no DOM)
    storage/           history and current-session persistence (localStorage, JSON)
    distraction/       visibility event handling feeding the engine
    scene/             inline SVG room: candle, wax, flame, light, ghosts, graveyard, shelf, dawn
    ui/                controls, dialogs, settings, keyboard handling, views
    audio/             Web Audio cues
    strings.ts         all flavour text and UI copy in one file
    main.ts            wiring
  tests/               Vitest and fast-check tests (or colocated *.test.ts)
  e2e/                 Playwright tests
  KIRO_USAGE.md        running log of Kiro usage
```

## Naming

- Files and folders: kebab-case. Types and classes: PascalCase. Functions and variables: camelCase. Constants: UPPER_SNAKE_CASE.
- Tests: `*.test.ts` for Vitest, `*.prop.test.ts` for property-based, `*.spec.ts` in `e2e/` for Playwright.
- Spec names (kebab-case, in order): `session-engine`, `distraction-tracking`, `candle-scene`, `ghosts-and-graveyard`, `controls-and-access`, `sound-and-title`, `hosting`.

## Boundaries

- `src/engine/` imports nothing from the DOM, `scene/`, `ui/`, `audio/` or `storage/`.
- Only `main.ts` and `ui/` own the clock source and pass `now` into the engine.
- All user-visible text lives in `src/strings.ts`.
- Never add `.kiro/` to `.gitignore`.
