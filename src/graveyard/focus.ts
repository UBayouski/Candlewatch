// Roving focus in the graveyard and on the shelf (ghosts-and-graveyard design 3.5, R6). Pure: ids in, ids out. Nothing wraps.

export type GroupId = "graveyard" | "shelf";
export type NavKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";

/** The drawn items by id, in Group order. The Shelf is one array per Day_Shelf, newest day first. */
export interface NavLayout {
  readonly graveyard: readonly string[];
  readonly shelf: readonly (readonly string[])[];
}

export interface FocusMemory {
  readonly graveyard: string | null;
  readonly shelf: string | null;
}

export const NO_MEMORY: FocusMemory = { graveyard: null, shelf: null };

/** The Group's ids in reading order: Stones newest first; Stubs newest day first and, inside a day, newest first. */
const flatten = (layout: NavLayout, group: GroupId): readonly string[] => (group === "graveyard" ? layout.graveyard : layout.shelf.flat());

/**
 * The id with tabindex 0 in each Group, or null for an empty Group (R6.2 to R6.6): the remembered id when it is still drawn,
 * else the first id of the Group. A remembered id that is no longer drawn (the history changed) falls back to the first.
 */
export function tabStops(layout: NavLayout, memory: FocusMemory): FocusMemory {
  const stop = (group: GroupId): string | null => {
    const ids = flatten(layout, group);
    const remembered = memory[group];
    return remembered !== null && ids.includes(remembered) ? remembered : (ids[0] ?? null);
  };
  return { graveyard: stop("graveyard"), shelf: stop("shelf") };
}

/**
 * The id to focus after a key; the current id when nothing moves (R6.7 to R6.12). Left and Right step through the flattened
 * order of the Group, Home and End go to its first and last id, and none wraps. On the Shelf, Up goes to row r - 1 (a newer
 * day) and Down to r + 1 (an older day) at column min(j, rowLength - 1), and with no such row the id stays. On the Graveyard,
 * Up and Down return `current`. The result is always in the same Group; an unknown `current` returns the Group's first id.
 */
export function navigate(layout: NavLayout, group: GroupId, current: string, key: NavKey): string {
  const ids = flatten(layout, group);
  const first = ids[0];
  if (first === undefined) return current;
  const at = ids.indexOf(current);
  if (at < 0) return first;

  switch (key) {
    case "Home":
      return first;
    case "End":
      return ids[ids.length - 1] ?? current;
    case "ArrowLeft":
      return ids[at - 1] ?? current;
    case "ArrowRight":
      return ids[at + 1] ?? current;
    case "ArrowUp":
    case "ArrowDown": {
      if (group === "graveyard") return current;
      const row = layout.shelf.findIndex((r) => r.includes(current));
      const column = (layout.shelf[row] ?? []).indexOf(current);
      const target = layout.shelf[key === "ArrowUp" ? row - 1 : row + 1];
      if (target === undefined || target.length === 0) return current;
      return target[Math.min(column, target.length - 1)] ?? current;
    }
  }
}

/** Records the focused item as the Remembered_Item of its Group (R6.18). */
export function remember(memory: FocusMemory, group: GroupId, id: string): FocusMemory {
  return { ...memory, [group]: id };
}
