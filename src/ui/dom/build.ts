// Builds the interface's elements once (controls-and-access design 4.1, 4.2).
// Only createElement, createElementNS, textContent and setAttribute for names and roles: no innerHTML, no style attribute.
// Positions arrive later as custom properties (apply.ts). DOM order is the Tab order and the reading order (R10.6).
import { PRESET_LENGTHS_MIN } from "../../engine";
import { STRINGS } from "../../strings";
import { fill } from "../format";

export interface ChooserElements {
  readonly group: HTMLElement;
  /** The three presets, in the order of PRESET_LENGTHS_MIN. */
  readonly presets: readonly HTMLButtonElement[];
  readonly custom: HTMLInputElement;
}

export interface SwitchElements {
  readonly button: HTMLButtonElement;
  readonly label: HTMLElement;
  readonly state: HTMLElement;
}

export interface Elements {
  readonly root: HTMLElement;
  readonly setup: HTMLFormElement;
  readonly length: ChooserElements;
  readonly intentBox: HTMLElement;
  readonly intent: HTMLInputElement;
  readonly counter: HTMLElement;
  readonly hint: HTMLElement;
  readonly light: HTMLButtonElement;
  readonly watch: HTMLElement;
  readonly time: HTMLElement;
  readonly status: HTMLElement;
  readonly pause: HTMLButtonElement;
  readonly pauseLabel: HTMLElement;
  readonly pauseIcon: SVGElement;
  readonly resumeIcon: SVGElement;
  readonly snuff: HTMLButtonElement;
  readonly snuffLabel: HTMLElement;
  readonly settingsButton: HTMLButtonElement;
  readonly settingsLabel: HTMLElement;
  readonly live: HTMLElement;
  readonly snuffDialog: HTMLDialogElement;
  readonly keep: HTMLButtonElement;
  readonly confirm: HTMLButtonElement;
  readonly settingsDialog: HTMLDialogElement;
  readonly sound: SwitchElements;
  readonly ghosts: SwitchElements;
  readonly defaultLabel: HTMLElement;
  readonly defaultLength: ChooserElements;
  readonly close: HTMLButtonElement;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function make<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Readonly<Record<string, string>> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A small decorative icon: shapes only, hidden from assistive technology. */
function icon(doc: Document, className: string, shapes: readonly (readonly [string, Record<string, string>])[]): SVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", `icon ${className}`);
  for (const [tag, attrs] of shapes) {
    const shape = doc.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) shape.setAttribute(name, value);
    svg.append(shape);
  }
  return svg;
}

/** The length chooser: a named radio group of the three presets and the custom text field. `prefix` keeps ids apart. */
function buildChooser(doc: Document, prefix: string, labelledBy: string | null): ChooserElements {
  const group = make(doc, "div", { id: prefix, role: "radiogroup", class: "chooser" });
  if (labelledBy !== null) group.setAttribute("aria-labelledby", labelledBy);
  else group.setAttribute("aria-label", STRINGS.length.group);
  const presets = PRESET_LENGTHS_MIN.map((minutes) => {
    const text = fill(STRINGS.length.preset, { n: minutes });
    const button = make(doc, "button", {
      type: "button",
      role: "radio",
      "aria-checked": "false",
      "data-minutes": String(minutes),
      class: "cell",
      "aria-label": text,
    });
    button.append(make(doc, "span", { class: "cell-number", "aria-hidden": "true" }, String(minutes)), make(doc, "span", { class: "cell-check", "aria-hidden": "true" }, "\u2713"));
    return button;
  });
  const custom = make(doc, "input", {
    id: `${prefix}-custom`,
    type: "text",
    inputmode: "numeric",
    autocomplete: "off",
    maxlength: "3",
    class: "custom-cell",
    "aria-label": STRINGS.length.custom,
    placeholder: STRINGS.length.placeholder,
  });
  group.append(...presets, custom);
  return { group, presets, custom };
}

function buildSwitch(doc: Document, id: string): SwitchElements {
  const label = make(doc, "span", { class: "switch-label" });
  const state = make(doc, "span", { class: "switch-state" });
  const button = make(doc, "button", { id, type: "button", role: "switch", "aria-checked": "false", class: "switch" });
  button.append(label, state);
  return { button, label, state };
}

