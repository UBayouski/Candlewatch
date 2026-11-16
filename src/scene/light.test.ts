import { expect, it } from "vitest";
import { edgeShade, lightAt, litColour, poolLight, poolRadiusDrawn, settingColour, tintAt, veilAt, windowLight, windowLightAt, windowProfile } from "./light";

it("pins the pool's three stops and the window's profile", () => {
  expect(poolLight(0, 0, 1)).toBe(1); expect(poolLight(420, 0, 1)).toBeCloseTo(.75); expect(poolLight(700, 0, 1)).toBe(0);
  expect(windowProfile(0)).toBe(1); expect(windowProfile(2600)).toBeCloseTo(.3);
  expect(windowProfile(2601)).toBe(0);
  expect(windowLightAt(300, 2756, 1, 0)).toBe(0);
  expect(windowLightAt(300,155,1,0)).toBe(.5); expect(windowLight(0,0)).toBe(.09);
});
it("pins horizontal shading and the untouched pool", () => {
  for(const sign of [-1,1]) for(const [d,e,v] of [[320,0,0],[560,.41,.375],[800,.82,.75],[1500,.82,.75]]) {
    expect(edgeShade(300+sign*(d??0))).toBeCloseTo(e??0); expect(veilAt(300+sign*(d??0))).toBeCloseTo(v??0);
  }
  expect(lightAt(300,500,500,1,1,0)).toBe(1);
  expect(lightAt(1100,500,500,0,1,0)).toBeCloseTo(windowLightAt(1100,500,1,0));
});
it("does not draw an idle pool or tint and mixes colours in layer order", () => {
  expect(tintAt(300,500,500,poolRadiusDrawn("idle",.2))).toBe(0);
  for(const phase of ["lit","paused","snuffed","burned-out"])expect(poolRadiusDrawn(phase,.2)).toBe(.2);
  expect(settingColour([50,60,70],false,300,500,500,0)).toEqual([50,60,70]);
  expect(settingColour([50,60,70],false,300,500,500,1)).toEqual([81.5,72.6,62.44]);
  expect(litColour([50,60,70],false,300,500,500,1,1,0)).toEqual([81.5,72.6,62.44]);
});
it("invalid numeric inputs give zero without throwing",()=>{
  for(const n of [NaN,Infinity,-Infinity]) {
    expect(poolLight(n,0,1)).toBe(0);expect(poolLight(0,n,1)).toBe(0);expect(poolLight(0,0,n)).toBe(0);
    expect(edgeShade(n)).toBe(0);expect(veilAt(n)).toBe(0);expect(windowLight(n,0)).toBe(0);expect(windowLight(1,n)).toBe(0);
    expect(windowLightAt(n,0,1,0)).toBe(0);expect(lightAt(300,500,n,1,1,0)).toBe(0);expect(tintAt(300,500,n,1)).toBe(0);expect(poolRadiusDrawn("lit",n)).toBe(0);
  }
});
