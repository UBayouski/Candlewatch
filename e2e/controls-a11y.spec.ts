// Focus, the accessibility tree, reduced motion and strings (controls-and-access design 13.3: E4, E6, E9, E11).
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { STRINGS } from "../src/strings";
import { colourAt } from "./scene-fixtures";
import {
  FIXTURES,
  MIN,
  SEC,
  desktop,
  focused,
  jump,
  liveTexts,
  openApp,
  phaseOf as phase,
  phone,
  press,
  settle,
  storedState,
} from "./controls-fixtures";
import type { Rect } from "./controls-fixtures";

const luminance = ([r, g, b]: number[]): number => {
  const lin = (v: number): number => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r ?? 0) + 0.7152 * lin(g ?? 0) + 0.0722 * lin(b ?? 0);
};
const contrast = (a: number[], b: number[]): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** The rectangle of `document.activeElement`, or null for the body. */
const activeRect = (page: Page): Promise<Rect | null> =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });

/** Focus is on the body, or on an element that is connected, drawn and inside the viewport. */
async function expectFocusSane(page: Page, label: string): Promise<void> {
  const state = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { body: true, ok: true, why: "" };
    const b = el.getBoundingClientRect();
    const ok = el.isConnected && el.getClientRects().length > 0 && b.x >= -0.5 && b.y >= -0.5 && b.x + b.width <= innerWidth + 0.5 && b.y + b.height <= innerHeight + 0.5;
    return { body: false, ok, why: `${el.tagName}#${el.id} ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}` };
  });
  expect(state.ok, `${label}: ${state.why}`).toBe(true);
}

/** `a` reads before `b`: wholly above it, or on the same rows and wholly to its left (the layout's own rule, P10). */
const readsBefore = (a: Rect, b: Rect): boolean => {
  if (a.y + a.h <= b.y + 0.5) return true;
  const sameRows = a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
  return sameRows && a.x + a.w <= b.x + 0.5;
};

