import { test, expect } from '@playwright/test'

test.describe('PWA installability (prod build smoke)', () => {
  test('enregistre un service worker et expose un manifest', async ({ page, request }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const manifestHref = await page.locator('link[rel="manifest"]').first().getAttribute('href')
    expect(manifestHref).toBeTruthy()

    const manifestUrl = new URL(String(manifestHref), page.url()).toString()
    const manifestRes = await request.get(manifestUrl)
    expect(manifestRes.status()).toBe(200)

    const manifestJson = (await manifestRes.json()) as { icons?: Array<{ src?: string; sizes?: string }> }
    const icons = manifestJson.icons ?? []
    expect(icons.some((i) => i.sizes === '192x192' && typeof i.src === 'string')).toBe(true)
    expect(icons.some((i) => i.sizes === '512x512' && typeof i.src === 'string')).toBe(true)

    // Production build should auto-register via vite-plugin-pwa (injectRegister: 'auto').
    await page.waitForFunction(
      async () => {
        const regs = await navigator.serviceWorker.getRegistrations()
        return regs.length > 0
      },
      { timeout: 15_000 }
    )

    const swScriptUrl = await page.evaluate(async () => {
      const regs = await navigator.serviceWorker.getRegistrations()
      const r = regs[0]
      if (!r) return null
      const sw = r.active ?? r.waiting ?? r.installing
      return sw?.scriptURL ?? null
    })
    expect(swScriptUrl).toBeTruthy()

    const swRes = await request.get(String(swScriptUrl))
    expect(swRes.status()).toBe(200)
  })
})

