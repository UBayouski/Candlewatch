import { expect, it } from "vitest";
import { BACKDROP, backdropExtent } from "./backdrop";

it("pins Q46's extents at all seven art viewports to 0.01",()=>{
 const cases=[
  [360,640,0,600,-33.333333,1033.333333],
  [375,667,0,600,-33.6,1033.6],
  [768,1024,-75,675,0,1000],
  [1280,800,-500,1100,0,1000],
  [1920,1080,-588.888889,1188.888889,0,1000],
  [2560,1440,-588.888889,1188.888889,0,1000],
  [3840,2160,-588.888889,1188.888889,0,1000]
 ];
 for(const [w=0,h=0,x0=0,x1=0,y0=0,y1=0] of cases){
  const e=backdropExtent(w,h);
  for(const [actual,want] of [[e.x0,x0],[e.x1,x1],[e.y0,y0],[e.y1,y1]] as const)expect(Math.abs(actual-want)).toBeLessThanOrEqual(.01);
 }
});
it("keeps the claimed tall and wide limits with the 50-unit margin",()=>{
 const tall=backdropExtent(360,1260),wide=backdropExtent(3200,900);
 expect(tall.y0).toBeCloseTo(-550);expect(tall.y1).toBeCloseTo(1550);
 expect(Math.abs(wide.x0-(-1477.78))).toBeLessThanOrEqual(.01);expect(Math.abs(wide.x1-2077.78)).toBeLessThanOrEqual(.01);
 expect(tall.y0-BACKDROP.y0).toBeGreaterThanOrEqual(50);expect(BACKDROP.y1-tall.y1).toBeGreaterThanOrEqual(50);
 expect(wide.x0-BACKDROP.x0).toBeGreaterThanOrEqual(50);expect(BACKDROP.x1-wide.x1).toBeGreaterThanOrEqual(50);
});
