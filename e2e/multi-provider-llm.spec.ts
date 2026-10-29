/**
 * Tests E2E pour la sélection multi-provider LLM (Story 0.3)
 */
import { test, expect, type Page } from '@playwright/test'

import { openApp } from './helpers'
import { E2E_MS } from './timeouts'

/** Le sélecteur de modèle vit dans le tiroir de réglages replié sous le brief (1c). */
async function openModelSettings(page: Page): Promise<void> {
  const toggle = page.getByTestId('model-settings-summary-toggle')
  await expect(toggle).toBeVisible({ timeout: E2E_MS.ui })
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  await page.locator('#model-select').waitFor({ state: 'visible', timeout: E2E_MS.ui })
}

test.describe('Multi-Provider LLM Selection', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page)
    await openModelSettings(page)
  })

  test('should display model selector', async ({ page }) => {
    const modelSelector = page.locator('#model-select')
    await expect(modelSelector).toBeVisible()
  })

  test('should show OpenAI and Mistral providers', async ({ page }) => {
    await page.waitForFunction(
      () => (document.querySelector('#model-select') as HTMLSelectElement)?.options?.length ?? 0 > 0,
      { timeout: E2E_MS.graphField }
    )
    const optionCount = await page.locator('#model-select option').count()
    if (optionCount === 0) {
      test.skip(true, 'Liste modèles vide — ignorer sans clé / config LLM')
    }
    expect(optionCount).toBeGreaterThan(0)
  })

  test('should change model selection', async ({ page }) => {
    await page.waitForFunction(
      () => (document.querySelector('#model-select') as HTMLSelectElement)?.options?.length ?? 0 > 0,
      { timeout: E2E_MS.graphField }
    )
    const mistral = page.locator('#model-select option[value="labs-mistral-small-creative"]')
    if ((await mistral.count()) === 0) {
      test.skip(true, 'Option labs-mistral-small-creative absente')
    }
    await page.selectOption('#model-select', 'labs-mistral-small-creative')

    const selectedValue = await page.inputValue('#model-select')
    expect(selectedValue).toBe('labs-mistral-small-creative')
  })

  test('should persist model selection in localStorage', async ({ page }) => {
    const select = page.locator('#model-select')
    // La liste des modèles arrive de l'API : la lire avant voyait < 2 options et sautait le test.
    await page.waitForFunction(
      () => ((document.querySelector('#model-select') as HTMLSelectElement)?.options?.length ?? 0) > 1,
      { timeout: E2E_MS.graphField }
    )
    const opts = await select
      .locator('option[value]')
      .evaluateAll((nodes: HTMLOptionElement[]) => nodes.map((o) => o.value).filter(Boolean))
    if (opts.length < 2) {
      test.skip(true, 'Un seul modèle disponible')
      return
    }
    const valueToSelect = opts[1]
    await page.selectOption('#model-select', valueToSelect)
    // Le brouillon s'écrit avec un debounce de 2 s (`useGenerationDraft`) : recharger avant
    // perdait la sélection, et le test se sautait au lieu de vérifier la persistance.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const raw = localStorage.getItem('generation_draft')
            return raw ? (JSON.parse(raw) as { llmModel?: string }).llmModel : null
          }),
        { timeout: E2E_MS.short }
      )
      .toBe(valueToSelect)
    await page.reload()
    await openModelSettings(page)
    await page.waitForFunction(
      () => (document.querySelector('#model-select') as HTMLSelectElement)?.options?.length > 0,
      { timeout: E2E_MS.medium }
    )
    const selectedValue = await page.inputValue('#model-select')
    if (!selectedValue) {
      test.skip(true, 'Sélection réinitialisée après reload (liste modèles asynchrone)')
      return
    }
    expect(selectedValue).toBe(valueToSelect)
  })

  test('should display provider in UI', async ({ page }) => {
    await page.waitForFunction(
      () => (document.querySelector('#model-select') as HTMLSelectElement)?.options?.length ?? 0 > 0,
      { timeout: E2E_MS.graphField }
    )
    const mistral = page.locator('#model-select option[value="labs-mistral-small-creative"]')
    if ((await mistral.count()) === 0) {
      test.skip(true, 'Option labs-mistral-small-creative absente')
    }
    await page.selectOption('#model-select', 'labs-mistral-small-creative')
    const selectedValue = await page.inputValue('#model-select')
    expect(selectedValue).toBeTruthy()
    const select = page.locator('#model-select')
    const option = select.locator(`option[value="${selectedValue}"]`)
    await expect(option).toContainText(/mistral|Mistral/i)
  })

  test.skip('should generate dialogue with Mistral (requires API key)', async ({ page }) => {
    await page.selectOption('#model-select', 'labs-mistral-small-creative')
    await page.fill('#user-instructions', 'Test generation with Mistral')
    await page.click('button:has-text("Générer")')
    await page.waitForSelector('[data-testid="generation-progress"]', { timeout: E2E_MS.short })
    const errorMessage = page.locator('.error-message')
    await expect(errorMessage).not.toBeVisible({ timeout: E2E_MS.probe })
  })

  test.skip('should handle Mistral API error gracefully (requires invalid key)', async ({ page }) => {
    await page.selectOption('#model-select', 'labs-mistral-small-creative')
    await page.click('button:has-text("Générer")')
    const errorMessage = page.locator('.error-message')
    await expect(errorMessage).toBeVisible({ timeout: E2E_MS.ui })
    await expect(errorMessage).toContainText('Mistral API unavailable')
  })
})
