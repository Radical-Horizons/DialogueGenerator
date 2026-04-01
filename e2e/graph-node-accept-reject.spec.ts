/**
 * Tests E2E pour accept/reject nodes (Story 1.4).
 *
 * - AC#1: Boutons Accept/Reject visibles au survol pour nœuds pending
 * - AC#2: Accept change le statut à "accepted" et sauvegarde
 * - AC#3: Reject supprime le nœud et affiche toast
 * - AC#5: Session recovery pour nœuds pending
 *
 * Environnement E2E complet : OPENAI_API_KEY (.env ou variables d'environnement), budget utilisable,
 * modèle gpt-5-mini (panneau ou app_config.json). En cas d'échec : docs/troubleshooting/e2e-llm.md.
 */
import { test, expect, type Page } from '@playwright/test'
import { promises as fs } from 'node:fs'
import { resolve } from 'node:path'

// 127.0.0.1 pour éviter résolution IPv6 (::1) qui peut donner ECONNREFUSED si l'API n'écoute qu'en IPv4
const API_BASE = 'http://127.0.0.1:4243'
const SOURCE_FIXTURE_FILENAME = 'Dialogue_Unity.json'
const UNITY_DIALOGUES_DIR = resolve(process.cwd(), 'Assets', 'Dialogue')

