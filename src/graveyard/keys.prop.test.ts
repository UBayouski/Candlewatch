// Properties 14 and 22: the Room map and the graveyard map never clash, and the Door key obeys the phase
// (ghosts-and-graveyard R3.3, R6.15, R6.16, R6.17; design 3.8).
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { FocusKind, KeyDescriptor } from "../ui/keys";
import { keyAction } from "../ui/keys";
import type { GroupId } from "./focus";
import { graveKeyAction } from "./keys";
import type { GraveKeyAction, GraveKeyContext } from "./keys";
import { PROP_PARAMS, arbGraveKey, arbPhase } from "./test-kit";
import { doorUsable } from "./view";

const plain = (key: string): KeyDescriptor => ({ key, ctrl: false, alt: false, meta: false, shift: false, repeat: false });

/** Plain presses of the keys that can act, weighted so every branch of the map is reached often. */
const arbActingKey: fc.Arbitrary<KeyDescriptor> = fc.oneof(
  { weight: 8, arbitrary: fc.constantFrom("g", "G").map(plain) },
  { weight: 8, arbitrary: fc.constant(plain("Enter")) },
  { weight: 8, arbitrary: fc.constant(plain("Escape")) },
  { weight: 12, arbitrary: fc.constantFrom("ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End").map(plain) },
  { weight: 1, arbitrary: fc.constantFrom(" ", "t", "T").map(plain) },
);
const arbKey: fc.Arbitrary<KeyDescriptor> = fc.oneof({ weight: 9, arbitrary: arbActingKey }, { weight: 1, arbitrary: arbGraveKey });

const arbFocus: fc.Arbitrary<FocusKind> = fc.oneof(
  { weight: 3, arbitrary: fc.constant<FocusKind>("body") },
  { weight: 1, arbitrary: fc.constantFrom<FocusKind>("text", "button", "other") },
);
const arbOverlay = fc.oneof(
  { weight: 20, arbitrary: fc.constant<"none" | "snuff" | "settings">("none") },
  { weight: 1, arbitrary: fc.constantFrom<"none" | "snuff" | "settings">("snuff", "settings") },
);
const arbOnItem: fc.Arbitrary<GroupId | null> = fc.oneof(
  { weight: 1, arbitrary: fc.constant<GroupId | null>(null) },
  { weight: 3, arbitrary: fc.constantFrom<GroupId | null>("graveyard", "shelf") },
);

