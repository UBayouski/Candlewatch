// ghosts-and-graveyard R10.1, R10.2, R10.4 (design 3.10): the scene label says the engine's count and nothing about the time.
import { describe, expect, it } from "vitest";
import { STRINGS } from "../strings";
import { countWords, sceneLabel } from "./label";
import type { SceneMode } from "./label";

const MODES = Object.keys(STRINGS.scene) as SceneMode[];

describe("countWords", () => {
  it("uses the singular for 1 and the plural for every other count, with plain digits", () => {
    expect(countWords(0)).toBe("0 distractions");
    expect(countWords(1)).toBe("1 distraction");
    expect(countWords(2)).toBe("2 distractions");
    expect(countWords(14)).toBe("14 distractions");
    expect(countWords(1000)).toBe("1000 distractions");
  });

  it("reads what is not a count as 0 and a fraction as its whole part", () => {
    for (const bad of [-1, Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, 0.4]) expect(countWords(bad), String(bad)).toBe("0 distractions");
    expect(countWords(2.9)).toBe("2 distractions");
    expect(countWords(1.5)).toBe("1 distraction");
  });
});

describe("sceneLabel", () => {
  it('is the state sentence, a space, the count in words and a full stop: "The candle burns. 3 distractions."', () => {
    expect(sceneLabel("steady", 3)).toBe("The candle burns. 3 distractions.");
    expect(sceneLabel("unlit", 0)).toBe("An unlit candle. 0 distractions.");
    expect(sceneLabel("guttering", 1)).toBe("The flame gutters. 1 distraction.");
  });

  it("covers every scene mode", () => {
    expect(MODES).toEqual(["unlit", "steady", "paused", "guttering", "smoke"]);
    for (const mode of MODES) {
      for (const count of [0, 1, 2, 14, 1000]) expect(sceneLabel(mode, count)).toBe(`${STRINGS.scene[mode]} ${countWords(count)}.`);
    }
  });

  it("never contains the time", () => {
    for (const mode of MODES) {
      for (const count of [0, 1, 2, 14, 1000]) expect(sceneLabel(mode, count), `${mode} ${count}`).not.toMatch(/\d{1,2}:\d{2}|minute|second/i);
    }
  });

  it("gives the same label for the same inputs", () => {
    expect(sceneLabel("paused", 14)).toBe(sceneLabel("paused", 14));
  });
});
