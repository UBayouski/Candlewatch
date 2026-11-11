import { defineConfig } from "@playwright/test";

// Configuration for the post-deploy smoke test (hosting design 7.1): `npm run smoke`.
// It runs only e2e/live.spec.ts against BASE_URL (default: the expected live URL), starts no server,
// and never retries, so a failure is reported as it happened.
export default defineConfig({
  testDir: "e2e",
  testMatch: "live.spec.ts",
  retries: 0,
  use: { baseURL: process.env.BASE_URL ?? "https://candlewatch.onrender.com" },
});
