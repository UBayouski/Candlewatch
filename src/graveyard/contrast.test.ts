import { stoneRect } from "./geometry";
import { DOORWAY, HAZE, HORIZON_Y } from "./place";
// ghosts-and-graveyard R4.14, R9.14 (design L5, L11): the contrast figures are computed from the hex values.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OVERFLOW_MARK } from "../ghosts/slots";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const sceneCss = readFileSync(join(SRC, "scene", "scene.css"), "utf8");
const uiCss = readFileSync(join(SRC, "ui", "ui.css"), "utf8");

function token(source: string, name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(source);
  if (!m) throw new Error(`token ${name} not found`);
  return (m[1] ?? "").toLowerCase();
}

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const graveyardCss = readFileSync(join(SRC, "graveyard", "graveyard.css"), "utf8");

const IVORY = "#efe6cf";
const FACE = "#1b2030"; // the Door's face in the room
const STONE = "#14192a"; // the stone: scene --wall-top (D15)
const PANEL = "#080b12"; // the backdrop's core: scene --zone-bg-darkest
const WARM = "#1a130d"; // the card and the return control: interface --ui-bg (D16, D17)
const SUBTLE = "#cfc2a2"; // Count_Lines, empty lines, "+n more": scene --wax-shade
const ROOM_BRIGHTEST = "#566683";
const ROOM_DARKEST = "#05070d";

describe("ivory text contrast from the hex values (R4.14, R9.14, L11 as amended by D15 to D17)", () => {
  it("on the Door's face #1b2030 is 13.0 and at least 4.5", () => {
    const c = contrast(IVORY, FACE);
    expect(c).toBeGreaterThanOrEqual(4.5);
    expect(c).toBeCloseTo(13.0, 1);
  });

  it("on the stone #14192a is 14.05 and at least 4.5", () => {
    const c = contrast(IVORY, STONE);
    expect(c).toBeGreaterThanOrEqual(4.5);
    expect(c).toBeCloseTo(14.05, 2);
  });

  it("on the backdrop's core #080b12 is 15.83 and at least 4.5", () => {
    const c = contrast(IVORY, PANEL);
    expect(c).toBeGreaterThanOrEqual(4.5);
    expect(c).toBeCloseTo(15.83, 2);
  });

  it("on the card's and the return control's warm fill #1a130d is 14.78 and at least 4.5", () => {
    const c = contrast(IVORY, WARM);
    expect(c).toBeGreaterThanOrEqual(4.5);
    expect(c).toBeCloseTo(14.78, 2);
  });

  it("the wax shade of the count lines on the core is 11.15 and at least 4.5", () => {
    const c = contrast(SUBTLE, PANEL);
    expect(c).toBeGreaterThanOrEqual(4.5);
    expect(c).toBeCloseTo(11.15, 2);
  });

  it("on the room's brightest stop #566683 is 4.66 and at least 4.5", () => {
    const c = contrast(IVORY, ROOM_BRIGHTEST);
    expect(c).toBeGreaterThanOrEqual(4.5);
    expect(c).toBeCloseTo(4.66, 2);
  });

  it("on the room's darkest stop #05070d is 16.20 and at least 4.5", () => {
    const c = contrast(IVORY, ROOM_DARKEST);
    expect(c).toBeGreaterThanOrEqual(4.5);
    expect(c).toBeCloseTo(16.2, 2);
  });
});

