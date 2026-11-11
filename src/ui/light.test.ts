import { describe, expect, it } from "vitest";
import { lightRequest } from "./light";

describe("lightRequest (R2.6, R3.3, R4.2)", () => {
  it("builds a light event from a preset and an intent", () => {
    expect(lightRequest({ kind: "preset", minutes: 25 }, "write the report")).toEqual({
      ok: true,
      event: { type: "light", length: 25, intent: "write the report" },
    });
  });

  it("builds a light event from a valid custom length", () => {
    expect(lightRequest({ kind: "custom", text: " 40 " }, "x")).toEqual({ ok: true, event: { type: "light", length: 40, intent: "x" } });
    expect(lightRequest({ kind: "custom", text: "5" }, "")).toEqual({ ok: true, event: { type: "light", length: 5 } });
  });

  it("refuses an invalid custom length with the reason, and builds no event", () => {
    expect(lightRequest({ kind: "custom", text: "" }, "x")).toEqual({ ok: false, reason: "empty" });
    expect(lightRequest({ kind: "custom", text: "four" }, "x")).toEqual({ ok: false, reason: "format" });
    expect(lightRequest({ kind: "custom", text: "4" }, "x")).toEqual({ ok: false, reason: "range" });
    expect(lightRequest({ kind: "custom", text: "91" }, "x")).toEqual({ ok: false, reason: "range" });
  });

  it("leaves the intent key out when the text is empty", () => {
    const result = lightRequest({ kind: "preset", minutes: 15 }, "");
    expect(result.ok && "intent" in result.event).toBe(false);
  });

  it("passes the intent on unchanged: line breaks, outer spaces and 100 characters are the engine's to normalize", () => {
    const messy = "  first line\nsecond line  ";
    const long = "x".repeat(100);
    const a = lightRequest({ kind: "preset", minutes: 15 }, messy);
    const b = lightRequest({ kind: "preset", minutes: 15 }, long);
    expect(a.ok && a.event.intent).toBe(messy);
    expect(b.ok && b.event.intent).toBe(long);
  });

  it("keeps a whitespace-only intent as typed (the engine turns it into no intent)", () => {
    const result = lightRequest({ kind: "preset", minutes: 15 }, "   ");
    expect(result.ok && result.event.intent).toBe("   ");
  });
});
