/**
 * E2E : dialogue minimal avec branche (choix) + export Unity JSON.
 *
 * Valide le flux Dashboard → Éditeur de graphe → graphe chargé → Actions → Export Unity
 * (téléchargement blob côté client).
 */
import { test, expect, type Page } from '@playwright/test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:4243'
const FIXTURE_ID = 'e2e-small-dialogue-unity-export'

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

async function seedFixture(
  request: Parameters<Parameters<typeof test>[1]>[0]['request']
): Promise<void> {
  let revision = 1
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await request.put(`${API_BASE}/api/v1/documents/${FIXTURE_ID}`, {
      data: { document: FIXTURE_DOC, revision },
    })
    if (res.ok()) return
    if (res.status() === 409) {
      const body = (await res.json().catch(() => ({}))) as { revision?: number }
      revision = body.revision ?? revision + 1
      continue
    }
    const text = await res.text().catch(() => '')
    throw new Error(`Seed failed ${res.status()}: ${text}`)
  }
}

async function loginIfNeeded(page: Page): Promise<void> {
  await page.goto('/')
  const onLogin = await page
    .getByRole('heading', { name: /connexion/i })
    .isVisible({ timeout: 3000 })
    .catch(() => false)
  if (onLogin) {
    await page.getByLabel(/nom d'utilisateur/i).fill('admin')
    await page.getByLabel(/mot de passe/i).fill('admin123')
    await page.getByRole('button', { name: /se connecter/i }).click()
    await expect(page).toHaveURL(/\//, { timeout: 10000 })
  }
}

async function openDashboardGraphAndSelectFixture(page: Page): Promise<void> {
  await loginIfNeeded(page)
  await page
    .getByRole('button', { name: /Génération de Dialogues/i })
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => {})

  await page.getByRole('button', { name: /Éditeur de Graphe/i }).click()
  await page.getByRole('button', { name: new RegExp(FIXTURE_ID, 'i') }).click()
  await expect(page.getByText(/Chargement du graphe/i)).toBeHidden({ timeout: 20000 })
}

async function deleteFixture(
  request: Parameters<Parameters<typeof test>[1]>[0]['request']
): Promise<void> {
  const res = await request.delete(`${API_BASE}/api/v1/documents/${FIXTURE_ID}`)
  if (!res.ok() && res.status() !== 404) {
    const text = await res.text().catch(() => '')
    throw new Error(`Cleanup DELETE failed ${res.status()}: ${text}`)
  }
}

test.describe('Graph — petit dialogue + export Unity', () => {
  test.setTimeout(90_000)

  test.afterEach(async ({ request }) => {
    await deleteFixture(request)
  })

  test('graphe avec choix : arêtes visibles, Export Unity télécharge un JSON valide', async ({
    page,
    request,
  }) => {
    await seedFixture(request)
    await openDashboardGraphAndSelectFixture(page)

    await expect(page.locator('.react-flow__node')).toHaveCount(2, { timeout: 20000 })
    await expect(page.locator('.react-flow__edge')).not.toHaveCount(0)

    const graphEditor = page.getByTestId('graph-editor')
    await graphEditor.getByTestId('btn-actions-dropdown').click()
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 })
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
