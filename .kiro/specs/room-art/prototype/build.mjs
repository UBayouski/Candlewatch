// Generates prototype/index.html (one file, inline SVG and CSS, no script) and prototype/tokens.json.
//   node .kiro/specs/room-art/prototype/build.mjs
// The room is the REAL markup of src/scene/room.ts, patched with the new art of art.mjs. The tokens come from the stylesheets of src/,
// linked by <link> (scene.css, ui.css, ghosts.css, graveyard.css) and read by this script where a value is needed (the Place's tokens).
// The geometry (600 x 1000 stage, DOOR_RECT, GHOST_CELLS, window, floor line, Stone and Stub rectangles, control rectangles) and every
// graveyard text come from the real modules (layout.ts, geometry.ts, plan.ts, visible.ts, text.ts, strings.ts). Nothing is shipped.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { layout, geometry, room, visible, plan, STRINGS, SRC } from "./source.mjs";
import { ART_CSS, defsArt, MASK_ART, settingGroup, STARS_GROUP, TINT_DEFS, TINT_RECT, ghostSvg, ghostStrip, placeSvg } from "./art.mjs";

const here = new URL("./", import.meta.url);
const srcText = (p) => readFileSync(new URL(p, SRC), "utf8");

// ---------------------------------------------------------------- tokens read from the real stylesheets
const sceneCss = srcText("scene/scene.css");
const tokenOf = (css, name) => {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`token ${name} not found`);
  return m[1].trim();
};
const PLACE_TOKENS = ["window-night", "window-moon", "window-dawn", "dawn-cool", "dawn-warm", "room-night"];
const placeTokenCss = `.place { ${PLACE_TOKENS.map((t) => `--${t}: ${tokenOf(sceneCss, `--${t}`)};`).join(" ")} }`;
writeFileSync(
  new URL("tokens.json", here),
  JSON.stringify(
    {
      scene: Object.fromEntries(["--room-night", "--room-bg-darkest", "--room-bg-brightest", "--zone-bg-darkest", "--wall-top", "--wall-low", "--window-moon", "--window-night", "--window-dawn", "--dawn-cool", "--dawn-warm", "--dawn-alpha"].map((t) => [t, tokenOf(sceneCss, t)])),
      geometry: { stage: [layout.ROOM_W, layout.ROOM_H], floorY: layout.FLOOR_UNITS, doorRect: layout.DOOR_RECT, ghostCells: layout.GHOST_CELLS, window: layout.KEEP_CLEAR_WINDOW_UNITS, column: layout.KEEP_CLEAR_COLUMN_UNITS, stone0: geometry.stoneRect(0), stub00: geometry.stubRect(0, 0), limits: visible.DEFAULT_LIMITS },
    },
    null,
    2,
  ) + "\n",
);

// ---------------------------------------------------------------- the history shown in the graveyard pictures (real plan, real text)
const DAY = 86_400_000;
const T_DAY0 = Date.UTC(2026, 10, 10, 16, 0, 0);
const dayKeyOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const LONG_STONE = "Draft the long, long report about the lighthouse keeper and his last candle";
const LONG_STUB = "Review the migration plan for the harbour lights and write the notes";
function entry(daysAgo, hour, outcome, intent, lengthMin, distractions, timeAwayMs) {
  const endedAt = T_DAY0 - daysAgo * DAY + hour * 3_600_000;
  return { startedAt: endedAt - lengthMin * 60_000, endedAt, lengthMin, intent, outcome, distractions, timeAwayMs };
}
const HISTORIES = {
  small: [
    entry(2, 1, "snuffed", "Fix the build", 25, 4, 190_000),
    entry(2, 3, "burned-out", "Plan the week", 50, 1, 20_000),
    entry(2, 5, "burned-out", null, 25, 0, 0),
    entry(2, 7, "burned-out", "Read the manual", 25, 2, 45_000),
    entry(1, 2, "snuffed", null, 15, 3, 120_000),
    entry(1, 4, "burned-out", "Tidy the desk", 25, 0, 0),
    entry(0, 1, "snuffed", "Write the report", 25, 1, 30_000),
    entry(0, 3, "burned-out", "Answer the mail", 25, 2, 60_000),
    entry(0, 5, "burned-out", "Study", 50, 0, 0),
  ],
  stoneCard: [
    entry(2, 1, "snuffed", "Fix the build", 25, 4, 190_000),
    entry(2, 3, "burned-out", "Plan the week", 50, 1, 20_000),
    entry(1, 2, "snuffed", null, 15, 3, 120_000),
    entry(1, 4, "burned-out", "Tidy the desk", 25, 0, 0),
    entry(0, 1, "snuffed", LONG_STONE, 25, 5, 410_000),
    entry(0, 3, "burned-out", "Answer the mail", 25, 2, 60_000),
  ],
  stubCard: [
    entry(2, 1, "snuffed", "Fix the build", 25, 4, 190_000),
    entry(1, 2, "snuffed", null, 15, 3, 120_000),
    entry(1, 4, "burned-out", "Tidy the desk", 25, 0, 0),
    entry(0, 1, "snuffed", "Write the report", 25, 1, 30_000),
    entry(0, 3, "burned-out", "Answer the mail", 25, 2, 60_000),
    entry(0, 5, "burned-out", LONG_STUB, 50, 3, 150_000),
  ],
};
const planOf = (h) => plan.planView(visible.visibleHistory(HISTORIES[h], { ...visible.DEFAULT_LIMITS, dayKeyOf }));

