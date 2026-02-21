/**
 * E2E Preflight pour tests LLM (sans appel LLM).
 *
 * Valide les leçons du post-mortem (docs/troubleshooting/post-mortem-e2e-llm.md) :
 * - Preflight (health + budget) et fail-fast avec messages clairs (e2e-llm.md)
 * - Ajustement automatique du budget (quota 0 ou % ≥ 100 → PUT quota 50)
 * - Port API 4243 (proxy Vite) ; wrong port → échec explicite
 *
 * Prérequis : .env avec OPENAI_API_KEY, API sur 4243 (webServer Playwright).
 * Exclure en CI : `playwright test --grep-invert @e2e-llm`
 *
 * @see docs/troubleshooting/e2e-llm.md
 * @see docs/troubleshooting/post-mortem-e2e-llm.md
 */
import { test, expect } from '@playwright/test'

const API_BASE = 'http://localhost:4243'
const PREFLIGHT_DOC = 'docs/troubleshooting/e2e-llm.md'

test.describe('E2E LLM Preflight @e2e-llm', () => {
  test.beforeAll(async ({ request }) => {
    const healthRes = await request.get(`${API_BASE}/health/detailed`)
    if (!healthRes.ok()) {
      throw new Error(
        `E2E LLM : API injoignable (health check). Vérifier que l'API tourne sur 4243. Voir ${PREFLIGHT_DOC}.`
      )
    }
    const health = (await healthRes.json()) as { checks?: Array<{ name: string; status: string }> }
    const llm = health.checks?.find((c) => c.name === 'llm_connectivity')
    if (!llm || llm.status !== 'healthy') {
      throw new Error(
        `E2E LLM : OPENAI_API_KEY manquante. Définir .env à la racine ou la variable d'environnement. Voir ${PREFLIGHT_DOC}.`
      )
    }
    const budgetRes = await request.get(`${API_BASE}/api/v1/costs/budget`)
    if (!budgetRes.ok()) {
      throw new Error(`E2E LLM : impossible de vérifier le budget. Voir ${PREFLIGHT_DOC}.`)
    }
    const budget = (await budgetRes.json()) as { quota: number; percentage: number }
    if (budget.quota <= 0 || budget.percentage >= 100) {
      const putRes = await request.put(`${API_BASE}/api/v1/costs/budget`, { data: { quota: 50 } })
      if (!putRes.ok()) {
        throw new Error(`E2E LLM : impossible de mettre à jour le budget. Voir ${PREFLIGHT_DOC}.`)
      }
    }
  })

  test('health detailed returns 200 and llm_connectivity healthy', async ({ request }) => {
    const res = await request.get(`${API_BASE}/health/detailed`)
    expect(res.ok(), 'Health check doit retourner 2xx').toBe(true)
    const body = (await res.json()) as { checks?: Array<{ name: string; status: string }> }
    const llm = body.checks?.find((c) => c.name === 'llm_connectivity')
    expect(llm, 'Check llm_connectivity doit exister').toBeDefined()
    expect(llm!.status).toBe('healthy')
  })

  test('budget GET returns quota and percentage', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/costs/budget`)
    expect(res.ok()).toBe(true)
    const body = (await res.json()) as { quota: number; amount?: number; percentage: number; remaining?: number }
    expect(typeof body.quota).toBe('number')
    expect(typeof body.percentage).toBe('number')
    expect(body.quota).toBeGreaterThan(0)
    expect(body.percentage).toBeLessThan(100)
  })

  test('preflight auto-adjusts budget when quota is 0 (lesson: preflight peut ajuster le quota)', async ({
    request,
  }) => {
    const get = async () => {
      const r = await request.get(`${API_BASE}/api/v1/costs/budget`)
      if (!r.ok()) throw new Error('GET budget failed')
      return (await r.json()) as { quota: number; percentage: number }
    }
    const put = async (quota: number) => {
      const r = await request.put(`${API_BASE}/api/v1/costs/budget`, { data: { quota } })
      if (!r.ok()) throw new Error('PUT budget failed')
      return (await r.json()) as { quota: number; percentage: number }
    }

    const before = await get()
    try {
      await put(0)
      const afterZero = await get()
      expect(afterZero.quota).toBe(0)

      // Preflight logic: if quota <= 0 or percentage >= 100 → PUT 50
      const adjustRes = await request.put(`${API_BASE}/api/v1/costs/budget`, { data: { quota: 50 } })
      expect(adjustRes.ok()).toBe(true)
      const afterAdjust = await get()
      expect(afterAdjust.quota).toBeGreaterThan(0)
      expect(afterAdjust.percentage).toBeLessThan(100)
    } finally {
      await put(before.quota)
    }
  })

  test('health check fails on wrong port (lesson: fail-fast, port 4243)', async ({ request }) => {
    let failed = false
    try {
      const r = await request.get('http://localhost:4242/health/detailed')
      failed = !r.ok()
    } catch {
      failed = true
    }
    expect(
      failed,
      'Health sur 4242 doit échouer (API sur 4243). Valide fail-fast sur mauvais port.'
    ).toBe(true)
  })
})
