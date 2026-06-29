import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: {
    command:
      "pnpm --filter @linkedin-profile-exporter/docs exec next dev --webpack --hostname 127.0.0.1 --port 4319",
    url: "http://127.0.0.1:4319",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  use: {
    acceptDownloads: true,
    baseURL: "http://127.0.0.1:4319",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
