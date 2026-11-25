import { describe, expect, it } from "vitest";
import { DOOR_RECT, FLOOR_UNITS, placeControls } from "../ui/layout";
import type { Rect } from "../ui/layout";
import { ghostArea, planGhosts, separation } from "./place";
import { OVERFLOW_MARK } from "./slots";

const right = (r: Rect) => r.x + r.w;
const bottom = (r: Rect) => r.y + r.h;

describe("the Overflow_Mark box of L5", () => {
  // "+9999" is five characters; the advance of a character is taken as 0.6 of the font size.
  const half = (5 * 0.6 * OVERFLOW_MARK.fontSize) / 2;
  const mark: Rect = { x: OVERFLOW_MARK.x - half, y: OVERFLOW_MARK.y - 22, w: 2 * half, h: 26 };

  it("spans x 488..560 and y 850..876 with its baseline inside", () => {
    expect([mark.x, right(mark), mark.y, bottom(mark)]).toEqual([488, 560, 850, 876]);
    expect(OVERFLOW_MARK.y).toBeGreaterThan(mark.y);
    expect(OVERFLOW_MARK.y).toBeLessThanOrEqual(bottom(mark));
  });

  it("lies in the right band, clear of the Door and the floor band", () => {
    expect(mark.x).toBeGreaterThanOrEqual(448);
    expect(right(mark)).toBeLessThanOrEqual(600);
    expect(bottom(mark)).toBeLessThan(FLOOR_UNITS);
    expect(separation(mark, DOOR_RECT)).toBeGreaterThan(0);
    for (const [w, h] of [[360, 640], [1280, 800]] as const) {
      const plan = planGhosts(placeControls(w, h));
      for (const anchor of plan.anchors) expect(separation(mark, ghostArea(anchor, plan.halfWidth, plan.halfHeight))).toBeGreaterThan(0);
    }
  });

  it("is legible: the font size times 0.6 is at least 12 (14.4 at 360 x 640)", () => {
    expect(OVERFLOW_MARK.fontSize * 0.6).toBeGreaterThanOrEqual(12);
  });
});
