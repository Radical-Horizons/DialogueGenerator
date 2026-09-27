/**
 * Tests E2E pour la génération de nœuds depuis le graphe (Story 0.5.5).
 *
 * Scénarios testés :
 * - AC#1 : Génération pour choix spécifique depuis éditeur de graphe
 * - AC#2 : Génération depuis éditeur de dialogue (NodeEditorPanel)
 * - AC#3 : Génération batch pour tous les choix
 * - AC#5 : Génération nextNode (navigation linéaire)
 * - AC#7 : Validation que targetNode et nextNode pointent vers des nœuds existants
 * - AC#8 : Filtrage des choix déjà connectés
 *
 * Chaque test sème son propre dialogue (`seedDocumentWithRetry`) : les anciens tests
 * dépendaient du premier dialogue du disque et d'ids `NODE_*` quasi inexistants, donc
 * se sautaient tous. `generate-node` est simulé au contrat de l'API
 * (`GraphNodeOrchestrator._build_normal_connections`, batch `graph_generation_service`) :
 * ce qui est testé ici, c'est le parcours UI et la liaison parent → nœud, qui est la
 * responsabilité du front — pas la qualité du texte LLM (couverte par `@e2e-llm`).
 */
import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'

import {
  openDashboardGraphTabAndSelectDocument,
  seedDocumentWithRetry,
  uniqueE2EDocumentId,
} from './helpers'
import { E2E_MS, E2E_TEST_TIMEOUT_MS } from './timeouts'
import { triggerGraphSave } from './trigger-graph-save'

const API_BASE = 'http://127.0.0.1:4243'
const FIXTURE_PREFIX = 'e2e-graph-node-gen'

const ROOT_ID = 'START'
const LINEAR_ID = 'node-e2e-linear'
const LINKED_CHOICE_INDEX = 2

const FIXTURE_DOC = {
  schemaVersion: '1.1.0',
  nodes: [
    {
      id: ROOT_ID,
      speaker: 'E2E',
      line: 'Racine avec trois réponses.',
      choices: [
        { choiceId: 'e2e_free_a', text: 'Première réponse libre' },
        { choiceId: 'e2e_free_b', text: 'Deuxième réponse libre' },
        { choiceId: 'e2e_linked', text: 'Réponse déjà reliée', targetNode: LINEAR_ID },
      ],
    },
    {
      id: LINEAR_ID,
      speaker: 'E2E',
      line: 'Nœud linéaire sans réponse.',
    },
  ],
}

interface UnityChoice {
  choiceId?: string
  text?: string
  targetNode?: string
}

interface UnityNode {
  id: string
  nextNode?: string
  choices?: UnityChoice[]
}

interface GenerateNodeCall {
  parent_node_id: string
  parent_node_content?: { choices?: UnityChoice[] }
  target_choice_index?: number | null
  generate_all_choices?: boolean
}

/** Réplique du nœud simulé n° `n` (pour la retrouver dans l'inspecteur). */
function generatedLine(n: number): string {
  return `Réplique générée E2E ${n}`
}

/**
 * Simule `POST /graph/generate-node` au contrat de l'API et enregistre chaque requête.
 * Ids `node-e2e-gen-1`, `-2`… dans l'ordre des nœuds renvoyés.
 */
async function mockGenerateNode(page: Page): Promise<GenerateNodeCall[]> {
  const calls: GenerateNodeCall[] = []
  let seq = 0
  const makeNode = () => {
    seq += 1
    return { id: `node-e2e-gen-${seq}`, speaker: 'E2E', line: generatedLine(seq), choices: [] }
  }
  await page.route('**/api/v1/unity-dialogues/graph/generate-node', async (route) => {
    const body = route.request().postDataJSON() as GenerateNodeCall
    calls.push(body)
    const parentId = body.parent_node_id
    const choices = body.parent_node_content?.choices ?? []

    if (body.generate_all_choices) {
      const free = choices
        .map((choice, index) => ({ choice, index }))
        .filter(({ choice }) => !choice.targetNode || choice.targetNode === 'END')
      const nodes = free.map(() => makeNode())
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          node: nodes[0] ?? null,
          nodes: nodes.length > 1 ? nodes : null,
          suggested_connections: free.map(({ index }, k) => ({
            from: parentId,
            to: nodes[k].id,
            via_choice_index: index,
            connection_type: 'choice',
          })),
          parent_node_id: parentId,
          batch_count: nodes.length,
          generated_choices_count: nodes.length,
          connected_choices_count: choices.length - free.length,
          failed_choices_count: 0,
          total_choices_count: choices.length,
        }),
      })
      return
    }

    const node = makeNode()
    const connection =
      typeof body.target_choice_index === 'number'
        ? { from: parentId, to: node.id, via_choice_index: body.target_choice_index, connection_type: 'choice' }
        : { from: parentId, to: node.id, connection_type: 'nextNode' }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ node, suggested_connections: [connection], parent_node_id: parentId }),
    })
  })
  return calls
}

