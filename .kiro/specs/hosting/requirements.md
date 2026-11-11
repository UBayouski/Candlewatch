# Requirements: hosting

Source: `docs/BRIEF.md` section 8 (static site, no backend, no API keys, no AI calls at run time, free and always on until Jan 29, 2027) and section 11 item 7 (`hosting`: static build and free deploy). Constrained by `.kiro/steering/product.md`, `tech.md`, `structure.md` and `scene.md`, and by `package.json` (scripts `build`, `check`, `test`, `e2e`, `verify`; Node 22 or newer; exact dependency versions).

Status: **draft for review.** Requirements only. Design and tasks follow in this folder, in the same pull request.

## Introduction

Candlewatch is a static site: a Vite build in `dist/`, no backend, no API keys. This spec defines how it is published for free and kept up. The target is a free Render static site, described by a Blueprint file `render.yaml` at the repo root, that redeploys on every push to `main`.

Three things matter most:

- The deploy must be reproducible from the repo. The service is defined in `render.yaml`, not by clicking in a dashboard.
- A broken `main` must not go live. The Render build runs the type-check, the lint and the unit tests before it builds, and a failed build leaves the previous deploy serving.
- The Render build must not need Playwright browsers. So it runs `npm ci`, `npm run check`, `npm test` and `npm run build`, and never `npm run verify` (which includes the end-to-end tests).

This spec writes no application code. It adds the Blueprint, tests that keep the Blueprint honest, a smoke test that can run against any base URL, and a README "Live" section.

## Glossary

- **Blueprint**: the `render.yaml` file that defines the service.
- **Service**: the one Render static site named `candlewatch`.
- **Expected URL**: `https://candlewatch.onrender.com`. It is only expected: Render may add a suffix if the name is taken (R1.5).
- **Hashed asset**: a file Vite writes under `dist/assets/` with a content hash in its name.
- **Smoke test**: the Playwright spec `e2e/live.spec.ts`, which runs against a base URL (R9).
- **Owner step**: a step only the repo owner can do, such as connecting Render to GitHub. Agents do not create Render resources.
- **Live**: the Service has a successful deploy of the current `main` and the smoke test passes against its URL.

## Requirements

### R1. One free static site, defined as code

**User story:** As the maintainer, I want the whole hosting setup in the repo, so that I can recreate it and review it like code.

1. A file `render.yaml` at the repo root SHALL define exactly one service. It SHALL be a Render static site (`type: web` with `runtime: static`), named `candlewatch`.
2. The service SHALL use a free plan and no paid add-on, disk, database, worker, cron job or environment group. If a plan field is accepted for static sites, it SHALL say `free`; otherwise it SHALL be absent.
3. The service SHALL have no backend, no API keys and no secrets. It SHALL define no environment variable with `sync: false`, and no variable whose name or value looks like a key, token or password. The only variables allowed are those listed in R3.4.
4. Nothing in the app SHALL call a network service at run time: no `fetch`, no `XMLHttpRequest`, no `WebSocket`, no `sendBeacon`, no `EventSource`, no analytics and no external font, script or style. Every request the page makes SHALL go to its own origin (brief section 8; R9.3).
5. The expected URL is `https://candlewatch.onrender.com`. WHEN Render gives a different URL (for example because the name is taken), THE actual URL SHALL replace it everywhere it is written (README, smoke test default, this spec), and the difference SHALL be recorded.
6. No custom domain, no pull request previews, no rewrite to a client-side router, no service worker and no cookies SHALL be set up by this spec.

### R2. Auto-deploy from `main`

**User story:** As the maintainer, I want every merge to `main` to go live without a manual step.

