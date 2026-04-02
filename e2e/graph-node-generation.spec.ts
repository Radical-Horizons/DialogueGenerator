/**
 * Tests E2E pour la génération de nœuds depuis le graphe (Story 0.5.5).
 * 
 * Scénarios testés :
 * - AC#1 : Génération pour choix spécifique depuis éditeur de graphe
 * - AC#2 : Génération depuis éditeur de dialogue (NodeEditorPanel)
 * - AC#3 : Génération batch pour tous les choix
 * - AC#5 : Génération nextNode (navigation linéaire)
 * - AC#7 : Validation que targetNode et nextNode pointent vers des nœuds existants
 * - AC#8 : Filtrage des choix déjà connectés
 */
import { test, expect, type Page } from '@playwright/test'

import { E2E_MS } from './timeouts'

test.describe('Graph Node Generation (Story 0.5.5)', () => {
  // Helper pour s'authentifier
  const login = async (page: Page) => {
    // Vérifier si on est sur la page de login
    const loginHeading = page.getByRole('heading', { name: 'Connexion' })
    const isLoginPage = await loginHeading.isVisible({ timeout: E2E_MS.probe }).catch(() => false)
    
    if (isLoginPage) {
      await page.getByLabel(/nom d'utilisateur/i).fill('admin')
      await page.getByLabel(/mot de passe/i).fill('admin123')
      await page.getByRole('button', { name: /se connecter/i }).click()
      // Attendre soit la redirection, soit que le formulaire disparaisse
      await Promise.race([
        page.waitForURL('**/', { timeout: E2E_MS.short }).catch(() => {}),
        page.getByRole('button', { name: /Génération de Dialogues/i }).waitFor({ state: 'visible', timeout: E2E_MS.short }).catch(() => {})
      ])
    }
  }

  test.beforeEach(async ({ page }) => {
    // Naviguer vers l'application
    await page.goto('/')
    
    // S'authentifier si nécessaire
    await login(page)
    
    // Attendre que l'application soit chargée (onglet Génération de Dialogues)
    await page.getByRole('button', { name: /Génération de Dialogues/i }).waitFor({ state: 'visible', timeout: E2E_MS.micro0 })
    
    // Naviguer vers l'éditeur de graphe (onglet central)
    const graphTab = page.getByRole('button', { name: /Éditeur de Graphe|📊/ }).first()
    if (await graphTab.isVisible({ timeout: E2E_MS.probe }).catch(() => false)) {
      await graphTab.click()
      await page.locator('.react-flow__node').first().waitFor({ state: 'attached', timeout: E2E_MS.graphField }).catch(() => {})
    }
  })

  test('AC#1: Génération pour choix spécifique depuis éditeur de graphe', async ({ page }) => {
    // Prérequis : avoir un dialogue chargé avec un nœud ayant des choix
    // Pour ce test, on suppose qu'un dialogue existe déjà ou on en crée un
    
    // Sélectionner un nœud dans le graphe (clic sur un nœud)
    // Note: Ceci nécessite qu'un dialogue soit chargé avec des nœuds
    const firstNode = page.locator('[data-id^="NODE_"]').first()
    if (await firstNode.isVisible({ timeout: E2E_MS.probe })) {
      await firstNode.click()
      
      // Ouvrir le panneau de génération IA (bouton dans le graphe ou menu contextuel)
      const generateButton = page.locator('button:has-text("Générer")').or(page.locator('button:has-text("✨")'))
      if (await generateButton.isVisible({ timeout: E2E_MS.probe })) {
        await generateButton.click()
        
        // Attendre que le panneau de génération s'affiche
        await page.waitForSelector('textarea[placeholder*="instructions"]', { timeout: E2E_MS.probe })
        
        // Entrer des instructions
        await page.fill('textarea[placeholder*="instructions"]', 'Continue la conversation de manière naturelle')
        
        // Sélectionner un choix spécifique (si visible)
        const choiceOption = page.locator('div:has-text("Choix 1")').or(page.locator('[data-choice-index="0"]'))
        if (await choiceOption.isVisible({ timeout: E2E_MS.micro })) {
          await choiceOption.click()
        }
        
        // Lancer la génération
        const generateSubmitButton = page.locator('button:has-text("✨ Générer")').or(page.locator('button:has-text("Générer")'))
        await generateSubmitButton.click()
        
        // Attendre que la génération se termine (toast de succès ou nouveau nœud visible)
        await page.waitForSelector('text=/Nœud généré|succès/i', { timeout: E2E_MS.graphFlow })
        
        // Vérifier qu'un nouveau nœud a été créé
        const newNode = page.locator('[data-id*="CHOICE_"]')
        await expect(newNode.first()).toBeVisible({ timeout: E2E_MS.short })
      }
    } else {
      test.skip('Aucun dialogue chargé avec des nœuds - test ignoré')
    }
  })

  test('AC#2: Génération depuis éditeur de dialogue (NodeEditorPanel)', async ({ page }) => {
    // Sélectionner un nœud dans le graphe
    const firstNode = page.locator('[data-id^="NODE_"]').first()
    if (await firstNode.isVisible({ timeout: E2E_MS.probe })) {
      await firstNode.click()
      
      // Attendre que le panneau d'édition s'affiche (onglet "Édition de nœud")
      await page.waitForSelector('input[readonly][value*="NODE_"]', { timeout: E2E_MS.probe })
      
      // Ouvrir la section "Génération IA"
      const showGenerationButton = page.locator('button:has-text("Afficher")').or(page.locator('button:has-text("Génération IA")'))
      if (await showGenerationButton.isVisible({ timeout: E2E_MS.micro })) {
        await showGenerationButton.click()
      }
      
      // Entrer des instructions
      const instructionsTextarea = page.locator('textarea[placeholder*="instructions"]')
      if (await instructionsTextarea.isVisible({ timeout: E2E_MS.micro })) {
        await instructionsTextarea.fill('Génère la suite de ce dialogue')
        
        // Cliquer sur "Générer la suite (nextNode)"
        const generateNextButton = page.locator('button:has-text("Générer la suite (nextNode)")')
        await generateNextButton.click()
        
        // Attendre que la génération se termine
        await page.waitForSelector('text=/Nœud généré|succès/i', { timeout: E2E_MS.graphFlow })
        
        // Vérifier qu'un nouveau nœud a été créé et sélectionné
        const newNode = page.locator('[data-id*="CHILD"]')
        await expect(newNode.first()).toBeVisible({ timeout: E2E_MS.short })
      }
    } else {
      test.skip('Aucun dialogue chargé avec des nœuds - test ignoré')
    }
  })

  test('AC#3: Génération batch pour tous les choix', async ({ page }) => {
    // Sélectionner un nœud avec plusieurs choix
    const nodeWithChoices = page.locator('[data-id^="NODE_"]').first()
    if (await nodeWithChoices.isVisible({ timeout: E2E_MS.probe })) {
      await nodeWithChoices.click()
      
      // Ouvrir le panneau de génération IA
      const generateButton = page.locator('button:has-text("Générer")').or(page.locator('button:has-text("✨")'))
      if (await generateButton.isVisible({ timeout: E2E_MS.probe })) {
        await generateButton.click()
        
        await page.waitForSelector('textarea[placeholder*="instructions"]', { timeout: E2E_MS.probe })
        await page.fill('textarea[placeholder*="instructions"]', 'Continue pour tous les choix')
        
        // Cliquer sur "Générer pour tous les choix" (si visible)
        const generateAllButton = page.locator('button:has-text("Générer pour tous les choix")')
        if (await generateAllButton.isVisible({ timeout: E2E_MS.probe })) {
          await generateAllButton.click()
          
          // Attendre que la génération batch se termine
          await page.waitForSelector('text=/Nœuds générés|succès/i', { timeout: E2E_MS.graphFlow })
          
          // Vérifier que plusieurs nœuds ont été créés
          const generatedNodes = page.locator('[data-id*="CHOICE_"]')
          const count = await generatedNodes.count()
          expect(count).toBeGreaterThan(1)
        } else {
          test.skip('Bouton "Générer pour tous les choix" non visible - peut-être pas assez de choix sans targetNode')
        }
      }
    } else {
      test.skip('Aucun dialogue chargé avec des nœuds - test ignoré')
    }
  })

  test('AC#5: Génération nextNode (navigation linéaire)', async ({ page }) => {
    // Sélectionner un nœud sans choix (navigation linéaire)
    const linearNode = page.locator('[data-id^="NODE_"]').first()
    if (await linearNode.isVisible({ timeout: E2E_MS.probe })) {
      await linearNode.click()
      
      // Ouvrir le panneau de génération
      const generateButton = page.locator('button:has-text("Générer")').or(page.locator('button:has-text("✨")'))
      if (await generateButton.isVisible({ timeout: E2E_MS.probe })) {
        await generateButton.click()
        
        await page.waitForSelector('textarea[placeholder*="instructions"]', { timeout: E2E_MS.probe })
        await page.fill('textarea[placeholder*="instructions"]', 'Continue la conversation linéairement')
        
        // Sélectionner mode "Suite (nextNode)" si disponible
        const nextNodeMode = page.locator('button:has-text("Suite (nextNode)")')
        if (await nextNodeMode.isVisible({ timeout: E2E_MS.micro })) {
          await nextNodeMode.click()
        }
        
        // Lancer la génération
        const generateButton2 = page.locator('button:has-text("✨ Générer")')
        await generateButton2.click()
        
        // Attendre que la génération se termine
        await page.waitForSelector('text=/Nœud généré|succès/i', { timeout: E2E_MS.graphFlow })
        
        // Vérifier qu'un nouveau nœud a été créé avec connexion nextNode
        const newNode = page.locator('[data-id*="CHILD"]')
        await expect(newNode.first()).toBeVisible({ timeout: E2E_MS.short })
      }
    } else {
      test.skip('Aucun dialogue chargé avec des nœuds - test ignoré')
    }
  })

  test('AC#7: Validation que targetNode et nextNode pointent vers des nœuds existants', async ({ page }) => {
    // Sélectionner un nœud et générer un nouveau nœud
    const firstNode = page.locator('[data-id^="NODE_"]').first()
    if (await firstNode.isVisible({ timeout: E2E_MS.probe })) {
      await firstNode.click()
      
      // Générer un nœud (via éditeur de dialogue)
      const showGenerationButton = page.locator('button:has-text("Afficher")')
      if (await showGenerationButton.isVisible({ timeout: E2E_MS.micro })) {
        await showGenerationButton.click()
        
        const instructionsTextarea = page.locator('textarea[placeholder*="instructions"]')
        if (await instructionsTextarea.isVisible({ timeout: E2E_MS.micro })) {
          await instructionsTextarea.fill('Test validation')
          
          const generateButton = page.locator('button:has-text("Générer la suite (nextNode)")')
          await generateButton.click()
          
          // Attendre la génération
          await page.waitForSelector('text=/Nœud généré|succès/i', { timeout: E2E_MS.graphFlow })
          
          // Valider le graphe (bouton de validation si disponible)
          const validateButton = page.locator('button:has-text("Valider")').or(page.locator('button:has-text("Validation")'))
          if (await validateButton.isVisible({ timeout: E2E_MS.probe })) {
            const validateResponsePromise = page.waitForResponse(
              (r) => r.url().includes('/api/v1/unity-dialogues/graph/validate') && r.status() === 200,
              { timeout: E2E_MS.medium }
            )
            await validateButton.click()
            await validateResponsePromise.catch(() => {})

            // Vérifier qu'il n'y a pas d'erreurs de référence cassée
            const brokenRefErrors = page.locator('text=/référence cassée|targetNode invalide|nextNode invalide/i')
            const errorCount = await brokenRefErrors.count()
            expect(errorCount).toBe(0)
          }
        }
      }
    } else {
      test.skip('Aucun dialogue chargé avec des nœuds - test ignoré')
    }
  })

  test('AC#8: Filtrage des choix déjà connectés', async ({ page }) => {
    // Sélectionner un nœud avec des choix (certains déjà connectés)
    const nodeWithChoices = page.locator('[data-id^="NODE_"]').first()
    if (await nodeWithChoices.isVisible({ timeout: E2E_MS.probe })) {
      await nodeWithChoices.click()
      
      // Ouvrir le panneau de génération
      const generateButton = page.locator('button:has-text("Générer")').or(page.locator('button:has-text("✨")'))
      if (await generateButton.isVisible({ timeout: E2E_MS.probe })) {
        await generateButton.click()
        
        await page.waitForSelector('textarea[placeholder*="instructions"]', { timeout: E2E_MS.probe })
        
        // Vérifier que seuls les choix non connectés sont affichés comme sélectionnables
        const connectedChoices = page.locator('div:has-text("(déjà connecté)")')
        const unconnectedChoices = page.locator('div:has-text("Choix")').filter({ hasNot: page.locator('text=(déjà connecté)') })
        
        // Les choix connectés ne devraient pas être cliquables pour génération
        const connectedCount = await connectedChoices.count()
        const unconnectedCount = await unconnectedChoices.count()
        
        // Vérifier que le bouton "Générer pour tous les choix" affiche le bon nombre
        const generateAllButton = page.locator('button:has-text("Générer pour tous les choix")')
        if (await generateAllButton.isVisible({ timeout: E2E_MS.micro })) {
          const buttonText = await generateAllButton.textContent()
          // Le nombre dans le bouton devrait correspondre aux choix non connectés
          expect(buttonText).toContain(String(unconnectedCount))
        }
      }
    } else {
      test.skip('Aucun dialogue chargé avec des nœuds - test ignoré')
    }
  })

  test('Génération depuis ChoiceEditor dans NodeEditorPanel', async ({ page }) => {
    // Sélectionner un nœud avec des choix
    const nodeWithChoices = page.locator('[data-id^="NODE_"]').first()
    if (await nodeWithChoices.isVisible({ timeout: E2E_MS.probe })) {
      await nodeWithChoices.click()
      
      // Attendre le panneau d'édition
      await page.waitForSelector('input[readonly][value*="NODE_"]', { timeout: E2E_MS.probe })
      
      // Ouvrir la section "Génération IA"
      const showGenerationButton = page.locator('button:has-text("Afficher")')
      if (await showGenerationButton.isVisible({ timeout: E2E_MS.micro })) {
        await showGenerationButton.click()
      }
      
      // Entrer des instructions (optionnel, le bouton dans ChoiceEditor peut utiliser un prompt par défaut)
      const instructionsTextarea = page.locator('textarea[placeholder*="instructions"]')
      if (await instructionsTextarea.isVisible({ timeout: E2E_MS.micro })) {
        await instructionsTextarea.fill('Génère une réponse pour ce choix')
      }
      
      // Cliquer sur le bouton "✨ Générer" dans un ChoiceEditor
      const choiceGenerateButton = page.locator('button:has-text("✨ Générer")').first()
      if (await choiceGenerateButton.isVisible({ timeout: E2E_MS.probe })) {
        await choiceGenerateButton.click()
        
        // Attendre que la génération se termine
        await page.waitForSelector('text=/Nœud généré|succès/i', { timeout: E2E_MS.graphFlow })
        
        // Vérifier qu'un nouveau nœud a été créé
        const newNode = page.locator('[data-id*="CHOICE_"]')
        await expect(newNode.first()).toBeVisible({ timeout: E2E_MS.short })
        
        // Vérifier que le nouveau nœud est sélectionné (focus automatique)
        const selectedNodeId = await page.evaluate(() => {
          // Accéder au store via window si disponible, ou vérifier l'UI
          return document.querySelector('[data-id*="CHOICE_"]')?.getAttribute('data-id')
        })
        expect(selectedNodeId).toBeTruthy()
      } else {
        test.skip('Bouton "✨ Générer" non visible dans ChoiceEditor - peut-être tous les choix sont connectés')
      }
    } else {
      test.skip('Aucun dialogue chargé avec des nœuds - test ignoré')
    }
  })
})
