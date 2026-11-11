// Keeps render.yaml honest (hosting requirements R1 to R7, R8.1, R8.4; design 6.2).
// `problems(blueprint)` lists everything wrong with a Blueprint; the real file must have none, and each
// hand-made mutant of it must have at least one (so the checks are not vacuous).
import { describe, expect, it } from "vitest";
import { headersFor, parseBlueprint, pathMatches, readBlueprint, rulesFor } from "./blueprint";
import type { Blueprint, HeaderRule, Service } from "./blueprint";

const BUILD_COMMAND = "npm ci && npm run check && npm test && npm run build";

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; media-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};

// Strict-Transport-Security is deliberately absent: Render sets it on every response and its value
// ("max-age=315360000; includeSubdomains; preload", seen live on 2026-11-10) replaces ours (design Decision P10).
const FORBIDDEN_HEADERS = ["Strict-Transport-Security"];

const CACHE_RULES: readonly (readonly [string, string])[] = [
  ["/assets/*", "public, max-age=31536000, immutable"],
  ["/", "no-cache"],
  ["/index.html", "no-cache"],
];

const SERVICE_KEYS = [
  "type",
  "name",
  "runtime",
  "branch",
  "autoDeployTrigger",
  "pullRequestPreviewsEnabled",
  "buildCommand",
  "staticPublishPath",
  "envVars",
  "headers",
];

const SAMPLE_PATHS = ["/", "/index.html", "/assets/index-abc123.js", "/assets/", "/assets/a/b.css", "/other", "/no-such-page"];

/** Everything wrong with a Blueprint, as short sentences. Empty means it matches the spec. */
function problems(blueprint: Blueprint): string[] {
  const out: string[] = [];
  const topKeys = Object.keys(blueprint);
  if (topKeys.length !== 1 || topKeys[0] !== "services") out.push(`top-level keys are ${topKeys.join(",")}, not just services`);
  const services = blueprint.services ?? [];
  if (services.length !== 1) {
    out.push(`${services.length} services, not 1`);
    return out;
  }
  const s: Service = services[0] as Service;

  // R1, R2
  if (s.type !== "web") out.push("type is not web");
  if (s.runtime !== "static") out.push("runtime is not static");
  if (s.name !== "candlewatch") out.push("name is not candlewatch");
  if (s.branch !== "main") out.push("branch is not main");
  if (s.autoDeployTrigger !== "commit") out.push("autoDeployTrigger is not commit");
  if (s.staticPublishPath !== "dist") out.push("staticPublishPath is not dist");
  if (s.pullRequestPreviewsEnabled !== false) out.push("pull request previews are not off");
  if ("plan" in s) out.push("a plan field is present");
  if ("routes" in s || "routes" in blueprint) out.push("routes are present");
  for (const key of Object.keys(s)) if (!SERVICE_KEYS.includes(key)) out.push(`unexpected service key ${key}`);

  // R3
  const build = s.buildCommand ?? "";
  if (build !== BUILD_COMMAND) out.push(`buildCommand is not the exact command: ${build}`);
  for (const word of ["verify", "e2e", "playwright", "||"]) {
    if (build.includes(word)) out.push(`buildCommand contains ${word}`);
  }
  const env = s.envVars ?? [];
  const names = env.map((e) => e.key).sort();
  if (names.join(",") !== "NODE_VERSION,PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD") out.push(`envVars are ${names.join(",")}`);
  for (const e of env) {
    if (e.key === "NODE_VERSION" && e.value !== "22") out.push(`NODE_VERSION is ${JSON.stringify(e.value)}, not the string "22"`);
    if (e.key === "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD" && e.value !== "1") out.push("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is not the string 1");
    if ("sync" in e) out.push(`${e.key} has a sync field`);
    if (/key|token|secret|password/i.test(e.key) || /key|token|secret|password/i.test(String(e.value ?? ""))) {
      out.push(`${e.key} looks like a secret`);
    }
  }

  // R5.1: the rules for /* are exactly the seven security headers
  const rules: readonly HeaderRule[] = s.headers ?? [];
  const star = rules.filter((r) => r.path === "/*");
  const starTable = Object.fromEntries(star.map((r) => [r.name, r.value]));
  if (star.length !== Object.keys(SECURITY_HEADERS).length) out.push(`/* has ${star.length} rules, not ${Object.keys(SECURITY_HEADERS).length}`);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (starTable[name] !== value) out.push(`/* ${name} is ${JSON.stringify(starTable[name])}`);
  }

  // Render sets HSTS on every response; the Blueprint must not define it (Decision P10)
  for (const r of rules) {
    if (FORBIDDEN_HEADERS.some((name) => name.toLowerCase() === r.name.toLowerCase())) out.push(`${r.name} is defined for ${r.path}; Render sets it`);
  }

  // R6
  for (const [path, value] of CACHE_RULES) {
    const found = rules.filter((r) => r.path === path && r.name === "Cache-Control");
    if (found.length !== 1 || found[0]?.value !== value) out.push(`Cache-Control for ${path} is not exactly ${value}`);
  }
  if (rules.some((r) => r.path === "/*" && r.name.toLowerCase() === "cache-control")) out.push("/* sets Cache-Control");
  const known = new Set(["/*", ...CACHE_RULES.map(([p]) => p)]);
  for (const r of rules) if (!known.has(r.path)) out.push(`rule for an unexpected path ${r.path}`);
  for (const path of SAMPLE_PATHS) {
    const n = rulesFor(blueprint, path).filter((r) => r.name.toLowerCase() === "cache-control").length;
    if (n > 1) out.push(`${n} Cache-Control rules match ${path}`);
  }

  // R5.2: the CSP only ever names 'self' and 'none'
  const csp = starTable["Content-Security-Policy"] ?? "";
  if (/unsafe-/.test(csp)) out.push("the CSP contains an unsafe- keyword");
  for (const directive of csp.split(";").map((d) => d.trim()).filter((d) => d !== "")) {
    const [name, ...sources] = directive.split(/\s+/);
    for (const source of sources) {
      if (source !== "'self'" && source !== "'none'") out.push(`the CSP directive ${name} has the source ${source}`);
    }
  }
  return out;
}