test.describe("E4: focus", () => {
  test("the rows of the focus table (design 10)", async ({ browser }) => {
    // Page load, nothing stored: the document, so Tab reaches the chooser first. A reload into a running session: the document.
    let app = await openApp(browser);
    try {
      const { page } = app;
      expect((await focused(page)).tag).toBe("body");
      // Light refused (an invalid custom length): the custom length field.
      await page.locator("#length-custom").focus();
      await page.keyboard.type("4");
      await press(page, "Enter");
      expect((await focused(page)).id).toBe("length-custom");
      expect(await page.locator("#length-custom").getAttribute("aria-invalid")).toBe("true");
      expect((await storedState(page)).phase).toBe("idle");
      // Settings opened: the first control in the panel; closed: the Settings button.
      await page.locator("#settings-button").focus();
      await press(page, "Enter");
      expect((await focused(page)).id).toBe("sound");
      await press(page, "Escape");
      expect((await focused(page)).id).toBe("settings-button");
    } finally {
      await app.close();
    }

    app = await openApp(browser, { fixture: FIXTURES.litHalf });
    try {
      const { page } = app;
      expect((await focused(page)).tag).toBe("body");
      // Pause sent, Resume sent: the same button.
      await press(page, "Space");
      expect((await focused(page)).id).toBe("pause");
      await press(page, "Space");
      expect((await focused(page)).id).toBe("pause");
      // The dialog opens on Keep burning; Keep burning and Esc return to the element focused before.
      await page.locator("#snuff").focus();
      await press(page, "Enter");
      expect((await focused(page)).id).toBe("keep");
      await press(page, "Enter");
      expect((await focused(page)).id).toBe("snuff");
      await press(page, "Escape");
      await press(page, "Escape");
      expect((await focused(page)).id).toBe("snuff");
      // Snuff confirmed: Light.
      await press(page, "Escape");
      await press(page, "Tab");
      await press(page, "Enter");
      expect((await storedState(page)).phase).toBe("snuffed");
      expect((await focused(page)).id).toBe("light");
    } finally {
      await app.close();
    }

    // The candle burns out with nothing open: Light. With the settings panel open: held until it closes, then Light.
    app = await openApp(browser, { fixture: FIXTURES.litHalf });
    try {
      const { page } = app;
      await page.locator("#pause").focus();
      await jump(page, 13 * MIN);
      expect(await phase(page)).toBe("burned-out");
      expect((await focused(page)).id).toBe("light");
    } finally {
      await app.close();
    }
    app = await openApp(browser, { fixture: FIXTURES.litHalf });
    try {
      const { page } = app;
      await page.locator("#settings-button").focus();
      await press(page, "Enter");
      expect((await focused(page)).id).toBe("sound");
      await jump(page, 13 * MIN);
      expect(await phase(page)).toBe("burned-out");
      expect((await focused(page)).id).toBe("sound"); // held while the panel is open
      await press(page, "Escape");
      expect((await focused(page)).id).toBe("light");
    } finally {
      await app.close();
    }
  });

  for (const [name, viewport] of [["phone", phone], ["desktop", desktop]] as const) {
    test(`a scripted keyboard walk keeps focus on something visible and inside the viewport (${name})`, async ({ browser }) => {
      for (const fixture of [FIXTURES.idle, FIXTURES.litStart, FIXTURES.snuffed]) {
        const app = await openApp(browser, { fixture, viewport });
        try {
          const { page } = app;
          const keys = ["Tab", "Tab", "Shift+Tab", "Enter", "Tab", "Tab", "Space", "Escape", "Tab", "Tab", "Tab", "Shift+Tab", "Space", "Enter", "Escape", "Tab", "Shift+Tab", "Shift+Tab", "Enter", "Tab", "Escape"];
          await expectFocusSane(page, `${fixture.name} start`);
          for (const [i, key] of keys.entries()) {
            await press(page, key);
            await expectFocusSane(page, `${fixture.name}, key ${i + 1} (${key})`);
          }
          expect(app.errors).toEqual([]);
        } finally {
          await app.close();
        }
      }
    });

    test(`the Tab order equals the order of the rectangles in every phase (${name})`, async ({ browser }) => {
      const fixtures = [FIXTURES.idle, FIXTURES.litStart, FIXTURES.paused, FIXTURES.burnedOut, FIXTURES.snuffed];
      for (const fixture of fixtures) {
        const app = await openApp(browser, { fixture, viewport });
        try {
          const { page } = app;
          const stops: { label: string; rect: Rect }[] = [];
          for (let i = 0; i < 8; i++) {
            await press(page, "Tab");
            const rect = await activeRect(page);
            if (rect === null) break;
            const label = (await focused(page)).id || (await focused(page)).name;
            if (stops.some((s) => s.label === label)) break;
            stops.push({ label, rect });
          }
          expect(stops.length, fixture.name).toBeGreaterThanOrEqual(3);
          // The chooser has one stop; Settings is last.
          expect(stops.at(-1)?.label, fixture.name).toBe("settings-button");
          stops.slice(1).forEach((b, i) => expect(readsBefore((stops[i] as { rect: Rect }).rect, b.rect), `${fixture.name}: ${(stops[i] as { label: string }).label} before ${b.label}`).toBe(true));
          const running = fixture.name === "lit-start" || fixture.name === "paused";
          expect(stops.map((s) => s.label).slice(0, running ? 2 : 1).length).toBe(running ? 2 : 1);
          if (running) expect(stops.slice(0, 2).map((s) => s.label)).toEqual(["pause", "snuff"]);
          else expect(stops.slice(1).map((s) => s.label)).toEqual(["intent", "light", "door", "settings-button"]);
          // No Door stop while a candle burns or rests (ghosts-and-graveyard R3.5).
          if (running) expect(stops.map((s) => s.label)).not.toContain("door");
        } finally {
          await app.close();
        }
      }
    });
  }

  test("every focusable element shows a ring with at least 3:1 against what is next to it", async ({ browser }) => {
    /** Colours in the gap next to the element and in its ring, measured below the element (or above it when it is at the bottom). Neighbours sit 8 px apart, so what lies beyond the ring is not sampled. */
    async function ring(page: Page, label: string, rect: Rect, viewportHeight: number): Promise<void> {
      const cx = rect.x + rect.w / 2;
      const below = rect.y + rect.h + 12 < viewportHeight;
      const at = (offset: number): number => (below ? rect.y + rect.h + offset : rect.y - offset);
      // Three pixel rows each, so the patches do not touch: the gap is rows 0 to 3 outside the element, the ring rows 3 to 6.
      const gap = await colourAt(page, cx, at(1));
      const band = await colourAt(page, cx, at(4));
      expect(contrast(band, gap), `${label}: ring against the gap`).toBeGreaterThanOrEqual(3);
    }
    for (const [name, viewport] of [["phone", phone], ["desktop", desktop]] as const) {
      // At rest: the chooser stops (by Tab and arrows), the intent field, Light, Settings.
      let app = await openApp(browser, { fixture: FIXTURES.idle, viewport });
      try {
        const { page } = app;
        for (const key of ["Tab", "ArrowRight", "ArrowRight", "Tab", "Tab", "Tab"]) {
          await press(page, key);
          const rect = await activeRect(page);
          expect(rect, `${name} ${key}`).not.toBeNull();
          if (rect) await ring(page, `${name} ${(await focused(page)).id || (await focused(page)).name}`, rect, viewport.height);
        }
      } finally {
        await app.close();
      }
      // Running: Pause, Let it go dark, Settings; then the dialog's two buttons.
      app = await openApp(browser, { fixture: FIXTURES.litStart, viewport });
      try {
        const { page } = app;
        for (const key of ["Tab", "Tab", "Tab"]) {
          await press(page, key);
          const rect = await activeRect(page);
          if (rect) await ring(page, `${name} ${(await focused(page)).id}`, rect, viewport.height);
        }
        await page.locator("#snuff").focus();
        await press(page, "Enter");
        for (const key of ["", "Tab"]) {
          if (key) await press(page, key);
          const rect = await activeRect(page);
          if (rect) await ring(page, `${name} dialog ${(await focused(page)).id}`, rect, viewport.height);
        }
      } finally {
        await app.close();
      }
    }
  });

  test("an open dialog traps Tab and Shift+Tab, and Esc and Keep burning restore focus", async ({ browser }) => {
    const app = await openApp(browser, { fixture: FIXTURES.litStart });
    try {
      const { page } = app;
      const inside = (id: string): Promise<boolean> => page.evaluate((i) => !!document.activeElement?.closest(`#${i}`), id);
      await page.locator("#snuff").focus();
      await press(page, "Enter");
      for (let i = 0; i < 5; i++) {
        await press(page, "Tab");
        expect(await inside("snuff-dialog"), `Tab ${i}`).toBe(true);
      }
      for (let i = 0; i < 5; i++) {
        await press(page, "Shift+Tab");
        expect(await inside("snuff-dialog"), `Shift+Tab ${i}`).toBe(true);
      }
      await press(page, "Escape");
      expect((await focused(page)).id).toBe("snuff");
      await page.locator("#settings-button").focus();
      await press(page, "Enter");
      for (let i = 0; i < 8; i++) {
        await press(page, "Tab");
        expect(await inside("settings-dialog"), `settings Tab ${i}`).toBe(true);
      }
    } finally {
      await app.close();
    }
  });
});

