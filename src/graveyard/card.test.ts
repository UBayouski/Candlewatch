// ghosts-and-graveyard R5.3 to R5.9, R5.14, R6.13, R6.14 (design 3.6): the Details_Card state machine.
import { describe, expect, it } from "vitest";
import { NO_CARD, cardStep } from "./card";
import type { CardInput, CardState } from "./card";

const run = (inputs: readonly CardInput[], from: CardState = NO_CARD): { state: CardState; handled: boolean[] } => {
  let state = from;
  const handled: boolean[] = [];
  for (const input of inputs) {
    const step = cardStep(state, input);
    state = step.state;
    handled.push(step.handled);
  }
  return { state, handled };
};

describe("keyboard focus (R5.3)", () => {
  it("shows the card of the focused item and remembers the focus", () => {
    expect(run([{ type: "focus", id: "a" }]).state).toEqual({ shown: "a", source: "focus", focused: "a" });
  });

  it("hides the card when focus leaves that item", () => {
    expect(run([{ type: "focus", id: "a" }, { type: "blur", id: "a" }]).state).toEqual(NO_CARD);
  });

  it("moves the card with the focus", () => {
    expect(run([{ type: "focus", id: "a" }, { type: "blur", id: "a" }, { type: "focus", id: "b" }]).state).toEqual({ shown: "b", source: "focus", focused: "b" });
  });

  it("ignores the blur of an item that is not the focused one", () => {
    const s = run([{ type: "focus", id: "a" }, { type: "blur", id: "zzz" }]).state;
    expect(s).toEqual({ shown: "a", source: "focus", focused: "a" });
  });
});

describe("the pointer (R5.4, R5.5)", () => {
  it("shows a card on hover without touching keyboard focus", () => {
    expect(run([{ type: "hover", id: "a" }]).state).toEqual({ shown: "a", source: "hover", focused: null });
    expect(run([{ type: "focus", id: "f" }, { type: "hover", id: "a" }]).state).toEqual({ shown: "a", source: "hover", focused: "f" });
  });

  it("hides a hover card when the pointer leaves", () => {
    expect(run([{ type: "hover", id: "a" }, { type: "unhover", id: "a" }]).state).toEqual(NO_CARD);
  });

  it("hover then focus: the focus card replaces the hover card", () => {
    expect(run([{ type: "hover", id: "a" }, { type: "focus", id: "b" }]).state).toEqual({ shown: "b", source: "focus", focused: "b" });
  });

  it("focus, then hover another item, then unhover: falls back to the focused item", () => {
    const s = run([{ type: "focus", id: "f" }, { type: "hover", id: "a" }, { type: "unhover", id: "a" }]).state;
    expect(s).toEqual({ shown: "f", source: "focus", focused: "f" });
  });

  it("ignores the unhover of an item whose card is not the hover card", () => {
    const s = run([{ type: "focus", id: "f" }, { type: "unhover", id: "a" }]).state;
    expect(s).toEqual({ shown: "f", source: "focus", focused: "f" });
    expect(run([{ type: "hover", id: "a" }, { type: "unhover", id: "b" }]).state.shown).toBe("a");
  });
});

describe("touch (R5.6 to R5.8)", () => {
  it("tap shows the card, and tapping the same item again hides it", () => {
    expect(run([{ type: "tap", id: "a" }]).state).toEqual({ shown: "a", source: "tap", focused: null });
    expect(run([{ type: "tap", id: "a" }, { type: "tap", id: "a" }]).state).toEqual(NO_CARD);
  });

  it("tap, then tap another item: the card moves", () => {
    expect(run([{ type: "tap", id: "a" }, { type: "tap", id: "b" }]).state).toEqual({ shown: "b", source: "tap", focused: null });
  });

  it("tap-away hides the card and keeps the focus", () => {
    expect(run([{ type: "tap", id: "a" }, { type: "tap-away" }]).state).toEqual(NO_CARD);
    expect(run([{ type: "focus", id: "f" }, { type: "tap", id: "a" }, { type: "tap-away" }]).state).toEqual({ shown: null, source: null, focused: "f" });
  });
});

describe("Escape (R5.14, R6.13, R6.14)", () => {
  it("hides a shown card and reports it handled, keeping the focus", () => {
    const s = cardStep({ shown: "a", source: "focus", focused: "a" }, { type: "escape" });
    expect(s).toEqual({ state: { shown: null, source: null, focused: "a" }, handled: true });
  });

  it("reports not handled when no card is shown, so the caller leaves the view: true, then false", () => {
    expect(run([{ type: "hover", id: "a" }, { type: "escape" }, { type: "escape" }]).handled).toEqual([false, true, false]);
  });
});

describe("clear", () => {
  it("forgets everything when the view closes or the items are rebuilt", () => {
    expect(run([{ type: "focus", id: "a" }, { type: "hover", id: "b" }, { type: "clear" }]).state).toEqual(NO_CARD);
  });
});

describe("the state", () => {
  it("is not changed in place", () => {
    const before = Object.freeze({ shown: "a", source: "tap" as const, focused: null });
    expect(() => cardStep(before, { type: "tap", id: "a" })).not.toThrow();
    expect(before).toEqual({ shown: "a", source: "tap", focused: null });
  });
});
