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
import { cardMarker, cardStep, NO_CARD } from "./card";
import type { CardInput, CardState } from "./card";
import type { DayKeyFn } from "./days";
import { navigate, NO_MEMORY, remember, tabStops } from "./focus";
import type { FocusMemory, GroupId } from "./focus";
import { CARD_RIM_PX, COUNT_LINE_Y, DOOR_RECT, EMPTY_LINE_Y, LABEL_Y, shelfRowY, TEXT_LINE_H, placeCard } from "./geometry";
import type { Rect } from "./geometry";
import { graveKeyAction } from "./keys";
import type { GraveKeyContext } from "./keys";
import { planView } from "./plan";
import type { PlacedItem, ViewPlan } from "./plan";
import { guardCancel, guardClick, guardDown, guardFocus, guardReset, NO_GESTURE } from "./tap-guard";
import type { TapGuard } from "./tap-guard";
import { DEFAULT_LIMITS, visibleHistory } from "./visible";
import { dawnFor } from "./view";
import { DOORWAY, HAZE, HORIZON_Y, groundMarks, scatter, shelfBoard, stoneMound, stoneOutline, stoneShadow } from "./place";
import type { DoorView, View } from "./view";

const n=(v:number)=>String(Math.round(v*100)/100);
const HORIZON=HORIZON_Y,STAR_SEED=4417;
const hills = (base:number,amp:number,seed:number):string=>{
 let d=`M-2200 ${HORIZON+6}`;
 for(let x=-2200;x<=2800;x+=70)d+=` L${x} ${n(base-amp*(.5+.5*Math.sin(x*.0113+seed)*Math.cos(x*.0041+seed*2)+.25*Math.sin(x*.027+seed*3)))}`;
 return d+` L2800 ${HORIZON+6} Z`;
};
/** Builds only numeric SVG geometry; user text is always handled by the existing textContent calls. */
export function placeSvg(plan:ViewPlan,doc:Document):SVGSVGElement {
 const attrs=(el:Element,values:Readonly<Record<string,string|number>>)=>{for(const [key,value] of Object.entries(values))el.setAttribute(key,String(value));};
 const add=(parent:Element,tag:string,values:Readonly<Record<string,string|number>>={})=>{const el=doc.createElementNS(SVG_NS,tag);attrs(el,values);parent.append(el);return el;};
 const path=(parent:Element,cls:string,d:string)=>add(parent,"path",{class:cls,d});
 const rect=(parent:Element,cls:string,x:number,y:number,width:number,height:number,extra:Readonly<Record<string,string|number>>={})=>add(parent,"rect",{...(cls?{class:cls}:{}),x,y,width,height,...extra});
 const svg=doc.createElementNS(SVG_NS,"svg");attrs(svg,{class:"place",viewBox:"0 0 600 1000",preserveAspectRatio:"xMidYMid meet","aria-hidden":"true",focusable:"false"});
 const defs=add(svg,"defs");rect(add(defs,"clipPath",{id:"cw-place-clip"}),"",-2200,-600,5000,1500);
 const grad=(tag:string,id:string,values:Readonly<Record<string,string|number>>,stops:Readonly<Record<string,string|number>>[])=>{const g=add(defs,tag,{id,...values});for(const stop of stops)add(g,"stop",stop);};
 grad("linearGradient","cw-place-sky",{gradientUnits:"userSpaceOnUse",x1:0,y1:-600,x2:0,y2:HORIZON+HAZE},[{class:"ps-0",offset:0},{class:"ps-1",offset:.7},{class:"ps-2",offset:1}]);
 grad("linearGradient","cw-place-ground",{gradientUnits:"userSpaceOnUse",x1:0,y1:HORIZON,x2:0,y2:900},[{class:"pg-h",offset:0,"stop-opacity":0},{class:"pg-0",offset:HAZE/(900-HORIZON)},{class:"pg-1",offset:1}]);
 grad("linearGradient","cw-haze-ramp",{gradientUnits:"userSpaceOnUse",x1:0,y1:HORIZON,x2:0,y2:HORIZON+HAZE},[{offset:0,"stop-color":"#000"},{offset:1,"stop-color":"#fff"}]);
 grad("radialGradient","cw-doorway-hole",{},[{offset:0,"stop-color":"#000","stop-opacity":.95},{offset:.6,"stop-color":"#000","stop-opacity":.7},{offset:1,"stop-color":"#000","stop-opacity":0}]);
 const mask=add(defs,"mask",{id:"cw-place-mask",maskUnits:"userSpaceOnUse",x:-2200,y:HORIZON,width:5000,height:900-HORIZON});
 rect(mask,"",-2200,HORIZON,5000,HAZE,{fill:"url(#cw-haze-ramp)"});rect(mask,"",-2200,HORIZON+HAZE,5000,900-HORIZON-HAZE,{fill:"#fff"});
 add(mask,"circle",{class:"doorway",cx:DOORWAY.cx,cy:DOORWAY.cy,r:DOORWAY.r,fill:"url(#cw-doorway-hole)",transform:`translate(${DOORWAY.cx} ${DOORWAY.cy}) scale(${DOORWAY.sx} 1) translate(${-DOORWAY.cx} ${-DOORWAY.cy})`});
 const content=add(svg,"g",{"clip-path":"url(#cw-place-clip)"});rect(content,"p-sky",-2200,-600,5000,HORIZON+HAZE+600,{fill:"url(#cw-place-sky)"});
 const stars=add(content,"g",{class:"p-stars"});
 scatter(STAR_SEED,{x0:-1100,x1:1700,y0:-420,y1:HORIZON-40},30,70,[]).forEach(([x,y],i)=>add(stars,"circle",{cx:n(x),cy:n(y),r:i%3===0?1.1:.8}));
 path(content,"p-hill-far",hills(HORIZON-30,46,2.2));path(content,"p-hill-mid",hills(HORIZON-16,34,1.3));
 const tower=add(content,"g",{class:"p-tower"});path(tower,"",`M681 ${HORIZON} L688 ${HORIZON-122} H712 L719 ${HORIZON} Z`);
 rect(tower,"",683,HORIZON-130,34,8);rect(tower,"",691,HORIZON-154,18,24);path(tower,"",`M689 ${HORIZON-154} Q700 ${HORIZON-170} 711 ${HORIZON-154} Z`);rect(tower,"",699,HORIZON-176,2,8);
 path(content,"p-hill-near",hills(HORIZON-4,26,4.1));
 const setting=add(content,"g",{class:"p-setting"});rect(setting,"p-ground",-2200,HORIZON,5000,900-HORIZON,{fill:"url(#cw-place-ground)"});
 const line=(y:number):Rect=>({x:14,y,w:572,h:TEXT_LINE_H}),avoid:Rect[]=[line(LABEL_Y.stones),line(LABEL_Y.shelf)];
 if(plan.stonesCount!==null)avoid.push(line(COUNT_LINE_Y.stones));if(plan.daysCount!==null)avoid.push(line(COUNT_LINE_Y.shelf));
 if(!plan.stones.length)avoid.push(line(EMPTY_LINE_Y.stones));if(!plan.rows.length)avoid.push(line(EMPTY_LINE_Y.shelf));
 for(const r of plan.rows){avoid.push(r.labelRect);if(r.more)avoid.push(r.more.rect);}
 const {pebbles,blades}=groundMarks(7741,avoid);
 const slope = "M-850 470 C-460 476 -362 397 -117 381 C72 369 86 320 252 312 C475 283 563 301 751 375 S1090 443 1510 464 L1510 901 H-850 Z";
 path(setting,"e-pebble",slope + pebbles.map(([x,y])=>`M${n(x)} ${n(y)}h0`).join(""));
 path(setting,"e-blade",blades.map(([x,y],i)=>`M${n(x)} ${n(y)}l${i%2?1.4:-1.4} -6M${n(x+3.5)} ${n(y+.6)}l${i%3?-.8:1.2} -5`).join(""));
 for(const {face} of plan.stones){
  const r = face.rect;
  path(setting,"p-shadow",`M${stoneShadow(r).map(p=>p.map(n).join(" ")).join(" L")} Z`);
  const mound=stoneMound(r);path(setting,"p-mound",`M${mound[0]?.map(n).join(" ")} Q${mound.slice(1,3).map(p=>p.map(n).join(" ")).join(" ")} Q${mound.slice(3).map(p=>p.map(n).join(" ")).join(" ")} Z`);
  path(setting,"p-side",`M${stoneOutline(face).map(([x,y])=>`${n(r.x+x+2)} ${n(r.y+y)}`).join(" L")} Z`);
  const f=r.y+r.h;path(setting,"p-tuft",`M${r.x-12} ${f+3} q1 -5 -3 -10 M${r.x-6} ${f+4} l2 -9 M${r.x+2} ${f+2} l-2 -5 M${r.x+r.w-3} ${f+4} l-1 -7 M${r.x+r.w+4} ${f+4} q-1 -5 2 -10 M${r.x+r.w+10} ${f+3} l3 -7`);
 }
 plan.rows.forEach((row,i)=>{
  const y=shelfRowY(i),board=shelfBoard(y,row.stubs.length),x=board.x,w=board.w,g=add(setting,"g",{class:"p-board"});
  rect(g,"b-top",x,board.y,w,board.h,{rx:1.5});rect(g,"b-front",x,y+75,w,6,{rx:1});
  path(g,"b-grain",`M${x+8} ${y+72} H${n(x+w*.4)} M${n(x+w*.5)} ${y+74} H${x+w-8}`);
  rect(g,"b-iron",x+6,y+81,5,10);rect(g,"b-iron",x+w-11,y+81,5,10);
 });
 rect(content,"p-night",-2200,HORIZON,5000,900-HORIZON,{mask:"url(#cw-place-mask)"});return svg;
}

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