test.describe("E6: the accessibility tree and the live log", () => {
  const form = [
    '- form "Light a candle":',
    '  - radiogroup "Length":',
    '    - radio "15 minutes"',
    '    - radio "25 minutes" [checked]',
    '    - radio "50 minutes"',
    '    - textbox "Custom length in minutes":',
    "      - /placeholder: __ min",
    '  - textbox "What is this candle for? (optional)"',
    "  - text: Only the first 80 characters are kept.",
  ];
  const watch = (lines: string[]): string[] => ['- region "The watch":', ...lines.map((l) => `  ${l}`)];



  const snapshots: [string, (typeof FIXTURES)[keyof typeof FIXTURES], "none" | "dialog" | "settings", string[]][] = [
    [
      "idle",
      FIXTURES.idle,
      "none",
      [...form, '  - button "Light"', ...watch(['- timer "25 minutes": "25:00"', "- paragraph: Enter lights. Space pauses. Esc lets it go dark.", '- button "Settings"']), "- status"],
    ],
    [
      "lit",
      FIXTURES.litStart,
      "none",
      [
        ...watch(['- timer /\\d+ minutes left/: /\\d\\d:\\d\\d/', "- paragraph: The wick catches.", '- button "Pause"', '- button "Let it go dark"', '- button "Settings"']),
        "- status: The candle is burning. 25 minutes left.",
      ],
    ],
    [
      "paused",
      FIXTURES.paused,
      "none",
      [
        ...watch(['- timer /\\d+ minutes left/: /\\d\\d:\\d\\d/', "- paragraph: /Pause left \\d\\d:\\d\\d/", '- button "Resume"', '- button "Let it go dark"', '- button "Settings"']),
        "- status: Paused.",
      ],
    ],
    [
      "burned-out",
      FIXTURES.burnedOut,
      "none",
      [...form, '  - button "Light another"', ...watch(['- timer "0 seconds": "00:00"', "- paragraph: The wax cools.", '- button "Settings"']), "- status"],
    ],
    [
      "snuffed",
      FIXTURES.snuffed,
      "none",
      [...form, '  - button "Light another"', ...watch(['- timer "0 seconds": "00:00"', "- paragraph: The flame is out.", '- button "Settings"']), "- status"],
    ],
    [
      "dialog",
      FIXTURES.litStart,
      "dialog",
      [
        ...watch(['- timer /\\d+ minutes left/: /\\d\\d:\\d\\d/', "- paragraph: The wick catches.", '- button "Pause"', '- button "Let it go dark"', '- button "Settings"']),
        "- status: The candle is burning. 25 minutes left.",
        '- dialog "Let it go dark?":',
        '  - heading "Let it go dark?" [level=2]',
        "  - paragraph: The candle keeps burning while you decide.",
        '  - button "Keep burning"',
        '  - button "Snuff it"',
      ],
    ],
    [
      "settings",
      FIXTURES.idle,
      "settings",
      [
        ...form,
        '  - button "Light"',
        ...watch(['- timer "25 minutes": "25:00"', "- paragraph: Enter lights. Space pauses. Esc lets it go dark.", '- button "Settings"']),
        "- status",
        '- dialog "Settings":',
        '  - heading "Settings" [level=2]',
        '  - switch "Sound On" [checked]',
        '  - switch "Ghosts On" [checked]',
        "  - text: Default length",
        '  - radiogroup "Default length":',
        '    - radio "15 minutes"',
        '    - radio "25 minutes" [checked]',
        '    - radio "50 minutes"',
        '    - textbox "Custom length in minutes":',
        "      - /placeholder: __ min",
        '  - button "Close"',
      ],
    ],
  ];

  for (const [name, fixture, overlay, expected] of snapshots) {
    test(`the tree of #ui: ${name}`, async ({ browser }) => {
      const app = await openApp(browser, { fixture });
      try {
        const { page } = app;
        if (overlay === "dialog") await press(page, "Escape");
        if (overlay === "settings") {
          await page.locator("#settings-button").click();
          await settle(page);
        }
        await expect(page.locator("#ui")).toMatchAriaSnapshot(expected.join("\n"));
      } finally {
        await app.close();
      }
    });
  }

  test("the scene's label never contains a time", async ({ browser }) => {
    // A time is clock digits ("12:31") or a number with a unit of time ("12 minutes"). The distraction count ("0 distractions") is not a time.
    const TIME = /\d+\s*:\s*\d+|\d+\s*(?:hours?|minutes?|mins?|seconds?|secs?)\b/i;
    for (const sample of ["12:31", "00:00", "Candle, 12:31 left", "12 minutes", "1 minute", "59 seconds", "2 hours", "12 min"]) expect(sample).toMatch(TIME);
    for (const sample of ["0 distractions", "1 distraction", "21 distractions", "The flame is steady 3 distractions."]) expect(sample).not.toMatch(TIME);
    for (const fixture of [FIXTURES.idle, FIXTURES.litStart, FIXTURES.litLastMinute, FIXTURES.paused, FIXTURES.burnedOut, FIXTURES.snuffed]) {
      const app = await openApp(browser, { fixture });
      try {
        const label = await app.page.locator("#scene").getAttribute("aria-label");
        expect(label, fixture.name).not.toBeNull();
        expect(label, fixture.name).not.toMatch(TIME);
      } finally {
        await app.close();
      }
    }
  });

  const SESSION_LOG = [
    /^The wick catches\. 25 minutes left\.$/,
    /^A quarter is gone\. 18 minutes( \d+ seconds?)? left\.$/,
    /^Half is gone\. 12 minutes( \d+ seconds?)? left\.$/,
    /^Three quarters gone\. 6 minutes( \d+ seconds?)? left\.$/,
    /^One minute left\. The flame gutters\.$/,
    /^The watch is over\. Morning\.$/,
  ];

  test("a whole 25-minute session in 5-second steps says exactly the list of design 9.2", async ({ browser }) => {
    const app = await openApp(browser);
    try {
      const { page } = app;
      await press(page, "Enter");
      expect((await storedState(page)).phase).toBe("lit");
      for (let t = 0; t < 25 * 60 + 10; t += 5) await page.clock.fastForward(5 * SEC);
      await settle(page);
      expect(await phase(page)).toBe("burned-out");
      const log = await liveTexts(page);
      expect(log).toHaveLength(SESSION_LOG.length);
      log.forEach((text, i) => expect(text).toMatch(SESSION_LOG[i] as RegExp));
    } finally {
      await app.close();
    }
  });

  test("the same session with the clock jumped in one run says the state changes and only the latest milestone", async ({ browser }) => {
    const app = await openApp(browser);
    try {
      const { page } = app;
      await press(page, "Enter");
      await jump(page, 26 * MIN);
      expect(await phase(page)).toBe("burned-out");
      expect(await liveTexts(page)).toEqual(["The wick catches. 25 minutes left.", "The watch is over. Morning."]);
    } finally {
      await app.close();
    }
    // A jump of 20 minutes lands past three milestones: only the latest is said.
    const half = await openApp(browser);
    try {
      const { page } = half;
      await press(page, "Enter");
      await jump(page, 20 * MIN);
      const log = await liveTexts(page);
      expect(log).toHaveLength(2);
      expect(log[1]).toMatch(/^Three quarters gone\. \d+ minutes?( \d+ seconds?)? left\.$/);
    } finally {
      await half.close();
    }
  });
});

