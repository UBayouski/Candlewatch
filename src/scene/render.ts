import { STRINGS } from "../strings";
import { ROOM_SVG } from "./room";
import type { SceneExtra, SceneModel } from "./types";

/** What the renderer needs from its root element. A real `HTMLElement` satisfies it. */
export interface SceneRoot {
  innerHTML: string;
  readonly style: { setProperty(name: string, value: string): void };
  readonly classList: { add(token: string): void };
  setAttribute(name: string, value: string): void;
}

export interface Scene {
  /** `extra.labelSuffix` is appended to the label (R10.1, CR-S1); without `extra` the label is the plain one. */
  apply(model: SceneModel, extra?: SceneExtra): void;
}

/** Model field -> CSS custom property (design 6.2). A boolean becomes "1" or "0". */
const PROPERTIES: readonly (readonly [keyof SceneModel, string])[] = [
  ["waxHeight", "--wax-height"],
  ["drips", "--drips"],
  ["flameHeight", "--flame-height"],
  ["flameBlue", "--flame-blue"],
  ["flameRagged", "--flame-ragged"],
  ["flameGlow", "--flame-glow"],
  ["smoke", "--smoke"],
  ["stub", "--stub"],
  ["lightRadius", "--light-radius"],
  ["dawn", "--dawn"],
  ["cooling", "--cooling"],
  ["flickerLean", "--flicker-lean"],
  ["flickerHeight", "--flicker-height"],
  ["flickerGlow", "--flicker-glow"],
];

/** Model field -> data attribute (design 6.2). A boolean becomes "true" or "false". */
const ATTRIBUTES: readonly (readonly [keyof SceneModel, string])[] = [
  ["phase", "data-phase"],
  ["flameMode", "data-flame"],
  ["animateDrips", "data-animate-drips"],
  ["animateSmoke", "data-animate-smoke"],
  ["animateEase", "data-ease"],
];

const propertyText = (value: SceneModel[keyof SceneModel]): string =>
  typeof value === "boolean" ? (value ? "1" : "0") : String(value);

const attributeText = (value: SceneModel[keyof SceneModel]): string => String(value);

/**
 * Builds the room inside `root` and returns `apply`, which copies a scene model to the page.
 * `apply` writes only custom properties, data attributes and the accessible name, and only when
 * a value changed. It holds no logic about the session: every decision is in the model.
 */
export function createScene(root: SceneRoot): Scene {
  root.innerHTML = ROOM_SVG;
  root.setAttribute("role", "img");
  root.classList.add("candle-scene");

  const written = new Map<string, string>();
  let calls = 0;
  let announced: string | null = null;

  const write = (key: string, value: string, set: () => void): void => {
    if (written.get(key) === value) return;
    written.set(key, value);
    set();
  };

  return {
    apply(model: SceneModel, extra?: SceneExtra): void {
      for (const [field, name] of PROPERTIES) {
        const value = propertyText(model[field]);
        write(name, value, () => {
          root.style.setProperty(name, value);
        });
      }
      for (const [field, name] of ATTRIBUTES) {
        const value = attributeText(model[field]);
        write(name, value, () => {
          root.setAttribute(name, value);
        });
      }

      // The first paint draws the state whole, with no run, ease or sway; from the second call on, motion is allowed (design 6.5).
      const settled = calls === 0 ? "false" : "true";
      calls += 1;
      write("data-settled", settled, () => {
        root.setAttribute("data-settled", settled);
      });

      // The accessible name changes only with the flame mode or the suffix, and never contains the time (R12, R10.1, R10.10).
      const base = STRINGS.scene[model.flameMode];
      const label = extra === undefined ? base : `${base} ${extra.labelSuffix}.`;
      if (announced !== label) {
        announced = label;
        root.setAttribute("aria-label", label);
      }
    },
  };
}
