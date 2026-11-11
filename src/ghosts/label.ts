// The scene's accessible label (ghosts-and-graveyard design 3.10, R10). Pure: the count is the engine's count, so it is exact with
// ghosts on, off or capped, and it never depends on the ghost setting or on how many ghosts are drawn (R10.1, R10.2, R10.4).
import { STRINGS } from "../strings";
import { fill } from "../ui/format";

export type SceneMode = keyof typeof STRINGS.scene;

/** A count as a whole number of 0 or more; anything else is read as 0. */
const whole = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** "1 distraction" or "14 distractions": the words for a count, with the number in plain digits. 0 gives "0 distractions". */
export function countWords(n: number): string {
  const count = whole(n);
  return fill(count === 1 ? STRINGS.count.distraction : STRINGS.count.distractions, { n: count });
}

/** "The candle burns. 3 distractions." The state sentence of the scene, a space, the count in words and a full stop. */
export function sceneLabel(mode: SceneMode, count: number): string {
  return `${STRINGS.scene[mode]} ${countWords(count)}.`;
}
