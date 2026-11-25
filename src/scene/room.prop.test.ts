import * as fc from "fast-check";
import { expect, it } from "vitest";
import { INITIAL_STATE } from "../engine";
import { PROP_PARAMS } from "../engine/test-kit";
import { CANDLE_H, FLOOR_Y } from "./constants";
import { candleHeightUnits, sceneModel } from "./model";
import { ROOM_SVG } from "./room";

const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
it("Feature: room-art, Property 9: The compact base stays behind the candle",()=>{
 fc.assert(fc.property(fc.double({min:0,max:1,noNaN:true}),wax=>{
  const errors:string[]=[];
  const candle=ROOM_SVG.indexOf('<g class="candle">');
  for(const name of ["holder","table"]){
   const at=ROOM_SVG.indexOf(`<g class="${name}">`),end=ROOM_SVG.indexOf("</g>",at);
   if(!(at>=0 && end<candle))errors.push(`${name} must finish before candle: ${at}/${end}/${candle}`);
   const inner=ROOM_SVG.slice(at,end),ys:number[]=[],xs:number[]=[];
   for(const tag of inner.matchAll(/<(rect|ellipse|path)\b[^>]*>/g)){
    const a=attrs(tag[0]);
    if(a.class==="h-shadow")continue; // The landscape-only shadow is checked in the browser with the drawn dish.
    if(tag[1]==="rect")ys.push(Number(a.y),Number(a.y)+Number(a.height));
    if(tag[1]==="ellipse"){
     ys.push(Number(a.cy)-Number(a.ry),Number(a.cy)+Number(a.ry));
     xs.push(Number(a.cx)-Number(a.rx),Number(a.cx)+Number(a.rx));
    }
    if(tag[1]==="path"){
     const d: string=String(a.d ?? "");
     for(const m of d.matchAll(/[MLQC]([^A-Za-z]*)/g)){
      const n=(m[1]?.match(/-?\d+(?:\.\d+)?/g)??[]).map(Number);
      n.forEach((v,i)=>(i%2?ys:xs).push(v));
     }
     // The holder lip's arc rises by at most its vertical radius; table H commands preserve y.
     for(const m of d.matchAll(/A([\d.]+) ([\d.]+) \d+ \d+ \d+ ([\d.]+) ([\d.]+)/g)){
      xs.push(Number(m[3]));ys.push(Number(m[4])-Number(m[2]),Number(m[4])+Number(m[2]));
     }
    }
   }
   const lo=Math.min(...ys),hi=Math.max(...ys),floor=name==="holder"?886:884,limit=name==="holder"?14:16;
   if(!(lo>=floor && hi<=FLOOR_Y && hi-lo<=limit))errors.push(`${name} y ${lo}..${hi}, floor ${floor}, height limit ${limit}`);
   if(name==="holder" && !(Math.min(...xs)>=236 && Math.max(...xs)<=364))errors.push(`holder x ${Math.min(...xs)}..${Math.max(...xs)}`);
   if(name==="table" && hi!==FLOOR_Y)errors.push(`table face ends ${hi}, expected ${FLOOR_Y}`);
  }
  const body=attrs(ROOM_SVG.match(/<rect class="body"[^>]*>/)?.[0]??"");
  const model={...sceneModel(INITIAL_STATE,0),waxHeight:wax};
  if(Number(body.height)*wax!==candleHeightUnits(model))errors.push(`drawn body ${Number(body.height)*wax} differs from model ${candleHeightUnits(model)}`);
  if(Number(body.y)+CANDLE_H!==FLOOR_Y)errors.push(`body base ${Number(body.y)+CANDLE_H}`);
  expect(errors).toEqual([]);
 }),PROP_PARAMS);
});
