/**
 * E2E Story 6.6 — marketplace : publier, parcourir, filtrer, copier.
 */
import fs from 'node:fs'
import path from 'node:path'

import { test, expect, type Page } from '@playwright/test'

import { E2E_MS, E2E_TEST_TIMEOUT_MS } from './timeouts'

const TEMPLATES_DIR = path.join(process.cwd(), 'data', 'templates', 'custom')

function deleteTemplateFilesByName(templateName: string): void {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    return
  }
  for (const entry of fs.readdirSync(TEMPLATES_DIR)) {
    if (!entry.endsWith('.json')) {
      continue
    }
    const filePath = path.join(TEMPLATES_DIR, entry)
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { name?: string }
      if (parsed.name === templateName) {
        fs.unlinkSync(filePath)
      }
    } catch {
      // Fichier illisible ou déjà supprimé — on ignore.
    }
  }
}

test.describe('Templates — marketplace [6.6]', () => {
  test.setTimeout(E2E_TEST_TIMEOUT_MS.graphHeavy)

  const login = async (page: Page) => {
    const loginHeading = page.getByRole('heading', { name: /connexion/i })
    const isLoginPage = await loginHeading.isVisible({ timeout: E2E_MS.probe }).catch(() => false)
    if (isLoginPage) {
      await page.getByLabel(/nom d'utilisateur/i).fill('admin')
      await page.getByLabel(/mot de passe/i).fill('admin123')
      await page.getByRole('button', { name: /se connecter/i }).click()
      await page.waitForURL('**/', { timeout: E2E_MS.short }).catch(() => {})
    }
  }

  const expandModelSettings = async (page: Page) => {
    const modelToggle = page.getByTestId('model-settings-summary-toggle')
    if ((await modelToggle.getAttribute('aria-expanded')) !== 'true') {
      await modelToggle.click()
    }
  }

  test('publie un custom, filtre, Utiliser crée une copie', async ({ page }) => {
    const uniqueName = `Template marché E2E ${Date.now()}`
    const copyName = `${uniqueName} (copie)`
    try {
      await page.goto('/')
      await login(page)
      const generateTab = page.getByTestId('header-section-generation')
      await expect(generateTab).toBeVisible({ timeout: E2E_MS.ui })
      await generateTab.click()
      await expandModelSettings(page)

      await page.getByTestId('template-save-as-btn').click()
      await expect(
        page.getByRole('heading', { name: /sauvegarder comme template/i }),
      ).toBeVisible({ timeout: E2E_MS.short })
      await page.getByTestId('template-form-name').fill(uniqueName)
      await page.getByTestId('template-form-category').fill('Confrontation')
      await page.getByTestId('template-modal-create-btn').click()
      const createdItem = page.locator(
        `[data-testid="template-item"][data-template-name="${uniqueName}"]`,
      )
      await expect(createdItem).toBeVisible({ timeout: E2E_MS.graphField })

      await createdItem.getByTestId('template-item-publish-btn').click()
      await expect(page.getByText(/publié sur le marketplace/i).first()).toBeVisible({
        timeout: E2E_MS.short,
      })

      await page.getByTestId('marketplace-open-btn').click()
      const modal = page.getByTestId('template-marketplace-modal')
      await expect(modal).toBeVisible({ timeout: E2E_MS.short })
      await page.getByTestId('marketplace-filter-name').fill(uniqueName)
      const listing = modal.getByTestId('marketplace-item').filter({ hasText: uniqueName })
      await expect(listing).toBeVisible({ timeout: E2E_MS.short })
      await listing.click()
      await expect(modal.getByTestId('marketplace-detail')).toContainText(uniqueName)
      await modal.getByTestId('marketplace-use-btn').click()
      await expect(page.getByText(/ajouté à Mes templates/i).first()).toBeVisible({
        timeout: E2E_MS.short,
      })
      await modal.getByTestId('marketplace-unpublish-btn').click()
      await expect(page.getByText(/retiré du marketplace/i).first()).toBeVisible({
        timeout: E2E_MS.short,
      })

      await page.getByTestId('marketplace-close-btn').click()
      await expect(modal).not.toBeVisible()
      await expect(
        page.locator(`[data-testid="template-item"][data-template-name="${copyName}"]`),
      ).toBeVisible({ timeout: E2E_MS.graphField })
    } finally {
      deleteTemplateFilesByName(uniqueName)
      deleteTemplateFilesByName(copyName)
    }
  })
})
