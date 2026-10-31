import { defineConfig, devices } from '@playwright/test'

const primaryBackendPort = 18080
const secondaryBackendPort = 18181

export default defineConfig({
  testDir: './tests',
  testMatch: [
    'planner-integration.spec.ts',
    'collaborative-plans.spec.ts',
    'grounded-planning.spec.ts',
  ],
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
      command: `cd backend && PORT=${primaryBackendPort} E2E_ENABLE_COLLABORATION=1 E2E_ENABLE_GROUNDED_PLANNING=1 go run ./cmd/e2e-server`,
      url: `http://127.0.0.1:${primaryBackendPort}/healthz`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `VITE_BACKEND_API_URL=http://127.0.0.1:${primaryBackendPort} VITE_ENABLE_TEST_IDENTITY=true npm run dev -- --host 127.0.0.1 --port 13000`,
      url: 'http://127.0.0.1:13000',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `cd backend && PORT=${secondaryBackendPort} E2E_ENABLE_COLLABORATION=1 go run ./cmd/e2e-server`,
      url: `http://127.0.0.1:${secondaryBackendPort}/healthz`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `VITE_BACKEND_API_URL=http://127.0.0.1:${secondaryBackendPort} VITE_ENABLE_TEST_IDENTITY=true npm run dev -- --host 127.0.0.1 --port 13001`,
      url: 'http://127.0.0.1:13001',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
