// Focus targets and what has the focus (controls-and-access design 10, R10.5).
// `move` runs after `apply`, in the same frame, so a button that has just appeared can take focus.
import type { FocusKind } from "../keys";
import type { FocusTarget } from "../ui-state";
import type { Elements } from "./build";

/** What has the focus, as far as keys care (design 3.4). */
export function focusKindOf(el: Element | null, scene: Element | null): FocusKind {
  if (el === null || el === el.ownerDocument.body || (scene !== null && scene.contains(el))) return "body";
  if (el instanceof HTMLTextAreaElement) return "text";
  if (el instanceof HTMLInputElement) return el.type === "text" || el.type === "search" || el.type === "" ? "text" : "button";
  if (el instanceof HTMLButtonElement || el instanceof HTMLSelectElement || (el instanceof HTMLAnchorElement && el.hasAttribute("href"))) return "button";
  const role = el.getAttribute("role");
  if (role === "radio" || role === "switch") return "button";
  return "other";
}

export interface FocusMover {
  /** Remembers what has the focus now; "restore" goes back to it. */
  remember(): void;
  /** Moves focus to the target, or along the fallback chain (Pause, Light, Settings, nothing). `none` does nothing. */
  move(target: FocusTarget): void;
  /** True while a text field has the focus. */
  isTyping(): boolean;
}

const usable = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement && el.isConnected && !(el instanceof HTMLButtonElement && el.disabled) && !(el instanceof HTMLInputElement && el.disabled) && el.getClientRects().length > 0;

export function createFocus(els: Elements, doc: Document, scene: Element | null): FocusMover {
  let opener: Element | null = null;

  const element = (target: FocusTarget): Element | null => {
    switch (target) {
      case "pause-resume":
        return els.pause;
      case "light":
        return els.light;
      case "custom-length":
        return els.length.custom;
      case "keep-burning":
        return els.keep;
      case "settings-first":
        return els.sound.button;
      case "settings-button":
        return els.settingsButton;
      case "restore":
        return opener;
      case "none":
        return null;
    }
  };

  return {
    remember(): void {
      opener = doc.activeElement;
    },
    move(target: FocusTarget): void {
      if (target === "none") return;
      for (const candidate of [element(target), els.pause, els.light, els.settingsButton]) {
        if (usable(candidate)) {
          candidate.focus();
          return;
        }
      }
    },
    isTyping(): boolean {
      return focusKindOf(doc.activeElement, scene) === "text";
    },
  };
}