test.describe('Graph Node Accept/Reject (Story 1.4) @e2e-llm', () => {
  test.setTimeout(360_000)
  test.describe.configure({ retries: 1 })
  test.describe.configure({ mode: 'serial' })

  let currentFixtureFilename: string | null = null

  test.afterEach(async () => {
    if (currentFixtureFilename) {
      await fs.rm(resolve(UNITY_DIALOGUES_DIR, currentFixtureFilename), { force: true }).catch(() => {})
      currentFixtureFilename = null
    }
    await new Promise((r) => setTimeout(r, 2000))
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
      test.skip(
        true,
        `E2E LLM : l'API ne répond pas (${msg}). Lance \`npm run dev\` ou \`npm run start:api\` (API_PORT=4243). Voir docs/troubleshooting/e2e-llm.md.`
      )
      return
    }
    if (!healthRes.ok()) {
      test.skip(
        true,
        "E2E LLM : API injoignable (health). Voir docs/troubleshooting/e2e-llm.md."
      )
      return
    }
    const health = (await healthRes.json()) as { checks?: Array<{ name: string; status: string }> }
    const llm = health.checks?.find((c) => c.name === 'llm_connectivity')
    if (!llm || llm.status !== 'healthy') {
      test.skip(
        true,
        "E2E LLM : OPENAI_API_KEY absente ou LLM non joignable — suite @e2e-llm ignorée. Voir docs/troubleshooting/e2e-llm.md."
      )
      return
    }
    const budgetRes = await request.get(`${API_BASE}/api/v1/costs/budget`)
    if (!budgetRes.ok()) {
      test.skip(
        true,
        'E2E LLM : impossible de lire le budget (API). Voir docs/troubleshooting/e2e-llm.md.'
      )
      return
    }
    const budget = (await budgetRes.json()) as { quota: number; percentage: number }
    if (budget.quota <= 0 || budget.percentage >= 100) {
      const putRes = await request.put(`${API_BASE}/api/v1/costs/budget`, {
        data: { quota: 50 },
      })
      if (!putRes.ok()) {
        test.skip(
          true,
          'E2E LLM : budget épuisé et remise à 50 impossible — suite ignorée. Voir docs/troubleshooting/e2e-llm.md.'
        )
      }
    }
  }, { timeout: 120_000 })

  const login = async (page: Page) => {
    await page.goto('/login')
    await page.getByLabel(/nom d'utilisateur/i).fill('admin')
    await page.getByLabel(/mot de passe/i).fill('admin123')
    await page.getByRole('button', { name: /se connecter/i }).click()
    await expect(page).toHaveURL('/', { timeout: 10000 })
  }

  const prepareLegacyFixture = async (suffix: string): Promise<string> => {
    const filename = `e2e-accept-reject-${suffix}.json`
    await fs.copyFile(
      resolve(UNITY_DIALOGUES_DIR, SOURCE_FIXTURE_FILENAME),
      resolve(UNITY_DIALOGUES_DIR, filename)
    )
    currentFixtureFilename = filename
    return filename
  }

  const ensureGraphWithDialogue = async (page: Page, fixtureFilename: string) => {
    await page.goto('/')
    const onLogin = await page.getByRole('heading', { name: 'Connexion' }).isVisible({ timeout: 2000 }).catch(() => false)
    if (onLogin) await login(page)
    const stem = fixtureFilename.replace(/\.json$/i, '')
    await page.goto(`/graph-editor/${encodeURIComponent(stem)}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Chargement du graphe/i)).toBeHidden({ timeout: 90_000 })
    const nodes = page.locator('.react-flow__node')
    await expect(nodes.first()).toBeVisible({ timeout: 30_000 })
    return nodes
  }

  const generatePendingNode = async (page: Page) => {
    const countBefore = await page.locator('.react-flow__node').count()
    const firstNode = page.locator('.react-flow__node').first()
    await firstNode.click()
    const actionsBtn = page.getByTestId('btn-actions-dropdown')
    await expect(actionsBtn).toBeVisible({ timeout: 4000 })
    await actionsBtn.click()
    const generateBtn = page.getByRole('menuitem', { name: /✨ Générer nœud|Générer nœud/i })
    await expect(generateBtn).toBeVisible({ timeout: 4000 })
    await generateBtn.click()
    const textarea = page.getByPlaceholder(/Décrivez ce que vous voulez générer|instructions?/i)
    await expect(textarea).toBeVisible({ timeout: 5000 })
    const modelSelect = page.getByTestId('llm-model-select')
    await expect(modelSelect).toBeVisible({ timeout: 3000 })
    await modelSelect.selectOption({ value: 'gpt-5-mini' })
    await textarea.fill('Réponds brièvement pour ce test E2E.')
    // Mode "Suite" désactive Générer si le nœud a des choix → passer en "Branche" et sélectionner un choix.
    const branchBtn = page.getByRole('button', { name: 'Branche alternative (choice)' })
    if (await branchBtn.isVisible().catch(() => false)) {
      await branchBtn.click()
      const firstChoice = page.getByTestId('ai-gen-choice-0')
      if (await firstChoice.isVisible().catch(() => false)) {
        await firstChoice.click()
      }
    }
    const submitSingle = page.getByRole('button', { name: /^✨ Générer$|✨ Générer :/ })
    const submitBatch = page.getByRole('button', { name: /tous les choix/i })
    const submit = (await submitSingle.count()) > 0 ? submitSingle.first() : submitBatch.first()
    await expect(submit).toBeVisible({ timeout: 15_000 })
    await expect(submit).toBeEnabled({ timeout: 2000 })
    await submit.click({ force: true })
    const successToast = page.getByText(/Nœud généré avec succès|Nœud généré pour le choix \d+|[1-9]\d* nouveau\(x\) nœud\(s\) généré\(s\)/)
    await expect(
      successToast,
      'Génération LLM : aucun toast de succès. Vérifier logs frontend/API, budget, modèle gpt-5-mini. Voir docs/troubleshooting/e2e-llm.md.'
    ).toBeVisible({ timeout: 180_000 })
    await expect(
      page.locator('.react-flow__node:has([data-status="pending"])').first()
    ).toBeVisible({ timeout: 60_000 })
    const countAfter = await page.locator('.react-flow__node').count()
    const pendingCount = await page.locator('.react-flow__node:has([data-status="pending"])').count()
    expect(
      countAfter > countBefore || pendingCount > 0,
      'Génération LLM : aucun nœud pending détecté après génération. Voir docs/troubleshooting/e2e-llm.md.'
    ).toBe(true)
  }

  test('AC#1: accept/reject buttons visible on hover for pending nodes', async ({ page }) => {
    const fixtureFilename = await prepareLegacyFixture('ac1')
    await ensureGraphWithDialogue(page, fixtureFilename)
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
    const fixtureFilename = await prepareLegacyFixture('ac2')
    await ensureGraphWithDialogue(page, fixtureFilename)
    await generatePendingNode(page)
    const pendingBefore = await page.locator('.react-flow__node:has([data-status="pending"])').count()
    const pendingNode = page.locator('.react-flow__node:has([data-status="pending"])').first()
    await expect(pendingNode).toBeVisible({ timeout: 5000 })
    await pendingNode.hover({ force: true })
    const accept = page.locator('button:has-text("Accepter")').first()
    await expect(accept).toBeVisible({ timeout: 2000 })
    await accept.click()
    await expect(page.locator('.react-flow__node:has([data-status="pending"])')).toHaveCount(
      pendingBefore - 1,
      { timeout: 10000 }
    )
    const pendingAfter = await page.locator('.react-flow__node:has([data-status="pending"])').count()
    expect(pendingAfter).toBeLessThan(pendingBefore)
  })

  test('AC#3: reject node removes it and shows toast', async ({ page }) => {
    const fixtureFilename = await prepareLegacyFixture('ac3')
    await ensureGraphWithDialogue(page, fixtureFilename)
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
    const countAfter = await page.locator('.react-flow__node').count()
    expect(countAfter).toBe(countBefore - 1)
  })

  test('AC#5: pending nodes restored after reload (session recovery)', async ({ page }) => {
    const fixtureFilename = await prepareLegacyFixture('ac5')
    await ensureGraphWithDialogue(page, fixtureFilename)
    await generatePendingNode(page)
    await expect(page.locator('.react-flow__node:has([data-status="pending"])').first()).toBeVisible({ timeout: 5000 })
    const savePromise = page.waitForResponse(
      (r) =>
        (r.url().includes('/api/v1/documents/') && r.request().method() === 'PUT') ||
        r.url().includes('/api/v1/unity-dialogues/graph/save'),
      { timeout: 12000 }
    )
    await savePromise
    await page.reload()
    const onLoginAfter = await page.getByRole('heading', { name: 'Connexion' }).isVisible({ timeout: 2000 }).catch(() => false)
    if (onLoginAfter) await login(page)
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
