// afterStep (sound-and-title design 3.9, D18; R1.6, R1.7). The one function dispatch calls after every step: it composes the pure
// choices (cueFor, titleFor) with the effects it is given, in a fixed order, and never throws. It imports no effect file: the
// player, the title adapter and the Hidden_Tick come in as arguments.
import type { Event, State } from "./engine";
import { cueFor } from "./audio/cue";
import type { Cue } from "./audio/types";
import { titleFor } from "./page/title";

export interface AfterStepDeps {
  /** The `sound` setting now. main.ts: () => settings.sound. */
  readonly sound: () => boolean;
  /** player.play. Never throws by contract, and is guarded here anyway. */
  readonly play: (cue: Cue) => void;
  /** titleAdapter.write. */
  readonly writeTitle: (title: string) => void;
  /** The Hidden_Tick control. A HiddenTick satisfies it. */
  readonly hidden: {
    start(now: number): void;
    stop(): void;
  };
}

/** Called by dispatch once per event, with the state before and after the single step call. */
export type AfterStep = (prev: State, next: State, event: Event, now: number) => void;

export function createAfterStep(deps: AfterStepDeps): AfterStep {
  return (prev, next, event, now) => {
    // 1. choose the Cue from this one Transition; `sound` is read at this moment (R2.13)
    let cue: Cue | null;
    try {
      cue = cueFor(prev, next, { eventType: event.type, sound: deps.sound(), now });
    } catch {
      cue = null;
    }
    // 2. play it
    if (cue !== null) {
      try {
        deps.play(cue);
      } catch {
        /* a failing player is silent; steps 3 and 4 still run */
      }
    }
    // 3. the title
    try {
      deps.writeTitle(titleFor(next, now));
    } catch {
      /* a failing title write must not stop step 4 */
    }
    // 4. the Hidden_Tick control
    try {
      if (event.type === "hide") deps.hidden.start(now);
      else if (event.type === "show") deps.hidden.stop();
    } catch {
      /* the next hide or show tries again */
    }
  };
}
