import { describe, expect, it } from "vitest";
import { INITIAL_STATE, step } from "../engine";
import type { State } from "../engine";
import { STRINGS } from "../strings";
import { INITIAL_ANNOUNCER, limitAnnouncement, nextAnnouncement, refusalAnnouncement, textOf, timeAnnouncement } from "./announcer";
import type { AnnouncerMemory, AnnouncementKey } from "./announcer";

const SEC = 1000;
const MIN = 60 * SEC;
const T0 = 1_800_000_000_000;

/** The memory of a page that loaded idle: the next light says "lit", not "restored". */
const IDLE_PAGE: AnnouncerMemory = nextAnnouncement(INITIAL_ANNOUNCER, INITIAL_STATE, T0 - 1).mem;

const lit = (lengthMin: number, at = T0): State => step(INITIAL_STATE, { type: "light", length: lengthMin }, at);

/** Plays a session from the light, calling the announcer every `callEvery` ms (and ticking the engine at each call, as the loop does). */
function play(lengthMin: number, callEvery: number, until = lengthMin * MIN + callEvery): AnnouncementKey[] {
  let state = lit(lengthMin);
  let mem: AnnouncerMemory = IDLE_PAGE;
  const said: AnnouncementKey[] = [];
  for (let at = T0; at <= T0 + until; at += callEvery) {
    state = step(state, { type: "tick" }, at);
    const r = nextAnnouncement(mem, state, at);
    mem = r.mem;
    if (r.announcement) said.push(r.announcement.key);
  }
  return said;
}

describe("a whole session (R9.2, R9.3)", () => {
  it("called once a second says: lit, a quarter, half, three quarters, the last minute, burned out", () => {
    expect(play(25, SEC)).toEqual(["lit", "q75", "q50", "q25", "lastMinute", "burnedOut"]);
  });
  it("called every 10 minutes says the latest milestone crossed since the last call", () => {
    expect(play(25, 10 * MIN, 30 * MIN)).toEqual(["lit", "q75", "q25", "burnedOut"]);
  });
  it("called every 20 minutes says one milestone, not three", () => {
    expect(play(25, 20 * MIN, 40 * MIN)).toEqual(["lit", "q25", "burnedOut"]);
  });
  it("a 5-minute session has separate milestones at 75 s and 60 s", () => {
    expect(play(5, SEC)).toEqual(["lit", "q75", "q50", "q25", "lastMinute", "burnedOut"]);
  });
  it("says the text with the time in words", () => {
    let state = lit(25);
    const first = nextAnnouncement(IDLE_PAGE, state, T0);
    expect(first.announcement && textOf(first.announcement)).toBe("The wick catches. 25 minutes left.");
    state = step(state, { type: "tick" }, T0 + 6 * MIN + 30 * SEC);
    const q = nextAnnouncement(first.mem, state, T0 + 6 * MIN + 30 * SEC);
    expect(q.announcement && textOf(q.announcement)).toBe("A quarter is gone. 18 minutes 30 seconds left.");
  });
});

describe("pause and resume", () => {
  it("says the pause and the resume once, nothing while paused, and keeps the milestones", () => {
    let state = lit(25);
    let r = nextAnnouncement(IDLE_PAGE, state, T0);
    const said: (AnnouncementKey | null)[] = [r.announcement?.key ?? null];
    const call = (at: number): void => {
      r = nextAnnouncement(r.mem, state, at);
      said.push(r.announcement?.key ?? null);
    };
    state = step(state, { type: "tick" }, T0 + 7 * MIN);
    call(T0 + 7 * MIN); // q75 (18 min left)
    state = step(state, { type: "pause" }, T0 + 8 * MIN);
    call(T0 + 8 * MIN); // paused
    call(T0 + 9 * MIN); // nothing while paused
    call(T0 + 17 * MIN); // nothing, however long
    state = step(state, { type: "resume" }, T0 + 17 * MIN);
    call(T0 + 17 * MIN); // resumed
    call(T0 + 17 * MIN + SEC); // q75 is not said again
    expect(said).toEqual(["lit", "q75", "paused", null, null, "resumed", null]);
  });
});

describe("the first call after a load", () => {
  it("says a lit session once and marks the milestones already passed as done", () => {
    const state = step(lit(25), { type: "tick" }, T0 + 13 * MIN); // 12 min left: q75 and q50 passed
    const first = nextAnnouncement(INITIAL_ANNOUNCER, state, T0 + 13 * MIN);
    expect(first.announcement && textOf(first.announcement)).toBe("The candle is burning. 12 minutes left.");
    const again = nextAnnouncement(first.mem, state, T0 + 13 * MIN + SEC);
    expect(again.announcement).toBeNull();
    // The next milestone still comes.
    const later = nextAnnouncement(again.mem, step(state, { type: "tick" }, T0 + 19 * MIN), T0 + 19 * MIN);
    expect(later.announcement?.key).toBe("q25");
  });
  it("says a paused session once and keeps its passed milestones done for after the resume", () => {
    let state = step(lit(25), { type: "tick" }, T0 + 13 * MIN);
    state = step(state, { type: "pause" }, T0 + 13 * MIN);
    const first = nextAnnouncement(INITIAL_ANNOUNCER, state, T0 + 14 * MIN);
    expect(first.announcement?.key).toBe("paused");
    state = step(state, { type: "resume" }, T0 + 15 * MIN);
    const resumed = nextAnnouncement(first.mem, state, T0 + 15 * MIN);
    expect(resumed.announcement?.key).toBe("resumed");
    expect(nextAnnouncement(resumed.mem, state, T0 + 15 * MIN + SEC).announcement).toBeNull();
  });
  it("says nothing on an idle page or an ended page", () => {
    expect(nextAnnouncement(INITIAL_ANNOUNCER, INITIAL_STATE, T0).announcement).toBeNull();
    const lit25 = lit(25);
    const burned = step(lit25, { type: "tick" }, T0 + 25 * MIN);
    const snuffed = step(lit25, { type: "snuff" }, T0 + MIN);
    for (const state of [burned, snuffed]) {
      const first = nextAnnouncement(INITIAL_ANNOUNCER, state, T0 + 30 * MIN);
      expect(first.announcement).toBeNull();
      expect(nextAnnouncement(first.mem, state, T0 + 31 * MIN).announcement).toBeNull();
    }
  });
});

