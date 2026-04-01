import { test, expect } from '@playwright/test'

test.describe('Authentification', () => {
  test('doit afficher le formulaire de connexion', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()
    await expect(page.getByLabel(/nom d'utilisateur/i)).toBeVisible()
    await expect(page.getByLabel(/mot de passe/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /se connecter/i })).toBeVisible()
  })

  test('doit se connecter avec les bonnes credentials', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /se connecter/i })).toBeVisible()

    await page.getByLabel(/nom d'utilisateur/i).fill('admin')
    await page.getByLabel(/mot de passe/i).fill('admin123')
    await page.getByRole('button', { name: /se connecter/i }).click()
    await expect(page).toHaveURL('/', { timeout: 20000 })

    const userMenuButton = page.getByRole('button', { name: /menu utilisateur admin/i })
    await expect(userMenuButton).toBeVisible()
    await userMenuButton.click()
    await expect(page.getByText(/connecté en tant que/i)).toBeVisible()
    await expect(page.getByText(/^admin$/i)).toBeVisible()
  })

  test('doit afficher une erreur avec de mauvaises credentials', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/nom d'utilisateur/i).fill('wrong')
    await page.getByLabel(/mot de passe/i).fill('wrong')
    await page.getByRole('button', { name: /se connecter/i }).click()

    await expect(
      page.getByText(/nom d'utilisateur ou mot de passe incorrect|401|incorrect/i)
    ).toBeVisible({ timeout: 10000 })
  })
})