// ---------------------------------------------------------------- the pictures
const S = STRINGS.status;
const fillTime = (s, time) => s.replace("{time}", time);
const ROOM_DEFAULT = { "--wax-height": 1, "--drips": 0, "--flame-height": 0, "--flame-blue": 0, "--flame-ragged": 0, "--flame-glow": 0, "--smoke": 0, "--stub": 0, "--light-radius": 0.2, "--dawn": 0, "--cooling": 0 };
const g = (sizes) => sizes.map((size, index) => ({ index, size }));
const LIT_HALF = { vars: { "--wax-height": 0.5, "--drips": 2, "--flame-height": 1, "--flame-glow": 1, "--light-radius": 0.6 }, phase: "lit", run: true, time: "12:30", status: S.lit, ghosts: g([0.25, 0.9, 0.4, 1, 0.55, 0.3]) };
const LAST_MINUTE = { vars: { "--wax-height": 0.04, "--drips": 3, "--flame-height": 0.6, "--flame-ragged": 1, "--flame-glow": 0.55, "--light-radius": 0.232 }, phase: "lit", run: true, time: "00:59", status: S.guttering, ghosts: g([0.5, 0.3, 0.8, 0.25, 1, 0.45, 0.6, 0.35, 0.7]) };
const PICTURES = [
  { key: "lit-start", vars: { "--flame-height": 1, "--flame-glow": 1, "--light-radius": 1 }, phase: "lit", run: true, time: "25:00", status: S.lit, ghosts: [] },
  { key: "lit-half", ...LIT_HALF },
  { key: "last-minute", ...LAST_MINUTE },
  { key: "paused", vars: { "--wax-height": 0.5, "--drips": 2, "--flame-height": 0.35, "--flame-blue": 1, "--flame-glow": 0.35, "--light-radius": 0.6 }, phase: "paused", run: true, time: "12:30", status: fillTime(S.pauseLeft, "09:00"), ghosts: g([0.6, 0.35]), resume: true },
  { key: "burned-out", vars: { "--wax-height": 0, "--drips": 3, "--smoke": 1, "--stub": 1, "--light-radius": 0, "--dawn": 1 }, phase: "burned-out", run: false, time: "00:00", status: S.burnedOut, ghosts: g([0.5, 0.9, 0.3, 0.7]), another: true },
  { key: "snuffed", vars: { "--wax-height": 0, "--drips": 2, "--smoke": 1, "--stub": 1, "--light-radius": 0 }, phase: "snuffed", run: false, time: "12:30", status: S.snuffed, ghosts: g([0.4, 0.8, 0.3]) },
  { key: "graveyard-small", vars: {}, phase: "idle", run: false, time: "25:00", status: S.idle, ghosts: [], view: "graveyard", history: "small" },
  { key: "graveyard-card", vars: {}, phase: "idle", run: false, time: "25:00", status: S.idle, ghosts: [], view: "graveyard", history: "stoneCard", card: "stone" },
  { key: "graveyard-card-stub", vars: {}, phase: "idle", run: false, time: "25:00", status: S.idle, ghosts: [], view: "graveyard", history: "stubCard", card: "stub" },
  { key: "ghost-sizes", vars: {}, phase: "idle", run: false, time: "25:00", status: S.idle, ghosts: [], strip: true },
  { key: "idle", vars: {}, phase: "idle", run: false, time: "25:00", status: S.idle, ghosts: [] },
];

