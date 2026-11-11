// Candlewatch is a static site with no run-time network use (hosting requirements R1.4, R8.2; design 6.2).
// The scan reads the shipped source as text. It does not strip comments, so a URL in a comment fails too:
// that forces an explicit decision instead of a silent exception.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const FORBIDDEN: readonly (readonly [string, RegExp])[] = [
  ["fetch(", /\bfetch\s*\(/],
  ["XMLHttpRequest", /XMLHttpRequest/],
  ["WebSocket", /WebSocket/],
  ["sendBeacon", /sendBeacon/],
  ["EventSource", /EventSource/],
  ["importScripts", /importScripts/],
];

/** What is wrong with a piece of shipped source, as short labels. Empty means clean. */
export function scan(text: string): string[] {
  const found: string[] = [];
  for (const [label, pattern] of FORBIDDEN) if (pattern.test(text)) found.push(label);
  for (const match of text.matchAll(/https?:\/\/[^\s"'`)<>]*/g)) {
    if (match[0] !== SVG_NAMESPACE) found.push(`URL ${match[0]}`);
  }
  return found;
}

const ROOT = process.cwd();

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

/** Shipped source: `src/` without tests and without this folder, plus `index.html`. */
function shippedFiles(): string[] {
  const inSrc = walk(join(ROOT, "src")).filter((file) => {
    const rel = relative(ROOT, file).split(sep).join("/");
    if (rel.startsWith("src/hosting/")) return false;
    if (/\.(test|prop\.test)\.ts$/.test(rel)) return false;
    return /\.(ts|css|html)$/.test(rel);
  });
  return [...inSrc, join(ROOT, "index.html")];
}

describe("the shipped source makes no network calls", () => {
  it("finds the files it is meant to scan", () => {
    const rels = shippedFiles().map((f) => relative(ROOT, f).split(sep).join("/"));
    expect(rels).toContain("index.html");
    expect(rels).toContain("src/main.ts");
    expect(rels).toContain("src/scene/render.ts");
    expect(rels).toContain("src/scene/scene.css");
    expect(rels.some((r) => r.endsWith(".test.ts"))).toBe(false);
    expect(rels.some((r) => r.startsWith("src/hosting/"))).toBe(false);
    expect(rels.length).toBeGreaterThan(20);
  });

  it("has no fetch, XMLHttpRequest, WebSocket, sendBeacon, EventSource, importScripts or URL (R1.4)", () => {
    const report = shippedFiles()
      .map((file) => [relative(ROOT, file).split(sep).join("/"), scan(readFileSync(file, "utf8"))] as const)
      .filter(([, found]) => found.length > 0)
      .map(([file, found]) => `${file}: ${found.join(", ")}`);
    expect(report).toEqual([]);
  });
});

describe("the scanner itself", () => {
  it("catches each forbidden word", () => {
    expect(scan('const r = await fetch("/x");')).toEqual(["fetch("]);
    expect(scan("fetch ('/x')")).toEqual(["fetch("]);
    expect(scan("new XMLHttpRequest()")).toEqual(["XMLHttpRequest"]);
    expect(scan('new WebSocket("wss://x")')).toContain("WebSocket");
    expect(scan('navigator.sendBeacon("/x")')).toEqual(["sendBeacon"]);
    expect(scan('new EventSource("/x")')).toEqual(["EventSource"]);
    expect(scan('importScripts("x.js")')).toEqual(["importScripts"]);
  });

  it("catches an http or https URL, even in a comment", () => {
    expect(scan("// see https://example.com/page")).toEqual(["URL https://example.com/page"]);
    expect(scan('<script src="http://cdn.example/x.js"></script>')).toEqual(["URL http://cdn.example/x.js"]);
    expect(scan("@import url(https://fonts.example/css);")).toEqual(["URL https://fonts.example/css"]);
  });

  it("lets the SVG namespace alone through, and nothing longer", () => {
    expect(scan(`<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 1 1"></svg>`)).toEqual([]);
    expect(scan(`${SVG_NAMESPACE}/extra`)).toEqual([`URL ${SVG_NAMESPACE}/extra`]);
  });

  it("does not trip on words that merely contain a forbidden word", () => {
    expect(scan("const prefetched = 1; const fetchCount = 2;")).toEqual([]);
  });

  it("catches a call added to shipped-looking source (the fixture string stands in for a real edit)", () => {
    const fixture = 'export function boot(): void {\n  void fetch("/api/state");\n}\n';
    expect(scan(fixture)).toEqual(["fetch("]);
  });
});
