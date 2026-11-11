// Test-only: reads and understands render.yaml (the Render Blueprint at the repo root).
// Imported by the Vitest tests in this folder and by the Playwright specs in e2e/. No shipped file imports it,
// so Vite never bundles it. See .kiro/specs/hosting/design.md section 6.1.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export interface HeaderRule {
  readonly path: string;
  readonly name: string;
  readonly value: string;
}

export interface EnvVar {
  readonly key: string;
  readonly value?: string;
  readonly sync?: boolean;
}

/** A service as written in the file. Only the fields this repo uses are typed; anything else shows up in `Object.keys`. */
export interface Service {
  readonly [field: string]: unknown;
  readonly type?: string;
  readonly name?: string;
  readonly runtime?: string;
  readonly branch?: string;
  readonly autoDeployTrigger?: string;
  readonly pullRequestPreviewsEnabled?: boolean;
  readonly buildCommand?: string;
  readonly staticPublishPath?: string;
  readonly envVars?: readonly EnvVar[];
  readonly headers?: readonly HeaderRule[];
}

export interface Blueprint {
  readonly [field: string]: unknown;
  readonly services?: readonly Service[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses Blueprint text. Throws if the text is not a YAML mapping. */
export function parseBlueprint(text: string): Blueprint {
  const doc: unknown = parse(text);
  if (!isRecord(doc)) throw new Error("render.yaml is not a YAML mapping");
  return doc as Blueprint;
}

/** Reads `render.yaml` from the repo root (the working directory of `npm test` and `npm run e2e`). */
export function readBlueprint(root: string = process.cwd()): Blueprint {
  return parseBlueprint(readFileSync(join(root, "render.yaml"), "utf8"));
}

/**
 * Whether a header rule's `path` applies to a request path, by the rules Render documents
 * (https://render.com/docs/static-site-headers, design section 0 and 6.1):
 * - `/*` matches every request path;
 * - `<prefix>/*` matches `<prefix>/` and everything under it;
 * - a path with no `*` matches only itself (the page does not say; this is the assumption, checked live by smoke B1).
 * Any other pattern throws, so a rule this helper does not understand fails a test instead of being silently mismatched.
 */
export function pathMatches(pattern: string, pathname: string): boolean {
  if (!pattern.includes("*")) return pathname === pattern;
  if (pattern === "/*") return pathname.startsWith("/");
  if (pattern.endsWith("/*") && !pattern.slice(0, -2).includes("*")) {
    return pathname.startsWith(pattern.slice(0, -1));
  }
  throw new Error(`unsupported header path pattern: ${pattern}`);
}

/** Every header rule of the (single) service that applies to `pathname`, in file order. */
export function rulesFor(blueprint: Blueprint, pathname: string): HeaderRule[] {
  const service = blueprint.services?.[0];
  const rules = service?.headers ?? [];
  return rules.filter((rule) => pathMatches(rule.path, pathname));
}

/**
 * The headers Render should send for `pathname`: header name (as written in the file) to value.
 * Throws if two matching rules set the same header name (compared case-insensitively), because the Blueprint
 * must never depend on how Render merges them (requirements R6.4, design section 5.3).
 */
export function headersFor(blueprint: Blueprint, pathname: string): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  for (const rule of rulesFor(blueprint, pathname)) {
    const lower = rule.name.toLowerCase();
    if (seen.has(lower)) throw new Error(`two header rules set ${rule.name} for ${pathname}`);
    seen.add(lower);
    out[rule.name] = rule.value;
  }
  return out;
}
