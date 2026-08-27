/**
 * E2E Story 6.1.1 — créer un template custom et le voir groupé dans « Mes templates ».
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

test.describe('Templates — création [6.1.1]', () => {
  test.setTimeout(E2E_TEST_TIMEOUT_MS.graphHeavy)

  let createdTemplateName: string | undefined

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

  test.beforeEach(async ({ page }) => {
    createdTemplateName = undefined
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

  test.afterEach(() => {
    if (createdTemplateName) {
      deleteTemplateFilesByName(createdTemplateName)
    }
  })

  test('ouvre le modal, remplit 4 champs, sauvegarde, voit l’item groupé', async ({ page }) => {
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
    await expect(
      page.getByRole('heading', { name: /sauvegarder comme template/i })
    ).toBeVisible({ timeout: E2E_MS.short })

    const uniqueName = `Template E2E ${Date.now()}`
    createdTemplateName = uniqueName
    try {
      await page.getByTestId('template-form-name').fill(uniqueName)
      await page.getByTestId('template-form-description').fill('Description E2E')
      await page.getByTestId('template-form-category').fill('Confrontation')
      await page.getByTestId('template-form-icon').fill('⚔️')

      await expect(page.getByTestId('template-form-preview')).toBeVisible()
      await expect(page.getByTestId('template-form-preview')).toContainText(/lecture seule/i)

      await page.getByTestId('template-modal-create-btn').click()
      await expect(
        page.getByRole('heading', { name: /sauvegarder comme template/i })
      ).not.toBeVisible({ timeout: E2E_MS.modalLong })

      const list = page.getByTestId('mes-templates-list')
      const createdItem = list.locator(
        `[data-testid="template-item"][data-template-name="${uniqueName}"]`
      )
      await expect(createdItem).toBeVisible({ timeout: E2E_MS.graphField })
      await expect(createdItem.getByText('Description E2E')).toBeVisible()
      const group = list.locator('[data-testid="template-category-group"][data-category="Confrontation"]')
      await expect(group).toBeVisible()
      await expect(group.getByText(uniqueName)).toBeVisible()
    } finally {
      deleteTemplateFilesByName(uniqueName)
      createdTemplateName = undefined
    }
  })
})
