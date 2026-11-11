// What the live region says, and when (controls-and-access R9.2 to R9.5; design 3.7, 9.2, 9.3).
// Pure: the memory goes in and comes out, `now` is an argument, nothing reads a clock.
// One message per state change, at most four milestones per session, and one per user request (the refusal, the T key, the limit).
import { INTENT_MAX_CODE_POINTS, MAX_LENGTH_MIN, MIN_LENGTH_MIN, MS_PER_MINUTE, timeLeftMs } from "../engine";
import type { State } from "../engine";
import { STRINGS } from "../strings";
import { fill, spokenTime } from "./format";

type Phase = State["phase"];

export type AnnouncementKey = keyof typeof STRINGS.announce;
export type MilestoneKey = "q75" | "q50" | "q25" | "lastMinute";

export interface Announcement {
  readonly key: AnnouncementKey;
  /** The time left to say, for the messages that name it. */
  readonly timeLeftMs?: number;
}

export interface AnnouncerMemory {
  /** False until the first call after a page load. */
  readonly started: boolean;
  readonly phase: Phase | null;
  /** The `startedAt` of the session the memory is about, or null (idle). */
  readonly sessionKey: number | null;
  /** Bitmask of the milestones already said (or already passed at a load) for this session; bit i is `MILESTONES[i]`. */
  readonly done: number;
}

export const INITIAL_ANNOUNCER: AnnouncerMemory = { started: false, phase: null, sessionKey: null, done: 0 };

/** In the order they are crossed: the later the milestone, the higher its index. */
export const MILESTONES: readonly MilestoneKey[] = ["q75", "q50", "q25", "lastMinute"];
const LAST_MINUTE_MS = 60_000;

const isRunning = (phase: Phase): boolean => phase === "lit" || phase === "paused";

/** The time-left thresholds of a session, one per milestone, in the same order as `MILESTONES`. */
export function thresholdsMs(lengthMin: number): readonly number[] {
  const length = lengthMin * MS_PER_MINUTE;
  return [length * 0.75, length * 0.5, length * 0.25, LAST_MINUTE_MS];
}

/** Which milestones the time left has reached (`<=`, as the scene does for the drips and the guttering). */
function crossedMask(state: State, now: number): number {
  if (state.phase !== "lit" && state.phase !== "paused") return 0;
  const left = timeLeftMs(state, now);
  return thresholdsMs(state.session.lengthMin).reduce((mask, threshold, i) => (left <= threshold ? mask | (1 << i) : mask), 0);
}

/** The highest set bit: the milestone nearest the end. */
function latestOf(mask: number): MilestoneKey | null {
  for (let i = MILESTONES.length - 1; i >= 0; i--) if ((mask & (1 << i)) !== 0) return MILESTONES[i] ?? null;
  return null;
}

function stateChangeMessage(from: Phase | null, newSession: boolean, state: State, now: number): Announcement | null {
  switch (state.phase) {
    case "lit":
      return from === "paused" && !newSession ? { key: "resumed" } : { key: "lit", timeLeftMs: timeLeftMs(state, now) };
    case "paused":
      return { key: "paused" };
    case "burned-out":
      return { key: "burnedOut" };
    case "snuffed":
      return { key: "snuffed" };
    case "idle":
      return null;
  }
}

/**
 * The announcement for the state at `now`, and the memory to pass to the next call.
 * - The first call after a load says a running session once (`restored` while lit, `paused` while paused), marks the milestones
 *   already passed as done, and says nothing on an idle or ended page.
 * - A change of phase says the message for the final phase; a new session starts with no milestone done; a pause and a resume keep them.
 * - While lit, the milestones reached since the last call are said once each, as the latest one only.
 * - Nothing while paused, for `hide` or `show` (they do not change the state shown here), for the end of the break, or at a time left of 0.
 */
export function nextAnnouncement(mem: AnnouncerMemory, state: State, now: number): { mem: AnnouncerMemory; announcement: Announcement | null } {
  const phase = state.phase;
  const key = state.phase === "idle" ? null : state.session.startedAt;

  if (!mem.started) {
    const announcement: Announcement | null =
      phase === "lit" ? { key: "restored", timeLeftMs: timeLeftMs(state, now) } : phase === "paused" ? { key: "paused" } : null;
    return { mem: { started: true, phase, sessionKey: key, done: crossedMask(state, now) }, announcement };
  }

  const newSession = key !== mem.sessionKey || (!isRunning(mem.phase ?? "idle") && isRunning(phase));
  if (phase !== mem.phase || key !== mem.sessionKey) {
    return {
      mem: { started: true, phase, sessionKey: key, done: newSession ? 0 : mem.done },
      announcement: stateChangeMessage(mem.phase, newSession, state, now),
    };
  }

  if (phase === "lit") {
    const left = timeLeftMs(state, now);
    const fresh = crossedMask(state, now) & ~mem.done;
    if (fresh !== 0 && left > 0) {
      const latest = latestOf(fresh);
      if (latest !== null) return { mem: { ...mem, done: mem.done | fresh }, announcement: { key: latest, timeLeftMs: left } };
    }
  }
  return { mem, announcement: null };
}

/** The T key's message: the time left, with "Paused" while paused. `null` outside `lit` and `paused`. */
export function timeAnnouncement(state: State, now: number): Announcement | null {
  if (state.phase === "lit") return { key: "timeOnRequest", timeLeftMs: timeLeftMs(state, now) };
  if (state.phase === "paused") return { key: "timeOnRequestPaused", timeLeftMs: timeLeftMs(state, now) };
  return null;
}

/** The message for a refused Light: it needs no state. */
export function refusalAnnouncement(): Announcement {
  return { key: "refused" };
}

/** The message for the intent passing its limit: it needs no state. */
export function limitAnnouncement(): Announcement {
  return { key: "limit" };
}

/** The words, from `strings.ts` and `spokenTime`. */
export function textOf(announcement: Announcement): string {
  const template = STRINGS.announce[announcement.key];
  switch (announcement.key) {
    case "refused":
      return fill(template, { min: MIN_LENGTH_MIN, max: MAX_LENGTH_MIN });
    case "limit":
      return fill(template, { max: INTENT_MAX_CODE_POINTS });
    default:
      return fill(template, { time: spokenTime(announcement.timeLeftMs ?? 0) });
  }
}
