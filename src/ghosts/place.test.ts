import { expect, it } from "vitest";
import { placeControls } from "../ui/layout";
import { ghostArea, ghostGuards, placeGhost, planGhosts, separation } from "./place";
import { LANDSCAPE_ANCHORS, PORTRAIT_ANCHORS } from "./slots";

it.each([[360, 640], [1280, 800], [1920, 1080], [3840, 2160]])(
  "uses the reference areas and preserves clearance at %i × %i",
  (width, height) => {
    const layout = placeControls(width, height);
    const plan = planGhosts(layout);
    const phone = width === 360;
    expect(plan.anchors).toEqual(phone ? PORTRAIT_ANCHORS : LANDSCAPE_ANCHORS);
    expect(plan.maximum).toBe(phone ? 1 : 1.7);
    const { visible, guards } = ghostGuards(layout);
    const areas = plan.anchors.map(anchor => ghostArea(anchor, plan.halfWidth, plan.halfHeight));
    const pairGap = Math.min(...areas.flatMap((area, i) => areas.slice(i + 1).map(other => separation(area, other))));
    const guardGap = Math.min(...areas.flatMap(area => guards.map(guard => separation(area, guard))));
    const inset = Math.min(...areas.map(a => Math.min(
      a.x - visible.x, a.y - visible.y, visible.x + visible.w - a.x - a.w, visible.y + visible.h - a.y - a.h,
    )));
    expect(pairGap).toBe(phone ? 4 : 8);
    expect(guardGap).toBe(phone ? 3 : 1);
    expect(inset).toBe(1);
    if (!phone) {
      const span = (axis: 0 | 1) => {
        const sorted = plan.anchors.map(anchor => anchor[axis]).sort((a, b) => a - b);
        return Math.min(...sorted.slice(2).map((value, i) => value - (sorted[i] ?? value)));
      };
      expect([span(0), span(1)]).toEqual([73, 70]);
      // Opposing resting offsets can shrink an anchor span by at most four units.
      expect(span(0) - 4).toBeGreaterThan(60);
      expect(span(1) - 4).toBeGreaterThan(60);
    }
    expect(placeGhost(plan, 0, 0, 1)?.scale).toBe(plan.maximum);
    console.log("D1 clearance", { width, height, pairGap, guardGap, inset });
  },
);
