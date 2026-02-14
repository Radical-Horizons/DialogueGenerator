/**
 * ADR-008 E2E: édition, connect/disconnect, reload avec layout.
 * Story 16.6 (AC: 2) — tests Playwright centrés sur l'éditeur de graphe.
 */
import { test, expect, type Page } from '@playwright/test'

async function login(page: Page): Promise<void> {
  await page.goto('/')
  const onLogin = await page
    .getByRole('heading', { name: /connexion/i })
    .isVisible({ timeout: 3000 })
    .catch(() => false)
  if (!onLogin) return
  await page.getByLabel(/nom d'utilisateur/i).fill('admin')
  await page.getByLabel(/mot de passe/i).fill('admin123')
  await page.getByRole('button', { name: /se connecter/i }).click()
  await expect(page).toHaveURL(/\//, { timeout: 10000 })
}

async function gotoGraphEditor(page: Page): Promise<void> {
  // Tabs variant: "Éditeur de Graphe" ou "Graphe"
  const graphTab = page
    .getByRole('button', { name: /Éditeur de Graphe|éditeur de graphe|graphe|📊/i })
    .first()
  await expect(graphTab).toBeVisible({ timeout: 15000 })
  await graphTab.click()
  await expect(page.getByTestId('unity-dialogue-list')).toBeVisible({ timeout: 15000 })
}

async function selectDialogueByFilename(page: Page, filename: string): Promise<void> {
  const list = page.getByTestId('unity-dialogue-list')
  await expect(list).toBeVisible({ timeout: 15000 })

  // Utiliser la recherche pour stabiliser la sélection.
  const search = page.getByPlaceholder(/rechercher un dialogue/i)
  await expect(search).toBeVisible({ timeout: 5000 })
  await search.fill(filename)

  const item = list.locator('div').filter({ hasText: filename }).first()
  await expect(item).toBeVisible({ timeout: 8000 })
  await item.click()

  // ⚠️ Important: "toBeHidden" sur "Chargement du graphe" est un faux-positif si l'élément n'existe pas.
  // Signal fiable: apparition de nodes ReactFlow ET d'au moins un champ du panneau Détails.
  const placeholder = page.getByText(/Sélectionnez un dialogue Unity/i)
  const nodes = page.locator('.react-flow__node')
  const speakerInput = page.locator('input[name="speaker"]')

  // Si on a cliqué sur l'item déjà sélectionné, l'UI toggle la sélection à null → placeholder visible.
  // Dans ce cas, re-cliquer pour re-sélectionner.
  if (await placeholder.isVisible({ timeout: 1500 }).catch(() => false)) {
    await item.click()
  }

  await expect(nodes.first()).toBeVisible({ timeout: 30000 })
  await expect(speakerInput).toBeVisible({ timeout: 30000 })
}

async function selectFirstDialogue(page: Page): Promise<string> {
  const list = page.getByTestId('unity-dialogue-list')
  await expect(list).toBeVisible({ timeout: 15000 })
  const firstItem = list.locator('div').filter({ hasText: /\.json/i }).first()
  await expect(firstItem).toBeVisible({ timeout: 8000 })
  const text = await firstItem.innerText()
  const m = text.match(/[^\s]+\.json/i)
  if (!m) {
    throw new Error(`Impossible d'extraire le filename .json depuis: ${JSON.stringify(text)}`)
  }
  const filename = m[0]
  await firstItem.click()
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 30000 })
  await expect(page.locator('input[name="speaker"]')).toBeVisible({ timeout: 30000 })
  return filename
}

async function saveAndWait(page: Page): Promise<void> {
  // Le projet peut sauvegarder soit via:
  // - POST /api/v1/unity-dialogues/graph/save(-and-write) (mode "graph")
  // - PUT /api/v1/documents/{id} + PUT /api/v1/documents/{id}/layout (mode document SoT)
  const isGraphSave = (url: string) => url.includes('/api/v1/unity-dialogues/graph/save')
  const isPutDocument = (url: string) => /\/api\/v1\/documents\/[^/]+$/.test(url)
  const isPutLayout = (url: string) => /\/api\/v1\/documents\/[^/]+\/layout$/.test(url)

  // Autosave ADR-006: attendre qu'une sauvegarde parte et revienne OK.
  // On garde aussi la possibilité de forcer via clic sur "Sauvegarder" si besoin.
  // 1) Confirmer qu'une requête de sauvegarde PART.
  const waitSaveRequest = page.waitForRequest(
    (req) => {
      const url = req.url()
      if (isGraphSave(url)) return true
      if (req.method() !== 'PUT') return false
      return isPutDocument(url) || isPutLayout(url)
    },
    { timeout: 15000 }
  )

  // Déclencheur principal: Ctrl+S (GraphEditor) → force handleSave même si le formulaire est invalide.
  await page.keyboard.press('Control+S')

  // Fallback: cliquer le bouton "Sauvegarder" s'il est présent.
  const saveBtn = page.getByRole('button', { name: /sauvegarder/i })
  if (await saveBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await saveBtn.click()
  }

  const req = await waitSaveRequest

  // 2) Confirmer qu'une réponse ARRIVE (même si 4xx/5xx). Si ça timeoute, c'est un hang serveur/proxy.
  const resp = await Promise.race([
    req.response(),
    page.waitForTimeout(60000).then(() => null),
  ])

  if (resp == null) {
    throw new Error(
      `Save request sent (${req.method()} ${req.url()}) but no response within 60s. ` +
        `This suggests a hanging backend/proxy or a stalled request.`
    )
  }

  if (!resp.ok()) {
    const body = await resp.text().catch(() => '<unreadable body>')
    throw new Error(
      `Save failed: ${resp.status()} ${resp.statusText()} (${resp.url()})\n` +
        `Response body:\n${body}`
    )
  }
}

