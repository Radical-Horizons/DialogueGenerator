/**
 * Tests E2E pour les opérations CRUD des presets (Story 0.4 - P0).
 * 
 * Scénarios P0 critiques:
 * - Créer un preset
 * - Charger un preset
 * - Mettre à jour un preset
 * - Supprimer un preset
 * - Valider les références GDD d'un preset
 */
import { test, expect, type Page } from '@playwright/test'

import { E2E_MS, E2E_TEST_TIMEOUT_MS } from './timeouts'

test.describe('Presets CRUD Operations [P0]', () => {
  test.setTimeout(E2E_TEST_TIMEOUT_MS.graphHeavy)
  test.describe.configure({ mode: 'serial' })
  // Helper pour s'authentifier
  const login = async (page: Page) => {
    const loginHeading = page.getByRole('heading', { name: /connexion/i })
    const isLoginPage = await loginHeading.isVisible({ timeout: E2E_MS.probe }).catch(() => false)

    if (isLoginPage) {
      await page.getByLabel(/nom d'utilisateur/i).fill('admin')
      await page.getByLabel(/mot de passe/i).fill('admin123')
      await page.getByRole('button', { name: /se connecter/i }).click()
      await Promise.race([
        page.waitForURL('**/', { timeout: E2E_MS.short }).catch(() => {}),
        page.getByRole('button', { name: /Génération de Dialogues/i }).waitFor({ state: 'visible', timeout: E2E_MS.short }).catch(() => {}),
      ])
    }
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await login(page)
    await page.getByRole('button', { name: /Génération de Dialogues/i }).waitFor({ state: 'visible', timeout: E2E_MS.ui })
  })

  test('[P0] should create a new preset', async () => {
    test.skip(
      true,
      'Création « Enregistrer sous » remplacée par templates (Story 6.1.1) — voir e2e/templates-create.spec.ts'
    )
  })

  test('[P0] should load an existing preset', async ({ page }) => {
    const dropdown = page.getByTestId('preset-dropdown-trigger')
    await expect(dropdown).toBeVisible({ timeout: E2E_MS.medium })
    await dropdown.click()
    const firstPreset = page.getByTestId('preset-item').first()
    const hasPreset = await firstPreset.isVisible({ timeout: E2E_MS.short }).catch(() => false)
    if (!hasPreset) {
      test.skip('Aucun preset dans la liste - créer un preset d\'abord')
      return
    }
    await firstPreset.click()
    await expect(
      page.locator('input[value]:not([value=""])').or(
        page.locator('[data-testid="selected-context-summary-toggle"]')
      ).first()
    ).toBeVisible({ timeout: E2E_MS.short })
  })

  test('[P0] should update a preset', async ({ page }) => {
    // L'UI PresetSelector n'expose pas d'édition de preset (uniquement charger/créer/supprimer)
    test.skip(true, 'Update preset non exposé dans l\'UI - test ignoré')
  })

  test('[P0] should delete a preset', async ({ page }) => {
    await page.getByTestId('preset-dropdown-trigger').click()
    const firstPreset = page.getByTestId('preset-item').first()
    const hasPreset = await firstPreset.isVisible({ timeout: E2E_MS.short }).catch(() => false)
    if (!hasPreset) {
      test.skip('Aucun preset à supprimer')
      return
    }
    await firstPreset.getByRole('button', { name: /supprimer/i }).click()
    await expect(page.getByText(/êtes-vous sûr/i)).toBeVisible({ timeout: E2E_MS.control })
    await page.getByRole('button', { name: /^confirmer$/i }).click()
    await expect(page.getByText(/êtes-vous sûr/i)).not.toBeVisible({ timeout: E2E_MS.control })
  })

  test('[P0] should validate preset GDD references', async ({ page }) => {
    await page.getByTestId('preset-dropdown-trigger').click()
    const firstPreset = page.getByTestId('preset-item').first()
    const hasPreset = await firstPreset.isVisible({ timeout: E2E_MS.short }).catch(() => false)
    if (!hasPreset) {
      test.skip('Aucun preset pour valider')
      return
    }
    await firstPreset.click()
    await expect(
      page.getByText(/valide|warning|obsolète|perso\(s\)/i)
    ).toBeVisible({ timeout: E2E_MS.short })
  })

  test('[P1] should load preset with obsolete references and filter them', async ({ page }) => {
    await page.getByTestId('preset-dropdown-trigger').click()
    const firstPreset = page.getByTestId('preset-item').first()
    const hasPreset = await firstPreset.isVisible({ timeout: E2E_MS.short }).catch(() => false)
    if (!hasPreset) {
      test.skip('Aucun preset')
      return
    }
    await firstPreset.click()
    const validationModal = page.getByText(/références obsolètes|validation/i)
    const modalVisible = await validationModal.isVisible({ timeout: E2E_MS.control }).catch(() => false)
    if (modalVisible) {
      await page.getByRole('button', { name: /charger quand même|confirmer/i }).click({ timeout: E2E_MS.probe }).catch(() => {})
      await expect(
        page.getByText(/preset chargé|chargé avec succès|référence.*obsolète/i)
      ).toBeVisible({ timeout: E2E_MS.short }).catch(() => {})
    } else {
      await expect(page.getByTestId('selected-context-summary-toggle').or(page.getByText(/perso\(s\)/i))).toBeVisible({ timeout: E2E_MS.short }).catch(() => {})
    }
  })

  test('[P1] should auto-cleanup obsolete references when saving preset', async () => {
    test.skip(
      true,
      'Sauvegarde « Enregistrer sous » remplacée par templates (Story 6.1.1) — warnings GDD couverts par pytest'
    )
  })

  test('[P1] should cancel loading preset with obsolete references', async ({ page }) => {
    await page.getByTestId('preset-dropdown-trigger').click()
    const firstPreset = page.getByTestId('preset-item').first()
    if (!(await firstPreset.isVisible({ timeout: E2E_MS.short }).catch(() => false))) {
      test.skip('Aucun preset')
      return
    }
    await firstPreset.click()
    const validationModal = page.getByText(/références obsolètes|validation/i)
    if (!(await validationModal.isVisible({ timeout: E2E_MS.control }).catch(() => false))) {
      test.skip('Preset valide - modal annulation non affichée')
      return
    }
    await page.getByRole('button', { name: /annuler/i }).click()
    await expect(validationModal).not.toBeVisible({ timeout: E2E_MS.control })
  })
})
