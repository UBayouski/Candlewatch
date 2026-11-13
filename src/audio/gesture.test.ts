// Unit tests of the first-gesture listener (sound-and-title task 7.1, design 3.4).
import { describe, expect, it } from "vitest";
import { createAudioPlayer } from "./audio-player";
import { countingFactory } from "./fake-audio-context";
import { armFirstGesture } from "./gesture";
import type { GestureEventName, GestureTarget } from "./gesture";

/** A recording target: keeps the listeners with their options and can fire an event at them, as a browser would. */
function fakeTarget() {
  const listeners: { type: GestureEventName; listener: () => void; capture: boolean; passive: boolean }[] = [];
  const log: string[] = [];
  const target: GestureTarget = {
    addEventListener(type, listener, options) {
      log.push(`add ${type}`);
      listeners.push({ type, listener, capture: options.capture, passive: options.passive === true });
    },
    removeEventListener(type, listener, options) {
      log.push(`remove ${type}`);
      const i = listeners.findIndex((l) => l.type === type && l.listener === listener && l.capture === options.capture);
      if (i !== -1) listeners.splice(i, 1);
    },
  };
  /** Dispatches to a copy of the list, so a listener removed during the dispatch still runs this once (as in the DOM). */
  const fire = (type: GestureEventName): void => {
    for (const l of listeners.filter((x) => x.type === type)) l.listener();
  };
  return { target, listeners, log, fire };
}

describe("armFirstGesture (design 3.4)", () => {
  it("adds keydown, pointerdown and touchend in the capture phase, touchend passive", () => {
    const t = fakeTarget();
    armFirstGesture(t.target, () => true, () => true);
    expect(t.listeners.map((l) => [l.type, l.capture, l.passive])).toEqual([
      ["keydown", true, false],
      ["pointerdown", true, false],
      ["touchend", true, true],
    ]);
    expect(new Set(t.listeners.map((l) => l.listener)).size).toBe(1);
  });

  for (const type of ["keydown", "pointerdown", "touchend"] as const) {
    it(`the first ${type} with sound on unlocks and removes all three in the same dispatch`, () => {
      const t = fakeTarget();
      const f = countingFactory();
      const player = createAudioPlayer({ factory: f.factory, sound: true });
      armFirstGesture(t.target, () => true, player.unlock);
      t.fire(type);
      expect(f.calls()).toBe(1);
      expect(player.isUnlocked()).toBe(true);
      expect(t.listeners).toEqual([]);
      t.fire("keydown");
      t.fire("pointerdown");
      expect(f.calls()).toBe(1);
    });
  }

  it("any key counts: Escape is not required and not excluded (R4.17)", () => {
    const t = fakeTarget();
    let unlocks = 0;
    armFirstGesture(t.target, () => true, () => (unlocks++, true));
    t.fire("keydown");
    expect(unlocks).toBe(1);
  });

  it("with sound off nothing is created and the listeners stay armed (R4.6)", () => {
    const t = fakeTarget();
    const f = countingFactory();
    let sound = false;
    const player = createAudioPlayer({ factory: f.factory, sound });
    armFirstGesture(t.target, () => sound, player.unlock);
    t.fire("keydown");
    t.fire("pointerdown");
    t.fire("touchend");
    expect(f.calls()).toBe(0);
    expect(t.listeners).toHaveLength(3);
    // A later turn-on unlocks inside its own click (R4.5); the next gesture finds an unlocked player and disarms.
    sound = true;
    player.setSound(true);
    expect(f.calls()).toBe(1);
    t.fire("pointerdown");
    expect(f.calls()).toBe(1);
    expect(t.listeners).toEqual([]);
  });

  it("an unlock that returns false still disarms", () => {
    const t = fakeTarget();
    const player = createAudioPlayer({ factory: () => null, sound: true });
    armFirstGesture(t.target, () => true, player.unlock);
    t.fire("keydown");
    expect(player.isUnlocked()).toBe(false);
    expect(t.listeners).toEqual([]);
  });

  it("an unlock that throws is swallowed and still disarms", () => {
    const t = fakeTarget();
    armFirstGesture(
      t.target,
      () => true,
      () => {
        throw new Error("boom");
      },
    );
    expect(() => t.fire("touchend")).not.toThrow();
    expect(t.listeners).toEqual([]);
  });

  it("pointer then touch: the handler runs once in total", () => {
    const t = fakeTarget();
    let unlocks = 0;
    armFirstGesture(t.target, () => true, () => (unlocks++, true));
    t.fire("pointerdown");
    t.fire("touchend");
    expect(unlocks).toBe(1);
  });

  it("disarm removes all three with capture, and twice is safe", () => {
    const t = fakeTarget();
    const disarm = armFirstGesture(t.target, () => true, () => true);
    disarm();
    expect(t.listeners).toEqual([]);
    disarm();
    expect(t.log).toEqual(["add keydown", "add pointerdown", "add touchend", "remove keydown", "remove pointerdown", "remove touchend"]);
  });

  it("the handler takes no event, so it cannot call preventDefault or stopPropagation", () => {
    const t = fakeTarget();
    armFirstGesture(t.target, () => true, () => true);
    expect(t.listeners.every((l) => l.listener.length === 0)).toBe(true);
  });
});
