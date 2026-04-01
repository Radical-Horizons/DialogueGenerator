/**
 * Utilitaires partagés pour les tests Playwright E2E.
 */
import { expect } from '@playwright/test'
import type { APIRequestContext, Page, Response, TestInfo } from '@playwright/test'

/**
 * Génère un identifiant de document canonique unique par test et worker,
 * pour éviter les courses entre workers (`fullyParallel`) sur le même fichier disque.
 *
 * @param prefix Préfixe stable (ex. ``e2e-graph-load``).
 * @param testInfo Métadonnées Playwright du test en cours.
 * @returns Id utilisable dans ``/api/v1/documents/{id}`` (sans path traversal).
 */
export function uniqueE2EDocumentId(prefix: string, testInfo: TestInfo): string {
  const safe = testInfo.testId.replace(/[^a-zA-Z0-9]/g, '').slice(-20) || 'test'
  return `${prefix}-w${testInfo.workerIndex}-${safe}`
}

/**
 * PUT document avec retries sur 409 (révision optimiste).
 *
 * @param request Contexte API Playwright.
 * @param apiBase URL de base (ex. ``http://127.0.0.1:4243``).
 * @param documentId Identifiant document (sans ``.json``).
 * @param document Corps document Unity canonique.
 */
/**
 * Indique si la réponse est un GET 200 sur le corps du document canonique
 * ``/api/v1/documents/{id}`` (exclut ``/layout`` et sous-chemins : le préfixe ``…/id``
 * matche aussi ``…/id/layout`` avec un simple ``includes``, ce qui faussait les attentes).
 *
 * @param documentId Identifiant document (sans ``.json`` obligatoire).
 * @param response Réponse Playwright.
 */
export function matchDocumentJsonGetResponse(documentId: string, response: Response): boolean {
  if (response.request().method() !== 'GET' || !response.ok()) {
    return false
  }
  const stem = documentId.replace(/\.json$/i, '')
  const pathSuffixes = [stem, `${stem}.json`]
  const u = response.url()
  for (const s of pathSuffixes) {
    const needle = `/api/v1/documents/${encodeURIComponent(s)}`
    const idx = u.indexOf(needle)
    if (idx < 0) {
      continue
    }
    const rest = u.slice(idx + needle.length)
    if (rest === '' || rest.startsWith('?') || rest.startsWith('#')) {
      return true
    }
  }
  return false
}

/**
 * Navigation vers ``/graph-editor/{id}`` en attendant le GET document JSON (pas le layout).
 *
 * @param page Page Playwright.
 * @param documentId Identifiant document (stem, sans extension obligatoire).
 */
export async function gotoGraphEditorAndWaitForDocument(page: Page, documentId: string): Promise<void> {
  const stem = documentId.replace(/\.json$/i, '')
  await Promise.all([
    page.waitForResponse((r) => matchDocumentJsonGetResponse(stem, r), { timeout: 30_000 }),
    page.goto(`/graph-editor/${encodeURIComponent(stem)}`, { waitUntil: 'domcontentloaded' }),
  ])
  await expect(page.getByText(/Chargement du graphe/i)).toBeHidden({ timeout: 30_000 })
}

export async function seedDocumentWithRetry(
  request: APIRequestContext,
  apiBase: string,
  documentId: string,
  document: Record<string, unknown>
): Promise<void> {
  let revision = 1
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await request.put(`${apiBase}/api/v1/documents/${encodeURIComponent(documentId)}`, {
      data: { document, revision },
    })
    if (res.ok()) {
      return
    }
    if (res.status() === 409) {
      const body = (await res.json().catch(() => ({}))) as { revision?: number }
      revision = body.revision ?? revision + 1
      continue
    }
    const text = await res.text().catch(() => '')
    throw new Error(`Seed failed ${res.status()}: ${text}`)
  }
  throw new Error(`Seed failed after retries for ${documentId}`)
}

/**
 * Dashboard → onglet « Éditeur de Graphe » → sélection d’un dialogue dont le nom contient ``documentStem``.
 * Préfère ``data-testid`` + ``hasText`` au ``getByRole(button)`` : le libellé accessible est formaté (underscores, casse).
 *
 * @param page Page Playwright (déjà sur l’app, session ok).
 * @param documentStem Tronc ou id document (ex. ``e2e-foo-w0-abc``), sans obligation d’extension ``.json``.
 */
export async function openDashboardGraphTabAndSelectDocument(
  page: Page,
  documentStem: string
): Promise<void> {
  await page
    .getByRole('button', { name: /Génération de Dialogues/i })
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => {})
  await page.getByRole('button', { name: /Éditeur de Graphe/i }).click({ timeout: 15000 })
  // Lazy keep-alive : le premier clic sur l’onglet graphe monte GraphEditor + liste.
  await expect(page.getByTestId('graph-editor')).toBeVisible({ timeout: 30_000 })
  // Scoper sur l’éditeur graphe (évite l’input homonyme de l’onglet Édition de Dialogues).
  await expect(
    page.locator('[data-testid="graph-editor"] input[placeholder*="Rechercher un dialogue"]')
  ).toBeVisible({ timeout: 45_000 })
  const needle = documentStem.replace(/\.json$/i, '')
  const item = page.getByTestId('unity-dialogue-item').filter({ hasText: needle })
  await expect(item.first()).toBeVisible({ timeout: 45_000 })
  await item.first().click()
  // Fin de chargement : mieux vaut un nœud React Flow que « Chargement du graphe » (texte dupliqué / onglets keep-alive).
  await expect(page.locator('[data-testid="graph-editor"] .react-flow__node').first()).toBeVisible({
    timeout: 90_000,
  })
}