const clone = (b: Blueprint): Blueprint => structuredClone(b);
const withService = (b: Blueprint, change: (s: Record<string, unknown>) => void): Blueprint => {
  const copy = clone(b);
  change((copy.services as unknown as Record<string, unknown>[])[0] as Record<string, unknown>);
  return copy;
};

describe("render.yaml", () => {
  const blueprint = readBlueprint();

  it("matches the hosting spec (R1 to R7)", () => {
    expect(problems(blueprint)).toEqual([]);
  });

  it("defines one free static site named candlewatch, built from main, with no plan field (R1.1, R1.2, R2)", () => {
    expect(blueprint.services).toHaveLength(1);
    const s = blueprint.services?.[0];
    expect(s).toMatchObject({
      type: "web",
      runtime: "static",
      name: "candlewatch",
      branch: "main",
      autoDeployTrigger: "commit",
      staticPublishPath: "dist",
      pullRequestPreviewsEnabled: false,
    });
    expect(s).not.toHaveProperty("plan");
  });

  it("builds with the exact command and never runs verify, e2e or Playwright (R3.1, R3.2, R3.5)", () => {
    const build = blueprint.services?.[0]?.buildCommand;
    expect(build).toBe(BUILD_COMMAND);
    for (const word of ["verify", "e2e", "playwright", "||"]) expect(build).not.toContain(word);
  });

  it("sets NODE_VERSION to the string 22 and the browser-download guard, and nothing else (R3.4, R1.3)", () => {
    const env = blueprint.services?.[0]?.envVars ?? [];
    expect(env).toEqual([
      { key: "NODE_VERSION", value: "22" },
      { key: "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD", value: "1" },
    ]);
    expect(typeof env[0]?.value).toBe("string");
  });

  it("sends exactly the seven security headers on every path, with the exact values (R5.1)", () => {
    const rules = blueprint.services?.[0]?.headers ?? [];
    const star = Object.fromEntries(rules.filter((r) => r.path === "/*").map((r) => [r.name, r.value]));
    expect(star).toEqual(SECURITY_HEADERS);
  });

  it("does NOT define Strict-Transport-Security: Render sets it on every response (Decision P10)", () => {
    const rules = blueprint.services?.[0]?.headers ?? [];
    expect(rules.filter((r) => r.name.toLowerCase() === "strict-transport-security")).toEqual([]);
    for (const path of SAMPLE_PATHS) expect(Object.keys(headersFor(blueprint, path)).map((n) => n.toLowerCase())).not.toContain("strict-transport-security");
  });

  it("caches hashed assets for a year and revalidates index.html (R6.1, R6.2)", () => {
    expect(headersFor(blueprint, "/assets/index-abc123.js")["Cache-Control"]).toBe("public, max-age=31536000, immutable");
    expect(headersFor(blueprint, "/")["Cache-Control"]).toBe("no-cache");
    expect(headersFor(blueprint, "/index.html")["Cache-Control"]).toBe("no-cache");
    expect(headersFor(blueprint, "/other")["Cache-Control"]).toBeUndefined();
  });

  it("never lets two rules set the same header for one path (R6.4)", () => {
    for (const path of SAMPLE_PATHS) expect(() => headersFor(blueprint, path)).not.toThrow();
  });

  it("has a CSP that names only 'self' and 'none' (R5.2)", () => {
    const csp = headersFor(blueprint, "/")["Content-Security-Policy"] ?? "";
    expect(csp).not.toMatch(/unsafe-|\*/);
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

describe("the checks are not vacuous: each mutant of render.yaml is caught", () => {
  const good = readBlueprint();
  const mutants: readonly (readonly [string, (b: Blueprint) => Blueprint, RegExp])[] = [
    ["build command runs verify", (b) => withService(b, (s) => (s["buildCommand"] = "npm ci && npm run verify")), /buildCommand/],
    ["build command ends with || true", (b) => withService(b, (s) => (s["buildCommand"] = `${BUILD_COMMAND} || true`)), /buildCommand|\|\|/],
    ["NODE_VERSION is a number", (b) => withService(b, (s) => (s["envVars"] = [{ key: "NODE_VERSION", value: 22 }, { key: "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD", value: "1" }])), /NODE_VERSION/],
    ["NODE_VERSION is an exact patch", (b) => withService(b, (s) => (s["envVars"] = [{ key: "NODE_VERSION", value: "22.23.4" }, { key: "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD", value: "1" }])), /NODE_VERSION/],
    ["a third variable is added", (b) => withService(b, (s) => (s["envVars"] = [...(s["envVars"] as unknown[]), { key: "API_TOKEN", value: "x" }])), /envVars|secret/],
    ["a plan is added", (b) => withService(b, (s) => (s["plan"] = "free")), /plan/],
    ["previews are on", (b) => withService(b, (s) => (s["pullRequestPreviewsEnabled"] = true)), /previews/],
    ["a routes list is added", (b) => withService(b, (s) => (s["routes"] = [{ type: "rewrite", source: "/*", destination: "/index.html" }])), /routes/],
    ["the publish path changes", (b) => withService(b, (s) => (s["staticPublishPath"] = "build")), /staticPublishPath/],
    ["a security header is removed", (b) => withService(b, (s) => (s["headers"] = (s["headers"] as HeaderRule[]).filter((h) => h.name !== "X-Frame-Options"))), /X-Frame-Options|\/\* has/],
    ["a security header value changes", (b) => withService(b, (s) => (s["headers"] = (s["headers"] as HeaderRule[]).map((h) => (h.name === "Referrer-Policy" ? { ...h, value: "origin" } : h)))), /Referrer-Policy/],
    ["a second Cache-Control rule is added for /assets/*", (b) => withService(b, (s) => (s["headers"] = [...(s["headers"] as HeaderRule[]), { path: "/assets/*", name: "Cache-Control", value: "public, max-age=60" }])), /Cache-Control/],
    ["/* sets Cache-Control", (b) => withService(b, (s) => (s["headers"] = [...(s["headers"] as HeaderRule[]), { path: "/*", name: "Cache-Control", value: "no-store" }])), /Cache-Control/],
    ["the CSP gets unsafe-inline", (b) => withService(b, (s) => (s["headers"] = (s["headers"] as HeaderRule[]).map((h) => (h.name === "Content-Security-Policy" ? { ...h, value: h.value.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'") } : h)))), /unsafe-|Content-Security-Policy/],
    ["the CSP gets an origin", (b) => withService(b, (s) => (s["headers"] = (s["headers"] as HeaderRule[]).map((h) => (h.name === "Content-Security-Policy" ? { ...h, value: h.value.replace("connect-src 'self'", "connect-src 'self' https://example.com") } : h)))), /example\.com|Content-Security-Policy/],
    ["index.html is cached for a year", (b) => withService(b, (s) => (s["headers"] = (s["headers"] as HeaderRule[]).map((h) => (h.path === "/index.html" ? { ...h, value: "public, max-age=31536000" } : h)))), /\/index\.html/],
    ["Strict-Transport-Security is put back", (b) => withService(b, (s) => (s["headers"] = [...(s["headers"] as HeaderRule[]), { path: "/*", name: "Strict-Transport-Security", value: "max-age=31536000" }])), /Strict-Transport-Security/],
    ["a second service is added", (b) => ({ ...clone(b), services: [...(b.services ?? []), ...(b.services ?? [])] }), /services/],
    ["a top-level key is added", (b) => ({ ...clone(b), databases: [] }), /top-level/],
  ];

  it("starts from a clean file", () => {
    expect(problems(good)).toEqual([]);
  });

  for (const [title, mutate, expected] of mutants) {
    it(title, () => {
      const found = problems(mutate(good));
      expect(found.length).toBeGreaterThan(0);
      expect(found.join(" | ")).toMatch(expected);
    });
  }
});

describe("pathMatches and headersFor", () => {
  const blueprint = readBlueprint();

  it("/* matches every path", () => {
    for (const p of ["/", "/index.html", "/assets/x.js", "/a/b/c"]) expect(pathMatches("/*", p)).toBe(true);
  });

  it("<prefix>/* matches the prefix directory and everything under it, and nothing else", () => {
    expect(pathMatches("/assets/*", "/assets/")).toBe(true);
    expect(pathMatches("/assets/*", "/assets/x.js")).toBe(true);
    expect(pathMatches("/assets/*", "/assets/a/b.css")).toBe(true);
    expect(pathMatches("/assets/*", "/assets")).toBe(false);
    expect(pathMatches("/assets/*", "/assetsx/y")).toBe(false);
    expect(pathMatches("/assets/*", "/other")).toBe(false);
  });

  it("a path without * matches only itself", () => {
    expect(pathMatches("/", "/")).toBe(true);
    expect(pathMatches("/", "/index.html")).toBe(false);
    expect(pathMatches("/index.html", "/index.html")).toBe(true);
    expect(pathMatches("/index.html", "/")).toBe(false);
  });

  it("throws on a pattern it does not understand", () => {
    expect(() => pathMatches("/*.css", "/a.css")).toThrow(/unsupported/);
    expect(() => pathMatches("/**/*", "/a/b")).toThrow(/unsupported/);
    expect(() => pathMatches("/a/*/b", "/a/x/b")).toThrow(/unsupported/);
  });

  it("/ matches /* and /", () => {
    const rules = rulesFor(blueprint, "/");
    expect(rules.filter((r) => r.path === "/*")).toHaveLength(7);
    expect(rules.filter((r) => r.path === "/")).toHaveLength(1);
    expect(rules.some((r) => r.path === "/assets/*" || r.path === "/index.html")).toBe(false);
  });

  it("/assets/index-abc.js matches /* and /assets/*", () => {
    const paths = new Set(rulesFor(blueprint, "/assets/index-abc.js").map((r) => r.path));
    expect([...paths].sort()).toEqual(["/*", "/assets/*"]);
  });

  it("/index.html matches /* and /index.html", () => {
    const paths = new Set(rulesFor(blueprint, "/index.html").map((r) => r.path));
    expect([...paths].sort()).toEqual(["/*", "/index.html"]);
  });

  it("/other matches only /*", () => {
    const paths = new Set(rulesFor(blueprint, "/other").map((r) => r.path));
    expect([...paths]).toEqual(["/*"]);
    expect(Object.keys(headersFor(blueprint, "/other"))).toHaveLength(7);
  });

  it("headersFor throws when two matching rules set the same header", () => {
    const text = `services:
  - type: web
    headers:
      - { path: "/*", name: Cache-Control, value: a }
      - { path: "/assets/*", name: cache-control, value: b }
`;
    expect(() => headersFor(parseBlueprint(text), "/assets/x.js")).toThrow(/two header rules/);
    expect(headersFor(parseBlueprint(text), "/other")).toEqual({ "Cache-Control": "a" });
  });
});
