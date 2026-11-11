// ghosts-and-graveyard R6.2 to R6.12, R6.18, R8.13 (design 3.5): roving focus.
import { describe, expect, it } from "vitest";
import { NO_MEMORY, navigate, remember, tabStops } from "./focus";
import type { NavLayout } from "./focus";

// Three Stones; a Shelf of three days: 3 stubs (newest day), 1 stub, 2 stubs.
const layout: NavLayout = { graveyard: ["s1", "s2", "s3"], shelf: [["a1", "a2", "a3"], ["b1"], ["c1", "c2"]] };
const empty: NavLayout = { graveyard: [], shelf: [] };

describe("tabStops (R6.2 to R6.6, R6.18)", () => {
  it("is the first id of each Group when nothing is remembered", () => {
    expect(tabStops(layout, NO_MEMORY)).toEqual({ graveyard: "s1", shelf: "a1" });
  });

  it("is the remembered id when it is still drawn", () => {
    expect(tabStops(layout, { graveyard: "s3", shelf: "c2" })).toEqual({ graveyard: "s3", shelf: "c2" });
  });

  it("falls back to the first id when the remembered id is no longer drawn", () => {
    expect(tabStops(layout, { graveyard: "gone", shelf: "also-gone" })).toEqual({ graveyard: "s1", shelf: "a1" });
  });

  it("has no stop in an empty Group", () => {
    expect(tabStops(empty, NO_MEMORY)).toEqual({ graveyard: null, shelf: null });
    expect(tabStops({ graveyard: ["s1"], shelf: [] }, { graveyard: null, shelf: "x" })).toEqual({ graveyard: "s1", shelf: null });
    expect(tabStops({ graveyard: [], shelf: [[], []] }, NO_MEMORY).shelf).toBeNull();
  });

  it("does not take a remembered id from the other Group", () => {
    expect(tabStops(layout, { graveyard: "a1", shelf: "s1" })).toEqual({ graveyard: "s1", shelf: "a1" });
  });
});

describe("remember", () => {
  it("records the id for its Group only, without changing the other", () => {
    const m = remember(NO_MEMORY, "shelf", "b1");
    expect(m).toEqual({ graveyard: null, shelf: "b1" });
    expect(remember(m, "graveyard", "s2")).toEqual({ graveyard: "s2", shelf: "b1" });
    expect(NO_MEMORY).toEqual({ graveyard: null, shelf: null });
  });
});

describe("navigate on the Graveyard", () => {
  it("steps Left and Right through the Stones", () => {
    expect(navigate(layout, "graveyard", "s2", "ArrowRight")).toBe("s3");
    expect(navigate(layout, "graveyard", "s2", "ArrowLeft")).toBe("s1");
  });

  it("does not wrap: Left on the first and Right on the last stay", () => {
    expect(navigate(layout, "graveyard", "s1", "ArrowLeft")).toBe("s1");
    expect(navigate(layout, "graveyard", "s3", "ArrowRight")).toBe("s3");
  });

  it("goes to the first and last Stone with Home and End", () => {
    expect(navigate(layout, "graveyard", "s2", "Home")).toBe("s1");
    expect(navigate(layout, "graveyard", "s2", "End")).toBe("s3");
  });

  it("returns the current Stone for Up and Down", () => {
    expect(navigate(layout, "graveyard", "s2", "ArrowUp")).toBe("s2");
    expect(navigate(layout, "graveyard", "s2", "ArrowDown")).toBe("s2");
  });
});

describe("navigate on the Shelf", () => {
  it("steps Left and Right through the flattened order, across days", () => {
    expect(navigate(layout, "shelf", "a3", "ArrowRight")).toBe("b1");
    expect(navigate(layout, "shelf", "b1", "ArrowRight")).toBe("c1");
    expect(navigate(layout, "shelf", "c1", "ArrowLeft")).toBe("b1");
  });

  it("does not wrap at either end", () => {
    expect(navigate(layout, "shelf", "a1", "ArrowLeft")).toBe("a1");
    expect(navigate(layout, "shelf", "c2", "ArrowRight")).toBe("c2");
  });

  it("goes to the first and last Stub with Home and End", () => {
    expect(navigate(layout, "shelf", "b1", "Home")).toBe("a1");
    expect(navigate(layout, "shelf", "b1", "End")).toBe("c2");
  });

  it("goes Up to the newer day and Down to the older day, in the same column", () => {
    expect(navigate(layout, "shelf", "c2", "ArrowUp")).toBe("b1"); // column 1 clamped onto a row of one
    expect(navigate(layout, "shelf", "b1", "ArrowUp")).toBe("a1");
    expect(navigate(layout, "shelf", "a2", "ArrowDown")).toBe("b1"); // column 1 clamped onto a shorter row
    expect(navigate(layout, "shelf", "b1", "ArrowDown")).toBe("c1");
    expect(navigate(layout, "shelf", "a2", "ArrowUp")).toBe("a2");
  });

  it("clamps the column onto a shorter row and keeps it on a longer one", () => {
    expect(navigate(layout, "shelf", "a3", "ArrowDown")).toBe("b1");
    expect(navigate(layout, "shelf", "c2", "ArrowUp")).toBe("b1");
    expect(navigate(layout, "shelf", "c1", "ArrowUp")).toBe("b1");
    const wide: NavLayout = { graveyard: [], shelf: [["x1", "x2", "x3", "x4"], ["y1", "y2"], ["z1", "z2", "z3"]] };
    expect(navigate(wide, "shelf", "x4", "ArrowDown")).toBe("y2");
    expect(navigate(wide, "shelf", "y2", "ArrowDown")).toBe("z2");
    expect(navigate(wide, "shelf", "y2", "ArrowUp")).toBe("x2");
  });

  it("stays on the newest day with Up and on the oldest day with Down", () => {
    expect(navigate(layout, "shelf", "a3", "ArrowUp")).toBe("a3");
    expect(navigate(layout, "shelf", "c2", "ArrowDown")).toBe("c2");
  });
});

describe("navigate on odd input", () => {
  it("returns the Group's first id for an unknown current id, and stays in the Group", () => {
    expect(navigate(layout, "graveyard", "nope", "ArrowRight")).toBe("s1");
    expect(navigate(layout, "shelf", "s1", "End")).toBe("a1"); // a Stone id is not a Stub id
  });

  it("returns the current id when the Group is empty", () => {
    expect(navigate(empty, "graveyard", "x", "Home")).toBe("x");
    expect(navigate(empty, "shelf", "x", "ArrowDown")).toBe("x");
  });

  it("works on a Shelf with a day that holds no id", () => {
    const odd: NavLayout = { graveyard: [], shelf: [["a1"], [], ["c1"]] };
    expect(navigate(odd, "shelf", "a1", "ArrowDown")).toBe("a1");
    expect(navigate(odd, "shelf", "c1", "ArrowUp")).toBe("c1");
    expect(navigate(odd, "shelf", "a1", "ArrowRight")).toBe("c1");
  });
});
