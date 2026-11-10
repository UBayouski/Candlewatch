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

## 2026-11-10 - session-engine design

- **Surface:** Kiro CLI.
- **What was asked:** Write `design.md` for the `session-engine` spec from the approved requirements: types, `step`/`settle`/selectors with the time formulas, versioned serialization and validation, the thin `src/storage/` adapter, file layout per `structure.md`, and how P1-P11 are generated with fast-check. No tasks yet.
- **What Kiro produced:** `.kiro/specs/session-engine/design.md`: a state union by phase with history on every variant, the formulas for burn time, completion and pause-limit instants, `settle` before every event except `tick`/`hide`/`show`, a two-key JSON format with schema version 1, crash-safe idempotent history append, a `KeyValueStore` adapter that never throws, the file layout, example-test list, shared arbitraries and a per-property generation and assertion table, and a traceability table back to R1-R12.
- **What was changed by hand:** Nothing yet; the file awaits review.
- **Notable:** Writing the design exposed three places where the approved requirements are loose: P5's "never grows when `now` goes backwards" cannot hold for a pure selector (design guarantees it only relative to the state's anchor), R8.2 and R5.4 disagree about whether `hide`/`show` settle (design follows R8.2), and clock-backwards safety after a resume needs one extra field, `litSince`. These are listed under "Points for review" in the file. Tasks have not been written.

## 2026-11-10 - session-engine design review and tasks

- **Surface:** Kiro CLI.
- **What was asked:** Apply the review of `design.md` (reword P5, exempt `hide`/`show` from settling in R5.4, add the non-finite `now` rule to R12, fix the storage text-loss bug, turn the review points into a Decisions section), then write `tasks.md` in build order with the property tests required.
- **What Kiro produced:** Edits to `requirements.md` (P5, R5.4, new R12.4), to `design.md` (readHistory/readSession status API, section 6.1 that copies unreadable raw text once to `candlewatch:history:unreadable` or `candlewatch:session:unreadable` before the first write, new `storage.test.ts` cases, "Decisions" section replacing "Points for review"), and a new `.kiro/specs/session-engine/tasks.md`: 24 small tasks, each naming files, requirements and properties, ending in `npm run verify`, with one required task per property P1-P11 and the purity test, plus coverage tables.
- **What was changed by hand:** The reviewer found the data-loss bug in Kiro's design (a failed parse followed by a history write would erase stored entries) and specified the fix; Kiro wrote it up. Nothing was edited by hand in the files.
- **Notable:** Kiro moved the history task ahead of the settle task, because settle appends history entries, which differs from the order in the request. Tasks were not executed and no code was written.

## 2026-11-10 - session-engine tasks 1 to 11

- **Surface:** Kiro CLI.
- **What was asked:** Add requirement R11.4 (back up unreadable stored text), then execute tasks 1 to 11 of the `session-engine` spec in order, tick each, follow the design exactly, and run `npm run verify` after task 11. Stop before task 12.
- **What Kiro produced:** R11.4 in `requirements.md` with the design (6.1) and task 9 mappings. In `src/engine/`: `constants.ts`, `types.ts`, `intent.ts`, `history.ts`, `time.ts`, `settle.ts`, `step.ts`, `selectors.ts`, `validate.ts`, `serialize.ts`, `index.ts`, `test-kit.ts`, with colocated example tests and three `*.prop.test.ts` files that so far hold one setup smoke property each. In `src/storage/`: `storage.ts` and `storage.test.ts` (fake key-value store, quota and throwing cases, the unreadable-text backup rules). `npm run verify` passed: 12 test files, 156 tests, build, 1 e2e test. Tasks 1 to 11 are ticked in `tasks.md`.
- **What was changed by hand:** Nothing.
- **Notable:** No deviation from `design.md` was needed. Two small additions were made inside the design's intent: an `isStateLike` runtime guard on `reload` events, and the shared `PROP_PARAMS` (`numRuns: 300`) lives in `test-kit.ts`. The only failures during the work were two mistakes in Kiro's own tests (a wrong expected time in the test-kit test and a lint error for a non-null assertion), both fixed straight away. The real properties P1 to P11 and the purity test (tasks 12 to 23) have not been started.

## 2026-11-10 - session-engine tasks 12 to 24 (properties P1-P11, purity test, wrap-up)

- **Surface:** Kiro CLI.
- **What was asked:** Execute tasks 12 to 24: the eleven properties exactly as in the design's test plan, replacing the three setup smoke properties; the purity test with comment stripping and whole-word matching; the wrap-up. Never weaken a property or lower `numRuns` below 300, and report any failure with its counterexample and seed.
- **What Kiro produced:** Real property tests in `step.prop.test.ts` (P1, P2, P3, P4, P7, P9, P10), `selectors.prop.test.ts` (P5, P11) and `serialize.prop.test.ts` (P6, P8), all at `numRuns: 300` through the shared `PROP_PARAMS`; `purity.test.ts` (strips `//` and block comments with a small scanner that leaves strings alone, matches `\bwindow\b`, `\bdocument\b`, `\blocalStorage\b`, `Date.now`, `\bperformance\b`, `Math.random`, rejects imports from `storage`, `ui`, `scene`, `audio`, and checks that no non-test file imports `test-kit`); `structure.md` updated. `npm run verify`: 13 test files, 184 tests, build and e2e pass; the 18 property tests take about 0.45 s together.
- **Property failures on the way (evidence for the write-up):**
  1. **P10, history identity** (seed 679856490; shrunk to: light 15 min, tick, tick at exactly 15 min, then a reload). The design said old history entries are "the same objects"; after a reload they are equal values but fresh objects, because the state is rebuilt from text. Bug in the test and the design wording, not the engine. The test now requires identity for every event except `reload`, where it requires deep equality.
  2. **P3, tick rate** (strict form, run at 20 000 runs to confirm; failed at run 2490, seed -507689219; shrunk to: light 5 min, hide at +5 min, one extra tick at that instant). `hide`/`show` never settle (the R5.4 exemption the reviewer approved), so the run with an extra tick is `burned-out` where the run without it is still `lit` until the next event. Not an engine bug: the design table's "deep-equal after every event" does not hold for `hide`/`show` under the approved exemption. The property keeps strict equality after every other event, and after `hide`/`show` compares the states once both are settled at that time. This is a narrowing of the design wording, recorded here on purpose; the design table should be amended.
  3. **P5, weak probe generation** (found by mutation testing, not by a failure): with probes drawn from `[-2 min, +4 h]` almost none fell before the anchor, so removing the clock-backwards clamp in `burnMs` was not caught by the property (only by example tests). Probes are now drawn half at or before the anchor; the mutant is caught (seed -1963027302). The engine was not changed.
- **Mutation check:** Five deliberate breaks of the engine were each caught by at least one property and example test, then reverted: ends dated to `now` (P3, P11), resume without the clamp (P4), burn without the `litSince` clamp (P5 after strengthening), pause limit off by one (P7), `hide` settling (P9). The engine files were restored byte for byte and the full suite was green afterwards.
- **What was changed by hand:** Nothing.
- **Notable:** No engine code was changed in these tasks. Both genuine property failures were wrong wording in the test plan, not engine bugs, and the third finding was a weak generator. `src/engine/.gitkeep` and `src/storage/.gitkeep` were removed now that the folders have files.
