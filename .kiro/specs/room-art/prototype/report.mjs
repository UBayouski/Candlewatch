// Prints the figures of measurements.json against the floors (what the design quotes).   node report.mjs
import { readFileSync } from "node:fs";
const m = JSON.parse(readFileSync(new URL("measurements.json", import.meta.url), "utf8"));
const min = (xs) => Math.min(...xs);
const STATES = ["idle", "lit-start", "lit-half", "last-minute", "paused", "burned-out"];
console.log("== edges (R7.6, floor 8): min over 30/60/80 percent and both sides");
for (const [vp, r] of Object.entries(m.viewports)) console.log(vp.padEnd(10), STATES.map((s) => `${s} ${r[s].edgeMin}`).join(" | "), "| snuffed", r.snuffed.edgeMin);
console.log("== idle over snuffed (R7.7, floor 1.10); snuffed not brighter than another state");
for (const [vp, r] of Object.entries(m.viewports)) console.log(vp.padEnd(10), JSON.stringify(r.idleOverSnuffed), JSON.stringify(r.snuffedNotBrighter));
const js = (s, pick) => min(Object.entries(m.viewports).flatMap(([, r]) => Object.values(r[s].samples).map(pick)));
console.log("== minima over all 7 sizes and 4 samples");
for (const s of STATES) console.log(s.padEnd(12), "boardToNight", js(s, (x) => x.boardToNight), "jointVsBoard", js(s, (x) => x.jointVsBoard));
console.log("== parts against night, idle (R3.19, floor 1.10), min over sizes");
for (const k of ["table", "frame", "doorWood", "wall", "glass"]) console.log(k.padEnd(9), "idle", min(Object.values(m.viewports).map((r) => r.idle.partsToNight[k])), "snuffed", min(Object.values(m.viewports).map((r) => r.snuffed.partsToNight[k])));
console.log("== frame against glass: idle", min(Object.values(m.viewports).map((r) => r.idle.frameVsGlass)), "burned-out", min(Object.values(m.viewports).map((r) => r["burned-out"].frameVsGlass)));
console.log("== max wall luminance (ceiling", m.ceiling.luminance + ")");
for (const [vp, r] of Object.entries(m.viewports)) console.log(vp.padEnd(10), ["lit-start", "lit-half", "last-minute"].map((s) => `${s} ${r[s].maxWallLuminance}`).join(" | "));
console.log("== pool against window");
for (const [vp, o] of Object.entries(m.pool)) for (const [k, p] of Object.entries(o)) for (const lab of ["withHalo", "haloHidden"]) { const q = p[lab]; console.log(vp, k, lab.padEnd(10), `tone ${q.toneClass}`, `in@${q.inside.at.map(Math.round)} d${q.inside.distFromFlame} rgb ${q.inside.rgb}`, `out@${q.outside.at.map(Math.round)} d${q.outside.distFromFlame} rgb ${q.outside.rgb}`, `wcag ${q.poolRatioWcag}`, `lum ${q.poolRatioLum}`); }
console.log("== columns", JSON.stringify(m.columns, null, 0));
console.log("== ultrawide edges", JSON.stringify(m.ultrawide));
console.log("== sharpness (edge over near)");
for (const [vp, o] of Object.entries(m.sharpness)) console.log(vp, JSON.stringify(o));
console.log("== zone");
for (const [k, z] of Object.entries(m.zone)) console.log(k, ["pause", "snuff", "settings-button"].map((b) => `${b} w${z[b].w} ${z[b].iconEdge}/${z[b].labelEdge}`).join(" | "), "T", z.pause.x, z.timeBox.x, z.timeBox.right, z.snuff.x);
