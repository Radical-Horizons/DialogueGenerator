/**
 * Harnais de performance du graphe (Story 20.2, seuils d'`epic-20.md` « Seuils de mesure »).
 *
 * Local seulement : Chrome installé, nouveau headless (aucune fenêtre) sur le GPU du poste,
 * que le test vérifie avant de mesurer, et build de production (`vite build` + `preview`). `PERF_TARGET=dev` mesure le serveur de développement, pour information.
 * Aucun serveur déjà ouvert n'est réutilisé, et aucun appel LLM n'est possible
 * (clé vidée, ping désactivé).
 *
 *   PERF_STRICT=1 npx playwright test -c playwright.perf.config.ts
 *
 * Comparaison avant / après : construire la référence à part (`vite build --outDir <dossier>`
 * dans un arbre au commit de référence) puis ajouter `PERF_BEFORE_DIST=<dossier absolu>`.
 */
import { defineConfig, devices } from '@playwright/test'

const useDevServer = process.env.PERF_TARGET === 'dev'
const frontendPort = useDevServer ? 3000 : 4173
process.env.PERF_HARNESS = '1'
// Posé par le processus principal, hérité par les workers : un dossier de résultats par lancement.
process.env.PERF_RUN_ID ??= new Date().toISOString().replace(/[:.]/g, '-')
const beforeDist = process.env.PERF_BEFORE_DIST

export default defineConfig({
  testDir: './e2e',
  testMatch: /perf-document-load\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${frontendPort}`,
  },
  projects: [
    {
      name: 'chromium-gpu',
      use: {
        ...devices['Desktop Chrome'],
        // Chrome installé : son headless est le navigateur complet, GPU compris.
        channel: process.env.PERF_CHANNEL || 'chrome',
        headless: true,
        viewport: { width: 1900, height: 950 },
        deviceScaleFactor: 1,
        launchOptions: {
          args: [
            '--enable-gpu',
            '--ignore-gpu-blocklist',
            '--use-angle=d3d11',
            '--force_high_performance_gpu',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
          ],
        },
      },
    },
  ],
  webServer: [
    {
      command: 'node scripts/getPythonPath.js -m api.main',
      url: 'http://localhost:4243/health',
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        API_PORT: '4243',
        RELOAD: 'false',
        OPENAI_API_KEY: '',
        MISTRAL_API_KEY: '',
        OPENROUTER_API_KEY: '',
        HEALTH_CHECK_LLM_PING: 'false',
        DISABLE_AUTH: 'true',
        AUTH_RATE_LIMIT_ENABLED: 'false',
        ADMIN_PASSWORD: 'admin123',
        JWT_SECRET_KEY: 'playwright-perf-jwt-secret',
      },
    },
    {
      command: useDevServer
        ? 'npm run dev'
        : 'npm run build && npm run preview -- --host 0.0.0.0 --port 4173',
      cwd: 'frontend',
      url: `http://localhost:${frontendPort}/index.html`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: { VITE_API_BASE_URL: '' },
    },
    ...(beforeDist
      ? [
          {
            command: `npm run preview -- --host 0.0.0.0 --port 4174 --strictPort --outDir "${beforeDist}"`,
            cwd: 'frontend',
            url: 'http://localhost:4174/index.html',
            reuseExistingServer: false,
            timeout: 120_000,
            env: { VITE_API_BASE_URL: '' },
          },
        ]
      : []),
  ],
})
