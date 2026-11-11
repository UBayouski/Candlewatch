# Tasks: hosting

Implements `design.md` against `requirements.md` in this folder. Work the tasks in order; each builds on the previous ones.

Conventions for every task:

- TypeScript strict, no `any`, exact dependency versions. The only new dependency allowed is `yaml` (task 4), pinned exactly (Decision P3, accepted).
- Tests are colocated or live in `e2e/` per `.kiro/steering/structure.md`. Nothing in this spec changes `src/engine/`, `src/scene/`, `src/distraction/`, `src/storage/` or `main.ts`.
- A task is done only when `npm run verify` passes (type-check and lint, unit tests, build, e2e). Tasks 9 to 14 also need a live site; their "done when" says so.
- **Agents never create, change or delete a Render resource and never hold a Render account or token (R11.1).** Steps marked **[owner]** are done by the repo owner in the Render dashboard.
- Never write "deployed" or "live" in the README, `KIRO_USAGE.md` or a pull request before the owner has confirmed the deploy and the smoke test has passed against it (R11.4).
- Do not weaken a check to make it pass. If the smoke test fails against Render, report the failing check and the exact diff, say whether the fault is the Blueprint, Render's behaviour or the test, and record it in `KIRO_USAGE.md`.

Build order note: the Blueprint comes before its tests (tasks 2 and 3 before 4), so each test is written against a real file. The smoke test (task 6) comes before the first deploy so that it is proven on localhost first.

## Tasks

- [x] 1. Confirm the `headers` block (design section 0)
  - Most Render fields are already verified by a working sibling Blueprint (design section 0, Decision P7): `type: web`, `runtime: static`, `branch`, `autoDeployTrigger: commit`, the `&&` build chain, `staticPublishPath`, `NODE_VERSION: "22"`, no `plan`, no `routes`. Do not re-check them.
  - Confirm only these, from Render's Blueprint reference and static-site header documentation (from a session that can reach them, or from the owner's browser), or with Render's Blueprint validator if the CLI is available:
    1. The `headers` block syntax: a list of entries with `path`, `name` and `value`, and how `*` matches in `path` (does `/*` cover `/`; does `/assets/*` cover `/assets/x.js`; is a path without `*` an exact match).
    2. How several header rules for the same path combine: when two matching rules set the same header name, which wins, or are both sent; and whether Render adds its own value for `Cache-Control` or `Strict-Transport-Security`.
  - Edit `design.md` section 0: replace the two "Task 1 confirms" rows with the confirmed facts and a source link, or with "still unverified" and the reason. If the matching rule differs from section 6.1, change 6.1. If the combine rule makes the Blueprint in section 2 wrong (for example `/*` and `/assets/*` would both send a header), change the YAML in section 2 and say so. If a fact contradicts a requirement, stop and report it instead of editing the requirement.
  - Files: `.kiro/specs/hosting/design.md` only.
  - Requirements: R5.1, R5.4, R6.4. Properties: none.
  - Done when both items are answered or honestly marked unverified, section 2 matches, and `npm run verify` still passes.

