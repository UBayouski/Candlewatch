import { describe, expect, it } from "vitest";
import type { State } from "../engine";
import { keyAction } from "../ui/keys";
import type { FocusKind, KeyContext, KeyDescriptor } from "../ui/keys";
import type { GroupId, NavKey } from "./focus";
import { graveKeyAction } from "./keys";
import type { GraveKeyContext } from "./keys";
import { doorUsable } from "./view";
import type { View } from "./view";

type Phase = State["phase"];
type Overlay = GraveKeyContext["overlay"];
const PHASES: readonly Phase[] = ["idle", "lit", "paused", "burned-out", "snuffed"];
const FOCUS: readonly FocusKind[] = ["body", "text", "button", "other"];
const OVERLAYS: readonly Overlay[] = ["none", "snuff", "settings"];
const GROUPS: readonly GroupId[] = ["graveyard", "shelf"];
const NAV: readonly NavKey[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];

const press = (key: string, extra: Partial<KeyDescriptor> = {}): KeyDescriptor => ({
  key,
  ctrl: false,
  alt: false,
  meta: false,
  shift: false,
  repeat: false,
  ...extra,
});
const ctx = (view: View, extra: Partial<GraveKeyContext> = {}): GraveKeyContext => ({
  view,
  phase: "idle",
  overlay: "none",
  focus: "body",
  cardShown: false,
  onItem: null,
  ...extra,
});

describe("g is the Door's key (D7, R3.3, R6.15)", () => {
  it("opens the graveyard from the Room exactly when the Door is usable, in every phase and focus kind but a text field", () => {
    for (const phase of PHASES) {
      for (const focus of FOCUS) {
        const expected = focus !== "text" && doorUsable(phase) ? { type: "open" } : null;
        expect(graveKeyAction(ctx("room", { phase, focus }), press("g")), `${phase} ${focus}`).toEqual(expected);
      }
    }
  });

  it("opens only when no candle burns", () => {
    for (const phase of ["idle", "burned-out", "snuffed"] as const) {
      expect(graveKeyAction(ctx("room", { phase }), press("g"))).toEqual({ type: "open" });
    }
    for (const phase of ["lit", "paused"] as const) expect(graveKeyAction(ctx("room", { phase }), press("g"))).toBeNull();
  });

  it("leaves the graveyard in every phase, except with a text field focused", () => {
    for (const phase of PHASES) {
      for (const focus of FOCUS) {
        const expected = focus === "text" ? null : { type: "leave" };
        expect(graveKeyAction(ctx("graveyard", { phase, focus }), press("g")), `${phase} ${focus}`).toEqual(expected);
      }
    }
  });

  it("leaves from an item too, with the card shown or not", () => {
    for (const onItem of GROUPS) {
      for (const cardShown of [true, false]) {
        expect(graveKeyAction(ctx("graveyard", { onItem, cardShown }), press("g"))).toEqual({ type: "leave" });
      }
    }
  });

  it("takes G as well, as the Room map takes T", () => {
    expect(graveKeyAction(ctx("room"), press("G", { shift: true }))).toEqual({ type: "open" });
    expect(graveKeyAction(ctx("graveyard"), press("G", { shift: true }))).toEqual({ type: "leave" });
    expect(keyAction({ phase: "lit", overlay: "none", focus: "body", view: "room" }, press("T", { shift: true }))).toEqual({ type: "announce-time" });
  });
});

describe("Escape (R6.13, R6.14)", () => {
  it("hides a shown card, else leaves, in every phase and focus kind", () => {
    for (const phase of PHASES) {
      for (const focus of FOCUS) {
        for (const onItem of [null, ...GROUPS]) {
          expect(graveKeyAction(ctx("graveyard", { phase, focus, onItem, cardShown: true }), press("Escape"))).toEqual({ type: "hide-card" });
          expect(graveKeyAction(ctx("graveyard", { phase, focus, onItem, cardShown: false }), press("Escape"))).toEqual({ type: "leave" });
        }
      }
    }
  });

  it("is not claimed in the Room, so it keeps opening the snuff dialog", () => {
    for (const phase of PHASES) {
      for (const focus of FOCUS) {
        for (const cardShown of [true, false]) {
          expect(graveKeyAction(ctx("room", { phase, focus, cardShown }), press("Escape"))).toBeNull();
        }
      }
    }
  });
});

describe("arrows, Home and End (R6.7 to R6.12, R6.16)", () => {
  it("move the roving focus when an item has it, except Up and Down on a Stone", () => {
    for (const onItem of GROUPS) {
      for (const key of NAV) {
        const vertical = key === "ArrowUp" || key === "ArrowDown";
        const expected = onItem === "graveyard" && vertical ? null : { type: "nav", key };
        for (const cardShown of [true, false]) {
          expect(graveKeyAction(ctx("graveyard", { onItem, cardShown }), press(key)), `${onItem} ${key}`).toEqual(expected);
        }
      }
    }
  });

  it("give Up and Down on a Stub, where the Shelf has rows to move through", () => {
    expect(graveKeyAction(ctx("graveyard", { onItem: "shelf" }), press("ArrowUp"))).toEqual({ type: "nav", key: "ArrowUp" });
    expect(graveKeyAction(ctx("graveyard", { onItem: "shelf" }), press("ArrowDown"))).toEqual({ type: "nav", key: "ArrowDown" });
  });

  it("do nothing when no item has the focus", () => {
    for (const focus of FOCUS) for (const key of NAV) expect(graveKeyAction(ctx("graveyard", { focus }), press(key))).toBeNull();
  });

  it("are not claimed in the Room, so the length chooser keeps its arrows", () => {
    for (const phase of PHASES) {
      for (const focus of FOCUS) {
        for (const onItem of [null, ...GROUPS]) {
          for (const key of NAV) expect(graveKeyAction(ctx("room", { phase, focus, onItem }), press(key)), `${phase} ${focus} ${key}`).toBeNull();
        }
      }
    }
  });
});

