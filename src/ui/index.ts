// The interface: builds the controls once, listens for events, and redraws from the state every frame
// (controls-and-access design 1.2, 5). `main.ts` owns the clock and the loop; this module reads `now` from its callers and
// never calls `step`: every engine event goes out through the one `dispatch` it is given.
import { PRESET_LENGTHS_MIN } from "../engine";
import type { Event, State } from "../engine";
import type { Settings } from "../storage/settings";
import { INITIAL_ANNOUNCER, limitAnnouncement, nextAnnouncement, refusalAnnouncement, textOf, timeAnnouncement } from "./announcer";
import type { AnnouncerMemory } from "./announcer";
import { createApply } from "./dom/apply";
import { buildInterface } from "./dom/build";
import { attachEvents } from "./dom/events";
import { createFocus } from "./dom/focus";
import { createLiveWriter } from "./dom/live";
import { placeControls } from "./layout";
import type { Placement } from "./layout";
import type { FocusTarget, UiAction, UiState } from "./ui-state";
import { initialUi, uiStep } from "./ui-state";
import { viewOf } from "./view";

export interface InterfaceDeps {
  /** The `#ui` container, appended to the page by the caller. */
  readonly root: HTMLElement;
  /** The scene's root: its box is the viewport, and the focus map treats it as the page body. */
  readonly sceneRoot: HTMLElement;
  /** The one way to reach the engine (`main.ts` runs `step` and saves). */
  readonly dispatch: (event: Event, now: number) => void;
  /** The clock, read only for the moment of a user action. */
  readonly now: () => number;
  readonly getState: () => State;
  readonly settings: Settings;
  /** Called at once with the new settings whenever the panel changes one. */
  readonly onSettings: (settings: Settings) => void;
}

export interface Interface {
  /** Call once per frame, after the engine has settled for `now`. */
  update(state: State, now: number): void;
}

export function createInterface(deps: InterfaceDeps): Interface {
  const doc = deps.root.ownerDocument;
  const view = doc.defaultView;
  const els = buildInterface(doc, deps.root);
  const apply = createApply(els, doc);
  const live = createLiveWriter(els.live);
  const focus = createFocus(els, doc, deps.sceneRoot);

  let settings = deps.settings;
  let ui: UiState = initialUi(settings);
  let memory: AnnouncerMemory = INITIAL_ANNOUNCER;
  let lastPhase = deps.getState().phase;
  let queuedFocus: FocusTarget = "none";
  let lastOverLimit = false;
  /** The user has picked a length since the page loaded: the default length no longer moves the chooser (design 11.2). */
  let chosen = false;

  // --- size: measured once before the first update, then when the scene's box changes ---
  const sizeNow = (): { w: number; h: number } => {
    const box = deps.sceneRoot.getBoundingClientRect();
    return { w: box.width > 0 ? box.width : (view?.innerWidth ?? 360), h: box.height > 0 ? box.height : (view?.innerHeight ?? 640) };
  };
  let size = sizeNow();
  let placement: Placement = placeControls(size.w, size.h);
  let dirty = false;
  const measure = (): void => {
    dirty = false;
    const next = sizeNow();
    if (next.w === size.w && next.h === size.h) return;
    size = next;
    placement = placeControls(next.w, next.h);
  };
  const markDirty = (): void => {
    dirty = true;
  };
  if (view !== null && typeof view.ResizeObserver === "function") new view.ResizeObserver(markDirty).observe(deps.sceneRoot);
  else view?.addEventListener("resize", markDirty);

  // --- user actions ---
  const handle = (action: UiAction, now: number): void => {
    const state = deps.getState();
    const before = ui;
    const result = uiStep(ui, { type: "action", action }, state.phase);
    ui = result.ui;
    if (ui.overlay !== "none" && before.overlay === "none") focus.remember();
    if (action.type === "select-preset" || action.type === "set-custom") chosen = true;
    for (const event of result.effects.events) deps.dispatch(event, now);
    if (result.effects.announce === "refusal") live.say(textOf(refusalAnnouncement()));
    else if (result.effects.announce === "time") {
      const message = timeAnnouncement(deps.getState(), now);
      if (message !== null) live.say(textOf(message));
    }
    if (result.effects.focus !== "none") queuedFocus = result.effects.focus;
  };

  const changeSettings = (patch: Partial<Settings>): void => {
    const next: Settings = { ...settings, ...patch };
    if (next.sound === settings.sound && next.ghosts === settings.ghosts && next.defaultLength === settings.defaultLength) return;
    const defaultChanged = next.defaultLength !== settings.defaultLength;
    settings = next;
    deps.onSettings(next);
    // A new default length moves the main chooser only while the user has not chosen one and no candle burns (design 11.2).
    const phase = deps.getState().phase;
    if (defaultChanged && !chosen && phase !== "lit" && phase !== "paused") {
      const preset = PRESET_LENGTHS_MIN.find((m) => m === next.defaultLength);
      const action: UiAction = preset !== undefined ? { type: "select-preset", minutes: preset } : { type: "set-custom", text: String(next.defaultLength) };
      ui = uiStep(ui, { type: "action", action }, phase).ui;
    }
  };

  attachEvents({
    doc,
    els,
    sceneRoot: deps.sceneRoot,
    now: deps.now,
    phase: () => deps.getState().phase,
    overlay: () => ui.overlay,
    handle,
    changeSettings,
    settings: () => settings,
  });

  return {
    update(state: State, now: number): void {
      // 1. The engine moved on its own (the candle burned out, the pause ran out, a reload): tell the state machine.
      if (state.phase !== lastPhase) {
        const result = uiStep(ui, { type: "engine", from: lastPhase, to: state.phase, typing: focus.isTyping() }, state.phase);
        ui = result.ui;
        lastPhase = state.phase;
        if (result.effects.focus !== "none") queuedFocus = result.effects.focus;
      }

      // 2. What the screen reader should hear about the state.
      const said = nextAnnouncement(memory, state, now);
      memory = said.mem;
      if (said.announcement !== null) live.say(textOf(said.announcement));

      // 3. The view, written only where it changed.
      if (dirty) measure();
      const model = viewOf(state, ui, settings, now, placement);
      apply(model);
      if (model.intent.overLimit && !lastOverLimit) live.say(textOf(limitAnnouncement()));
      lastOverLimit = model.intent.overLimit;

      // 4. Focus, after apply so a control that has just appeared can take it, then the live region.
      if (queuedFocus !== "none") {
        focus.move(queuedFocus);
        queuedFocus = "none";
      }
      live.frame();
    },
  };
}
