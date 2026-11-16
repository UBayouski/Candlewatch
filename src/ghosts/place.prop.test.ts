import * as fc from "fast-check";
import { expect,it } from "vitest";
import { PROP_PARAMS } from "../engine/test-kit";
import { GHOST_CELLS } from "../ui/layout";
import { ghostLook,placeGhost } from "./place";
import { GHOST_SLOTS } from "./slots";
const size=fc.double({min:.25,max:1,noNaN:true});
const triple=[fc.integer({min:0,max:11}),fc.nat(),size] as const;
it("Feature: room-art, Property 1: A ghost stays inside its cell",()=>{
 fc.assert(fc.property(...triple,(slot,index,size)=>{
  const p=placeGhost(slot,index,size),c=GHOST_SLOTS[slot];if(!c)throw new Error("missing slot");
  const cell=GHOST_CELLS.find(r=>r.x+r.w/2===c.cx&&r.y+r.h/2===c.cy);if(!cell)throw new Error("missing cell");
  for(const s of [size,1]){
   const at=placeGhost(slot,index,s),t=at.tilt*Math.PI/180;
   for(const dx of [-8,8])for(const dy of [-8,8])for(const x of [-35,35])for(const y of [-37.5,37.5]){
    const xx=at.x+dx+s*(x*Math.cos(t)-y*Math.sin(t)), yy=at.y+dy+s*(x*Math.sin(t)+y*Math.cos(t));
    expect(xx).toBeGreaterThanOrEqual(cell.x-1e-10);expect(xx).toBeLessThanOrEqual(cell.x+cell.w+1e-10);
    expect(yy).toBeGreaterThanOrEqual(cell.y-1e-10);expect(yy).toBeLessThanOrEqual(cell.y+cell.h+1e-10);
   }
   if(s===1){expect(Math.abs(at.x-c.cx)).toBeLessThanOrEqual(2);expect(Math.abs(at.y-c.cy)).toBeLessThanOrEqual(2);}
  }
  expect(p).toEqual(placeGhost(slot,index,size));
 }),PROP_PARAMS);
});
it("Feature: room-art, Property 2: Placement is deterministic and independent of other ghosts",()=>{
 fc.assert(fc.property(...triple,fc.array(fc.nat()),(slot,index,size,others)=>{
  const before=placeGhost(slot,index,size),look=ghostLook(index);
  for(const other of others){ghostLook(other);placeGhost(other%12,other,.5);}
  expect(placeGhost(slot,index,size)).toEqual(before);expect(ghostLook(index)).toEqual(look);
  expect(Reflect.apply(ghostLook,null,[index,others.length])).toEqual(look);
  expect(Reflect.apply(placeGhost,null,[slot,index,size,others])).toEqual(before);
 }),PROP_PARAMS);
});
it("Feature: room-art, Property 3: A column of small ghosts does not read as a straight line",()=>{
 fc.assert(fc.property(fc.nat({max:2147483630}),fc.array(fc.double({min:.25,max:.5,noNaN:true}),{minLength:6,maxLength:6}),(start,sizes)=>{
  const xs=sizes.map((s,k)=>placeGhost(2*k,start+2*k,s).x);
  expect(Math.max(...xs)-Math.min(...xs)).toBeGreaterThanOrEqual(8);
  for(let k=0;k<6;k++)expect(ghostLook(start+2*k).variant).toBe((start+2*k)%3);
 }),PROP_PARAMS);
});
