// The ghost layer (ghosts-and-graveyard design 4.1, R9, R10). Builds elements once and applies a plan; it never decides which
// ghosts exist (visibleGhosts does) and never reads the clock. Positions use the transform attribute, never a style attribute.
import { STRINGS } from "../strings";
import { fill } from "../ui/format";
import { ghostShape, GHOST_EYES, GHOST_EYE_STYLE } from "./silhouette";
import { ghostLook, placeGhost, planGhosts } from "./place";
import type { GhostPlan } from "./place";
import { GHOST_LIMIT, OVERFLOW_MARK } from "./slots";
import type { DrawnGhost } from "./visible";
import type { Placement } from "../ui/layout";

const SVG_NS = "http://www.w3.org/2000/svg";
/** Safety net for a fade whose transitionend never fires (CSS fade is 400 ms). */
const FADE_SAFETY_MS = 500;

export interface GhostLayerInput {
  /** The result of `visibleGhosts`. */
  readonly ghosts: { readonly drawn: readonly DrawnGhost[]; readonly hidden: number };
  /** Computed by the caller: ghosts setting on and the view is the room. When false nothing is drawn (R10.3). */
  readonly on: boolean;
  /** Reduced motion: no fade, no drift (R10.6, R10.7). */
  readonly reduced: boolean;
  readonly layout: Placement;
}

export interface GhostLayer {
  apply(input: GhostLayerInput): void;
}

export function createGhostLayer(root: HTMLElement): GhostLayer {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "ghost-layer");
  svg.setAttribute("viewBox", "0 0 600 1000");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("data-reduced", "false");

  const defs = document.createElementNS(SVG_NS,"defs");
  const glow = document.createElementNS(SVG_NS,"radialGradient");
  glow.setAttribute("id","cw-ghost-glow");
  for(const [offset,opacity] of [[0,.85],[1,0]]){
    const stop=document.createElementNS(SVG_NS,"stop");
    stop.setAttribute("offset",String(offset));stop.setAttribute("stop-color","#fff");stop.setAttribute("stop-opacity",String(opacity));glow.append(stop);
  }
  defs.append(glow);svg.append(defs);
  const mark = document.createElementNS(SVG_NS, "text");
  mark.setAttribute("class", "overflow");
  mark.setAttribute("x", String(OVERFLOW_MARK.x));
  mark.setAttribute("y", String(OVERFLOW_MARK.y));
  mark.setAttribute("font-size", String(OVERFLOW_MARK.fontSize));
  mark.setAttribute("text-anchor", "middle");
  mark.setAttribute("fill", "#efe6cf");
  mark.setAttribute("hidden", "");
  svg.append(mark);
  root.append(svg);

  const live = new Map<number, SVGGElement>();
  const leaving = new Set<SVGGElement>();
  let markText = "";
  let lastLayout: Placement | undefined;
  let plan: GhostPlan | undefined;

  const setAttr = (el: Element, name: string, value: string): void => {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  };

  const create = (g: DrawnGhost): SVGGElement => {
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "ghost");
    group.setAttribute("data-slot", String(g.slot));
    group.setAttribute("data-index", String(g.index));
    group.setAttribute("data-size", String(g.size));
    const { variant } = ghostLook(g.index);
    const inner = document.createElementNS(SVG_NS, "g");
    inner.setAttribute("class", "drift");
    const body = document.createElementNS(SVG_NS, "path");
    body.setAttribute("class", "body");
    body.setAttribute("d", ghostShape(variant));
    inner.append(body);
    const glow=document.createElementNS(SVG_NS,"ellipse");glow.setAttribute("class","inner-glow");
    for(const [key,value] of Object.entries({cx:0,cy:-12,rx:17,ry:24}))glow.setAttribute(key,String(value));
    inner.append(glow);
    for(const [x,y] of GHOST_EYES[variant] ?? GHOST_EYES[0]){
      const eye=document.createElementNS(SVG_NS,"ellipse");eye.setAttribute("class","eye");
      for(const [key,value] of Object.entries({cx:x,cy:y,rx:GHOST_EYE_STYLE.rx,ry:GHOST_EYE_STYLE.ry}))eye.setAttribute(key,String(value));
      inner.append(eye);
    }
    group.append(inner);
    return group;
  };

  const drop = (el: SVGGElement): void => {
    leaving.delete(el);
    el.remove();
  };

  const fadeOut = (el: SVGGElement, reduced: boolean): void => {
    if (reduced) {
      drop(el);
      return;
    }
    if (leaving.has(el)) return;
    leaving.add(el);
    el.classList.add("leaving");
    el.addEventListener("transitionend", () => drop(el), { once: true });
    setTimeout(() => drop(el), FADE_SAFETY_MS);
  };

  const clearAll = (): void => {
    for (const el of live.values()) el.remove();
    live.clear();
    for (const el of leaving) el.remove();
    leaving.clear();
  };

  return {
    apply({ ghosts, on, reduced, layout }) {
      setAttr(svg, "data-reduced", reduced ? "true" : "false");

      if (!on) {
        clearAll();
        if (!mark.hasAttribute("hidden")) mark.setAttribute("hidden", "");
        return;
      }

      const layoutChanged = layout !== lastLayout;
      if (layoutChanged) {
        lastLayout = layout;
        plan = undefined;
      }
      if (ghosts.drawn.length > 0) plan ??= planGhosts(layout);
      const drawn = plan?.anchors.length === GHOST_LIMIT ? ghosts.drawn : [];
      const wanted = new Set(drawn.map((g) => g.index));
      const wantedSlots = new Set(drawn.map((g) => String(g.slot)));
      for (const [index, el] of [...live]) {
        if (!wanted.has(index)) {
          live.delete(index);
          fadeOut(el, reduced || layoutChanged || wantedSlots.has(el.getAttribute("data-slot") ?? ""));
        }
      }
      for (const el of leaving) {
        if (reduced || layoutChanged || leaving.size + drawn.length > GHOST_LIMIT ||
            wantedSlots.has(el.getAttribute("data-slot") ?? "")) drop(el);
      }

      for (const g of drawn) {
        const retained = live.get(g.index);
        if (retained && !layoutChanged) continue;
        const at = plan && placeGhost(plan, g.slot, g.index, g.size);
        if (!at) continue;
        const el = retained ?? create(g);
        el.setAttribute("transform", `translate(${at.x} ${at.y})`);
        el.firstElementChild?.setAttribute("transform", `rotate(${at.tilt}) scale(${at.scale})`);
        if (!retained) {
          live.set(g.index, el);
          svg.insertBefore(el, mark);
        }
      }

      if (ghosts.hidden > 0) {
        const text = fill(STRINGS.ghosts.overflow, { n: ghosts.hidden });
        if (text !== markText) {
          mark.textContent = text;
          markText = text;
        }
        if (mark.hasAttribute("hidden")) mark.removeAttribute("hidden");
      } else if (!mark.hasAttribute("hidden")) {
        mark.setAttribute("hidden", "");
      }
    },
  };
}