/** Creates every element and appends them to `root` (the `#ui` container). Nothing is positioned or filled in yet. */
export function buildInterface(doc: Document, root: HTMLElement): Elements {
  root.id = "ui";

  // --- setup: length chooser, intent field, Light ---
  const setup = make(doc, "form", { id: "setup", "aria-label": STRINGS.setup.label, novalidate: "" });
  const length = buildChooser(doc, "length", null);
  const intent = make(doc, "input", {
    id: "intent",
    type: "text",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    "aria-label": STRINGS.intent.label,
    "aria-describedby": "intent-hint",
  });
  const counter = make(doc, "span", { id: "intent-counter", class: "counter", "aria-hidden": "true" });
  const hint = make(doc, "span", { id: "intent-hint", class: "sr-only" });
  const intentBox = make(doc, "div", { id: "intent-box", class: "intent-box" });
  intentBox.append(intent, counter, hint);
  const light = make(doc, "button", { id: "light", type: "submit", class: "primary" });
  setup.append(length.group, intentBox, light);

  // --- the watch: time text, status line, Pause, Let it go dark, Settings ---
  const watch = make(doc, "section", { id: "watch", "aria-label": STRINGS.region.watch });
  const time = make(doc, "div", { id: "time", role: "timer" });
  const status = make(doc, "p", { id: "status" });

  const pauseLabel = make(doc, "span", { class: "label" });
  const pauseIcon = icon(doc, "icon-pause", [
    ["rect", { x: "6", y: "5", width: "4", height: "14", rx: "1" }],
    ["rect", { x: "14", y: "5", width: "4", height: "14", rx: "1" }],
  ]);
  const resumeIcon = icon(doc, "icon-resume", [["path", { d: "M7 5 L19 12 L7 19 Z" }]]);
  const pause = make(doc, "button", { id: "pause", type: "button", class: "zone-button" });
  pause.append(pauseIcon, resumeIcon, pauseLabel);

  const snuffLabel = make(doc, "span", { class: "label" });
  const snuff = make(doc, "button", { id: "snuff", type: "button", class: "zone-button", "aria-haspopup": "dialog" });
  snuff.append(
    icon(doc, "icon-snuff", [
      ["path", { d: "M12 3 C16 8 17 11 17 14 A5 5 0 0 1 7 14 C7 11 8 8 12 3 Z" }],
      ["path", { d: "M4 20 L20 4" }],
    ]),
    snuffLabel,
  );

  const settingsLabel = make(doc, "span", { class: "label" });
  const settingsButton = make(doc, "button", { id: "settings-button", type: "button", class: "zone-button", "aria-haspopup": "dialog" });
  settingsButton.append(
    icon(doc, "icon-settings", [
      ["circle", { cx: "12", cy: "12", r: "3.2" }],
      ["path", { d: "M12 2.5 V6 M12 18 V21.5 M2.5 12 H6 M18 12 H21.5 M5.3 5.3 L7.8 7.8 M16.2 16.2 L18.7 18.7 M18.7 5.3 L16.2 7.8 M7.8 16.2 L5.3 18.7" }],
    ]),
    settingsLabel,
  );
  watch.append(time, status, pause, snuff, settingsButton);

  // --- the live region ---
  const live = make(doc, "div", { id: "live", role: "status", class: "sr-only" });

  // --- the snuff dialog ---
  const snuffDialog = make(doc, "dialog", { id: "snuff-dialog", "aria-labelledby": "snuff-title", "aria-describedby": "snuff-body" });
  const keep = make(doc, "button", { id: "keep", type: "button", autofocus: "", class: "primary" }, STRINGS.snuff.keep);
  const confirm = make(doc, "button", { id: "confirm", type: "button" }, STRINGS.snuff.confirm);
  snuffDialog.append(
    make(doc, "h2", { id: "snuff-title" }, STRINGS.snuff.title),
    make(doc, "p", { id: "snuff-body" }, STRINGS.snuff.body),
    make(doc, "div", { class: "dialog-buttons" }),
  );
  snuffDialog.lastElementChild?.append(keep, confirm);

  // --- the settings panel ---
  const settingsDialog = make(doc, "dialog", { id: "settings-dialog", "aria-labelledby": "settings-title" });
  const sound = buildSwitch(doc, "sound");
  const ghosts = buildSwitch(doc, "ghosts");
  const defaultLabel = make(doc, "span", { id: "default-length-label", class: "group-label" });
  const defaultLength = buildChooser(doc, "default-length", "default-length-label");
  const close = make(doc, "button", { id: "close", type: "button", class: "primary" }, STRINGS.settings.close);
  settingsDialog.append(make(doc, "h2", { id: "settings-title" }, STRINGS.settings.title), sound.button, ghosts.button, defaultLabel, defaultLength.group, close);

  root.append(setup, watch, live, snuffDialog, settingsDialog);

  return {
    root,
    setup,
    length,
    intentBox,
    intent,
    counter,
    hint,
    light,
    watch,
    time,
    status,
    pause,
    pauseLabel,
    pauseIcon,
    resumeIcon,
    snuff,
    snuffLabel,
    settingsButton,
    settingsLabel,
    live,
    snuffDialog,
    keep,
    confirm,
    settingsDialog,
    sound,
    ghosts,
    defaultLabel,
    defaultLength,
    close,
  };
}
