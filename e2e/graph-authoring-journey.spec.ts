/**
 * E2E : parcours d'écriture complet dans le graphe, sans LLM.
 *
 * Création d'un dialogue au titre accentué → 4 nœuds manuels → texte via l'inspecteur →
 * choix reliés → autosave (« ENREGISTRÉ ») → F5 → tout est relu → export Unity téléchargé.
 * Le second test couvre l'annulation (Ctrl+Z) d'une saisie de texte.
 */
import { test, expect, type APIRequestContext, type Locator, type Page, type TestInfo } from '@playwright/test'
import { readFile } from 'node:fs/promises'

import { titleToDocumentId } from '../frontend/src/utils/formatDialogueTitle'
import { openApp, openGraphSection, openNodeEditor } from './helpers'
import { E2E_MS, E2E_TEST_TIMEOUT_MS } from './timeouts'

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:4243'

interface StoreNode {
  id: string
  type?: string
  data: { line?: string; speaker?: string; choices?: Array<{ text?: string; targetNode?: string }> }
}

interface PersistedNode {
  id: string
  speaker?: string
  line?: string
  choices?: Array<{ text?: string; targetNode?: string }>
}

/** Sous-ensemble de `useGraphStore` exposé en dev sur `window.__graphStoreE2E`. */
interface GraphStoreE2E {
  getState: () => {
    nodes: StoreNode[]
    selectedNodeId: string | null
    documentId: string | null
    hasUnsavedChanges: boolean
  }
}

function uniqueTitle(testInfo: TestInfo): string {
  const suffix = testInfo.testId.replace(/[^a-zA-Z0-9]/g, '').slice(-8)
  return `Épreuve à l'Auberge ${testInfo.workerIndex}${suffix}`
}

async function deleteDocument(request: APIRequestContext, documentId: string): Promise<void> {
  const res = await request.delete(`${API_BASE}/api/v1/documents/${encodeURIComponent(documentId)}`)
  if (!res.ok() && res.status() !== 404) {
    throw new Error(`Cleanup DELETE failed ${res.status()}: ${await res.text().catch(() => '')}`)
  }
}

async function readPersistedDocument(
  request: APIRequestContext,
  documentId: string,
): Promise<{ title?: string; nodes: PersistedNode[] }> {
  const res = await request.get(`${API_BASE}/api/v1/documents/${encodeURIComponent(documentId)}`)
  if (!res.ok()) return { nodes: [] }
  const body = (await res.json()) as { document?: { title?: string; nodes?: PersistedNode[] } }
  return { title: body.document?.title, nodes: body.document?.nodes ?? [] }
}

/** Section « Graphe » → bouton « nouveau » → `window.prompt` rempli avec le titre. */
async function createDialogueFromGraphSection(page: Page, title: string): Promise<Locator> {
  await openApp(page)
  const graphEditor = await openGraphSection(page)
  const createButton = graphEditor.getByTestId('create-dialogue-button')
  await expect(createButton).toBeEnabled({ timeout: E2E_MS.dashboardList })
  page.once('dialog', (dialog) => void dialog.accept(title))
  await createButton.click()
  await expect(graphEditor.getByTestId('btn-actions-dropdown')).toBeEnabled({ timeout: E2E_MS.graphCanvas })
  return graphEditor
}

/** `pick` s'exécute dans la page : il ne doit rien capturer du scope du test. */
async function readStore<T>(page: Page, pick: (api: GraphStoreE2E) => T): Promise<T> {
  const store = await page.evaluateHandle(() => {
    const api = (globalThis as unknown as { __graphStoreE2E?: GraphStoreE2E }).__graphStoreE2E
    if (!api) throw new Error('window.__graphStoreE2E absent — Vite doit tourner en dev.')
    return api
  })
  try {
    return (await store.evaluate(pick)) as T
  } finally {
    await store.dispose()
  }
}

/** Actions → « Nouveau nœud » : l'inspecteur s'ouvre directement en édition sur le nœud créé. */
async function addManualNode(page: Page, graphEditor: Locator): Promise<{ id: string; inspector: Locator }> {
  await graphEditor.getByTestId('btn-actions-dropdown').click()
  await page.getByTestId('btn-new-manual-node').click()
  const inspector = page.getByTestId('graph-inspector')
  await expect(inspector.locator('input[name="speaker"]')).toBeVisible({ timeout: E2E_MS.graphField })
  const id = await readStore(page, (api) => api.getState().selectedNodeId)
  expect(id, 'le nœud créé doit être sélectionné').toBeTruthy()
  await expectNoInheritedChoices(page, inspector, id as string)
  return { id: id as string, inspector }
}

const INHERITED_CHOICES_WINDOW_MS = 1_000
const INHERITED_CHOICES_SAMPLE_MS = 100

/**
 * Un nœud neuf n'hérite d'aucun choix du nœud édité juste avant. La fuite arrive après le premier
 * rendu (~600 ms : push debouncé du formulaire précédent), donc une assertion auto-attendue sur
 * « Choix (0) » passerait avant elle : on échantillonne le store sur une fenêtre fixe.
 */
