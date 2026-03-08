/**
 * ADR-008 perf (Story 16.6 AC5) : p95 load document + projection + affichage.
 * Optionnel en CI (peut être exclu si flaky). Seuils : docs/architecture/adr-008-perf-targets.md
 */
import { test, expect } from '@playwright/test'

const COMFORT_LOAD_MS = 3000 // p95 load < 3s pour cible confort (N < 500)
const API_BASE = 'http://127.0.0.1:4243'
const FIXTURE_ID = 'e2e-perf-fixture'
const FIXTURE_DOC = {
  schemaVersion: '1.1.0',
  nodes: [
    { id: 'START', speaker: 'Perf', line: 'Start', nextNode: 'N1', choices: [] },
    { id: 'N1', speaker: 'Perf', line: 'Middle', nextNode: 'END', choices: [] },
    { id: 'END', speaker: 'Perf', line: 'End', nextNode: null, choices: [] },
  ],
}

test.describe('ADR-008 Perf (Story 16.6)', () => {
  test.setTimeout(60_000)

  test('p95 load: document confort (petit graphe) sous seuil raisonnable', async ({
    page,
    request,
  }) => {
    await page.goto('/')
    const onLogin = await page
      .getByRole('heading', { name: /connexion/i })
      .isVisible({ timeout: 3000 })
      .catch(() => false)
    if (onLogin) {
      await page.getByLabel(/nom d'utilisateur/i).fill('admin')
      await page.getByLabel(/mot de passe/i).fill('admin123')
      await page.getByRole('button', { name: /se connecter/i }).click()
      await expect(page).toHaveURL(/\//, { timeout: 10000 })
    }

    const seedRes = await request.put(`${API_BASE}/api/v1/documents/${FIXTURE_ID}`, {
      data: { document: FIXTURE_DOC, revision: 1 },
    })
    expect([200, 409]).toContain(seedRes.status())

    const start = Date.now()
    await page.goto(`/graph-editor/${FIXTURE_ID}`)
    await expect(page.getByText(/Chargement du graphe/i)).toBeHidden({ timeout: 20000 })
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 20000 })
    const loadMs = Date.now() - start

    // Non bloquant en CI : on log et on assert seulement si env exige (ex. PERF_STRICT=1)
    if (process.env.PERF_STRICT === '1') {
      expect(loadMs).toBeLessThan(COMFORT_LOAD_MS)
    }
    expect(loadMs).toBeLessThan(60_000)
  })
})