describe("the graveyard's colours are the scene's and the interface's own (D15 to D18)", () => {
  // Each token of graveyard.css that copies a colour of another sheet, and the sheet and name it copies.
  const COPIES: readonly [string, string, string][] = [
    ["--g-text", "scene", "--wax-ivory"],
    ["--g-text-subtle", "scene", "--wax-shade"],
    ["--g-panel", "scene", "--zone-bg-darkest"],
    ["--g-stone", "scene", "--wall-top"],
    ["--g-stone-edge", "scene", "--smoke-colour"],
    ["--g-ground", "scene", "--dawn-warm"],
    ["--g-wax", "scene", "--wax-ivory"],
    ["--g-wax-shade", "scene", "--wax-shade"],
    ["--g-wick", "scene", "--smoke-colour"],
    ["--g-ui-bg", "ui", "--ui-bg"],
    ["--g-ui-border", "ui", "--ui-border"],
  ];
  it.each(COPIES)("%s equals %s.css %s", (mine, sheet, theirs) => {
    expect(token(graveyardCss, mine)).toBe(token(sheet === "scene" ? sceneCss : uiCss, theirs));
  });

  it("the figures above are computed from those same tokens", () => {
    expect(token(graveyardCss, "--g-stone")).toBe(STONE);
    expect(token(graveyardCss, "--g-panel")).toBe(PANEL);
    expect(token(graveyardCss, "--g-ui-bg")).toBe(WARM);
    expect(token(graveyardCss, "--g-text-subtle")).toBe(SUBTLE);
    expect(token(graveyardCss, "--g-text")).toBe(IVORY);
  });

  it("outlines and shapes on the core and the stone are at least 3:1: stone edge, wax, the card's amber border", () => {
    expect(contrast(token(graveyardCss, "--g-stone-edge"), PANEL)).toBeGreaterThanOrEqual(3);
    expect(contrast(token(graveyardCss, "--g-stone-edge"), STONE)).toBeGreaterThanOrEqual(3);
    expect(contrast(token(graveyardCss, "--g-wax"), PANEL)).toBeGreaterThanOrEqual(3);
    expect(contrast(token(graveyardCss, "--g-wax-shade"), PANEL)).toBeGreaterThanOrEqual(3);
    expect(contrast(token(graveyardCss, "--g-ui-border"), PANEL)).toBeGreaterThanOrEqual(3);
    expect(contrast(token(graveyardCss, "--g-ui-border"), WARM)).toBeGreaterThanOrEqual(3);
  });

  it("the ground and the shelf board carry no state of their own, and are 2.38:1 on the core (D15)", () => {
    expect(contrast(token(graveyardCss, "--g-ground"), PANEL)).toBeCloseTo(2.38, 2);
  });
});
describe("the palette the figures stand on is the real one (L11)", () => {
  it("scene.css still holds the room stops the design names", () => {
    expect(token(sceneCss, "--room-bg-brightest")).toBe(ROOM_BRIGHTEST);
    expect(token(sceneCss, "--room-bg-darkest")).toBe(ROOM_DARKEST);
    expect(token(sceneCss, "--zone-bg-darkest")).toBe(PANEL);
  });

  it("ui.css ivory focus colour is the ivory of the design", () => {
    expect(token(uiCss, "--ui-focus")).toBe(IVORY);
  });

  it("the contrast computed from the live scene.css stops keeps the floor", () => {
    const bright = token(sceneCss, "--room-bg-brightest");
    const dark = token(sceneCss, "--room-bg-darkest");
    expect(contrast(IVORY, bright)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(IVORY, dark)).toBeGreaterThan(contrast(IVORY, bright));
  });
});

describe("non-text outlines and focus rings (L11, R6.19)", () => {
  // L11 names the ivory outline: on the face, on the room (both stops), on the backdrop and as the focus ring.
  it.each([
    ["the backdrop core #080b12", PANEL],
    ["the face #1b2030", FACE],
    ["the room's brightest stop", ROOM_BRIGHTEST],
    ["the room's darkest stop", ROOM_DARKEST],
  ])("an ivory outline on %s is at least 3:1", (_name, bg) => {
    expect(contrast(IVORY, bg)).toBeGreaterThanOrEqual(3);
  });
});

describe("the Door's outlines against the room (non-text, 3:1; first costume review advisory)", () => {
  // The shut door: its border and its bar are the wax shade; the usable Door's border is ivory. Both stand on the room's wall.
  const shut = (): string => {
    const m = /#ui \.graveyard \.door-shut \{[^}]*border:[^;]*var\((--g-[a-z-]+)\)/.exec(graveyardCss);
    if (!m) throw new Error("the shut door's border was not found");
    return token(graveyardCss, m[1] ?? "");
  };
  const bar = (): string => {
    const m = /#ui \.graveyard \.door-shut::after \{[^}]*background:\s*var\((--g-[a-z-]+)\)/.exec(graveyardCss);
    if (!m) throw new Error("the shut door's bar was not found");
    return token(graveyardCss, m[1] ?? "");
  };

  it.each([
    ["brightest", ROOM_BRIGHTEST],
    ["darkest", ROOM_DARKEST],
  ])("the barred Door's border and bar are at least 3:1 on the room's %s background", (_name, room) => {
    expect(contrast(shut(), room)).toBeGreaterThanOrEqual(3);
    expect(contrast(bar(), room)).toBeGreaterThanOrEqual(3);
  });

  it("the barred Door is 4.66 on the brightest background and 16.20 on the darkest (room-art Q54)", () => {
    // Q54: ivory outline matches the approved Door; the bar carries the shut state.
    expect(contrast(shut(), ROOM_BRIGHTEST)).toBeGreaterThanOrEqual(3);
    expect(contrast(shut(), ROOM_BRIGHTEST)).toBeCloseTo(4.66, 2);
    expect(contrast(shut(), ROOM_DARKEST)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(shut(), ROOM_DARKEST)).toBeCloseTo(16.20, 2);
  });

  it("the usable Door's ivory border is 4.66 and 16.20 on the same backgrounds", () => {
    expect(contrast(token(graveyardCss, "--g-text"), ROOM_BRIGHTEST)).toBeCloseTo(4.66, 2);
    expect(contrast(token(graveyardCss, "--g-text"), ROOM_DARKEST)).toBeCloseTo(16.2, 2);
  });
});

