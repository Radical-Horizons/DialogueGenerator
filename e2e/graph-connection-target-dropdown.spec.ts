/**
 * E2E : changement de cible via le combobox (ConnectionTargetSelect) — flux « Nœud suivant ».
 *
 * Le panneau d’édition (`NodeEditorPanel`) n’est pas monté sur `/graph-editor` (standalone) :
 * le test passe par le Dashboard (onglet 📊 Éditeur de Graphe) comme les flux qui éditent
 * speaker / line depuis Playwright.
 */
import { test, expect, type Page, type Response } from '@playwright/test'

declare global {
  interface Window {
    __graphStoreE2E?: {
      getState: () => {
        edges: Array<{
          id: string
          source: string
          target: string
          label?: string
          data?: { edgeType?: string }
        }>
      }
    }
  }
}
import { triggerGraphSave } from './trigger-graph-save'
import { uniqueE2EDocumentId, seedDocumentWithRetry, openDashboardGraphTabAndSelectDocument } from './helpers'
import { E2E_MS, E2E_TEST_TIMEOUT_MS } from './timeouts'

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:4243'
const FIXTURE_PREFIX = 'e2e-connection-dropdown'

/** START sans choix : panneau « Nœud suivant » → `connection-target-next-node`. */
const FIXTURE_DOC = {
  schemaVersion: '1.1.0',
  nodes: [
    {
      id: 'START',
      speaker: 'E2E',
      line: 'Ligne START sans choix',
      nextNode: 'node-mid',
      choices: [],
    },
    {
      id: 'node-mid',
      speaker: 'E2E',
      line: 'Middle',
      nextNode: 'END',
      choices: [],
    },
    { id: 'END', speaker: 'E2E', line: 'Fin.', nextNode: null, choices: [] },
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

async function triggerSave(page: Page): Promise<Response> {
  const matchesSavedTarget = (resp: Response): boolean => {
    try {
      const payload = JSON.parse(resp.request().postData() || '{}') as {
        document?: { nodes?: Array<{ id?: string; nextNode?: string }> }
        nodes?: Array<{ id?: string; data?: { nextNode?: string } }>
      }
      const documentStart = payload.document?.nodes?.find((node) => node.id === 'START')
      const graphStart = payload.nodes?.find((node) => node.id === 'START')
      return documentStart?.nextNode === 'END' || graphStart?.data?.nextNode === 'END'
    } catch {
      return false
    }
  }
  const matchesSaveResponse = (resp: Response): boolean => {
    const method = resp.request().method()
    const u = resp.url()
    if (method === 'PUT' && u.includes('/api/v1/documents/') && !u.includes('/layout')) {
      return matchesSavedTarget(resp)
    }
    if (method === 'POST' && /\/api\/v1\/unity-dialogues\/graph\/save(?:-and-write)?$/.test(u)) {
      return matchesSavedTarget(resp)
    }
    return false
  }
  const maxAttempts = 4
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const waitSave = page.waitForResponse(matchesSaveResponse, { timeout: E2E_MS.savePut })
    await triggerGraphSave(page)
    const resp = await waitSave
    if (resp.status() === 409 && attempt < maxAttempts - 1) {
      await page.waitForTimeout(400)
      continue
    }
    if (!resp.ok()) {
      const body = await resp.text().catch(() => '')
      throw new Error(`Save failed ${resp.status()}: ${body}`)
    }
    return resp
  }
  throw new Error('Aucune réponse de sauvegarde ne contient START.nextNode=END')
}

async function getDocumentViaApi(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  fixtureId: string
): Promise<{ nodes: Array<Record<string, unknown>> }> {
  const res = await request.get(`${API_BASE}/api/v1/documents/${fixtureId}`)
  expect(res.ok(), `GET document failed: ${res.status()}`).toBe(true)
  const body = (await res.json()) as { document?: { nodes?: Array<Record<string, unknown>> } }
  return { nodes: body.document?.nodes ?? [] }
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

test.describe('Graph — cible de connexion (dropdown)', () => {
  test.setTimeout(E2E_TEST_TIMEOUT_MS.saveHeavy)

  test.afterEach(async ({ request }, testInfo) => {
    await deleteFixture(request, uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo))
  })

  test('combobox Nœud suivant : MID → Fin (END), edges visibles, nextNode persisté', async ({
    page,
    request,
  }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    await seedDocumentWithRetry(request, API_BASE, fixtureId, FIXTURE_DOC)
    await openDashboardGraphAndSelectFixture(page, fixtureId)

    const canvasNodes = page.locator('[data-testid="graph-editor"] .react-flow__viewport .react-flow__node')
    await expect(canvasNodes.first()).toBeVisible({ timeout: E2E_MS.graphCanvas })
    await expect(
      page.locator('[data-testid="graph-editor"] .react-flow__viewport .react-flow__edge')
    ).not.toHaveCount(0)

    await canvasNodes.filter({ hasText: 'Ligne START sans choix' }).first().click()

    // NodeEditorPanel doit être monté pour le flush avant sauvegarde (handleSave → requestFlush).
    const nodeTab = page.getByRole('button', { name: /^Édition de nœud$/ })
    await expect(nodeTab).toBeVisible({ timeout: E2E_MS.graphField })
    await nodeTab.click()

    await expect(page.locator('textarea[name="line"]')).toBeVisible({ timeout: E2E_MS.graphField })

    const combobox = page.getByTestId('connection-target-next-node')
    await expect(combobox).toBeVisible({ timeout: E2E_MS.graphField })
    await expect(combobox).toContainText(/Middle|MID/)

    await combobox.click()
    // Liste en portail `document.body` : ne pas scoper sous `data-testid` du trigger.
    await page.getByText('Fin (END)', { exact: true }).click()

    await expect(combobox).toContainText(/Fin \(END\)/)
    await expect(page.locator('.react-flow__edge')).not.toHaveCount(0)

    const edgesAfterClick = await page.evaluate(() => {
      const api = window.__graphStoreE2E
      if (!api) return null
      return api.getState().edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        edgeType: (e.data as { edgeType?: string } | undefined)?.edgeType,
      }))
    })
    expect(
      edgesAfterClick?.some((e) => e.source === 'START' && e.target === 'END'),
      `Pas d’arête START→END dans le store après sélection. edges=${JSON.stringify(edgesAfterClick)}`
    ).toBe(true)

    // Laisser finir l’autosave en vol pour que waitForResponse du Ctrl+S ne consomme pas son PUT.
    await page.waitForTimeout(600)

    const putBodies: Array<{ document?: { nodes?: Array<{ id?: string; nextNode?: string }> } }> = []
    page.on('request', (req) => {
      if (
        req.method() === 'PUT' &&
        req.url().includes('/api/v1/documents/') &&
        !req.url().includes('/layout')
      ) {
        try {
          putBodies.push(JSON.parse(req.postData() || '{}') as (typeof putBodies)[0])
        } catch {
          /* ignore */
        }
      }
    })

    const saveResponse = await triggerSave(page)

    const lastPut = putBodies[putBodies.length - 1]
    const startInPut = lastPut?.document?.nodes?.find((n) => n.id === 'START')
    // eslint-disable-next-line no-console -- diagnostic E2E
    console.log('PUT count', putBodies.length, 'START.nextNode in last PUT', startInPut?.nextNode)

    const edgesAfterSave = await page.evaluate(() => {
      const api = window.__graphStoreE2E
      if (!api) return null
      return api.getState().edges.map((e) => ({
        source: e.source,
        target: e.target,
        label: e.label,
        edgeType: (e.data as { edgeType?: string } | undefined)?.edgeType,
      }))
    })
    expect(
      edgesAfterSave?.some((e) => e.source === 'START' && e.target === 'END'),
      `Après sauvegarde, START→END devrait rester. edges=${JSON.stringify(edgesAfterSave)}`
    ).toBe(true)

    let nodes: Array<Record<string, unknown>>
    if (saveResponse.url().includes('/save-and-write')) {
      const body = (await saveResponse.json()) as { json_content?: string }
      const parsed = JSON.parse(body.json_content ?? '{}') as { nodes?: Array<Record<string, unknown>> }
      nodes = parsed.nodes ?? []
    } else {
      nodes = (await getDocumentViaApi(request, fixtureId)).nodes
    }
    const start = nodes.find((n) => n.id === 'START') as { nextNode?: string } | undefined
    expect(start?.nextNode).toBe('END')
  })
})
