/**
 * Tests E2E pour les tests avec 4 résultats (Story 0.10).
 *
 * - AC#1 : un choix portant un test fait apparaître un TestNode à 4 sorties
 * - AC#3 : les 4 connexions s'éditent dans l'inspecteur et sont persistées
 * - AC#4 : rétrocompatibilité — un ancien dialogue à 2 résultats se charge
 *
 * Chaque test sème son dialogue : l'ancienne version ne chargeait aucun document et
 * se sautait entièrement. AC#2 (export puis import) n'est plus couvert ici : il n'existe
 * pas d'import, l'export est couvert par `graph-small-dialogue-unity-export.spec.ts` et
 * la génération des 4 nœuds par `graph-test-node-generation-4results.spec.ts`.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

import {
  openApp,
  openDashboardGraphTabAndSelectDocument,
  seedDocumentWithRetry,
  uniqueE2EDocumentId,
} from './helpers'
import { E2E_MS, E2E_TEST_TIMEOUT_MS } from './timeouts'
import { triggerGraphSave } from './trigger-graph-save'

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:4243'
const FIXTURE_PREFIX = 'e2e-graph-4-results'
const TEST_NODE_ID = 'test-node-START-choice-0'
const HANDLES = ['critical-failure', 'failure', 'success', 'critical-success'] as const

const resultNode = (id: string, displayName: string) => ({
  id,
  displayName,
  speaker: 'E2E',
  line: `${displayName}.`,
  choices: [],
})

function fixture(results: Record<string, string>) {
  return {
    schemaVersion: '1.1.0',
    nodes: [
      {
        id: 'START',
        speaker: 'E2E',
        line: 'Un test à quatre issues.',
        choices: [{ choiceId: 'c0', text: 'Tenter de convaincre', test: 'Raison+Diplomatie:8', ...results }],
      },
      resultNode('node-cf', 'Échec critique'),
      resultNode('node-f', 'Échec simple'),
      resultNode('node-s', 'Réussite simple'),
      resultNode('node-cs', 'Réussite critique'),
      resultNode('node-alt', 'Issue alternative'),
    ],
  }
}

const FOUR_RESULTS = {
  testCriticalFailureNode: 'node-cf',
  testFailureNode: 'node-f',
  testSuccessNode: 'node-s',
  testCriticalSuccessNode: 'node-cs',
}

async function deleteFixture(request: APIRequestContext, fixtureId: string): Promise<void> {
  const res = await request.delete(`${API_BASE}/api/v1/documents/${fixtureId}`)
  if (!res.ok() && res.status() !== 404) {
    throw new Error(`Cleanup DELETE failed ${res.status()}: ${await res.text().catch(() => '')}`)
  }
}

async function persistedChoice(request: APIRequestContext, fixtureId: string): Promise<Record<string, unknown>> {
  const res = await request.get(`${API_BASE}/api/v1/documents/${fixtureId}`)
  expect(res.ok()).toBe(true)
  const { document } = (await res.json()) as {
    document: { nodes: Array<{ id: string; choices?: Array<Record<string, unknown>> }> }
  }
  return document.nodes.find((n) => n.id === 'START')?.choices?.[0] ?? {}
}

async function openTestNodeEditor(page: Page): Promise<void> {
  const testNode = page.locator(`[data-testid="graph-editor"] [data-id="${TEST_NODE_ID}"]`)
  await expect(testNode).toBeVisible({ timeout: E2E_MS.graphField })
  await testNode.click({ force: true })
  await openNodeEditorForTestNode(page)
}

/** Un TestNode n'a pas de champ `speaker` : on attend ses connexions plutôt que le formulaire de réplique. */
async function openNodeEditorForTestNode(page: Page): Promise<void> {
  const inspector = page.getByTestId('graph-inspector')
  await inspector
    .getByTestId('graph-inspector-node-summary')
    .getByRole('button', { name: 'éditer' })
    .first()
    .click()
  await expect(inspector.getByText('Connexions de test')).toBeVisible({ timeout: E2E_MS.graphField })
}

