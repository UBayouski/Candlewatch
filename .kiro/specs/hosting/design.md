# Design: hosting

Implements `requirements.md` in this folder (R1-R13). Scope: a `render.yaml` Blueprint, tests that keep it honest, a smoke test that runs against a base URL, and a README "Live" section after the first deploy. No application code changes.

Status: **review answers applied** (section 13). Tasks are in `tasks.md`.

## 0. What is verified and what is not

I could not open Render's documentation while writing this (every fetch of `render.com/docs` returned 403). Most of the Render-specific facts are settled instead by **a working Blueprint in a sibling project by the same author**, reported by the repo owner: deployed on Render since 2026-11-06 and serving HTTP 200. That Blueprint uses `type: web`, `runtime: static`, `branch: main`, `autoDeployTrigger: commit`, a `buildCommand` written as an `&&` chain, `staticPublishPath: dist`, `envVars` with `NODE_VERSION: "22"`, no `plan` field and no `routes`. I have not seen the file myself; the evidence is the owner's report (Decision P7).

| Fact | Evidence | Status |
|---|---|---|
| A static site in a Blueprint is `type: web` with `runtime: static` | Sibling Blueprint, live since 2026-11-06 | **Verified** |
| `branch: main` and `autoDeployTrigger: commit` control auto-deploy | Sibling Blueprint | **Verified** |
| `buildCommand` can be an `&&` chain; `staticPublishPath: dist` publishes `dist/` | Sibling Blueprint | **Verified** |
| `envVars` with `NODE_VERSION: "22"` selects Node 22 (the major version only) | Sibling Blueprint | **Verified** |
| No `plan` field is needed; no `routes` are needed | Sibling Blueprint | **Verified** |
| Free static sites on Render do not sleep | Repo owner | **Verified** |
| `headers` entries have the shape `path`, `name`, `value`; how `*` matches in `path` | Example Blueprints seen in search results, not the sibling | **Task 1 confirms** |
| What happens when two header rules match one path; whether Render adds its own `Cache-Control` or `Strict-Transport-Security` | Unknown | **Task 1 confirms from the docs**; the live smoke test (section 7, B1 and B2) shows the real result |
| `pullRequestPreviewsEnabled: false` is accepted and turns previews off | Example Blueprints, not the sibling | Not covered. Low risk: Render rejects an unknown key when the Blueprint is applied, and the owner checks the preview in step 3 (section 9) |
| A failed build leaves the last deploy live | Render's documented behaviour, from memory | Not tested. Observed only if a build ever fails |
| `npm ci` installs dev dependencies in the Render build | The same `&&` chain pattern | Confirmed by the first deploy's build log (task 9) |
| Free-tier limits on bandwidth and build minutes | Unknown | Unverified. The owner reports any limit the dashboard shows (task 9) |

"Verified" here means seen working in a deployed Blueprint, not read in Render's documentation.

Facts about this repo (checked in the sandbox): Node v22.23.4 and npm 11.4.2; scripts and pinned versions in `package.json`; `dist/` is git-ignored; `vite.config.ts` has no `base`, no `build` options and no plugins; there is no `public/` directory; `index.html` has one module script; the scene writes styles with `style.setProperty` and has no `style` attribute or `<style>` element; no source file calls the network; the only `http://` literal in shipped source is the SVG namespace.

## 1. Overview

```
push to main (GitHub)
   │  Render sees the commit (autoDeployTrigger: commit)
   v
Render build (Node 22, no browsers)
   npm ci  &&  npm run check  &&  npm test  &&  npm run build
   │ any step fails -> deploy fails -> previous deploy keeps serving
   v
dist/  ──publish──>  https://candlewatch.onrender.com   (headers from render.yaml)
   │
   └── owner or agent:  npm run smoke   (Playwright, GET/HEAD only)
```

Before merge, on a developer machine or in a session, `npm run verify` adds what the Render build leaves out: the end-to-end tests, including the browser test that applies the Blueprint's headers (section 6).

## 2. The Blueprint (`render.yaml`)

This is the intended file. The code task writes it after task 1 has confirmed the `headers` block (path, name, value, and how rules for one path combine).

