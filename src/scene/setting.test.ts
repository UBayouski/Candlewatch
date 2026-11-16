import { describe, expect, it } from "vitest";
import { DOOR_WOOD, HOLDER, PANES, PANE_FRAME, SETTING_TOKENS, STARS, TABLE, WALL, wallBlocks, wallCoursesB, wallHeights, wallTile } from "./setting";
describe("room-art static setting", () => {
 it("pins the shipped tile heights, blocks, widths, tones and determinism", () => {
  const a=wallCoursesB(WALL.seed),flat=a.flat();
  expect(wallHeights(WALL.seed)).toEqual([79,84,75,68,78,81,95,68]);
  expect(flat).toHaveLength(42); expect(wallHeights(WALL.seed).reduce((a,b)=>a+b,0)).toBe(628);
  expect(a).toEqual(wallCoursesB(WALL.seed));
  for(const row of a){ expect(row.reduce((s,b)=>s+b.w,0)).toBe(960); for(const b of row){expect(b.w).toBeGreaterThanOrEqual(105);expect(b.w).toBeLessThanOrEqual(240);}}
  expect([0,1,2,3,4].map(t=>flat.filter(b=>b.t===t).length)).toEqual([12,11,11,6,2]);
  let stacked=0,longest=0;
  for(let x=0;x<960;x++){
   const tones=a.map(row=>row.find(b=>(x-b.x+960)%960<b.w)?.t);
   let run=1;
   for(let i=1;i<tones.length;i++){ if((tones[i]??0)>=3&&(tones[i-1]??0)>=3)stacked++; run=tones[i]===tones[i-1]?run+1:1;longest=Math.max(longest,run); }
  }
  expect(stacked).toBe(0);expect(longest).toBe(3);
 });
 it("exports the same tile geometry and available centre-line joints",()=>{
  const blocks=wallBlocks(WALL.seed);expect(blocks).toHaveLength(42);
  const joints=blocks.flatMap(b=>b.joint?[b.joint]:[]);
  expect(joints.length).toBe(40); // Q44: the approved sampler leaves vertical gaps unread.
  expect(blocks.filter(b=>b.joint===null).map(b=>[b.c,b.i])).toEqual([[2,4],[5,2]]);
  for(const j of joints)expect(j.width).toBeGreaterThanOrEqual(3.4);
  expect(Math.abs(joints.reduce((s,j)=>s+j.width,0)/joints.length - 5.5)).toBeLessThanOrEqual(.1);
  expect(wallTile(WALL.seed)).toContain('width="960" height="628"');
  expect(wallTile(WALL.seed).match(/<path /g)).toHaveLength(5);
 });
 it("keeps the table, holder, frame and stars inside their specified bounds",()=>{
  expect(TABLE).toEqual({y:884,h:16,topEnd:889,lipEnd:891.4,underY:891.9,faceY:892.4});expect(TABLE.y+TABLE.h).toBe(900);
  expect(HOLDER.x).toBeGreaterThanOrEqual(236);expect(HOLDER.x+HOLDER.w).toBeLessThanOrEqual(364);expect(HOLDER.h).toBeLessThanOrEqual(14);expect(HOLDER.rim.cy-HOLDER.rim.ry).toBe(886);
  expect(PANE_FRAME).toMatchObject({x:240,y:50,w:120,h:210});expect(STARS).toHaveLength(9);
  for(const [x,y,r] of STARS){expect(r*2).toBeGreaterThanOrEqual(1);expect(r*2).toBeLessThanOrEqual(2);expect(PANES.some(p=>x-r>=p.x&&x+r<=p.x+p.w&&y-r>=p.y&&y+r<=p.y+p.h)).toBe(true);}
  expect(SETTING_TOKENS).toHaveLength(44);expect(SETTING_TOKENS.every(t=>t.startsWith("--set-"))).toBe(true);
  expect(DOOR_WOOD.planks).toHaveLength(4);
 });
});
