import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH = resolve('.playwright');
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium' } }],
  webServer: [
    {
      command:
        'node node_modules/tsx/dist/cli.mjs --tsconfig apps/app/tsconfig.json apps/app/test/e2e-server.ts',
      url: 'http://127.0.0.1:3101/api/health',
      timeout: 60000,
      reuseExistingServer: false,
      env: { APP_ORIGIN: 'http://localhost:3100' },
    },
    {
      command: 'node ../../node_modules/next/dist/bin/next dev --port 3100',
      cwd: 'apps/web',
      url: 'http://localhost:3100',
      timeout: 90000,
      reuseExistingServer: false,
      env: { API_URL: 'http://127.0.0.1:3101' },
    },
  ],
});