// ---------------------------------------------------------------- the room: the real markup, patched
const rep = (s, from, to) => {
  if (!s.includes(from)) throw new Error(`patch target not found: ${from}`);
  return s.replace(from, to);
};
function roomSvg(pic) {
  let svg = room.ROOM_SVG;
  svg = rep(svg, "</defs>", `${defsArt()}\n${TINT_DEFS}</defs>`);
  svg = rep(svg, '<circle class="pool"', `${MASK_ART}\n<circle class="pool"`);
  svg = rep(svg, '<rect class="night"', `${settingGroup()}\n${TINT_RECT}<rect class="night"`);
  svg = rep(svg, '<g class="candle">', `${STARS_GROUP}\n<g class="candle">`);
  return svg;
}

// ---------------------------------------------------------------- the interface (real ui.css), real layout rule at each size
const px = (v) => `${Math.round(v * 100) / 100}px`;
const vars = (r) => `--x:${px(r.x)};--y:${px(r.y)};--w:${px(r.w)};--h:${px(r.h)};`;
/** The proposed zone rectangles (D10): content-fit widths, one inner padding, the Pause right edge and the Settings gap kept. */
export const ZONE = { pause: 98, resume: 110, snuff: 140, settings: 111, gap: 8, anchor: 16 };
function newZone(p, resume) {
  const by = p.zoneControls.pause.y;
  const t = p.textArea;
  const wp = resume ? ZONE.resume : ZONE.pause;
  const pause = { x: t.x - ZONE.anchor - wp, y: by, w: wp, h: 44 };
  const snuff = { x: t.x + t.w + ZONE.anchor, y: by, w: ZONE.snuff, h: 44 };
  const settings = { x: snuff.x + snuff.w + ZONE.gap, y: by, w: ZONE.settings, h: 44 };
  return { pause, snuff, settings, labelled: true };
}
/** The sizes the prototype lays out: VIEWPORTS_ART and the ultrawide picture. `placeControls` decides compact or wide at each. */
export const SIZES = [[360, 640], [375, 667], [768, 1024], [1280, 800], [1920, 1080], [2560, 1440], [3840, 2160], [2560, 1080]];
function layoutCss() {
  let css = ".ui-wide,.ui-compact{display:none}\n";
  for (const [w, h] of SIZES) {
    const p = layout.placeControls(w, h);
    const copy = p.mode; // "wide" or "compact": the real rule (the free space beside the stage is at least 360 px)
    const z = copy === "wide" ? newZone(p, false) : p.zoneControls;
    const zr = copy === "wide" ? newZone(p, true) : p.zoneControls;
    const pre = `.ui-${copy}`;
    let body = `${pre}{display:block;--time-size:${px(p.timeSize)};}`;
    body += `${pre} #length{${vars(p.setup.chooser)}}`;
    p.setup.cells.forEach((c, i) => (body += `${pre} #length > :nth-child(${i + 1}){${vars(c)}}`));
    body += `${pre} #length-error{${vars(p.setup.lengthError ?? p.setup.chooser)}}${pre} #intent-box{${vars(p.setup.intent)}}${pre} #light{${vars(p.setup.light)}}`;
    body += `${pre} #time{${vars(p.time)}}${pre}.run #status{${vars(p.statusRunning)}}${pre}.rest #status{${vars(p.statusResting)}}`;
    body += `${pre} #pause{${vars(z.pause)}}${pre}.resume #pause{${vars(zr.pause)}}${pre} #snuff{${vars(z.snuff)}}${pre} #settings-button{${vars(z.settings)}}`;
    css += `@media (width: ${w}px) and (height: ${h}px){${body}}\n`;
  }
  return css;
}
const ICONS = {
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="icon icon-pause"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  resume: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="icon icon-resume"><path d="M7 5 L19 12 L7 19 Z"/></svg>',
  snuff: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="icon icon-snuff"><path d="M12 3 C16 8 17 11 17 14 A5 5 0 0 1 7 14 C7 11 8 8 12 3 Z"/><path d="M4 20 L20 4"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="icon icon-settings"><path d="M19.16 9.47 L21.80 10.01 L21.80 13.99 L19.16 14.53 L18.86 15.27 L20.33 17.53 L17.53 20.33 L15.27 18.86 L14.53 19.16 L13.99 21.80 L10.01 21.80 L9.47 19.16 L8.73 18.86 L6.47 20.33 L3.67 17.53 L5.14 15.27 L4.84 14.53 L2.20 13.99 L2.20 10.01 L4.84 9.47 L5.14 8.73 L3.67 6.47 L6.47 3.67 L8.73 5.14 L9.47 4.84 L10.01 2.20 L13.99 2.20 L14.53 4.84 L15.27 5.14 L17.53 3.67 L20.33 6.47 L18.86 8.73 Z"/><circle cx="12" cy="12" r="3.2"/></svg>',
};
function uiMarkup(copy, pic) {
  const wide = copy === "wide";
  const resting = !pic.run;
  const setupHidden = pic.run || pic.view === "graveyard";
  const cells = [15, 25, 50]
    .map((m) => `<button type="button" role="radio" aria-checked="${m === 25}" class="cell"><span class="cell-number">${m}</span><span class="cell-check">\u2713</span></button>`)
    .join("");
  return (
    `<div id="ui" class="ui-${copy} ${pic.run ? "run" : "rest"}${pic.resume ? " resume" : ""}" data-mode="${wide ? "wide" : "compact"}" data-variant="${wide ? "column" : "top-row"}">` +
    `<form id="setup" ${setupHidden ? "hidden" : ""}><div id="length" class="chooser" role="radiogroup">${cells}<input class="custom-cell" type="text" placeholder="${STRINGS.length.placeholder}"></div>` +
    `<p id="length-error" hidden></p><div id="intent-box"><input id="intent" type="text" placeholder="${STRINGS.intent.placeholderShort}"></div>` +
    `<button id="light" type="button" class="primary">${pic.another ? STRINGS.light.again : STRINGS.light.light}</button></form>` +
    `<section id="watch"><div id="time" role="timer">${pic.time}</div><p id="status" ${resting ? 'data-rest="true"' : ""}>${pic.status}</p>` +
    `<button id="pause" type="button" class="zone-button" ${pic.run ? "" : "hidden"}>${pic.resume ? ICONS.resume : ICONS.pause}<span class="label">${pic.resume ? STRINGS.pause.resume : STRINGS.pause.pause}</span></button>` +
    `<button id="snuff" type="button" class="zone-button" ${pic.run ? "" : "hidden"}>${ICONS.snuff}<span class="label">${STRINGS.snuff.open}</span></button>` +
    `<button id="settings-button" type="button" class="zone-button">${ICONS.settings}<span class="label">${STRINGS.settings.open}</span></button></section>` +
    graveyardMarkup(pic, copy) +
    `</div>`
  );
}

