// Test-only read of the approved reference. No runtime module reads these files.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { stoneRect, stubRect } from "../graveyard/geometry";
import { DEFAULT_LIMITS } from "../graveyard/visible";
import { WALL, wallTile } from "../scene/setting";
import { DOOR_RECT, FLOOR_UNITS, GHOST_CELLS, KEEP_CLEAR_COLUMN_UNITS, KEEP_CLEAR_WINDOW_UNITS, ROOM_H, ROOM_W } from "../ui/layout";

const root = join(import.meta.dirname, "../..");
const reference = join(root, ".kiro/specs/room-art/prototype");
interface Tokens { scene: Record<string,string>; geometry: {stage: number[]; floorY:number; doorRect:typeof DOOR_RECT; ghostCells:typeof GHOST_CELLS; window:typeof KEEP_CLEAR_WINDOW_UNITS; column:typeof KEEP_CLEAR_COLUMN_UNITS; stone0:ReturnType<typeof stoneRect>; stub00:ReturnType<typeof stubRect>; limits:typeof DEFAULT_LIMITS} }
function readTokens(): Tokens {
  return JSON.parse(readFileSync(join(reference,"tokens.json"),"utf8")) as Tokens;
}
it("the recorded scene stops and geometry equal the real source",()=>{
 const tokens=readTokens(),css=readFileSync(join(root,"src/scene/scene.css"),"utf8");
 for(const [name,value] of Object.entries(tokens.scene))expect(css.match(new RegExp(name+":\\s*([^;]+);"))?.[1]?.trim(),name).toBe(value);
 expect(tokens.geometry).toEqual({stage:[ROOM_W,ROOM_H],floorY:FLOOR_UNITS,doorRect:DOOR_RECT,ghostCells:GHOST_CELLS,window:KEEP_CLEAR_WINDOW_UNITS,column:KEEP_CLEAR_COLUMN_UNITS,stone0:stoneRect(0),stub00:stubRect(0,0),limits:DEFAULT_LIMITS});
});
it("the joint rect and all five tone paths equal the approved tile",()=>{
 const html=readFileSync(join(reference,"index.html"),"utf8");
 const pattern=html.match(/<pattern\b[^>]*id="cw\d+-stone"[^>]*>[\s\S]*?<\/pattern>/)?.[0];
 expect(pattern).toBeDefined();
 expect(pattern?.replace(/cw\d+-/g,"cw-")).toBe(wallTile(WALL.seed));
});
const walk=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
it("the reference stays outside shipped folders and runtime imports",()=>{
 for(const folder of ["src","public"]){
  expect(existsSync(join(root,folder,"prototype"))).toBe(false);
  const dir=join(root,folder);if(!existsSync(dir))continue;
  for(const path of walk(dir).filter(p=>/\.(?:ts|css|js)$/.test(p)&&!/(?:\.test\.ts|test-kit\.ts|scene-kit\.ts)$/.test(p)))expect(readFileSync(path,"utf8"),path).not.toMatch(/prototype[\\/]/);
 }
});
