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
- **What Kiro produced:** `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js`, `index.html`, `src/main.ts`, `src/strings.ts`, `src/strings.test.ts`, `e2e/smoke.spec.ts`, and the empty `src/*` folders. `npm run verify` passed (type-check and lint, 1 unit test, build, 1 e2e test).
- **What was changed by hand:** Nothing.
- **Notable:** Two steering fixes were made first, before the scaffold: `scene.md` `fileMatchPattern` was changed to the list form (`["src/scene/**", "**/*.css"]`), and `structure.md` now states that tests are colocated. Kiro looked up current versions with `npm view`. TypeScript 7.0.2 is latest, but typescript-eslint 8.72.2 only supports TypeScript below 6.1, so TypeScript is pinned to 6.0.3. `.gitignore` already had every required line, so it was left alone. `structure.md` was updated to describe the scaffold. `npm install` reports 10 moderate audit findings; not investigated.

## 2026-11-10 - Hooks, Playwright MCP and the costume-reviewer agent

- **Surface:** Kiro CLI. Hook files, MCP config and the agent JSON are plain files in `.kiro/`, so the IDE can use them too; none of it was tested in the IDE.
- **What was asked:** Two agent hooks (run `npm test` when a file under `src/` is saved; run `npm run check` before finishing a task), the Playwright MCP server in `.kiro/settings/mcp.json`, and a read-only custom agent `costume-reviewer` that checks scene changes against brief section 4.
- **What Kiro produced:** `.kiro/hooks/test-on-save.json` (PostFileSave, path matcher for `src/`), `.kiro/hooks/check-before-finish.json` (Stop trigger), and `.kiro/agents/costume-reviewer.json` (only the `fs_read` tool, pre-approved; loads the brief and the product and scene steering as resources).
- **What was changed by hand:** `.kiro/settings/mcp.json` must be created by hand: the write was blocked by a permission rule on `.kiro/settings/`. The intended content is one `playwright` server running `npx @playwright/mcp@0.0.85 --headless --isolated`.
- **Notable:** The "before finishing" hook uses the Stop trigger, which cannot block, so a failing check is not enforced, only run. The MCP version is pinned to match the exact-version rule in `tech.md`; the Playwright docs suggest `@latest`. The agent format was taken from public Kiro docs and community examples and has not been loaded in a session yet. Earlier in the day a separate Stop hook was added to play a short rising chime when the agent finishes.

## 2026-11-10 - session-engine requirements and review decisions

- **Surface:** Kiro CLI.
- **What was asked:** Create the `session-engine` spec from brief sections 3 and 5 with property-based testing enabled, write `requirements.md` only and stop for review. Then apply review answers to four open questions and replace the questions with a Decisions section.
- **What Kiro produced:** `.kiro/specs/session-engine/requirements.md`: 12 EARS requirements (R1-R12) and eleven fast-check properties (P1-P11). First pass ended with four open questions. After review: `light` from a final state starts a new session (no `reset`); intents are cut at 80 Unicode code points with a surrogate-pair example test; the break has no new phase or event, only `breakEndsAt` plus a pure selector (R7 rewritten, P11 added); late discoveries are dated to the true instant. The same session also fixed the earlier steering files (`scene.md` pattern, colocated tests).
- **What was changed by hand:** The four decisions came from the user, including the break model, which replaced Kiro's recommendation (data on the state with the existing events starting and skipping it). Nothing was edited by hand in the file itself.
- **Notable:** Asking for open questions up front surfaced a gap in the brief: the break fits none of its five phases or eight events. The user's choice is simpler than the one Kiro proposed. Design and tasks have not been written.
