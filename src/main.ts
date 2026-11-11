import { INITIAL_STATE, step } from "./engine";
import type { Event, State } from "./engine";
import { browserVisibilityTarget } from "./distraction/visibility";
import { createScene, sceneModel } from "./scene";
import "./scene/scene.css";
import { browserStore, createStorage } from "./storage/storage";
import { createSettingsStore } from "./storage/settings";
import { STRINGS } from "./strings";
import { createInterface } from "./ui";
import "./ui/ui.css";
import { wireVisibility } from "./wiring";

// The one place that owns the clock and the redraw loop (candle-scene R1.3, R13.1).
// Every user action and every visibility change reaches the engine through `dispatch`, and only through it.

const kv = browserStore();
const storage = createStorage(kv);
const settingsStore = createSettingsStore(kv);
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

const app = document.getElementById("app");
if (app) {
  // The placeholder heading and tagline stay in the page for screen readers, but are not seen (design 10.1).
  const heading = document.createElement("h1");
  heading.textContent = STRINGS.title;
  heading.className = "visually-hidden";
  const tagline = document.createElement("p");
  tagline.textContent = STRINGS.tagline;
  tagline.className = "visually-hidden";

  // The scene root and the interface root; the interface sits above the scene.
  const sceneRoot = document.createElement("div");
  sceneRoot.id = "scene";
  const uiRoot = document.createElement("div");
  app.append(sceneRoot, uiRoot, heading, tagline);
  const scene = createScene(sceneRoot);

  // A stored session whose time ran out while the page was closed is settled by the first reload step.
  let state: State = step(INITIAL_STATE, { type: "reload", state: storage.load() }, Date.now());

  const dispatch = (event: Event, now: number): void => {
    const next = step(state, event, now);
    if (next !== state) {
      storage.save(state, next);
      state = next;
    }
  };

  // Visibility: sync once after the reload step and before the first frame, then watch for the life of the page.
  wireVisibility({ target: browserVisibilityTarget(), clock: Date.now, dispatch });

  // Settings and the controls. The interface gets `dispatch`, never `step`.
  let settings = settingsStore.load();
  const ui = createInterface({
    root: uiRoot,
    sceneRoot,
    dispatch,
    now: Date.now,
    getState: () => state,
    settings,
    onSettings: (next) => {
      settings = next;
      settingsStore.save(next);
    },
  });

  const frame = (): void => {
    const now = Date.now();
    dispatch({ type: "tick" }, now);
    scene.apply(sceneModel(state, now, { reducedMotion: reduced.matches }));
    ui.update(state, now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