```yaml
services:
  - type: web
    name: candlewatch
    runtime: static
    branch: main
    autoDeployTrigger: commit
    pullRequestPreviewsEnabled: false
    buildCommand: npm ci && npm run check && npm test && npm run build
    staticPublishPath: dist
    envVars:
      - key: NODE_VERSION
        value: "22"
      - key: PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
        value: "1"
    headers:
      - path: /*
        name: Content-Security-Policy
        value: "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; media-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
      - path: /*
        name: X-Content-Type-Options
        value: nosniff
      - path: /*
        name: X-Frame-Options
        value: DENY
      - path: /*
        name: Referrer-Policy
        value: no-referrer
      - path: /*
        name: Permissions-Policy
        value: camera=(), microphone=(), geolocation=(), payment=(), usb=()
      - path: /*
        name: Cross-Origin-Opener-Policy
        value: same-origin
      - path: /*
        name: Cross-Origin-Resource-Policy
        value: same-origin
      - path: /*
        name: Strict-Transport-Security
        value: max-age=31536000
      - path: /assets/*
        name: Cache-Control
        value: public, max-age=31536000, immutable
      - path: /
        name: Cache-Control
        value: no-cache
      - path: /index.html
        name: Cache-Control
        value: no-cache
```

Choices:

- **No `plan` line.** A static site needs none, and the working sibling Blueprint has none (verified, section 0). The tests assert that the field is absent (R1.2).
- **No `repo` line.** A Blueprint is read from the repository that holds it. The owner picks the repository when creating the Blueprint (owner step).
- **No `routes`.** There is no client-side router, so no rewrite (R7). An unknown path gets Render's 404.
- **`NODE_VERSION: "22"`** names the major version only, as the sibling Blueprint does (verified). `package.json` requires `>=22`. The trade-off: Render picks the current 22.x, so the Node patch version can change between deploys; every package version is still fixed by `npm ci` and the lock file. The sandbox runs v22.23.4 for the local dry run (task 8).
- **`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`** is belt and braces. Installing `@playwright/test` is not expected to download browsers (they come from `npx playwright install`), but the variable costs nothing and makes the guarantee in R3.2 independent of that. Task 8 checks that a clean `npm ci` downloads nothing.
- **Header values are plain strings.** The Permissions-Policy value and the HSTS value contain no characters that need quoting in YAML; the CSP value is quoted because it contains `;` and `'`.

## 3. The build

`npm ci && npm run check && npm test && npm run build`

| Step | Why | Needs a browser? |
|---|---|---|
| `npm ci` | Installs exactly what `package-lock.json` says; fails if the lock file and `package.json` disagree. | No (see above) |
| `npm run check` | `tsc --noEmit` then `eslint .`. A type or lint error stops the deploy. | No |
| `npm test` | `vitest run`: the unit and property tests, the purity tests, the stylesheet and Blueprint tests. | No (Vitest runs in Node; `vitest.config.ts` sets `environment: "node"`) |
| `npm run build` | `vite build` writes `dist/`. | No |

It is not `npm run verify`, because `verify` ends with `npm run e2e`, which needs Chromium (R3.2). The end-to-end tests run before merge instead (section 1).

Properties of this command:

- `&&` stops at the first failure, and a non-zero exit fails the Render build, so the previous deploy stays live (R2.3, R3.5).
- It installs dev dependencies, because `check`, `test` and `build` all need them. The explicit build command runs `npm ci`, which installs dev dependencies unless `NODE_ENV=production` is set (it is not set here). The first deploy's build log confirms it (task 9).
- `npm test` runs on every deploy. If it ever becomes slow, task 8's recorded timing is the evidence for changing this; the change would need a requirement edit (R3.1 fixes the command).
- Build minutes on the free tier may be limited (unverified, section 0). The expected cost per deploy is install time plus a few seconds of tests and a one-second Vite build.

## 4. What is published

`dist/` as written by `vite build`: `index.html` and `assets/<name>-<hash>.js` and `.css`. With the current config there is no `public/`, no source map and no other file.

- `dist/` is git-ignored and built on Render. It is never committed (R4.2).
- Vite hashes every file it emits under `assets/` by default. R6.5 keeps that true for future fonts: they must be imported from code or CSS (so Vite hashes them and places them in `/assets/`), not dropped into `public/`, because a file in `public/` is copied unhashed to the root and would miss the long cache and its own rule. This is a note for the spec that adds fonts (`tech.md` rule 7).
- The smoke test asks for `/.env`, `/package.json` and `/render.yaml` and expects 404, which proves that only `dist/` is served (R4.3).

