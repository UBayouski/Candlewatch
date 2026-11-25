import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ghostShape } from "../ghosts/silhouette";
import { shelfBoard } from "../graveyard/place";
import { ROOM_SVG } from "./room";
import { DOOR_WOOD, HOLDER, PANE_FRAME, TABLE } from "./setting";
const root=join(import.meta.dirname,"..");
const read=(file:string)=>readFileSync(join(root,file),"utf8");
const walk=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
const sheets=["scene/scene.css","ghosts/ghosts.css","graveyard/graveyard.css"];
const tokens=()=>[...ROOM_SVG.matchAll(/<\/?[A-Za-z][^>]*>/g)];
it("room-art costume: no forbidden ornament words in source, constants or comments",()=>{
 const words=["bat","bats","pumpkin","jack-o-lantern","cobweb","cobwebs","spiderweb","spider","skull","skeleton","bones","cauldron","witch","broom","coffin","raven","crow"];
 const pattern=new RegExp(`\\b(?:${words.join("|")})\\b`,"gi"),errors:string[]=[];
 for(const file of [...["scene","ghosts","graveyard"].flatMap(f=>walk(join(root,f))),join(root,"strings.ts")]){
  if(file===join(import.meta.dirname,"costume.test.ts"))continue;
  const text=readFileSync(file,"utf8");for(const m of text.matchAll(pattern))errors.push(`${file}:${text.slice(0,m.index).split("\n").length}: ${m[0]}`);
 }
 expect(errors).toEqual([]);
});
it("room-art costume: non-state art uses the setting or the lit foreground of the dish",()=>{
 const allowed=new Set(["wall","night","dawn-tint","window","stars","candle","lit","holder-foreground","zone","setting","warm-tint"]),stack:{tag:string;allowed:boolean}[]=[],errors:string[]=[];
 for(const m of tokens()){
  const raw=m[0],tag=raw.match(/^<\/?([\w-]+)/)?.[1]??"";
  if(raw.startsWith("</")){const last=stack.pop();if(last?.tag!==tag)errors.push(`unbalanced ${tag}`);continue;}
  const classes=raw.match(/class="([^"]*)"/)?.[1]?.split(/\s+/)??[];
  const ok=tag==="svg"||tag==="defs"||tag==="mask"||stack.at(-1)?.allowed||classes.some(c=>allowed.has(c));
  if(!ok)errors.push(`outside setting/state group: ${raw}`);
  if(!raw.endsWith("/>"))stack.push({tag,allowed:Boolean(ok && tag!=="svg")});
 }
 expect(ROOM_SVG.indexOf('<g class="setting">')).toBeLessThan(ROOM_SVG.indexOf('class="night"'));
 const foreground=ROOM_SVG.match(/<g class="holder-foreground">([\s\S]*?)<\/g>/)?.[1]??"";
 expect([...foreground.matchAll(/<([\w-]+) class="([^"]+)"/g)].map(m=>[m[1],m[2]])).toEqual([
  ["path","h-front"],["path","h-front-night"],
 ]);
 expect(foreground).toContain('mask="url(#cw-pool-mask)"');
 expect(errors).toEqual([]);
});
it("room-art costume: setting selectors cannot animate or read model variables",()=>{
 const errors:string[]=[],model=read("scene/render.ts").match(/"--[\w-]+"/g)??[];
 for(const file of sheets){const css=read(file).replace(/\/\*[\s\S]*?\*\//g,"");
  for(const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
   const sel=m[1]??"",body=m[2]??"";
   if(!/\.(?:setting|s-[\w-]+|t-[\w-]+|h-[\w-]+|f-[\w-]+|w-[\w-]+|st-veil|st-table-[\w-]+)(?=[\s.:#>{,]|$)/.test(sel))continue;
   if(/(?:animation|transition)\s*:/.test(body)||model.some(v=>body.includes(`var(${v.slice(1,-1)}`)))errors.push(`${file} ${sel.trim()}: ${body}`);
  }
 }
 expect(errors).toEqual([]);
 expect(read("scene/setting.prop.test.ts")).toContain("Property 8:");
});
it("room-art costume: props are not state shapes and keep clear of co-visible state",()=>{
 const setting=ROOM_SVG.match(/<g class="setting">([\s\S]*?)<\/g>\s*<rect class="warm-tint"/)?.[1]??"";
 const other=ROOM_SVG.replace(setting,"");
 const paths=(s:string)=>[...s.matchAll(/<path\b[^>]*d="([^"]*)"/g)].map(m=>m[1]?.replace(/\s+/g," ").trim());
 const statePaths=[...paths(other),ghostShape(0),ghostShape(1),ghostShape(2)];
 for(const d of paths(setting))expect(statePaths,`setting path duplicates state shape: ${d}`).not.toContain(d);
 // Rectangular props cannot copy either candle rectangle, even with a different class/fill.
 const signatures=(svg:string)=>[...svg.matchAll(/<rect\b[^>]*>/g)].map(m=>{const a=Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(v=>[v[1],v[2]]));return [a.x,a.y,a.width,a.height].join(",");});
 const candle=ROOM_SVG.match(/<g class="candle">([\s\S]*?)<\/g>/)?.[1]??"";
 for(const signature of signatures(setting))expect(signatures(candle),`setting rectangle duplicates candle: ${signature}`).not.toContain(signature);
 const intersects=(a:{x:number;y:number;w:number;h:number},b:typeof a)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
 const flame={x:270,y:340,w:60,h:120},halo={x:180,y:290,w:240,h:240},wax={x:268,y:480,w:64,h:420},zone={x:-2200,y:900,w:5000,h:700};
 const props=[{name:"frame",r:{x:PANE_FRAME.x,y:PANE_FRAME.y,w:PANE_FRAME.w,h:PANE_FRAME.h}},{name:"door wood",r:DOOR_WOOD.arch},{name:"table",r:{x:-2200,y:TABLE.y,w:5000,h:TABLE.h}},{name:"holder",r:HOLDER}];
 for(const {name,r} of props)for(const [state,b] of [["flame",flame],["halo",halo],["wax",wax],["zone",zone]] as const){
  if((name==="table"||name==="holder")&&(state==="wax"||state==="halo"))continue;
  expect(intersects(r,b),`${name} meets ${state}`).toBe(false);
 }
 // Place boards coexist with Place items, never the room's candle/ghost layer; they must stay above its retained zone.
 for(let row=0;row<3;row++)expect(intersects(shelfBoard(505+84*row,4),zone),`board ${row} meets zone`).toBe(false);
 for(const surface of ["wall-stone","wall-veil"])expect(setting).toContain(`class="${surface}"`);
 for(const surface of ["p-ground","p-sky"])expect(read("graveyard/view-dom.ts")).toContain(`"${surface}"`);
});
