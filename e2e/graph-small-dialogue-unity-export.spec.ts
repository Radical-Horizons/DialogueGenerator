/**
 * E2E : dialogue minimal avec branche (choix) + export Unity JSON.
 *
 * Valide le flux Dashboard → Éditeur de graphe → graphe chargé → Actions → Export Unity
 * (téléchargement blob côté client).
 */
import { test, expect, type Page } from '@playwright/test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { uniqueE2EDocumentId, seedDocumentWithRetry, openDashboardGraphTabAndSelectDocument } from './helpers'
import { E2E_MS, E2E_TEST_TIMEOUT_MS } from './timeouts'

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:4243'
const FIXTURE_PREFIX = 'e2e-small-dialogue-unity-export'

const FIXTURE_DOC = {
  schemaVersion: '1.1.0',
  nodes: [
    {
      id: 'node-root',
      speaker: 'E2E',
      line: 'Racine avec un choix',
      choices: [
        {
          choiceId: 'e2e_go_next',
          text: 'Aller au nœud suivant',
          targetNode: 'node-next',
        },
      ],
    },
    {
      id: 'node-next',
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

  test('graphe avec choix : arêtes visibles, Export Unity télécharge un JSON valide', async ({
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
    const downloadPromise = page.waitForEvent('download', { timeout: E2E_MS.graphField })
    await page.getByTestId('btn-export-unity').click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/\.json$/i)

    const outDir = test.info().outputDir
    await fs.mkdir(outDir, { recursive: true })
    const savePath = path.join(outDir, download.suggestedFilename())
    await download.saveAs(savePath)
    const raw = await fs.readFile(savePath, 'utf-8')
    const parsed = JSON.parse(raw) as { schemaVersion?: string; nodes?: unknown[] }
    expect(parsed.schemaVersion).toBe('1.1.0')
    expect(Array.isArray(parsed.nodes)).toBe(true)
    expect(parsed.nodes!.length).toBeGreaterThanOrEqual(2)
  })
})
