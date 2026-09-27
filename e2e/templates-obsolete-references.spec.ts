/**
 * E2E — charger un template dont des références GDD n'existent plus.
 *
 * Remplace `presets-crud.spec.ts` : les presets ont convergé dans les templates
 * (`template_convergence_service`), dont création, application, édition et suppression
 * sont couvertes par `templates-*.spec.ts`. Restait sans couverture le seul scénario
 * propre aux presets : la validation des références obsolètes au chargement.
 */
import fs from 'node:fs'
import path from 'node:path'

import { test, expect, type APIRequestContext } from '@playwright/test'

import { openApp } from './helpers'
import { E2E_MS, E2E_TEST_TIMEOUT_MS } from './timeouts'

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:4243'
const TEMPLATES_DIR = path.join(process.cwd(), 'data', 'templates', 'custom')
const GHOST = 'Personnage Fantôme E2E'

/**
 * La création écarte déjà les références inconnues du GDD : une référence ne devient
 * obsolète qu'après coup, quand le GDD change. On simule ce changement en réinjectant
 * dans le fichier du template un personnage absent du GDD.
 */
async function seedTemplateWithGhost(
  request: APIRequestContext,
  name: string,
  instructions: string
): Promise<string> {
  const res = await request.post(`${API_BASE}/api/v1/templates`, {
    data: {
      name,
      category: 'E2E',
      configuration: { characters: [], locations: [], region: '', sceneType: 'Première rencontre', instructions },
    },
  })
  expect(res.status(), await res.text()).toBe(201)
  const id = ((await res.json()) as { id: string }).id

  const file = path.join(TEMPLATES_DIR, `${id}.json`)
  const stored = JSON.parse(fs.readFileSync(file, 'utf8')) as { configuration: { characters: string[] } }
  stored.configuration.characters = [GHOST]
  fs.writeFileSync(file, JSON.stringify(stored, null, 2), 'utf8')

  const validation = await request.get(`${API_BASE}/api/v1/templates/${id}/validate`)
  expect(((await validation.json()) as { obsoleteRefs: string[] }).obsoleteRefs).toEqual([GHOST])
  return id
}

test.describe('Templates — références GDD obsolètes', () => {
  test.setTimeout(E2E_TEST_TIMEOUT_MS.graphHeavy)

  let templateId: string | null = null

  test.afterEach(async ({ request }) => {
    if (templateId) await request.delete(`${API_BASE}/api/v1/templates/${templateId}`)
    templateId = null
  })

  const loadTemplate = async (page: import('@playwright/test').Page, name: string) => {
    await openApp(page)
    await page.getByTestId('input-tab-templates').click()
    const card = page.locator(`[data-testid="template-item"][data-template-name="${name}"]`)
    await expect(card).toBeVisible({ timeout: E2E_MS.graphField })
    await card.click()
    const modal = page.getByTestId('preset-validation-modal')
    await expect(modal).toBeVisible({ timeout: E2E_MS.short })
    await expect(modal).toContainText(GHOST)
    return modal
  }

  test('Annuler : le brief reste intact', async ({ page, request }) => {
    const name = `Template E2E obsolète ${Date.now()}`
    const instructions = `Brief du template ${Date.now()}`
    templateId = await seedTemplateWithGhost(request, name, instructions)

    const modal = await loadTemplate(page, name)
    await page.getByTestId('preset-validation-cancel').click()

    await expect(modal).not.toBeVisible({ timeout: E2E_MS.short })
    await page.getByTestId('input-tab-brief').click()
    await expect(page.locator('#user-instructions-textarea')).not.toHaveValue(instructions)
  })

  test('Charger quand même : le template s’applique sans la référence disparue', async ({
    page,
    request,
  }) => {
    const name = `Template E2E obsolète ${Date.now()}`
    const instructions = `Brief du template ${Date.now()}`
    templateId = await seedTemplateWithGhost(request, name, instructions)

    const modal = await loadTemplate(page, name)
    await page.getByTestId('preset-validation-confirm').click()

    await expect(modal).not.toBeVisible({ timeout: E2E_MS.short })
    await expect(page.locator('#user-instructions-textarea')).toHaveValue(instructions, {
      timeout: E2E_MS.short,
    })
  })
})
