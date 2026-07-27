/**
 * Playwright E2E — environnement contrôlé :
 * - API : RELOAD=false, DISABLE_AUTH=true pour seeds `request.*` sans Bearer (aligné dev).
 *   Pour exécuter avec auth stricte : retirer DISABLE_AUTH ici et utiliser storageState sur
 *   APIRequestContext (même fichier que e2e/.auth/user.json) pour les PUT/GET documents/costs.
 * - Frontend : VITE_API_BASE_URL vide → URLs relatives `/api` + proxy Vite → :4243 (évite .env local 4242/ngrok).
 */
import { defineConfig, devices } from '@playwright/test'

const AUTH_FILE = 'e2e/.auth/user.json'
// Une seule instance Uvicorn : 4 workers locaux provoquent ECONNREFUSED/proxy Vite sous charge E2E.
const LOCAL_WORKERS = 1

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Limiter le parallélisme local : une seule instance Uvicorn sous charge (16 workers → ECONNRESET / proxy Vite).
  workers: process.env.CI ? 1 : LOCAL_WORKERS,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
      dependencies: ['setup'],
      // `pwa-installability` exige build + preview (SW désactivé en `vite dev` via vite-plugin-pwa) — voir `playwright.pwa.config.ts`.
      testIgnore: [/auth\.spec\.ts/, /pwa-installability\.spec\.ts/],
    },
    {
      name: 'chromium-auth-spec',
      testMatch: /auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      command: 'node scripts/getPythonPath.js -m api.main',
      url: 'http://localhost:4243/health',
      reuseExistingServer: !process.env.CI,
      env: {
        API_PORT: '4243',
        HEALTH_CHECK_LLM_PING: 'true',
        RELOAD: 'false',
        DISABLE_AUTH: 'true',
        // Seed admin pour auth.setup / auth.spec (login réel après guest-first).
        ADMIN_PASSWORD: 'admin123',
        JWT_SECRET_KEY: process.env.JWT_SECRET_KEY || 'playwright-e2e-jwt-secret',
        // Évite les timeouts sur auth.spec / setup quand la suite déclenche plusieurs POST /login.
        AUTH_RATE_LIMIT_ENABLED: 'false',
      },
    },
    {
      command: 'cd frontend && npm run dev',
      // Root `/` peut répondre 404 (proxy / autre stack) alors que l’app Vite est servie ; évite un second `vite` → EADDRINUSE.
      url: 'http://localhost:3000/index.html',
      reuseExistingServer: !process.env.CI,
      env: {
        // Force proxy Vite (/api → localhost:4243) ; ignore VITE_API_BASE_URL du .env utilisateur
        VITE_API_BASE_URL: '',
      },
    },
  ],
})



