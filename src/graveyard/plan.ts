// What the graveyard view puts where (ghosts-and-graveyard design 4.3, L7, R4, R7, R8). Pure: the output of `visibleHistory` in,
// a plan of rectangles, texts and navigation ids out. The DOM layer (view-dom.ts) only turns the plan into elements.
import type { Indexed } from "./days";
import { formatCarvedDate } from "./days";
import type { NavLayout } from "./focus";
import { dateLabelRect, moreRect, stoneRect, stubRect } from "./geometry";
import type { Rect } from "./geometry";
import { cardLines, daysCountLine, itemName, moreText, stoneIntent, stonesCountLine } from "./text";
import type { VisibleHistory } from "./visible";

/** One Stone or Stub: the element id, its rectangle in room units, its accessible name and its five description lines (R7.1 to R7.4). */
export interface PlacedItem {
  readonly item: Indexed;
  readonly id: string;
  readonly rect: Rect;
  readonly name: string;
  readonly lines: readonly string[];
}

export interface PlacedStone extends PlacedItem {
  /** The Carved_Date and the intent shown on the face (R4.2, R4.3). */
  readonly date: string;
  readonly intent: string;
}

export interface ShelfRowPlan {
  readonly dayKey: string;
  /** The real-text date label at the start of the row (R4.5). */
  readonly label: string;
  readonly labelRect: Rect;
  readonly stubs: readonly PlacedItem[];
  /** "+n more" and where it goes, or null when no stub of the day is hidden (R8.5). */
  readonly more: { readonly text: string; readonly rect: Rect } | null;
}

export interface ViewPlan {
  readonly stones: readonly PlacedStone[];
  readonly rows: readonly ShelfRowPlan[];
  /** Count_Lines: null when nothing is hidden (R8.8 to R8.10). */
  readonly stonesCount: string | null;
  readonly daysCount: string | null;
  /** The ids in Group order, for `tabStops` and `navigate` (R6). */
  readonly layout: NavLayout;
}

const placed = (item: Indexed, rect: Rect): PlacedItem => ({ item, id: item.id, rect, name: itemName(item), lines: cardLines(item) });

/** Stone i at `stoneRect(i)`; Day_Shelf row r at `shelfRowY(r)` with stub j at `stubRect(r, j)` (L7). */
export function planView(visible: VisibleHistory): ViewPlan {
  const stones = visible.stones.map((item, i): PlacedStone => ({
    ...placed(item, stoneRect(i)),
    date: formatCarvedDate(item.dayKey),
    intent: stoneIntent(item.entry),
  }));
  const rows = visible.shelves.map((shelf, r): ShelfRowPlan => {
    const text = moreText(shelf.hiddenStubs);
    return {
      dayKey: shelf.dayKey,
      label: formatCarvedDate(shelf.dayKey),
      labelRect: dateLabelRect(r),
      stubs: shelf.stubs.map((item, j) => placed(item, stubRect(r, j))),
      more: text === null ? null : { text, rect: moreRect(r) },
    };
  });
  return {
    stones,
    rows,
    stonesCount: stonesCountLine(visible.hiddenStones),
    daysCount: daysCountLine(visible.hiddenDays),
    layout: { graveyard: stones.map((s) => s.id), shelf: rows.map((row) => row.stubs.map((s) => s.id)) },
  };
}
