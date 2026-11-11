// The ghost slots (ghosts-and-graveyard design 3.9 and Section 1, decisions L2 to L5). Pure: numbers only, in room units
// (the scene's 600 x 1000 viewBox). Nothing here reads the DOM, the clock or the engine.

/** The full-size ghost box (`ghostSize` 1.0): 70 by 75 units, centred on its slot (L2). Smaller ghosts scale about the same centre. */
export const GHOST_BOX = { w: 70, h: 75 } as const;

/** How far a ghost drifts from its resting place, in x and in y (L3). Its cell leaves 10 units on every side, so 2 are left at the extreme. */
export const DRIFT_UNITS = 8;

export interface GhostSlot {
  /** Centre of the slot in room units. */
  readonly cx: number;
  readonly cy: number;
}

/**
 * Slot k sits in the left band when k is even and in the right band when k is odd; its row is floor(k / 2) (L4).
 * Twelve slots: six rows of two, from y = 215 to y = 785, so the lowest cell ends 20 units above the Door.
 */
export const GHOST_SLOTS: readonly GhostSlot[] = Array.from({ length: 12 }, (_, k) => ({
  cx: k % 2 === 0 ? 55 : 545,
  cy: 262.5 + 95 * Math.floor(k / 2),
}));

/** The "+n" for the distractions that are not drawn (L5): centred on x, text baseline at y, font size in room units. */
export const OVERFLOW_MARK = { x: 545, y: 860, fontSize: 24 } as const;
