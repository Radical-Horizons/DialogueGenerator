import { test, expect } from '@playwright/test'

test.describe('Sélecteur de contexte', () => {
  test.beforeEach(async ({ page }) => {
    // Se connecter
    await page.goto('/login')
    await page.getByLabel(/nom d'utilisateur/i).fill('admin')
    await page.getByLabel(/mot de passe/i).fill('admin123')
    await page.getByRole('button', { name: /se connecter/i }).click()
    await expect(page).toHaveURL('/')
  })

  test('le résumé des sélections doit être entièrement visible en bas du panneau', async ({ page }) => {
    // Attendre que les données soient chargées
    await expect(page.getByRole('button', { name: /personnages/i })).toBeVisible()
    
    // Sélectionner un personnage
    const firstCharacter = page.locator('input[type="checkbox"]').first()
    const firstCharacterRow = firstCharacter.locator('xpath=..')
    const selectedCharacterName = ((await firstCharacterRow.textContent()) ?? '')
      .replace(/📄\s*Complet/gi, '')
      .trim()
    await firstCharacter.click()
    
    // Attendre que le résumé apparaisse
    const summaryToggle = page.getByTestId('selected-context-summary-toggle')
    await expect(summaryToggle).toBeVisible()
    
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



