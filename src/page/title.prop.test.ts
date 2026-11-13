// Property tests for the page title (sound-and-title design 3.5, section 9). Properties 6 and 7.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { INITIAL_STATE, step, timeLeftMs } from "../engine";
import type { State } from "../engine";
import { arbT0 } from "../engine/test-kit";
import { DEFAULT_SETTINGS } from "../storage/settings";
import { STRINGS } from "../strings";
import { fill, formatTime } from "../ui/format";
import { placeControls } from "../ui/layout";
import { initialUi } from "../ui/ui-state";
import { viewOf } from "../ui/view";
import { PROP_PARAMS, arbAnyState, arbLitState, arbNonDecreasingTimes, arbPhaseScript } from "./test-kit";
import { titleFor } from "./title";

const MIN = 60_000;
const placement = placeControls(1280, 800);
const ui0 = initialUi(DEFAULT_SETTINGS);
const timeText = (state: State, now: number): string => viewOf(state, ui0, DEFAULT_SETTINGS, now, placement, { finePointer: true }).timeText;

/** An offset of `now` from the state's last step: the past, the present, a long way on, and the non-finite. */
const arbNowOffset = fc.oneof(
  fc.integer({ min: -60_000, max: 60 * MIN }),
  fc.integer({ min: 0, max: 48 * 3_600_000 }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
);

/** A marker that occurs in no fixed string. */
const MARKER = "zqx-intent-marker";

describe("Feature: sound-and-title, Property 6: The title carries the time left and no intent", () => {
  it("each phase gives its form, the time equals the Time_Text of viewOf, and the intent never appears", () => {
    const phases = new Map<string, number>();
    fc.assert(
      fc.property(arbAnyState, arbNowOffset, ({ state, at }, offset) => {
        const now = at + offset;
        const title = titleFor(state, now);
        const name = STRINGS.title;
        const time = formatTime(timeLeftMs(state, now));
        switch (state.phase) {
          case "idle":
            expect(title).toBe(STRINGS.title);
            break;
          case "lit":
            expect(title).toBe(fill(STRINGS.pageTitle.lit, { time, name }));
            if (Number.isFinite(now)) expect(title.startsWith(timeText(state, now))).toBe(true);
            break;
          case "paused":
            expect(title).toBe(fill(STRINGS.pageTitle.paused, { time, name }));
            if (Number.isFinite(now)) expect(title).toContain(timeText(state, now));
            break;
          case "burned-out":
            expect(title).toBe(fill(STRINGS.pageTitle.burnedOut, { name }));
            break;
          case "snuffed":
            expect(title).toBe(fill(STRINGS.pageTitle.snuffed, { name }));
            break;
        }
        phases.set(state.phase, (phases.get(state.phase) ?? 0) + 1);
      }),
      PROP_PARAMS,
    );
    for (const p of ["idle", "lit", "paused", "burned-out", "snuffed"]) expect(phases.get(p) ?? 0, p).toBeGreaterThanOrEqual(10);
  });

  it("no title contains the session's intent, in any phase the session reaches", () => {
    fc.assert(
      fc.property(arbPhaseScript, arbT0, fc.integer({ min: 3, max: 60 }), arbNowOffset, (script, t0, n, offset) => {
        const intent = (MARKER + "-".repeat(n)).slice(0, Math.max(3, n));
        let state: State = step(INITIAL_STATE, { type: "light", length: 25, intent }, t0);
        let now = t0;
        for (const s of script) {
          now += Math.abs(s.gap);
          const event = s.kind === "light" ? { type: "light" as const, length: 25, intent } : s.kind === "reload" ? { type: "tick" as const } : { type: s.kind };
          state = step(state, event, now);
          expect(titleFor(state, now + offset)).not.toContain(intent);
        }
      }),
      PROP_PARAMS,
    );
  });
});

describe("Feature: sound-and-title, Property 7: The title changes at most once per second while lit", () => {
  it("over any non-decreasing times the changes are at most the whole seconds crossed, and the time never goes up", () => {
    let changedRuns = 0;
    fc.assert(
      fc.property(arbLitState.chain(({ state, at }) => fc.record({ state: fc.constant(state), times: arbNonDecreasingTimes(at) })), ({ state, times }) => {
        const titles = times.map((t) => titleFor(state, t));
        let changes = 0;
        for (let i = 1; i < titles.length; i++) if (titles[i] !== titles[i - 1]) changes++;
        const first = times[0] ?? 0;
        const last = times[times.length - 1] ?? 0;
        const secondsCrossed = Math.ceil(timeLeftMs(state, first) / 1000) - Math.ceil(timeLeftMs(state, last) / 1000);
        expect(changes).toBeLessThanOrEqual(secondsCrossed);
        const lefts = times.map((t) => timeLeftMs(state, t));
        for (let i = 1; i < lefts.length; i++) expect(lefts[i] ?? 0).toBeLessThanOrEqual(lefts[i - 1] ?? 0);
        // The time text of the titles never increases.
        const secs = titles.map((t) => {
          const m = /^(\d+):(\d+)/.exec(t);
          return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN;
        });
        for (let i = 1; i < secs.length; i++) expect(secs[i] ?? 0).toBeLessThanOrEqual(secs[i - 1] ?? 0);
        if (changes > 0) changedRuns++;
      }),
      PROP_PARAMS,
    );
    expect(changedRuns).toBeGreaterThanOrEqual(100);
  });
});
