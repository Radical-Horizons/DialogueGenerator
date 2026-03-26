/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { GddNotionSyncSection } from './GddNotionSyncSection'

const mockGetStatus = vi.fn()
const mockPostSync = vi.fn()
const mockPostTest = vi.fn()

vi.mock('../../api/gddNotionSync', () => ({
  getGddNotionSyncStatus: (...a: unknown[]) => mockGetStatus(...a),
  postGddNotionSync: (...a: unknown[]) => mockPostSync(...a),
  postGddNotionTestConnection: (...a: unknown[]) => mockPostTest(...a),
}))

describe('GddNotionSyncSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetStatus.mockResolvedValue({
      last_started_at: null,
      last_finished_at: null,
      last_success: null,
      message: '',
      updated_entities: 0,
      partial_errors: [],
    })
  })

  it('affiche chargement puis succès sur Synchroniser maintenant', async () => {
    const user = userEvent.setup()
    mockPostSync.mockResolvedValue({
      success: true,
      message: '1 entité(s) mise(s) à jour',
      updated_entities: 1,
      partial_errors: [],
    })
    render(<GddNotionSyncSection />)
    await screen.findByRole('button', { name: /Synchroniser maintenant/i })
    await user.click(screen.getByRole('button', { name: /Synchroniser maintenant/i }))
    await waitFor(() => {
      expect(screen.getByText(/1 entité/i)).toBeInTheDocument()
    })
    expect(mockPostSync).toHaveBeenCalled()
  })

  it('affiche erreur lisible si la sync échoue', async () => {
    const user = userEvent.setup()
    mockPostSync.mockResolvedValue({
      success: false,
      message: 'Sync Notion échouée — réseau',
      updated_entities: 0,
      partial_errors: [],
    })
    render(<GddNotionSyncSection />)
    await user.click(await screen.findByRole('button', { name: /Synchroniser maintenant/i }))
    await waitFor(() => {
      expect(screen.getByText(/Sync Notion échouée/)).toBeInTheDocument()
    })
  })
})
