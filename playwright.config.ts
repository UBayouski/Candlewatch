import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // Screenshot captures only (CANDLEWATCH_SHOTS=1): grayscale antialiasing, so small text has no teal and pink sub-pixel fringes.
  // The normal run launches Chromium with its defaults.
  use: { baseURL: "http://localhost:4173", ...(process.env["CANDLEWATCH_SHOTS"] === "1" ? { launchOptions: { args: ["--disable-lcd-text"] } } : {}) },
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
