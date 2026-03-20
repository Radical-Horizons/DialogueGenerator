/**
 * E2E : Génération depuis un TestNode → les 4 nœuds sont connectés au choix parent.
 *
 * Vérifie en UI que le flux "Générer" (menu contextuel sur le TestNode) ajoute 4 nœuds
 * et que les connexions sont bien persistées dans le document (choice.test*Node).
 *
 * Stratégie : fixture document avec choix ayant un test → mock de l’API generate-node
 * → clic droit sur TestNode → "Générer" → assertion sur les 4 nœuds visibles puis lecture
 * du document via API pour vérifier les champs test*Node du choix.
 */
import { test, expect, type Page } from '@playwright/test'

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:4243'
const FIXTURE_ID = 'e2e-testnode-gen-fixture'

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
    { id: 'NODE_CF', speaker: 'E2E', line: 'Échec critique' },
    { id: 'NODE_F', speaker: 'E2E', line: 'Échec' },
    { id: 'NODE_S', speaker: 'E2E', line: 'Réussite' },
    { id: 'NODE_CS', speaker: 'E2E', line: 'Réussite critique' },
  ],
  suggested_connections: [
    { from: 'test-node-START-choice-0', to: 'NODE_CF', connection_type: 'test-critical-failure' },
    { from: 'test-node-START-choice-0', to: 'NODE_F', connection_type: 'test-failure' },
    { from: 'test-node-START-choice-0', to: 'NODE_S', connection_type: 'test-success' },
    { from: 'test-node-START-choice-0', to: 'NODE_CS', connection_type: 'test-critical-success' },
  ],
  parent_node_id: 'test-node-START-choice-0',
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

async function loginAndGotoGraph(page: Page): Promise<void> {
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
  await page.goto(`/graph-editor/${encodeURIComponent(FIXTURE_ID)}`)
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
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('request-save-dialogue')))
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

test.describe('Génération depuis TestNode - 4 résultats connectés (UI)', () => {
  test.setTimeout(60_000)

  test.afterEach(async ({ request }) => {
    await deleteFixture(request)
  })

  test('génération depuis menu contextuel TestNode → 4 nœuds visibles et connexions persistées dans le document', async ({
    page,
    request,
  }) => {
    await seedFixture(request)

    await page.route('**/api/v1/unity-dialogues/graph/generate-node', async (route) => {
      const body = route.request().postDataJSON()
      if (body?.parent_node_id?.startsWith('test-node-')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_GENERATE_RESPONSE),
        })
      } else {
        await route.continue()
      }
    })

    await loginAndGotoGraph(page)

    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15000 })

    const testNode = page.locator('[data-id="test-node-START-choice-0"]')
    await expect(testNode).toBeVisible({ timeout: 5000 })
    await testNode.click({ button: 'right' })

    const generateResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/v1/unity-dialogues/graph/generate-node') &&
        resp.request().method() === 'POST' &&
        resp.status() === 200,
      { timeout: 20000 }
    )

    await page.getByRole('menuitem', { name: /Générer/i }).click()
    await generateResponsePromise

    // Event-based: API done → wait for all 4 nodes in DOM (attached), parallel to avoid viewport/order flakiness
    const nodeIds = ['NODE_CF', 'NODE_F', 'NODE_S', 'NODE_CS']
    await Promise.all(
      nodeIds.map((id) =>
        page.locator(`[data-id="${id}"]`).waitFor({ state: 'attached', timeout: 20000 })
      )
    )

    await triggerSave(page)

    const { nodes } = await getDocumentViaApi(request)
    const startNode = nodes.find((n) => n.id === 'START') as { choices?: Array<Record<string, unknown>> } | undefined
    expect(startNode?.choices?.length).toBeGreaterThanOrEqual(1)
    const choice0 = startNode?.choices?.[0]
    expect(choice0?.testCriticalFailureNode).toBe('NODE_CF')
    expect(choice0?.testFailureNode).toBe('NODE_F')
    expect(choice0?.testSuccessNode).toBe('NODE_S')
    expect(choice0?.testCriticalSuccessNode).toBe('NODE_CS')
  })
})
