/**
 * E2E : dialogue minimal avec branche (choix) + export Unity JSON.
 *
 * Valide le flux Dashboard → Éditeur de graphe → Actions → Export Unity
 * (validate-schema bloquant puis écriture serveur — Story 5.1).
 *
 * Le document existe déjà sur disque : l'écriture passe par PUT /documents/{id}
 * avec sa révision. `save-and-write` ne crée que des documents neufs et répond
 * 409 `canonical_revision_required` sur un fichier existant (ADR-008).
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
    const documentPath = `/api/v1/documents/${encodeURIComponent(fixtureId)}`
    const writePromise = page.waitForResponse(
      (r) => new URL(r.url()).pathname === documentPath && r.request().method() === 'PUT',
      { timeout: E2E_MS.graphField }
    )
    const legacyWrites: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/save-and-write')) legacyWrites.push(r.url())
    })

    await page.getByTestId('btn-export-unity').click()

    const validateResponse = await validatePromise
    expect(validateResponse.ok()).toBe(true)
    const validateBody = (await validateResponse.json()) as { is_valid: boolean }
    expect(validateBody.is_valid).toBe(true)

    const writeResponse = await writePromise
    expect(writeResponse.ok()).toBe(true)
    const { revision } = (await writeResponse.json()) as { revision: number }
    expect(revision).toBeGreaterThan(1)

    await expect(page.getByText(/Dialogue exporté/i)).toBeVisible({ timeout: E2E_MS.ui })
    expect(legacyWrites).toEqual([])

    const persisted = await request.get(`${API_BASE}${documentPath}`)
    expect(persisted.ok()).toBe(true)
    const { document } = (await persisted.json()) as {
      document: { schemaVersion?: string; nodes?: unknown[] }
    }
    expect(document.schemaVersion).toBe('1.1.0')
    expect(Array.isArray(document.nodes)).toBe(true)
    expect(document.nodes!.length).toBeGreaterThanOrEqual(2)
  })
})
