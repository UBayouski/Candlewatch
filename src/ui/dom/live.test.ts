import { describe, expect, it } from "vitest";
import { createLiveWriter } from "./live";

function setup() {
  const region = { textContent: "" as string | null };
  const writes: (string | null)[] = [];
  const watched = {
    get textContent(): string | null {
      return region.textContent;
    },
    set textContent(value: string | null) {
      writes.push(value);
      region.textContent = value;
    },
  };
  return { live: createLiveWriter(watched), region, writes };
}

describe("the live-region writer (design 4.4)", () => {
  it("writes nothing when nothing was said", () => {
    const { live, writes } = setup();
    live.frame();
    live.frame();
    expect(writes).toEqual([]);
  });
  it("writes a message in the frame after it was requested, once", () => {
    const { live, region, writes } = setup();
    live.say("The wick catches.");
    expect(region.textContent).toBe("");
    live.frame();
    expect(region.textContent).toBe("The wick catches.");
    live.frame();
    expect(writes).toEqual(["The wick catches."]);
  });
  it("the last of two messages in one frame wins", () => {
    const { live, region } = setup();
    live.say("one");
    live.say("two");
    live.frame();
    expect(region.textContent).toBe("two");
  });
  it("repeats an identical message by clearing for one frame", () => {
    const { live, region, writes } = setup();
    live.say("12 minutes left.");
    live.frame();
    live.say("12 minutes left.");
    live.frame();
    expect(region.textContent).toBe("");
    live.frame();
    expect(region.textContent).toBe("12 minutes left.");
    expect(writes).toEqual(["12 minutes left.", "", "12 minutes left."]);
  });
  it("does not clear for a different message", () => {
    const { live, writes } = setup();
    live.say("a");
    live.frame();
    live.say("b");
    live.frame();
    expect(writes).toEqual(["a", "b"]);
  });
});
