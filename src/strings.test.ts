import { describe, expect, it } from "vitest";
import { STRINGS } from "./strings";

describe("placeholder", () => {
  it("has the tagline", () => {
    expect(STRINGS.tagline).toBe("Keep the candle lit.");
  });
});
