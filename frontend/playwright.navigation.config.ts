import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 20_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: process.env.CORE_PREVIEW_URL ?? "http://127.0.0.1:3002",
    trace: "retain-on-failure",
  },
});