async function expectNoInheritedChoices(page: Page, inspector: Locator, nodeId: string): Promise<void> {
  const samples: string[][] = []
  for (let elapsed = 0; elapsed <= INHERITED_CHOICES_WINDOW_MS; elapsed += INHERITED_CHOICES_SAMPLE_MS) {
    const choices = await page.evaluate((id) => {
      const api = (globalThis as unknown as { __graphStoreE2E?: GraphStoreE2E }).__graphStoreE2E
      if (!api) throw new Error('window.__graphStoreE2E absent — Vite doit tourner en dev.')
      const node = api.getState().nodes.find((n) => n.id === id)
      return (node?.data.choices ?? []).map((c) => `${c.text ?? ''}>${c.targetNode}`)
    }, nodeId)
    samples.push(choices)
    await page.waitForTimeout(INHERITED_CHOICES_SAMPLE_MS)
  }
  expect(
    samples.filter((s) => s.length > 0),
    `le nœud neuf ${nodeId} ne doit recevoir aucun choix du nœud précédent`,
  ).toEqual([])
  await expect(inspector.getByText('Choix (0)', { exact: true })).toBeVisible()
}

async function writeNodeText(inspector: Locator, speaker: string, line: string): Promise<void> {
  await inspector.locator('input[name="speaker"]').fill(speaker)
  await inspector.locator('textarea[name="line"]').fill(line)
  await inspector.locator('textarea[name="line"]').press('Tab')
}

async function addChoiceTo(
  page: Page,
  inspector: Locator,
  choiceIndex: number,
  text: string,
  target: { id: string; line: string },
): Promise<void> {
  await inspector.getByRole('button', { name: '+ Ajouter un choix' }).click()
  const choiceText = inspector.getByPlaceholder('Texte du choix...').nth(choiceIndex)
  await choiceText.fill(text)
  await choiceText.press('Tab')
  await expect
    .poll(
      () =>
        readStore(page, (api) => {
          const st = api.getState()
          return (st.nodes.find((n) => n.id === st.selectedNodeId)?.data.choices ?? []).map((c) => c.text ?? '')
        }),
      { message: 'le choix ajouté doit être poussé dans le store avant de viser une cible' },
    )
    .toContain(text)
  const targetSelect = inspector.getByTestId(`choice-target-select-${choiceIndex}`)
  await targetSelect.click()
  const option = page.getByText(`${target.line} (${target.id})`, { exact: true })
  await expect(option).toHaveCount(1)
  // La liste (portail sur `document.body`) s'ouvre sous le bas de l'écran quand le choix est
  // en fin d'inspecteur : Playwright refuse alors le clic réel (« outside of the viewport »).
  await option.dispatchEvent('click')
  await expect(targetSelect).toContainText(target.line)
}

const LINES = {
  a: "Bienvenue à l'Auberge du Cerf, voyageur. Qu'est-ce qui t'amène ?",
  b: 'Une chambre pour la nuit ? Ça te coûtera trois pièces.',
  c: 'Des rumeurs ? On dit que la forêt chuchote après minuit.',
  d: 'Voici ta clé. Chambre au fond du couloir, à gauche.',
} as const

