import { INTENT_MAX_CODE_POINTS } from "./constants";

/**
 * Normalizes the optional one-line intent (R2.4):
 * line breaks become one space, ends are trimmed, the text is cut after the
 * 80th Unicode code point (so a surrogate pair is never split), and an empty
 * result means no intent. Idempotent.
 */
export function normalizeIntent(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const flat = raw.replace(/[\r\n\u2028\u2029]+/g, " ").trim();
  const cut = Array.from(flat).slice(0, INTENT_MAX_CODE_POINTS).join("").trimEnd();
  return cut === "" ? null : cut;
}
