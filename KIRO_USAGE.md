# Kiro Usage Log

A running log of how Kiro was used to build Candlewatch, for the hackathon write-up.

## 2026-11-10 - Steering docs from the brief

- **Surface:** Kiro CLI (the session ran through `kiro-cli chat`; the brief's plan names the Kiro IDE for this step, so this differs from plan).
- **What was asked:** Read `docs/BRIEF.md` and generate `product.md`, `tech.md` and `structure.md` in `.kiro/steering/`, plus a conditional `scene.md` (fileMatch on `src/scene/**` and `**/*.css`), and start this log. No source code, and no edits to the brief, LICENSE or `.gitignore`.
- **What Kiro produced:** `.kiro/steering/product.md` (the costume-is-function rule, core model, non-goals from section 9), `tech.md` (timestamps not ticks, pure DOM-free engine, stack, scripts, property tests), `structure.md` (planned folders, naming, boundaries), `scene.md` (look, reduced motion, AA contrast, naming rules, "Screenshots stay current"), and this file.
- **What was changed by hand:** Nothing yet.
- **Notable:** `structure.md` is a planned layout, since the brief gives no folder tree; the folder names are Kiro's proposal and should be reviewed. `.kiro/` is tracked, not ignored.

## 2026-11-10 - Scaffold the project

- **Surface:** Kiro CLI (steering files were loaded automatically as workspace rules).
- **What was asked:** Scaffold section 8 of the brief: Vite, strict TypeScript, no UI framework, Vitest, fast-check, Playwright, ESLint flat config, Node 22+, exact pinned versions, scripts `dev`, `build`, `test`, `e2e`, `check`, `verify`, one placeholder unit test and one Playwright smoke test, folders per `structure.md`. Then install and run `npm run verify`.
- **What Kiro produced:** `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js`, `index.html`, `src/main.ts`, `src/strings.ts`, `tests/placeholder.test.ts`, `e2e/smoke.spec.ts`, and the empty `src/*` folders. `npm run verify` passed (type-check and lint, 1 unit test, build, 1 e2e test).
- **What was changed by hand:** Nothing.
- **Notable:** Kiro looked up current versions with `npm view`. TypeScript 7.0.2 is latest, but typescript-eslint 8.72.2 only supports TypeScript below 6.1, so TypeScript is pinned to 6.0.3. `.gitignore` already had every required line, so it was left alone. `structure.md` was updated to describe the scaffold. `npm install` reports 10 moderate audit findings; not investigated.
