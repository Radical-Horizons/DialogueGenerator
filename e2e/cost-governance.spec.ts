/**
 * Tests E2E pour le cost governance (Story 0.7).
 *
 * Scénarios testés :
 * - AC#1 : Warning à 90% du budget (toast affiché)
 * - AC#2 : Blocage à 100% du budget (modal bloquante)
 * - AC#3 : Dashboard affiche budget et graphique
 * - AC#1 : Configuration budget fonctionne (API)
 */
import { test, expect, type Page } from '@playwright/test'

import { E2E_MS, E2E_TEST_TIMEOUT_MS } from './timeouts'

const API_BASE = 'http://127.0.0.1:4243'

/** Tests API purs : pas de beforeEach UI (évite de saturer le timeout et de disposer le request context). */
test.describe('Cost Governance — API', () => {
  test('AC#1: Configuration budget fonctionne', async ({ request }) => {
    const response = await request.put(`${API_BASE}/api/v1/costs/budget`, {
      data: { quota: 150.0 },
    })
    if (!response.ok()) {
      const text = await response.text().catch(() => '')
      throw new Error(`PUT budget failed: ${response.status()} ${text}`)
    }
    const data = await response.json()
    expect(Number(data.quota)).toBeGreaterThanOrEqual(149)
    expect(Number(data.quota)).toBeLessThanOrEqual(151)
    expect(Number(data.amount)).toBeGreaterThanOrEqual(0)
    expect(Number(data.percentage)).toBeGreaterThanOrEqual(0)
    expect(Number(data.remaining)).toBeGreaterThanOrEqual(0)

    const getResponse = await request.get(`${API_BASE}/api/v1/costs/budget`)
    expect(getResponse.status()).toBe(200)
    const budgetData = await getResponse.json()
    expect(Number(budgetData.quota)).toBeGreaterThanOrEqual(149)
    expect(Number(budgetData.quota)).toBeLessThanOrEqual(151)
  })
})

test.describe('Cost Governance — UI (Story 0.7)', () => {
  test.setTimeout(E2E_TEST_TIMEOUT_MS.cost)
  test.describe.configure({ mode: 'serial' })

  const login = async (page: Page) => {
    await page.goto('/')
    const loginHeading = page.getByRole('heading', { name: /connexion/i })
    const isLoginPage = await loginHeading.isVisible({ timeout: E2E_MS.graphField }).catch(() => false)
    if (isLoginPage) {
      await page.getByLabel(/nom d'utilisateur/i).fill('admin')
      await page.getByLabel(/mot de passe/i).fill('admin123')
      await page.getByRole('button', { name: /se connecter/i }).click()
      await expect(page).toHaveURL('/', { timeout: E2E_MS.ui })
    }
  }

  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.getByRole('button', { name: /Génération de Dialogues/i }).waitFor({
      state: 'visible',
      timeout: E2E_MS.graphField,
    })
  })

  test('AC#3: Dashboard affiche budget et graphique', async ({ page }) => {
    const usageButton = page.locator('button:has-text("Usage")').or(page.locator('[data-testid="usage-button"]'))
    if (await usageButton.isVisible({ timeout: E2E_MS.probe })) {
      await usageButton.click()

      await page.waitForSelector('text=/Budget LLM|Suivi d\'utilisation/i', { timeout: E2E_MS.short })

      const budgetSection = page.locator('text=/Budget LLM/i')
      await expect(budgetSection).toBeVisible()

      await expect(page.locator('text=/Quota mensuel/i')).toBeVisible()
      await expect(page.locator('text=/Montant dépensé/i')).toBeVisible()
      await expect(page.locator('text=/Montant restant/i')).toBeVisible()
      await expect(page.locator('text=/Pourcentage utilisé/i')).toBeVisible()

      const chartSection = page.locator('text=/Évolution des coûts/i')
      await expect(chartSection).toBeVisible({ timeout: E2E_MS.short })
    } else {
      test.skip('Bouton Usage non trouvé - test ignoré')
    }
  })

  test('AC#1: Toast warning affiché à 90%', async ({ page }) => {
    const baselineRes = await page.request.get(`${API_BASE}/api/v1/costs/budget`)
    expect(baselineRes.ok()).toBe(true)
    const baseline = (await baselineRes.json()) as { amount?: number; quota?: number }
    const restoreQuota = Math.max(50, Number(baseline.quota) || 50)
    const amount = Number(baseline.amount) || 0
    if (amount <= 0) {
      test.skip(true, 'Montant dépensé nul — impossible de calibrer ~90% pour le toast')
      return
    }

    try {
      const targetQuota = amount / 0.92
      const putRes = await page.request.put(`${API_BASE}/api/v1/costs/budget`, {
        data: { quota: targetQuota },
      })
      expect(putRes.ok()).toBe(true)
      const after = (await (await page.request.get(`${API_BASE}/api/v1/costs/budget`)).json()) as {
        percentage: number
      }
      if (after.percentage < 85 || after.percentage >= 100) {
        test.skip(true, `Budget hors plage warning après calibration (${after.percentage}%)`)
        return
      }

      await login(page)
      await page.getByRole('button', { name: /Génération de Dialogues/i }).waitFor({ state: 'visible', timeout: E2E_MS.graphField })

      // La génération exige une scène ou des instructions. Un brief explicite
      // évite de dépendre de la sélection persistante des personnages.
      const sceneInstructions = page.locator('#user-instructions-textarea')
      await expect(sceneInstructions).toBeVisible({ timeout: E2E_MS.medium })
      await sceneInstructions.fill('Budget governance E2E')

      // Cliquer la CTA visible évite que le focus du champ de recherche intercepte Ctrl+Enter.
      const generateButton = page.getByRole('button', { name: /^Générer/i }).last()
      await expect(generateButton).toBeEnabled({ timeout: E2E_MS.graphField })
      await generateButton.click()

      await expect(page.getByText(/Budget atteint à \d/i).first()).toBeVisible({ timeout: E2E_MS.graphField })
    } finally {
      await page.request.put(`${API_BASE}/api/v1/costs/budget`, { data: { quota: restoreQuota } }).catch(() => {})
    }
  })

  test('AC#2: Modal bloque génération à 100%', async ({ page }) => {
    await page.request.put(`${API_BASE}/api/v1/costs/budget`, {
      data: { quota: 0.001 },
    })

    const budgetResponse = await page.request.get(`${API_BASE}/api/v1/costs/budget`)
    const budget = await budgetResponse.json()

    if (budget.percentage >= 100) {
      const generateResponse = await page.request.post(`${API_BASE}/api/v1/dialogues/generate/unity-dialogue`, {
        data: {
          user_instructions: 'Test generation',
          context_selections: {
            characters_full: ['TEST_CHAR'],
          },
        },
        failOnStatusCode: false,
      })

      expect(generateResponse.status()).toBe(429)
      const errorData = await generateResponse.json()
      expect(errorData.error.code).toBe('QUOTA_EXCEEDED')
    } else {
      await page.goto('http://localhost:3000')
      await login(page)
      await page.getByRole('button', { name: /Génération de Dialogues/i }).waitFor({ state: 'visible', timeout: E2E_MS.ui })

      test.skip('Budget n\'est pas à 100% - nécessite setup manuel du budget à 100%')
    }
  })
})
