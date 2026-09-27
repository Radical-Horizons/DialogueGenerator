/**
 * Messages de budget : le quota est tenu en **dollars** côté backend
 * (`DEFAULT_MONTHLY_LLM_QUOTA_USD`) — le montant restant ne doit pas être étiqueté en euros.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCostGovernance } from './useCostGovernance'
import { getBudget } from '../api/costs'

const toast = vi.fn()

vi.mock('../api/costs', () => ({
  getBudget: vi.fn(),
}))

vi.mock('../components/shared/Toast', () => ({
  useToast: () => toast,
}))

const mockGetBudget = vi.mocked(getBudget)

describe('useCostGovernance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('avertit à 90 % avec le reste en dollars, au format français', async () => {
    mockGetBudget.mockResolvedValue({ quota: 10, amount: 9.18, percentage: 91.8, remaining: 0.82 })
    const { result } = renderHook(() => useCostGovernance())

    let check: Awaited<ReturnType<typeof result.current.checkBudget>> | undefined
    await act(async () => {
      check = await result.current.checkBudget()
    })

    expect(check?.allowed).toBe(true)
    expect(check?.message).toBe('Budget atteint à 91,8\u00a0% — 0,82\u00a0$ restants')
    expect(check?.message).not.toContain('€')
    expect(toast).toHaveBeenCalledWith(check?.message, 'warning', 5000)
  })

  it('bloque à 100 % avec le pourcentage au format français', async () => {
    mockGetBudget.mockResolvedValue({ quota: 10, amount: 10, percentage: 100, remaining: 0 })
    const { result } = renderHook(() => useCostGovernance())

    let check: Awaited<ReturnType<typeof result.current.checkBudget>> | undefined
    await act(async () => {
      check = await result.current.checkBudget()
    })

    expect(check?.allowed).toBe(false)
    expect(check?.message).toMatch(/^Budget dépassé \(100,0\u00a0%\)/)
  })
})
