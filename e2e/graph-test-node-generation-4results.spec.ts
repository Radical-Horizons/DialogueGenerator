/**
 * E2E : Génération depuis un TestNode → les 4 nœuds sont connectés au choix parent.
 *
 * Vérifie en UI que le flux "Générer" (menu contextuel sur le TestNode) ajoute 4 nœuds
 * et que les connexions sont bien persistées dans le document (choice.test*Node).
 *
 * Stratégie : fixture document avec choix ayant un test → mock de l’API generate-node
 * → clic gauche (sélection panel) puis clic droit sur TestNode → "Générer" → vérification
 * du nombre d’edges React Flow puis les 4 nœuds visibles et lecture
 * du document via API pour vérifier les champs test*Node du choix.
 */
import { test, expect, type Page } from '@playwright/test'
import { triggerGraphSave } from './trigger-graph-save'
import {
  uniqueE2EDocumentId,
  seedDocumentWithRetry,
  openDashboardGraphTabAndSelectDocument,
} from './helpers'
import { E2E_MS, E2E_TEST_TIMEOUT_MS } from './timeouts'

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:4243'
const FIXTURE_PREFIX = 'e2e-testnode-gen'

const FIXTURE_DOC = {
  schemaVersion: '1.1.0',
  nodes: [
    {
      id: 'START',
      speaker: 'E2E',
      line: 'Fixture TestNode génération',
      choices: [
        {
          text: 'Tenter de convaincre',
          choiceId: 'c0',
          test: 'Raison+Diplomatie:8',
        },
      ],
    },
    { id: 'END', speaker: 'E2E', line: 'Fin.', nextNode: null, choices: [] },
  ],
}

const MOCK_GENERATE_RESPONSE = {
  nodes: [
    { id: 'node-cf', speaker: 'E2E', line: 'Échec critique' },
    { id: 'node-f', speaker: 'E2E', line: 'Échec' },
    { id: 'node-s', speaker: 'E2E', line: 'Réussite' },
    { id: 'node-cs', speaker: 'E2E', line: 'Réussite critique' },
  ],
  suggested_connections: [
    { from: 'test-node-START-choice-0', to: 'node-cf', connection_type: 'test-critical-failure' },
    { from: 'test-node-START-choice-0', to: 'node-f', connection_type: 'test-failure' },
    { from: 'test-node-START-choice-0', to: 'node-s', connection_type: 'test-success' },
    { from: 'test-node-START-choice-0', to: 'node-cs', connection_type: 'test-critical-success' },
  ],
  parent_node_id: 'test-node-START-choice-0',
}

/** Dashboard → onglet graphe : NodeEditorPanel monté pour flush + sauvegarde explicite. */
async function loginAndOpenFixtureOnDashboardGraph(page: Page, fixtureId: string): Promise<void> {
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
  await page
    .getByRole('button', { name: /Génération de Dialogues/i })
    .waitFor({ state: 'visible', timeout: E2E_MS.graphField })
    .catch(() => {})
  await openDashboardGraphTabAndSelectDocument(page, fixtureId)
}

function nodesFromUnityJsonContent(jsonContent: string): Array<Record<string, unknown>> {
  const raw = JSON.parse(jsonContent) as { nodes?: unknown[] } | unknown[]
  if (Array.isArray(raw)) {
    return raw as Array<Record<string, unknown>>
  }
  if (raw && typeof raw === 'object' && Array.isArray(raw.nodes)) {
    return raw.nodes as Array<Record<string, unknown>>
  }
  return []
}

function expectStartChoiceTestConnections(nodes: Array<Record<string, unknown>>): void {
  const startNode = nodes.find((n) => n.id === 'START') as { choices?: Array<Record<string, unknown>> } | undefined
  expect(startNode?.choices?.length).toBeGreaterThanOrEqual(1)
  const choice0 = startNode?.choices?.[0]
  expect(choice0?.testCriticalFailureNode).toBe('node-cf')
  expect(choice0?.testFailureNode).toBe('node-f')
  expect(choice0?.testSuccessNode).toBe('node-s')
  expect(choice0?.testCriticalSuccessNode).toBe('node-cs')
}

