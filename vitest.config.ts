import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: "50%",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
