import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "../engine";
import { dayKeyFromParts } from "./days";
import { dateLabelRect, moreRect, stoneRect, stubRect } from "./geometry";
import { planView } from "./plan";
import { DEFAULT_LIMITS, visibleHistory } from "./visible";

// Ends 0..99 are 1 Nov, 100..199 are 2 Nov, and so on: no machine time zone is read.
const dayKeyOf = (ms: number): string => dayKeyFromParts(2026, 11, Math.floor(ms / 100) + 1);

const entry = (endedAt: number, outcome: HistoryEntry["outcome"], intent: string | null = null): HistoryEntry => ({
  startedAt: endedAt - 10,
  endedAt,
  lengthMin: 25,
  intent,
  outcome,
  distractions: 2,
  timeAwayMs: 90_000,
});

describe("planView", () => {
  it("places stones and stubs at the rectangles of the geometry, newest first", () => {
    const history = [entry(10, "snuffed", "a"), entry(20, "snuffed", "b"), entry(30, "burned-out"), entry(40, "burned-out"), entry(150, "burned-out")];
    const plan = planView(visibleHistory(history, { ...DEFAULT_LIMITS, dayKeyOf }));
    expect(plan.stones.map((s) => s.intent)).toEqual(["b", "a"]);
    expect(plan.stones.map((s) => s.rect)).toEqual([stoneRect(0), stoneRect(1)]);
    expect(plan.rows.map((r) => r.dayKey)).toEqual(["2026-11-02", "2026-11-01"]);
    expect(plan.rows.map((r) => r.labelRect)).toEqual([dateLabelRect(0), dateLabelRect(1)]);
    expect(plan.rows[1]?.stubs.map((s) => s.rect)).toEqual([stubRect(1, 0), stubRect(1, 1)]);
    expect(plan.rows[1]?.stubs.map((s) => s.item.entry.endedAt)).toEqual([40, 30]);
  });

  it("builds the navigation layout from the same ids it draws", () => {
    const history = [entry(10, "snuffed"), entry(20, "burned-out"), entry(130, "burned-out")];
    const plan = planView(visibleHistory(history, { ...DEFAULT_LIMITS, dayKeyOf }));
    expect(plan.layout.graveyard).toEqual(plan.stones.map((s) => s.id));
    expect(plan.layout.shelf).toEqual(plan.rows.map((r) => r.stubs.map((s) => s.id)));
    const ids = [...plan.layout.graveyard, ...plan.layout.shelf.flat()];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives each item its name and the five description lines", () => {
    const plan = planView(visibleHistory([entry(10, "snuffed", "Write the essay")], { ...DEFAULT_LIMITS, dayKeyOf }));
    const stone = plan.stones[0];
    expect(stone?.name).toBe("Write the essay, 1 Nov");
    expect(stone?.date).toBe("1 Nov");
    expect(stone?.lines).toHaveLength(5);
  });

  it("uses the placeholder for a missing intent", () => {
    const plan = planView(visibleHistory([entry(10, "snuffed", null)], { ...DEFAULT_LIMITS, dayKeyOf }));
    expect(plan.stones[0]?.intent).toBe("No intent");
  });

  it("has no count lines and no more-text when nothing is hidden, and has them when something is", () => {
    const few = planView(visibleHistory([entry(10, "snuffed"), entry(20, "burned-out")], { ...DEFAULT_LIMITS, dayKeyOf }));
    expect(few.stonesCount).toBeNull();
    expect(few.daysCount).toBeNull();
    expect(few.rows[0]?.more).toBeNull();

    const many = [...Array.from({ length: 11 }, (_, i) => entry(i, "snuffed")), ...Array.from({ length: 6 }, (_, i) => entry(10 + i, "burned-out"))];
    const plan = planView(visibleHistory(many, { ...DEFAULT_LIMITS, dayKeyOf }));
    expect(plan.stones).toHaveLength(10);
    expect(plan.stonesCount).toBe("1 older stone not shown");
    expect(plan.rows[0]?.stubs).toHaveLength(4);
    expect(plan.rows[0]?.more).toEqual({ text: "+2 more", rect: moreRect(0) });
  });

  it("plans nothing for an empty history", () => {
    const plan = planView(visibleHistory([], { ...DEFAULT_LIMITS, dayKeyOf }));
    expect(plan.stones).toEqual([]);
    expect(plan.rows).toEqual([]);
    expect(plan.layout).toEqual({ graveyard: [], shelf: [] });
  });
});
