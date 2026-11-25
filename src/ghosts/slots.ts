// Ghost geometry in the scene's 600 x 1000 viewBox (visual-polish D1).

/** The full-size ghost box (`ghostSize` 1.0): 70 by 75 units, centred on its slot (L2). Smaller ghosts scale about the same centre. */
export const GHOST_BOX = { w: 70, h: 75 } as const;

/** How far a ghost drifts from its resting place, in x and in y (L3). */
export const DRIFT_UNITS = 8;

export const GHOST_LIMIT = 12;

/** The overflow text stays above the room's time band. */
export const OVERFLOW_MARK = { x: 524, y: 872, fontSize: 24 } as const;

export const PORTRAIT_ANCHORS = [
  [179, 230], [424, 212], [117, 384], [548, 307], [54, 274], [478, 421],
  [58, 490], [535, 527], [122, 599], [486, 638], [73, 730], [551, 753],
] as const;

export const LANDSCAPE_ANCHORS = [
  [315, 80], [545, 186], [60, 306], [650, 560], [-412, 667], [502, 369],
  [97, 507], [808, 599], [-77, 820], [575, 750], [-245, 700], [982, 781],
] as const;
