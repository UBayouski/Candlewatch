import { expect,it } from "vitest";
import { GHOST_BOX,DRIFT_UNITS,ghostLook,placeGhost,spareRoom } from "./place";
import { GHOST_BOX as SLOT_BOX, DRIFT_UNITS as SLOT_DRIFT,GHOST_SLOTS } from "./slots";
it("keeps the box/drift copies and Q47's spare room",()=>{
 expect(GHOST_BOX).toEqual(SLOT_BOX);expect(DRIFT_UNITS).toBe(SLOT_DRIFT);
 for(const [s,x,y] of [[1,.085,.220],[.5,18.543,19.860],[.25,27.771,29.680]] as const){
  const spare=spareRoom(s);expect(Math.abs(spare.x-x)).toBeLessThanOrEqual(.001);expect(Math.abs(spare.y-y)).toBeLessThanOrEqual(.001);
 }
});
it("pins the first twelve identities against a separately calculated look table",()=>{
 const table=[[-3,-1,-.4],[1.529266,.236068,.428427],[.058532,-.527864,-.743146],[-1.412202,.708204,.085281],[-2.882936,-.055728,.913708],[1.646330,-.819660,-.257864],[.175596,.416408,.570563],[-1.295138,-.347524,-.601010],[-2.765872,.888544,.227417],[1.763394,.124612,-.944156],[.292660,-.639320,-.115729],[-1.178074,.596748,.712698]];
 table.forEach(([tilt=0,fx=0,fy=0],i)=>{
  const look=ghostLook(i),p=placeGhost(i,i,1),c=GHOST_SLOTS[i];if(!c)throw new Error("missing slot");
  expect(look.tilt).toBeCloseTo(tilt,5);expect(look.fx).toBeCloseTo(fx,5);expect(look.fy).toBeCloseTo(fy,5);
  expect(look.variant).toBe(i%3);expect(Math.abs(look.tilt)).toBeLessThanOrEqual(3);
  expect(Math.abs(p.x-c.cx)).toBeLessThanOrEqual(2);expect(Math.abs(p.y-c.cy)).toBeLessThanOrEqual(2);
 });
});