describe("the Overflow_Mark (L5, R9.14)", () => {
  it("is ivory and sits in the room, below the floor band", () => {
    expect(OVERFLOW_MARK).toEqual({ x: 545, y: 860, fontSize: 24 });
  });

  it("is 4.66 on the brightest room stop and higher on the darkest", () => {
    const bright = contrast(IVORY, token(sceneCss, "--room-bg-brightest"));
    const dark = contrast(IVORY, token(sceneCss, "--room-bg-darkest"));
    expect(bright).toBeGreaterThanOrEqual(4.5);
    expect(bright).toBeCloseTo(4.66, 2);
    expect(dark).toBeGreaterThan(bright);
  });
});

describe("room-art: new Door and Place pairs",()=>{
 it("pins every copied scene colour in the graveyard sheet (Q52)",()=>{
  const own=[...graveyardCss.matchAll(/(--(?:set-[\w-]+|window-night|window-moon|window-dawn|dawn-cool|dawn-warm|room-night)):\s*(#[0-9a-fA-F]{6})/g)];
  for(const m of own){const name=m[1]??"";if(new RegExp(`${name}:`).test(sceneCss))expect(m[2]?.toLowerCase(),name).toBe(token(sceneCss,name));}
 });
 it("keeps Door outline, handle and bar at least 3:1 against each plank",()=>{
  for(const plank of ["--set-plank-a","--set-plank-b"]){
   for(const graphic of ["--g-text","--g-amber","--g-text-subtle"])expect(contrast(token(graveyardCss,graphic),token(sceneCss,plank)),`${graphic} / ${plank}`).toBeGreaterThanOrEqual(3);
  }
 });
 it("keeps the new text backing at 4.5:1 and Stub wax at 3:1",()=>{
  for(const text of ["--g-text","--g-text-subtle"])expect(contrast(token(graveyardCss,text),token(graveyardCss,"--set-earth-a"))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(token(graveyardCss,"--g-wax"),token(graveyardCss,"--set-board-top"))).toBeGreaterThanOrEqual(3);
 });
});

/** Q53: exact mask luminance after the fixed black elliptical hole overlays the haze ramp. */
function placeNightCoverage(x:number,y:number):number {
 const ramp=Math.max(0,Math.min(1,(y-HORIZON_Y)/HAZE));
 const d=Math.hypot((x-DOORWAY.cx)/DOORWAY.sx,y-DOORWAY.cy)/DOORWAY.r;
 const hole=d>=1?0:d<=.6?.95+(.7-.95)*d/.6:.7*(1-d)/.4;
 return ramp*(1-hole);
}
it("room-art Q53: every Stone edge contrasts at least 3:1 with its brightest drawn ground",()=>{
 // Raw #8a93a6 on earth-a is 2.73; the asserted backing is darkened by the fixed p-night mask, never by dawn.
 const channels=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 const earth=channels(token(graveyardCss,"--set-earth-a")),night=channels(token(graveyardCss,"--room-night"));
 const luminanceRgb=(c:number[])=>c.reduce((s,n,i)=>{const v=n/255;return s+(v<=.04045?v/12.92:((v+.055)/1.055)**2.4)*([.2126,.7152,.0722][i]??0);},0);
 let brightest={L:-1,x:0,y:0,coverage:0};
 for(let i=0;i<10;i++){
  const r=stoneRect(i),points:number[][]=[];
  for(let x=r.x;x<=r.x+r.w;x++)points.push([x,r.y+r.h]);
  for(let y=r.y+44;y<=r.y+r.h;y++)points.push([r.x,y],[r.x+r.w,y]);
  for(let a=0;a<=90;a++){const t=a*Math.PI/180;points.push([r.x+44-44*Math.cos(t),r.y+44-44*Math.sin(t)],[r.x+r.w-44+44*Math.cos(t),r.y+44-44*Math.sin(t)]);}
  for(let x=r.x+44;x<=r.x+r.w-44;x++)points.push([x,r.y]);
  for(const [x=0,y=0] of points){const coverage=placeNightCoverage(x,y),c=earth.map((v,i)=>v*(1-coverage)+(night[i]??0)*coverage),L=luminanceRgb(c);if(L>brightest.L)brightest={L,x,y,coverage};}
 }
 const ratio=(luminance(token(graveyardCss,"--g-stone-edge"))+.05)/(brightest.L+.05);
 expect(ratio,JSON.stringify(brightest)).toBeGreaterThanOrEqual(3);
 expect(ratio).toBeCloseTo(3.74,2);
});
