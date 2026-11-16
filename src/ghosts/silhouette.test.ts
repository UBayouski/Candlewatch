import { describe, expect, it } from "vitest";
import { ghostShape } from "./silhouette";
import { GHOST_BOX } from "./slots";

// room-art R5.5/Q33: narrow shoulders and asymmetric wisps intentionally do not touch both box sides.
describe("room-art ghost bodies", () => {
  it.each([0,1,2])("shape %i is one closed subpath", variant => {
    const d=ghostShape(variant);
    expect(d.startsWith("M")).toBe(true); expect(d.endsWith("Z")).toBe(true); expect(d.match(/M/g)?.length).toBe(1);
  });
  it.each([0,1,2])("shape %i uses finite coordinate pairs", variant => {
    const nums=(ghostShape(variant).match(/-?\d+(?:\.\d+)?/g)??[]).map(Number);
    expect(nums.length).toBeGreaterThan(0); expect(nums.length%2).toBe(0); expect(nums.every(Number.isFinite)).toBe(true);
  });
  it.each([0,1,2])("shape %i fits the unchanged box", variant => {
    const nums=(ghostShape(variant).match(/-?\d+(?:\.\d+)?/g)??[]).map(Number);
    nums.forEach((n,i)=>expect(Math.abs(n)).toBeLessThanOrEqual(i%2 ? GHOST_BOX.h/2 : GHOST_BOX.w/2));
  });
  it.each([0,1,2])("shape %i touches top, bottom and its wisp side, with the other side within 14 units", variant => {
    const nums=(ghostShape(variant).match(/-?\d+(?:\.\d+)?/g)??[]).map(Number);
    const xs=nums.filter((_,i)=>i%2===0),ys=nums.filter((_,i)=>i%2===1);
    expect(Math.min(...ys)).toBe(-37.5); expect(Math.max(...ys)).toBe(37.5);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(21); expect(Math.min(...xs)).toBeLessThanOrEqual(-21);
    expect(Math.max(...xs)===35 || Math.min(...xs)===-35).toBe(true);
  });
});