/** Sauvegarde explicite ; le backend peut prendre PUT documents+layout ou POST save-and-write (repli migration). */
async function triggerSaveAndReadPersistedNodes(
  page: Page
): Promise<Array<Record<string, unknown>>> {
  const saveRequestPromise = page.waitForRequest(
    (request) => {
      const u = request.url()
      const m = request.method()
      if (m === 'POST' && u.includes('/save-and-write')) return true
      if (m === 'PUT' && u.includes('/api/v1/documents/') && !u.includes('/layout')) return true
      return false
    },
    { timeout: E2E_MS.documentLoad }
  )
  await triggerGraphSave(page)
  const saveRequest = await saveRequestPromise
  const persistResp = await saveRequest.response()
  if (!persistResp) {
    throw new Error(`Persistence request ended without response: ${saveRequest.url()}`)
  }
  if (!persistResp.ok()) {
    throw new Error(`Persistence failed ${persistResp.status()}: ${await persistResp.text()}`)
  }

  if (saveRequest.url().includes('save-and-write')) {
    const body = (await persistResp.json()) as { json_content?: string }
    const nodes = nodesFromUnityJsonContent(body.json_content ?? '{}')
    return nodes
  }

  const payload = saveRequest.postDataJSON() as {
    document?: { nodes?: Array<Record<string, unknown>> }
  }
  return payload.document?.nodes ?? []
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

test.describe('Génération depuis TestNode - 4 résultats connectés (UI)', () => {
  test.setTimeout(E2E_TEST_TIMEOUT_MS.graphHeavy)

  test.afterEach(async ({ request }, testInfo) => {
    await deleteFixture(request, uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo))
  })

  test('génération depuis menu contextuel TestNode → 4 nœuds visibles et connexions persistées dans le document', async ({
    page,
    request,
  }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    await seedDocumentWithRetry(request, API_BASE, fixtureId, FIXTURE_DOC)

    await page.route('**/api/v1/unity-dialogues/graph/generate-node', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_GENERATE_RESPONSE),
      })
    })

    await loginAndOpenFixtureOnDashboardGraph(page, fixtureId)

    const flowNodes = page.locator('[data-testid="graph-editor"] .react-flow__viewport .react-flow__node')
    const flowEdges = page.locator('[data-testid="graph-editor"] .react-flow__viewport .react-flow__edge')

    await expect(flowNodes.first()).toBeVisible({ timeout: E2E_MS.graphField })
    const nodeCountBeforeGen = await flowNodes.count()

    const testNode = page.locator('[data-id="test-node-START-choice-0"]')
    await expect(testNode).toBeVisible({ timeout: E2E_MS.short })
    const edgesBeforeGen = await flowEdges.count()
    // Minimap (coin bas-droit) peut recouvrir le TestNode après layout — force évite l’interception.
    await testNode.click({ button: 'left', force: true })
    await testNode.click({ button: 'right', force: true })

    const generateResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/v1/unity-dialogues/graph/generate-node') &&
        resp.request().method() === 'POST' &&
        resp.status() === 200,
      { timeout: E2E_MS.graphCanvas }
    )

    await page.getByRole('menuitem', { name: /Générer/i }).click()
    await generateResponsePromise

    await expect(page.getByRole('status', { name: /Génération en cours/i })).toHaveCount(0, {
      timeout: E2E_MS.generationMenu,
    })

    // Après génération, le canvas peut zoomer sur un seul nœud + onlyRenderVisibleElements → peu de
    // `.react-flow__node` dans le DOM. Demander le fit via le store de vue E2E évite une dépendance
    // au focus clavier du menu contextuel.
    await page.evaluate(() => {
      const api = (
        window as unknown as {
          __graphViewStoreE2E?: { getState: () => { requestFitView: () => void } }
        }
      ).__graphViewStoreE2E
      if (!api) throw new Error('Graph view store E2E absent')
      api.getState().requestFitView()
    })

    // Les ids DOM peuvent différer des ids logiques mockés — on valide sur le nombre de nœuds ajoutés.
    await expect
      .poll(async () => flowNodes.count(), { timeout: E2E_MS.pollNodes })
      .toBeGreaterThanOrEqual(nodeCountBeforeGen + 4)

    await expect
      .poll(async () => flowEdges.count(), { timeout: E2E_MS.pollEdges })
      .toBeGreaterThanOrEqual(edgesBeforeGen + 4)

    // Flush avec TestNode sélectionné → syncChoiceFromTestNode peut effacer les test*Node du choix.
    // START + mergeDialogueNodeFormIntoStoreData préserve les champs de connexion déjà dans le store.
    await page.locator('[data-testid="graph-editor"] [data-id="START"]').click({ force: true })

    const nodes = await triggerSaveAndReadPersistedNodes(page)
    expectStartChoiceTestConnections(nodes)
  })
})
