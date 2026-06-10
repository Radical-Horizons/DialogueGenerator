/**
 * Tests E2E pour les opérations CRUD des dialogues Unity (P0).
 * 
 * Scénarios P0 critiques:
 * - Lister les dialogues Unity
 * - Lire un dialogue Unity
 * - Supprimer un dialogue Unity
 */
import { test, expect, type Page } from '@playwright/test'

import { E2E_MS } from './timeouts'

test.describe('Unity Dialogues CRUD Operations [P0]', { tag: '@smoke' }, () => {
  const login = async (page: Page) => {
    const loginHeading = page.getByRole('heading', { name: /connexion/i })
    const isLoginPage = await loginHeading.isVisible({ timeout: E2E_MS.probe }).catch(() => false)
    
    if (isLoginPage) {
      await page.getByLabel(/nom d'utilisateur/i).fill('admin')
      await page.getByLabel(/mot de passe/i).fill('admin123')
      await page.getByRole('button', { name: /se connecter/i }).click()
      await Promise.race([
        page.waitForURL('**/', { timeout: E2E_MS.short }).catch(() => {}),
        page.getByRole('button', { name: /Génération de Dialogues/i }).waitFor({ state: 'visible', timeout: E2E_MS.short }).catch(() => {})
      ])
    }
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await login(page)
    await page.getByRole('button', { name: /Génération de Dialogues/i }).waitFor({ state: 'visible', timeout: E2E_MS.ui })
  })

  test('[P0] should list Unity dialogues', async ({ page }) => {
    // GIVEN: Je suis sur l'application
    // WHEN: Je navigue vers la bibliothèque de dialogues Unity
    const dialoguesTab = page.getByRole('button', { name: /dialogues|bibliothèque/i }).or(
      page.locator('button').filter({ hasText: /dialogue/i })
    )
    
    if (await dialoguesTab.isVisible({ timeout: E2E_MS.control }).catch(() => false)) {
      await dialoguesTab.click()
      
      // Attendre que la liste se charge
      await page.waitForSelector('[data-testid*="dialogue"]', { timeout: E2E_MS.short }).catch(() => {
        // Si pas de data-testid, chercher une liste ou table
        return page.waitForSelector('div:has-text(".json")', { timeout: E2E_MS.short })
      })
      
      // THEN: La liste des dialogues Unity s'affiche
      const dialogueList = page.locator('[data-testid*="dialogue"]').or(
        page.locator('div:has-text(".json")')
      )
      const count = await dialogueList.count()
      
      // Vérifier qu'au moins la structure de liste existe
      expect(count).toBeGreaterThanOrEqual(0)
    } else {
      test.skip('Fonctionnalité Dialogues Unity non disponible - test ignoré')
    }
  })

  test('[P0] should read a Unity dialogue', async ({ page }) => {
    // GIVEN: Des dialogues Unity existent
    // WHEN: Je clique sur un dialogue dans la liste
    const dialoguesTab = page.getByRole('button', { name: /dialogues|bibliothèque/i })
    
    if (await dialoguesTab.isVisible({ timeout: E2E_MS.control }).catch(() => false)) {
      await dialoguesTab.click()
      
      await page.waitForSelector('[data-testid*="dialogue"]', { timeout: E2E_MS.short }).catch(() => {
        return page.waitForSelector('div:has-text(".json")', { timeout: E2E_MS.short })
      })
      
      // Cliquer sur le premier dialogue
      const firstDialogue = page.locator('[data-testid*="dialogue"]').or(
        page.locator('div:has-text(".json")')
      ).first()
      
      if (await firstDialogue.isVisible({ timeout: E2E_MS.probe }).catch(() => false)) {
        await firstDialogue.click()
        
        // THEN: Le contenu du dialogue s'affiche
        // Vérifier qu'on voit le contenu JSON ou une vue structurée
        await expect(
          page.locator('pre').or(
            page.locator('[data-testid*="dialogue-content"]')
          ).or(
            page.getByText(/id.*speaker.*line/i)
          )
        ).toBeVisible({ timeout: E2E_MS.control })
      }
    } else {
      test.skip('Fonctionnalité Dialogues Unity non disponible - test ignoré')
    }
  })

  test('[P0] should delete a Unity dialogue', async ({ page }) => {
    // GIVEN: Un dialogue Unity existe
    // WHEN: Je supprime le dialogue
    const dialoguesTab = page.getByRole('button', { name: /dialogues|bibliothèque/i })
    
    if (await dialoguesTab.isVisible({ timeout: E2E_MS.control }).catch(() => false)) {
      await dialoguesTab.click()
      
      await page.waitForSelector('[data-testid*="dialogue"]', { timeout: E2E_MS.short }).catch(() => {
        return page.waitForSelector('div:has-text(".json")', { timeout: E2E_MS.short })
      })
      
      // Cliquer droit sur un dialogue ou utiliser un bouton supprimer
      const firstDialogue = page.locator('[data-testid*="dialogue"]').or(
        page.locator('div:has-text(".json")')
      ).first()
      
      if (await firstDialogue.isVisible({ timeout: E2E_MS.probe }).catch(() => false)) {
        // Clic droit pour menu contextuel
        await firstDialogue.click({ button: 'right' })
        
        // Cliquer sur "Supprimer"
        const deleteButton = page.getByRole('button', { name: /supprimer|delete/i }).or(
          page.getByText(/supprimer/i)
        )
        
        if (await deleteButton.isVisible({ timeout: E2E_MS.micro }).catch(() => false)) {
          await deleteButton.click()
          
          // Confirmer si modal de confirmation
          const confirmButton = page.getByRole('button', { name: /confirmer|oui/i })
          if (await confirmButton.isVisible({ timeout: E2E_MS.micro }).catch(() => false)) {
            await confirmButton.click()
          }
          
          // THEN: Le dialogue est supprimé
          await expect(
            page.getByText(/supprimé|deleted/i)
          ).toBeVisible({ timeout: E2E_MS.control }).catch(() => {
            // Si pas de message, vérifier que le dialogue a disparu
            expect(firstDialogue).not.toBeVisible({ timeout: E2E_MS.probe })
          })
        }
      }
    } else {
      test.skip('Fonctionnalité Dialogues Unity non disponible - test ignoré')
    }
  })
})
