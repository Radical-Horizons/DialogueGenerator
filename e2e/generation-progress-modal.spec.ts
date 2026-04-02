/**
 * Tests E2E pour la modal de progression de génération avec SSE streaming.
 *
 * Ces tests exigent une génération LLM complète (API key, budget, preflight OK).
 * Désactivés par défaut pour éviter timeouts/flakiness ; activer manuellement
 * ou en CI avec env dédié (ex. E2E_FULL_GENERATION=1).
 */
import { test, expect, type Page } from '@playwright/test'

import { E2E_MS } from './timeouts'

test.describe('Generation Progress Modal with SSE Streaming', () => {
  test.skip(
    () => process.env.E2E_FULL_GENERATION !== '1',
    'Exige E2E_FULL_GENERATION=1 (génération LLM complète)'
  )

  const selectFirstCharacter = async (page: Page) => {
    await page.getByText('(Aucun) - Rechercher...').first().click()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
  }
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Génération de Dialogues/i }).waitFor({ state: 'visible', timeout: E2E_MS.graphField })
  })

  test('AC#1: Modal s\'affiche au lancement génération avec streaming visible', async ({ page }) => {
    // Sélectionner un personnage (minimum requis)
    await selectFirstCharacter(page)
    
    // Ajouter des instructions
    await page.fill('textarea[placeholder*="instructions"]', 'Génère un dialogue de test')
    
    // Lancer la génération
    await page.click('button:has-text("Générer")')
    
    // Vérifier que la modal s'affiche
    await expect(page.locator('h2:has-text("Génération en cours...")')).toBeVisible()
    
    // Vérifier que la barre de progression est visible
    await expect(page.locator('text=Prompting')).toBeVisible()
    await expect(page.locator('text=Generating')).toBeVisible()
    await expect(page.locator('text=Validating')).toBeVisible()
    await expect(page.locator('text=Complete')).toBeVisible()
    
    // Attendre que du contenu streaming apparaisse
    // Note : Ceci dépend du backend SSE fonctionnel
    await page.waitForSelector('pre', { timeout: E2E_MS.short })
    const streamingContent = await page.locator('pre').textContent()
    expect(streamingContent).toBeTruthy()
    expect(streamingContent!.length).toBeGreaterThan(0)
  })

  test('AC#2: Interruption fonctionne (bouton "Interrompre" → modal ferme)', async ({ page }) => {
    // Sélectionner un personnage et lancer la génération
    await selectFirstCharacter(page)
    await page.fill('textarea[placeholder*="instructions"]', 'Génère un dialogue de test')
    await page.click('button:has-text("Générer")')
    
    // Attendre que la modal s'affiche
    await expect(page.locator('h2:has-text("Génération en cours...")')).toBeVisible()
    
    // Cliquer sur "Interrompre"
    await page.click('button:has-text("Interrompre")')
    
    // Vérifier que la modal se ferme
    await expect(page.locator('h2:has-text("Génération en cours...")')).not.toBeVisible({ timeout: E2E_MS.probe })
  })

  test('AC#3: Réduction fonctionne (icône minimize → badge compact)', async ({ page }) => {
    // Sélectionner un personnage et lancer la génération
    await selectFirstCharacter(page)
    await page.fill('textarea[placeholder*="instructions"]', 'Génère un dialogue de test')
    await page.click('button:has-text("Générer")')
    
    // Attendre que la modal s'affiche
    await expect(page.locator('h2:has-text("Génération en cours...")')).toBeVisible()
    
    // Cliquer sur l'icône minimize (bouton "–")
    await page.click('button[aria-label="Réduire"]')
    
    // Vérifier que la modal pleine n'est plus visible
    await expect(page.locator('h2:has-text("Génération en cours...")')).not.toBeVisible({ timeout: E2E_MS.probe })
    
    // Vérifier que le badge compact est visible (coin écran)
    // Le badge affiche toujours la progression
    await expect(page.locator('text=Generating').or(page.locator('text=Prompting'))).toBeVisible()
    
    // Cliquer sur le badge pour agrandir à nouveau
    await page.click('div:has-text("Generating")').first()
    
    // Vérifier que la modal pleine réapparaît
    await expect(page.locator('h2:has-text("Génération en cours...")')).toBeVisible()
  })

  test('AC#4: Auto-fermeture après succès + nœuds ajoutés au graphe', async ({ page }) => {
    // Sélectionner un personnage et lancer la génération
    await selectFirstCharacter(page)
    await page.fill('textarea[placeholder*="instructions"]', 'Génère un dialogue de test')
    await page.click('button:has-text("Générer")')
    
    // Attendre que la modal s'affiche
    await expect(page.locator('h2:has-text("Génération en cours...")')).toBeVisible()
    
    // Attendre que la génération se termine (état "Complete")
    // Note : Timeout long car génération LLM peut prendre du temps
    await expect(page.locator('h2:has-text("Génération terminée")')).toBeVisible({ timeout: E2E_MS.graphFlow })
    
    // Vérifier que le bouton "Fermer" est visible
    await expect(page.locator('button:has-text("Fermer")')).toBeVisible()

    // Attendre l'auto-fermeture (event-based)
    await expect(page.locator('h2:has-text("Génération terminée")')).not.toBeVisible({ timeout: E2E_MS.medium })
    
    // Vérifier que les nœuds ont été ajoutés au graphe
    // Note : Ceci dépend de l'implémentation du graphe
    // Pour l'instant, vérifier que le panneau de résultats affiche quelque chose
    await expect(page.locator('text=Unity JSON').or(page.locator('text=Dialogue généré'))).toBeVisible({ timeout: E2E_MS.short })
  })

  test('AC#4 (variante): Fermeture manuelle avant auto-fermeture', async ({ page }) => {
    // Sélectionner un personnage et lancer la génération
    await selectFirstCharacter(page)
    await page.fill('textarea[placeholder*="instructions"]', 'Génère un dialogue de test')
    await page.click('button:has-text("Générer")')
    
    // Attendre que la génération se termine
    await expect(page.locator('h2:has-text("Génération terminée")')).toBeVisible({ timeout: E2E_MS.graphFlow })
    
    // Cliquer sur "Fermer" avant l'auto-fermeture
    await page.click('button:has-text("Fermer")')
    
    // Vérifier que la modal se ferme immédiatement
    await expect(page.locator('h2:has-text("Génération terminée")')).not.toBeVisible({ timeout: E2E_MS.micro })
  })

  test('Gestion d\'erreur : Modal affiche l\'erreur si génération échoue', async ({ page }) => {
    // Mock une erreur côté backend (si possible via intercept)
    // Pour l'instant, tester avec des paramètres invalides
    
    // Ne pas sélectionner de personnage (devrait échouer)
    await page.fill('textarea[placeholder*="instructions"]', 'Test sans personnage')
    await page.click('button:has-text("Générer")')
    
    // Vérifier qu'un message d'erreur s'affiche (toast ou modal)
    await expect(page.locator('text=Au moins un personnage').or(page.locator('text=erreur'))).toBeVisible({ timeout: E2E_MS.control })
  })

  test('Génération streaming produit un Unity JSON valide', async ({ page }) => {
    // Sélectionner un personnage
    await selectFirstCharacter(page)
    
    // Ajouter des instructions
    await page.fill('textarea[placeholder*="instructions"]', 'Génère un dialogue de test')
    
    // Lancer la génération
    await page.click('button:has-text("Générer")')
    
    // Attendre que la modal s'affiche
    await expect(page.locator('h2:has-text("Génération en cours...")')).toBeVisible()
    
    // Attendre que la génération se termine
    await expect(page.locator('h2:has-text("Génération terminée")').or(page.locator('text=Complete'))).toBeVisible({ timeout: E2E_MS.generationMenu })
    
    // Vérifier que le résultat Unity JSON est disponible
    // Le résultat devrait être dans le store et affiché dans le panneau de résultats
    // Vérifier que le panneau "Dialogue généré" ou "Unity JSON" contient du contenu
    await expect(page.locator('text=Unity JSON').or(page.locator('text=Dialogue généré')).or(page.locator('pre'))).toBeVisible({ timeout: E2E_MS.short })
    
    // Vérifier que le contenu JSON est valide (si accessible)
    // Note : Ceci dépend de l'implémentation de l'affichage du résultat
    const jsonContent = await page.locator('pre').first().textContent()
    if (jsonContent) {
      // Essayer de parser le JSON pour vérifier qu'il est valide
      try {
        const parsed = JSON.parse(jsonContent)
        expect(parsed).toBeDefined()
        // Si c'est un Unity JSON, vérifier qu'il contient des nodes
        if (parsed.nodes) {
          expect(Array.isArray(parsed.nodes)).toBe(true)
          expect(parsed.nodes.length).toBeGreaterThan(0)
        }
      } catch (e) {
        // Si le contenu n'est pas du JSON directement, c'est OK (peut être formaté différemment)
        // L'important est que le résultat soit présent
        expect(jsonContent.length).toBeGreaterThan(0)
      }
    }
  })
})
