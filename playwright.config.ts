import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  use: {
    baseURL: "http://localhost:1420",
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run preview -- --host localhost --port 1420 --strictPort",
    url: "http://localhost:1420",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
