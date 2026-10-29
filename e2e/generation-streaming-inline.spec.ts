/**
 * Tests E2E du streaming de génération, écran 2a (anciennement « modal de progression »).
 *
 * La modale a été dissoute dans le streaming inline (`be4d3c612`) : les scénarios propres
 * à la fenêtre (réduire en badge, fermeture auto ou manuelle) ont disparu avec elle. Restent
 * le streaming visible, l'interruption et le résultat exploitable.
 *
 * Exige une génération LLM complète (clé API, budget, preflight) : désactivé par défaut,
 * activer avec E2E_FULL_GENERATION=1.
 */
import { test, expect, type Page } from '@playwright/test'

import { openApp } from './helpers'
import { E2E_MS } from './timeouts'

const BRIEF =
  "Vessine demande au patient d'où vient sa greffe. Ton retenu, phrases courtes, deux réponses possibles."

async function startGeneration(page: Page): Promise<void> {
  await page.locator('#user-instructions-textarea').fill(BRIEF)
  await page.getByTestId('generation-primary-action').getByRole('button', { name: /Générer/ }).first().click()
  await expect(page.getByTestId('generation-streaming-inline')).toBeVisible({ timeout: E2E_MS.ui })
}

test.describe('Génération — streaming inline (2a)', () => {
  test.skip(
    () => process.env.E2E_FULL_GENERATION !== '1',
    'Exige E2E_FULL_GENERATION=1 (génération LLM complète)'
  )

  test.beforeEach(async ({ page }) => {
    await openApp(page)
  })

  test('AC#1: le streaming s’affiche dans la colonne, puis le résultat', async ({ page }) => {
    await startGeneration(page)
    await expect(page.getByTestId('streaming-step-label')).toBeVisible()
    await expect(page.getByTestId('streaming-interrupt')).toBeVisible()

    await expect(page.getByText(/Génération Unity JSON réussie/i)).toBeVisible({ timeout: E2E_MS.graphFlow })
  })

  test('AC#2: « Interrompre » coupe la génération', async ({ page }) => {
    await startGeneration(page)
    await page.getByTestId('streaming-interrupt').click()

    await expect(page.getByTestId('streaming-interrupt')).not.toBeVisible({ timeout: E2E_MS.short })
    await expect(page.getByText(/Génération Unity JSON réussie/i)).not.toBeVisible()
  })

  test('le résultat est un Unity JSON exploitable : réplique et réponses rendues', async ({ page }) => {
    await startGeneration(page)
    await expect(page.getByText(/Génération Unity JSON réussie/i)).toBeVisible({ timeout: E2E_MS.graphFlow })

    // Le résultat se lit dans la colonne centrale (le panneau droit est replié sous 1440 px).
    await expect(page.getByText('TERMINÉ', { exact: true })).toBeVisible({ timeout: E2E_MS.short })
    await expect(page.getByText(/«[^»]{8,}»/).first()).toBeVisible()
    await expect(page.getByText(/Choix du joueur/i).first()).toBeVisible()
  })
})
