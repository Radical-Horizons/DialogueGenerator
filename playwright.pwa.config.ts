import { defineConfig, devices } from '@playwright/test'

const LOCAL_WORKERS = 1

const isCi = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  testMatch: /pwa-installability\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  workers: isCi ? 1 : LOCAL_WORKERS,
  reporter: isCi ? 'dot' : 'html',
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
      reuseExistingServer: !isCi,
      timeout: isCi ? 600_000 : 120_000,
      env: {
        API_PORT: '4243',
        HEALTH_CHECK_LLM_PING: 'false',
        RELOAD: 'false',
        DISABLE_AUTH: 'true',
        AUTH_RATE_LIMIT_ENABLED: 'false',
      },
    },
    {
      // CI : build explicite dans le workflow ; local : build + preview.
      command: isCi
        ? 'npm run preview -- --host 0.0.0.0 --port 4173'
        : 'npm run build && npm run preview -- --host 0.0.0.0 --port 4173',
      cwd: 'frontend',
      url: 'http://localhost:4173/index.html',
      reuseExistingServer: false,
      timeout: isCi ? 120_000 : 180_000,
      env: {
        VITE_API_BASE_URL: '',
      },
    },
  ],
})

