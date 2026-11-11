// Applies a view model to the elements (controls-and-access design 4.3, R7.4).
// Remembers the last value of each field and writes the page only when a value changed. No branching on phase or time:
// every decision is already in the view model. Positions are written as custom properties only (no style attribute).
import type { Rect } from "../layout";
import type { ViewModel } from "../view";
import type { ChooserElements, Elements, SwitchElements } from "./build";

export type Apply = (view: ViewModel) => void;

const px = (n: number): string => `${Math.round(n * 100) / 100}px`;

export function createApply(els: Elements, doc: Document): Apply {
  /** field key -> the last value written. */
  const written = new Map<string, string>();
  const changed = (key: string, value: string): boolean => {
    if (written.get(key) === value) return false;
    written.set(key, value);
    return true;
  };

  const text = (key: string, el: HTMLElement, value: string): void => {
    if (changed(key, value)) el.textContent = value;
  };
  const attr = (key: string, el: Element, name: string, value: string | null): void => {
    if (!changed(key, value ?? "\u0000")) return;
    if (value === null) el.removeAttribute(name);
    else el.setAttribute(name, value);
  };
  const flag = (key: string, el: HTMLElement, hidden: boolean): void => {
    if (changed(key, String(hidden))) el.hidden = hidden;
  };
  const place = (key: string, el: HTMLElement, r: Rect): void => {
    const value = `${r.x}|${r.y}|${r.w}|${r.h}`;
    if (!changed(key, value)) return;
    el.style.setProperty("--x", px(r.x));
    el.style.setProperty("--y", px(r.y));
    el.style.setProperty("--w", px(r.w));
    el.style.setProperty("--h", px(r.h));
  };

  /** A value in a field the user may be typing in is not overwritten while it has focus. */
  const field = (input: HTMLInputElement, value: string, force: boolean): void => {
    if (input.value === value) return;
    if (force || doc.activeElement !== input) input.value = value;
  };

  const chooser = (key: string, c: ChooserElements, selected: number, customText: string, invalid: boolean, describedBy = "status"): void => {
    c.presets.forEach((button, i) => {
      attr(`${key}.checked.${i}`, button, "aria-checked", String(selected === i));
      attr(`${key}.tab.${i}`, button, "tabindex", selected === i ? "0" : "-1");
    });
    attr(`${key}.custom.tab`, c.custom, "tabindex", selected === 3 ? "0" : "-1");
    field(c.custom, customText, false);
    attr(`${key}.custom.invalid`, c.custom, "aria-invalid", invalid ? "true" : null);
    attr(`${key}.custom.describedby`, c.custom, "aria-describedby", invalid ? describedBy : null);
  };

  const toggle = (key: string, s: SwitchElements, checked: boolean, label: string, state: string): void => {
    attr(`${key}.checked`, s.button, "aria-checked", String(checked));
    text(`${key}.label`, s.label, label);
    text(`${key}.state`, s.state, state);
  };

  let lastPlacement: ViewModel["placement"] | null = null;
  let lastOverlay: ViewModel["overlay"] = "none";

  return (view) => {
    const p = view.placement;

    // 1. placement
    if (p !== lastPlacement) {
      lastPlacement = p;
      place("p.length", els.length.group, p.setup.chooser);
      [...els.length.presets, els.length.custom].forEach((el, i) => place(`p.cell.${i}`, el, p.setup.cells[i] ?? p.setup.chooser));
      place("p.intent", els.intentBox, p.setup.intent);
      if (p.setup.lengthError) place("p.lengthError", els.lengthError, p.setup.lengthError);
      place("p.light", els.light, p.setup.light);
      place("p.time", els.time, p.time);
      place("p.pause", els.pause, p.zoneControls.pause);
      place("p.snuff", els.snuff, p.zoneControls.snuff);
      place("p.settings", els.settingsButton, p.zoneControls.settings);
      place("p.snuffDialog", els.snuffDialog, p.snuffDialog);
      place("p.settingsDialog", els.settingsDialog, p.settingsPanel);
      if (changed("p.timeSize", String(p.timeSize))) els.root.style.setProperty("--time-size", px(p.timeSize));
      attr("p.mode", els.root, "data-mode", p.mode);
      attr("p.variant", els.root, "data-variant", p.variant);
    }
    place("p.status", els.status, view.status.rect);

    // 2. visibility
    flag("hidden.setup", els.setup, !view.setupVisible);
    flag("hidden.pause", els.pause, !view.runningVisible);
    flag("hidden.snuff", els.snuff, !view.runningVisible);
    flag("hidden.settings", els.settingsButton, !view.settingsVisible);
    attr("root.phase", els.root, "data-phase", view.phase);

    // 3. texts
    text("time", els.time, view.timeText);
    attr("time.label", els.time, "aria-label", view.timeWords === "" ? null : view.timeWords);
    text("status", els.status, view.status.text);
    attr("status.kind", els.status, "data-kind", view.status.kind);
    attr("status.rest", els.status, "data-rest", String(!view.runningVisible));
    text("light", els.light, view.light.label);
    text("pause.label", els.pauseLabel, view.pause.label);
    attr("pause.icon", els.pauseIcon, "data-off", view.phase === "paused" ? "true" : null);
    attr("resume.icon", els.resumeIcon, "data-off", view.phase === "paused" ? null : "true");
    text("snuff.label", els.snuffLabel, view.snuff.label);
    text("settings.label", els.settingsLabel, view.settingsButton.label);

    // 4. the chooser, the intent field and its counter
    chooser("length", els.length, view.chooser.selected, view.chooser.customText, view.chooser.customInvalid, view.chooser.describedBy);
    // The length message under the chooser (wide layout only: the compact layout has no rectangle for it and shows it in the status line).
    text("length.error", els.lengthError, view.chooser.error ?? "");
    flag("hidden.lengthError", els.lengthError, view.chooser.error === null || view.placement.setup.lengthError === null);
    field(els.intent, view.intent.text, true);
    attr("intent.placeholder", els.intent, "placeholder", view.intent.placeholder);
    text("intent.counter", els.counter, view.intent.overLimit ? view.intent.overLimitMark : view.intent.counter);
    attr("intent.over", els.intentBox, "data-over", String(view.intent.overLimit));
    text("intent.hint", els.hint, view.intent.hint);

    // 5. the settings panel
    toggle("sound", els.sound, view.settings.sound.checked, view.settings.sound.label, view.settings.sound.stateText);
    toggle("ghosts", els.ghosts, view.settings.ghosts.checked, view.settings.ghosts.label, view.settings.ghosts.stateText);
    text("default.label", els.defaultLabel, view.settings.defaultLength.label);
    chooser("default", els.defaultLength, view.settings.defaultLength.selected, view.settings.defaultLength.customText, false);

    // 6. the overlays: showModal and close only when the overlay changed
    if (view.overlay !== lastOverlay) {
      lastOverlay = view.overlay;
      if (view.overlay !== "snuff" && els.snuffDialog.open) els.snuffDialog.close();
      if (view.overlay !== "settings" && els.settingsDialog.open) els.settingsDialog.close();
      if (view.overlay === "snuff" && !els.snuffDialog.open) els.snuffDialog.showModal();
      if (view.overlay === "settings" && !els.settingsDialog.open) els.settingsDialog.showModal();
    }
  };
}
