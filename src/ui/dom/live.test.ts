// The live-region writer and the announce path used for view changes (ghosts-and-graveyard CR-A1). Node only: the region is a plain object.
import { describe, expect, it } from "vitest";
import { createLiveWriter } from "./live";

describe("the live writer as announce(text) uses it", () => {
  it("writes one line on the next frame", () => {
    const region = { textContent: "" as string | null };
    const live = createLiveWriter(region);
    live.say("Graveyard.");
    expect(region.textContent).toBe("");
    live.frame();
    expect(region.textContent).toBe("Graveyard.");
  });
  it("lets the last line of a frame win", () => {
    const region = { textContent: "" as string | null };
    const live = createLiveWriter(region);
    live.say("one");
    live.say("two");
    live.frame();
    expect(region.textContent).toBe("two");
  });
  it("clears for one frame before a repeated line, so it is announced again", () => {
    const region = { textContent: "" as string | null };
    const live = createLiveWriter(region);
    live.say("Room.");
    live.frame();
    live.say("Room.");
    live.frame();
    expect(region.textContent).toBe("");
    live.frame();
    expect(region.textContent).toBe("Room.");
  });
});
