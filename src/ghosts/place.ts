import { DOOR_RECT, LANDSCAPE_COLUMN_GUARD, LANDSCAPE_WINDOW_GUARD } from "../ui/layout";
import type { Placement, Rect } from "../ui/layout";
import { GHOST_LIMIT, LANDSCAPE_ANCHORS, PORTRAIT_ANCHORS } from "./slots";

type Anchor = readonly [number, number];
export interface GhostPlan {
  readonly anchors: readonly Anchor[];
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly maximum: number;
}

const frac = (v: number): number => v - Math.floor(v);
export function ghostLook(index: number): { variant: number; tilt: number; fx: number; fy: number } {
  return {
    variant: index % 3,
    tilt: (frac(index * 0.7548776662466927) * 2 - 1) * 3,
    fx: frac(index * 0.6180339887498949) * 2 - 1,
    fy: frac(index * 0.4142135623730951 + 0.3) * 2 - 1,
  };
}

export function separation(a: Rect, b: Rect): number {
  return Math.max(a.x - b.x - b.w, b.x - a.x - a.w, a.y - b.y - b.h, b.y - a.y - a.h);
}

export function ghostArea([x, y]: Anchor, halfWidth: number, halfHeight: number): Rect {
  return { x: x - halfWidth, y: y - halfHeight, w: halfWidth * 2, h: halfHeight * 2 };
}

export function ghostGuards(layout: Placement): { visible: Rect; guards: readonly Rect[] } {
  const { ox, oy, scale } = layout.stage;
  const band = layout.zone;
  const width = band.w;
  const height = band.y + band.h;
  const toRoom = (r: Rect, pad = 0): Rect => ({
    x: (r.x - ox - pad) / scale, y: (r.y - oy - pad) / scale,
    w: (r.w + pad * 2) / scale, h: (r.h + pad * 2) / scale,
  });
  const { chooser, intent, light, lengthError } = layout.setup;
  const ordinary = [chooser, intent, light, ...(lengthError ? [lengthError] : [])];
  const controls = layout.landscapeScene ? [...ordinary, layout.settingsPanel, layout.snuffDialog] : ordinary;
  // Bound the round top of the compact halo in steps. Below it the complete
  // swept halo, candle and holder fit the wider column in every phase.
  const equipment = layout.landscapeScene ? [LANDSCAPE_COLUMN_GUARD] : [
    { x: 218, y: 284, w: 164, h: 32 },
    { x: 190, y: 316, w: 220, h: 34 },
    { x: 175, y: 350, w: 250, h: 550 },
  ];
  return {
    visible: toRoom({ x: 0, y: 0, w: width, h: height }),
    guards: [
      ...equipment,
      layout.landscapeScene ? LANDSCAPE_WINDOW_GUARD : { x: 235, y: 44, w: 130, h: 222 },
      { x: DOOR_RECT.x - 10, y: DOOR_RECT.y - 11, w: DOOR_RECT.w + 20, h: DOOR_RECT.h + 21 },
      { x: 448, y: 833, w: 152, h: 67 },
      toRoom(band),
      ...controls.map((rect) => toRoom(rect, 6)),
    ],
  };
}

/** The reference anchors and any responsive alternatives are chosen before assigning ghost identities. */
export function planGhosts(layout: Placement): GhostPlan {
  const { visible, guards } = ghostGuards(layout);
  const preferred = layout.landscapeScene ? LANDSCAPE_ANCHORS : PORTRAIT_ANCHORS;
  const maxima = layout.landscapeScene ? [1.7, 1.45, 1.2, 1] : [1];
  for (const maximum of maxima) {
    const halfWidth = Math.ceil(37.71 * maximum + 10);
    const halfHeight = Math.ceil(40.07 * maximum + 10);
    const valid = (area: Rect) =>
      area.x >= visible.x + 1 && area.y >= visible.y + 1 &&
      area.x + area.w <= visible.x + visible.w - 1 && area.y + area.h <= visible.y + visible.h - 1 &&
      guards.every((guard) => separation(area, guard) >= 1);
    const pack = (candidates: Iterable<Anchor>) => {
      const anchors: Anchor[] = [];
      const areas: Rect[] = [];
      for (const anchor of candidates) {
        const area = ghostArea(anchor, halfWidth, halfHeight);
        if (!valid(area) || areas.some((other) => separation(area, other) < 1)) continue;
        anchors.push(anchor);
        areas.push(area);
        if (anchors.length === GHOST_LIMIT) break;
      }
      return { anchors, halfWidth, halfHeight, maximum };
    };
    const witness = pack(preferred);
    if (witness.anchors.length === GHOST_LIMIT) return witness;

    const minX = Math.max(-550, Math.ceil(visible.x + halfWidth + 1));
    const maxX = Math.min(1100, Math.floor(visible.x + visible.w - halfWidth - 1));
    const minY = Math.max(5, Math.ceil(visible.y + halfHeight + 1));
    // Try the design first, then pack from the top and bottom on a small fixed lattice.
    function* candidates(preferDesign: boolean, fromBottom: boolean): Iterable<Anchor> {
      if (preferDesign) yield* preferred;
      const lastY = 899 - halfHeight;
      for (let y = fromBottom ? lastY : minY; y >= minY && y <= lastY; y += fromBottom ? -12 : 12) {
        for (let step = 0; minX + step <= maxX; step += 12) {
          yield [minX + step, y];
          yield [maxX - step, y];
        }
      }
    }
    for (const [preferDesign, fromBottom] of [[true, false], [false, false], [false, true]] as const) {
      const plan = pack(candidates(preferDesign, fromBottom));
      if (plan.anchors.length === GHOST_LIMIT) return plan;
    }
  }
  // If there is no complete safe plan, the presentation keeps the textual count.
  return { anchors: [], halfWidth: 48, halfHeight: 51, maximum: 1 };
}

export function placeGhost(plan: GhostPlan, slot: number, index: number, size: number) {
  const anchor = plan.anchors[slot];
  if (!anchor) return null;
  const { variant, tilt, fx, fy } = ghostLook(index);
  return { x: anchor[0] + fx * 2, y: anchor[1] + fy * 2, tilt, variant, scale: size * plan.maximum };
}
