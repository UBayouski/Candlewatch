import * as fc from "fast-check";
import { expect, it } from "vitest";
import { PROP_PARAMS } from "../engine/test-kit";
import { stageBox } from "../ui/layout";
import { BACKDROP, backdropExtent } from "./backdrop";

const viewports=fc.tuple(fc.integer({min:360,max:3840}),fc.integer({min:640,max:2160})).filter(([w,h])=>w/h>=1/3.5&&w/h<=32/9);
const examples: [number,number][]=[[360,640],[375,667],[768,1024],[1280,800],[1920,1080],[2560,1440],[3840,2160],[360,1260],[3840,1080]];
it("Feature: room-art, Property 4: The Backdrop covers the viewport",()=>{
 // The approved drawn extent is part of the contract; 2400 still covers the claimed aspect range.
 expect(BACKDROP).toEqual({x0:-2200,x1:2800,y0:-600,y1:1600});
 fc.assert(fc.property(viewports,([w,h])=>{
  const e=backdropExtent(w,h),s=stageBox(w,h);
  expect(e.x0-BACKDROP.x0).toBeGreaterThanOrEqual(50-1e-10);expect(BACKDROP.x1-e.x1).toBeGreaterThanOrEqual(50-1e-10);
  expect(e.y0-BACKDROP.y0).toBeGreaterThanOrEqual(50-1e-10);expect(BACKDROP.y1-e.y1).toBeGreaterThanOrEqual(50-1e-10);
  expect(e.x0).toBeCloseTo(-s.ox/s.scale,10);expect(e.y0).toBeCloseTo(-s.oy/s.scale,10);
  expect(e.x1).toBeCloseTo((w-s.ox)/s.scale,10);expect(e.y1).toBeCloseTo((h-s.oy)/s.scale,10);
 }),{...PROP_PARAMS,examples:examples.map(v=>[v])});
});
it("Feature: room-art, Property 5: backdropExtent agrees with stageBox",()=>{
 fc.assert(fc.property(viewports,([w,h])=>{
  const e=backdropExtent(w,h),s=stageBox(w,h);
  const scale=w/(e.x1-e.x0);
  expect(scale).toBeCloseTo(s.scale,10);expect(h/(e.y1-e.y0)).toBeCloseTo(s.scale,10);
  expect(-e.x0*scale).toBeCloseTo(s.ox,10);expect(-e.y0*scale).toBeCloseTo(s.oy,10);
 }),{...PROP_PARAMS,examples:examples.map(v=>[v])});
});
