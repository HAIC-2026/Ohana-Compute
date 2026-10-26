import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: 'planner-integration.spec.ts',
  fullyParallel: false,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:13000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'integration-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: [
    {
      command: 'cd backend && PORT=18080 go run ./cmd/e2e-server',
      url: 'http://127.0.0.1:18080/healthz',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        'VITE_BACKEND_API_URL=http://127.0.0.1:18080 npm run dev -- --host 127.0.0.1 --port 13000',
      url: 'http://127.0.0.1:13000',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
