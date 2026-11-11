import { describe, expect, it } from "vitest";
import { lengthOf, nextChoice, parseLength } from "./length";
import type { ArrowKey, ChoiceIndex } from "./length";

describe("parseLength (R2.4)", () => {
  it("accepts 5 to 90", () => {
    expect(parseLength("5")).toEqual({ ok: true, minutes: 5 });
    expect(parseLength("25")).toEqual({ ok: true, minutes: 25 });
    expect(parseLength("90")).toEqual({ ok: true, minutes: 90 });
  });

  it("rejects 4 and 91 as out of range, and 0 and 100 too", () => {
    expect(parseLength("4")).toEqual({ ok: false, reason: "range" });
    expect(parseLength("91")).toEqual({ ok: false, reason: "range" });
    expect(parseLength("0")).toEqual({ ok: false, reason: "range" });
    expect(parseLength("000")).toEqual({ ok: false, reason: "range" });
    expect(parseLength("100")).toEqual({ ok: false, reason: "range" });
    expect(parseLength("999")).toEqual({ ok: false, reason: "range" });
  });

  it("trims spaces and tabs around the digits", () => {
    expect(parseLength(" 25 ")).toEqual({ ok: true, minutes: 25 });
    expect(parseLength("\t25\t")).toEqual({ ok: true, minutes: 25 });
  });

  it("allows leading zeros: 025 is 25", () => {
    expect(parseLength("025")).toEqual({ ok: true, minutes: 25 });
    expect(parseLength("05")).toEqual({ ok: true, minutes: 5 });
  });

  it("rejects text that is not one to three ASCII digits", () => {
    for (const text of ["2 5", "25.0", "+25", "-25", "2e1", "0x19", "25.", ".5", "1,5", "abc", "25m", "0025", "1000", "٢٥", "２５"]) {
      expect(parseLength(text), JSON.stringify(text)).toEqual({ ok: false, reason: "format" });
    }
  });

  it("says empty for empty text and for spaces only", () => {
    expect(parseLength("")).toEqual({ ok: false, reason: "empty" });
    expect(parseLength("   ")).toEqual({ ok: false, reason: "empty" });
    expect(parseLength("\t")).toEqual({ ok: false, reason: "empty" });
  });

  it("does not trim line breaks or other white space", () => {
    expect(parseLength("25\n")).toEqual({ ok: false, reason: "format" });
    expect(parseLength("\u00A025")).toEqual({ ok: false, reason: "format" });
  });
});

describe("lengthOf", () => {
  it("takes a preset as it is", () => {
    for (const minutes of [15, 25, 50] as const) expect(lengthOf({ kind: "preset", minutes })).toEqual({ ok: true, minutes });
  });

  it("sends custom text through parseLength", () => {
    expect(lengthOf({ kind: "custom", text: "40" })).toEqual({ ok: true, minutes: 40 });
    expect(lengthOf({ kind: "custom", text: "4" })).toEqual({ ok: false, reason: "range" });
    expect(lengthOf({ kind: "custom", text: "" })).toEqual({ ok: false, reason: "empty" });
    expect(lengthOf({ kind: "custom", text: "x" })).toEqual({ ok: false, reason: "format" });
  });
});

describe("nextChoice (the arrow keys of the chooser)", () => {
  const keys: ArrowKey[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
  const indices: ChoiceIndex[] = [0, 1, 2, 3];

  it("moves Right and Down to the next stop, wrapping from the custom stop to 15", () => {
    for (const key of ["ArrowRight", "ArrowDown"] as const) {
      expect(indices.map((i) => nextChoice(i, key))).toEqual([1, 2, 3, 0]);
    }
  });

  it("moves Left and Up to the previous stop, wrapping from 15 to the custom stop", () => {
    for (const key of ["ArrowLeft", "ArrowUp"] as const) {
      expect(indices.map((i) => nextChoice(i, key))).toEqual([3, 0, 1, 2]);
    }
  });

  it("always stays on one of the four stops", () => {
    for (const key of keys) for (const i of indices) expect([0, 1, 2, 3]).toContain(nextChoice(i, key));
  });
});
