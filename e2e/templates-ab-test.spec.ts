/**
 * E2E Story 6.7 — A/B tester templates (UI + mocks réseau, sans LLM réel).
 */
import { test, expect, type Page } from '@playwright/test'

import { E2E_MS, E2E_TEST_TIMEOUT_MS } from './timeouts'

test.describe('Templates — A/B tester [6.7]', { tag: '@smoke' }, () => {
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

  test('ouvre le modal, empty historique, lance et voit le gagnant', async ({ page }) => {
    const result = {
      testId: 'e2e-ab-1',
      status: 'completed',
      current: 2,
      total: 2,
      createdAt: '2026-08-16T10:00:00Z',
      templateAId: 'tpl-a',
      templateBId: 'tpl-b',
      templateAName: 'Alpha E2E',
      templateBName: 'Beta E2E',
      generationsPerTemplate: 1,
      maxDepth: 1,
      parentTestId: null,
      winnerTemplateId: 'tpl-a',
      scoreVarianceNote: 'Variance ±1',
      generations: [
        {
          id: 'gen-1',
          templateId: 'tpl-a',
          templateName: 'Alpha E2E',
          index: 0,
          overallScore: 8,
          criteria: [],
          costEur: 0,
          durationMs: 1,
          thumb: null,
          error: null,
        },
      ],
      totals: {
        templateA: {
          meanOverall: 8,
          scoredCount: 1,
          totalCostEur: 0,
          totalDurationMs: 1,
          thumbsUp: 0,
          thumbsDown: 0,
        },
        templateB: {
          meanOverall: 5,
          scoredCount: 1,
          totalCostEur: 0,
          totalDurationMs: 1,
          thumbsUp: 0,
          thumbsDown: 0,
        },
      },
      error: null,
    }

    await page.route('**/api/v1/templates/ab-test**', async (route) => {
      const request = route.request()
      const url = request.url()
      const method = request.method()
      if (method === 'GET' && url.endsWith('/ab-test')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        })
        return
      }
      if (method === 'POST' && url.endsWith('/ab-test')) {
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({
            testId: 'e2e-ab-1',
            status: 'queued',
            current: 0,
            total: 2,
          }),
        })
        return
      }
      if (method === 'GET' && url.includes('/ab-test/e2e-ab-1')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(result),
        })
        return
      }
      if (method === 'PATCH' && url.includes('/feedback')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...result,
            generations: [{ ...result.generations[0], thumb: 'up' }],
          }),
        })
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await login(page)
    const generateTab = page.getByTestId('header-section-generation')
    await expect(generateTab).toBeVisible({ timeout: E2E_MS.ui })
    await generateTab.click()
    await expandModelSettings(page)

    await page.getByTestId('ab-test-open-btn').click()
    await expect(page.getByTestId('template-ab-test-modal')).toBeVisible({
      timeout: E2E_MS.short,
    })
    await expect(page.getByTestId('ab-test-history-empty')).toBeVisible()

    const templateA = page.getByTestId('ab-test-template-a')
    const templateB = page.getByTestId('ab-test-template-b')
    const optionA = await templateA.locator('option').nth(1).getAttribute('value')
    const optionB = await templateB.locator('option').nth(2).getAttribute('value')
    if (optionA) {
      await templateA.selectOption(optionA)
    }
    if (optionB) {
      await templateB.selectOption(optionB)
    }
    await page.getByTestId('ab-test-n').fill('1')
    await page.getByTestId('ab-test-launch-btn').click()
    await expect(page.getByTestId('ab-test-winner')).toContainText(/Alpha E2E|Égalité|gagnant/i, {
      timeout: E2E_MS.short,
    })
    await expect(page.getByTestId('ab-test-score-bar').first()).toBeVisible()
    await page.getByTestId('ab-test-thumb-up-gen-1').click()
  })
})
