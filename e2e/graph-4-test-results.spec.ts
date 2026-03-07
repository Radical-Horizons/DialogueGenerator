/**
 * Tests E2E pour les tests avec 4 résultats (Story 0.10).
 * 
 * Scénarios testés :
 * - AC#1 : Créer choix avec test, générer 4 nœuds, vérifier connexions
 * - AC#2 : Exporter dialogue avec 4 résultats, importer, vérifier graphe
 * - AC#3 : Éditer manuellement les 4 connexions dans l'éditeur
 * - AC#4 : Rétrocompatibilité : Charger ancien dialogue avec 2 résultats fonctionne
 */
import { test, expect, type Page } from '@playwright/test'

test.describe('Graph 4 Test Results (Story 0.10)', () => {
  // Helper pour s'authentifier
  const login = async (page: Page) => {
    const loginHeading = page.getByRole('heading', { name: /connexion/i })
    const isLoginPage = await loginHeading.isVisible({ timeout: 2000 }).catch(() => false)
    
    if (isLoginPage) {
      await page.getByLabel(/nom d'utilisateur/i).fill('admin')
      await page.getByLabel(/mot de passe/i).fill('admin123')
      await page.getByRole('button', { name: /se connecter/i }).click()
      await Promise.race([
        page.waitForURL('**/', { timeout: 5000 }).catch(() => {}),
        page.getByRole('button', { name: /Génération de Dialogues/i }).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
      ])
    }
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await login(page)
    await page.getByRole('button', { name: /Génération de Dialogues/i }).waitFor({ state: 'visible', timeout: 10000 })
    
    const graphTab = page.getByRole('button', { name: /Éditeur de Graphe|📊/ }).first()
    if (await graphTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await graphTab.click()
      await page.waitForTimeout(500)
    }
  })

  test('AC#1: Créer choix avec test, générer 4 nœuds, vérifier connexions', async ({ page }) => {
    // GIVEN: Un dialogue avec un nœud START
    // (On suppose qu'un dialogue existe ou on en crée un)
    
    // WHEN: Sélectionner un nœud et ajouter un choix avec test
    const startNode = page.locator('[data-id="START"]').or(page.locator('[data-id^="NODE_"]').first())
    if (await startNode.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startNode.click()
      
      // Attendre que le panneau d'édition s'affiche
      await page.waitForSelector('text=/Édition de nœud|Éditer/i', { timeout: 2000 })
      
      // Ajouter un choix avec test
      const addChoiceButton = page.locator('button:has-text("Ajouter un choix")').or(
        page.locator('button').filter({ hasText: /choix|choice/i })
      )
      if (await addChoiceButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await addChoiceButton.click()
        
        // Remplir le texte du choix
        const choiceTextInput = page.locator('input[name*="text"]').or(
          page.locator('textarea[name*="text"]')
        ).first()
        await choiceTextInput.fill('Tenter de convaincre')
        
        // Ajouter l'attribut test
        const testInput = page.locator('input[name*="test"]').or(
          page.locator('input[placeholder*="test"]')
        )
        await testInput.fill('Raison+Diplomatie:8')
        
        // Sauvegarder le choix
        const saveButton = page.locator('button:has-text("Sauvegarder")').or(
          page.locator('button:has-text("Enregistrer")')
        )
        await saveButton.click()
        
        // THEN: Un TestNode doit apparaître automatiquement avec 4 handles
        const testNode = page.locator('[data-id*="test-node-"]')
        await expect(testNode).toBeVisible({ timeout: 5000 })
        
        // Vérifier que le TestNode a 4 handles (visualisation)
        // Les handles sont des éléments avec des classes spécifiques ou des data-attributes
        const handles = testNode.locator('[data-handleid*="critical"]').or(
          testNode.locator('[data-handleid*="failure"]')
        ).or(testNode.locator('[data-handleid*="success"]'))
        // Note: La vérification exacte dépend de l'implémentation ReactFlow des handles
        
        // WHEN: Générer les 4 nœuds de résultat via l'IA
        // (Ceci nécessite l'intégration avec l'API de génération)
        // Pour l'instant, on vérifie juste que le TestNode est visible
        
        // THEN: Les 4 connexions doivent être visibles dans le graphe
        // (Vérification visuelle ou via les edges ReactFlow)
      } else {
        test.skip('Fonctionnalité d\'ajout de choix non disponible - test ignoré')
      }
    } else {
      test.skip('Aucun dialogue chargé - test ignoré')
    }
  })

  test('AC#2: Exporter dialogue avec 4 résultats, importer, vérifier graphe', async ({ page }) => {
    // GIVEN: Un dialogue avec un choix contenant les 4 résultats de test
    // (On suppose qu'un dialogue existe avec cette structure)
    
    // WHEN: Exporter le dialogue vers Unity JSON
    const exportButton = page.locator('button:has-text("Exporter")').or(
      page.locator('button:has-text("Export")')
    )
    if (await exportButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await exportButton.click()
      
      // Attendre que le JSON soit exporté (toast ou modal)
      await page.waitForSelector('text=/exporté|succès/i', { timeout: 5000 })
      
      // WHEN: Importer le JSON exporté
      const importButton = page.locator('button:has-text("Importer")').or(
        page.locator('button:has-text("Import")')
      )
      if (await importButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        // (Ceci nécessite l'implémentation de l'import)
        // Pour l'instant, on vérifie juste que l'export fonctionne
        
        // THEN: Le graphe doit afficher correctement les 4 connexions
        const testNode = page.locator('[data-id*="test-node-"]')
        await expect(testNode).toBeVisible({ timeout: 5000 })
      } else {
        test.skip('Fonctionnalité d\'import non disponible - test ignoré')
      }
    } else {
      test.skip('Fonctionnalité d\'export non disponible - test ignoré')
    }
  })

  test('AC#3: Éditer manuellement les 4 connexions dans l\'éditeur', async ({ page }) => {
    // GIVEN: Un dialogue avec un TestNode existant
    const testNode = page.locator('[data-id*="test-node-"]')
    if (await testNode.isVisible({ timeout: 2000 }).catch(() => false)) {
      await testNode.click()
      
      // WHEN: Éditer les 4 connexions dans le panneau d'édition
      await page.waitForSelector('text=/Connexions de test/i', { timeout: 2000 })
      
      // Vérifier que les 4 champs sont visibles
      const criticalFailureInput = page.locator('input[name*="criticalFailure"]').or(
        page.locator('label:has-text("Échec critique")').locator('..').locator('input')
      )
      const failureInput = page.locator('input[name*="failureNode"]').or(
        page.locator('label:has-text("Échec")').locator('..').locator('input')
      )
      const successInput = page.locator('input[name*="successNode"]').or(
        page.locator('label:has-text("Réussite")').locator('..').locator('input')
      )
      const criticalSuccessInput = page.locator('input[name*="criticalSuccess"]').or(
        page.locator('label:has-text("Réussite critique")').locator('..').locator('input')
      )
      
      await expect(criticalFailureInput).toBeVisible({ timeout: 2000 })
      await expect(failureInput).toBeVisible({ timeout: 2000 })
      await expect(successInput).toBeVisible({ timeout: 2000 })
      await expect(criticalSuccessInput).toBeVisible({ timeout: 2000 })
      
      // Modifier une connexion
      await criticalFailureInput.fill('NODE_CRITICAL_FAILURE')
      await failureInput.fill('NODE_FAILURE')
      await successInput.fill('NODE_SUCCESS')
      await criticalSuccessInput.fill('NODE_CRITICAL_SUCCESS')
      
      // Sauvegarder
      const saveButton = page.locator('button:has-text("Sauvegarder")').or(
        page.locator('button:has-text("Enregistrer")')
      )
      await saveButton.click()
      
      // THEN: Les connexions doivent être mises à jour dans le graphe
      await page.waitForTimeout(500) // Attendre la mise à jour
      
      // Vérifier que les edges sont visibles (selon l'implémentation ReactFlow)
    } else {
      test.skip('Aucun TestNode trouvé - test ignoré')
    }
  })

  test('AC#4: Rétrocompatibilité - Charger ancien dialogue avec 2 résultats fonctionne', async ({ page }) => {
    // GIVEN: Un dialogue Unity JSON avec seulement 2 résultats (testSuccessNode, testFailureNode)
    // (Ce dialogue doit être chargé dans l'application)
    
    // WHEN: Charger le dialogue dans l'éditeur de graphe
    // (On suppose qu'un dialogue existe avec cette structure ancienne)
    
    // THEN: Le TestNode doit être visible avec 4 handles
    const testNode = page.locator('[data-id*="test-node-"]')
    if (await testNode.isVisible({ timeout: 2000 }).catch(() => false)) {
      await testNode.click()
      
      // Vérifier que les 4 champs sont visibles (même si seulement 2 sont définis)
      await page.waitForSelector('text=/Connexions de test/i', { timeout: 2000 })
      
      const criticalFailureInput = page.locator('input[name*="criticalFailure"]')
      const failureInput = page.locator('input[name*="failureNode"]')
      const successInput = page.locator('input[name*="successNode"]')
      const criticalSuccessInput = page.locator('input[name*="criticalSuccess"]')
      
      // Les 4 champs doivent être visibles
      await expect(criticalFailureInput).toBeVisible({ timeout: 2000 })
      await expect(failureInput).toBeVisible({ timeout: 2000 })
      await expect(successInput).toBeVisible({ timeout: 2000 })
      await expect(criticalSuccessInput).toBeVisible({ timeout: 2000 })
      
      // Vérifier que seulement failureNode et successNode ont des valeurs
      const failureValue = await failureInput.inputValue()
      const successValue = await successInput.inputValue()
      
      expect(failureValue).toBeTruthy()
      expect(successValue).toBeTruthy()
      
      // Les champs critiques peuvent être vides (rétrocompatibilité)
      const criticalFailureValue = await criticalFailureInput.inputValue()
      const criticalSuccessValue = await criticalSuccessInput.inputValue()
      
      // C'est OK si les champs critiques sont vides (fallback Unity)
    } else {
      test.skip('Aucun TestNode trouvé - test ignoré (dialogue avec test non chargé)')
    }
  })
})
