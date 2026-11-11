// DOM events -> the pure modules' inputs (controls-and-access design 4.1).
// This file only translates: the key map, the chooser's arrow movement and the length parser decide; `handle` runs the state machine.
// The moment of a user action is read from the injected clock here and nowhere else in the interface.
import { PRESET_LENGTHS_MIN } from "../../engine";
import type { State } from "../../engine";
import type { Settings } from "../../storage/settings";
import { keyAction } from "../keys";
import type { KeyContext } from "../keys";
import { nextChoice, parseLength } from "../length";
import type { ArrowKey, ChoiceIndex } from "../length";
import type { UiAction, UiState } from "../ui-state";
import type { Elements } from "./build";
import { focusKindOf } from "./focus";

export interface EventDeps {
  readonly doc: Document;
  readonly els: Elements;
  readonly sceneRoot: Element | null;
  readonly now: () => number;
  readonly phase: () => State["phase"];
  readonly overlay: () => UiState["overlay"];
  /** Runs one UI action at the moment `now` (the state machine, the engine events, the effects). */
  readonly handle: (action: UiAction, now: number) => void;
  /** Applies a change made in the settings panel and stores it. */
  readonly changeSettings: (patch: Partial<Settings>) => void;
  readonly settings: () => Settings;
}

const ARROWS: readonly string[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

export function attachEvents(deps: EventDeps): void {
  const { doc, els, sceneRoot } = deps;
  const act = (action: UiAction): void => deps.handle(action, deps.now());

  /** The stops of a chooser in reading order: the three presets, then the custom field. */
  const stopsOf = (c: Elements["length"]): readonly HTMLElement[] => [...c.presets, c.custom];

  /** Chooses stop `index` of a chooser: a preset is selected and focused, the custom field is only focused (typing selects it). */
  const choose = (which: "main" | "default", index: ChoiceIndex): void => {
    const chooser = which === "main" ? els.length : els.defaultLength;
    const stop = stopsOf(chooser)[index];
    const minutes = PRESET_LENGTHS_MIN[index as number];
    if (minutes !== undefined) {
      if (which === "main") act({ type: "select-preset", minutes });
      else deps.changeSettings({ defaultLength: minutes });
    }
    stop?.focus();
  };

  const onArrow = (e: KeyboardEvent): boolean => {
    if (!ARROWS.includes(e.key) || !(e.target instanceof Element)) return false;
    const which = els.length.group.contains(e.target) ? "main" : els.defaultLength.group.contains(e.target) ? "default" : null;
    if (which === null) return false;
    const chooser = which === "main" ? els.length : els.defaultLength;
    const index = stopsOf(chooser).indexOf(e.target as HTMLElement);
    if (index < 0) return false;
    // In the custom field only Up and Down leave it; Left and Right move the caret.
    if (index === 3 && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return false;
    e.preventDefault();
    choose(which, nextChoice(index as ChoiceIndex, e.key as ArrowKey));
    return true;
  };

  doc.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.isComposing) return;
    if (onArrow(e)) return;
    const context: KeyContext = { phase: deps.phase(), overlay: deps.overlay(), focus: focusKindOf(doc.activeElement, sceneRoot) };
    const action = keyAction(context, { key: e.key, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey, shift: e.shiftKey, repeat: e.repeat });
    if (action === null) return;
    e.preventDefault();
    act(action);
  });

  els.root.addEventListener("click", (e: MouseEvent) => {
    const button = e.target instanceof Element ? e.target.closest("button") : null;
    if (button === null) return;
    switch (button) {
      case els.pause:
        act({ type: "toggle-pause" });
        return;
      case els.snuff:
        act({ type: "open-snuff" });
        return;
      case els.settingsButton:
        act({ type: "open-settings" });
        return;
      case els.keep:
        act({ type: "keep-burning" });
        return;
      case els.confirm:
        act({ type: "confirm-snuff" });
        return;
      case els.close:
        act({ type: "close-settings" });
        return;
      case els.sound.button:
        deps.changeSettings({ sound: !deps.settings().sound });
        return;
      case els.ghosts.button:
        deps.changeSettings({ ghosts: !deps.settings().ghosts });
        return;
      default: {
        const index = els.length.presets.indexOf(button);
        if (index >= 0) {
          choose("main", index as ChoiceIndex);
          return;
        }
        const defaultIndex = els.defaultLength.presets.indexOf(button);
        if (defaultIndex >= 0) choose("default", defaultIndex as ChoiceIndex);
      }
    }
  });

  els.root.addEventListener("input", (e: Event) => {
    const target = e.target;
    if (target === els.intent) act({ type: "set-intent", text: els.intent.value });
    else if (target === els.length.custom) act({ type: "set-custom", text: els.length.custom.value });
    else if (target === els.defaultLength.custom) {
      const parsed = parseLength(els.defaultLength.custom.value);
      if (parsed.ok) deps.changeSettings({ defaultLength: parsed.minutes });
    }
  });

  // The Light button is a submit button: the click, a tap and Enter on the button all end here.
  els.setup.addEventListener("submit", (e: Event) => {
    e.preventDefault();
    act({ type: "light" });
  });

  // Esc closes an overlay through the state machine, like every other route.
  els.snuffDialog.addEventListener("cancel", (e: Event) => {
    e.preventDefault();
    act({ type: "keep-burning" });
  });
  els.settingsDialog.addEventListener("cancel", (e: Event) => {
    e.preventDefault();
    act({ type: "close-settings" });
  });
}