const arbContext: fc.Arbitrary<GraveKeyContext> = fc.record({
  view: fc.constantFrom<"room" | "graveyard">("room", "graveyard"),
  phase: arbPhase,
  overlay: arbOverlay,
  focus: arbFocus,
  cardShown: fc.oneof({ weight: 3, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
  onItem: arbOnItem,
});
const arbRoomContext: fc.Arbitrary<GraveKeyContext> = arbContext.map((c) => ({ ...c, view: "room" }));

const NAV_LIKE = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Escape"];

describe("Feature: ghosts-and-graveyard, Property 14: The key maps never clash and the Door key obeys the phase", () => {
  it("in the Room, whenever the graveyard map acts the Room map does not (R6.15)", () => {
    fc.assert(
      fc.property(arbRoomContext, arbKey, (context, key) => {
        if (graveKeyAction(context, key) === null) return;
        expect(keyAction({ phase: context.phase, overlay: context.overlay, focus: context.focus, view: "room" }, key)).toBeNull();
      }),
      PROP_PARAMS,
    );
  });

  it("g opens only with a usable Door, leaves only in the graveyard, and does nothing with a text field, an overlay, a modifier or a repeat (R3.3, R6.16)", () => {
    fc.assert(
      fc.property(arbContext, arbKey, (context, key) => {
        const action = graveKeyAction(context, key);
        const isG = key.key === "g" || key.key === "G";
        if (action?.type === "open") {
          expect(isG && context.view === "room" && doorUsable(context.phase)).toBe(true);
        }
        if (action?.type === "leave" && isG) expect(context.view).toBe("graveyard");
        if (isG) {
          const blocked = context.focus === "text" || context.overlay !== "none" || key.ctrl || key.alt || key.meta || key.repeat;
          if (blocked) expect(action).toBeNull();
          else if (context.view === "graveyard") expect(action).toEqual({ type: "leave" });
          else expect(action).toEqual(doorUsable(context.phase) ? { type: "open" } : null);
        }
      }),
      PROP_PARAMS,
    );
  });

  it("in the Room, arrow keys, Home, End and Escape give no graveyard action (R6.17)", () => {
    fc.assert(
      fc.property(arbRoomContext, arbKey, (context, key) => {
        fc.pre(NAV_LIKE.includes(key.key));
        expect(graveKeyAction(context, key)).toBeNull();
      }),
      PROP_PARAMS,
    );
  });

  it("covers every action, and every phase, in 300 runs", () => {
    const runs = fc.sample(fc.tuple(arbContext, arbKey), { numRuns: 300, seed: 14 });
    const seen = new Map<string, number>();
    const phases = new Set<string>();
    for (const [context, key] of runs) {
      const action: GraveKeyAction | null = graveKeyAction(context, key);
      const name = action === null ? "null" : action.type;
      seen.set(name, (seen.get(name) ?? 0) + 1);
      phases.add(context.phase);
    }
    for (const name of ["open", "leave", "hide-card", "show-card", "nav", "null"]) {
      expect(seen.get(name) ?? 0, name).toBeGreaterThanOrEqual(20);
    }
    expect(phases.size).toBe(5);
  });
});

// --- Property 22 ---------------------------------------------------------------------------------------------------------
const ROOM_KEY_FAMILIES: Record<string, readonly string[]> = {
  enter: ["Enter"],
  space: [" "],
  escape: ["Escape"],
  announce: ["t", "T"],
  arrows: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"],
  digits: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
};
// One family at a time, so each family is reached equally often whatever its size.
const arbRoomKey: fc.Arbitrary<KeyDescriptor> = fc
  .constantFrom(...Object.values(ROOM_KEY_FAMILIES))
  .chain((keys) => fc.constantFrom(...keys))
  .map(plain);
/** Every room action's key, plain or from the shared generator (modifiers, repeats, letters). */
const arbAnyKey: fc.Arbitrary<KeyDescriptor> = fc.oneof({ weight: 3, arbitrary: arbRoomKey }, { weight: 1, arbitrary: arbGraveKey });

const arbGraveyardContext: fc.Arbitrary<GraveKeyContext> = arbContext.map((c) => ({ ...c, view: "graveyard" }));
const arbGraveyardNoOverlay: fc.Arbitrary<GraveKeyContext> = arbGraveyardContext.map((c) => ({ ...c, overlay: "none" }));
const arbOnItemContext: fc.Arbitrary<GraveKeyContext> = fc
  .tuple(arbGraveyardNoOverlay, fc.constantFrom<GroupId>("graveyard", "shelf"))
  .map(([c, onItem]) => ({ ...c, onItem }));
const arbOffItemContext: fc.Arbitrary<GraveKeyContext> = arbGraveyardNoOverlay.map((c) => ({ ...c, onItem: null }));

const asKeyContext = (c: GraveKeyContext, overlay: GraveKeyContext["overlay"]): Parameters<typeof keyAction>[0] => ({
  phase: c.phase,
  overlay,
  focus: c.focus,
  view: "graveyard",
});

describe("Feature: ghosts-and-graveyard, Property 22: The graveyard view never triggers a room action", () => {
  it("with no overlay open, the Room map answers null for every key in the graveyard view (R6.16)", () => {
    fc.assert(
      fc.property(arbGraveyardNoOverlay, arbAnyKey, (context, key) => {
        expect(keyAction(asKeyContext(context, "none"), key)).toBeNull();
      }),
      PROP_PARAMS,
    );
  });

  it("with the snuff dialog open, the Room map answers null; with the settings overlay open only a plain Escape closes it", () => {
    fc.assert(
      fc.property(arbGraveyardContext, arbAnyKey, (context, key) => {
        expect(keyAction(asKeyContext(context, "snuff"), key)).toBeNull();
        const action = keyAction(asKeyContext(context, "settings"), key);
        const closes = key.key === "Escape" && !key.ctrl && !key.alt && !key.meta && !key.repeat;
        expect(action).toEqual(closes ? { type: "close-settings" } : null);
      }),
      PROP_PARAMS,
    );
  });

  it("Enter on an item shows its card and nothing else; Enter elsewhere in the view does nothing (R3.13, R6.17)", () => {
    fc.assert(
      fc.property(arbOnItemContext, arbOffItemContext, (onItem, offItem) => {
        expect(graveKeyAction(onItem, plain("Enter"))).toEqual({ type: "show-card" });
        expect(graveKeyAction(offItem, plain("Enter"))).toBeNull();
      }),
      PROP_PARAMS,
    );
  });

  it("generates every room key family, in every phase, in the graveyard view often (20 of 300 runs each)", () => {
    const runs = fc.sample(fc.tuple(arbGraveyardNoOverlay, arbAnyKey), { numRuns: 300, seed: 22 });
    for (const [family, keys] of Object.entries(ROOM_KEY_FAMILIES)) {
      const count = runs.filter(([context, key]) => context.view === "graveyard" && keys.includes(key.key)).length;
      expect(count, family).toBeGreaterThanOrEqual(20);
    }
    expect(new Set(runs.map(([context]) => context.phase)).size).toBe(5);
  });
});
