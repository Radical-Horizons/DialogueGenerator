/**
 * Export du graphe en image, avec le vrai html-to-image (les tests unitaires le simulent).
 *
 * Les traits des liens restent en `var(--dg-…)` dans le SVG exporté : l'image n'est juste que
 * si les variables référencées y sont aussi déclarées.
 */
import * as fs from 'node:fs'
import { test, expect } from '@playwright/test'

import { uniqueE2EDocumentId, seedDocumentWithRetry, gotoGraphEditorAndWaitForDocument } from './helpers'
import { E2E_MS, E2E_TEST_TIMEOUT_MS } from './timeouts'

const API_BASE = 'http://127.0.0.1:4243'
const FIXTURE_PREFIX = 'e2e-graph-export-image'
const FIXTURE_DOC = {
  schemaVersion: '1.1.0',
  nodes: [
    { id: 'START', speaker: 'E2E', line: 'Départ', nextNode: 'node-suite', choices: [] },
    { id: 'node-suite', speaker: 'E2E', line: 'Suite', choices: [] },
  ],
}

test.describe('Graphe — export en image', () => {
  test.setTimeout(E2E_TEST_TIMEOUT_MS.apiMedium)
  // Largeur à laquelle la barre d'outils montre le menu « Actions ».
  test.use({ viewport: { width: 1440, height: 900 } })

  test.afterEach(async ({ request }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    const res = await request.delete(`${API_BASE}/api/v1/documents/${fixtureId}`)
    if (!res.ok() && res.status() !== 404) {
      throw new Error(`Cleanup DELETE failed ${res.status()}: ${await res.text().catch(() => '')}`)
    }
  })

  test('le SVG exporté contient le lien et déclare les variables qu’il référence', async ({
    page,
    request,
  }, testInfo) => {
    const fixtureId = uniqueE2EDocumentId(FIXTURE_PREFIX, testInfo)
    await seedDocumentWithRetry(request, API_BASE, fixtureId, FIXTURE_DOC)
    await gotoGraphEditorAndWaitForDocument(page, fixtureId)
    await expect(page.locator('.react-flow__edge-path')).toHaveCount(1, { timeout: E2E_MS.graphField })

    await page.getByRole('button', { name: /^Actions/ }).click()
    await page.getByText('Exporter en image (PNG/SVG)').click()
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: E2E_MS.graphField }),
      page.getByRole('button', { name: /SVG \(Vectoriel\)/ }).click(),
    ])
    const svg = fs.readFileSync(await download.path(), 'utf-8')

    expect(svg).toContain('react-flow__edge-path')
    const referenced = [...new Set([...svg.matchAll(/var\(\s*(--dg-[\w-]+)/g)].map((m) => m[1]))]
    // La variable dépend de la sélection (lien neutre ou surligné) ; sans aucune, le contrôle
    // suivant ne vérifierait rien.
    expect(referenced.length).toBeGreaterThan(0)
    const undeclared = referenced.filter((name) => !new RegExp(`${name}\\s*:`).test(svg))
    expect(undeclared).toEqual([])
  })
})
