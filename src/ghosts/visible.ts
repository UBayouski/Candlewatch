// Which ghosts are drawn (ghosts-and-graveyard design 3.9, R9). Pure: the spans come in, the plan goes out. This is the only place
// that decides which ghosts exist; the DOM layer does not recount.
import { ghostSize } from "../engine";

export interface DrawnGhost {
  /** The distraction's position in `ghostSpansMs`, oldest first; the key of the element. */
  readonly index: number;
  readonly slot: number;
  /** `ghostSize(span)` in [0.25, 1]. */
  readonly size: number;
}

/**
 * The newest `G` ghosts, oldest first, and how many older ones are not drawn (R9.6, R9.10, R9.13). A ghost's slot is its index
 * modulo `G`, so in any run of `G` consecutive indices the slots differ, and a new ghost takes the slot freed by the oldest drawn
 * one while no other ghost moves (R9.5, R9.11, R9.12). `G` is read as `max(0, floor(G))` and `NaN` as 0: nothing is drawn and
 * `hidden` is the full count. When `spans.length <= G`, `hidden` is 0 and the page shows no Overflow_Mark (R9.9).
 */
export function visibleGhosts(spans: readonly number[], G: number): { drawn: readonly DrawnGhost[]; hidden: number } {
  const slots = Number.isNaN(G) ? 0 : Math.max(0, Math.floor(G));
  const first = Math.max(0, spans.length - slots);
  const drawn: DrawnGhost[] = [];
  for (let index = first; index < spans.length; index++) {
    drawn.push({ index, slot: index % slots, size: ghostSize(spans[index] ?? Number.NaN) });
  }
  return { drawn, hidden: first };
}
