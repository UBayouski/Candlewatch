// The ghost layer (ghosts-and-graveyard design 4.1, R9, R10). Builds elements once and applies a plan; it never decides which
// ghosts exist (visibleGhosts does) and never reads the clock. Positions use the transform attribute, never a style attribute.
import { STRINGS } from "../strings";
import { fill } from "../ui/format";
import { silhouettePath } from "./silhouette";
import { GHOST_SLOTS, OVERFLOW_MARK } from "./slots";
import type { DrawnGhost } from "./visible";

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

  const setAttr = (el: Element, name: string, value: string): void => {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  };

  const create = (g: DrawnGhost): SVGGElement => {
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "ghost");
    group.setAttribute("data-slot", String(g.slot));
    group.setAttribute("data-index", String(g.index));
    const at = GHOST_SLOTS[g.slot] ?? GHOST_SLOTS[0];
    group.setAttribute("transform", `translate(${at?.cx ?? 0} ${at?.cy ?? 0}) scale(${g.size})`);
    const inner = document.createElementNS(SVG_NS, "g");
    inner.setAttribute("class", "drift");
    const body = document.createElementNS(SVG_NS, "path");
    body.setAttribute("class", "body");
    body.setAttribute("d", silhouettePath());
    inner.append(body);
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
    apply({ ghosts, on, reduced }) {
      setAttr(svg, "data-reduced", reduced ? "true" : "false");

      if (!on) {
        clearAll();
        if (!mark.hasAttribute("hidden")) mark.setAttribute("hidden", "");
        return;
      }

      const wanted = new Set(ghosts.drawn.map((g) => g.index));
      for (const [index, el] of [...live]) {
        if (!wanted.has(index)) {
          live.delete(index);
          fadeOut(el, reduced);
        }
      }
      if (reduced) for (const el of [...leaving]) drop(el);

      for (const g of ghosts.drawn) {
        if (live.has(g.index)) continue; // slot and size are never rewritten (R9.11)
        const el = create(g);
        live.set(g.index, el);
        svg.insertBefore(el, mark);
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
