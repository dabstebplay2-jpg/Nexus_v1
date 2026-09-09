import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:3101',
    viewport: { width: 1440, height: 1000 },
    headless: true,
  },
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:3101/api/health',
    reuseExistingServer: false,
    env: { PORT: '3101', AXIOM_DATA_DIR: `.axiom/e2e/${Date.now()}` },
    timeout: 30_000,
  },
});
