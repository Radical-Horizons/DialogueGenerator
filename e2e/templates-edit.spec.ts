/**
 * E2E Story 6.2 — éditer et supprimer un template custom.
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
      const raw = fs.readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(raw) as { name?: string }
      if (parsed.name === templateName) {
        fs.unlinkSync(filePath)
      }
    } catch {
      // Fichier illisible ou déjà supprimé — on ignore.
    }
  }
}

function deleteOrphanE2eTemplateFiles(): void {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    return
  }
  for (const entry of fs.readdirSync(TEMPLATES_DIR)) {
    if (!entry.endsWith('.json')) {
      continue
    }
    const filePath = path.join(TEMPLATES_DIR, entry)
    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(raw) as { name?: string }
      if (typeof parsed.name === 'string' && parsed.name.startsWith('Template E2E ')) {
        fs.unlinkSync(filePath)
      }
    } catch {
      // Fichier illisible ou déjà supprimé — on ignore.
    }
  }
}

test.describe('Templates — édition / suppression [6.2]', () => {
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

  const createTemplateFromUi = async (page: Page, uniqueName: string) => {
    const contextPanel = page.getByTestId('context-selector')
    const firstCheckbox = contextPanel
      .getByTestId('context-list-scroll')
      .locator('input[type="checkbox"]')
      .first()
    const hasContext = await firstCheckbox.isVisible({ timeout: E2E_MS.short }).catch(() => false)
    if (hasContext) {
      const alreadyChecked = await firstCheckbox.isChecked().catch(() => false)
      if (!alreadyChecked) {
        await firstCheckbox.click()
      }
    }

    // Les templates sont un onglet d'entrée depuis la refonte de la colonne.
    await page.getByTestId('input-tab-templates').click()
    const saveBtn = page.getByTestId('template-save-as-btn')
    await expect(saveBtn).toBeVisible({ timeout: E2E_MS.short })
    await expect(saveBtn).toBeEnabled()
    await saveBtn.click()
    await page.getByTestId('template-form-name').fill(uniqueName)
    await page.getByTestId('template-form-category').fill('Confrontation')
    await page.getByTestId('template-modal-create-btn').click()
    await expect(page.getByTestId('template-creator-modal')).not.toBeVisible({
      timeout: E2E_MS.modalLong,
    })
    const createdItem = page.locator(
      `[data-testid="template-item"][data-template-name="${uniqueName}"]`
    )
    await expect(createdItem).toBeVisible({ timeout: E2E_MS.graphField })
    return createdItem
  }

  test.beforeEach(async ({ page }) => {
    deleteOrphanE2eTemplateFiles()
    await page.goto('/')
    await login(page)
    const generateTab = page.getByTestId('header-section-generation')
    await expect(generateTab).toBeVisible({ timeout: E2E_MS.ui })
    await generateTab.click()
    await expect(page.getByTestId('model-settings-summary-toggle')).toBeVisible({
      timeout: E2E_MS.ui,
    })
  })

  test('édite le nom sans dupliquer le fichier, puis supprime', async ({ page }) => {
    const uniqueName = `Template E2E ${Date.now()}`
    const renamed = `${uniqueName} v2`
    try {
      const createdItem = await createTemplateFromUi(page, uniqueName)
      await createdItem.getByTestId('template-item-edit-btn').click()
      await expect(page.getByTestId('template-editor-modal')).toBeVisible({
        timeout: E2E_MS.short,
      })
      await expect(page.getByTestId('template-edit-name')).toHaveValue(uniqueName)
      await expect(page.getByTestId('template-editor-history')).toContainText(/Créé le/i)

      await page.getByTestId('template-edit-name').fill(renamed)
      await page.getByTestId('template-editor-save-btn').click()
      await expect(page.getByTestId('template-editor-modal')).not.toBeVisible({
        timeout: E2E_MS.modalLong,
      })

      const renamedItem = page.locator(
        `[data-testid="template-item"][data-template-name="${renamed}"]`
      )
      await expect(renamedItem).toBeVisible({ timeout: E2E_MS.graphField })
      await expect(renamedItem.getByTestId('template-item-modified')).toContainText(
        /Modifié le/i
      )
      await expect(
        page.locator(`[data-testid="template-item"][data-template-name="${uniqueName}"]`)
      ).toHaveCount(0)

      await renamedItem.getByTestId('template-item-edit-btn').click()
      await expect(page.getByTestId('template-editor-modal')).toBeVisible({
        timeout: E2E_MS.short,
      })
      await expect(page.getByTestId('template-editor-history')).toContainText(/Modifié le/i)
      await page.getByTestId('template-editor-modal').getByRole('button', { name: 'Annuler' }).click()
      await expect(page.getByTestId('template-editor-modal')).not.toBeVisible({
        timeout: E2E_MS.short,
      })

      await renamedItem.getByTestId('template-item-delete-btn').click()
      await expect(page.getByTestId('confirm-dialog')).toBeVisible()
      await page.getByTestId('confirm-dialog-confirm').click()
      await expect(renamedItem).not.toBeVisible({ timeout: E2E_MS.graphField })
    } finally {
      deleteTemplateFilesByName(uniqueName)
      deleteTemplateFilesByName(renamed)
    }
  })

  test('annuler la confirmation de suppression conserve l’item', async ({ page }) => {
    const uniqueName = `Template E2E ${Date.now()}`
    try {
      const createdItem = await createTemplateFromUi(page, uniqueName)
      await createdItem.getByTestId('template-item-delete-btn').click()
      await page.getByTestId('confirm-dialog-cancel').click()
      await expect(createdItem).toBeVisible()
    } finally {
      deleteTemplateFilesByName(uniqueName)
    }
  })
})