const LINE = { x: 20, w: 560, h: TEXT_LINE_H } as const;

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

  wrapper.append(title, stonesGroup, shelfGroup, card);
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
  /** The id of the item that carries the marker of the open card (D22), or null. */
  let markedId: string | null = null;
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

  /** The marker of the open card (D22): the ivory ring on the item the card describes, in every input mode; one item at most. */
  const renderMarker = (): void => {
    const next = cardMarker(cardState, new Set(items.keys()));
    if (next === markedId) return;
    if (markedId !== null) items.get(markedId)?.el.removeAttribute("data-card-open");
    if (next !== null) items.get(next)?.el.setAttribute("data-card-open", "");
    markedId = next;
  };

  const renderCard = (): void => {
    renderMarker();
    const id = cardState.shown;
    const ref = id === null ? undefined : items.get(id);
    if (id === null || ref === undefined) {
      cardShownId = null;
      setHidden(card, true);
      return;
    }
    if (cardShownId !== id) {
      cardShownId = id;
      card.toggleAttribute("data-stone", ref.group === "graveyard");
      card.replaceChildren(...ref.lines.map((line) => make(doc, "span", { class: "card-line" }, line)));
      setHidden(card, false);
      card.style.removeProperty("--h"); // measure the content, not the size a previous placement set
      card.style.removeProperty("--w");
      // The card is sized by its content (D16): measure it, in units, and place it beside its item, off the other Group's label
      // when one side allows.
      const box = card.getBoundingClientRect();
      const size = { w: box.width / scale, h: box.height / scale };
      // The labels to keep clear of, grown by the card's rim, so the rim never cuts into a label's text (D16).
      const rim = CARD_RIM_PX / scale;
      const avoid: Rect[] = [LABEL_Y.stones, LABEL_Y.shelf].map((y) => ({ ...LINE, y: y - rim, h: LINE.h + 2 * rim }));
      place(card, placeCard(ref.rect, size, avoid), true);
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
      const { rect, shoulder } = stone.face;
      const outline = stoneOutline(stone.face).map(([x, y]) => `${n(x / rect.w * 100)}% ${n(y / rect.h * 100)}%`);
      const textTop = Math.min(shoulder + 4, rect.h - 38);
      button.style.setProperty("--stone-shape", `polygon(${outline.join(",")})`);
      button.dataset.crown = String(stone.face.crown);
      // Leave five units above the uneven foot for a wrapped desktop inscription.
      button.toggleAttribute("data-wrap-intent", textTop + 18 + 2 * 14 <= rect.h - 5);
      for (const [key,value] of Object.entries({
        x: rect.x - stone.rect.x, y: rect.y - stone.rect.y, w: rect.w, h: rect.h, text: textTop,
      })) button.style.setProperty(`--stone-${key}`, String(value));
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
    // Every view: a press on the Door in the Room sets the modality before the click opens the view (D24).
    const result = guardDown(guard, e.pointerType, view === "graveyard" ? (refOf(e.target)?.id ?? null) : null);
    guard = result.guard;
    if (view === "graveyard" && result.away) stepCard({ type: "tap-away" });
  });
  doc.addEventListener("pointercancel", () => {
    guard = guardCancel(guard);
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
      writeVar("--dawn",String(dawnFor({phase:hooks.phase()})));

      setAttr(section, "data-view", view);
      setHidden(shutDoor, !input.door.shut);
      setHidden(doorButton, !input.door.usable || view !== "room");

      if (view === "graveyard") {
        if (previous !== "graveyard" || builtHistory !== input.history || builtDayKeyOf !== input.dayKeyOf) {
          builtHistory = input.history;
          builtDayKeyOf = input.dayKeyOf;
          const next=planView(visibleHistory(input.history,{...DEFAULT_LIMITS,dayKeyOf:input.dayKeyOf}));
          rebuild(next);
          section.querySelector(":scope > svg.place")?.remove();
          section.prepend(placeSvg(next,doc));
        }
      } else if (previous === "graveyard") {
        section.querySelector(":scope > svg.place")?.remove();
        cardState = NO_CARD;
        guard = guardCancel(guard); // the gesture ends; no key was pressed, so the modality stays (D24)
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
