import { INITIAL_STATE, distractionCount, ghostSpansMs, step } from "./engine";
import type { Event, State } from "./engine";
import { browserVisibilityTarget } from "./distraction/visibility";
import { countWords } from "./ghosts/label";
import { createGhostLayer } from "./ghosts/layer";
import { GHOST_SLOTS } from "./ghosts/slots";
import { visibleGhosts } from "./ghosts/visible";
import "./ghosts/ghosts.css";
import { localDayKey } from "./graveyard/day-key";
import { doorView, viewStep } from "./graveyard/view";
import type { View, ViewInput } from "./graveyard/view";
import { createGraveyard } from "./graveyard/view-dom";
import { createScene, sceneModel } from "./scene";
import "./scene/scene.css";
import { browserStore, createStorage } from "./storage/storage";
import { createSettingsStore } from "./storage/settings";
import { STRINGS } from "./strings";
import { createInterface } from "./ui";
import "./ui/ui.css";
import "./graveyard/graveyard.css"; // after ui.css: the graveyard lives inside #ui, so source order settles ties with `#ui button`
import { wireVisibility } from "./wiring";

// The one place that owns the clock and the redraw loop (candle-scene R1.3, R13.1).
// Every user action and every visibility change reaches the engine through `dispatch`, and only through it.
// The ghosts and the graveyard add no engine event: they read the state and keep their own UI-only state (ghosts-and-graveyard R1.3).

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

  // The roots, bottom to top: the scene, the ghosts, the graveyard and its Door, the interface. DOM order is also the Tab order, so
  // the graveyard's items come before the interface's controls (ghosts-and-graveyard R6.1).
  const sceneRoot = document.createElement("div");
  sceneRoot.id = "scene";
  const ghostRoot = document.createElement("div");
  ghostRoot.id = "ghost-root"; // not "ghosts": the settings switch already has that id
  const graveRoot = document.createElement("div");
  graveRoot.id = "graveyard-root";
  const uiRoot = document.createElement("div");
  app.append(sceneRoot, ghostRoot, uiRoot, heading, tagline);
  const scene = createScene(sceneRoot);
  const ghostLayer = createGhostLayer(ghostRoot);

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

  // The view is UI state, never stored: every page load starts in the room whatever phase is stored (R3.11).
  let view: View = "room";

  // Settings and the controls. The interface gets `dispatch`, never `step`.
  let settings = settingsStore.load();
  const ui = createInterface({
    root: uiRoot,
    sceneRoot,
    dispatch,
    now: Date.now,
    getState: () => state,
    view: () => view,
    settings,
    onSettings: (next) => {
      settings = next;
      settingsStore.save(next);
    },
  });

  // The graveyard root sits inside the interface, just before the zone, so the Tab order reads: length, intent, Light, the Door, Settings
  // (controls-and-access E4). In the graveyard view the same place holds the groups and the return control.
  const watchSection = uiRoot.querySelector("#watch");
  if (watchSection) uiRoot.insertBefore(graveRoot, watchSection);
  else uiRoot.append(graveRoot);

  const drawGraveyard = (): void => graveyard.apply({ view, door: doorView(state.phase), history: state.history, dayKeyOf: localDayKey });

  /** Runs a view input. A change of view is announced once through the live region, then the graveyard is drawn and focus moves, in the same frame (CR3). */
  const changeView = (input: ViewInput): void => {
    const result = viewStep(view, input);
    if (result.view === view) return;
    view = result.view;
    ui.announce(view === "graveyard" ? STRINGS.graveyard.announceOpen : STRINGS.graveyard.announceLeave);
    drawGraveyard();
    if (result.focus === "first-group") graveyard.focusFirst();
    else if (result.focus === "door") graveyard.focusDoor();
  };

  const graveyard = createGraveyard(graveRoot, {
    phase: () => state.phase,
    overlay: () => ui.overlay(),
    onView: (request) => changeView(request === "open" ? { type: "open", phase: state.phase } : { type: "leave" }),
  });

  const frame = (): void => {
    const now = Date.now();
    dispatch({ type: "tick" }, now);

    // The ghosts: one per distraction of this session, the newest twelve, drawn only in the room and only when the setting is on.
    ghostLayer.apply({
      ghosts: visibleGhosts(ghostSpansMs(state), GHOST_SLOTS.length),
      on: settings.ghosts && view === "room",
      reduced: reduced.matches,
    });
    // The scene's label says the engine's count, whatever the ghost setting and however many ghosts are drawn (R10.1, R10.4).
    scene.apply(sceneModel(state, now, { reducedMotion: reduced.matches }), { labelSuffix: countWords(distractionCount(state)) });

    // A candle lit or paused shuts the Door and forces the room in this very frame (R3.5, R3.6, R3.12).
    changeView({ type: "phase", phase: state.phase });
    drawGraveyard();
    ui.update(state, now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
