import { describe, expect, it } from "vitest";
import { INITIAL_STATE, ghostSpansMs, step } from "../engine";
import type { State } from "../engine";
import { createFakeDocument } from "./fake-document";
import { browserVisibilityTarget, eventFor, syncVisibility, watchVisibility } from "./visibility";
import type { VisibilityEventType } from "./visibility";

type Sent = [VisibilityEventType, number];

function recorder(times: number[]) {
  const sent: Sent[] = [];
  let i = 0;
  return {
    sent,
    clock: (): number => times[Math.min(i++, times.length - 1)] ?? 0,
    send: (type: VisibilityEventType, now: number): void => {
      sent.push([type, now]);
    },
  };
}

describe("eventFor", () => {
  it("maps hidden to hide and everything else to show", () => {
    expect(eventFor("hidden")).toBe("hide");
    expect(eventFor("visible")).toBe("show");
    expect(eventFor("prerender")).toBe("show");
    expect(eventFor("")).toBe("show");
  });
});

describe("watchVisibility", () => {
  it("sends hide then show with the injected clock's values", () => {
    const doc = createFakeDocument("visible");
    const r = recorder([1000, 5000]);
    watchVisibility({ target: doc, clock: r.clock, send: r.send });
    doc.setVisibility("hidden");
    doc.setVisibility("visible");
    expect(r.sent).toEqual([
      ["hide", 1000],
      ["show", 5000],
    ]);
  });

  it("registers one listener and sends nothing until the visibility changes", () => {
    const doc = createFakeDocument("visible");
    const r = recorder([1]);
    watchVisibility({ target: doc, clock: r.clock, send: r.send });
    expect(doc.listenerCount()).toBe(1);
    expect(r.sent).toEqual([]);
  });

  it("returns a function that unsubscribes: the listener is removed and later changes send nothing", () => {
    const doc = createFakeDocument("visible");
    const r = recorder([1, 2, 3]);
    const stop = watchVisibility({ target: doc, clock: r.clock, send: r.send });
    doc.setVisibility("hidden");
    stop();
    expect(doc.listenerCount()).toBe(0);
    doc.setVisibility("visible");
    doc.setVisibility("hidden");
    expect(r.sent).toEqual([["hide", 1]]);
  });

  it("can be started again after stopping", () => {
    const doc = createFakeDocument("visible");
    const r = recorder([10, 20]);
    watchVisibility({ target: doc, clock: r.clock, send: r.send })();
    watchVisibility({ target: doc, clock: r.clock, send: r.send });
    doc.setVisibility("hidden");
    expect(r.sent).toEqual([["hide", 10]]);
    expect(doc.listenerCount()).toBe(1);
  });
});

describe("syncVisibility", () => {
  it("sends show once when the page is visible", () => {
    const doc = createFakeDocument("visible");
    const r = recorder([7000]);
    syncVisibility({ target: doc, clock: r.clock, send: r.send });
    expect(r.sent).toEqual([["show", 7000]]);
  });

  it("sends hide once when the page is hidden", () => {
    const doc = createFakeDocument("hidden");
    const r = recorder([7000]);
    syncVisibility({ target: doc, clock: r.clock, send: r.send });
    expect(r.sent).toEqual([["hide", 7000]]);
  });

  it("does not subscribe to anything", () => {
    const doc = createFakeDocument("visible");
    syncVisibility({ target: doc, clock: () => 1, send: () => undefined });
    expect(doc.listenerCount()).toBe(0);
  });
});

describe("browserVisibilityTarget", () => {
  it("returns null when there is no document (this test runs in Node)", () => {
    expect(browserVisibilityTarget()).toBeNull();
  });
});

describe("wired to the engine (no real document)", () => {
  const T0 = 1_800_000_000_000;
  const MIN = 60_000;

  function session() {
    let state: State = step(INITIAL_STATE, { type: "light", length: 25 }, T0);
    const doc = createFakeDocument("visible");
    watchVisibility({
      target: doc,
      clock: () => now,
      send: (type, at) => {
        state = step(state, { type }, at);
      },
    });
    let now = T0;
    return {
      doc,
      state: (): State => state,
      at(ms: number): void {
        now = T0 + ms;
      },
    };
  }

  it("a hidden-then-visible page counts one distraction of the right length", () => {
    const s = session();
    s.at(5 * MIN);
    s.doc.setVisibility("hidden");
    s.at(8 * MIN);
    s.doc.setVisibility("visible");
    expect(ghostSpansMs(s.state())).toEqual([3 * MIN]);
  });

  it("a refresh while lit counts one short distraction: hide, then the sync show after the reload", () => {
    const s = session();
    s.at(5 * MIN);
    s.doc.setVisibility("hidden"); // the browser reports the page hidden while it unloads
    // The new page loads: restored state still has the open hide; sync reports "visible".
    const reloaded = createFakeDocument("visible");
    syncVisibility({
      target: reloaded,
      clock: () => T0 + 5 * MIN + 1500,
      send: (type, at) => {
        expect(type).toBe("show");
        expect(at).toBe(T0 + 5 * MIN + 1500);
      },
    });
    expect(s.state().phase).toBe("lit");
    const closed = step(s.state(), { type: "show" }, T0 + 5 * MIN + 1500);
    expect(ghostSpansMs(closed)).toEqual([1500]);
  });
});