1. The service SHALL deploy from the branch `main` of this repository, automatically on each commit (`autoDeployTrigger: commit`, or whatever Render's current field for this is).
2. Pull request previews SHALL be off.
3. WHEN the build fails, THE previously deployed version SHALL stay live. This is Render's behaviour for failed builds; the smoke test (R9) is how it is checked after the fact.
4. Rolling back SHALL be a revert commit on `main` (or Render's own rollback), never an edit of the live site.

### R3. The build command

**User story:** As the maintainer, I want the deploy build to catch type errors, lint errors and failing tests, without needing a browser.

1. The service's build command SHALL be exactly `npm ci && npm run check && npm test && npm run build`.
2. The build command SHALL NOT run `npm run verify`, `npm run e2e`, `playwright test` or `playwright install`, and SHALL NOT download browsers.
3. The build SHALL work from a clean checkout with only the files in the repo and the npm registry. `npm ci` SHALL be used (not `npm install`) so that the lock file decides every version.
4. The Blueprint SHALL set these environment variables and no others:
   - `NODE_VERSION`: an exact Node 22 version, because `package.json` says `engines.node >= 22`.
   - `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` set to `1`, so that no browser download can happen even if a future Playwright version asks for one on install.
5. WHEN any of `npm run check`, `npm test` or `npm run build` fails, THE deploy SHALL fail (R2.3). No step SHALL be followed by `|| true` or similar.
6. The build time and the number of tests it runs SHALL be recorded once after the first deploy, so a later slowdown can be noticed.

### R4. What is published

**User story:** As a visitor, I want to get the built app and nothing else.

1. The service SHALL publish the directory `dist/` (`staticPublishPath: dist`), which `npm run build` (Vite) writes.
2. `dist/` SHALL stay out of git (it is already in `.gitignore`). The deploy builds it; it is never committed.
3. The published site SHALL contain no source maps of private data, no `.env` file and no files from outside `dist/`. Since `dist/` holds only Vite output, this is checked by the smoke test requesting `/.env`, `/package.json` and `/render.yaml` and expecting 404 each (R9.5).

### R5. Security headers

**User story:** As a visitor, I want the site to be safe by default, even though it is only a timer.

1. For every path (`/*`) the Blueprint SHALL define these response headers:

   | Header | Value |
   |---|---|
   | `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; media-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` |
   | `X-Content-Type-Options` | `nosniff` |
   | `X-Frame-Options` | `DENY` |
   | `Referrer-Policy` | `no-referrer` |
   | `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
   | `Cross-Origin-Opener-Policy` | `same-origin` |
   | `Cross-Origin-Resource-Policy` | `same-origin` |
   | `Strict-Transport-Security` | `max-age=31536000` |

2. The Content Security Policy SHALL NOT contain `unsafe-inline`, `unsafe-eval`, a wildcard source, or any origin other than `'self'` and `'none'`. It follows from R1.4: the app talks to no one.
3. The site SHALL work under that policy. The app already satisfies it: it ships one module script, one stylesheet and an inline SVG with no `style` attributes, and it sets styles through script (`style.setProperty`), which the policy allows. A browser test SHALL load the real build with these exact headers applied and fail on any policy violation (R8.3).
4. IF Render adds a header of the same name itself (for example `Strict-Transport-Security`), THEN the live response SHALL still carry exactly one value for it, equal to the Blueprint's. The smoke test checks this (R9.4).
5. The headers SHALL be written once, in `render.yaml`. No second copy SHALL be kept, except the tests that read `render.yaml` itself.

### R6. Cache headers

**User story:** As a visitor, I want repeat visits to be fast, and I want new deploys to show up at once.

1. Hashed assets (`/assets/*`) SHALL have `Cache-Control: public, max-age=31536000, immutable`. They are safe to cache for a year because their names change when their content changes.
2. `index.html` (`/` and `/index.html`) SHALL have `Cache-Control: no-cache`, so that the browser asks again on every load and a new deploy is seen on the next visit. It SHALL NOT be cached without revalidation.
3. No other path SHALL be given a long cache. Files that are not hashed (anything outside `/assets/`) keep Render's default behaviour.
4. The Blueprint SHALL NOT define two rules that set `Cache-Control` for the same path. The `/*` rule SHALL NOT set `Cache-Control`, so that the specific rules above never compete with it.
5. Every file that Vite writes into `dist/assets/` SHALL have a hash in its name. Fonts and other assets SHALL be imported by the code (so Vite hashes and places them in `/assets/`), not copied from `public/`.

### R7. Routing

**User story:** As a visitor, I want a wrong address to say so.

1. The Blueprint SHALL define no rewrite and no redirect rules. Candlewatch is a single page with no client-side router, so there is no path to fall back from.
2. WHEN a path does not exist, THE site SHALL answer with a 404 status, not with `index.html`.
3. Plain `http://` requests SHALL be redirected to `https://` by Render. The smoke test checks it (R9.5).

### R8. Keep the config honest (unit and browser tests in the repo)

**User story:** As the maintainer, I want the Blueprint to be checked by `npm run verify`, so it cannot drift from this spec.

1. A Vitest test SHALL read `render.yaml` and assert R1 to R7: one service; type, runtime, name, branch, publish path and auto-deploy; no paid plan; no preview; the exact build command and its absences (R3.2); exactly the two allowed environment variables; the exact header table (R5.1); the cache rules (R6.1, R6.2, R6.4); and no routes.
2. A Vitest test SHALL scan the shipped source (`src/` without test files, and `index.html`) for run-time network use (R1.4): no `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `EventSource`, `importScripts`, and no `http://` or `https://` literal other than the SVG namespace `http://www.w3.org/2000/svg`.
3. A Playwright test SHALL load the real build (`vite preview`, as `npm run e2e` already does) with the headers from `render.yaml` applied to every response, and SHALL fail on any `securitypolicyviolation` event, any console error, and any failed request. It SHALL also check that the candle scene still draws a state (R5.3). It SHALL have a negative control: with one source removed from `script-src`, the same test fails.
4. These tests SHALL read the headers from `render.yaml` and SHALL NOT hold their own copy (R5.5).
5. The tests SHALL be part of `npm test` and `npm run e2e`, so `npm run verify` runs them. The Render build runs only the unit tests (R3.1); the browser test runs before merge, in `npm run verify`.

### R9. Post-deploy smoke check

**User story:** As the maintainer, I want one command that says whether the live site is healthy.

1. A Playwright spec `e2e/live.spec.ts` SHALL run against a base URL taken from the environment variable `BASE_URL`. A second config, `playwright.live.config.ts`, SHALL run only that spec, with no web server, and the default base URL SHALL be the expected URL.
2. An npm script `smoke` SHALL run it (`npm run smoke`), so `BASE_URL=<url> npm run smoke` checks any deployment, and plain `npm run smoke` checks the live site. The existing `e2e` and `verify` scripts SHALL keep working unchanged and SHALL NOT need a network.
3. The page checks SHALL hold on any base URL, including `vite preview` on localhost: the page loads with status 200 and the title "Candlewatch"; the scene root `#scene` has `role="img"` and an `aria-label`; a fresh browser shows an unlit candle (`data-flame="unlit"`); there is no console error, no failed request and no policy violation; and every request the page makes goes to the page's own origin.
4. The header checks SHALL run only when the base URL is not localhost. They SHALL read `render.yaml` and check, for `/`, `/index.html` and one real hashed script and one stylesheet taken from the page, that every header the Blueprint defines for that path is present in the live response with exactly the Blueprint's value, and that no header appears twice with different values.
5. The live-only checks SHALL also confirm: an unknown path answers 404; `/.env`, `/package.json` and `/render.yaml` answer 404; and `http://` redirects to `https://`.
6. A failing smoke check SHALL fail the command with a non-zero exit code and a message naming the check. It SHALL NOT retry silently more than the Playwright default.
7. The smoke test SHALL NOT need credentials, SHALL NOT write to the site, and SHALL send only GET and HEAD requests.

### R10. README "Live" section

**User story:** As a judge or visitor reading the README, I want the link and a plain statement of what is live.

1. The README SHALL get a "Live" section only after the first successful deploy and a passing smoke check. Until then it SHALL still say "no live URL yet" (as it does today). This spec's pull request SHALL NOT change the README.
2. The section SHALL give the live URL (the actual one, R1.5), say that it is a static site with no accounts, no tracking and no server, say how to check it (`npm run smoke`), and say that it redeploys from `main`.
3. The section SHALL describe only what is live. It SHALL NOT say the scene, controls or sound are built unless they are. The "Status" section of the README SHALL be updated to match what is deployed at that time.
4. The README MAY name the hosting provider once, in this section. The app itself (code, copy, UI) SHALL NOT (Point for review P2 in the design).
5. The section SHALL follow the naming rule in `product.md` (say "focus session"; no trademarked names for the timer technique).

### R11. Owner steps and nothing created by agents

**User story:** As the repo owner, I want to be the one who connects my accounts.

1. This spec's agents SHALL NOT create, change or delete any Render resource, and SHALL NOT hold or ask for a Render account, API key or token.
2. The one-time setup SHALL be listed as owner steps in the tasks: connect Render to the GitHub repository, create a Blueprint from `render.yaml` on `main`, check that the dashboard shows one free static site, and report the URL.
3. Every step after the owner steps that needs a live site (smoke run, README section, auto-deploy proof) SHALL be written so that it can be done from the repo with a URL, with no dashboard access.
4. No claim of "deployed" or "live" SHALL be written anywhere (README, `KIRO_USAGE.md`, pull request) before the owner has confirmed the deploy and the smoke test has passed against it.

### R12. Free and up until Jan 29, 2027

**User story:** As a judge, I want the link to work for as long as the hackathon needs it.

1. The service SHALL stay on the free plan with no feature that ends on its own before Jan 29, 2027 (brief section 8). The design lists what is known and what is assumed about the free plan.
2. The smoke check SHALL be run and its result recorded: right after the first deploy, before the submission on Dec 3, 2026, and on or after Jan 29, 2027.
3. Nothing in the repo can guarantee a third party's free plan. The dated smoke runs are the evidence. If the provider changes its terms, the fallback is to move the static `dist/` to another static host; the header table is plain data and the build has no provider-specific code.
4. The site SHALL have no run-time dependency on the provider, so a move needs no code change (R1.4).

### R13. Order of work and scope

1. Hosting needs no other spec to be finished. Because the build runs `npm run check` and `npm test`, `main` must be green when the service is created. It is today.
2. The first deploy SHOULD happen early, before the sound and the controls exist, to find header or cache problems while little else is changing. The milestone in the brief (deploy by Nov 28) is a latest date, not an earliest.
3. Out of scope: a custom domain, analytics, error reporting, uptime monitoring, a status page, a CI workflow, a CDN other than Render's own, a service worker, a web app manifest, a favicon and `robots.txt`. A later spec may add them.
4. Property-based testing is not enabled for this spec. The work is configuration and has no input space to generate. The checks are example-based (R8, R9).

## Out of scope

- Everything listed in R13.3.
- Any change to `src/engine/`, `src/scene/`, `src/distraction/`, `src/storage/` or `main.ts`.
- Creating any Render resource (R11).

## Open questions

See "Points for review" at the end of `design.md`. They are about the service name, naming the provider in the README, one new dev dependency, `no-cache` against `no-store`, the strict policy, and what could not be verified about the free plan.

## Decisions

None yet. Answer the points for review and they will be moved here, with the requirements changed to match.
