/**
 * Tests E2E pour les opérations CRUD des dialogues Unity (P0).
 *
 * Section « Éditer » (barre supérieure) : un document unique est seedé par l'API,
 * retrouvé par la recherche de la liste, ouvert, puis supprimé par le menu contextuel.
 */
import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'

import { seedDocumentWithRetry, uniqueE2EDocumentId } from './helpers'
import { E2E_MS } from './timeouts'

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:4243'
const FIXTURE_PREFIX = 'e2e-unity-crud'
const NODE = 'node-c3d4e5f6789012345678901abcdef123'
const LINE = 'Ligne témoin du CRUD e2e.'

const FIXTURE_DOC = {
  schemaVersion: '1.1.0',
  nodes: [{ id: NODE, stableId: NODE, displayName: 'Témoin', speaker: 'E2E', line: LINE }],
}

async function deleteFixture(request: APIRequestContext, fixtureId: string): Promise<void> {
  const res = await request.delete(`${API_BASE}/api/v1/documents/${fixtureId}`)
  if (!res.ok() && res.status() !== 404) {
    throw new Error(`Cleanup DELETE failed ${res.status()}: ${await res.text().catch(() => '')}`)
  }
}

/** Section « Éditer » → liste filtrée sur l'id unique du document seedé. */
async function findInEditionList(page: Page, fixtureId: string): Promise<{ list: Locator; item: Locator }> {
  await page.goto('/')
  const edition = page.getByTestId('header-section-edition')
  await expect(edition).toBeVisible({ timeout: E2E_MS.ui })
  await edition.click()
  const list = page.locator('[data-testid="unity-dialogue-list"]:visible')
  const search = list.getByPlaceholder(/chercher/i)
  await expect(search).toBeVisible({ timeout: E2E_MS.dashboardList })
  await search.fill(fixtureId)
  return { list, item: list.getByTestId('unity-dialogue-item') }
}

test.describe('Unity Dialogues CRUD Operations [P0]', { tag: '@smoke' }, () => {
  test.afterEach(async ({ request }, testInfo) => {
    await deleteFixture(request, uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo))
  })

  test('[P0] should list Unity dialogues', async ({ page, request }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    await seedDocumentWithRetry(request, API_BASE, fixtureId, FIXTURE_DOC)

    const { item } = await findInEditionList(page, fixtureId)

    await expect(item).toHaveCount(1, { timeout: E2E_MS.dashboardList })
  })

  test('[P0] should read a Unity dialogue', async ({ page, request }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    await seedDocumentWithRetry(request, API_BASE, fixtureId, FIXTURE_DOC)

    const { item } = await findInEditionList(page, fixtureId)
    await expect(item).toHaveCount(1, { timeout: E2E_MS.dashboardList })
    await item.click()

    const shownAsText = page.getByText(LINE, { exact: false })
    const shownInField = page.locator('textarea:visible, input:visible').filter({ hasText: LINE })
    await expect(shownAsText.or(shownInField).first()).toBeVisible({ timeout: E2E_MS.graphPanel })
  })

  test('[P0] should delete a Unity dialogue', async ({ page, request }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    await seedDocumentWithRetry(request, API_BASE, fixtureId, FIXTURE_DOC)

    const { item } = await findInEditionList(page, fixtureId)
    await expect(item).toHaveCount(1, { timeout: E2E_MS.dashboardList })

    await item.click({ button: 'right' })
    const deleteEntry = page.getByTestId('dialogue-list-context-delete')
    await expect(deleteEntry).toBeVisible({ timeout: E2E_MS.control })
    page.once('dialog', (dialog) => void dialog.accept())
    await deleteEntry.click()

    await expect(item).toHaveCount(0, { timeout: E2E_MS.dashboardList })
    const gone = await request.get(`${API_BASE}/api/v1/documents/${fixtureId}`)
    expect(gone.status()).toBe(404)
  })
})
