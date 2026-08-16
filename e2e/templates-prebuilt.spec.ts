/**
 * E2E Story 6.4 — templates pré-built Alteir (liste, modal, charger, copier).
 */
import fs from 'node:fs'
import path from 'node:path'

import { test, expect, type Page } from '@playwright/test'

import { E2E_MS, E2E_TEST_TIMEOUT_MS } from './timeouts'

const TEMPLATES_DIR = path.join(process.cwd(), 'data', 'templates', 'custom')
const PREBUILT_CATALOG = path.join(process.cwd(), 'config', 'prebuilt_templates.json')
const COPY_NAME = 'Confrontation (copie)'

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

function readCopiedConfrontationRulesProfile(): string | undefined {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    return undefined
  }
  for (const entry of fs.readdirSync(TEMPLATES_DIR)) {
    if (!entry.endsWith('.json')) {
      continue
    }
    const filePath = path.join(TEMPLATES_DIR, entry)
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
        name?: string
        configuration?: { contextDroppingRules?: { rules_profile?: string } }
      }
      if (parsed.name === COPY_NAME) {
        return parsed.configuration?.contextDroppingRules?.rules_profile
      }
    } catch {
      // Fichier illisible — on ignore.
    }
  }
  return undefined
}

function readConfrontationInstructions(): string {
  const raw = fs.readFileSync(PREBUILT_CATALOG, 'utf8')
  const parsed = JSON.parse(raw) as {
    templates: Array<{ id: string; configuration: { instructions: string } }>
  }
  const confrontation = parsed.templates.find((item) => item.id === 'confrontation')
  if (!confrontation) {
    throw new Error('Fiche confrontation absente du catalogue pré-built')
  }
  return confrontation.configuration.instructions
}

test.describe('Templates — pré-built [6.4]', () => {
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

  test.beforeEach(async ({ page }) => {
    deleteTemplateFilesByName(COPY_NAME)
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
    deleteTemplateFilesByName(COPY_NAME)
  })

  test('liste 7 fiches, modal, Charger hydrate le brief', async ({ page }) => {
    await expandModelSettings(page)
    const list = page.getByTestId('prebuilt-templates-list')
    await expect(list).toBeVisible({ timeout: E2E_MS.ui })
    await expect(list.getByTestId('prebuilt-template-item')).toHaveCount(7)

    const confrontation = list.locator('[data-prebuilt-id="confrontation"]')
    await expect(confrontation).toBeVisible()
    await expect(confrontation.getByTestId('prebuilt-item-gdd-system')).toContainText(/Skill check/i)
    await expect(confrontation.getByTestId('prebuilt-item-preview')).toContainText(/Ton tendu/i)
    await confrontation.click()

    const modal = page.getByTestId('prebuilt-template-modal')
    await expect(modal).toBeVisible({ timeout: E2E_MS.short })
    await expect(modal).toContainText(/Exposer un conflit/i)
    await expect(modal).toContainText(/Dispute/i)
    await expect(page.getByTestId('prebuilt-modal-examples')).toContainText(/skillCheckConfig/i)
    await expect(page.getByTestId('prebuilt-modal-instructions')).toContainText(/Ton tendu/i)
    await expect(page.getByTestId('prebuilt-modal-scene-type')).toHaveText('confrontation')

    const originalInstructions = readConfrontationInstructions()
    await page.getByTestId('prebuilt-modal-load').click()
    await expect(modal).not.toBeVisible({ timeout: E2E_MS.short })

    const brief = page.locator('#user-instructions-textarea')
    await expect(brief).toHaveValue(/Ton tendu et conflictuel/i)
    await expect(page.getByText(/Template chargé/i).first()).toBeVisible({
      timeout: E2E_MS.short,
    })
    expect(readConfrontationInstructions()).toBe(originalInstructions)

    await brief.fill(`Brief modifié ${Date.now()}`)
    await confrontation.click()
    await expect(modal).toBeVisible({ timeout: E2E_MS.short })
    await page.getByTestId('prebuilt-modal-load').click()
    await expect(brief).toHaveValue(/Ton tendu et conflictuel/i)
    expect(readConfrontationInstructions()).toBe(originalInstructions)
  })

  test('Copier ajoute un custom sans changer le brief ni le JSON pré-built', async ({ page }) => {
    const originalInstructions = readConfrontationInstructions()
    const uniqueBrief = `Brief pré-built E2E ${Date.now()}`
    const brief = page.locator('#user-instructions-textarea')
    await expect(brief).toBeVisible({ timeout: E2E_MS.ui })
    await brief.fill(uniqueBrief)

    await expandModelSettings(page)
    const confrontation = page.locator('[data-prebuilt-id="confrontation"]')
    await expect(confrontation).toBeVisible({ timeout: E2E_MS.ui })
    await confrontation.getByTestId('prebuilt-item-copy-btn').click()

    await expect(page.getByTestId('prebuilt-template-modal')).not.toBeVisible()
    await expect(brief).toHaveValue(uniqueBrief)
    await expect(
      page.locator(`[data-testid="template-item"][data-template-name="${COPY_NAME}"]`),
    ).toBeVisible({ timeout: E2E_MS.graphField })
    await expect(page.getByText(/Template copié dans Mes templates/i).first()).toBeVisible({
      timeout: E2E_MS.short,
    })

    expect(readConfrontationInstructions()).toBe(originalInstructions)
    expect(readCopiedConfrontationRulesProfile()).toBe('strict')
  })
})