test.describe('Graphe — parcours d\'écriture complet', { tag: '@smoke' }, () => {
  test.setTimeout(E2E_TEST_TIMEOUT_MS.saveHeavy)

  let documentId: string | null = null

  test.afterEach(async ({ request }) => {
    if (documentId) await deleteDocument(request, documentId)
    documentId = null
  })

  test('titre accentué, 4 nœuds manuels, choix reliés, autosave, F5, export Unity', async ({
    page,
    request,
  }, testInfo) => {
    const title = uniqueTitle(testInfo)
    documentId = titleToDocumentId(title)
    await deleteDocument(request, documentId)

    const graphEditor = await createDialogueFromGraphSection(page, title)
    await expect.poll(() => readStore(page, (api) => api.getState().documentId)).toBe(documentId)

    // Cibles d'abord : un choix ne peut viser qu'un nœud déjà présent dans le graphe.
    const d = await addManualNode(page, graphEditor)
    await writeNodeText(d.inspector, 'Aubergiste', LINES.d)
    const c = await addManualNode(page, graphEditor)
    await writeNodeText(c.inspector, 'Aubergiste', LINES.c)
    const b = await addManualNode(page, graphEditor)
    await writeNodeText(b.inspector, 'Aubergiste', LINES.b)
    await addChoiceTo(page, b.inspector, 0, 'Je paie.', { id: d.id, line: LINES.d })
    const a = await addManualNode(page, graphEditor)
    await writeNodeText(a.inspector, 'Aubergiste', LINES.a)
    await addChoiceTo(page, a.inspector, 0, 'Une chambre.', { id: b.id, line: LINES.b })
    await addChoiceTo(page, a.inspector, 1, 'Des nouvelles ?', { id: c.id, line: LINES.c })

    await graphEditor.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } })

    const expectedLinks = [
      [LINES.a, LINES.b],
      [LINES.a, LINES.c],
      [LINES.b, LINES.d],
    ].map(([from, to]) => `${from} → ${to}`)

    const linksByLine = (nodes: PersistedNode[]): string[] => {
      const lineOf = new Map(nodes.map((n) => [n.id, n.line ?? '']))
      return nodes
        .flatMap((n) => (n.choices ?? []).map((ch) => `${n.line} → ${lineOf.get(ch.targetNode ?? '') ?? ch.targetNode}`))
        .sort()
    }

    await expect
      .poll(
        async () => {
          const persisted = await readPersistedDocument(request, documentId as string)
          return {
            lines: persisted.nodes.map((n) => n.line).sort(),
            links: linksByLine(persisted.nodes),
          }
        },
        { timeout: E2E_MS.savePut, message: 'autosave : le document disque doit contenir nœuds, textes et liens' },
      )
      .toEqual({ lines: Object.values(LINES).sort(), links: expectedLinks.sort() })

    // Pas l'indicateur visuel : à 1280 px la barre passe en mode étroit et n'affiche pas le libellé mono.
    await expect
      .poll(() => readStore(page, (api) => api.getState().hasUnsavedChanges), { timeout: E2E_MS.savePut })
      .toBe(false)
    const persistedBeforeReload = await readPersistedDocument(request, documentId)
    expect(persistedBeforeReload.title).toBe(title)

    await page.reload()
    const reloadedEditor = await openGraphSection(page)
    if ((await readStore(page, (api) => api.getState().documentId)) !== documentId) {
      const list = reloadedEditor.getByTestId('unity-dialogue-list')
      await list.getByPlaceholder(/chercher/i).fill(documentId)
      await list.getByTestId('unity-dialogue-item').first().click()
    }
    await expect.poll(() => readStore(page, (api) => api.getState().documentId)).toBe(documentId)
    await expect
      .poll(
        async () => {
          const nodes = await readStore(page, (api) =>
            api.getState().nodes.filter((n) => n.type === 'dialogueNode'),
          )
          const asPersisted = nodes.map((n) => ({ id: n.id, line: n.data.line, choices: n.data.choices }))
          return { lines: asPersisted.map((n) => n.line).sort(), links: linksByLine(asPersisted) }
        },
        { timeout: E2E_MS.graphFirstNode },
      )
      .toEqual({ lines: Object.values(LINES).sort(), links: expectedLinks.sort() })
    await expect(reloadedEditor.locator('.react-flow__node').filter({ hasText: 'Chambre au fond' })).toBeVisible({
      timeout: E2E_MS.graphCanvas,
    })
    await expect(reloadedEditor.locator('.react-flow__edge')).toHaveCount(3, { timeout: E2E_MS.graphCanvas })

    await reloadedEditor.getByTestId('btn-actions-dropdown').click()
    await page.getByTestId('btn-export-unity').click()
    const banner = page.getByTestId('export-download-banner')
    await expect(banner).toBeVisible({ timeout: E2E_MS.graphField })
    const downloadPromise = page.waitForEvent('download', { timeout: E2E_MS.graphField })
    await banner.getByTestId('export-download-button').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.json$/)
    const downloadedPath = await download.path()
    const exported = JSON.parse(await readFile(downloadedPath, 'utf-8')) as { nodes?: PersistedNode[] }
    expect(Array.isArray(exported.nodes)).toBe(true)
    expect(exported.nodes!.map((n) => n.line).sort()).toEqual(Object.values(LINES).sort())
    expect(linksByLine(exported.nodes!)).toEqual(expectedLinks.sort())
  })

  test('Ctrl+Z après une saisie de texte restaure le texte précédent', async ({ page, request }, testInfo) => {
    const title = `${uniqueTitle(testInfo)} annulation`
    documentId = titleToDocumentId(title)
    await deleteDocument(request, documentId)

    const graphEditor = await createDialogueFromGraphSection(page, title)
    const node = await addManualNode(page, graphEditor)
    await writeNodeText(node.inspector, 'Aubergiste', 'Texte initial')
    await expect
      .poll(() => readStore(page, (api) => api.getState().hasUnsavedChanges), { timeout: E2E_MS.savePut })
      .toBe(false)

    const lineField = node.inspector.locator('textarea[name="line"]')
    await lineField.fill('Texte réécrit')
    await lineField.press('Tab')
    const lineInStore = (): Promise<string | undefined> =>
      readStore(page, (api) => {
        const st = api.getState()
        return st.nodes.find((n) => n.id === st.selectedNodeId)?.data.line
      })
    await expect.poll(lineInStore).toBe('Texte réécrit')

    // Hors champ de saisie : c'est l'annulation du graphe qui est visée, pas celle du navigateur.
    await page.locator('body').press('Control+z')

    await expect.poll(lineInStore).toBe('Texte initial')
    await expect(lineField).toHaveValue('Texte initial')
  })
})
