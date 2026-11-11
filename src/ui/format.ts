// The time text, the time in words, and template filling (controls-and-access R7.3, R9.1; design 3.1).
// Pure: no clock, no DOM. `formatTime` is also what the page title shows (sound-and-title).
import { STRINGS } from "../strings";

/** Whole seconds, rounded up. Zero for zero, negative, `NaN` and infinite input. */
function wholeSeconds(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  // Math.max: a positive time so small that ms / 1000 underflows to 0 (5e-324) must still read 00:01, never 00:00.
  return Math.max(1, Math.ceil(ms / 1000));
}

/**
 * `mm:ss`: minutes with at least two digits, seconds with exactly two, from a time in milliseconds rounded UP to whole
 * seconds. 25 minutes shows `25:00`; 1 ms shows `00:01`; only 0 shows `00:00`. A negative, `NaN` or infinite input shows `00:00`.
 */
export function formatTime(ms: number): string {
  const total = wholeSeconds(ms);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Replaces `{name}` placeholders from `values`. A name that is not in `values` is left as it is. One pass, so a value is never searched again. */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole,
  );
}

/**
 * The same time in words, with the same rounding as `formatTime`: "12 minutes 31 seconds", "1 minute", "45 seconds",
 * "0 seconds". A unit that is zero is skipped.
 */
export function spokenTime(ms: number): string {
  const total = wholeSeconds(ms);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const parts: string[] = [];
  if (minutes > 0) parts.push(fill(minutes === 1 ? STRINGS.time.minute : STRINGS.time.minutes, { n: minutes }));
  if (seconds > 0) parts.push(fill(seconds === 1 ? STRINGS.time.second : STRINGS.time.seconds, { n: seconds }));
  return parts.length > 0 ? parts.join(" ") : fill(STRINGS.time.seconds, { n: 0 });
}
