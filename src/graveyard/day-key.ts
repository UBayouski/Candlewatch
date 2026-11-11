// The local day of an instant (ghosts-and-graveyard design 4.4, R2.3, R2.5, R2.12). The one function in the ghosts and graveyard
// folders that reads `Date`: it uses the local calendar parts, so a day with a daylight-saving jump is still one key. Everything
// else takes a `DayKeyFn`, which is how the tests stay independent of the machine's time zone.
import { dayKeyFromParts } from "./days";
import type { DayKey } from "./days";

/** "YYYY-MM-DD" of the local calendar day of `ms`. A time that is not a finite, representable instant gives "0000-00-00", which sorts oldest and formats as the unknown date. */
export function localDayKey(ms: number): DayKey {
  if (!Number.isFinite(ms)) return dayKeyFromParts(0, 0, 0);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return dayKeyFromParts(0, 0, 0);
  return dayKeyFromParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
