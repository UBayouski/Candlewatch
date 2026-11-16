import { isDeepStrictEqual } from "node:util";
import * as fc from "fast-check";
import { expect, it } from "vitest";
import { PROP_PARAMS } from "../engine/test-kit";
import { PANES, STARS, WALL, wallBlocks, wallCoursesB, wallHeights, starOpacity } from "./setting";

/** Only walk a differing value on failure, keeping the diagnostic short and precise. */
function firstDifference(a: unknown, b: unknown, name: string): string {
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const av = (a as Record<string, unknown>)[key], bv = (b as Record<string, unknown>)[key];
      if (!isDeepStrictEqual(av, bv)) return firstDifference(av, bv, `${name}.${key}`);
    }
  }
  return `${name}: ${String(a)} != ${String(b)}`;
}

it("Feature: room-art, Property 7: The Window_Sky's stars lie in the glass", () => {
  const snapshot = structuredClone(STARS);
  fc.assert(fc.property(fc.double({min:0,max:1,noNaN:true}), fc.double({min:0,max:1,noNaN:true}), (dawn, other) => {
    const violations: string[] = [];
    if (!isDeepStrictEqual(STARS, snapshot)) violations.push(firstDifference(STARS, snapshot, "stars changed"));
    if (!(STARS.length <= 9)) violations.push(`star count ${STARS.length} > 9`);
    STARS.forEach(([x,y,r], i) => {
      if (!(r*2 >= 1 && r*2 <= 2)) violations.push(`star ${i} diameter ${r*2} outside 1..2`);
      if (!PANES.some(p=>x-r>=p.x&&x+r<=p.x+p.w&&y-r>=p.y&&y+r<=p.y+p.h)) violations.push(`star ${i} [${x},${y},${r}] outside panes`);
    });
    const opacity = starOpacity(dawn), expected = 1-dawn;
    if (!(Math.abs(opacity-expected) < .5*10**-12)) violations.push(`opacity at ${dawn}: ${opacity} != ${expected} to 12 places`);
    const withOther = Reflect.apply(starOpacity,null,[dawn,other]);
    if (!Object.is(withOther,opacity)) violations.push(`opacity depends on other ${other}: ${withOther} != ${opacity}`);
    if (!Object.is(starOpacity(0),1)) violations.push(`opacity(0) ${starOpacity(0)} != 1`);
    if (!Object.is(starOpacity(1),0)) violations.push(`opacity(1) ${starOpacity(1)} != 0`);
    expect(violations).toEqual([]);
  }),PROP_PARAMS);
});

it("shipped-seed non-null joints meet the 3.4-unit floor",()=>{
  const violations: string[] = [];
  for (const b of wallBlocks(WALL.seed)) {
    if (b.joint && !(b.joint.width >= 3.4)) violations.push(`joint c${b.c}b${b.i}: ${b.joint.width} < 3.4`);
  }
  expect(violations).toEqual([]);
});

it("Feature: room-art, Property 14: Wall B's generator keeps its invariants",()=>{
 fc.assert(fc.property(fc.integer(),seed=>{
  const violations: string[] = [];
  const courses=wallCoursesB(seed),heights=wallHeights(seed);
  if (courses.length !== 8) violations.push(`course count ${courses.length} != 8`);
  if (heights.length !== 8) violations.push(`height count ${heights.length} != 8`);
  heights.forEach((h,i)=>{if (!(h>=64 && h<=96)) violations.push(`course ${i} height ${h} outside 64..96`);});
  const repeated=wallCoursesB(seed);
  if (!isDeepStrictEqual(courses,repeated)) violations.push(firstDifference(courses,repeated,`determinism seed ${seed} courses`));
  const circleDistance=(x:number,y:number)=>Math.min(Math.abs(x-y),960-Math.abs(x-y));
  const overlaps=(a:{x:number;w:number},b:{x:number;w:number})=>[-960,0,960].some(dx=>a.x<b.x+dx+b.w&&b.x+dx<a.x+a.w);
  courses.forEach((row,ci)=>{
   const nextIndex=(ci+1)%8, aboveIndex=(ci+7)%8;
   const next=courses[nextIndex],above=courses[aboveIndex];
   if (!next) violations.push(`course ${ci}: next course ${nextIndex} missing`);
   if (!above) violations.push(`course ${ci}: above course ${aboveIndex} missing`);
   const width=row.reduce((sum,b)=>sum+b.w,0);
   if (width !== 960) violations.push(`course ${ci} total width ${width} != 960`);
   row.forEach((b,bi)=>{
    const id=`c${ci}b${bi}`;
    if (!(b.w>=105 && b.w<=240)) violations.push(`${id} width ${b.w} outside 105..240`);
    if (!(b.off>=-6 && b.off<=6)) violations.push(`${id} offset ${b.off} outside -6..6`);
    const ni=(bi+1)%row.length,neighbour=row[ni];
    if (!neighbour) violations.push(`${id} neighbour b${ni} missing`);
    else if (!(Math.abs(b.off-neighbour.off)>=3)) violations.push(`${id}/b${ni} offset difference ${Math.abs(b.off-neighbour.off)} < 3`);
    // Q49: adjacent blocks in one course may both be accents; only above/below overlaps are forbidden.
    if (next) next.forEach((other,oi)=>{
      const distance=circleDistance(b.x,other.x);
      if (!(distance>=30)) violations.push(`${id}/c${nextIndex}b${oi} joint distance ${distance} < 30`);
    });
    for (const [adjacentIndex,adjacentCourse] of [[aboveIndex,above],[nextIndex,next]] as const) {
      adjacentCourse?.forEach((other,oi)=>{
        if (overlaps(b,other) && b.t>=3 && other.t>=3) violations.push(`${id}/c${adjacentIndex}b${oi} overlapping accents ${b.t}/${other.t}`);
      });
    }
   });
  });
  expect(violations).toEqual([]);
 }),{...PROP_PARAMS,examples:[[WALL.seed]]});
});
