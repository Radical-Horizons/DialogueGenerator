/**
 * E2E Story 6.8 — partager templates (UI + mocks réseau).
 */
import { test, expect, type Page } from '@playwright/test'

import { E2E_MS, E2E_TEST_TIMEOUT_MS } from './timeouts'

const OWNED_ID = '11111111-1111-4111-8111-111111111111'
const SHARED_ID = '22222222-2222-4222-8222-222222222222'

function ownedTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: OWNED_ID,
    name: 'Alpha owned E2E',
    description: 'Desc owned',
    category: 'Confrontation',
    icon: '⚔️',
    metadata: { created: '2026-08-16T10:00:00Z', modified: '2026-08-16T10:00:00Z' },
    configuration: {
      characters: ['char-alpha'],
      locations: [],
      region: '',
      sceneType: 'Generic',
      instructions: 'Brief',
    },
    relation: 'owned',
    ownerId: 'admin',
    ownerUsername: 'admin',
    sharedByUsername: null,
    ...overrides,
  }
}

function sharedTemplate() {
  return {
    id: SHARED_ID,
    name: 'Beta partagé E2E',
    description: 'Desc shared',
    category: 'Salutation',
    icon: '👋',
    metadata: { created: '2026-08-16T10:00:00Z', modified: '2026-08-16T11:00:00Z' },
    configuration: {
      characters: [],
      locations: [],
      region: '',
      sceneType: 'Generic',
      instructions: 'Brief',
    },
    relation: 'granted',
    ownerId: 'writer-a',
    ownerUsername: 'writer-a',
    sharedByUsername: 'writer-a',
  }
}

test.describe('Templates — partager [6.8]', { tag: '@smoke' }, () => {
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

  test('ouvre le modal Partager et voit la section partagés', async ({ page }) => {
    const shares: Array<{
      template_id: string
      user_id: string
      username: string
      created_at: string
    }> = []

    await page.route('**/api/v1/templates**', async (route) => {
      const request = route.request()
      const url = request.url()
      const method = request.method()
      const pathname = new URL(url).pathname
      if (url.includes('/prebuilt') || url.includes('/marketplace') || url.includes('/ab-test')) {
        await route.continue()
        return
      }
      if (method === 'GET' && pathname.endsWith('/shares')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(shares),
        })
        return
      }
      if (method === 'POST' && pathname.endsWith('/shares')) {
        const row = {
          template_id: OWNED_ID,
          user_id: 'writer-b',
          username: 'writer-b',
          created_at: '2026-08-16T12:00:00Z',
        }
        shares.push(row)
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(row),
        })
        return
      }
      if (method === 'GET' && (pathname === '/api/v1/templates' || pathname === '/api/v1/templates/')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([ownedTemplate(), sharedTemplate()]),
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

    await expect(page.getByTestId('template-item-share-btn')).toBeVisible({
      timeout: E2E_MS.short,
    })
    await page.getByTestId('template-item-share-btn').click()
    await expect(page.getByTestId('template-sharing-modal')).toBeVisible()
    await page.getByTestId('template-share-username').fill('writer-b')
    await page.getByTestId('template-share-invite').click()
    await expect(page.getByTestId('template-share-row-writer-b')).toBeVisible({
      timeout: E2E_MS.short,
    })

    await page.getByTestId('template-sharing-close').click()
    await expect(page.getByTestId('templates-partages-list')).toBeVisible()
    await expect(page.getByTestId('shared-template-item')).toBeVisible()
    await expect(page.getByTestId('shared-template-badge')).toHaveText(/Partagé par writer-a/)
  })
})
