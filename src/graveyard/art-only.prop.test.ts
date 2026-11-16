import * as fc from "fast-check";
import { expect, it } from "vitest";
import { INITIAL_STATE, serializeHistory, serializeSession, step } from "../engine";
import type { State } from "../engine";
import { PROP_PARAMS, arbScript, arbT0, runScript } from "../engine/test-kit";
import { DEFAULT_SETTINGS, parseSettings, serializeSettings } from "../storage/settings";
import { initialUi, uiStep } from "../ui/ui-state";
import { sceneModel } from "../scene/model";
import { cardStep, NO_CARD } from "./card";
import { viewStep } from "./view";

type Art="viewSwitch"|"openCard"|"reducedMotion"|"ghostsOff";
/** An interleaver models only art inputs; engine events are deliberately confined to runScript. */
function artInput(state:State,kind:Art,now:number):State {
 const before=structuredClone(state);
 switch(kind){
  case "viewSwitch":viewStep("room",{type:"open",phase:state.phase});viewStep("graveyard",{type:"leave"});break;
  case "openCard":cardStep(NO_CARD,{type:"focus",id:"stone-0"});break;
  case "reducedMotion":sceneModel(state,now,{reducedMotion:true});uiStep(initialUi(DEFAULT_SETTINGS),{type:"action",action:{type:"open-settings"}},state.phase);break;
  case "ghostsOff":parseSettings(serializeSettings({...DEFAULT_SETTINGS,ghosts:false}));break;
 }
 expect(state).toEqual(before);
 return state;
}
it("Feature: room-art, Property 12: Art-only inputs never change the engine state",()=>{
 fc.assert(fc.property(arbT0,arbScript,fc.array(fc.constantFrom<Art>("viewSwitch","openCard","reducedMotion","ghostsOff"),{minLength:1,maxLength:12}),(t0,script,arts)=>{
  const lit=step(INITIAL_STATE,{type:"light",length:25},t0);
  const trace=runScript(script,t0,lit),alone=trace.at(-1)?.after??lit;
  let interleaved:State=lit;
  // Run every original event at the original time; art inputs may never settle the engine themselves.
  for(const row of trace){for(const art of arts)interleaved=artInput(interleaved,art,row.now);interleaved=step(interleaved,row.event,row.now);}
  for(const art of arts)interleaved=artInput(interleaved,art,t0+90*60000);
  expect(interleaved).toEqual(alone);
  expect(serializeSession(interleaved)).toBe(serializeSession(alone));expect(serializeHistory(interleaved.history)).toBe(serializeHistory(alone.history));
 }),{...PROP_PARAMS,examples:[[1800000000000,[],["openCard"]]]});
});
