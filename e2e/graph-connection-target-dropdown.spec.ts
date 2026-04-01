/**
 * E2E : changement de cible via le combobox (ConnectionTargetSelect) — flux « Nœud suivant ».
 *
 * Le panneau d’édition (`NodeEditorPanel`) n’est pas monté sur `/graph-editor` (standalone) :
 * le test passe par le Dashboard (onglet 📊 Éditeur de Graphe) comme les flux qui éditent
 * speaker / line depuis Playwright.
 */
import { test, expect, type Page } from '@playwright/test'
import { triggerGraphSave } from './trigger-graph-save'

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:4243'
const FIXTURE_ID = 'e2e-connection-dropdown-fixture'

/** START sans choix : panneau « Nœud suivant » → `connection-target-next-node`. */
const FIXTURE_DOC = {
  schemaVersion: '1.1.0',
  nodes: [
    {
      id: 'START',
      speaker: 'E2E',
      line: 'Ligne START sans choix',
      nextNode: 'MID',
      choices: [],
    },
    {
      id: 'MID',
      speaker: 'E2E',
      line: 'Middle',
      nextNode: 'END',
      choices: [],
    },
    { id: 'END', speaker: 'E2E', line: 'Fin.', nextNode: null, choices: [] },
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

/**
 * Dashboard → onglet graphe → sélection du document seedé (liste Unity à gauche du GraphEditor).
 */
async function openDashboardGraphAndSelectFixture(page: Page): Promise<void> {
  await loginIfNeeded(page)
  await page
    .getByRole('button', { name: /Génération de Dialogues/i })
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => {})

  await page.getByRole('button', { name: /Éditeur de Graphe/i }).click()

  await page.getByRole('button', { name: /e2e-connection-dropdown-fixture/i }).click()

  await expect(page.getByText(/Chargement du graphe/i)).toBeHidden({ timeout: 20000 })
}

async function triggerSave(page: Page): Promise<void> {
  const waitSave = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/v1/unity-dialogues/graph/save') ||
      resp.url().includes('/api/v1/documents/') ||
      resp.url().includes('.layout'),
    { timeout: 20000 }
  )
  await triggerGraphSave(page)
  const resp = await waitSave
  if (!resp.ok()) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Save failed ${resp.status()}: ${body}`)
  }
}

async function getDocumentViaApi(
  request: Parameters<Parameters<typeof test>[1]>[0]['request']
): Promise<{ nodes: Array<Record<string, unknown>> }> {
  const res = await request.get(`${API_BASE}/api/v1/documents/${FIXTURE_ID}`)
  expect(res.ok(), `GET document failed: ${res.status()}`).toBe(true)
  const body = (await res.json()) as { document?: { nodes?: Array<Record<string, unknown>> } }
  return { nodes: body.document?.nodes ?? [] }
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

test.describe('Graph — cible de connexion (dropdown)', () => {
  test.setTimeout(90_000)

  test.afterEach(async ({ request }) => {
    await deleteFixture(request)
  })

  test('combobox Nœud suivant : MID → Fin (END), edges visibles, nextNode persisté', async ({
    page,
    request,
  }) => {
    await seedFixture(request)
    await openDashboardGraphAndSelectFixture(page)

    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 20000 })
    await expect(page.locator('.react-flow__edge')).not.toHaveCount(0)

    await page
      .locator('.react-flow__node')
      .filter({ hasText: 'Ligne START sans choix' })
      .first()
      .click()

    const nodeTab = page.getByRole('button', { name: /^Édition de nœud$/ })
    if (await nodeTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nodeTab.click()
    }

    await expect(page.locator('textarea[name="line"]')).toBeVisible({ timeout: 15000 })

    const combobox = page.getByTestId('connection-target-next-node')
    await expect(combobox).toBeVisible({ timeout: 15000 })
    await expect(combobox).toContainText(/Middle|MID/)

    await combobox.click()
    const endOption = page.getByText('Fin (END)', { exact: true })
    await expect(endOption.first()).toBeVisible({ timeout: 5000 })
    await endOption.first().click()

    await expect(combobox).toContainText(/Fin \(END\)/)

    await expect(page.locator('.react-flow__edge')).not.toHaveCount(0)

    await triggerSave(page)

    const { nodes } = await getDocumentViaApi(request)
    const start = nodes.find((n) => n.id === 'START') as { nextNode?: string } | undefined
    expect(start?.nextNode).toBe('END')
  })
})
