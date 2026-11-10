import { describe, expect, it } from "vitest";
import { normalizeIntent } from "./intent";

const EMOJI = "\u{1F600}";
const codePoints = (s: string | null): number => (s === null ? 0 : Array.from(s).length);
const hasLoneSurrogate = (s: string): boolean => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

describe("normalizeIntent", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeIntent("  write the report \t")).toBe("write the report");
  });

  it("replaces internal line breaks with a single space", () => {
    expect(normalizeIntent("write\nthe\r\nreport")).toBe("write the report");
    expect(normalizeIntent("a\n\n\nb")).toBe("a b");
    expect(normalizeIntent("a\u2028b\u2029c")).toBe("a b c");
  });

  it("returns null for empty, blank and non-string input", () => {
    expect(normalizeIntent("")).toBeNull();
    expect(normalizeIntent("   \n\t ")).toBeNull();
    expect(normalizeIntent(undefined)).toBeNull();
    expect(normalizeIntent(42)).toBeNull();
    expect(normalizeIntent(null)).toBeNull();
  });

  it("keeps exactly 80 code points and cuts the 81st", () => {
    expect(normalizeIntent("a".repeat(80))).toBe("a".repeat(80));
    expect(normalizeIntent("a".repeat(81))).toBe("a".repeat(80));
    expect(normalizeIntent("a".repeat(500))).toBe("a".repeat(80));
  });

  it("keeps 80 emoji whole", () => {
    const eighty = EMOJI.repeat(80);
    expect(normalizeIntent(eighty)).toBe(eighty);
  });

  it("cuts 81 emoji to exactly 80 with no lone surrogate", () => {
    const out = normalizeIntent(EMOJI.repeat(81));
    expect(out).toBe(EMOJI.repeat(80));
    expect(codePoints(out)).toBe(80);
    expect(hasLoneSurrogate(out ?? "")).toBe(false);
  });

  it("keeps an emoji that is the 80th code point whole", () => {
    const out = normalizeIntent("a".repeat(79) + EMOJI);
    expect(out).toBe("a".repeat(79) + EMOJI);
    expect(codePoints(out)).toBe(80);
  });

  it("keeps only the first of two emoji after 79 ASCII characters", () => {
    const out = normalizeIntent("a".repeat(79) + EMOJI + EMOJI);
    expect(out).toBe("a".repeat(79) + EMOJI);
    expect(codePoints(out)).toBe(80);
    expect(hasLoneSurrogate(out ?? "")).toBe(false);
  });

  it("removes a space exposed by the cut", () => {
    expect(normalizeIntent("a".repeat(79) + " b")).toBe("a".repeat(79));
  });

  it("is idempotent", () => {
    const inputs = ["  hi\nthere ", "a".repeat(79) + " b", EMOJI.repeat(90), "\n", "x"];
    for (const input of inputs) {
      const once = normalizeIntent(input);
      expect(normalizeIntent(once)).toBe(once);
    }
  });

  it("keeps quotes, backslashes and non-Latin text", () => {
    expect(normalizeIntent('say "hi" \\ \u65E5\u672C')).toBe('say "hi" \\ \u65E5\u672C');
  });
});
