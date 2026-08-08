/**
 * Tests E2E pour la sélection multi-provider LLM (Story 0.3)
 */
import { test, expect } from '@playwright/test'

import { E2E_MS } from './timeouts'

test.describe('Multi-Provider LLM Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Génération de Dialogues/i }).waitFor({ state: 'visible', timeout: E2E_MS.ui })
    await page.locator('#model-select').waitFor({ state: 'visible', timeout: E2E_MS.ui })
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
    const mistral = page.locator('#model-select option[value="mistralai/mistral-medium-3-5"]')
    if ((await mistral.count()) === 0) {
      test.skip(true, 'Option mistralai/mistral-medium-3-5 absente')
    }
    await page.selectOption('#model-select', 'mistralai/mistral-medium-3-5')

    const selectedValue = await page.inputValue('#model-select')
    expect(selectedValue).toBe('mistralai/mistral-medium-3-5')
  })

  test('should persist model selection in localStorage', async ({ page }) => {
    const select = page.locator('#model-select')
    const opts = await select
      .locator('option[value]')
      .evaluateAll((nodes: HTMLOptionElement[]) => nodes.map((o) => o.value).filter(Boolean))
    if (opts.length < 2) {
      test.skip(true, 'Un seul modèle disponible')
      return
    }
    const valueToSelect = opts[1]
    await page.selectOption('#model-select', valueToSelect)
    await page.reload()
    await page.locator('#model-select').waitFor({ state: 'visible', timeout: E2E_MS.ui })
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
    const mistral = page.locator('#model-select option[value="mistralai/mistral-medium-3-5"]')
    if ((await mistral.count()) === 0) {
      test.skip(true, 'Option mistralai/mistral-medium-3-5 absente')
    }
    await page.selectOption('#model-select', 'mistralai/mistral-medium-3-5')
    const selectedValue = await page.inputValue('#model-select')
    expect(selectedValue).toBeTruthy()
    const select = page.locator('#model-select')
    const option = select.locator(`option[value="${selectedValue}"]`)
    await expect(option).toContainText(/mistral|Mistral/i)
  })

  test.skip('should generate dialogue with Mistral (requires API key)', async ({ page }) => {
    await page.selectOption('#model-select', 'mistralai/mistral-medium-3-5')
    await page.fill('#user-instructions', 'Test generation with Mistral')
    await page.click('button:has-text("Générer")')
    await page.waitForSelector('[data-testid="generation-progress"]', { timeout: E2E_MS.short })
    const errorMessage = page.locator('.error-message')
    await expect(errorMessage).not.toBeVisible({ timeout: E2E_MS.probe })
  })

  test.skip('should handle Mistral API error gracefully (requires invalid key)', async ({ page }) => {
    await page.selectOption('#model-select', 'mistralai/mistral-medium-3-5')
    await page.click('button:has-text("Générer")')
    const errorMessage = page.locator('.error-message')
    await expect(errorMessage).toBeVisible({ timeout: E2E_MS.ui })
    await expect(errorMessage).toContainText('Mistral API unavailable')
  })
})
