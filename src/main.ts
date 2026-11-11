import { INITIAL_STATE, step } from "./engine";
import type { Event, State } from "./engine";
import { createScene, sceneModel } from "./scene";
import "./scene/scene.css";
import { browserStore, createStorage } from "./storage/storage";
import { STRINGS } from "./strings";

// The one place that owns the clock and the redraw loop (candle-scene R1.3, R13.1).
// No controls and no visibility wiring yet; later specs add them by calling `dispatch`.

const storage = createStorage(browserStore());
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

  const sceneRoot = document.createElement("div");
  sceneRoot.id = "scene";
  app.append(sceneRoot, heading, tagline);
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

  const frame = (): void => {
    const now = Date.now();
    dispatch({ type: "tick" }, now);
    scene.apply(sceneModel(state, now, { reducedMotion: reduced.matches }));
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
