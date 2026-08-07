/**
 * Tests BudgetSettings — persistance via apply() (bouton Appliquer parent).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRef } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BudgetSettings, type BudgetSettingsHandle } from './BudgetSettings'
import * as costsAPI from '../../api/costs'

vi.mock('../../api/costs', () => ({
  getBudget: vi.fn(),
  updateBudget: vi.fn(),
}))

const mockGetBudget = vi.mocked(costsAPI.getBudget)
const mockUpdateBudget = vi.mocked(costsAPI.updateBudget)

const baseBudget = {
  quota: 100,
  amount: 10,
  remaining: 90,
  percentage: 10,
}

describe('BudgetSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetBudget.mockResolvedValue(baseBudget)
    mockUpdateBudget.mockResolvedValue({ ...baseBudget, quota: 150, remaining: 140 })
  })

  it('n’affiche pas de bouton Sauvegarder', async () => {
    render(<BudgetSettings />)
    await waitFor(() => {
      expect(screen.getByLabelText(/Quota mensuel/i)).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /Sauvegarder/i })).not.toBeInTheDocument()
  })

  it('apply() persiste le quota modifié', async () => {
    const user = userEvent.setup()
    const ref = createRef<BudgetSettingsHandle>()
    render(<BudgetSettings ref={ref} />)

    const input = await screen.findByLabelText(/Quota mensuel/i)
    await user.clear(input)
    await user.type(input, '150')

    const ok = await ref.current!.apply()
    expect(ok).toBe(true)
    expect(mockUpdateBudget).toHaveBeenCalledWith(150)
  })

  it('apply() ne appelle pas l’API si le quota est inchangé', async () => {
    const ref = createRef<BudgetSettingsHandle>()
    render(<BudgetSettings ref={ref} />)
    await screen.findByLabelText(/Quota mensuel/i)

    const ok = await ref.current!.apply()
    expect(ok).toBe(true)
    expect(mockUpdateBudget).not.toHaveBeenCalled()
  })

  it('apply() refuse un quota invalide et reste en erreur', async () => {
    const user = userEvent.setup()
    const ref = createRef<BudgetSettingsHandle>()
    render(<BudgetSettings ref={ref} />)

    const input = await screen.findByLabelText(/Quota mensuel/i)
    await user.clear(input)
    await user.type(input, '-5')

    const ok = await ref.current!.apply()
    expect(ok).toBe(false)
    expect(mockUpdateBudget).not.toHaveBeenCalled()
    // Espace insécable typographique avant le deux-points : matcher le mot seul.
    expect(screen.getByText(/Erreur\s*:/i)).toBeInTheDocument()
  })
})