- [x] 2. The Blueprint: service, build and publish
  - Create `render.yaml` at the repo root from design section 2, **without** the `headers` list yet: one `type: web`, `runtime: static` service named `candlewatch`, `branch: main`, `autoDeployTrigger: commit`, previews off, the exact build command, `staticPublishPath: dist`, and the two environment variables (`NODE_VERSION` with the value `"22"`, and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` with `"1"`). Write no `plan` field.
  - Do not add `plan`, `routes`, `repo`, a disk, a database or any other key.
  - Files: `render.yaml`.
  - Requirements: R1.1, R1.2, R1.3, R1.6, R2.1, R2.2, R3.1, R3.2, R3.4, R4.1, R7.1. Properties: none.
  - Done when `npm run verify` passes and the file is checked against the sibling Blueprint's shape (same field names and the same `NODE_VERSION` form), and, if task 1 used a validator, against that validator too (say which).

- [x] 3. The Blueprint: security and cache headers
  - Add the `headers` list from design sections 2 and 5 to `render.yaml`: the security headers on `/*` (eight when this task was written, seven since Decision P10: Render sets `Strict-Transport-Security`), and `Cache-Control` on `/assets/*`, `/` and `/index.html`. `/*` must not set `Cache-Control` (R6.4). Quote the CSP value.
  - Apply any change task 1 found for how header rules are matched or merged.
  - Files: `render.yaml`.
  - Requirements: R5.1, R5.2, R5.5, R6.1, R6.2, R6.3, R6.4. Properties: none.
  - Done when `npm run verify` passes.

- [x] 4. Blueprint parser and the configuration test
  - Run `npm view yaml version`, then `npm install --save-exact --save-dev yaml@<that version>`, and commit the lock file change (Decision P3, accepted).
  - Create `src/hosting/blueprint.ts` (test-only, never imported by shipped code): `readBlueprint()` reads `render.yaml` from the repo root and parses it; `headersFor(blueprint, pathname)` returns every header whose `path` matches, using the matching rule verified in task 1.
  - Create `src/hosting/render-blueprint.test.ts` with the assertions in design 6.2: the service fields; `plan` absent; `NODE_VERSION` exactly `"22"`; no extra top-level keys; the exact build command and its absences (`verify`, `e2e`, `playwright`, `||`); exactly the two environment variables with no `sync: false` and no secret-looking name or value; the exact security header table; the cache rules; at most one `Cache-Control` rule per sample path; a CSP made only of `'self'` and `'none'` with no `unsafe-*` and no `*`; no `routes`.
  - Add example tests for `headersFor`: `/` matches `/*` and `/`; `/assets/index-abc.js` matches `/*` and `/assets/*`; `/index.html` matches `/*` and `/index.html`; `/other` matches only `/*`.
  - Mutation check: change the build command to `npm run verify`, remove one security header, add a second `Cache-Control` rule for `/assets/*`, add `unsafe-inline` to the CSP and add a `routes` entry. Each must fail the test. Revert each, and say so.
  - Files: `package.json`, `package-lock.json`, `src/hosting/blueprint.ts`, `src/hosting/render-blueprint.test.ts`.
  - Requirements: R8.1, R8.4, R8.5, R5.5. Properties: none.
  - Done when `npm run verify` passes and every mutation was caught.

- [x] 5. The "static only" source scan
  - Create `src/hosting/static-only.test.ts` from design 6.2: scan the non-test `.ts`, `.css` and `.html` files under `src/` (excluding `src/hosting/`) and `index.html` for `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `EventSource`, `importScripts`, and any `http://` or `https://` that is not `http://www.w3.org/2000/svg`. The scan does not strip comments.
  - Example tests prove the scanner: a string containing each forbidden word is caught; the SVG namespace alone is not.
  - Mutation check: add a `fetch("/x")` call to a scratch copy in the test's own fixture string (not to real source) and confirm the scan reports it. No shipped file is edited.
  - Files: `src/hosting/static-only.test.ts`.
  - Requirements: R1.4, R8.2. Properties: none.
  - Done when `npm run verify` passes. If the scan finds something real in shipped source, stop and report it; do not edit the source in this spec.

- [x] 6. The smoke test and its config
  - Create `playwright.live.config.ts` (design 7.1): `testDir: "e2e"`, `testMatch: "live.spec.ts"`, `retries: 0`, `use.baseURL = process.env.BASE_URL ?? "https://candlewatch.onrender.com"`, no `webServer`. Leave `playwright.config.ts` unchanged.
  - Add the script `"smoke": "playwright test --config playwright.live.config.ts"` to `package.json`.
  - Create `e2e/live.spec.ts` with groups A, B and C from design 7.2. Group A runs on any base URL. Groups B and C skip themselves when the base URL host is `localhost` or `127.0.0.1`, with a skip message that says why. Group B reads the expected headers with `readBlueprint()` and `headersFor()` from task 4 (the e2e file may import from `../src/hosting/blueprint`; the existing `e2e/fixtures-imports.spec.ts` proves Playwright resolves such imports). All requests are GET or HEAD.
  - Run `npm run smoke` with `BASE_URL=http://localhost:4173` against `npx vite preview --port 4173` (start it in the background and stop it afterwards) and confirm group A passes and groups B and C are skipped. Run `npm run e2e` and confirm `live.spec.ts` also runs there against the default preview server and passes.
  - Mutation check (local only): serve the preview through a tiny local proxy or test route that returns a changed `Cache-Control` and a duplicated header, with the test's host check overridden, and confirm B1 and B2 fail. If this cannot be done without changing the test, say so and rely on task 7's negative control.
  - Files: `playwright.live.config.ts`, `package.json`, `e2e/live.spec.ts`.
  - Requirements: R9.1 to R9.7. Properties: none.
  - Done when `npm run verify` passes.

- [x] 7. The local header test
  - Create `e2e/headers-local.spec.ts` from design 6.2: route every request through `page.route`, add `headersFor(readBlueprint(), pathname)` to each response, and fulfil it. Install a `securitypolicyviolation` recorder before load.
  - Case 1: a fresh page draws the idle scene (`data-flame="unlit"`, `--wax-height` 1), with no violation, no console error and no failed request, and the real hashed script and `/` carry the cache values from the Blueprint.
  - Case 2: seed a lit session with the existing helpers in `e2e/scene-fixtures.ts` (built with `serializeSession`, never hand-written JSON) and confirm `data-flame="steady"`. This exercises `style.setProperty` and animation frames under the policy.
  - Case 3 (negative control): rewrite `script-src` to `'none'` in the applied headers and confirm that at least one violation is recorded and the scene does not draw.
  - If case 1 or 2 finds a real violation, stop and report it with the directive and the blocked URI. Do not loosen the policy to make it pass; report which of the code or the policy should change (Decision P5).
  - Files: `e2e/headers-local.spec.ts`.
  - Requirements: R5.3, R5.5, R8.3, R8.4. Properties: none.
  - Done when `npm run verify` passes.

- [x] 8. Dry-run the exact Render build
  - In a clean copy of the repo (`git worktree` or a fresh clone in a temporary folder, never in the working tree), run with a Node 22 (the Blueprint says `"22"`, the major only; record the exact version that ran): `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci && npm run check && npm test && npm run build`.
  - Confirm: no browser download happened (no "Downloading" lines, nothing new under the Playwright browser cache); `dist/` holds `index.html` and `assets/` with hashed names and nothing else (list it); every `assets/` file name contains a hash (R6.5); the whole command exits 0. Record the time of each step and the number of unit tests (R3.6).
  - Then break each of `check`, `test` and `build` on purpose in the clean copy (one type error, one failing test, one missing import), confirm the command exits non-zero at that step and later steps do not run, and discard the copy.
  - Files: none (a report). Add the timings to `design.md` section 3 as one sentence.
  - Requirements: R3.1 to R3.6, R4.1, R4.3, R6.5. Properties: none.
  - Done when the report is written and `npm run verify` still passes in the main working tree.

- [x] 9. **[owner]** Create the service from the Blueprint
  - Merge the pull request with tasks 1 to 8 into `main` first, so Render reads the final `render.yaml`.
  - Follow design section 9: connect Render to `UBayouski/Candlewatch`; New, Blueprint; branch `main`; check the preview shows one free static site named `candlewatch` with auto-deploy on, previews off and the exact build command; apply; wait for the first deploy.
  - Report back to the agent: the service URL, whether it is `https://candlewatch.onrender.com`, the plan shown in the dashboard, the build time and result of the first deploy, whether the build log shows `npm ci` finishing and no browser download, whether Render accepted `pullRequestPreviewsEnabled` (the one field the sibling evidence does not cover), and any bandwidth or build-minute limit the dashboard shows.
  - If the URL differs, say so; the agent records it (R1.5) and uses the real URL in tasks 10 and 11.
  - Files: none.
  - Requirements: R1.5, R2.1, R2.2, R11.2. Properties: none.
  - Done when the owner has confirmed the first deploy succeeded and has given the URL.
  - Result (2026-11-10, reported by the owner): the Blueprint was applied; the service is a **free static site** at **https://candlewatch.onrender.com** (the expected URL, so R1.5 needs no change); the first deploy passed. Not reported: the first build's time, the `npm ci` and browser-download lines of its log, whether Render accepted `pullRequestPreviewsEnabled` (the service was created, so it did not reject the Blueprint), and any usage limit shown. The later deploy log (task 12) shows Render used Node.js 22.23.4 through `NODE_VERSION`.
- [x] 10. First smoke run against the live site
  - Run `BASE_URL=<owner's URL> npm run smoke` (or plain `npm run smoke` if the URL is the expected one). Report the full result, group by group.
  - On failure: report the failing check with the live header values next to the Blueprint's. Likely causes are in design section 10 (Render merged or duplicated a header, did not apply a path rule, or added its own `Strict-Transport-Security`). Fix the Blueprint with a small pull request, **[owner]** merges it and waits for the redeploy, and the smoke run is repeated until it passes. Do not edit the smoke test to match Render without saying why the live behaviour is acceptable.
  - If the actual URL differs from the expected one (R1.5), change the default in `playwright.live.config.ts` and the spec files in this pull request.
  - Record in `KIRO_USAGE.md`: the result, any header that Render changed, and the deploy build time (R3.6).
  - Result (2026-11-10): the first run against `https://candlewatch.onrender.com` passed 10 of 11; B1 failed only on `Strict-Transport-Security` (Render sets its own; design Decision P10). The Blueprint rule was removed, the Blueprint test now asserts its absence, and B4 was added. Re-run after the change: 12 of 12 passed. The redeploy of the Blueprint is the owner's step; Render keeps header rules that are no longer in the Blueprint, so the old HSTS rule may stay in the dashboard (harmless: Render's own value is the one sent).
  - Files: `render.yaml` and `playwright.live.config.ts` only if a fix is needed; `KIRO_USAGE.md`.
  - Requirements: R5.4, R9, R11.3, R11.4, R12.2. Properties: none.
  - Done when `npm run smoke` passes against the live URL with groups A, B and C all run (none skipped), and the result is in `KIRO_USAGE.md`.

- [x] 11. README "Live" section and Status
  - Only now (R10.1), add the "Live" section to `README.md` from design section 8, with the real URL, and update the Status section so that it says only what is deployed on this day. Remove "There is no live URL yet." Keep to plain, short sentences, no trademarks beyond the single provider mention (Decision P2), and the naming rule in `product.md` ("focus session").
  - Add `smoke` to the README's script list with one line on what it does, and mention `render.yaml` in "How it is built" if it fits in one sentence.
  - Files: `README.md`.
  - Requirements: R10.1 to R10.5. Properties: none.
  - Done when `npm run verify` passes and every claim in the README is true of the deployed site.
  - Result (2026-11-10): "Live" section added near the top of `README.md` with the real URL; Status rewritten to say what is deployed (the candle scene draws, always an unlit candle, no controls yet); `smoke` added to the script list; the host named once, in the Live section; `render.yaml` explained in "How it is built". The README also had other claims that were no longer true (no scene, no live URL, "specs not written", the reviewer "has not had real work"); they were corrected so that every claim matches the deployed site.
- [x] 12. **[owner]** Prove auto-deploy
  - Merge the task 11 pull request to `main`. Without touching the dashboard, check that Render starts a deploy for that commit and finishes it. The owner reports the deploy's commit and result.
  - Then the agent runs `npm run smoke` again and records the result.
  - Files: none.
  - Requirements: R2.1, R2.3, R9, R12.2. Properties: none.
  - Done when the dashboard shows a deploy of the README commit and the second smoke run passes.
  - Result (2026-11-10): after the HSTS change (Decision P10) was pushed to `main`, Render started a deploy by itself (the owner confirms nobody started it by hand) and it passed: the log shows the unit tests running (30 files, 508 tests, the count of the pushed commit, 11.28 s), `vite build` (`index-vVv36xvi.css` 4.75 kB, `index-Dmuuuxe1.js` 18.22 kB, built in 63 ms), "Using Node.js version 22.23.4 via environment variable NODE_VERSION", and "Your site is live". The owner also deleted the old HSTS header rule from the Render dashboard. `npm run smoke` against the live URL after the redeploy: 12 of 12 passed (A1 to A5, B1 to B4, C1 to C3). The log excerpt does not show the commit hash or the trigger; the trigger is the owner's report.
- [x] 13. Steering and structure
  - Update `.kiro/steering/structure.md` (the layout tree and the root files list) with `render.yaml`, `playwright.live.config.ts`, `src/hosting/` (test-only), and the three new `e2e` files.
  - Update `.kiro/steering/tech.md` (Scripts and Stack) with the `smoke` script, the build command used on Render, the rule that the Render build never runs `verify` or the end-to-end tests, and the pointer that the Blueprint is the one place for headers.
  - Keep both files plain and short. State what exists, not what is planned.
  - Files: `.kiro/steering/structure.md`, `.kiro/steering/tech.md`.
  - Requirements: R5.5, R13.1. Properties: none.
  - Done when `npm run verify` passes.
  - Result (2026-11-10): `structure.md` lists `render.yaml`, `playwright.live.config.ts`, `src/hosting/` (test-only), `e2e/headers-local.spec.ts` and `e2e/live.spec.ts`, and the boundary that `src/hosting/` is never imported by shipped code. `tech.md` names the host and URL, adds `npm run smoke`, and has a new Hosting section: the Blueprint is the one place for headers, the Render build never runs `verify` or the end-to-end tests, Render sets HSTS, the CSP allows only `'self'` and `'none'`, and agents never touch Render resources.
- [ ] 14. Dated checks and wrap-up
  - Write the three dated smoke checks (R12.2) into `KIRO_USAGE.md` as a short list: after the first deploy (done in task 10), before submission on Dec 3, 2026, and on or after Jan 29, 2027. Run the Dec 3 check when the date comes and record the result; the Jan 29 check is run then and recorded in the same way.
  - Tick the tasks, add the final log entry (surface, what was asked, what was produced, what was changed by hand, how the surface differed), and note anything Render did differently from the design.
  - Files: `KIRO_USAGE.md`, this file.
  - Requirements: R11.4, R12.2, R12.3. Properties: none.
  - Done when tasks 1 to 13 are ticked, the Dec 3 check is recorded, and the Jan 29 check is listed with its date. The Jan 29 line stays open until that date.
  - Status (2026-11-10): **open**, on purpose. The three dated checks are written in `KIRO_USAGE.md`: after the first deploy (done: 12 of 12 on 2026-11-10, again after the HSTS redeploy), before the submission on Dec 3, 2026 (not yet due), and on or after Jan 29, 2027 (not yet due). The task is ticked when the Dec 3 result is recorded; the Jan 29 line stays open until that date. Everything else in the wrap-up (the log entry, the notes on what Render did differently from the design) is done.
## Coverage

| Requirement | Tasks |
|---|---|
| R1 one free static site | 2, 4, 5, 6, 9 |
| R2 auto-deploy | 2, 9, 12 |
| R3 build command | 2, 4, 8 |
| R4 what is published | 2, 8, 10 |
| R5 security headers | 3, 4, 6, 7, 10 |
| R6 cache headers | 3, 4, 7, 8 |
| R7 routing | 2, 4, 6 |
| R8 tests in the repo | 4, 5, 7 |
| R9 smoke check | 6, 10, 12 |
| R10 README | 11 |
| R11 owner steps | 9, 10, 14 |
| R12 free until Jan 29, 2027 | 1, 10, 12, 14 |
| R13 order and scope | 1, 13 |

Property-based testing is not enabled for this spec (requirements R13.4). The mutation checks in tasks 4 to 6 play the part that the properties play in the other specs.

## Decisions

See `design.md` section 13 (P1 to P10). P10, found by task 10: Render sets `Strict-Transport-Security` itself.
