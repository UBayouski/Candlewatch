// The Hidden_Tick (sound-and-title design 3.7, D3, D27; R5). Effect file: the only owner of the background timer. It sends only
// `tick` through the injected dispatch and never paints. It reads no global: the timer functions and the clock come in as arguments.
import type { Event, State } from "../engine";
import { nextWakeMs, WAKE_MAX_MS } from "./wake";

/** What `schedule` returns and `cancel` takes. The browser's timer returns a number. */
export type TimerId = number;

export interface HiddenTickDeps {
  /** Run `fn` once after about `ms` milliseconds. main.ts: (fn, ms) => window.setTimeout(fn, ms). */
  readonly schedule: (fn: () => void, ms: number) => TimerId;
  /** Cancel a timer that has not run. main.ts: (id) => window.clearTimeout(id). */
  readonly cancel: (id: TimerId) => void;
  /** Epoch ms, read when the timer callback runs (R5.1). */
  readonly clock: () => number;
  /** The one dispatch of main.ts; the Cue and the title follow from it (R1.7). */
  readonly dispatch: (event: Event, now: number) => void;
  /** The state dispatch last stored. */
  readonly getState: () => State;
}

export interface HiddenTick {
  /** Start ticking after a `hide` has reached the engine. Does nothing if already running or if no wake is needed. */
  start(now: number): void;
  /** Stop ticking and cancel the pending timer. Safe at any time, any number of times. */
  stop(): void;
  /** True from a start that armed a timer until stop() or a callback that finds nothing left to wait for. */
  isRunning(): boolean;
  /** True while a timer is armed and has not run. */
  hasPending(): boolean;
}

export function createHiddenTick(deps: HiddenTickDeps): HiddenTick {
  let running = false;
  let pending: TimerId | null = null;
  /** Changes at every arm and every stop: a callback acts only if its own id is still the current one. */
  let armId = 0;

  const arm = (wake: number): void => {
    const mine = ++armId;
    pending = deps.schedule(() => fire(mine), wake);
  };

  const fire = (mine: number): void => {
    if (mine !== armId || !running) return; // stopped or replaced: do nothing at all
    pending = null;
    try {
      deps.dispatch({ type: "tick" }, deps.clock()); // now read when the timer runs (R5.1)
    } catch {
      /* swallowed: the chain goes on below (D27) */
    }
    if (mine !== armId || !running) return; // stop() during the dispatch
    let wake: number | null;
    try {
      wake = nextWakeMs(deps.getState(), deps.clock()); // a fresh read: the dispatch took time
    } catch {
      wake = WAKE_MAX_MS; // state unreadable: look again in a second, never spin
    }
    if (wake === null) {
      running = false; // nothing left to wait for (R5.13)
      return;
    }
    arm(wake); // R5.2, R5.6
  };

  return {
    start(now) {
      if (running) return; // no second timer
      const wake = nextWakeMs(deps.getState(), now); // the state after the hide
      if (wake === null) return; // arms nothing, stays not running
      running = true;
      arm(wake);
    },
    stop() {
      running = false;
      armId++; // any callback still in flight is now stale
      if (pending !== null) {
        const id = pending;
        pending = null;
        deps.cancel(id);
      }
    },
    isRunning: () => running,
    hasPending: () => pending !== null,
  };
}
