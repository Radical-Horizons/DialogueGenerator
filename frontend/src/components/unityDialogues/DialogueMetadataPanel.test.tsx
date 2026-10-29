import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as dialogueMetadataAPI from '../../api/dialogueMetadata'
import { useAuthStore } from '../../store/authStore'
import { DialogueMetadataPanel } from './DialogueMetadataPanel'

vi.mock('../../api/dialogueMetadata', () => ({
  getDialogueMetadata: vi.fn(),
}))

vi.mock('../usage/DialogueCostBreakdown', () => ({
  DialogueCostBreakdown: ({ dialogueId }: { dialogueId: string }) => (
    <div data-testid="cost-breakdown">{dialogueId}</div>
  ),
}))

vi.mock('./DialoguePermissionsPanel', () => ({
  DialoguePermissionsPanel: ({ open }: { open: boolean }) =>
    open ? <div data-testid="permissions-panel">Permissions</div> : null,
}))

const mockGetMetadata = vi.mocked(dialogueMetadataAPI.getDialogueMetadata)

describe('DialogueMetadataPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      user: {
        id: 'writer-1',
        username: 'alice',
        role: 'writer',
        is_active: true,
      },
    })
    mockGetMetadata.mockResolvedValue({
      document_id: 'scene',
      name: 'Rencontre',
      owner_id: 'owner-1',
      owner_username: 'alice',
      last_modified_by: 'editor-1',
      last_modified_by_username: 'marc',
      created_at: '2026-08-01T10:00:00Z',
      updated_at: '2026-08-04T10:00:00Z',
      node_count: 4,
      total_cost_eur: 8.2,
      cost_per_node_eur: 2.05,
    })
  })

  it('affiche les métadonnées sans statut ni historique', async () => {
    render(<DialogueMetadataPanel documentId="scene" open onClose={() => {}} />)

    await waitFor(() => expect(screen.getByText('Rencontre')).toBeInTheDocument())
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('marc')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByTestId('dialogue-metadata-total-cost')).toHaveTextContent('8,20 €')
    expect(screen.getByText('2,05 €')).toBeInTheDocument()
    expect(screen.queryByText(/validé|brouillon|historique/i)).not.toBeInTheDocument()
  })

  it('garde l’euro sous le centime, total et coût par nœud dans la même devise', async () => {
    mockGetMetadata.mockResolvedValueOnce({
      document_id: 'scene',
      name: 'Rencontre',
      owner_id: 'owner-1',
      owner_username: 'alice',
      last_modified_by: 'editor-1',
      last_modified_by_username: 'marc',
      created_at: '2026-08-01T10:00:00Z',
      updated_at: '2026-08-04T10:00:00Z',
      node_count: 4,
      total_cost_eur: 0.0031,
      cost_per_node_eur: 0.000774,
    })
    render(<DialogueMetadataPanel documentId="scene" open onClose={() => {}} />)

    await screen.findByText('Rencontre')
    expect(screen.getByTestId('dialogue-metadata-total-cost')).toHaveTextContent('0,0031 €')
    expect(screen.getByText('0,00077 €')).toBeInTheDocument()
    expect(screen.queryByText(/¢|0\.00€/)).not.toBeInTheDocument()
  })

  it('ouvre le breakdown existant et le panneau de permissions', async () => {
    const user = userEvent.setup()
    render(<DialogueMetadataPanel documentId="scene" open onClose={() => {}} />)
    await screen.findByText('Rencontre')

    await user.click(screen.getByRole('button', { name: 'Voir le détail des coûts' }))
    expect(screen.getByTestId('cost-breakdown')).toHaveTextContent('scene')

    await user.click(screen.getByRole('button', { name: 'Voir les permissions' }))
    expect(screen.getByTestId('permissions-panel')).toBeInTheDocument()
  })

  it('affiche une erreur de chargement sans planter', async () => {
    mockGetMetadata.mockRejectedValueOnce(new Error('Dialogue introuvable'))
    render(<DialogueMetadataPanel documentId="missing" open onClose={() => {}} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Dialogue introuvable')
  })
})