describe("the ends", () => {
  it("says snuffed for a snuff and for the pause limit, and nothing for the end of the break", () => {
    const base = nextAnnouncement(IDLE_PAGE, lit(25), T0);
    const snuffed = step(lit(25), { type: "snuff" }, T0 + MIN);
    expect(nextAnnouncement(base.mem, snuffed, T0 + MIN).announcement?.key).toBe("snuffed");

    const paused = step(lit(25), { type: "pause" }, T0 + MIN);
    const mid = nextAnnouncement(base.mem, paused, T0 + MIN);
    const limit = step(paused, { type: "tick" }, T0 + MIN + 10 * MIN + 1);
    expect(limit.phase).toBe("snuffed");
    expect(nextAnnouncement(mid.mem, limit, T0 + 12 * MIN).announcement?.key).toBe("snuffed");

    const burned = step(lit(25), { type: "tick" }, T0 + 25 * MIN);
    const after = nextAnnouncement(base.mem, burned, T0 + 25 * MIN);
    expect(after.announcement?.key).toBe("burnedOut");
    expect(nextAnnouncement(after.mem, burned, T0 + 25 * MIN + 5 * MIN + SEC).announcement).toBeNull();
  });
  it("says nothing for hide and show, and nothing when the time left is zero before the engine settles", () => {
    let state = lit(25);
    let r = nextAnnouncement(IDLE_PAGE, state, T0);
    state = step(state, { type: "hide" }, T0 + MIN);
    expect((r = nextAnnouncement(r.mem, state, T0 + MIN)).announcement).toBeNull();
    state = step(state, { type: "show" }, T0 + 2 * MIN);
    expect((r = nextAnnouncement(r.mem, state, T0 + 2 * MIN)).announcement).toBeNull();
    const past = nextAnnouncement(r.mem, state, T0 + 26 * MIN); // still `lit` in the state: no tick yet
    expect(past.announcement?.key).not.toBe("lastMinute");
    expect(past.announcement).toBeNull();
  });
  it("a new session starts with no milestone done", () => {
    const first = lit(25);
    let r = nextAnnouncement(IDLE_PAGE, first, T0);
    const burned = step(first, { type: "tick" }, T0 + 25 * MIN);
    r = nextAnnouncement(r.mem, burned, T0 + 25 * MIN);
    const second = step(burned, { type: "light", length: 25 }, T0 + 26 * MIN);
    r = nextAnnouncement(r.mem, second, T0 + 26 * MIN);
    expect(r.announcement?.key).toBe("lit");
    expect(r.mem.done).toBe(0);
    const mid = step(second, { type: "tick" }, T0 + 26 * MIN + 7 * MIN);
    expect(nextAnnouncement(r.mem, mid, T0 + 33 * MIN).announcement?.key).toBe("q75");
  });
});

describe("the T key, the refusal and the limit", () => {
  it("T says the time left while lit, and the same with Paused while paused", () => {
    const state = lit(25);
    const a = timeAnnouncement(state, T0 + 12 * MIN + 29 * SEC);
    expect(a && textOf(a)).toBe("12 minutes 31 seconds left.");
    const paused = step(state, { type: "pause" }, T0 + 5 * MIN);
    const b = timeAnnouncement(paused, T0 + 9 * MIN);
    expect(b && textOf(b)).toBe("20 minutes left. Paused.");
  });
  it("T says nothing in idle, burned-out and snuffed", () => {
    expect(timeAnnouncement(INITIAL_STATE, T0)).toBeNull();
    expect(timeAnnouncement(step(lit(25), { type: "tick" }, T0 + 25 * MIN), T0 + 26 * MIN)).toBeNull();
    expect(timeAnnouncement(step(lit(25), { type: "snuff" }, T0 + MIN), T0 + 2 * MIN)).toBeNull();
  });
  it("builds the refusal and the limit messages without a state", () => {
    expect(textOf(refusalAnnouncement())).toBe("Choose 5 to 90 minutes.");
    expect(textOf(limitAnnouncement())).toBe("Only the first 80 characters are kept.");
  });
  it("texts come from strings.ts with no placeholder left", () => {
    for (const key of Object.keys(STRINGS.announce) as AnnouncementKey[]) {
      expect(textOf({ key, timeLeftMs: 90_000 })).not.toMatch(/[{}]/);
    }
  });
});
