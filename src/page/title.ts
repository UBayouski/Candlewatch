// The page title (sound-and-title design 3.5, R6). Pure and total: the state and `now` in, one string out. Every word and the
// separator come from `src/strings.ts`; the intent is never read.
import { timeLeftMs } from "../engine";
import type { State } from "../engine";
import { STRINGS } from "../strings";
import { fill, formatTime } from "../ui/format";

/** The Page_Title for this state at `now`. Total: one string for every state, including a non-finite `now`. */
export function titleFor(state: State, now: number): string {
  const name = STRINGS.title;
  switch (state.phase) {
    case "idle":
      return STRINGS.title;
    case "lit":
      return fill(STRINGS.pageTitle.lit, { time: formatTime(timeLeftMs(state, now)), name });
    case "paused":
      return fill(STRINGS.pageTitle.paused, { time: formatTime(timeLeftMs(state, now)), name });
    case "burned-out":
      return fill(STRINGS.pageTitle.burnedOut, { name });
    case "snuffed":
      return fill(STRINGS.pageTitle.snuffed, { name });
  }
}
