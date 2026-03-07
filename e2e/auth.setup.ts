/**
 * Setup E2E : login une fois et enregistre l'état de session (cookies + localStorage).
 * Les projets qui en dépendent démarrent déjà connectés (admin).
 */
import { test as setup, expect } from '@playwright/test'

const AUTH_FILE = 'e2e/.auth/user.json'

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: /se connecter/i })).toBeVisible({ timeout: 10000 })
  const loginResponse = page.waitForResponse(
    (res) => res.url().includes('/api/v1/auth/login') && res.request().method() === 'POST',
    { timeout: 15000 }
  )
  await page.getByLabel(/nom d'utilisateur/i).fill('admin')
  await page.getByLabel(/mot de passe/i).fill('admin123')
  await page.getByRole('button', { name: /se connecter/i }).click()
  const res = await loginResponse
  expect(res.status()).toBe(200)
  await expect(page).toHaveURL('/', { timeout: 10000 })
  await page.context().storageState({ path: AUTH_FILE })
})
