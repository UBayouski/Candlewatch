import { ROOM_SVG } from "./room";
import { DAWN_FIELD, EDGE, WARM_TINT, WINDOW_LIGHT } from "./setting";
import { BACKDROP } from "./backdrop";
import { LANDSCAPE_WINDOW, WINDOW } from "./constants";
import * as fc from "fast-check";
import { expect, it } from "vitest";
import { PROP_PARAMS } from "../engine/test-kit";
import { dawnFieldAt, edgeShade, lightAt, poolLight, poolRadiusDrawn, tintAt, veilAt, windowLight, windowLightAt, windowProfile } from "./light";

const real=(min:number,max:number) => fc.double({min,max,noNaN:true});
it("Feature: room-art, Property 6: The light model mirrors the picture (pure half)",()=>{
 fc.assert(fc.property(real(-2200,2800),real(-600,1000),real(400,820),real(0,1),real(0,1),fc.constantFrom("idle","lit","paused","snuffed","burned-out"),(x,y,f,r,dawn,phase)=>{
  const rd=poolRadiusDrawn(phase,r),p=poolLight(x-300,y-f,rd),w=windowLightAt(x,y,r,dawn),v=lightAt(x,y,f,rd,r,dawn);
  const local = dawnFieldAt(x, y) * DAWN_FIELD.exposure * dawn;
  expect(v).toBeGreaterThanOrEqual(0);expect(v).toBeLessThanOrEqual(1);expect(v).toBeCloseTo(1-(1-p)*(1-w)*(1-local),12);expect(v+1e-14).toBeGreaterThanOrEqual(p);
  if(p===0 && local===0)expect(v).toBeCloseTo(w,12);
  expect(poolLight(0,0,0)).toBe(0);expect(poolLight(700*r+1,0,r)).toBe(0);
  expect(poolLight(0,0,1)).toBe(1);expect(poolLight(420,0,1)).toBeCloseTo(.75);expect(poolLight(700,0,1)).toBe(0);
  const distance=Math.hypot(x-300,y-f);
  expect(poolLight(distance+1,0,r)).toBeLessThanOrEqual(poolLight(distance,0,r)+1e-14);
  expect(poolLight(distance,0,r)).toBeLessThanOrEqual(poolLight(distance,0,1)+1e-14);
  expect(windowProfile(distance+1)).toBeLessThanOrEqual(windowProfile(distance)+1e-14);
  expect(windowLightAt(300+Math.abs(x-300)+1,y,r,dawn)).toBeLessThanOrEqual(windowLightAt(300+Math.abs(x-300),y,r,dawn)+1e-14);
  expect(lightAt(x,y,f,rd,r,1)+1e-14).toBeGreaterThanOrEqual(v);
  expect(lightAt(x,y,f,poolRadiusDrawn(phase,1),1,dawn)+1e-14).toBeGreaterThanOrEqual(v);
  const tint=tintAt(x,y,f,rd);expect(tint).toBeCloseTo(.42*p,12);expect(tint).toBeLessThanOrEqual(.42);if(phase==="idle")expect(tint).toBe(0);
  // Always probe inside the idle pool's would-be centre; sparse random room points can miss it.
  expect(poolRadiusDrawn("idle", .2)).toBe(0);
  expect(tintAt(300,f,f,poolRadiusDrawn("idle",.2))).toBe(0);
  for(const sign of [-1,1])for(const [distance,shade,veil] of [[320,0,0],[560,.41,.375],[800,.82,.75],[1500,.82,.75]] as const){
   const xx=300+sign*distance;
   expect(edgeShade(xx)).toBeCloseTo(shade,12);expect(veilAt(xx)).toBeCloseTo(veil,12);
   expect(Reflect.apply(edgeShade,null,[xx,r,dawn])).toBe(edgeShade(xx));
   expect(windowLightAt(xx,y,r,dawn)).toBeCloseTo(windowLight(r,dawn)*windowProfile(Math.hypot(distance,y-155))*(1-shade),12);
  }
  // Both lights overlap where the edge shade has started, so attenuation of the pool is observable.
  const a=poolLight(500,0,1),b=windowLightAt(800,600,1,dawn);
  expect(lightAt(800,600,600,1,1,dawn)).toBeCloseTo(a+b-a*b,12);
 }),PROP_PARAMS);
});
it("Feature: room-art, Property 13: The Window_Light carries no time left",()=>{
 fc.assert(fc.property(real(Number.MIN_VALUE,1),real(Number.MIN_VALUE,1),real(-2200,2800),real(-600,1000),real(0,1),(r,s,x,y,dawn)=>{
  expect(windowLight(r,0)).toBe(.5);expect(windowLight(r,0)).toBe(windowLight(s,0));expect(windowLight(0,0)).toBeLessThanOrEqual(windowLight(r,0));
  expect(windowLight(r,1)).toBe(WINDOW_LIGHT.dawn);expect(windowLight(0,1)).toBe(WINDOW_LIGHT.dawn);
  expect(windowLightAt(x,y,r,0)).toBeCloseTo(windowLightAt(x,y,s,0),12);
  expect(lightAt(x,y,600,r,r,1)+1e-14).toBeGreaterThanOrEqual(lightAt(x,y,600,r,r,dawn));
  for(const d of [0,1]){
   expect(windowLightAt(300,y,r,d)).toBeCloseTo(windowLight(r,d)*windowProfile(Math.abs(y-155)),12);
   for(const offset of [-1500,-800,800,1500])expect(windowLightAt(300+offset,y,r,d)).toBeCloseTo(.18*windowLight(r,d)*windowProfile(Math.hypot(offset,y-155)),12);
  }
 }),PROP_PARAMS);
});

