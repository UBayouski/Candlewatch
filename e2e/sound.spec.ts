import { expect, test } from "@playwright/test";
import { FIXTURES, openApp, press, rawSession, settle } from "./controls-fixtures";
import { T0 } from "./scene-fixtures";
import { FAKE_AUDIO_SCRIPT, audioLog, constructions, cuesPlayed, resumes } from "./sound-fixtures";

test("sound helper: a fresh page constructs no AudioContext before a gesture", async ({ browser }) => {
  const app = await openApp(browser, { initScripts: [FAKE_AUDIO_SCRIPT] });
  try {
    expect(constructions(await audioLog(app.page))).toBe(0);
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test.describe("sound E3, E4 and E8", () => {
  test.setTimeout(90_000);
  test("sound off has no context or cue through a session", async ({ browser }) => {
    const app = await openApp(browser, { initScripts: [FAKE_AUDIO_SCRIPT], settings: JSON.stringify({ v: 1, sound: false, ghosts: true, defaultLength: 15 }) });
    try {
      await app.page.locator("#light").focus();
      await press(app.page, "Enter");
      await app.page.clock.runFor(15 * 60_000 + 1000);
      const log = await audioLog(app.page);
      expect(constructions(log)).toBe(0);
      expect(cuesPlayed(log)).toEqual([]);
    } finally { await app.close(); }
  });

  test("turning sound on waits for a transition; off stops nodes without an engine event", async ({ browser }) => {
    const app = await openApp(browser, { initScripts: [FAKE_AUDIO_SCRIPT], settings: JSON.stringify({ v: 1, sound: false, ghosts: true, defaultLength: 15 }) });
    try {
      await app.page.locator("#light").focus();
      await press(app.page, "Enter");
      await app.page.locator("#settings-button").click();
      await settle(app.page);
      await app.page.locator("#sound").click();
      expect(constructions(await audioLog(app.page))).toBe(1);
      expect(cuesPlayed(await audioLog(app.page))).toEqual([]);
      await app.page.locator("#close").click();
      await app.page.clock.runFor(15 * 60_000 + 1000);
      expect(cuesPlayed(await audioLog(app.page))).toEqual(["chime"]);
      await app.page.locator("#settings-button").click();
      await settle(app.page);
      const before = await rawSession(app.page);
      const stopsBefore = (await audioLog(app.page)).filter((e) => e.kind === "stop").length;
      await app.page.locator("#sound").click();
      await app.page.clock.runFor(50);
      expect((await audioLog(app.page)).filter((e) => e.kind === "stop").length).toBeGreaterThan(stopsBefore);
      expect(await rawSession(app.page)).toBe(before);
    } finally { await app.close(); }
  });

  test("a session ended while closed plays no load or first-gesture cue", async ({ browser }) => {
    const app = await openApp(browser, { fixture: FIXTURES.litPastCompletion, initScripts: [FAKE_AUDIO_SCRIPT] });
    try {
      expect(cuesPlayed(await audioLog(app.page))).toEqual([]);
      await app.page.locator("#settings-button").click();
      expect(cuesPlayed(await audioLog(app.page))).toEqual([]);
    } finally { await app.close(); }
  });

  test("burn-out before first gesture is silent, next Light strikes", async ({ browser }) => {
    const app = await openApp(browser, { fixture: FIXTURES.litStart, now: T0 + 25 * 60_000 - 2000, initScripts: [FAKE_AUDIO_SCRIPT] });
    try {
      await app.page.clock.runFor(3000);
      expect(cuesPlayed(await audioLog(app.page))).toEqual([]);
      await app.page.locator("#light").click();
      expect(cuesPlayed(await audioLog(app.page))).toEqual(["strike"]);
    } finally { await app.close(); }
  });

  for (const reducedMotion of [false, true]) {
    test(`reduced motion ${reducedMotion}: same cue and node signatures`, async ({ browser }) => {
      const app = await openApp(browser, { initScripts: [FAKE_AUDIO_SCRIPT], reducedMotion, settings: JSON.stringify({ v: 1, sound: true, ghosts: true, defaultLength: 15 }) });
      try {
        await app.page.locator("#light").focus();
        await press(app.page, "Enter");
        await app.page.clock.runFor(15 * 60_000 + 1000);
        const log = await audioLog(app.page);
        expect(cuesPlayed(log)).toEqual(["strike", "chime"]);
        expect(log.filter((e) => ["osc", "noise", "filter"].includes(e.kind)).map((e) => [e.kind, e.hz, e.waveform, e.filter])).toEqual([
          ["noise", undefined, undefined, undefined],
          ["filter", 4000, undefined, "bandpass"],
          ["osc", 160, "triangle", undefined],
          ["osc", 660, "sine", undefined],
          ["osc", 880, "sine", undefined],
          ["osc", 1320, "sine", undefined],
        ]);
      } finally { await app.close(); }
    });
  }
});

test.describe("sound E1 and E1b", () => {
  for (const fixture of [null, FIXTURES.litStart]) {
    test(`no construction before a gesture: ${fixture?.name ?? "fresh"}`, async ({ browser }) => {
      const app = await openApp(browser, { fixture, initScripts: [FAKE_AUDIO_SCRIPT] });
      try {
        expect(constructions(await audioLog(app.page))).toBe(0);
        await settle(app.page);
        await app.page.clock.runFor(96);
        await app.page.mouse.move(17, 19);
        expect(constructions(await audioLog(app.page))).toBe(0);
        expect(app.errors).toEqual([]);
      } finally { await app.close(); }
    });
  }

  test("first Enter resumes before its strike voice", async ({ browser }) => {
    const app = await openApp(browser, { initScripts: [FAKE_AUDIO_SCRIPT] });
    try {
      await app.page.locator("#light").focus();
      await expect(app.page.locator("#light")).toBeFocused();
      await press(app.page, "Enter");
      const log = await audioLog(app.page);
      expect(constructions(log)).toBe(1);
      expect(resumes(log)).toBe(1);
      expect(cuesPlayed(log)).toEqual(["strike"]);
      expect(log.findIndex((e) => e.kind === "resume")).toBeLessThan(log.findIndex((e) => e.kind === "noise"));
      expect(app.errors).toEqual([]);
    } finally { await app.close(); }
  });
});

test.describe("sound E2", () => {
  test("Light, Pause, Resume and burn-out play exactly strike and chime", async ({ browser }) => {
    const app = await openApp(browser, { initScripts: [FAKE_AUDIO_SCRIPT], settings: '{"v":1,"sound":true,"ghosts":true,"defaultLength":15}' });
    try {
      await press(app.page, "Enter");
      expect(cuesPlayed(await audioLog(app.page))).toEqual(["strike"]);
      await press(app.page, "Space");
      await press(app.page, "Space");
      expect(cuesPlayed(await audioLog(app.page))).toEqual(["strike"]);
      await app.page.clock.runFor(15 * 60_000 + 1000);
      expect(cuesPlayed(await audioLog(app.page))).toEqual(["strike", "chime"]);
    } finally { await app.close(); }
  });

  test("snuff confirmation plays exactly one breath", async ({ browser }) => {
    const app = await openApp(browser, { initScripts: [FAKE_AUDIO_SCRIPT] });
    try {
      await press(app.page, "Enter");
      await press(app.page, "Escape");
      await press(app.page, "Tab");
      await press(app.page, "Enter");
      expect(cuesPlayed(await audioLog(app.page))).toEqual(["strike", "breath"]);
    } finally { await app.close(); }
  });

  test("pause limit plays exactly one breath", async ({ browser }) => {
    const app = await openApp(browser, { initScripts: [FAKE_AUDIO_SCRIPT] });
    try {
      await press(app.page, "Enter");
      await press(app.page, "Space");
      await app.page.clock.runFor(10 * 60_000 + 1000);
      expect(cuesPlayed(await audioLog(app.page))).toEqual(["strike", "breath"]);
    } finally { await app.close(); }
  });
});
