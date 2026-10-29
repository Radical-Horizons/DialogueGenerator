/**
 * E2E Story 6.9 — suggestions de templates (UI + mocks réseau).
 */
import { test, expect, type Page } from '@playwright/test'

import { E2E_MS, E2E_TEST_TIMEOUT_MS } from './timeouts'

test.describe('Templates — suggestions [6.9]', { tag: '@smoke' }, () => {
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

  /** Les templates sont un onglet d'entrée depuis la refonte de la colonne. */
  const openTemplatesTab = async (page: Page) => {
    await page.getByTestId('input-tab-templates').click()
  }

  test('ouvre le modal Suggestions et charge un pré-built', async ({ page }) => {
    let usedPosted = false
    await page.route('**/api/v1/templates/suggestions**', async (route) => {
      const request = route.request()
      const url = request.url()
      const method = request.method()
      if (method === 'POST' && url.includes('/suggestions/used')) {
        usedPosted = true
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ source: 'prebuilt', id: 'confrontation', useCount: 1 }),
        })
        return
      }
      if (method === 'POST' && url.includes('/suggestions')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              source: 'prebuilt',
              id: 'confrontation',
              name: 'Confrontation',
              description: 'Desc',
              category: 'Confrontation',
              icon: '⚔️',
              score: 40,
              reasons: ['Correspond aux mots-clés du brief'],
              configuration: {
                characters: [],
                locations: [],
                region: '',
                sceneType: 'Generic',
                instructions: 'Brief e2e confrontation',
              },
              sceneTypeHint: 'confrontation',
              gddSystem: 'Skill check',
            },
          ]),
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
    await openTemplatesTab(page)

    await expect(page.getByTestId('suggestions-open-btn')).toBeVisible({
      timeout: E2E_MS.short,
    })
    await page.getByTestId('suggestions-open-btn').click()
    await expect(page.getByTestId('template-suggestions-modal')).toBeVisible()
    await expect(page.getByTestId('suggestion-item')).toBeVisible()
    await expect(page.getByTestId('suggestion-badge')).toHaveText(/Suggéré pour votre contexte/)
    await page.getByTestId('suggestion-load-btn').click()
    await expect(page.getByTestId('template-suggestions-modal')).toBeHidden({
      timeout: E2E_MS.short,
    })
    expect(usedPosted).toBe(true)
  })
})
