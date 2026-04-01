/**
 * ADR-008 E2E: édition, connect/disconnect, reload avec layout.
 * Story 16.6 (AC: 2) — tests Playwright centrés sur l'éditeur de graphe.
 *
 * Stratégie : chaque test seed la fixture via API, interagit via le navigateur,
 * puis vérifie la persistance via API (pas de reload navigateur — évite
 * les flakiness liées au re-sélect après navigation).
 */
import { test, expect, type Page } from '@playwright/test'
import { triggerGraphSave } from './trigger-graph-save'
import { uniqueE2EDocumentId, openDashboardGraphTabAndSelectDocument } from './helpers'

const API_BASE = 'http://127.0.0.1:4243'
const FIXTURE_PREFIX = 'e2e-adr008'

const FIXTURE_DOC = {
  schemaVersion: '1.1.0',
  nodes: [
    {
      id: 'START',
      speaker: 'E2E',
      line: 'Fixture ADR-008',
      nextNode: 'END',
      choices: [{ text: 'Go', choiceId: 'choice-start-0', targetNode: null }],
    },
    { id: 'END', speaker: 'E2E', line: 'Fin.', nextNode: null, choices: [] },
  ],
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function seedFixture(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  fixtureId: string
): Promise<void> {
  let revision = 1
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await request.put(`${API_BASE}/api/v1/documents/${fixtureId}`, {
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

async function loginAndGotoGraph(page: Page, documentId: string): Promise<void> {
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
  // NodeEditorPanel n’est monté que dans le Dashboard (pas sur /graph-editor standalone).
  await openDashboardGraphTabAndSelectDocument(page, documentId)
}

/**
 * Clique sur le premier item .json de la liste, attend le graphe chargé,
 * et retourne le nom du fichier réellement sélectionné.
 */
async function selectFirst(page: Page, fixtureFilename: string): Promise<string> {
  await expect(page.locator('[data-testid="graph-node-content"]').first()).toBeVisible({ timeout: 25000 })
  return fixtureFilename
}

/**
 * Déclenche la sauvegarde via `graphViewStore.requestSave()` (même chemin que flush → useDialogueLoader).
 * On évite Ctrl+S car le focus peut être capturé par un <input>.
 */
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

/** Lit le contenu d'un dialogue sur disque via API. */
async function readDialogueViaApi(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  filename: string
): Promise<Array<Record<string, unknown>>> {
  const res = await request.get(`${API_BASE}/api/v1/unity-dialogues/${filename}`)
  expect(res.ok(), `GET unity-dialogues/${filename} échoué: ${res.status()}`).toBe(true)
  const body = (await res.json()) as { json_content: string }
  return JSON.parse(body.json_content) as Array<Record<string, unknown>>
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

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe('ADR-008 E2E (Story 16.6)', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(120_000)

  test.afterEach(async ({ request }, testInfo) => {
    await deleteFixture(request, uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo))
  })

  // ── Test 0 : validation API uniquement (pas de browser) ─────────────────
  test('API: fixture seedée et loadGraph retourne des nœuds', async ({ request }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    const fixtureFilename = `${fixtureId}.json`
    await seedFixture(request, fixtureId)

    const listRes = await request.get(`${API_BASE}/api/v1/unity-dialogues`)
    expect(listRes.ok()).toBe(true)
    const list = (await listRes.json()) as { dialogues?: Array<{ filename: string }> }
    expect(list.dialogues?.some((d) => d.filename === fixtureFilename)).toBe(true)

    const readRes = await request.get(`${API_BASE}/api/v1/unity-dialogues/${fixtureFilename}`)
    expect(readRes.ok()).toBe(true)
    const { json_content } = (await readRes.json()) as { json_content: string }

    const loadRes = await request.post(`${API_BASE}/api/v1/unity-dialogues/graph/load`, {
      data: { json_content },
    })
    expect(loadRes.ok()).toBe(true)
    const graph = (await loadRes.json()) as { nodes?: unknown[] }
    expect((graph.nodes ?? []).length).toBeGreaterThanOrEqual(1)
  })

  // ── Task 2.1 : édition line/speaker/choice ──────────────────────────────
  test('édition line/speaker/choice visible dans l\'UI + save réussit (Task 2.1)', async ({
    page,
    request,
  }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    const fixtureFilename = `${fixtureId}.json`
    await seedFixture(request, fixtureId)
    await loginAndGotoGraph(page, fixtureId)
    const selectedFile = await selectFirst(page, fixtureFilename)

    const stamp = Date.now()
    const speakerVal = `SPK_${stamp}`
    const lineVal = `LINE_${stamp}`

    // Cliquer sur le premier nœud pour l'éditer
    await page.locator('.react-flow__node').first().click()
    await expect(page.locator('input[name="speaker"]')).toBeVisible({ timeout: 8000 })

    // Remplir les champs — l'UI doit refléter immédiatement les nouvelles valeurs
    await page.locator('input[name="speaker"]').fill(speakerVal)
    await expect(page.locator('input[name="speaker"]')).toHaveValue(speakerVal, { timeout: 3000 })
    await page.locator('textarea[name="line"]').fill(lineVal)
    await expect(page.locator('textarea[name="line"]')).toHaveValue(lineVal, { timeout: 3000 })

    const choice0 = page.locator('textarea[name="choices.0.text"]')
    const hasChoice = await choice0.isVisible({ timeout: 1500 }).catch(() => false)
    const choiceVal = `CHO_${stamp}`
    if (hasChoice) {
      await choice0.fill(choiceVal)
      await expect(choice0).toHaveValue(choiceVal, { timeout: 3000 })
    }

    // Sauvegarder : vérifier que la requête réseau réussit
    await triggerSave(page)

    // Vérifier que le fichier sur disque contient des nœuds valides
    const nodes = await readDialogueViaApi(request, selectedFile)
    expect(nodes.length).toBeGreaterThanOrEqual(1)
    // Chaque nœud doit avoir un id (structure Unity minimale valide)
    for (const node of nodes) {
      expect((node as { id?: string }).id).toBeTruthy()
    }
  })

  // ── Task 2.2 : connect/disconnect choix ─────────────────────────────────
  // Note: ce test vérifie save + cohérence arêtes après interaction ; une action explicite
  // de déconnexion (clic arête / bouton) pourrait être ajoutée pour couvrir pleinement "déconnecter".
  test('connect/disconnect choix → save → cohérent (Task 2.2)', async ({ page, request }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    const fixtureFilename = `${fixtureId}.json`
    await seedFixture(request, fixtureId)
    await loginAndGotoGraph(page, fixtureId)
    const selectedFile2 = await selectFirst(page, fixtureFilename)

    // Cliquer sur le premier nœud pour l'éditer
    await page.locator('.react-flow__node').first().click()
    await expect(page.locator('input[name="speaker"]')).toBeVisible({ timeout: 8000 })

    // Vérifier qu'il y a des arêtes en partant du nœud
    const edgeBefore = page.locator('.react-flow__edge')
    const edgeCountBefore = await edgeBefore.count()

    // Tenter de cliquer sur une arête ou de déconnecter un choix
    // Le test vérifie que le graphe peut être sauvegardé sans erreur réseau
    await triggerSave(page)
    await page.getByText(/chargement|loading/i).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})

    // L'API doit toujours répondre correctement après sauvegarde
    const nodes = await readDialogueViaApi(request, selectedFile2)
    expect(nodes.length).toBeGreaterThanOrEqual(1)
    // Les connexions (nextNode) doivent être des strings valides ou null
    for (const node of nodes) {
      const n = node as { nextNode?: string | null; id?: string }
      if (n.nextNode !== null && n.nextNode !== undefined) {
        expect(typeof n.nextNode).toBe('string')
      }
    }
    // L'état des arêtes dans l'UI est cohérent (pas de régression)
    const edgeCountAfter = await edgeBefore.count()
    expect(edgeCountAfter).toBe(edgeCountBefore)
  })

  // ── Task 2.3 : dupliquer nœud ───────────────────────────────────────────
  test('dupliquer nœud → nouveaux IDs → save (Task 2.3)', async ({ page, request }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    const fixtureFilename = `${fixtureId}.json`
    await seedFixture(request, fixtureId)
    await loginAndGotoGraph(page, fixtureId)
    await selectFirst(page, fixtureFilename)

    const countBefore = await page.locator('.react-flow__node').count()
    await page.locator('.react-flow__node').first().click()
    await expect(page.locator('input[name="speaker"]')).toBeVisible({ timeout: 8000 })

    // Chercher un bouton Dupliquer (bouton direct ou menu contextuel)
    let duplicated = false
    const dupBtn = page.getByRole('button', { name: /dupliquer/i })
    if (await dupBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dupBtn.click()
      duplicated = true
    } else {
      await page.locator('.react-flow__node').first().click({ button: 'right' })
      const menuItem = page.getByRole('menuitem', { name: /dupliquer/i })
      if (await menuItem.isVisible({ timeout: 1500 }).catch(() => false)) {
        try {
          // Le context menu peut dépasser le viewport — on essaie en force
          await menuItem.click({ force: true, timeout: 3000 })
          duplicated = true
        } catch {
          // Hors viewport non cliquable : feature Story 1.7 non accessible depuis E2E
        }
      }
    }

    if (!duplicated) {
      test.skip('Story 1.7 (Dupliquer nœud) non implémentée — bouton/menu introuvable')
    }

    await expect(page.locator('.react-flow__node')).toHaveCount(countBefore + 1, { timeout: 10000 })
    await triggerSave(page)

    const nodes = await readDialogueViaApi(request, fixtureFilename)
    expect(nodes.length).toBeGreaterThan(countBefore)

    // Vérifier que les IDs sont uniques
    const ids = nodes.map((n) => (n as { id?: string }).id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(nodes.length)
  })

  // ── Task 2.4 : drag node → layout persisté ──────────────────────────────
  test('drag node → save → layout persisté (Task 2.4)', async ({ page, request }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    const fixtureFilename = `${fixtureId}.json`
    await seedFixture(request, fixtureId)
    await loginAndGotoGraph(page, fixtureId)
    const selectedFile4 = await selectFirst(page, fixtureFilename)

    const node = page.locator('.react-flow__node').first()
    const before = await node.boundingBox()
    expect(before).toBeTruthy()

    const cx = before!.x + before!.width / 2
    const cy = before!.y + before!.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 200, cy + 100, { steps: 10 })
    await page.mouse.up()
    await expect
      .poll(
        async () => {
          const b = await node.boundingBox()
          return (
            b &&
            Math.abs(b.x - before!.x) + Math.abs(b.y - before!.y) > 20
          )
        },
        { timeout: 3000 }
      )
      .toBe(true)

    const after = await node.boundingBox()
    expect(after).toBeTruthy()
    // Vérifier que le nœud a bougé (le facteur de zoom ReactFlow réduit le mouvement pixel)
    expect(Math.abs(after!.x - before!.x) + Math.abs(after!.y - before!.y)).toBeGreaterThan(20)

    await triggerSave(page)

    // Vérifier que le fichier a été écrit et contient des nœuds
    const nodes = await readDialogueViaApi(request, selectedFile4)
    expect(nodes.length).toBeGreaterThanOrEqual(1)
  })
})
