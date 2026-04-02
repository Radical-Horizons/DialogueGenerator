import { test, expect } from '@playwright/test'

import { E2E_MS } from './timeouts'

test.describe('Sélecteur de contexte', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('le résumé des sélections doit être entièrement visible en bas du panneau', async ({ page }) => {
    await expect(page.getByRole('button', { name: /personnages/i })).toBeVisible({ timeout: E2E_MS.graphField })
    const contextPanel = page.getByTestId('context-selector')
    const checkboxes = contextPanel.locator('input[type="checkbox"]')
    const count = await checkboxes.count()
    if (count === 0) {
      test.skip(true, 'Aucun personnage dans le GDD - test ignoré')
    }
    const firstCharacter = checkboxes.first()
    await expect(firstCharacter).toBeVisible({ timeout: E2E_MS.short })
    const firstCharacterRow = firstCharacter.locator('xpath=..')
    const selectedCharacterName = ((await firstCharacterRow.textContent()) ?? '')
      .replace(/📄\s*Complet/gi, '')
      .trim()
    await firstCharacter.click()
    
    // Attendre que le résumé apparaisse après sélection
    const summaryToggle = page.getByTestId('selected-context-summary-toggle')
    await expect(summaryToggle).toBeVisible({ timeout: E2E_MS.ui })
    
    // Vérifier que le résumé est visible (pas tronqué)
    const summarySection = summaryToggle.locator('xpath=../..')
    
    // Vérifier que le bouton "Tout effacer" est visible
    await expect(page.getByRole('button', { name: /tout effacer/i })).toBeVisible()

    // Développer explicitement le résumé pour vérifier son contenu détaillé
    await summaryToggle.click()
    await expect(summaryToggle).toHaveAttribute('aria-expanded', 'true')
    
    // Vérifier que le texte "Personnages: 1" est visible
    await expect(page.getByText(/personnages:\s*1/i)).toBeVisible()
    
    // Vérifier que le nom du personnage sélectionné est visible (pas tronqué)
    if (selectedCharacterName) {
      await expect(summarySection.getByText(selectedCharacterName, { exact: false })).toBeVisible()
    }
    
    // Vérifier visuellement que le résumé n'est pas coupé
    // En vérifiant que le bas du résumé est dans le viewport
    const summaryBounds = await summarySection.boundingBox()
    const viewportHeight = page.viewportSize()?.height || 0
    
    if (summaryBounds) {
      // Le bas du résumé doit être visible (pas coupé)
      expect(summaryBounds.y + summaryBounds.height).toBeLessThanOrEqual(viewportHeight)
      
      // Le résumé doit avoir une hauteur raisonnable (pas tronqué)
      expect(summaryBounds.height).toBeGreaterThan(50) // Au moins 50px de hauteur
    }
  })
})



