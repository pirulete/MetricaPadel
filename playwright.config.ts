import { defineConfig } from "@playwright/test";

export default defineConfig({
  // Descubre specs de API (tests/api) y E2E (tests/e2e). Los unit (*.test.ts, Jest) quedan excluidos.
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    headless: true,
  },
});