test.describe("E9: reduced motion", () => {
  /** The animations and transitions running on the interface's elements, with their duration and target. */
  const running = (page: Page): Promise<{ target: string; duration: number }[]> =>
    page.evaluate(() =>
      document
        .getAnimations()
        .map((a) => {
          const effect = a.effect as KeyframeEffect | null;
          const target = effect?.target as Element | null | undefined;
          return { target: target?.id || target?.tagName.toLowerCase() || "", inUi: !!target?.closest("#ui"), duration: Number(effect?.getTiming().duration ?? 0) };
        })
        .filter((a) => a.inUi),
    );

  test("with reduced motion nothing in the interface animates while an overlay opens or closes or a switch changes", async ({ browser }) => {
    const app = await openApp(browser, { fixture: FIXTURES.litStart, reducedMotion: true });
    try {
      const { page } = app;
      await press(page, "Escape");
      expect(await running(page)).toEqual([]);
      await press(page, "Escape");
      expect(await running(page)).toEqual([]);
      await page.locator("#settings-button").click();
      await settle(page);
      expect(await running(page)).toEqual([]);
      await page.locator("#sound").click();
      await settle(page);
      expect(await running(page)).toEqual([]);
      await press(page, "Escape");
      expect(await running(page)).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test("without it any running animation is under 200 ms and none touches the time text or the status line", async ({ browser }) => {
    const app = await openApp(browser, { fixture: FIXTURES.litStart });
    try {
      const { page } = app;
      const seen: { target: string; duration: number }[] = [];
      for (const act of [() => press(page, "Escape"), () => press(page, "Escape"), async () => { await page.locator("#settings-button").click(); await settle(page); }, async () => { await page.locator("#sound").click(); await settle(page); }]) {
        await act();
        seen.push(...(await running(page)));
      }
      for (const a of seen) {
        expect(a.duration, a.target).toBeLessThan(200);
        expect(["time", "status"], a.target).not.toContain(a.target);
      }
      // Time and status never carry a transition or animation in their style.
      for (const selector of ["#time", "#status"]) {
        const style = await page.locator(selector).evaluate((el) => ({ t: getComputedStyle(el).transitionDuration, a: getComputedStyle(el).animationName }));
        expect(style.a, selector).toBe("none");
        expect(style.t.split(",").every((d) => parseFloat(d) === 0), selector).toBe(true);
      }
    } finally {
      await app.close();
    }
  });
});

test.describe("E11: text and strings", () => {
  const leaves = (value: unknown): string[] => (typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(leaves) : []);
  const templates = leaves(STRINGS).map((text) => new RegExp(`^${text.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{[A-Za-z0-9_]+\}/g, ".+?")}$`));
  const allowed = (text: string, intent: string | null): boolean =>
    templates.some((t) => t.test(text)) || /^\d\d:\d\d$/.test(text) || /^\d+$/.test(text) || text === "\u2713" || (intent !== null && text === intent.slice(0, 80));

  /** Every visible text node of the interface. */
  const visibleTexts = (page: Page): Promise<string[]> =>
    page.evaluate(() => {
      const out: string[] = [];
      const walker = document.createTreeWalker(document.querySelector("#ui") as Node, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.textContent ?? "").trim();
        const parent = node.parentElement;
        if (text && parent && parent.checkVisibility() && !parent.closest(".sr-only") && !parent.closest("[aria-hidden='true']") || (text && parent && parent.closest(".cell-number, .cell-check") && parent.checkVisibility())) out.push(text);
      }
      return out;
    });

  test("every visible text is in strings.ts, a time, a number or the user's own intent; the trademarked word is absent", async ({ browser }) => {
    const word = new RegExp(["pomo", "doro"].join(""), "i");
    const intent = "plan the week";
    const { INITIAL_STATE, step } = await import("../src/engine");
    const withIntent = step(INITIAL_STATE, { type: "light", length: 25, intent }, FIXTURES.litStart.now - 40);
    const cases = [
      { fixture: FIXTURES.idle, overlay: "none" },
      { fixture: FIXTURES.idle, overlay: "settings" },
      { fixture: FIXTURES.litStart, overlay: "none" },
      { fixture: FIXTURES.litStart, overlay: "dialog" },
      { fixture: FIXTURES.litLastMinute, overlay: "none" },
      { fixture: FIXTURES.paused, overlay: "none" },
      { fixture: FIXTURES.burnedOut, overlay: "none" },
      { fixture: FIXTURES.burnedOutAfterBreak, overlay: "none" },
      { fixture: FIXTURES.snuffed, overlay: "settings" },
      { fixture: { name: "lit-intent", state: withIntent, now: FIXTURES.litStart.now }, overlay: "none" },
    ] as const;
    for (const { fixture, overlay } of cases) {
      const app = await openApp(browser, { fixture, viewport: desktop });
      try {
        const { page } = app;
        if (overlay === "dialog") await press(page, "Escape");
        if (overlay === "settings") {
          await page.locator("#settings-button").click();
          await settle(page);
        }
        const texts = await visibleTexts(page);
        expect(texts.length, fixture.name).toBeGreaterThan(2);
        for (const text of texts) expect(allowed(text, fixture.name === "lit-intent" ? intent : null), `${fixture.name}/${overlay}: "${text}"`).toBe(true);
        const everything = await page.evaluate(() => document.documentElement.outerHTML + document.title);
        expect(everything).not.toMatch(word);
      } finally {
        await app.close();
      }
    }
  });
});