test.describe('Graph 4 Test Results (Story 0.10)', () => {
  test.setTimeout(E2E_TEST_TIMEOUT_MS.graphHeavy)

  test.afterEach(async ({ request }, testInfo) => {
    await deleteFixture(request, uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo))
  })

  test('AC#1: un choix avec test fait apparaître un TestNode à 4 sorties', async ({ page, request }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    await seedDocumentWithRetry(request, API_BASE, fixtureId, fixture({}))
    await openApp(page)
    await openDashboardGraphTabAndSelectDocument(page, fixtureId)

    const testNode = page.locator(`[data-testid="graph-editor"] [data-id="${TEST_NODE_ID}"]`)
    await expect(testNode).toBeVisible({ timeout: E2E_MS.graphField })
    for (const handle of HANDLES) {
      await expect(testNode.locator(`[data-handleid="${handle}"]`)).toHaveCount(1)
    }
  })

  test('AC#3: les 4 connexions s’éditent dans l’inspecteur et sont persistées', async ({
    page,
    request,
  }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    await seedDocumentWithRetry(request, API_BASE, fixtureId, fixture(FOUR_RESULTS))
    await openApp(page)
    await openDashboardGraphTabAndSelectDocument(page, fixtureId)
    await openTestNodeEditor(page)

    await expect(page.getByTestId('panel-test-cf')).toContainText('Échec critique (node-cf)')
    await expect(page.getByTestId('panel-test-f')).toContainText('Échec simple (node-f)')
    await expect(page.getByTestId('panel-test-s')).toContainText('Réussite simple (node-s)')
    await expect(page.getByTestId('panel-test-cs')).toContainText('Réussite critique (node-cs)')

    await page.getByTestId('panel-test-cf').click()
    // Liste en portail `document.body` : ne pas scoper sous le déclencheur.
    await page.getByText('Issue alternative (node-alt)', { exact: true }).click()
    await expect(page.getByTestId('panel-test-cf')).toContainText('Issue alternative (node-alt)')

    // Flush depuis START (comme graph-test-node-generation-4results) avant la sauvegarde.
    await page.locator('[data-testid="graph-editor"] [data-id="START"]').click({ force: true })
    await triggerGraphSave(page)

    await expect
      .poll(async () => (await persistedChoice(request, fixtureId)).testCriticalFailureNode, {
        timeout: E2E_MS.graphField,
      })
      .toBe('node-alt')
    const choice = await persistedChoice(request, fixtureId)
    expect(choice.testFailureNode).toBe('node-f')
    expect(choice.testSuccessNode).toBe('node-s')
    expect(choice.testCriticalSuccessNode).toBe('node-cs')
  })

  test('AC#4: rétrocompatibilité — un dialogue à 2 résultats se charge avec 4 sorties', async ({
    page,
    request,
  }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    await seedDocumentWithRetry(
      request,
      API_BASE,
      fixtureId,
      fixture({ testFailureNode: 'node-f', testSuccessNode: 'node-s' })
    )
    await openApp(page)
    await openDashboardGraphTabAndSelectDocument(page, fixtureId)
    await openTestNodeEditor(page)

    const testNode = page.locator(`[data-testid="graph-editor"] [data-id="${TEST_NODE_ID}"]`)
    for (const handle of HANDLES) {
      await expect(testNode.locator(`[data-handleid="${handle}"]`)).toHaveCount(1)
    }
    await expect(page.getByTestId('panel-test-f')).toContainText('Échec simple (node-f)')
    await expect(page.getByTestId('panel-test-s')).toContainText('Réussite simple (node-s)')
    // Les issues critiques restent vides : Unity retombe sur échec / réussite simples.
    await expect(page.getByTestId('panel-test-cf')).not.toContainText('(node-')
    await expect(page.getByTestId('panel-test-cs')).not.toContainText('(node-')
  })
})
