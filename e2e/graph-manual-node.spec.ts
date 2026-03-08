/**
 * Tests E2E pour création manuelle de nœuds sans LLM (Story 1.6 - FR6).
 *
 * Test minimal (AC #1, #2) :
 * - Ouvrir un dialogue → clic "Nouveau nœud" → panneau d'édition s'ouvre.
 *
 * Note : Les E2E sont parfois instables ; un seul passage suffit (story 1.6).
 */
import { test, expect, type Page } from '@playwright/test'

const API_BASE = 'http://127.0.0.1:4243'
const FIXTURE_ID = 'e2e-manual-node-fixture'
const FIXTURE_DOC = {
  schemaVersion: '1.1.0',
  nodes: [
    { id: 'START', speaker: 'E2E', line: 'Start', nextNode: 'END', choices: [] },
    { id: 'END', speaker: 'E2E', line: 'End', nextNode: null, choices: [] },
  ],
}

test.describe('Graph Manual Node (Story 1.6)', () => {
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

  test('AC#1–#2: Nouveau nœud → panneau d\'édition s\'ouvre', async ({ page, request }) => {
    const seedRes = await request.put(`${API_BASE}/api/v1/documents/${FIXTURE_ID}`, {
      data: { document: FIXTURE_DOC, revision: 1 },
    })
    expect([200, 409]).toContain(seedRes.status())
    await page.goto(`/graph-editor/${FIXTURE_ID}`)
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 20000 })

    // Clic sur "Nouveau nœud" (data-testid prioritaire pour stabilité E2E)
    const newNodeBtn = page.getByTestId('btn-new-manual-node').or(
      page.getByRole('button', { name: /nouveau nœud|➕/i })
    )
    await expect(newNodeBtn).toBeVisible({ timeout: 5000 })
    await newNodeBtn.click()

    // Le panneau d'édition doit s'afficher (champ speaker, line ou titre "Édition")
    await expect(page.locator('input[name="speaker"]')).toBeVisible({ timeout: 5000 })
  })
})
