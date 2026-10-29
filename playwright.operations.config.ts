import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: 'staff-operations.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:3196',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: 'node scripts/operations-test-stack.mjs',
      url: 'http://127.0.0.1:8196/healthz',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        'STAFF_PROXY_TARGET=http://127.0.0.1:8196 npm run preview -- --host 127.0.0.1 --port 3196',
      url: 'http://127.0.0.1:3196',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