describe("Enter (D13, R3.13, R6.17)", () => {
  it("shows the card of the focused item, in either Group, in every phase", () => {
    for (const phase of PHASES) {
      for (const onItem of GROUPS) {
        for (const cardShown of [true, false]) {
          expect(graveKeyAction(ctx("graveyard", { phase, onItem, cardShown }), press("Enter"))).toEqual({ type: "show-card" });
        }
      }
    }
  });

  it("does nothing elsewhere in the graveyard, so the return control keeps its native activation", () => {
    for (const phase of PHASES) {
      for (const focus of FOCUS) expect(graveKeyAction(ctx("graveyard", { phase, focus }), press("Enter"))).toBeNull();
    }
  });

  it("is not claimed in the Room", () => {
    for (const phase of PHASES) for (const onItem of [null, ...GROUPS]) expect(graveKeyAction(ctx("room", { phase, onItem }), press("Enter"))).toBeNull();
  });
});

describe("overlays", () => {
  it("an open overlay gives null for every key, in both views and every phase", () => {
    const keys = ["g", "G", "Escape", "Enter", " ", "t", "x", ...NAV];
    for (const overlay of OVERLAYS.filter((o) => o !== "none")) {
      for (const view of ["room", "graveyard"] as const) {
        for (const phase of PHASES) {
          for (const key of keys) {
            for (const onItem of [null, ...GROUPS]) {
              expect(graveKeyAction(ctx(view, { overlay, phase, onItem, cardShown: true }), press(key)), `${overlay} ${view} ${phase} ${key}`).toBeNull();
            }
          }
        }
      }
    }
  });
});

describe("held keys and modifiers", () => {
  const live: readonly [string, GraveKeyContext][] = [
    ["g in the Room", ctx("room")],
    ["g in the graveyard", ctx("graveyard")],
    ["Escape with a card", ctx("graveyard", { cardShown: true })],
    ["Escape without a card", ctx("graveyard")],
    ["Enter on a Stub", ctx("graveyard", { onItem: "shelf" })],
    ["arrow on a Stub", ctx("graveyard", { onItem: "shelf" })],
  ];
  const keyFor = (label: string): string => (label.startsWith("g ") ? "g" : label.startsWith("Escape") ? "Escape" : label.startsWith("Enter") ? "Enter" : "ArrowRight");

  it("the repeats of a held key do nothing", () => {
    for (const [label, context] of live) {
      expect(graveKeyAction(context, press(keyFor(label))), label).not.toBeNull();
      expect(graveKeyAction(context, press(keyFor(label), { repeat: true })), label).toBeNull();
    }
  });

  it("Ctrl, Alt and Meta do nothing, alone or together", () => {
    for (const [label, context] of live) {
      for (const mod of [{ ctrl: true }, { alt: true }, { meta: true }, { ctrl: true, alt: true, meta: true }]) {
        expect(graveKeyAction(context, press(keyFor(label), mod)), label).toBeNull();
      }
    }
  });

  it("Shift changes nothing", () => {
    for (const [label, context] of live) {
      expect(graveKeyAction(context, press(keyFor(label), { shift: true })), label).toEqual(graveKeyAction(context, press(keyFor(label))));
    }
  });
});

describe("other keys", () => {
  it("claim nothing in either view", () => {
    for (const view of ["room", "graveyard"] as const) {
      for (const onItem of [null, ...GROUPS]) {
        for (const key of [" ", "t", "T", "x", "Tab", "Backspace", "PageUp", "h"]) {
          expect(graveKeyAction(ctx(view, { onItem }), press(key)), `${view} ${key}`).toBeNull();
        }
      }
    }
  });
});

describe("the Room map and this map agree (R6.16, design 3.8)", () => {
  it("in the Room this map returns null for every key the Room map claims; g is the one key only this map claims", () => {
    const keys = ["Enter", " ", "Escape", "t", "T", "g", "G"];
    let roomClaims = 0;
    for (const phase of PHASES) {
      for (const focus of FOCUS) {
        for (const overlay of OVERLAYS) {
          for (const key of keys) {
            const room: KeyContext = { phase, overlay, focus, view: "room" };
            const claimed = keyAction(room, press(key)) !== null;
            if (claimed) {
              roomClaims += 1;
              expect(graveKeyAction(ctx("room", { phase, overlay, focus }), press(key)), `${phase} ${focus} ${overlay} ${key}`).toBeNull();
            }
          }
        }
      }
    }
    expect(roomClaims).toBeGreaterThan(0);
    for (const phase of PHASES) {
      for (const focus of FOCUS) {
        expect(keyAction({ phase, overlay: "none", focus, view: "room" }, press("g"))).toBeNull();
        expect(keyAction({ phase, overlay: "none", focus, view: "room" }, press("G"))).toBeNull();
      }
    }
  });
});