// Stops are read from shipped markup, independently of the scalar model.
it("Feature: room-art, Property 6: The markup mirrors the light model",()=>{
 const gradient=(id:string)=>{
  const inner=ROOM_SVG.match(new RegExp(`<(?:radial|linear)Gradient id="${id}"[^>]*>([\\s\\S]*?)</(?:radial|linear)Gradient>`))?.[1] ?? "";
  return [...inner.matchAll(/<stop\b[^>]*>/g)].map(m=>Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));
 };
 fc.assert(fc.property(real(0,1),d=>{
  const errors:string[]=[];
  for(const id of ["cw-pool-hole","cw-tint-hole"]){
   const stops=gradient(id);if(stops.length!==3)errors.push(`${id}: ${stops.length} stops`);
   for(const stop of stops){const o=Number(stop.offset),a=Number(stop["stop-opacity"]);if(Math.abs(a-poolLight(o*700,0,1))>1e-12)errors.push(`${id} at ${o}: ${a}`);}
  }
  const win=gradient("cw-win-hole");
  if(win.length!==WINDOW_LIGHT.profile.length)errors.push(`window profile length ${win.length}`);
  win.forEach((stop,i)=>{const p=WINDOW_LIGHT.profile[i];if(!p || Number(stop.offset)!==p[0] || Number(stop["data-k"])!==p[1])errors.push(`window stop ${i} ${JSON.stringify(stop)}`);});
  for (const id of ["cw-dawn-light", "cw-dawn-tint"]) {
    expect(gradient(id).map(stop => [Number(stop.offset), Number(stop["stop-opacity"])])).toEqual(DAWN_FIELD.profile);
    expect(ROOM_SVG).toContain(`<radialGradient id="${id}" fy="${DAWN_FIELD.focusY}">`);
  }
  for(const [id,fn,far] of [["cw-win-edge-grad",edgeShade,EDGE.windowShade],["cw-veil-grad",veilAt,EDGE.veil]] as const){
   const stops=gradient(id);if(stops.length!==6)errors.push(`${id}: ${stops.length} stops`);
   for(const stop of stops){const x=BACKDROP.x0+Number(stop.offset)*(BACKDROP.x1-BACKDROP.x0),k=Number(stop["data-k"]);if(Math.abs(fn(x)-far*k)>1e-12)errors.push(`${id} x ${x}, k ${k}, level ${fn(x)}`);}
  }
  if(Math.abs(tintAt(300+d*700,600,600,1)-WARM_TINT.alpha*poolLight(d*700,0,1))>1e-12)errors.push(`tint profile ${d}`);
  expect(errors).toEqual([]);
 }),PROP_PARAMS);
});

it("visual-polish D3: the field opens from the glass and reaches the table", () => {
  fc.assert(fc.property(fc.boolean(), real(.05, 1), real(-2200, 2800), (landscape, dawn, x) => {
    const field = landscape ? DAWN_FIELD.landscape : DAWN_FIELD.compact;
    const window = landscape ? LANDSCAPE_WINDOW : WINDOW;
    const point = (dx: number, y: number) => [field.x + (y - field.y) * field.shift / field.ry + dx, y] as const;
    const [originX, originY] = point(0, field.y - field.ry);
    expect(originX).toBeCloseTo(window.x + window.width / 2, 10);
    expect(originY).toBeGreaterThan(window.y + 8);
    expect(originY).toBeLessThan(window.y + window.height - 8);
    expect(dawnFieldAt(x, window.y - 1, landscape)).toBe(0);
    expect(dawnFieldAt(x, originY - 1, landscape)).toBe(0);
    expect(dawnFieldAt(...point(100, originY + 5), landscape)).toBe(0);
    expect(dawnFieldAt(...point(100, 876), landscape)).toBeGreaterThan(.4);
    expect(Math.abs(point(0, 876)[0] - 300)).toBeLessThan(3);
    const sill = point(0, window.y + window.height);
    expect(dawnFieldAt(...sill, landscape)).toBeGreaterThan(.97);
    expect(dawnFieldAt(...point(0, 876), landscape)).toBeGreaterThan(.75);
    for (const y of [window.y + window.height, 520, 876]) {
      const centre = point(0, y);
      const edge = point(field.rx, y);
      expect(dawnFieldAt(...centre, landscape)).toBeGreaterThan(.45);
      expect(dawnFieldAt(...edge, landscape)).toBeCloseTo(0, 12);
      const local = lightAt(...centre, 600, 0, 0, dawn, landscape) - windowLightAt(...centre, 0, dawn);
      expect(local).toBeGreaterThan(0);
      expect(lightAt(...centre, 600, 0, 0, 0, landscape)).toBeCloseTo(windowLightAt(...centre, 0, 0), 12);
    }
    expect(dawnFieldAt(field.x, 900, landscape)).toBe(0);
  }), PROP_PARAMS);
});
