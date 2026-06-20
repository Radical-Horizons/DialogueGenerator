/**
 * E2E : dialogue minimal avec branche (choix) + export Unity JSON.
 *
 * Valide le flux Dashboard → Éditeur de graphe → Actions → Export Unity
 * (validate-schema bloquant puis save-and-write serveur — Story 5.1).
 */
import { test, expect, type Page } from '@playwright/test'
import { uniqueE2EDocumentId, seedDocumentWithRetry, openDashboardGraphTabAndSelectDocument } from './helpers'
import { E2E_MS, E2E_TEST_TIMEOUT_MS } from './timeouts'

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:4243'
const FIXTURE_PREFIX = 'e2e-small-dialogue-unity-export'

const NODE_A = 'node-a1b2c3d4e5f6789012345678abcdef01'
const NODE_B = 'node-b2c3d4e5f678901234567890abcdef12'

const FIXTURE_DOC = {
  schemaVersion: '1.1.0',
  nodes: [
    {
      id: NODE_A,
      stableId: NODE_A,
      displayName: 'Racine',
      speaker: 'E2E',
      line: 'Racine avec un choix',
      choices: [
        {
          choiceId: 'e2e_go_next',
          text: 'Aller au nœud suivant',
          targetNode: NODE_B,
        },
      ],
    },
    {
      id: NODE_B,
      stableId: NODE_B,
      displayName: 'Suite',
      speaker: 'E2E',
      line: 'Nœud cible du choix.',
    },
  ],
}

async function loginIfNeeded(page: Page): Promise<void> {
  await page.goto('/')
  const onLogin = await page
    .getByRole('heading', { name: /connexion/i })
    .isVisible({ timeout: E2E_MS.control })
    .catch(() => false)
  if (onLogin) {
    await page.getByLabel(/nom d'utilisateur/i).fill('admin')
    await page.getByLabel(/mot de passe/i).fill('admin123')
    await page.getByRole('button', { name: /se connecter/i }).click()
    await expect(page).toHaveURL(/\//, { timeout: E2E_MS.ui })
  }
}

async function openDashboardGraphAndSelectFixture(page: Page, fixtureId: string): Promise<void> {
  await loginIfNeeded(page)
  await openDashboardGraphTabAndSelectDocument(page, fixtureId)
}

async function deleteFixture(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  fixtureId: string
): Promise<void> {
  const res = await request.delete(`${API_BASE}/api/v1/documents/${fixtureId}`)
  if (!res.ok() && res.status() !== 404) {
    const text = await res.text().catch(() => '')
    throw new Error(`Cleanup DELETE failed ${res.status()}: ${text}`)
  }
}

test.describe('Graph — petit dialogue + export Unity', () => {
  test.setTimeout(E2E_TEST_TIMEOUT_MS.cost)

  test.afterEach(async ({ request }, testInfo) => {
    await deleteFixture(request, uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo))
  })

  test('graphe avec choix : Export Unity via API + toast succès', async ({
    page,
    request,
  }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    await seedDocumentWithRetry(request, API_BASE, fixtureId, FIXTURE_DOC)
    await openDashboardGraphAndSelectFixture(page, fixtureId)

    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: E2E_MS.graphCanvas })
    await expect(page.locator('.react-flow__edge')).not.toHaveCount(0)

    const graphEditor = page.getByTestId('graph-editor')
    await graphEditor.getByTestId('btn-actions-dropdown').click()

    const validatePromise = page.waitForResponse(
      (r) => r.url().includes('/validate-schema') && r.request().method() === 'POST',
      { timeout: E2E_MS.graphField }
    )
    const writePromise = page.waitForResponse(
      (r) => r.url().includes('/save-and-write') && r.request().method() === 'POST',
      { timeout: E2E_MS.graphField }
    )

    await page.getByTestId('btn-export-unity').click()

    const validateResponse = await validatePromise
    expect(validateResponse.ok()).toBe(true)
    const validateBody = (await validateResponse.json()) as { is_valid: boolean }
    expect(validateBody.is_valid).toBe(true)

    const writeResponse = await writePromise
    expect(writeResponse.ok()).toBe(true)
    const body = (await writeResponse.json()) as {
      success: boolean
      filename: string
      json_content: string
    }
    expect(body.success).toBe(true)
    expect(body.filename).toMatch(/\.json$/i)

    await expect(page.getByText(/Dialogue exporté/i)).toBeVisible({ timeout: E2E_MS.ui })

    const parsed = JSON.parse(body.json_content) as { schemaVersion?: string; nodes?: unknown[] }
    expect(parsed.schemaVersion).toBe('1.1.0')
    expect(Array.isArray(parsed.nodes)).toBe(true)
    expect(parsed.nodes!.length).toBeGreaterThanOrEqual(2)
  })
})