// ---------------------------------------------------------------- the graveyard view (real class names, geometry, plan and text)
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const sizesFile = new URL("card-sizes.json", here);
const CARD_SIZES = existsSync(sizesFile) ? JSON.parse(readFileSync(sizesFile, "utf8")) : {};
function graveyardMarkup(pic, copy) {
  const place = (r, withSize) => `--x:${r.x};--y:${r.y};${withSize ? `--w:${r.w};--h:${r.h};` : ""}`;
  const door = layout.DOOR_RECT;
  const open = pic.view === "graveyard";
  const dawn = pic.vars["--dawn"] ?? 0;
  const dr = `<span class="door door-shut" aria-hidden="true" style="${place(door)}" ${!pic.run ? "hidden" : ""}></span><button type="button" class="door" aria-label="${STRINGS.graveyard.door}" style="${place(door)}" ${pic.run || open ? "hidden" : ""}></button>`;
  if (!open) return `<section class="graveyard" style="--dawn:${dawn}">${dr}</section>`;
  const p = planOf(pic.history);
  const stoneRects = p.stones.map((s) => s.rect);
  const rowInfo = p.rows.map((r) => ({ y: r.labelRect.y, count: r.stubs.length }));
  let items = `<p class="label" aria-hidden="true" style="${place({ x: 20, y: geometry.LABEL_Y.stones })}">${STRINGS.graveyard.graveyardLabel}</p>`;
  const openId = pic.card === "stone" ? p.stones[0].id : pic.card === "stub" ? p.rows[0].stubs[0].id : null;
  p.stones.forEach((s, i) => {
    items += `<button type="button" id="stone-${i}" class="item stone" style="${place(s.rect)}" ${s.id === openId ? "data-card-open" : ""}><span class="stone-date">${esc(s.date)}</span><span class="stone-intent">${esc(s.intent)}</span></button>`;
  });
  if (p.stonesCount) items += `<p class="count" style="${place({ x: 20, y: geometry.COUNT_LINE_Y.stones })}">${esc(p.stonesCount)}</p>`;
  items += `<p class="label" aria-hidden="true" style="${place({ x: 20, y: geometry.LABEL_Y.shelf })}">${STRINGS.graveyard.shelfLabel}</p>`;
  p.rows.forEach((row, r) => {
    items += `<p class="day-label" style="${place(row.labelRect)}">${esc(row.label)}</p>`;
    row.stubs.forEach((s) => {
      items += `<button type="button" class="item stub" style="${place(s.rect)}" ${s.id === openId ? "data-card-open" : ""}><span class="stub-wax"></span><span class="stub-wick"></span></button>`;
    });
    if (row.more) items += `<p class="more" style="${place(row.more.rect)}">${esc(row.more.text)}</p>`;
  });
  let card = "";
  if (openId) {
    const item = [...p.stones, ...p.rows.flatMap((r) => r.stubs)].find((x) => x.id === openId);
    const size = CARD_SIZES[pic.card] ?? { w: 0, h: 0 };
    const LINE = { x: 20, w: 560, h: geometry.TEXT_LINE_H };
    const rim = geometry.CARD_RIM_PX / 0.6;
    const avoid = [geometry.LABEL_Y.stones, geometry.LABEL_Y.shelf].map((y) => ({ ...LINE, y: y - rim, h: LINE.h + 2 * rim }));
    const c = geometry.placeCard(item.rect, size, avoid);
    card = `<div class="card" style="${place(c, true)}">${item.lines.map((l) => `<span class="card-line">${esc(l)}</span>`).join("")}</div>`;
  }
  const back = `<button type="button" class="back" aria-label="${STRINGS.graveyard.back}" style="${place(door)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="back-icon"><path d="M15 4 L7 12 L15 20"/></svg></button>`;
  const placeArt = placeSvg({ stones: stoneRects, rows: rowInfo }).replaceAll("cw-", `cw-${copy}-`);
  return `<section class="graveyard" style="--dawn:${dawn}">${placeArt}<div class="view">${items}${card}</div>${back}</section>`;
}

