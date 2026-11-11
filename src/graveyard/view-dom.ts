// The graveyard view and the Door (ghosts-and-graveyard design 4.2, 4.3, 5; R3 to R8). The DOM layer: it builds elements,
// applies a plan and turns DOM events into the inputs of the pure modules (card.ts, focus.ts, keys.ts, tap-guard.ts). It decides
// nothing itself, never calls the engine's dispatch and never reads a clock.
//
// ---------------------------------------------------------------------------------------------------------------------------
// HOW main.ts WIRES IT (task 16.1)
//
//   const graveyard = createGraveyard(graveRoot, { phase, overlay, onView });
//
//   hooks.phase():   the engine phase now, `() => state.phase`. Read at every key press for the Door's key `g` (R3.3).
//   hooks.overlay(): "none" | "snuff" | "settings", the interface's open overlay. With one open every graveyard key does nothing (R6).
//   hooks.onView(request): fires with "open" when the Door is clicked or `g` is pressed in the Room, and with "leave" when the
//                    return button is clicked, `g` is pressed in the view, or Escape is pressed with no card shown. main.ts runs
//                    `viewStep(view, { type: request, phase: state.phase })`, keeps the new `view`, and when it changed:
//                    announces STRINGS.graveyard.announceOpen / announceLeave, calls `graveyard.apply(...)` with the new view
//                    (so the elements are shown), and THEN calls `focusFirst()` (focus "first-group") or `focusDoor()` (focus
//                    "door") in the same frame (CR3). The module never changes the view by itself.
//
//   graveyard.apply({ view, door: doorView(state.phase), history: state.history, dayKeyOf: localDayKey }) runs EVERY frame. It is
//   idempotent and cheap: it writes an attribute only when it changed and rebuilds the items only when the view becomes the
//   graveyard, `history` (by identity) or `dayKeyOf` changes. Pass the same `dayKeyOf` function each frame. The viewport is read
//   from the window (design 4.3: `--u` follows `stageBox`) unless `viewport` is given.
//
//   The card state, the focus memory, the roving tabindex and the tap/focus rule live inside this module. When `apply` receives
//   `view: "room"` after the graveyard it clears the card, so main.ts has nothing to clear.
//
//   Append `graveRoot` after the scene and ghost roots and before the interface root: the Tab order is then the Door (Room) or the
//   Graveyard group, the Shelf group and the return button (view), and then the interface's controls (R6.1).
// ---------------------------------------------------------------------------------------------------------------------------
//
// User text (the intent) reaches the page only through textContent and setAttribute of non-style attributes. Positions are custom
// properties set with style.setProperty (--x, --y in room units; --u, --ox, --oy on the section): no style attribute, no inline CSS.
import type { HistoryEntry, State } from "../engine";
import { STRINGS } from "../strings";
import { stageBox } from "../ui/layout";
import type { KeyDescriptor } from "../ui/keys";
import { cardStep, NO_CARD } from "./card";
import type { CardInput, CardState } from "./card";
import type { DayKeyFn } from "./days";
import { navigate, NO_MEMORY, remember, tabStops } from "./focus";
import type { FocusMemory, GroupId } from "./focus";
import { COUNT_LINE_Y, DOOR_RECT, EMPTY_LINE_Y, LABEL_Y, PANEL_FADE, PANEL_RECT, placeCard } from "./geometry";
import type { Rect } from "./geometry";
import { graveKeyAction } from "./keys";
import type { GraveKeyContext } from "./keys";
import { planView } from "./plan";
import type { PlacedItem, ViewPlan } from "./plan";
import { guardClick, guardDown, guardFocus, guardReset, NO_GESTURE } from "./tap-guard";
import type { TapGuard } from "./tap-guard";
import { DEFAULT_LIMITS, visibleHistory } from "./visible";
import type { DoorView, View } from "./view";

export interface GraveyardHooks {
  /** The engine phase now. */
  readonly phase: () => State["phase"];
  /** The interface's open overlay. */
  readonly overlay: () => GraveKeyContext["overlay"];
  /** The Door or a key asks to open the view, or to leave it. The caller runs `viewStep`. */
  readonly onView: (request: "open" | "leave") => void;
}

