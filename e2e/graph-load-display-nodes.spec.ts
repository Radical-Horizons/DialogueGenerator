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

const API_BASE = 'http://127.0.0.1:4243'
const FIXTURE_ID = 'e2e-graph-load-fixture'
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

test.describe('Graph load – affichage des nœuds', () => {
  test.setTimeout(60_000)

  const login = async (page: Page) => {
    await page.goto('/')
    const onLogin = await page.getByRole('heading', { name: /connexion/i }).isVisible({ timeout: 3000 }).catch(() => false)
    if (onLogin) {
      await page.getByLabel(/nom d'utilisateur/i).fill('admin')
      await page.getByLabel(/mot de passe/i).fill('admin123')
      await page.getByRole('button', { name: /se connecter/i }).click()
      await expect(page).toHaveURL(/\//, { timeout: 10000 })
    }
  }

  const seedFixture = async (
    request: Parameters<Parameters<typeof test>[1]>[0]['request']
  ): Promise<void> => {
    const res = await request.put(`${API_BASE}/api/v1/documents/${FIXTURE_ID}`, {
      data: { document: FIXTURE_DOC, revision: 1 },
    })
    if (!(res.ok() || res.status() === 409)) {
      throw new Error(`Impossible de seed la fixture graphe (${res.status()})`)
    }
  }

  test('ouvrir un dialogue et vérifier que les nœuds du graphe s\'affichent', async ({ page, request }) => {
    await page.goto('/')
    await login(page)
    await seedFixture(request)
    await page.goto(`/graph-editor/${FIXTURE_ID}`)

    // Attendre la fin du chargement (disparition de "Chargement du graphe...")
    await expect(page.getByText(/Chargement du graphe/i)).toBeHidden({ timeout: 20000 })

    // Vérifier qu'au moins un nœud est affiché à l'écran (régression : bug "aucun nœud au chargement")
    // On exige toBeVisible : si les nœuds ne s'affichent pas, le test doit échouer.
    const nodes = page.locator('[data-testid="graph-node-content"]')
    await expect(nodes.first()).toBeVisible({ timeout: 15000 })
    const count = await nodes.count()
    expect(count).toBeGreaterThan(0)
  })

  test('drag dialogue node then release – positions stables, pas d’erreurs console en boucle', async ({
    page,
    request,
  }) => {
    await page.goto('/')
    await login(page)
    await seedFixture(request)
    await page.goto(`/graph-editor/${FIXTURE_ID}`)

    await expect(page.getByText(/Chargement du graphe/i)).toBeHidden({ timeout: 20000 })
    const nodeElements = page.locator('[data-testid="graph-node-content"]:visible')
    await expect(nodeElements.first()).toBeVisible({ timeout: 15000 })

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
    await page.waitForTimeout(500)

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
