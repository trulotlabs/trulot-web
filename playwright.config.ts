import { defineConfig, devices } from "@playwright/test";
import { elevatePilotBatchFixture } from "./tests/fixtures/elevate-pilot-batch";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      ELEVATE_INTERVIEW_TOKEN: "elevate-playwright-token",
      ELEVATE_INTERVIEW_MOCK: "true",
      ELEVATE_PILOT_BATCH_JSON: JSON.stringify(elevatePilotBatchFixture),
      ELEVATE_RESULTS_EMAIL: "results@example.test",
    },
  },
});
