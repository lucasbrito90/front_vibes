import { defineConfig, devices } from '@playwright/test';

/** Dedicated port so E2E never reuses a stale `npm run dev` on 5173. */
const PORT = 5199;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_E2E_MOCK_AUTH: 'true',
      VITE_API_BASE_URL: 'http://127.0.0.1:9999',
    },
  },
});