// ---------------------------------------------------------------- assemble
function section(pic, idx) {
  const vars = { ...ROOM_DEFAULT, ...pic.vars };
  if (pic.strip) {
    const html = `<section id="${pic.key}" class="pic view-room"><div class="candle-scene" data-phase="idle">${roomSvg(pic)}</div>${ghostStrip()}</section>`.replaceAll("cw-", `cw${idx}-`);
    return { html, css: `#${pic.key} .candle-scene{${Object.entries(vars).map(([a, b]) => `${a}:${b}`).join(";")}}#${pic.key} .window{mask:url(#cw${idx}-panes)}#${pic.key} .window-rest{fill:url(#cw${idx}-window-grad)}#${pic.key} .ghost-layer .inner-glow{fill:url(#cw${idx}-ghost-glow)}` };
  }
  const reducedGhosts = pic.view === "graveyard" ? "" : ghostSvg(pic.ghosts);
  let html =
    `<section id="${pic.key}" class="pic ${pic.view === "graveyard" ? "view-graveyard" : "view-room"}">` +
    `<div class="candle-scene" data-phase="${pic.phase}">${roomSvg(pic)}</div>${reducedGhosts}` +
    uiMarkup("compact", pic) + uiMarkup("wide", pic) +
    `</section>`;
  html = html.replaceAll("cw-", `cw${idx}-`);
  const k = `cw${idx}-`;
  const css =
    `#${pic.key} .candle-scene{${Object.entries(vars).map(([a, b]) => `${a}:${b}`).join(";")}}` +
    `#${pic.key} .window{mask:url(#${k}panes)}#${pic.key} .window-rest{fill:url(#${k}window-grad)}#${pic.key} .ghost-layer .inner-glow{fill:url(#${k}ghost-glow)}`;
  return { html, css };
}
const parts = PICTURES.map(section);
const links = ["scene/scene.css", "ui/ui.css", "ghosts/ghosts.css", "graveyard/graveyard.css"].map((p) => `<link rel="stylesheet" href="../../../../src/${p}">`).join("\n");
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Candlewatch room-art prototype (static, not shipped)</title>
${links}
<style>
/* picture switching without script: each picture is a section with an id; :target shows it; idle shows when there is no hash */
.pic { display: none; }
.pic:target { display: block; }
#idle { display: block; }
.pic:target ~ #idle { display: none; }
.pic .candle-scene { position: fixed; inset: 0; }
#ui { position: fixed; inset: 0; }
${placeTokenCss}
${layoutCss()}
${ART_CSS}
${parts.map((p) => p.css).join("\n")}
</style>
</head>
<body>
${parts.map((p) => p.html).join("\n")}
</body>
</html>
`;
writeFileSync(new URL("index.html", here), page);
console.log(`index.html ${Math.round(page.length / 1024)} KB, ${PICTURES.length} sections`);
