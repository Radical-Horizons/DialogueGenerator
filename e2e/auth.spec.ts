import { test, expect } from '@playwright/test'

import { E2E_MS } from './timeouts'

test.describe('Authentification', { tag: '@smoke' }, () => {
  test('cold /login : bouton Se connecter actif (pas coincé sur Connexion...)', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()
    // Régression prod : isLoading restait true si initialize() n'était pas appelé hors ProtectedRoute
    await expect(page.getByRole('button', { name: /se connecter/i })).toBeEnabled({
      timeout: E2E_MS.ui,
    })
    await expect(page.getByRole('button', { name: /connexion\.\.\./i })).toHaveCount(0)
    await expect(page.getByTestId('continue-as-guest')).toBeEnabled()
  })

  test('doit afficher le formulaire de connexion', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()
    await expect(page.getByLabel(/nom d'utilisateur/i)).toBeVisible()
    await expect(page.getByLabel(/mot de passe/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /se connecter/i })).toBeVisible()
  })

  test('doit se connecter avec les bonnes credentials', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /se connecter/i })).toBeEnabled({
      timeout: E2E_MS.ui,
    })

    await page.getByLabel(/nom d'utilisateur/i).fill('admin')
    await page.getByLabel(/mot de passe/i).fill('admin123')
    await page.getByRole('button', { name: /se connecter/i }).click()
    await expect(page).toHaveURL('/', { timeout: E2E_MS.authRedirect })

    const userMenuButton = page.getByRole('button', { name: /menu utilisateur admin/i })
    await expect(userMenuButton).toBeVisible()
    await userMenuButton.click()
    await expect(page.getByText(/connecté en tant que/i)).toBeVisible()
    await expect(page.getByText(/^admin$/i)).toBeVisible()
  })

  test('doit afficher une erreur avec de mauvaises credentials', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /se connecter/i })).toBeEnabled({
      timeout: E2E_MS.ui,
    })
    await page.getByLabel(/nom d'utilisateur/i).fill('wrong')
    await page.getByLabel(/mot de passe/i).fill('wrong')
    await page.getByRole('button', { name: /se connecter/i }).click()

    await expect(
      page.getByText(/nom d'utilisateur ou mot de passe incorrect|401|incorrect/i)
    ).toBeVisible({ timeout: E2E_MS.ui })
  })
})
