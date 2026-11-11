import { describe, expect, it } from "vitest";
import { createFakeDocument } from "./distraction/fake-document";
import { wireVisibility } from "./wiring";

function setup(initial: "visible" | "hidden" = "visible") {
  const doc = createFakeDocument(initial);
  const calls: string[] = [];
  let now = 1000;
  const stop = wireVisibility({
    target: doc,
    clock: () => now,
    dispatch: (event, at) => {
      calls.push(`${event.type}@${at}`);
    },
  });
  return { doc, calls, stop, tick: (to: number) => (now = to) };
}

describe("wireVisibility (R12)", () => {
  it("syncs once before it watches: a visible page sends show, a hidden page sends hide", () => {
    expect(setup("visible").calls).toEqual(["show@1000"]);
    expect(setup("hidden").calls).toEqual(["hide@1000"]);
  });

  it("then sends hide and show at the clock's time for every visibility change", () => {
    const { doc, calls, tick } = setup();
    tick(2000);
    doc.setVisibility("hidden");
    tick(9000);
    doc.setVisibility("visible");
    expect(calls).toEqual(["show@1000", "hide@2000", "show@9000"]);
  });

  it("starts listening only after the sync (one listener, registered once)", () => {
    const { doc } = setup();
    expect(doc.listenerCount()).toBe(1);
  });

  it("stops listening when asked", () => {
    const { doc, calls, stop } = setup();
    stop?.();
    doc.setVisibility("hidden");
    expect(calls).toEqual(["show@1000"]);
    expect(doc.listenerCount()).toBe(0);
  });

  it("does nothing, and does not fail, without a target", () => {
    const calls: string[] = [];
    expect(wireVisibility({ target: null, clock: () => 0, dispatch: () => void calls.push("x") })).toBeNull();
    expect(calls).toEqual([]);
  });
});
