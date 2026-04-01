import type { Page } from '@playwright/test'

declare global {
  interface Window {
    __graphViewStoreE2E?: { getState: () => { requestSave: () => void } }
  }
}

/**
 * Déclenche la même action que la toolbar / Ctrl+S : `graphViewStore.requestSave()`.
 * Nécessite le front en mode dev (`window.__graphViewStoreE2E` défini dans graphViewStore).
 */
export async function triggerGraphSave(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = window.__graphViewStoreE2E
    if (!api) {
      throw new Error(
        'window.__graphViewStoreE2E absent — lancer Vite en dev (import.meta.env.DEV) pour les E2E.'
      )
    }
    api.getState().requestSave()
  })
}
