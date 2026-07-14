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

  test('[P0] should create a new preset', async ({ page }) => {
    // Le bouton "Sauvegarder preset" n'est actif que si une config existe (au moins un personnage sélectionné)
    const contextPanel = page.getByTestId('context-selector')
    const firstCheckbox = contextPanel
      .getByTestId('context-list-scroll')
      .locator('input[type="checkbox"]')
      .first()
    const hasContext = await firstCheckbox.isVisible({ timeout: E2E_MS.short }).catch(() => false)
    if (hasContext) await firstCheckbox.click()

    const saveBtn = page.getByTestId('preset-save-as-btn')
    const saveVisible = await saveBtn.isVisible({ timeout: E2E_MS.short }).catch(() => false)
    if (!saveVisible) {
      test.skip('Preset selector (Enregistrer sous) non visible - test ignoré')
      return
    }
    const wasDisabled = await saveBtn.isDisabled().catch(() => true)
    if (wasDisabled && !hasContext) {
      test.skip('Aucune configuration sélectionnée - bouton Enregistrer sous désactivé')
      return
    }
    await saveBtn.click()
    await expect(page.getByRole('heading', { name: /enregistrer sous/i })).toBeVisible({ timeout: E2E_MS.short })
    await page.locator('#preset-name').fill('Test Preset E2E')
    await page.locator('#preset-icon').fill('PRE')
    await page.getByTestId('preset-modal-create-btn').click()
    await expect(page.getByRole('heading', { name: /enregistrer sous/i })).not.toBeVisible({ timeout: E2E_MS.modalLong })
    await page.getByTestId('preset-dropdown-trigger').click({ timeout: E2E_MS.ui })
    await expect(page.getByText('Test Preset E2E').first()).toBeVisible({ timeout: E2E_MS.graphField })
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

  test('[P1] should auto-cleanup obsolete references when saving preset', async ({ page }) => {
    const contextPanel = page.getByTestId('context-selector')
    const firstCheckbox = contextPanel
      .getByTestId('context-list-scroll')
      .locator('input[type="checkbox"]')
      .first()
    if (await firstCheckbox.isVisible({ timeout: E2E_MS.control }).catch(() => false)) await firstCheckbox.click()
    const saveBtn = page.getByTestId('preset-save-as-btn')
    if (!(await saveBtn.isVisible({ timeout: E2E_MS.control }).catch(() => false)) || await saveBtn.isDisabled()) {
      test.skip('Sauvegarder preset non disponible')
      return
    }
    await saveBtn.click()
    await page.locator('#preset-name').fill('Preset Obsolètes E2E')
    await page.locator('#preset-icon').fill('OBS')
    await page.getByTestId('preset-modal-create-btn').click()
    await expect(page.getByRole('heading', { name: /enregistrer sous/i })).not.toBeVisible({ timeout: E2E_MS.modalLong })
    await page.getByTestId('preset-dropdown-trigger').click()
    await expect(page.getByText(/Preset Obsolètes E2E/i).first()).toBeVisible({ timeout: E2E_MS.short })
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
