/**
 * Tests E2E pour création manuelle de nœuds sans LLM (Story 1.6 - FR6).
 *
 * Test minimal (AC #1, #2) :
 * - Ouvrir un dialogue → clic "Nouveau nœud" → panneau d'édition s'ouvre.
 *
 * Note : Les E2E sont parfois instables ; un seul passage suffit (story 1.6).
 */
import { test, expect, type Page } from '@playwright/test'
import {
  uniqueE2EDocumentId,
  seedDocumentWithRetry,
  openDashboardGraphTabAndSelectDocument,
} from './helpers'

const API_BASE = 'http://127.0.0.1:4243'
const FIXTURE_PREFIX = 'e2e-manual-node'
const FIXTURE_DOC = {
  schemaVersion: '1.1.0',
  nodes: [
    { id: 'START', speaker: 'E2E', line: 'Start', nextNode: 'END', choices: [] },
    { id: 'END', speaker: 'E2E', line: 'End', nextNode: null, choices: [] },
  ],
}

test.describe('Graph Manual Node (Story 1.6)', () => {
  test.setTimeout(120_000)
  const login = async (page: Page) => {
    const loginHeading = page.getByRole('heading', { name: /connexion/i })
    const isLoginPage = await loginHeading.isVisible({ timeout: 2000 }).catch(() => false)
    if (isLoginPage) {
      await page.getByLabel(/nom d'utilisateur/i).fill('admin')
      await page.getByLabel(/mot de passe/i).fill('admin123')
      await page.getByRole('button', { name: /se connecter/i }).click()
      await Promise.race([
        page.waitForURL('**/', { timeout: 5000 }).catch(() => {}),
        page.getByRole('button', { name: /Génération de Dialogues/i }).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      ])
    }
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await login(page)
    await page.getByRole('button', { name: /Génération de Dialogues/i }).waitFor({ state: 'visible', timeout: 10000 })
  })

  test.afterEach(async ({ request }, testInfo) => {
    const fid = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    const res = await request.delete(`${API_BASE}/api/v1/documents/${fid}`)
    if (!res.ok() && res.status() !== 404) {
      const text = await res.text().catch(() => '')
      throw new Error(`Cleanup DELETE failed ${res.status()}: ${text}`)
    }
  })

  test('AC#1–#2: Nouveau nœud → panneau d\'édition s\'ouvre', async ({ page, request }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    await seedDocumentWithRetry(request, API_BASE, fixtureId, FIXTURE_DOC)
    // NodeEditorPanel (champs speaker/line) n’est rendu que dans le Dashboard, pas en page /graph-editor standalone.
    await openDashboardGraphTabAndSelectDocument(page, fixtureId)
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 20000 })

    // Le bouton est dans le menu Actions (pas sur la barre directement) ; désactivé tant que le graphe n’est pas éditable.
    await expect(page.getByTestId('btn-actions-dropdown')).toBeEnabled({ timeout: 20_000 })
    await page.getByTestId('btn-actions-dropdown').click()
    const newNodeBtn = page.getByTestId('btn-new-manual-node')
    await expect(newNodeBtn).toBeVisible({ timeout: 8000 })
    await newNodeBtn.click()

    // Le panneau d'édition doit s'afficher (champ speaker, line ou titre "Édition")
    await expect(page.locator('input[name="speaker"]')).toBeVisible({ timeout: 15_000 })
  })
})
