/**
 * Tests E2E pour accept/reject nodes (Story 1.4).
 *
 * - AC#1: Boutons Accept/Reject visibles au survol pour nœuds pending
 * - AC#2: Accept change le statut à "accepted" et sauvegarde
 * - AC#3: Reject supprime le nœud et affiche toast
 * - AC#5: Session recovery pour nœuds pending
 *
 * Prérequis:
 * - .env à la racine avec OPENAI_API_KEY (ou clé dans variables d’environnement Windows).
 * - Pour réduire les coûts en E2E : sélectionner gpt-5-nano dans le panneau de génération, ou mettre
 *   "default_model": "gpt-5-nano" dans app_config.json (gpt-5-nano est dans available_models).
 * Si la génération échoue ou n’ajoute aucun nœud (API, budget, "Aucun nœud généré", etc.), voir docs/troubleshooting/e2e-llm.md.
 */
import { test, expect, type Page } from '@playwright/test'

// 127.0.0.1 pour éviter résolution IPv6 (::1) qui peut donner ECONNREFUSED si l'API n'écoute qu'en IPv4
const API_BASE = 'http://127.0.0.1:4243'

test.describe('Graph Node Accept/Reject (Story 1.4) @e2e-llm', () => {
  test.setTimeout(360_000)
  test.describe.configure({ retries: 1 })

  test.afterEach(async () => {
    await new Promise((r) => setTimeout(r, 5000))
  })

  test.beforeAll(async ({ request }) => {
    let healthRes
    try {
      healthRes = await request.get(`${API_BASE}/health/detailed`)
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : String(err)
      throw new Error(
        `E2E LLM : l'API ne répond pas (${msg}). Lance le serveur avant les tests : \`npm run dev\` (ou dans un autre terminal : \`npm run start:api\` avec API_PORT=4243, puis \`cd frontend && npm run dev\`). Voir docs/troubleshooting/e2e-llm.md.`
      )
    }
    if (!healthRes.ok()) {
      throw new Error(
        'E2E LLM : API injoignable (health check). Vérifier que l\'API tourne sur 4243. Voir docs/troubleshooting/e2e-llm.md.'
      )
    }
    const health = (await healthRes.json()) as { checks?: Array<{ name: string; status: string }> }
    const llm = health.checks?.find((c) => c.name === 'llm_connectivity')
    if (!llm || llm.status !== 'healthy') {
      throw new Error(
        "E2E LLM : OPENAI_API_KEY manquante. Définir .env à la racine ou la variable d'environnement. Voir docs/troubleshooting/e2e-llm.md."
      )
    }
    const budgetRes = await request.get(`${API_BASE}/api/v1/costs/budget`)
    if (!budgetRes.ok()) {
      throw new Error(
        'E2E LLM : impossible de vérifier le budget. Voir docs/troubleshooting/e2e-llm.md.'
      )
    }
    const budget = (await budgetRes.json()) as { quota: number; percentage: number }
    if (budget.quota <= 0 || budget.percentage >= 100) {
      const putRes = await request.put(`${API_BASE}/api/v1/costs/budget`, {
        data: { quota: 50 },
      })
      if (!putRes.ok()) {
        throw new Error(
          'E2E LLM : impossible de mettre à jour le budget. Voir docs/troubleshooting/e2e-llm.md.'
        )
      }
    }
  })

  const login = async (page: Page) => {
    await page.goto('/login')
    await page.getByLabel(/nom d'utilisateur/i).fill('admin')
    await page.getByLabel(/mot de passe/i).fill('admin123')
    await page.getByRole('button', { name: /se connecter/i }).click()
    await expect(page).toHaveURL('/', { timeout: 10000 })
  }

  const DIALOGUE_NAMES =
    /Tunnel vertébral|Atelier du cartographe|Dans les plis|Rencontre avec le cartographe/i

  const ensureGraphWithDialogue = async (page: Page, dialogueTitleFilter?: string) => {
    await page.goto('/')
    const onLogin = await page.getByRole('heading', { name: 'Connexion' }).isVisible({ timeout: 2000 }).catch(() => false)
    if (onLogin) await login(page)
    const graphTab = page.getByRole('button', { name: /Éditeur de Graphe|📊/ }).first()
    await expect(graphTab).toBeVisible({ timeout: 15000 })
    await graphTab.click()
    await page.waitForTimeout(2500)
    const list = page.getByTestId('unity-dialogue-list')
    await expect(list).toBeVisible({ timeout: 60_000 })
    let dialogueSelector
    if (dialogueTitleFilter === 'Tunnel vertébral') {
      dialogueSelector = list.getByText(/tunnel_vertébral_pigments_impossibles\.json/).first()
    } else if (dialogueTitleFilter) {
      dialogueSelector = list.getByText(new RegExp(dialogueTitleFilter, 'i')).first()
    } else {
      dialogueSelector = list.getByText(DIALOGUE_NAMES).first()
    }
    await expect(dialogueSelector).toBeVisible({ timeout: 8000 })
    await dialogueSelector.click()
    await page.waitForTimeout(3000)
    const nodes = page.locator('.react-flow__node')
    await expect(nodes.first()).toBeVisible({ timeout: 15000 })
    return nodes
  }

  const generatePendingNode = async (page: Page) => {
    const countBefore = await page.locator('.react-flow__node').count()
    const firstNode = page.locator('.react-flow__node').first()
    await firstNode.hover()
    await page.waitForTimeout(400)
    const generateBtn = page.getByTitle(/Générer la suite avec l'IA/).first()
    await expect(generateBtn).toBeVisible({ timeout: 4000 })
    await generateBtn.click()
    await page.waitForTimeout(800)
    const textarea = page.getByPlaceholder(/Décrivez ce que vous voulez générer|instructions?/i)
    await expect(textarea).toBeVisible({ timeout: 5000 })
    const modelSelect = page.getByTestId('llm-model-select')
    await expect(modelSelect).toBeVisible({ timeout: 3000 })
    await modelSelect.selectOption({ value: 'gpt-5-nano' })
    await textarea.fill('Réponds brièvement pour ce test E2E.')
    // Mode "Suite" désactive Générer si le nœud a des choix → passer en "Branche" et sélectionner un choix.
    const branchBtn = page.getByRole('button', { name: 'Branche alternative (choice)' })
    if (await branchBtn.isVisible().catch(() => false)) {
      await branchBtn.click()
      await page.waitForTimeout(300)
      const firstChoice = page.getByTestId('ai-gen-choice-0')
      if (await firstChoice.isVisible().catch(() => false)) {
        await firstChoice.click()
        await page.waitForTimeout(200)
      }
    }
    const submitSingle = page.getByRole('button', { name: /^✨ Générer$|^✨ Générer pour choix \d+$/ })
    const submitBatch = page.getByRole('button', { name: /Générer pour tous les choix/ })
    const submit = (await submitSingle.count() > 0) ? submitSingle.first() : submitBatch.first()
    await expect(submit).toBeVisible({ timeout: 3000 })
    await expect(submit).toBeEnabled({ timeout: 2000 })
    await submit.click({ force: true })
    const successToast = page.getByText(/Nœud généré avec succès|Nœud généré pour le choix \d+|[1-9]\d* nouveau\(x\) nœud\(s\) généré\(s\)/)
    await expect(
      successToast,
      'Génération LLM : aucun toast de succès. Vérifier logs frontend/API, budget, modèle gpt-5-nano. Voir docs/troubleshooting/e2e-llm.md.'
    ).toBeVisible({ timeout: 360_000 })
    await page.waitForTimeout(3000)
    const countAfter = await page.locator('.react-flow__node').count()
    expect(
      countAfter,
      'Génération LLM : aucun nouveau nœud ajouté. Voir docs/troubleshooting/e2e-llm.md.'
    ).toBeGreaterThan(countBefore)
  }

  test('AC#1: accept/reject buttons visible on hover for pending nodes', async ({ page }) => {
    await ensureGraphWithDialogue(page, 'Tunnel vertébral')
    await generatePendingNode(page)
    const pendingNode = page.locator('.react-flow__node:has([data-status="pending"])').first()
    await expect(pendingNode).toBeVisible({ timeout: 5000 })
    await pendingNode.hover({ force: true })
    const accept = page.locator('button:has-text("Accepter")').first()
    const reject = page.locator('button:has-text("Rejeter")').first()
    await expect(accept).toBeVisible({ timeout: 2000 })
    await expect(reject).toBeVisible({ timeout: 2000 })
  })

  test('AC#2: accept node changes status to accepted', async ({ page }) => {
    await ensureGraphWithDialogue(page, 'Tunnel vertébral')
    await generatePendingNode(page)
    const pendingNode = page.locator('.react-flow__node:has([data-status="pending"])').first()
    await expect(pendingNode).toBeVisible({ timeout: 5000 })
    await pendingNode.hover({ force: true })
    const accept = page.locator('button:has-text("Accepter")').first()
    await expect(accept).toBeVisible({ timeout: 2000 })
    await accept.click()
    await page.waitForTimeout(800)
    await expect(accept).not.toBeVisible()
    const rejectAfter = page.locator('button:has-text("Rejeter")').first()
    await expect(rejectAfter).not.toBeVisible()
  })

  test('AC#3: reject node removes it and shows toast', async ({ page }) => {
    await ensureGraphWithDialogue(page, 'Tunnel vertébral')
    await generatePendingNode(page)
    const pendingNode = page.locator('.react-flow__node:has([data-status="pending"])').first()
    await expect(pendingNode).toBeVisible({ timeout: 5000 })
    const countBefore = await page.locator('.react-flow__node').count()
    await pendingNode.hover({ force: true })
    const reject = pendingNode.locator('button:has-text("Rejeter")')
    await expect(reject).toBeVisible({ timeout: 2000 })
    await reject.click()
    await expect(page.locator('text="Nœud rejeté"')).toBeVisible({ timeout: 4000 })
    await expect(page.locator('.react-flow__node:has([data-status="pending"])')).toHaveCount(0, { timeout: 5000 })
    await page.waitForTimeout(300)
    const countAfter = await page.locator('.react-flow__node').count()
    expect(countAfter).toBe(countBefore - 1)
  })

  test('AC#5: pending nodes restored after reload (session recovery)', async ({ page }) => {
    const fixedDialogue = 'Tunnel vertébral'
    await ensureGraphWithDialogue(page, fixedDialogue)
    await generatePendingNode(page)
    await expect(page.locator('.react-flow__node:has([data-status="pending"])').first()).toBeVisible({ timeout: 5000 })
    // Attendre que l'auto-save backend ait écrit (debounce ~1.2s) avant reload
    await page.waitForTimeout(5000)
    await page.reload()
    const onLoginAfter = await page.getByRole('heading', { name: 'Connexion' }).isVisible({ timeout: 2000 }).catch(() => false)
    if (onLoginAfter) await login(page)
    const graphTab = page.getByRole('button', { name: /Éditeur de Graphe|📊/ }).first()
    await expect(graphTab).toBeVisible({ timeout: 15000 })
    await graphTab.click()
    await page.waitForTimeout(2500)
    const list = page.getByTestId('unity-dialogue-list')
    await expect(list).toBeVisible({ timeout: 60_000 })
    const sameDialogue = list.getByText(/tunnel_vertébral_pigments_impossibles\.json/).first()
    await expect(sameDialogue).toBeVisible({ timeout: 8000 })
    await sameDialogue.click()
    await page.waitForTimeout(3000)
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 10000 })
    const node = page.locator('.react-flow__node:has([data-status="pending"])').first()
    await expect(
      node,
      'AC#5 : nœud pending introuvable après reload. Vérifier que l\'auto-save a bien persisté le graphe sur le backend.'
    ).toBeVisible({ timeout: 20_000 })
    await node.hover({ force: true })
    const accept = page.locator('button:has-text("Accepter")').first()
    await expect(accept).toBeVisible({ timeout: 3000 })
  })
})