export interface GraveyardInput {
  readonly view: View;
  readonly door: DoorView;
  readonly history: readonly HistoryEntry[];
  readonly dayKeyOf: DayKeyFn;
  /** The viewport in CSS px; read from the window when absent. */
  readonly viewport?: { readonly w: number; readonly h: number };
}

export interface Graveyard {
  apply(input: GraveyardInput): void;
  /** Focuses the Graveyard's Remembered_Item, else the Shelf's, else the return button (CR3). Call after `apply` with the view. */
  focusFirst(): void;
  /** Focuses the Door button (CR3). Call after `apply` with the Room. */
  focusDoor(): void;
}

// The backdrop: the opaque core and its fading margin above and to the sides (D18).
const BACKDROP_RECT: Rect = { x: PANEL_RECT.x - PANEL_FADE, y: PANEL_RECT.y - PANEL_FADE, w: PANEL_RECT.w + 2 * PANEL_FADE, h: PANEL_RECT.h + PANEL_FADE };
const LINE = { x: 20, w: 560, h: 22 } as const;

const IDS = {
  section: "graveyard",
  title: "graveyard-title",
  door: "door",
  back: "graveyard-back",
  stones: "graveyard-stones",
  shelf: "graveyard-shelf",
  stonesCount: "graveyard-stones-count",
  shelfCount: "graveyard-shelf-count",
  card: "graveyard-card",
} as const;

const SVG_NS = "http://www.w3.org/2000/svg";

interface ItemRef {
  readonly el: HTMLButtonElement;
  readonly id: string;
  readonly group: GroupId;
  readonly rect: Rect;
  readonly lines: readonly string[];
}

function make<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, attrs: Readonly<Record<string, string>> = {}, text?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Puts an element at a rectangle of room units through custom properties (CSS multiplies them by --u). */
function place(el: HTMLElement, r: Rect, withSize = false): void {
  el.style.setProperty("--x", String(r.x));
  el.style.setProperty("--y", String(r.y));
  if (withSize) {
    el.style.setProperty("--w", String(r.w));
    el.style.setProperty("--h", String(r.h));
  }
}

const setHidden = (el: HTMLElement, hidden: boolean): void => {
  if (el.hidden !== hidden) el.hidden = hidden;
};

const setAttr = (el: Element, name: string, value: string): void => {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
};

/** What has the focus, as far as keys care (same classes as the interface's focusKindOf). */
function focusKindOf(el: Element | null): GraveKeyContext["focus"] {
  if (el === null || el === el.ownerDocument.body) return "body";
  if (el instanceof HTMLTextAreaElement) return "text";
  if (el instanceof HTMLInputElement) return el.type === "text" || el.type === "search" || el.type === "" ? "text" : "button";
  if (el instanceof HTMLButtonElement || el instanceof HTMLSelectElement || (el instanceof HTMLAnchorElement && el.hasAttribute("href"))) return "button";
  return "other";
}

