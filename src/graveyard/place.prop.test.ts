import { isDeepStrictEqual } from "node:util";
import * as fc from "fast-check";
import { expect,it } from "vitest";
import { PROP_PARAMS } from "../engine/test-kit";
import type { HistoryEntry } from "../engine";
import { COUNT_LINE_Y, EMPTY_LINE_Y, LABEL_Y, TEXT_LINE_H, shelfRowY, stoneRect, stubRect } from "./geometry";
import type { Rect } from "./geometry";
import { GROUND_RECT, groundMarks, shelfBoard, stoneMound, stoneShadow, stoneSide } from "./place";
import { planView } from "./plan";
import { arbCrowdedHistory, arbHistory, fixedOffsetDay } from "./test-kit";
import { DEFAULT_LIMITS, visibleHistory } from "./visible";
const intersects=(a:Rect,b:Rect)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
const contains=(a:Rect,b:Rect)=>a.x<=b.x&&a.y<=b.y&&a.x+a.w>=b.x+b.w&&a.y+a.h>=b.y+b.h;
const bounds=(pts:readonly (readonly [number,number])[]):Rect=>{
 const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
 return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
};
// Scatter depends only on these rectangles; reuse each distinct layout without changing the source function.
const marksByLayout = new Map<string, ReturnType<typeof groundMarks>>();
function marksFor(texts: Rect[]): ReturnType<typeof groundMarks> {
 const key=JSON.stringify(texts);
 let marks=marksByLayout.get(key);
 if (!marks) { marks=groundMarks(7741,texts); marksByLayout.set(key,marks); }
 return marks;
}
it("Feature: room-art, Property 11: The Place keeps off every text line",()=>{
 const fullStones: HistoryEntry[]=Array.from({length:11},(_,i)=>({startedAt:i*60000,endedAt:i*60000+30000,lengthMin:1,intent:null,outcome:"snuffed",distractions:0,timeAwayMs:0}));
 const fullShelf: HistoryEntry[]=Array.from({length:5},(_,i)=>({startedAt:i*60000,endedAt:(i+1)*60000,lengthMin:1,intent:null,outcome:"burned-out",distractions:0,timeAwayMs:0}));
 fc.assert(fc.property(fc.oneof(arbHistory,arbCrowdedHistory),history=>{
  const violations:string[]=[];
  const visible=visibleHistory(history,{...DEFAULT_LIMITS,dayKeyOf:fixedOffsetDay(0)}),plan=planView(visible);
  const line=(y:number):Rect=>({x:14,y,w:572,h:TEXT_LINE_H});
  const texts:Rect[]=[line(LABEL_Y.stones),line(LABEL_Y.shelf)];
  if(plan.stonesCount!==null)texts.push(line(COUNT_LINE_Y.stones));
  if(plan.daysCount!==null)texts.push(line(COUNT_LINE_Y.shelf));
  if(plan.stones.length===0)texts.push(line(EMPTY_LINE_Y.stones));
  if(plan.rows.length===0)texts.push(line(EMPTY_LINE_Y.shelf));
  for(const row of plan.rows){texts.push(row.labelRect);if(row.more)texts.push(row.more.rect);}
  // Q48: the sky, hills and ground are backing Surfaces; only Props and marks must keep off text.
  const props:{kind:string;rect:Rect}[]=[];
  plan.rows.forEach((row,ri)=>{
   props.push({kind:`board row ${ri}`,rect:shelfBoard(shelfRowY(ri),row.stubs.length)});
   row.stubs.forEach((stub,si)=>{
    const expected=stubRect(ri,si);
    if (!isDeepStrictEqual(stub.rect,expected)) violations.push(`stub ${ri}/${si} rectangle ${JSON.stringify(stub.rect)} != ${JSON.stringify(expected)}`);
    if (!contains(GROUND_RECT,stub.rect)) violations.push(`stub ${ri}/${si} ${JSON.stringify(stub.rect)} outside ground ${JSON.stringify(GROUND_RECT)}`);
   });
  });
  plan.stones.forEach((stone,i)=>{
   const r=stone.rect,expected=stoneRect(i),foot={x:r.x,y:r.y+r.h,w:r.w,h:0};
   if (!isDeepStrictEqual(r,expected)) violations.push(`stone ${i} rectangle ${JSON.stringify(r)} != ${JSON.stringify(expected)}`);
   if (!contains(GROUND_RECT,foot)) violations.push(`stone ${i} foot ${JSON.stringify(foot)} outside ground ${JSON.stringify(GROUND_RECT)}`);
   props.push({kind:`stone ${i} mound`,rect:bounds(stoneMound(r))},{kind:`stone ${i} shadow`,rect:bounds(stoneShadow(r))});
   props.push(...stoneSide(r).map((rect,si)=>({kind:`stone ${i} side ${si}`,rect})));
  });
  for(const prop of props)texts.forEach((text,ti)=>{
   if (intersects(prop.rect,text)) violations.push(`${prop.kind} ${JSON.stringify(prop.rect)} intersects text ${ti} ${JSON.stringify(text)}`);
  });
  const marks=marksFor(texts);
  for (const [kind,points] of [["pebble",marks.pebbles],["blade",marks.blades]] as const) points.forEach((point,pi)=>{
   texts.forEach((text,ti)=>{
    if (point[0]>=text.x&&point[0]<=text.x+text.w&&point[1]>=text.y&&point[1]<=text.y+text.h) violations.push(`${kind} ${pi} [${point}] intersects text ${ti} ${JSON.stringify(text)}`);
   });
  });
  expect(violations).toEqual([]);
 }),{...PROP_PARAMS,examples:[[fullStones],[fullShelf]]});
});