## 5. Headers

### 5.1 Security headers (every path)

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | see below | The app talks to no one, so it can say so. |
| `X-Content-Type-Options` | `nosniff` | Browsers must trust the declared type. |
| `X-Frame-Options` | `DENY` | No embedding. `frame-ancestors 'none'` says the same for current browsers; this covers older ones. |
| `Referrer-Policy` | `no-referrer` | Nothing is sent when a visitor follows a link. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | The app needs none of these. Web Audio output needs no permission, so audio is not restricted. |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isolates the page from other windows. |
| `Cross-Origin-Resource-Policy` | `same-origin` | Other sites cannot load the app's files as subresources. |
| `Strict-Transport-Security` | `max-age=31536000` | One year. No `includeSubDomains` and no `preload`: the host is a shared `onrender.com` subdomain, and the app does not own the parent domain. Render may set this itself (task 1 reads the docs; smoke checks B1 and B2 show the live result); R5.4 requires exactly one value either way. |

### 5.2 The Content Security Policy

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self';
connect-src 'self'; media-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none';
frame-ancestors 'none'
```

(One line in the file.) Why each part holds for this build:

| Directive | Reason it is enough |
|---|---|
| `script-src 'self'` | `index.html` has one `<script type="module" src>`, which Vite replaces with a hashed file under `/assets/`. No inline script, no `eval`, no `new Function`. |
| `style-src 'self'` | The stylesheet is a file under `/assets/`. The scene sets its look by `element.style.setProperty(...)` and data attributes, and changes made through the CSS object model are not blocked by this directive. The scene has no `style` attribute and no `<style>` element (checked: `grep` in `src/scene/room.ts` and `render.ts`). |
| `img-src 'self'` | There are no image files. SVG is inline markup, with gradients referenced as `url(#id)` inside the same document. |
| `font-src 'self'` | Fonts are not added yet. When they are, they are self-hosted (`tech.md` rule 7). |
| `connect-src 'self'` | The app makes no requests. |
| `media-src 'self'` | Sound is generated with Web Audio in code, no files. |
| `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, `frame-ancestors 'none'` | No plugins, no `<base>`, no forms, no embedding. |

What could break it, and what catches it: an inline `style="..."` in markup, a `<style>` element, `element.setAttribute("style", ...)`, a remote font or script, a `data:` URL for an image or font, or a new network call. The browser test in section 6.2 loads the real build under this exact policy and fails on any violation. The negative control in the same test proves that it can fail.

If a future spec truly needs one of these, the right fix is to change the code, or to change the policy in `render.yaml` in the same pull request, with the test following automatically. Adding `unsafe-inline` is the weaker choice and was not accepted (Decision P5).

### 5.3 Cache headers

| Path | `Cache-Control` | Why |
|---|---|---|
| `/assets/*` | `public, max-age=31536000, immutable` | Content-hashed names: a new build means new names, so a year is safe. |
| `/` | `no-cache` | The browser revalidates on every load (a cheap conditional request) and a new deploy shows on the next visit. |
| `/index.html` | `no-cache` | Same, for the explicit path. |
| anything else | Render's default | Nothing else exists today. |

`/*` sets no `Cache-Control`, so no two rules compete for the same header on the same path (R6.4). This matters because I could not confirm how Render combines two matching rules (task 1 reads the docs on it). The smoke test compares the live value with the Blueprint's, so a merge or a duplicate shows up as a failure.

`no-cache` does not mean "never store": it means "store, but ask before using". The brief says no cache for `index.html`; `no-store` would also satisfy it but forces a full download every time. `no-cache` was chosen (Decision P4).

## 6. Tests that keep the config honest

New files (all test-only or config; nothing is imported by shipped code):

```
render.yaml                              the Blueprint
src/hosting/blueprint.ts                 reads and parses render.yaml; header matching helper (test-only)
src/hosting/render-blueprint.test.ts     R1 to R7 assertions
src/hosting/static-only.test.ts          R1.4 source scan
e2e/headers-local.spec.ts                real build under the Blueprint's headers
e2e/live.spec.ts                         smoke test (section 7)
playwright.live.config.ts                config for the smoke test
package.json                             script "smoke"; devDependency "yaml"
```

`src/hosting/` is a new folder with test-only files. `blueprint.ts` is imported only by tests, like `src/engine/test-kit.ts`, and no shipped file imports it, so Vite does not bundle it. `structure.md` is updated by the code tasks (task 13).

### 6.1 Parsing

`blueprint.ts` exports `readBlueprint(): Blueprint` (reads `render.yaml` from the repo root with `node:fs`, parses it with the `yaml` package) and `headersFor(blueprint, pathname): Record<string, string>` (every header whose `path` matches the pathname).

Path matching follows what Render documents for header paths (task 1 confirms it): `*` matches any run of characters, and a path without `*` must match exactly. `/*` matches everything, `/assets/*` matches everything under `/assets/`, `/` and `/index.html` match only themselves.

The `yaml` package is a new dev dependency, pinned to an exact version (task 4 looks it up with `npm view`). It is used only by the config tests. Accepted (Decision P3).

### 6.2 What each test checks

**`render-blueprint.test.ts`** (Vitest, node), R8.1:

- One service; `type: web`, `runtime: static`, `name: candlewatch`, `branch: main`, `autoDeployTrigger: commit`, `staticPublishPath: dist`, `pullRequestPreviewsEnabled: false`.
- `plan` is absent. `NODE_VERSION` is exactly `"22"`. No `disk`, `databases`, `envVarGroups`, `previews` or other top-level key.
- `buildCommand` equals the exact string, and does not contain `verify`, `e2e`, `playwright` or `||`.
- `envVars` are exactly the two allowed names; neither uses `sync: false`; no variable name or value matches `/key|token|secret|password/i` (neither allowed name does).
- Headers: the exact table of section 5.1 for `/*`; `Cache-Control` rules for `/assets/*`, `/` and `/index.html` with the exact values; and for any sample path, at most one `Cache-Control` rule matches (R6.4).
- The CSP has no `unsafe-inline`, no `unsafe-eval`, no `*`, and every source is `'self'` or `'none'` (R5.2).
- No `routes` key.

**`static-only.test.ts`** (Vitest, node), R8.2: reads every `.ts`, `.css` and `.html` file under `src/` (excluding `*.test.ts`, `*.prop.test.ts` and `src/hosting/`) and `index.html`, and fails on `\bfetch\s*\(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `EventSource`, `importScripts`, or an `https?://` literal that is not `http://www.w3.org/2000/svg`. The scan does not strip comments, so a URL in a comment also fails; that is intended, because it forces an explicit decision.

**`headers-local.spec.ts`** (Playwright, runs against the existing `vite preview` web server), R8.3:

- `page.route("**/*", ...)` fetches each request, adds `headersFor(blueprint, pathname)` to the response, and fulfils it. The page is therefore served exactly as Render would serve it, as far as headers go.
- Before load, an init script installs a `securitypolicyviolation` listener that records into `window.__violations`. The test fails if the list is not empty, if any console message has type `error`, or if any request fails.
- The page must draw: `#scene` has `data-flame="unlit"` (fresh storage) and its computed `--wax-height` is `1`.
- A second case seeds a lit session through the existing scene fixtures (`e2e/scene-fixtures.ts`, built with `serializeSession`) and checks `data-flame="steady"`, which exercises `style.setProperty` and the animation frames under the policy.
- **Negative control:** the same flow with `script-src` rewritten to `script-src 'none'` must see at least one violation and no scene. This shows the test can fail. It runs in the same file.
- The header check also asserts that the response for `/assets/<file>.js` carries `Cache-Control: public, max-age=31536000, immutable` and that `/` carries `no-cache`, so the cache rules are exercised against the real hashed file names Vite produced.

Because `npm run e2e` already builds and previews the app (`playwright.config.ts`), this test needs no config change.

## 7. The smoke test

### 7.1 Files and command

- `e2e/live.spec.ts`: the checks.
- `playwright.live.config.ts`: `testDir: "e2e"`, `testMatch: "live.spec.ts"`, `use.baseURL = process.env.BASE_URL ?? "https://candlewatch.onrender.com"`, **no** `webServer`, and `retries: 0` so that nothing is retried silently (R9.6).
- `package.json` script: `"smoke": "playwright test --config playwright.live.config.ts"`.
- The existing `playwright.config.ts` is **not** changed. It matches `e2e/live.spec.ts` too (all `*.spec.ts` in `e2e/`), so `npm run e2e` runs the page checks against `vite preview` on localhost. That is useful: the smoke test is exercised on every `verify`. The header and live-only groups skip themselves on localhost (below).

Usage:

```
npm run smoke                                   # the expected live URL
BASE_URL=https://example.invalid npm run smoke  # any other deployment
BASE_URL=http://localhost:4173 npm run smoke    # a local preview
```

It needs Chromium, like the other end-to-end tests, so it runs on a developer machine or in a session. It is not part of the Render build.

### 7.2 Checks

Group A, **page** (any base URL, including localhost):

| # | Check |
|---|---|
| A1 | `GET /` answers 200 with `<html lang="en">` and the title `Candlewatch`. |
| A2 | `#scene` exists with `role="img"` and a non-empty `aria-label`; in a fresh browser context `data-flame="unlit"`. |
| A3 | The visually hidden heading "Candlewatch" is in the accessibility tree. |
| A4 | No console message of type `error`, no `pageerror`, no `securitypolicyviolation`, no failed request, no response with status 400 or above. |
| A5 | Every request URL has the page's origin. (This is the runtime proof of R1.4: no backend, no external call.) |

Group B, **headers** (skipped when the base URL host is `localhost` or `127.0.0.1`, where there is no Render in front):

| # | Check |
|---|---|
| B1 | For `/`, `/index.html`, the first `<script src>` and the first stylesheet `<link href>` found in the page, every header that `headersFor(blueprint, pathname)` returns is present with exactly that value. Header names compare case-insensitively. |
| B2 | No response carries two values for any header the Blueprint defines (a merge with Render's own value would show as `a, b`). |
| B3 | The hashed script's `Cache-Control` is the immutable value and `/` is `no-cache`. (B1 covers it; this names it for the error message.) |

Group C, **live-only**:

| # | Check |
|---|---|
| C1 | `GET /no-such-page` answers 404. |
| C2 | `GET /.env`, `/package.json` and `/render.yaml` each answer 404. |
| C3 | A request to `http://<host>/` does not stay on http: it answers a 301, 302, 307 or 308 whose `Location` starts with `https://`. (Skipped if the base URL is already http.) |

All requests are GET or HEAD through Playwright's `request` fixture or the page. The test writes nothing and needs no credentials (R9.7).

### 7.3 What the smoke test cannot show

- It does not show which commit is live. The app has no build id. After a deploy, the owner sees the commit in Render's dashboard; the smoke test only says the site that is up is healthy and configured. If a build id is wanted, it is a small later change (a hash in a meta tag) and would need its own requirement.
- It does not watch the site over time. It is a command run at set moments (R12.2).

## 8. README "Live" section

Written only after the first deploy and a passing smoke run (R10.1), in a separate pull request. Intended text (the URL is whatever Render gave):

```
## Live

Candlewatch is a static site: https://candlewatch.onrender.com

It has no accounts, no tracking and no server. It is rebuilt and redeployed from `main` on every push. To check the live site, run `npm run smoke`.
```

The same pull request edits the Status section so that it matches what is deployed on that day (today it says there is no live URL and that the scene is not built; the scene has since been built, so the sentence will need changing then, and only to what is true). Naming the provider is allowed there and nowhere in the app (Decision P2).

## 9. Owner steps (one-time)

Done by the repo owner in the Render dashboard (R11). Agents cannot and do not.

1. Sign in to Render and connect it to the GitHub repository `UBayouski/Candlewatch` (grant access to that one repo).
2. New, Blueprint. Choose the repository and the branch `main`. Render reads `render.yaml`.
3. Check the preview before applying: one service, a static site named `candlewatch`, free, auto-deploy on, previews off (this is the one field the sibling evidence does not cover; if Render rejects `pullRequestPreviewsEnabled`, report the message), the build command as written.
4. Apply. Wait for the first deploy to finish.
5. Copy the service URL. If it is not `https://candlewatch.onrender.com`, say so (R1.5).
6. Tell the agent the URL, the plan the dashboard shows, the first build's time, whether the build log shows `npm ci` finishing and no browser download, and any usage limit the dashboard shows. The agent runs the smoke test (task 10).

## 10. Failure handling

| Situation | What happens | What to do |
|---|---|---|
| `check`, `test` or `build` fails on Render | Deploy fails; the previous deploy keeps serving. | Fix on a branch, merge when green. Run `npm run verify` before merging. |
| A bad deploy goes live | The smoke test or a visit shows it. | Revert the commit on `main` (a new deploy follows), or use Render's rollback. |
| Smoke B1 or B2 fails | Render did not apply, or merged, a header. | See the diff in the test message. Adjust the rule, for example by splitting paths, and rerun. Do not edit the test to match Render without reading why. |
| Name `candlewatch` is taken | Render gives a different URL. | Record it (R1.5). Optionally rename the service in `render.yaml` to get a better URL; the name is the only thing that sets it. |
| Free plan limits reached or terms change | Site may stop or the service may be suspended. | Move `dist/` to another static host (R12.3). The build is `npm ci && npm run check && npm test && npm run build`, publish `dist/`, and the header table is plain data. |

## 11. Traceability

| Requirement | Where |
|---|---|
| R1 one free static site | 2, 6.2 (`render-blueprint`, `static-only`), 7.2 A5 |
| R2 auto-deploy | 2, 3, 10 |
| R3 build command | 2, 3, task 8 |
| R4 what is published | 4, 7.2 C2 |
| R5 security headers | 5.1, 5.2, 6.2, 7.2 B1 B2 |
| R6 cache headers | 4, 5.3, 6.2, 7.2 B3 |
| R7 routing | 2, 7.2 C1 C3 |
| R8 tests in the repo | 6 |
| R9 smoke check | 7 |
| R10 README | 8 |
| R11 owner steps | 9 |
| R12 free until Jan 29, 2027 | 0, 10, tasks 14 |
| R13 order and scope | 1, tasks |

## 12. Points for review

None open. All nine were answered; the answers are in section 13.

## 13. Decisions

- **P1. The name `candlewatch`:** accepted as recommended. Keep the name. The real URL is an output of the first deploy; if Render gives a different one, it replaces the expected one in the README, the smoke default and `KIRO_USAGE.md` (R1.5).
- **P2. Naming the provider:** accepted as recommended. The provider's name is allowed in `render.yaml`, in these spec files and once in the README "Live" section. It stays out of the app (code, copy, UI) (R10.4).
- **P3. The `yaml` dev dependency:** accepted as recommended. It is pinned to an exact version and used only by the config tests, so the header table lives in `render.yaml` alone (R5.5, R8.4; task 4).
- **P4. `no-cache` for `index.html`:** accepted as recommended. The browser keeps a copy but revalidates on every load; `no-store` is not used (R6.2).
- **P5. A strict policy with no `unsafe-inline`:** accepted as recommended. A future inline `style` attribute or `<style>` element needs a code change, or a policy change in the same pull request, and the browser test flags it at once (R5.2).
- **P6. Fonts and the cache:** accepted as recommended. A note for the spec that adds fonts: import them so Vite hashes them into `/assets/`; do not put them in `public/` (R6.5).
- **P7. What could not be verified:** settled in large part by evidence. A working Blueprint in a sibling project by the same author, on Render since 2026-11-06 and serving 200, uses `type: web`, `runtime: static`, `branch: main`, `autoDeployTrigger: commit`, an `&&` build chain, `staticPublishPath: dist`, `NODE_VERSION: "22"`, no `plan` and no `routes`. Those fields are marked verified (section 0) and dropped from task 1. Free static sites on Render do not sleep. **Changes that follow:** `NODE_VERSION` is `"22"` (the major only) instead of an exact patch version, the Blueprint has no `plan` field, and the tests assert both. **Still open, and not part of task 1:** `pullRequestPreviewsEnabled` (checked at owner step 3), that a failed build keeps the last deploy live (not tested), and free-tier bandwidth and build-minute limits (the owner reports what the dashboard shows). **Task 1 now only** confirms the `headers` block syntax (`path`, `name`, `value`, and how `*` matches in `path`) and how several header rules for the same path combine, including whether Render adds its own value for the same header, before `render.yaml` is written. The repo still cannot guarantee a provider's free tier (R12.3); the dated smoke runs remain the evidence.
- **P8. Header checks only off localhost:** accepted as recommended. Groups B and C of the smoke test skip themselves on localhost; `headers-local.spec.ts` exercises the Blueprint's headers locally (R9.4).
- **P9. No build id:** accepted as recommended. The smoke test cannot say which commit is live (section 7.3); the owner reads the commit in the Render dashboard.
