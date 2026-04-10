/**
 * Test E2E : ouvrir un dialogue avec des nœuds et vérifier que les nœuds s'affichent.
 *
 * Régressions : bug "aucun nœud ne s'affiche au chargement du graphe".
 *
 * Prérequis :
 * - API et frontend démarrés (playwright les lance si besoin).
 * - Au moins un dialogue Unity existant avec des nœuds (ex. Dialogue_Unity.json).
 */
import { test, expect, type Page } from '@playwright/test'
import { uniqueE2EDocumentId, seedDocumentWithRetry, gotoGraphEditorAndWaitForDocument } from './helpers'
import { E2E_MS, E2E_TEST_TIMEOUT_MS } from './timeouts'

const API_BASE = 'http://127.0.0.1:4243'
const FIXTURE_PREFIX = 'e2e-graph-load'
const FIXTURE_DOC = {
  schemaVersion: '1.1.0',
  nodes: [
    {
      id: 'START',
      speaker: 'E2E',
      line: 'Fixture graph load',
      nextNode: 'END',
      choices: [],
    },
    {
      id: 'END',
      speaker: 'E2E',
      line: 'Fin',
      nextNode: null,
      choices: [],
    },
  ],
}

test.describe('Graph load – affichage des nœuds', { tag: '@smoke' }, () => {
  test.setTimeout(E2E_TEST_TIMEOUT_MS.apiMedium)

  const login = async (page: Page) => {
    await page.goto('/')
    const onLogin = await page.getByRole('heading', { name: /connexion/i }).isVisible({ timeout: E2E_MS.control }).catch(() => false)
    if (onLogin) {
      await page.getByLabel(/nom d'utilisateur/i).fill('admin')
      await page.getByLabel(/mot de passe/i).fill('admin123')
      await page.getByRole('button', { name: /se connecter/i }).click()
      await expect(page).toHaveURL(/\//, { timeout: E2E_MS.ui })
    }
  }

  const deleteFixture = async (
    request: Parameters<Parameters<typeof test>[1]>[0]['request'],
    fixtureId: string
  ): Promise<void> => {
    const res = await request.delete(`${API_BASE}/api/v1/documents/${fixtureId}`)
    if (!res.ok() && res.status() !== 404) {
      const text = await res.text().catch(() => '')
      throw new Error(`Cleanup DELETE failed ${res.status()}: ${text}`)
    }
  }

  test.afterEach(async ({ request }, testInfo) => {
    await deleteFixture(request, uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo))
  })

  test('ouvrir un dialogue et vérifier que les nœuds du graphe s\'affichent', async ({ page, request }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    await page.goto('/')
    await login(page)
    await seedDocumentWithRetry(request, API_BASE, fixtureId, FIXTURE_DOC)
    await gotoGraphEditorAndWaitForDocument(page, fixtureId)

    // Vérifier qu'au moins un nœud est affiché à l'écran (régression : bug "aucun nœud au chargement")
    // On exige toBeVisible : si les nœuds ne s'affichent pas, le test doit échouer.
    const nodes = page.locator('[data-testid="graph-node-content"]')
    await expect(nodes.first()).toBeVisible({ timeout: E2E_MS.graphField })
    const count = await nodes.count()
    expect(count).toBeGreaterThan(0)
  })

  test('drag dialogue node then release – positions stables, pas d’erreurs console en boucle', async ({
    page,
    request,
  }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    await page.goto('/')
    await login(page)
    await seedDocumentWithRetry(request, API_BASE, fixtureId, FIXTURE_DOC)
    await gotoGraphEditorAndWaitForDocument(page, fixtureId)
    const nodeElements = page.locator('[data-testid="graph-node-content"]:visible')
    await expect(nodeElements.first()).toBeVisible({ timeout: E2E_MS.graphField })

    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      const type = msg.type()
      if (type === 'error') {
        const text = msg.text()
        consoleErrors.push(text)
      }
    })

    const firstNode = nodeElements.first()
    const box = await firstNode.boundingBox()
    if (!box) {
      throw new Error('First node has no bounding box')
    }
    const centerX = box.x + box.width / 2
    const centerY = box.y + box.height / 2
    await page.mouse.move(centerX, centerY)
    await page.mouse.down()
    await page.mouse.move(centerX + 80, centerY + 40, { steps: 5 })
    await page.mouse.up()
    await firstNode.waitFor({ state: 'visible', timeout: E2E_MS.control })

    const errorCount = consoleErrors.length
    const repeated = consoleErrors.filter(
      (e, i) => consoleErrors.indexOf(e) !== i
    )
    expect(
      repeated.length,
      `Régression: trop d’erreurs console répétées après drag (${errorCount} erreurs, doublons: ${repeated.length})`
    ).toBe(0)
  })
})
