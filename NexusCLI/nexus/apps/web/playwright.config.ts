import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 120000,
  use: { baseURL: "http://127.0.0.1:4321", browserName: "chromium", screenshot: "only-on-failure" },
  webServer: {
    command: "bun ../../script/browser-fixture.ts",
    url: "http://127.0.0.1:4321/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
})
