/**
 * ADR-008 perf (Story 16.6 AC5) : p95 load document + projection + affichage.
 * Optionnel en CI (peut être exclu si flaky). Seuils : docs/architecture/adr-008-perf-targets.md
 */
import { test, expect } from '@playwright/test'
import { uniqueE2EDocumentId, seedDocumentWithRetry, matchDocumentJsonGetResponse } from './helpers'
import { E2E_MS, E2E_TEST_TIMEOUT_MS } from './timeouts'

const COMFORT_LOAD_MS = 3000 // p95 load < 3s pour cible confort (N < 500)
const API_BASE = 'http://127.0.0.1:4243'
const FIXTURE_PREFIX = 'e2e-perf'
const FIXTURE_DOC = {
  schemaVersion: '1.1.0',
  nodes: [
    { id: 'START', speaker: 'Perf', line: 'Start', nextNode: 'N1', choices: [] },
    { id: 'N1', speaker: 'Perf', line: 'Middle', nextNode: 'END', choices: [] },
    { id: 'END', speaker: 'Perf', line: 'End', nextNode: null, choices: [] },
  ],
}

test.describe('ADR-008 Perf (Story 16.6)', () => {
  test.setTimeout(E2E_TEST_TIMEOUT_MS.cost)

  test.afterEach(async ({ request }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    const res = await request.delete(`${API_BASE}/api/v1/documents/${encodeURIComponent(fixtureId)}`)
    if (!res.ok() && res.status() !== 404) {
      const text = await res.text().catch(() => '')
      throw new Error(`Cleanup DELETE failed ${res.status()}: ${text}`)
    }
  })

  test('p95 load: document confort (petit graphe) sous seuil raisonnable', async ({
    page,
    request,
  }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)

    await page.goto('/')
    const onLogin = await page
      .getByRole('heading', { name: /connexion/i })
      .isVisible({ timeout: E2E_MS.control })
      .catch(() => false)
    if (onLogin) {
      await page.getByLabel(/nom d'utilisateur/i).fill('admin')
      await page.getByLabel(/mot de passe/i).fill('admin123')
      await page.getByRole('button', { name: /se connecter/i }).click()
      await expect(page).toHaveURL(/\//, { timeout: E2E_MS.ui })
    }

    await seedDocumentWithRetry(request, API_BASE, fixtureId, FIXTURE_DOC)

    const start = Date.now()
    await Promise.all([
      page.waitForResponse((r) => matchDocumentJsonGetResponse(fixtureId, r), { timeout: E2E_MS.documentLoad }),
      page.goto(`/graph-editor/${encodeURIComponent(fixtureId)}`, { waitUntil: 'domcontentloaded' }),
    ])
    await expect(page.getByText(/Chargement du graphe/i)).toBeHidden({ timeout: E2E_MS.graphLoad })
    await expect(page.locator('[data-testid="graph-node-content"]').first()).toBeVisible({ timeout: E2E_MS.graphLoad })
    const loadMs = Date.now() - start

    if (process.env.PERF_STRICT === '1') {
      expect(loadMs).toBeLessThan(COMFORT_LOAD_MS)
    }
    expect(loadMs).toBeLessThan(E2E_MS.perfMaxLoad)
  })
})
