import * as fc from "fast-check";
import { expect, it } from "vitest";
import { PROP_PARAMS } from "../engine/test-kit";
import { placeControls } from "../ui/layout";
import { ghostArea, ghostGuards, placeGhost, planGhosts, separation } from "./place";
import { DRIFT_UNITS, GHOST_BOX, GHOST_LIMIT } from "./slots";
import { visibleGhosts } from "./visible";

const references = [[360, 640], [1280, 800], [1920, 1080], [3840, 2160]] as const;
const reference = fc.constantFrom(...references);
const viewport = fc.oneof(reference, fc.tuple(fc.integer({ min: 360, max: 3840 }), fc.integer({ min: 540, max: 2160 })));
const durations = fc.array(fc.nat({ max: 300_000 }), { maxLength: 36 });

it("Feature: visual-polish, Property 1: placement is deterministic and retained identities stay stable on append", () => {
  fc.assert(fc.property(reference, durations, fc.nat(), ([w, h], spans, next) => {
    const layout = placeControls(w, h);
    const plan = planGhosts(layout);
    expect(planGhosts(layout)).toEqual(plan);
    const draw = (history: readonly number[]) => {
      const { drawn, hidden } = visibleGhosts(history, GHOST_LIMIT);
      expect(hidden).toBe(Math.max(0, history.length - GHOST_LIMIT));
      return new Map(drawn.map(({ slot, index, size }) => [index, placeGhost(plan, slot, index, size)]));
    };
    const before = draw(spans);
    const after = draw([...spans, next]);
    for (const [index, placement] of after) if (before.has(index)) expect(placement).toEqual(before.get(index));
  }), PROP_PARAMS);
});

it("Feature: visual-polish, Property 2: swept ghost areas stay clear throughout the supported layout", () => {
  fc.assert(fc.property(viewport, fc.nat({ max: 1_000_000 }), fc.double({ min: 0.25, max: 1, noNaN: true }), ([w, h], index, size) => {
    const layout = placeControls(w, h);
    const plan = planGhosts(layout);
    expect(plan.anchors).toHaveLength(GHOST_LIMIT);
    const { visible, guards } = ghostGuards(layout);
    const areas = plan.anchors.map(anchor => ghostArea(anchor, plan.halfWidth, plan.halfHeight));
    for (const [slot, area] of areas.entries()) {
      expect(area.x).toBeGreaterThanOrEqual(visible.x);
      expect(area.y).toBeGreaterThanOrEqual(visible.y);
      expect(area.x + area.w).toBeLessThanOrEqual(visible.x + visible.w);
      expect(area.y + area.h).toBeLessThanOrEqual(visible.y + visible.h);
      for (const guard of guards) expect(separation(area, guard)).toBeGreaterThanOrEqual(1);
      for (const other of areas.slice(slot + 1)) expect(separation(area, other)).toBeGreaterThanOrEqual(1);
      for (const s of [size, 1]) {
        const at = placeGhost(plan, slot, index + slot, s);
        if (!at) throw new Error("Missing ghost placement");
        const t = at.tilt * Math.PI / 180;
        const cornersX = [-1, 1].map(sign => sign * (GHOST_BOX.w / 2 + 0.75) * at.scale);
        const cornersY = [-1, 1].map(sign => sign * (GHOST_BOX.h / 2 + 0.75) * at.scale);
        for (const x of cornersX) for (const y of cornersY) {
          const xx = at.x + x * Math.cos(t) - y * Math.sin(t);
          const yy = at.y + x * Math.sin(t) + y * Math.cos(t);
          expect(xx - DRIFT_UNITS).toBeGreaterThanOrEqual(area.x);
          expect(yy - DRIFT_UNITS).toBeGreaterThanOrEqual(area.y);
          expect(xx + DRIFT_UNITS).toBeLessThanOrEqual(area.x + area.w);
          expect(yy + DRIFT_UNITS).toBeLessThanOrEqual(area.y + area.h);
        }
      }
    }
  }), PROP_PARAMS);
});