async function waitForAutoSave(page: Page): Promise<void> {
  // L'autosave doit envoyer une requête (POST save-and-write ou PUT documents/layout).
  // Si rien ne part, c'est un problème runtime (autosave inactif) — on veut un signal clair.
  await saveAndWait(page)
}

test.describe('ADR-008 E2E (Story 16.6)', () => {
  test.setTimeout(90_000)

  test('édition line/speaker/choice → save → reload: pas de perte (Task 2.1)', async ({ page }) => {
    await login(page)
    await gotoGraphEditor(page)
    const filename = await selectFirstDialogue(page)

    const stamp = Date.now()
    const speakerValue = `E2E_SPEAKER_${stamp}`
    const lineValue = `E2E_LINE_${stamp}`
    const choiceValue = `E2E_CHOICE_${stamp}`

    await expect(page.locator('input[name="speaker"]')).toBeVisible({ timeout: 8000 })
    await page.locator('input[name="speaker"]').fill(speakerValue)
    await page.locator('textarea[name="line"]').fill(lineValue)

    const choice0 = page.locator('textarea[name="choices.0.text"]')
    const hasChoice0 = await choice0.isVisible({ timeout: 2000 }).catch(() => false)
    if (hasChoice0) {
      await choice0.fill(choiceValue)
    }

    // Autosave ADR-006: attendre qu'une sauvegarde réseau se produise.
    await waitForAutoSave(page)

    await page.reload()
    await login(page)
    await gotoGraphEditor(page)
    await selectDialogueByFilename(page, filename)

    await expect(page.locator('input[name="speaker"]')).toHaveValue(speakerValue, { timeout: 15000 })
    await expect(page.locator('textarea[name="line"]')).toHaveValue(lineValue, { timeout: 15000 })
    if (hasChoice0) {
      await expect(page.locator('textarea[name="choices.0.text"]')).toHaveValue(choiceValue, { timeout: 15000 })
    }
  })

  test('connect/disconnect choix → save → reload cohérent (Task 2.2)', async ({ page }) => {
    await login(page)
    await gotoGraphEditor(page)
    const filename = await selectFirstDialogue(page)

    // Trouver un choix non connecté (bouton ChoiceEditor "➕ Nouveau nœud" avec title explicite)
    const newNodeBtn = page.getByTitle(/Créer un nœud vide et le lier à ce choix/i).first()
    const canCreate = await newNodeBtn.isVisible({ timeout: 5000 }).catch(() => false)
    if (!canCreate) {
      test.skip('Aucun choix non connecté (bouton "➕ Nouveau nœud") visible')
    }

    // Marquer le texte du choix #1 pour pouvoir cliquer le label edge ensuite
    const label = `E2E_EDGE_${Date.now()}`
    const choice0 = page.locator('textarea[name="choices.0.text"]')
    if (await choice0.isVisible({ timeout: 2000 }).catch(() => false)) {
      await choice0.fill(label)
    }
    // Attendre la propagation debounce (NodeEditorPanel → store → projection)
    await page.waitForTimeout(200)

    await newNodeBtn.click()
    // Le clic sélectionne le nouveau nœud; on valide la connexion via présence du label edge sur le canvas.
    await expect(page.getByText(label).first()).toBeVisible({ timeout: 20000 })

    // Déconnecter: cliquer le label de l'edge puis Delete → ReactFlow onEdgesChange(remove)
    // L'edge est rendu comme un <button> "Edge from ...", plus stable que chercher le texte SVG.
    const edgeBtn = page.getByRole('button', { name: /Edge from/i }).first()
    await expect(edgeBtn).toBeVisible({ timeout: 20000 })
    await edgeBtn.click()
    await page.keyboard.press('Delete')

    await expect(page.getByText(label).first()).toHaveCount(0, { timeout: 20000 })

    await waitForAutoSave(page)

    await page.reload()
    await login(page)
    await gotoGraphEditor(page)
    await selectDialogueByFilename(page, filename)
    await expect(page.getByText(label).first()).toHaveCount(0, { timeout: 20000 })
  })

  test('drag node → save → reload: layout restauré (Task 2.4)', async ({ page }) => {
    await login(page)
    await gotoGraphEditor(page)
    const filename = await selectFirstDialogue(page)

    const selectedNode = page.locator('.react-flow__node.selected').first()
    const fallbackNode = page.locator('.react-flow__node').first()
    const node = (await selectedNode.isVisible({ timeout: 1000 }).catch(() => false)) ? selectedNode : fallbackNode
    await expect(node).toBeVisible({ timeout: 15000 })
    await node.click()

    const before = await node.boundingBox()
    expect(before).toBeTruthy()

    // Drag significatif (évite flakiness d'arrondi)
    const x = (before!.x + before!.width / 2)
    const y = (before!.y + before!.height / 2)
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 120, y + 80)
    await page.mouse.up()

    await waitForAutoSave(page)

    await page.reload()
    await login(page)
    await gotoGraphEditor(page)
    await selectDialogueByFilename(page, filename)

    const nodeAfter = page.locator('.react-flow__node.selected').first().or(page.locator('.react-flow__node').first())
    await expect(nodeAfter).toBeVisible({ timeout: 15000 })
    const after = await nodeAfter.boundingBox()
    expect(after).toBeTruthy()

    // Le nœud doit avoir bougé (seuil large pour éviter le bruit)
    expect(Math.abs(after!.x - before!.x)).toBeGreaterThan(20)
    expect(Math.abs(after!.y - before!.y)).toBeGreaterThan(20)
  })
})

