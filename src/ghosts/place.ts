// Pure identity-based placement; the local box/drift copies are compared by tests.
import { GHOST_SLOTS } from "./slots";
export const GHOST_BOX = { w:70, h:75 };
export const DRIFT_UNITS = 8;
const frac = (v:number):number => v-Math.floor(v);
export function ghostLook(index:number): {variant:number;tilt:number;fx:number;fy:number} {
  return {variant:index%3,tilt:(frac(index*0.7548776662466927)*2-1)*3,fx:frac(index*0.6180339887498949)*2-1,fy:frac(index*0.4142135623730951+.3)*2-1};
}
export function spareRoom(size:number): {x:number;y:number} {
  const t=3*Math.PI/180;
  return {
    x:Math.max(0,45-DRIFT_UNITS-size*(GHOST_BOX.w/2*Math.cos(t)+GHOST_BOX.h/2*Math.sin(t))),
    y:Math.max(0,47.5-DRIFT_UNITS-size*(GHOST_BOX.h/2*Math.cos(t)+GHOST_BOX.w/2*Math.sin(t)))
  };
}
export function placeGhost(slot:number,index:number,size:number):{x:number;y:number;tilt:number;variant:number} {
  const c=GHOST_SLOTS[slot];if(!c)throw new RangeError("ghost-slot");
  const look=ghostLook(index),spare=spareRoom(size);
  return {x:c.cx+look.fx*spare.x,y:c.cy+look.fy*spare.y,tilt:look.tilt,variant:look.variant};
}
