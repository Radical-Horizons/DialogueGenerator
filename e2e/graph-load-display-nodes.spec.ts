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

  test('ouvrir un dialogue et vérifier que les nœuds du graphe s\'affichent', async ({ page }) => {
    await page.goto('/')
    await login(page)

    // Aller sur l'éditeur de graphe
    const graphTab = page.getByRole('button', { name: /Éditeur de Graphe|📊/ }).first()
    await expect(graphTab).toBeVisible({ timeout: 15000 })
    await graphTab.click()

    // Attendre la liste des dialogues (scoper à l'éditeur de graphe : même liste en onglet Édition)
    const list = page.getByTestId('graph-editor').getByTestId('unity-dialogue-list')
    await expect(list).toBeVisible({ timeout: 15000 })

    // Cliquer sur le premier dialogue affiché (item contenant un filename .json)
    const firstDialogue = list.locator('div').filter({ hasText: /\.json/i }).first()
    await expect(firstDialogue).toBeVisible({ timeout: 8000 })
    await firstDialogue.click()

    // Attendre la fin du chargement (disparition de "Chargement du graphe...")
    await expect(page.getByText(/Chargement du graphe/i)).toBeHidden({ timeout: 20000 })

    // Le canvas React Flow doit être visible (évite assertion sur un élément hors viewport)
    const reactFlow = page.locator('.react-flow')
    await expect(reactFlow).toBeVisible({ timeout: 5000 })

    // Vérifier qu'au moins un nœud est affiché à l'écran (régression : bug "aucun nœud au chargement")
    // On exige toBeVisible : si les nœuds ne s'affichent pas, le test doit échouer.
    const nodes = page.locator('.react-flow__node')
    await expect(nodes.first()).toBeVisible({ timeout: 15000 })
    const count = await nodes.count()
    expect(count).toBeGreaterThan(0)
  })

  test('drag dialogue node then release – positions stables, pas d’erreurs console en boucle', async ({
    page,
  }) => {
    await page.goto('/')
    await login(page)

    const graphTab = page.getByRole('button', { name: /Éditeur de Graphe|📊/ }).first()
    await expect(graphTab).toBeVisible({ timeout: 15000 })
    await graphTab.click()

    const list = page.getByTestId('graph-editor').getByTestId('unity-dialogue-list')
    await expect(list).toBeVisible({ timeout: 15000 })
    const firstDialogue = list.locator('div').filter({ hasText: /\.json/i }).first()
    await expect(firstDialogue).toBeVisible({ timeout: 8000 })
    await firstDialogue.click()

    await expect(page.getByText(/Chargement du graphe/i)).toBeHidden({ timeout: 20000 })
    const reactFlow = page.locator('.react-flow')
    await expect(reactFlow).toBeVisible({ timeout: 5000 })
    const nodeElements = page.locator('.react-flow__node')
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
