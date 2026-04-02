/**
 * Setup E2E : login une fois et enregistre l'état de session (cookies + localStorage).
 * Les projets qui en dépendent démarrent déjà connectés (admin).
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { test as setup, expect } from '@playwright/test'

import { E2E_MS } from './timeouts'

const AUTH_FILE = 'e2e/.auth/user.json'

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: /se connecter/i })).toBeVisible({ timeout: E2E_MS.ui })
  await page.getByLabel(/nom d'utilisateur/i).fill('admin')
  await page.getByLabel(/mot de passe/i).fill('admin123')
  await page.getByRole('button', { name: /se connecter/i }).click()
  await expect(page).toHaveURL('/', { timeout: E2E_MS.authRedirect })
  const state = await page.context().storageState()
  const abs = path.resolve(AUTH_FILE)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  const tmp = `${abs}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf-8')
  fs.renameSync(tmp, abs)
})
