import { defineConfig, devices } from '@playwright/test'

const LOCAL_WORKERS = 1

export default defineConfig({
  testDir: './e2e',
  testMatch: /pwa-installability\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : LOCAL_WORKERS,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node scripts/getPythonPath.js -m api.main',
      url: 'http://localhost:4243/health',
      reuseExistingServer: !process.env.CI,
      env: {
        API_PORT: '4243',
        HEALTH_CHECK_LLM_PING: 'false',
        RELOAD: 'false',
        DISABLE_AUTH: 'true',
        AUTH_RATE_LIMIT_ENABLED: 'false',
      },
    },
    {
      // Build + preview to validate prod PWA registration.
      command: 'cd frontend && npm run build && npm run preview -- --host 0.0.0.0 --port 4173',
      url: 'http://localhost:4173/index.html',
      reuseExistingServer: false,
      env: {
        VITE_API_BASE_URL: '',
      },
    },
  ],
})

