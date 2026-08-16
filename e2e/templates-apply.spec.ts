/**
 * E2E Story 6.3 — appliquer un template custom au formulaire de génération.
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

test.describe('Templates — application [6.3]', () => {
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

  const createTemplateFromUi = async (page: Page, uniqueName: string) => {
    await expandModelSettings(page)
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
      `[data-testid="template-item"][data-template-name="${uniqueName}"]`,
    )
    await expect(createdItem).toBeVisible({ timeout: E2E_MS.graphField })
    return createdItem
  }

  const maybeConfirmObsoleteGdd = async (page: Page) => {
    const modal = page.getByTestId('preset-validation-modal')
    const visible = await modal.isVisible({ timeout: E2E_MS.probe }).catch(() => false)
    if (visible) {
      await page.getByTestId('preset-validation-confirm').click()
      await expect(modal).not.toBeVisible({ timeout: E2E_MS.short })
    }
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

  test('clic carte remplit le brief ; Éditer n’applique pas', async ({ page }) => {
    const uniqueName = `Template E2E ${Date.now()}`
    const snapshotBrief = `Brief apply ${Date.now()}`
    const laterBrief = `Brief après ${Date.now()}`
    const brief = page.locator('#user-instructions-textarea')

    try {
      await expect(brief).toBeVisible({ timeout: E2E_MS.ui })
      await brief.fill(snapshotBrief)

      const createdItem = await createTemplateFromUi(page, uniqueName)

      await brief.fill('')
      await expect(brief).toHaveValue('')

      await createdItem.getByText(uniqueName).click()
      await maybeConfirmObsoleteGdd(page)
      await expect(brief).toHaveValue(snapshotBrief)
      await expect(page.getByText(/Template chargé/i).first()).toBeVisible({
        timeout: E2E_MS.short,
      })

      await brief.fill(laterBrief)
      await createdItem.getByTestId('template-item-edit-btn').click()
      await expect(page.getByTestId('template-editor-modal')).toBeVisible({
        timeout: E2E_MS.short,
      })
      await expect(brief).toHaveValue(laterBrief)
      await page.getByTestId('template-editor-modal').getByRole('button', { name: 'Annuler' }).click()
      await expect(page.getByTestId('template-editor-modal')).not.toBeVisible({
        timeout: E2E_MS.short,
      })
      await expect(brief).toHaveValue(laterBrief)
    } finally {
      deleteTemplateFilesByName(uniqueName)
    }
  })
})
