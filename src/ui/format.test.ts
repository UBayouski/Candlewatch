import { describe, expect, it } from "vitest";
import { STRINGS } from "../strings";
import { fill, formatTime, spokenTime } from "./format";

const SEC = 1000;
const MIN = 60 * SEC;

describe("formatTime (R7.3)", () => {
  it("shows mm:ss, rounded up to whole seconds", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(1)).toBe("00:01");
    expect(formatTime(999)).toBe("00:01");
    expect(formatTime(1000)).toBe("00:01");
    expect(formatTime(1001)).toBe("00:02");
    expect(formatTime(60_000)).toBe("01:00");
    expect(formatTime(12 * MIN + 30_100)).toBe("12:31");
  });

  it("shows a whole candle as its length, and the largest length as 90:00", () => {
    expect(formatTime(25 * MIN)).toBe("25:00");
    expect(formatTime(5 * MIN)).toBe("05:00");
    expect(formatTime(90 * MIN)).toBe("90:00");
  });

  it("pads the minutes to two digits and the seconds to two digits", () => {
    expect(formatTime(5 * MIN + 7 * SEC)).toBe("05:07");
    expect(formatTime(59 * SEC)).toBe("00:59");
  });

  it("does not stop at two digits of minutes", () => {
    expect(formatTime(100 * MIN)).toBe("100:00");
  });

  it("shows 00:00 for negative, NaN and infinite input", () => {
    expect(formatTime(-5)).toBe("00:00");
    expect(formatTime(-Infinity)).toBe("00:00");
    expect(formatTime(Infinity)).toBe("00:00");
    expect(formatTime(NaN)).toBe("00:00");
  });

  it("shows 00:00 only for a time that is zero or less, even for a time too small for ms / 1000 (found by P1, seed -1238203428)", () => {
    expect(formatTime(0.0001)).toBe("00:01");
    expect(formatTime(5e-324)).toBe("00:01");
    expect(spokenTime(5e-324)).toBe("1 second");
  });
});

describe("spokenTime (R9.1)", () => {
  it("names the minutes and seconds with the right singular and plural", () => {
    expect(spokenTime(12 * MIN + 31 * SEC)).toBe("12 minutes 31 seconds");
    expect(spokenTime(MIN)).toBe("1 minute");
    expect(spokenTime(45 * SEC)).toBe("45 seconds");
    expect(spokenTime(MIN + SEC)).toBe("1 minute 1 second");
    expect(spokenTime(2 * MIN)).toBe("2 minutes");
    expect(spokenTime(SEC)).toBe("1 second");
  });

  it("says 0 seconds for zero, negative and non-finite input", () => {
    expect(spokenTime(0)).toBe("0 seconds");
    expect(spokenTime(-1)).toBe("0 seconds");
    expect(spokenTime(NaN)).toBe("0 seconds");
    expect(spokenTime(Infinity)).toBe("0 seconds");
  });

  it("rounds up like formatTime", () => {
    expect(spokenTime(12 * MIN + 30_100)).toBe("12 minutes 31 seconds");
    expect(spokenTime(1)).toBe("1 second");
  });
});

describe("fill", () => {
  it("replaces one, two and repeated placeholders", () => {
    expect(fill("{n} minutes", { n: 5 })).toBe("5 minutes");
    expect(fill("{a} and {b}", { a: "x", b: 2 })).toBe("x and 2");
    expect(fill("{n}{n}", { n: 7 })).toBe("77");
  });

  it("leaves a name that is not given as it is", () => {
    expect(fill("{n} and {other}", { n: 1 })).toBe("1 and {other}");
    expect(fill("{toString}", {})).toBe("{toString}");
  });

  it("does not search a substituted value again", () => {
    expect(fill("{a}", { a: "{b}", b: "no" })).toBe("{b}");
  });

  it("leaves a template without placeholders alone", () => {
    expect(fill("A quarter is gone.", { n: 1 })).toBe("A quarter is gone.");
  });
});

describe("the time strings", () => {
  it("has the unit templates, the left template and the unknown placeholder", () => {
    expect(STRINGS.time.minute).toContain("{n}");
    expect(STRINGS.time.minutes).toContain("{n}");
    expect(STRINGS.time.second).toContain("{n}");
    expect(STRINGS.time.seconds).toContain("{n}");
    expect(STRINGS.time.timeLeft).toContain("{time}");
    expect(STRINGS.time.timeUnknown).toBe("--:--");
  });
});