async function loginIfNeeded(page: Page): Promise<void> {
  await page.goto('/')
  const onLogin = await page
    .getByRole('heading', { name: /connexion/i })
    .isVisible({ timeout: E2E_MS.probe })
    .catch(() => false)
  if (onLogin) {
    await page.getByLabel(/nom d'utilisateur/i).fill('admin')
    await page.getByLabel(/mot de passe/i).fill('admin123')
    await page.getByRole('button', { name: /se connecter/i }).click()
    await expect(page).toHaveURL('/', { timeout: E2E_MS.authRedirect })
  }
}

/** Cible d'un lien, `null` si le lien est libre (`END` ou absent : deux écritures du même « rien »). */
function linkTarget(target: string | undefined): string | null {
  return target && target !== 'END' ? target : null
}

async function readPersistedNodes(request: APIRequestContext, documentId: string): Promise<UnityNode[]> {
  const res = await request.get(`${API_BASE}/api/v1/documents/${encodeURIComponent(documentId)}`)
  if (!res.ok()) return []
  const body = (await res.json()) as { document?: { nodes?: UnityNode[] } }
  return body.document?.nodes ?? []
}

function graphNode(page: Page, nodeId: string): Locator {
  return page.getByTestId('graph-editor').locator(`.react-flow__node[data-id="${nodeId}"]`)
}

/** Clic sur un nœud du canvas, puis attente de sa sélection. */
async function selectNode(page: Page, nodeId: string): Promise<void> {
  const node = graphNode(page, nodeId)
  await expect(node).toBeVisible({ timeout: E2E_MS.graphCanvas })
  await node.click()
  await expect(node).toHaveClass(/selected/, { timeout: E2E_MS.short })
}

/** Menu Actions → « Générer nœud » : ouvre `AIGenerationPanel` pour le nœud sélectionné. */
async function openAIGenerationPanel(page: Page): Promise<Locator> {
  const actions = page.getByTestId('graph-editor').getByTestId('btn-actions-dropdown')
  await expect(actions).toBeEnabled({ timeout: E2E_MS.graphCanvas })
  await actions.click()
  await page.getByRole('menuitem', { name: /Générer nœud/i }).click()
  const panel = page.getByTestId('ai-generation-panel')
  await expect(panel).toBeVisible({ timeout: E2E_MS.control })
  return panel
}

/** Inspecteur 2e : la vue lecture s'ouvre d'abord, « éditer » monte `NodeEditorPanel`. */
async function openNodeEditor(page: Page): Promise<Locator> {
  const inspector = page.getByTestId('graph-inspector')
  await inspector
    .getByTestId('graph-inspector-node-summary')
    .getByRole('button', { name: 'éditer' })
    .first()
    .click()
  await expect(inspector.locator('input[name="speaker"]')).toBeVisible({ timeout: E2E_MS.graphField })
  return inspector
}

/** Section « Génération IA » du formulaire de nœud, dépliée. */
async function expandEditorGeneration(inspector: Locator): Promise<void> {
  await inspector.getByRole('button', { name: 'Afficher', exact: true }).click()
  await expect(inspector.getByPlaceholder(/Décrivez ce que vous voulez générer/i)).toBeVisible({
    timeout: E2E_MS.control,
  })
}

test.describe('Graph Node Generation (Story 0.5.5)', () => {
  test.setTimeout(E2E_TEST_TIMEOUT_MS.graphHeavy)

  let fixtureId = ''
  let generateCalls: GenerateNodeCall[] = []

  test.beforeAll(async ({ request }) => {
    // Même garde que la suite @e2e-llm : `checkBudget` bloque la génération à 100 %,
    // même quand la réponse est simulée.
    const budgetRes = await request.get(`${API_BASE}/api/v1/costs/budget`)
    expect(budgetRes.ok(), 'Budget illisible (API). Voir docs/troubleshooting/e2e-llm.md.').toBe(true)
    const budget = (await budgetRes.json()) as { quota: number; percentage: number }
    if (budget.quota <= 0 || budget.percentage >= 100) {
      const putRes = await request.put(`${API_BASE}/api/v1/costs/budget`, { data: { quota: 50 } })
      expect(putRes.ok(), 'Budget épuisé et remise à 50 impossible.').toBe(true)
    }
  })

  test.beforeEach(async ({ page, request }, testInfo) => {
    fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    await seedDocumentWithRetry(request, API_BASE, fixtureId, FIXTURE_DOC)
    generateCalls = await mockGenerateNode(page)
    await loginIfNeeded(page)
    await openDashboardGraphTabAndSelectDocument(page, fixtureId)
    await expect(graphNode(page, ROOT_ID)).toBeVisible({ timeout: E2E_MS.graphCanvas })
    await expect(graphNode(page, LINEAR_ID)).toBeVisible({ timeout: E2E_MS.graphCanvas })
  })

  test.afterEach(async ({ request }) => {
    const res = await request.delete(`${API_BASE}/api/v1/documents/${encodeURIComponent(fixtureId)}`)
    if (!res.ok() && res.status() !== 404) {
      const text = await res.text().catch(() => '')
      throw new Error(`Cleanup DELETE failed ${res.status()}: ${text}`)
    }
  })

  test('AC#1: Génération pour choix spécifique depuis éditeur de graphe', async ({ page, request }) => {
    await selectNode(page, ROOT_ID)
    const panel = await openAIGenerationPanel(page)
    await panel.getByPlaceholder(/Décrivez ce que vous voulez générer/i).fill('Continue la conversation de manière naturelle')
    await panel.getByTestId('ai-gen-choice-0').click()
    const submit = panel.getByTestId('ai-generation-submit')
    await expect(submit).toHaveText(/^Générer :/)
    await expect(submit).toBeEnabled({ timeout: E2E_MS.control })
    await submit.click()

    await expect(page.getByText(/Nœud généré pour\s*:/)).toBeVisible({ timeout: E2E_MS.graphFlow })
    expect(generateCalls).toHaveLength(1)
    expect(generateCalls[0].parent_node_id).toBe(ROOT_ID)
    expect(generateCalls[0].target_choice_index).toBe(0)
    await expect(graphNode(page, 'node-e2e-gen-1')).toBeVisible({ timeout: E2E_MS.short })

    await triggerGraphSave(page)
    await expect
      .poll(async () => {
        const root = (await readPersistedNodes(request, fixtureId)).find((n) => n.id === ROOT_ID)
        return root?.choices?.map((c) => linkTarget(c.targetNode))
      }, { timeout: E2E_MS.savePut })
      .toEqual(['node-e2e-gen-1', null, LINEAR_ID])
  })

  test('AC#2: Génération depuis éditeur de dialogue (NodeEditorPanel)', async ({ page, request }) => {
    await selectNode(page, LINEAR_ID)
    const inspector = await openNodeEditor(page)
    await expandEditorGeneration(inspector)
    await inspector.getByPlaceholder(/Décrivez ce que vous voulez générer/i).fill('Génère la suite de ce dialogue')
    await inspector.getByRole('button', { name: 'Générer la suite (nextNode)', exact: true }).click()

    await expect(page.getByText('Nœud généré avec succès')).toBeVisible({ timeout: E2E_MS.graphFlow })
    expect(generateCalls).toHaveLength(1)
    expect(generateCalls[0].parent_node_id).toBe(LINEAR_ID)
    expect(generateCalls[0].target_choice_index ?? null).toBeNull()
    // Le nouveau nœud est sélectionné et centré (focusNode).
    await expect(graphNode(page, 'node-e2e-gen-1')).toHaveClass(/selected/, { timeout: E2E_MS.short })

    await triggerGraphSave(page)
    await expect
      .poll(async () => {
        const linear = (await readPersistedNodes(request, fixtureId)).find((n) => n.id === LINEAR_ID)
        return linkTarget(linear?.nextNode)
      }, { timeout: E2E_MS.savePut })
      .toBe('node-e2e-gen-1')
  })

  test('AC#3: Génération batch pour tous les choix', async ({ page, request }) => {
    await selectNode(page, ROOT_ID)
    const panel = await openAIGenerationPanel(page)
    await panel.getByPlaceholder(/Décrivez ce que vous voulez générer/i).fill('Continue pour tous les choix')
    await panel.getByRole('button', { name: /Générer la suite pour tous les choix/ }).click()
    const submit = panel.getByTestId('ai-generation-submit')
    await expect(submit).toHaveText(/Générer pour tous les choix \(2 nœuds\)/)
    await expect(submit).toBeEnabled({ timeout: E2E_MS.control })
    await submit.click()

    await expect(
      page.getByText(/1 choix\(s\) déjà connecté\(s\), 2 nouveau\(x\) nœud\(s\) généré\(s\)/)
    ).toBeVisible({ timeout: E2E_MS.graphFlow })
    expect(generateCalls).toHaveLength(1)
    expect(generateCalls[0].generate_all_choices).toBe(true)

    await triggerGraphSave(page)
    await expect
      .poll(async () => {
        const root = (await readPersistedNodes(request, fixtureId)).find((n) => n.id === ROOT_ID)
        return root?.choices?.map((c) => linkTarget(c.targetNode))
      }, { timeout: E2E_MS.savePut })
      .toEqual(['node-e2e-gen-1', 'node-e2e-gen-2', LINEAR_ID])
  })

  test('AC#5: Génération nextNode (navigation linéaire)', async ({ page, request }) => {
    await selectNode(page, LINEAR_ID)
    const panel = await openAIGenerationPanel(page)
    await panel.getByPlaceholder(/Décrivez ce que vous voulez générer/i).fill('Continue la conversation linéairement')
    await panel.getByRole('button', { name: 'Suite (nextNode)', exact: true }).click()
    // Nœud sans réponse : pas de sélection de choix, « Générer » tout court.
    await expect(panel.getByTestId('ai-gen-choice-0')).toHaveCount(0)
    const submit = panel.getByTestId('ai-generation-submit')
    await expect(submit).toHaveText('Générer')
    await expect(submit).toBeEnabled({ timeout: E2E_MS.control })
    await submit.click()

    await expect(page.getByText('Nœud généré avec succès')).toBeVisible({ timeout: E2E_MS.graphFlow })
    expect(generateCalls).toHaveLength(1)
    expect(generateCalls[0].parent_node_id).toBe(LINEAR_ID)
    await expect(graphNode(page, 'node-e2e-gen-1')).toBeVisible({ timeout: E2E_MS.short })

    await triggerGraphSave(page)
    await expect
      .poll(async () => {
        const linear = (await readPersistedNodes(request, fixtureId)).find((n) => n.id === LINEAR_ID)
        return linkTarget(linear?.nextNode)
      }, { timeout: E2E_MS.savePut })
      .toBe('node-e2e-gen-1')
  })

  test('AC#7: Validation que targetNode et nextNode pointent vers des nœuds existants', async ({ page, request }) => {
    // Une génération par type de lien : nextNode (formulaire) puis choix (panneau IA).
    await selectNode(page, LINEAR_ID)
    const inspector = await openNodeEditor(page)
    await expandEditorGeneration(inspector)
    await inspector.getByRole('button', { name: 'Générer la suite (nextNode)', exact: true }).click()
    await expect(page.getByText('Nœud généré avec succès')).toBeVisible({ timeout: E2E_MS.graphFlow })

    await selectNode(page, ROOT_ID)
    const panel = await openAIGenerationPanel(page)
    await panel.getByTestId('ai-gen-choice-1').click()
    await panel.getByTestId('ai-generation-submit').click()
    await expect(page.getByText(/Nœud généré pour\s*:/)).toBeVisible({ timeout: E2E_MS.graphFlow })
    expect(generateCalls).toHaveLength(2)

    // La sauvegarde relance la validation serveur (`persistenceSlice` → POST /graph/validate).
    const validateAfterSave = page.waitForResponse(
      (r) =>
        r.url().includes('/api/v1/unity-dialogues/graph/validate') &&
        r.request().method() === 'POST',
      { timeout: E2E_MS.savePut }
    )
    await triggerGraphSave(page)
    const validation = (await (await validateAfterSave).json()) as {
      errors: Array<{ type: string; node_id?: string; target?: string }>
      warnings: Array<{ type: string }>
    }
    expect(validation.errors.filter((e) => e.type === 'broken_reference')).toEqual([])

    // Le document écrit ne référence que des nœuds existants.
    await expect
      .poll(async () => {
        const nodes = await readPersistedNodes(request, fixtureId)
        const ids = new Set(nodes.map((n) => n.id))
        const refs = nodes
          .flatMap((n) => [n.nextNode, ...(n.choices ?? []).map((c) => c.targetNode)])
          .map(linkTarget)
          .filter((ref): ref is string => ref !== null)
        return {
          refs: refs.sort(),
          dangling: refs.filter((ref) => !ids.has(ref)),
        }
      }, { timeout: E2E_MS.savePut })
      .toEqual({
        refs: [LINEAR_ID, 'node-e2e-gen-1', 'node-e2e-gen-2'].sort(),
        dangling: [],
      })
  })

  test('AC#8: Filtrage des choix déjà connectés', async ({ page }) => {
    await selectNode(page, ROOT_ID)
    const panel = await openAIGenerationPanel(page)
    await panel.getByRole('button', { name: 'Branche alternative (choice)', exact: true }).click()

    // Seuls les choix libres sont sélectionnables (le test id n'existe que pour eux).
    await expect(panel.locator('[data-testid^="ai-gen-choice-"]')).toHaveCount(2)
    await expect(panel.getByTestId('ai-gen-choice-0')).toBeVisible()
    await expect(panel.getByTestId('ai-gen-choice-1')).toBeVisible()
    await expect(panel.getByTestId(`ai-gen-choice-${LINKED_CHOICE_INDEX}`)).toHaveCount(0)
    await expect(panel.getByText('(déjà connecté)')).toHaveCount(1)

    // Le lot annonce le nombre de choix non connectés.
    await expect(panel.getByRole('button', { name: /Générer la suite pour tous les choix/ })).toContainText(
      '2 choix'
    )
    // Rien de sélectionné : impossible de lancer une génération.
    await expect(panel.getByTestId('ai-generation-submit')).toBeDisabled()
    expect(generateCalls).toHaveLength(0)
  })

  test('Génération depuis ChoiceEditor dans NodeEditorPanel', async ({ page, request }) => {
    await selectNode(page, ROOT_ID)
    const inspector = await openNodeEditor(page)
    // « Générer » n'est proposé que sur les choix libres (#1, #2), pas sur le choix relié.
    const choiceGenerate = inspector.getByTitle('Générer la suite pour ce choix')
    await expect(choiceGenerate).toHaveCount(2)
    await choiceGenerate.first().click()

    await expect(page.getByText('Nœud généré avec succès')).toBeVisible({ timeout: E2E_MS.graphFlow })
    expect(generateCalls).toHaveLength(1)
    expect(generateCalls[0].parent_node_id).toBe(ROOT_ID)
    expect(generateCalls[0].target_choice_index).toBe(0)
    // Focus automatique : le nouveau nœud est sélectionné et l'inspecteur montre sa réplique.
    await expect(graphNode(page, 'node-e2e-gen-1')).toHaveClass(/selected/, { timeout: E2E_MS.short })
    await expect(page.getByTestId('graph-inspector')).toContainText(generatedLine(1))

    await triggerGraphSave(page)
    await expect
      .poll(async () => {
        const root = (await readPersistedNodes(request, fixtureId)).find((n) => n.id === ROOT_ID)
        return linkTarget(root?.choices?.[0]?.targetNode)
      }, { timeout: E2E_MS.savePut })
      .toBe('node-e2e-gen-1')
  })
})
