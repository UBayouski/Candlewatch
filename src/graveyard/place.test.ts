import { expect, it } from "vitest";
import type { HistoryEntry } from "../engine";
import { planView } from "./plan";
import { fixedOffsetDay } from "./test-kit";
import { DEFAULT_LIMITS, visibleHistory } from "./visible";
import { COUNT_LINE_Y, stoneFace, stoneRect, stubRect } from "./geometry";
import { DOORWAY, GROUND_RECT, HAZE, HORIZON_Y, PLACE_CLIP_Y, SKY_RECT, groundMarks, shelfBoard, stoneMound, stoneShadow, stoneOutline, textRects } from "./place";

it("pins D9 and derives boards without changing Item rectangles",()=>{
 expect(HORIZON_Y).toBe(224);expect(HAZE).toBe(60);expect(PLACE_CLIP_Y).toBe(900);expect(DOORWAY).toEqual({cx:60,cy:847.5,r:760,sx:1.7});
 expect(SKY_RECT.y+SKY_RECT.h).toBe(284);expect(GROUND_RECT.y+GROUND_RECT.h).toBe(900);
 expect(stoneRect(0)).toEqual({x:40,y:257,w:100,h:74});expect(stubRect(0,0)).toEqual({x:114,y:505,w:74,h:74});
 expect(shelfBoard(505,4)).toEqual({x:109,y:574,w:344,h:12});
});
it("retains three crown profiles and a foot set into the soil",()=> {
  const hit = stoneRect(0), face = stoneFace("0:1:0", hit, true);
  expect(stoneFace("0:1:0", hit, true)).toEqual(face);
  const profiles = [0, 1, 2].map(crown => stoneOutline({ ...face, crown, lean: 4 }));
  expect(new Set(profiles.map(p => JSON.stringify(p))).size).toBe(3);
  for (const profile of profiles) {
    expect(profile[0]?.[1]).toBe(face.rect.h);
    expect(profile.at(-1)?.[1]).toBe(face.rect.h - 4);
  }
  expect(stoneShadow(face.rect)[0]?.[1]).toBe(face.rect.y+face.rect.h);
});
it("ports the text exclusion boxes and both seeded mark sets",()=>{
 const avoid=textRects([505,589,673]),a=groundMarks(7741,avoid);
 expect(avoid).toHaveLength(10);expect(a.pebbles).toHaveLength(150);expect(a.blades).toHaveLength(90);expect(a).toEqual(groundMarks(7741,avoid));
 for(const [points,gap] of [[a.pebbles,26],[a.blades,40]] as const)for(let i=0;i<points.length;i++){
  const p=points[i];if(!p)throw new Error("missing mark");const [x,y]=p;
  expect(x).toBeGreaterThanOrEqual(-1100);expect(x).toBeLessThanOrEqual(1700);expect(y).toBeGreaterThanOrEqual(254);expect(y).toBeLessThanOrEqual(890);
  expect(avoid.some(r=>x>r.x-5&&x<r.x+r.w+5&&y>r.y-5&&y<r.y+r.h+5)).toBe(false);
  for(const q of points.slice(i+1))expect(Math.hypot(x-q[0],y-q[1])).toBeGreaterThanOrEqual(gap);
 }
});

it("Q50: the fixed 11-snuffed-entry counterexample leaves the mound clear of the count line",()=>{
 const history:HistoryEntry[]=Array.from({length:11},(_,i)=>({startedAt:i*60000,endedAt:i*60000+30000,lengthMin:1,intent:null,outcome:"snuffed",distractions:0,timeAwayMs:0}));
 const plan=planView(visibleHistory(history,{...DEFAULT_LIMITS,dayKeyOf:fixedOffsetDay(0)}));
 expect(plan.stones).toHaveLength(10);expect(plan.stonesCount).not.toBeNull();
 const bottoms=plan.stones.map(stone=>Math.max(...stoneMound(stone.face.rect).map(point=>point[1])));
 expect(COUNT_LINE_Y.stones-Math.max(...bottoms)).toBeGreaterThanOrEqual(5);
 for(const stone of plan.stones)expect(Math.max(...stoneMound(stone.face.rect).map(point=>point[1]))).toBe(stone.face.rect.y+stone.face.rect.h+9);
});