export function createGraveyard(root: HTMLElement, hooks: GraveyardHooks): Graveyard {
  const doc = root.ownerDocument;

  // --- built once: the section, the Door, the shut door, the view and the return button ---
  const section = make(doc, "section", { id: IDS.section, class: "graveyard", "data-view": "room" });
  const shutDoor = make(doc, "span", { class: "door door-shut", "aria-hidden": "true" });
  const doorButton = make(doc, "button", { id: IDS.door, type: "button", class: "door", "aria-label": STRINGS.graveyard.door });
  place(shutDoor, DOOR_RECT);
  place(doorButton, DOOR_RECT);

  // The wrapper has no box of its own: its children sit at room units relative to the section (L6).
  const wrapper = make(doc, "div", { class: "view" });
  const panel = make(doc, "div", { class: "panel", "aria-hidden": "true" });
  place(panel, BACKDROP_RECT, true);
  // The view's heading names it for a screen reader (R7.9) and is not seen: the visible "Graveyard" label would repeat it (D19).
  const title = make(doc, "h2", { id: IDS.title, class: "title" }, STRINGS.graveyard.title);

  const stonesGroup = make(doc, "div", { id: IDS.stones, class: "group stones", role: "group", "aria-label": STRINGS.graveyard.graveyardLabel });
  const shelfGroup = make(doc, "div", { id: IDS.shelf, class: "group shelf", role: "group", "aria-label": STRINGS.graveyard.shelfLabel });
  const stonesLabel = make(doc, "p", { class: "label", "aria-hidden": "true" }, STRINGS.graveyard.graveyardLabel);
  const shelfLabel = make(doc, "p", { class: "label", "aria-hidden": "true" }, STRINGS.graveyard.shelfLabel);
  place(stonesLabel, { ...LINE, y: LABEL_Y.stones });
  place(shelfLabel, { ...LINE, y: LABEL_Y.shelf });

  const card = make(doc, "div", { id: IDS.card, class: "card", "aria-hidden": "true" });
  card.hidden = true;

  const back = make(doc, "button", { id: IDS.back, type: "button", class: "back", "aria-label": STRINGS.graveyard.back });
  place(back, DOOR_RECT);
  const arrow = doc.createElementNS(SVG_NS, "svg");
  arrow.setAttribute("viewBox", "0 0 24 24");
  arrow.setAttribute("aria-hidden", "true");
  arrow.setAttribute("focusable", "false");
  arrow.setAttribute("class", "back-icon");
  const arrowShape = doc.createElementNS(SVG_NS, "path");
  arrowShape.setAttribute("d", "M15 4 L7 12 L15 20");
  arrow.append(arrowShape);
  back.append(arrow);

  wrapper.append(panel, title, stonesGroup, shelfGroup, card);
  section.append(shutDoor, doorButton, wrapper, back);
  root.append(section);
  wrapper.hidden = true;
  back.hidden = true;
  shutDoor.hidden = true;
  doorButton.hidden = true;

  // --- state ---
  let view: View = "room";
  let cardState: CardState = NO_CARD;
  let memory: FocusMemory = NO_MEMORY;
  let guard: TapGuard = NO_GESTURE;
  let plan: ViewPlan | null = null;
  let builtHistory: readonly HistoryEntry[] | null = null;
  let builtDayKeyOf: DayKeyFn | null = null;
  let cardShownId: string | null = null;
  /** CSS px per room unit, from the last `apply` (the card is measured in px and placed in units). */
  let scale = 1;
  const items = new Map<string, ItemRef>();
  const written = new Map<string, string>();

  const writeVar = (name: string, value: string): void => {
    if (written.get(name) === value) return;
    written.set(name, value);
    section.style.setProperty(name, value);
  };

  // --- items and the card ---
  const refOf = (target: EventTarget | null): ItemRef | null => {
    const el = target instanceof Element ? target.closest("button.item") : null;
    if (el === null) return null;
    const ref = items.get(el.id);
    return ref !== undefined && ref.el === el ? ref : null;
  };

  const renderCard = (): void => {
    const id = cardState.shown;
    const ref = id === null ? undefined : items.get(id);
    if (id === null || ref === undefined) {
      cardShownId = null;
      setHidden(card, true);
      return;
    }
    if (cardShownId !== id) {
      cardShownId = id;
      card.replaceChildren(...ref.lines.map((line) => make(doc, "span", { class: "card-line" }, line)));
      setHidden(card, false);
      // The card is sized by its content (D16): measure it, in units, and place it beside its item, off the other Group's label
      // when one side allows.
      const box = card.getBoundingClientRect();
      const size = { w: box.width / scale, h: box.height / scale };
      const avoid: Rect = { ...LINE, y: ref.group === "graveyard" ? LABEL_Y.shelf : LABEL_Y.stones };
      place(card, placeCard(ref.rect, size, avoid));
    }
    setHidden(card, false);
  };

  const stepCard = (input: CardInput): boolean => {
    const result = cardStep(cardState, input);
    cardState = result.state;
    renderCard();
    return result.handled;
  };

  /** Roving tabindex: "0" for the one stop of each Group, "-1" for the rest (R6.2 to R6.6). */
  const applyTabStops = (): void => {
    if (plan === null) return;
    const stops = tabStops(plan.layout, memory);
    for (const ref of items.values()) setAttr(ref.el, "tabindex", stops[ref.group] === ref.id ? "0" : "-1");
  };

  const buildItem = (placedItem: PlacedItem, group: GroupId, cls: string): { button: HTMLButtonElement; desc: HTMLElement } => {
    const descId = `${placedItem.id}-desc`;
    const button = make(doc, "button", {
      id: placedItem.id,
      type: "button",
      class: `item ${cls}`,
      "data-group": group,
      tabindex: "-1",
      "aria-label": placedItem.name,
      "aria-describedby": descId,
    });
    place(button, placedItem.rect);
    // The visually hidden description: the five card lines, present whether or not the card is shown (R7.3, R7.4).
    const desc = make(doc, "span", { id: descId, class: "desc" }, placedItem.lines.join(". "));
    button.addEventListener("pointerenter", (e: PointerEvent) => {
      if (e.pointerType === "mouse") stepCard({ type: "hover", id: placedItem.id });
    });
    button.addEventListener("pointerleave", (e: PointerEvent) => {
      if (e.pointerType === "mouse") stepCard({ type: "unhover", id: placedItem.id });
    });
    items.set(placedItem.id, { el: button, id: placedItem.id, group, rect: placedItem.rect, lines: placedItem.lines });
    return { button, desc };
  };

  const line = (cls: string, text: string, r: Rect, id?: string): HTMLElement => {
    const p = make(doc, "p", id === undefined ? { class: cls } : { class: cls, id }, text);
    place(p, r);
    return p;
  };

  const rebuild = (next: ViewPlan): void => {
    plan = next;
    items.clear();
    cardState = NO_CARD;
    renderCard();

    const stoneNodes: HTMLElement[] = [stonesLabel];
    for (const stone of next.stones) {
      const { button, desc } = buildItem(stone, "graveyard", "stone");
      button.append(make(doc, "span", { class: "stone-date" }, stone.date), make(doc, "span", { class: "stone-intent" }, stone.intent));
      stoneNodes.push(button, desc);
    }
    if (next.stones.length === 0) stoneNodes.push(line("empty", STRINGS.graveyard.noStones, { ...LINE, y: EMPTY_LINE_Y.stones }));
    if (next.stonesCount !== null) stoneNodes.push(line("count", next.stonesCount, { ...LINE, y: COUNT_LINE_Y.stones }, IDS.stonesCount));
    stonesGroup.replaceChildren(...stoneNodes);
    if (next.stonesCount !== null) setAttr(stonesGroup, "aria-describedby", IDS.stonesCount);
    else stonesGroup.removeAttribute("aria-describedby");

    const shelfNodes: HTMLElement[] = [shelfLabel];
    for (const row of next.rows) {
      const day = make(doc, "div", { class: "day", "data-day": row.dayKey });
      day.append(line("day-label", row.label, row.labelRect));
      for (const stub of row.stubs) {
        const { button, desc } = buildItem(stub, "shelf", "stub");
        // A burned-down candle: a short wax body and its wick, standing on the day's shelf (D15). Shapes only; the name is the label.
        button.append(make(doc, "span", { class: "stub-wax" }), make(doc, "span", { class: "stub-wick" }));
        day.append(button, desc);
      }
      if (row.more !== null) day.append(line("more", row.more.text, row.more.rect));
      shelfNodes.push(day);
    }
    if (next.rows.length === 0) shelfNodes.push(line("empty", STRINGS.graveyard.noStubs, { ...LINE, y: EMPTY_LINE_Y.shelf }));
    if (next.daysCount !== null) shelfNodes.push(line("count", next.daysCount, { ...LINE, y: COUNT_LINE_Y.shelf }, IDS.shelfCount));
    shelfGroup.replaceChildren(...shelfNodes);
    if (next.daysCount !== null) setAttr(shelfGroup, "aria-describedby", IDS.shelfCount);
    else shelfGroup.removeAttribute("aria-describedby");

    applyTabStops();
  };

  // --- events (design 4.3) ---
  section.addEventListener("focusin", (e) => {
    const ref = refOf(e.target);
    if (ref === null) return;
    memory = remember(memory, ref.group, ref.id); // R6.18
    applyTabStops();
    const result = guardFocus(guard, ref.id);
    guard = result.guard;
    if (!result.drop) stepCard({ type: "focus", id: ref.id });
  });

  section.addEventListener("focusout", (e) => {
    const ref = refOf(e.target);
    if (ref !== null) stepCard({ type: "blur", id: ref.id });
  });

  section.addEventListener("click", (e) => {
    const ref = refOf(e.target);
    if (ref === null) return;
    const result = guardClick(guard, ref.id);
    guard = result.guard;
    if (result.tap) stepCard({ type: "tap", id: ref.id });
  });

  doorButton.addEventListener("click", () => hooks.onView("open"));
  back.addEventListener("click", () => hooks.onView("leave"));

  doc.addEventListener("pointerdown", (e: PointerEvent) => {
    if (view !== "graveyard") return;
    const result = guardDown(guard, e.pointerType, refOf(e.target)?.id ?? null);
    guard = result.guard;
    if (result.away) stepCard({ type: "tap-away" });
  });
  doc.addEventListener("pointercancel", () => {
    guard = guardReset();
  });

  doc.addEventListener("keydown", (e: KeyboardEvent) => {
    guard = guardReset(); // a key press ends any touch gesture, so a keyboard focus is never dropped
    if (e.isComposing) return;
    const active = doc.activeElement;
    const focused = refOf(active);
    const context: GraveKeyContext = {
      view,
      phase: hooks.phase(),
      overlay: hooks.overlay(),
      focus: focusKindOf(active),
      cardShown: cardState.shown !== null,
      onItem: focused === null ? null : focused.group,
    };
    const key: KeyDescriptor = { key: e.key, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey, shift: e.shiftKey, repeat: e.repeat };
    const action = graveKeyAction(context, key);
    if (action === null) return; // no action: the browser keeps the key
    e.preventDefault();
    switch (action.type) {
      case "open":
        hooks.onView("open");
        return;
      case "leave":
        hooks.onView("leave");
        return;
      case "hide-card":
        stepCard({ type: "escape" });
        return;
      case "show-card":
        if (focused !== null && cardState.shown !== focused.id) stepCard({ type: "focus", id: focused.id });
        return;
      case "nav": {
        if (plan === null || focused === null) return;
        const target = items.get(navigate(plan.layout, focused.group, focused.id, action.key));
        if (target !== undefined && target.id !== focused.id) target.el.focus();
        return;
      }
    }
  });

  return {
    apply(input) {
      const previous = view;
      view = input.view;

      const win = doc.defaultView;
      const vp = input.viewport ?? { w: win?.innerWidth ?? 600, h: win?.innerHeight ?? 1000 };
      const stage = stageBox(vp.w, vp.h);
      if (stage.scale !== scale) {
        scale = stage.scale;
        cardShownId = null; // a new scale: the next shown card is measured and placed again
      }
      writeVar("--u", `${stage.scale}px`);
      writeVar("--ox", `${stage.ox}px`);
      writeVar("--oy", `${stage.oy}px`);

      setAttr(section, "data-view", view);
      setHidden(shutDoor, !input.door.shut);
      setHidden(doorButton, !input.door.usable || view !== "room");

      if (view === "graveyard") {
        if (previous !== "graveyard" || builtHistory !== input.history || builtDayKeyOf !== input.dayKeyOf) {
          builtHistory = input.history;
          builtDayKeyOf = input.dayKeyOf;
          rebuild(planView(visibleHistory(input.history, { ...DEFAULT_LIMITS, dayKeyOf: input.dayKeyOf })));
        }
      } else if (previous === "graveyard") {
        cardState = NO_CARD;
        guard = NO_GESTURE;
        renderCard();
      }
      setHidden(wrapper, view !== "graveyard");
      setHidden(back, view !== "graveyard");
    },

    focusFirst() {
      const stops = plan === null ? null : tabStops(plan.layout, memory);
      const id = stops === null ? null : (stops.graveyard ?? stops.shelf);
      (id === null ? back : (items.get(id)?.el ?? back)).focus();
    },

    focusDoor() {
      doorButton.focus();
    },
  };
}
