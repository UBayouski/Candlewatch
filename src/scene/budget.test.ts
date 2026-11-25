import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { createGhostLayer } from "../ghosts/layer";
import { placeSvg } from "../graveyard/view-dom";
import { planView } from "../graveyard/plan";
import { placeControls } from "../ui/layout";
import { DEFAULT_LIMITS, visibleHistory } from "../graveyard/visible";
import type { HistoryEntry } from "../engine";
import { MAX_BUILT_CODE_BYTES } from "./constants";
import { ROOM_SVG } from "./room";
const elements=(svg:string)=>(svg.match(/<[A-Za-z][^/\s>]*(?:\s|>)/g)??[]).length;
it("publishes the production byte ceiling that the built-file test enforces", () => {
  const steering = readFileSync(new URL("../../.kiro/steering/tech.md", import.meta.url), "utf8");
  const ceiling = steering.match(/JS and CSS in `dist\/` total at most ([\d ]+) bytes/)?.[1];
  expect(Number(ceiling?.replaceAll(" ", ""))).toBe(MAX_BUILT_CODE_BYTES);
});
it("room-art budget: actual scene, 12 ghosts and full Place total at most 415 elements",()=>{
 let ghostCount=0;
 const make=()=>{ghostCount++;const attrs=new Map<string,string>();return {setAttribute:(k:string,v:string)=>attrs.set(k,v),getAttribute:(k:string)=>attrs.get(k)??null,hasAttribute:(k:string)=>attrs.has(k),removeAttribute:(k:string)=>attrs.delete(k),append:()=>{},insertBefore:()=>{}};};
 vi.stubGlobal("document",{createElementNS:make});
 try {
  createGhostLayer({append:()=>{}} as unknown as HTMLElement).apply({on:true,reduced:true,layout:placeControls(1280,800),ghosts:{hidden:0,drawn:Array.from({length:12},(_,index)=>({index,slot:index,size:1}))}});
 } finally {vi.unstubAllGlobals();}
 const history:HistoryEntry[]=Array.from({length:22},(_,i)=>({startedAt:1800000000000+i*60000,endedAt:1800000000000+i*60000+30000,lengthMin:1,intent:null,outcome:i<10?"snuffed":"burned-out",distractions:0,timeAwayMs:0}));
 const visible=visibleHistory(history,{...DEFAULT_LIMITS,dayKeyOf:ms=>String(Math.floor((ms-1800000000000-630000)/240000))});
 const plan=planView(visible);expect(plan.stones).toHaveLength(10);expect(plan.rows).toHaveLength(3);for(const row of plan.rows)expect(row.stubs).toHaveLength(4);
 const ghosts=ghostCount;placeSvg(plan,{createElementNS:make} as unknown as Document);
 const counts={scene:elements(ROOM_SVG),ghosts,place:ghostCount-ghosts};
 const total = counts.scene + counts.ghosts + counts.place;
 console.log("Maximum-content element count", { ...counts, total });
 expect(total,JSON.stringify(counts)).toBeLessThanOrEqual(415);
 expect(counts.ghosts).toBe(78);
 expect(counts.place).toBe(128);
});
it("room-art budget: no expensive filter and no CSS filter on per-frame groups",()=>{
 for(const file of ["scene/room.ts","scene/scene.css","ghosts/layer.ts","ghosts/ghosts.css","graveyard/view-dom.ts","graveyard/graveyard.css"]){
  const text=readFileSync(new URL("../"+file,import.meta.url),"utf8");
  expect(text,file).not.toMatch(/feTurbulence|feDisplacementMap|feMorphology|feConvolveMatrix/);
  if(file.endsWith(".css"))for(const m of text.replace(/\/\*[\s\S]*?\*\//g,"").matchAll(/([^{}]+)\{([^{}]*)\}/g)){
   if(/(?:^|;)\s*filter\s*:/.test(m[2]??""))expect(m[1]?.trim(),file).toMatch(/^\.zone-(?:rest|dawn)$/);
  }
 }
});
