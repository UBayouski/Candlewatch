// Property tests for roving focus (ghosts-and-graveyard design 8.4). Properties 12 and 13.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { NO_MEMORY, navigate, remember, tabStops } from "./focus";
import type { FocusMemory, GroupId, NavKey, NavLayout } from "./focus";
import { PROP_PARAMS, arbNavLayout } from "./test-kit";

const KEYS: readonly NavKey[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
const GROUPS: readonly GroupId[] = ["graveyard", "shelf"];

type MemoryKind = "none" | "drawn" | "stale" | "other";

const arbMemoryPick = fc.record({
  kind: fc.constantFrom<MemoryKind>("none", "drawn", "stale", "other"),
  index: fc.nat(100),
});
type MemoryPick = { readonly kind: MemoryKind; readonly index: number };

const arbStart = fc.record({ kind: fc.constantFrom("stop", "any", "unknown"), index: fc.nat(100) });

/** The Group's ids in reading order, from the layout arrays (rows concatenated, newest day first). */
function listOf(layout: NavLayout, group: GroupId): string[] {
  if (group === "graveyard") return [...layout.graveyard];
  const out: string[] = [];
  for (const row of layout.shelf) for (const id of row) out.push(id);
  return out;
}

const other = (group: GroupId): GroupId => (group === "graveyard" ? "shelf" : "graveyard");

/** A remembered id of the requested kind for one Group. */
function memoryFor(layout: NavLayout, group: GroupId, pick: MemoryPick): string | null {
  const own = listOf(layout, group);
  const foreign = listOf(layout, other(group));
  switch (pick.kind) {
    case "none":
      return null;
    case "drawn":
      return own.length > 0 ? (own[pick.index % own.length] ?? null) : null;
    case "stale":
      return `gone${pick.index}`;
    case "other":
      return foreign.length > 0 ? (foreign[pick.index % foreign.length] ?? "foreign") : "foreign";
  }
}

/** The tab stop by the rule: the remembered id if it is drawn in the Group, else the first id, else none. */
function referenceStop(own: readonly string[], remembered: string | null): string | null {
  for (const id of own) if (id === remembered) return id;
  return own.length > 0 ? (own[0] ?? null) : null;
}

/** The row and column of an id on the Shelf, by plain loops. */
function cellOf(layout: NavLayout, id: string): { row: number; col: number } | null {
  for (let r = 0; r < layout.shelf.length; r++) {
    const row = layout.shelf[r] ?? [];
    for (let c = 0; c < row.length; c++) if (row[c] === id) return { row: r, col: c };
  }
  return null;
}

/** The reference walk over the flattened list. */
function referenceNavigate(layout: NavLayout, group: GroupId, current: string, key: NavKey): string {
  const list = listOf(layout, group);
  if (list.length === 0) return current;
  const at = list.indexOf(current);
  if (at < 0) return list[0] ?? current;
  if (key === "Home") return list[0] ?? current;
  if (key === "End") return list[list.length - 1] ?? current;
  if (key === "ArrowLeft") return at === 0 ? current : (list[at - 1] ?? current);
  if (key === "ArrowRight") return at === list.length - 1 ? current : (list[at + 1] ?? current);
  if (group === "graveyard") return current;
  const cell = cellOf(layout, current);
  if (cell === null) return current;
  const row = layout.shelf[key === "ArrowUp" ? cell.row - 1 : cell.row + 1];
  if (row === undefined || row.length === 0) return current;
  return row[Math.min(cell.col, row.length - 1)] ?? current;
}

describe("Feature: ghosts-and-graveyard, Property 12: Roving focus keeps one stop and stays in its Group", () => {
  it("has one tab stop per non-empty Group, keeps every result in its Group, never wraps, and equals the reference", () => {
    const seen = { graveyard: 0, shelfRows: 0, empty: 0, stale: 0 };
    fc.assert(
      fc.property(
        arbNavLayout,
        fc.tuple(arbMemoryPick, arbMemoryPick),
        fc.array(fc.tuple(fc.constantFrom(...GROUPS), arbStart, fc.array(fc.constantFrom(...KEYS), { maxLength: 12 })), { minLength: 1, maxLength: 4 }),
        (layout, picks, walks) => {
          const memory: FocusMemory = { graveyard: memoryFor(layout, "graveyard", picks[0]), shelf: memoryFor(layout, "shelf", picks[1]) };
          const stops = tabStops(layout, memory);
          for (const group of GROUPS) {
            const own = listOf(layout, group);
            expect(stops[group]).toBe(referenceStop(own, memory[group]));
            if (own.length === 0) expect(stops[group]).toBeNull();
            else expect(own.filter((id) => id === stops[group])).toHaveLength(1);
          }

          // Tab stops never read the other Group, and remembering a drawn id makes it the stop.
          expect(tabStops(layout, NO_MEMORY)).toEqual({ graveyard: layout.graveyard[0] ?? null, shelf: layout.shelf[0]?.[0] ?? null });
          for (const group of GROUPS) {
            const own = listOf(layout, group);
            const id = own[own.length - 1];
            if (id !== undefined) expect(tabStops(layout, remember(NO_MEMORY, group, id))[group]).toBe(id);
          }

          if (layout.graveyard.length > 0) seen.graveyard++;
          if (layout.shelf.length > 1) seen.shelfRows++;
          if (layout.graveyard.length === 0 || layout.shelf.length === 0) seen.empty++;
          if (GROUPS.some((g) => memory[g] !== null && !listOf(layout, g).includes(memory[g] ?? ""))) seen.stale++;

          for (const [group, start, keys] of walks) {
            const own = listOf(layout, group);
            if (own.length === 0) continue;
            let current =
              start.kind === "stop" ? (stops[group] ?? "") : start.kind === "any" ? (own[start.index % own.length] ?? "") : `unknown${start.index}`;
            for (const key of keys) {
              const next = navigate(layout, group, current, key);
              expect(next).toBe(referenceNavigate(layout, group, current, key));
              expect(own).toContain(next);
              const at = own.indexOf(current);
              if (at >= 0) {
                if (key === "ArrowLeft" && at === 0) expect(next).toBe(current);
                if (key === "ArrowRight" && at === own.length - 1) expect(next).toBe(current);
                if (key === "Home") expect(next).toBe(own[0]);
                if (key === "End") expect(next).toBe(own[own.length - 1]);
              }
              current = next;
            }
          }
        },
      ),
      { ...PROP_PARAMS },
    );
    // Coverage guard: the interesting layouts and memories are met often enough.
    expect(seen.graveyard).toBeGreaterThanOrEqual(20);
    expect(seen.shelfRows).toBeGreaterThanOrEqual(20);
    expect(seen.empty).toBeGreaterThanOrEqual(20);
    expect(seen.stale).toBeGreaterThanOrEqual(20);
  });
});

describe("Feature: ghosts-and-graveyard, Property 13: Up and Down on the Shelf follow the day order", () => {
  it("moves Up to row r - 1 and Down to row r + 1 at column min(j, rowLength - 1), stays put with no such row, and ignores Up and Down on a Stone", () => {
    const seen = { multiRow: 0, clampShorter: 0, firstRow: 0, lastRow: 0 };
    fc.assert(
      fc.property(arbNavLayout, (layout) => {
        const rows = layout.shelf;
        let shorterBelow = false;
        let shorterAbove = false;
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r] ?? [];
          for (let j = 0; j < row.length; j++) {
            const id = row[j] ?? "";
            // R6.8, R6.9: expected ids written from the layout arrays, not from focus.ts.
            const up = rows[r - 1];
            const down = rows[r + 1];
            const expectedUp = up === undefined || up.length === 0 ? id : (up[Math.min(j, up.length - 1)] ?? id);
            const expectedDown = down === undefined || down.length === 0 ? id : (down[Math.min(j, down.length - 1)] ?? id);
            expect(navigate(layout, "shelf", id, "ArrowUp")).toBe(expectedUp);
            expect(navigate(layout, "shelf", id, "ArrowDown")).toBe(expectedDown);
            if (r === 0) {
              expect(navigate(layout, "shelf", id, "ArrowUp")).toBe(id);
              seen.firstRow++;
            }
            if (r === rows.length - 1) {
              expect(navigate(layout, "shelf", id, "ArrowDown")).toBe(id);
              seen.lastRow++;
            }
            if (up !== undefined && up.length > 0 && j >= up.length) shorterAbove = true;
            if (down !== undefined && down.length > 0 && j >= down.length) shorterBelow = true;
          }
        }
        if (rows.length >= 2) seen.multiRow++;
        if (shorterAbove || shorterBelow) seen.clampShorter++;

        // R6.8, R6.9: Up and Down on a Stone return the current id.
        for (const id of layout.graveyard) {
          expect(navigate(layout, "graveyard", id, "ArrowUp")).toBe(id);
          expect(navigate(layout, "graveyard", id, "ArrowDown")).toBe(id);
        }
      }),
      { ...PROP_PARAMS },
    );
    // Coverage guard: several rows, a clamp that matters, and both ends are met often enough.
    expect(seen.multiRow).toBeGreaterThanOrEqual(20);
    expect(seen.clampShorter).toBeGreaterThanOrEqual(20);
    expect(seen.firstRow).toBeGreaterThanOrEqual(20);
    expect(seen.lastRow).toBeGreaterThanOrEqual(20);
  });
});
