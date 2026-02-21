/**
 * Tests E2E pour création manuelle de nœuds sans LLM (Story 1.6 - FR6).
 *
 * Test minimal (AC #1, #2) :
 * - Ouvrir un dialogue → clic "Nouveau nœud" → panneau d'édition s'ouvre.
 *
 * Note : Les E2E sont parfois instables ; un seul passage suffit (story 1.6).
 */
import { test, expect, type Page } from '@playwright/test'

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
        page.waitForSelector('h2:has-text("Génération")', { timeout: 5000 }).catch(() => {}),
      ])
    }
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000')
    await login(page)
    await page.getByRole('heading', { name: /génération/i }).waitFor({ state: 'visible', timeout: 10000 })
    const graphTab = page.locator('button:has-text("Graphe")').or(page.locator('[data-testid="graph-tab"]'))
    if (await graphTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await graphTab.click()
      await page.waitForLoadState('domcontentloaded')
    }
  })

  test('AC#1–#2: Nouveau nœud → panneau d\'édition s\'ouvre', async ({ page }) => {
    // Sélectionner un dialogue dans la liste (sinon "Nouveau nœud" est désactivé)
    const firstDialogue = page.locator('[data-testid*="dialogue-list"] li').or(
      page.locator('div[role="list"] > div').or(page.locator('ul li')).first()
    ).first()
    const listItem = page.locator('a, [role="button"], div').filter({ hasText: /\.json|dialogue/i }).first()
    if (await listItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await listItem.click()
      await page.waitForLoadState('networkidle').catch(() => {})
    } else {
      test.skip('Aucun dialogue dans la liste - créer un dialogue ou importer un JSON')
    }

    // Clic sur "Nouveau nœud" (data-testid prioritaire pour stabilité E2E)
    const newNodeBtn = page.getByTestId('btn-new-manual-node').or(
      page.getByRole('button', { name: /nouveau nœud|➕/i })
    )
    await expect(newNodeBtn).toBeVisible({ timeout: 5000 })
    await newNodeBtn.click()

    // Le panneau d'édition doit s'afficher (champ speaker, line ou titre "Édition")
    await expect(
      page.locator('input[name="speaker"]').or(
        page.locator('input[name="line"]').or(
          page.getByText(/édition de nœud|speaker|réplique/i)
        )
      )
    ).toBeVisible({ timeout: 5000 })
  })
})
