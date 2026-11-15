// Counts the elements the art adds (design D11), with the real limits of src/graveyard/visible.ts: DEFAULT_LIMITS = 10 Stones, 3 days, 4 stubs a day.
import { room, geometry, visible } from "./source.mjs";
import { DEFS_ART, MASK_ART, SETTING_GROUP, STARS_GROUP, ghostSvg, placeSvg } from "./art.mjs";

const tags = (s) => (s.match(/<[a-zA-Z]/g) ?? []).length;
const { S, D, K } = visible.DEFAULT_LIMITS;
const base = tags(room.ROOM_SVG);
const added = tags(DEFS_ART) + tags(MASK_ART) + tags(SETTING_GROUP) + tags(STARS_GROUP);
const perGhost = tags(ghostSvg([{ index: 0, size: 1 }])) - tags(ghostSvg([])) ;
const realPerGhostBefore = 3; // layer.ts: g.ghost, g.drift, path.body
const stones = Array.from({ length: S }, (_, i) => geometry.stoneRect(i));
const rows = Array.from({ length: D }, (_, r) => ({ y: geometry.shelfRowY(r), count: K }));
const placeFull = tags(placeSvg({ stones, rows }));
const placeEmpty = tags(placeSvg({ stones: [], rows: [] }));
const out = { limits: { S, D, K }, sceneSvgBefore: base, sceneSvgAdded: added, ghostElementsEach: perGhost, ghostElementsBeforeEach: realPerGhostBefore, ghostsAdded12: 12 * (perGhost - realPerGhostBefore), placeEmpty, placeFull };
out.worstCaseAdded = added + out.ghostsAdded12 + placeFull;
console.log(JSON.stringify(out, null, 1));
