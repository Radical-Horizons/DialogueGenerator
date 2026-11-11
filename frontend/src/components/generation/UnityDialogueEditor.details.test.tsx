/**
 * Section Éditer de bout en bout (UnityDialogueDetails → UnityDialogueEditor) :
 * changer de dialogue enregistre l'édition en cours dans le dialogue quitté.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as documentsAPI from '../../api/documents'
import { useAuthStore } from '../../store/authStore'
import { UnityDialogueDetails } from '../unityDialogues/UnityDialogueDetails'
import type { UnityDialogueNode } from '../../types/api'

vi.mock('../../api/documents', () => ({
  getDocument: vi.fn(),
  putDocument: vi.fn(),
  putDocumentKeepalive: vi.fn(),
  deleteDocument: vi.fn(),
}))

vi.mock('../unityDialogues/DialogueSharingModal', () => ({ DialogueSharingModal: () => null }))
vi.mock('../unityDialogues/DialoguePermissionsPanel', () => ({ DialoguePermissionsPanel: () => null }))
vi.mock('../unityDialogues/DialogueMetadataPanel', () => ({ DialogueMetadataPanel: () => null }))

function documentFor(line: string) {
  return {
    document: { schemaVersion: '1.2.0', nodes: [{ id: 'START', speaker: 'NPC', line }] },
    schemaVersion: '1.2.0',
    revision: 1,
    capabilities: { can_read: true, can_edit: true, can_delete: true, is_owner: true },
  }
}

describe('Éditer — changement de dialogue', () => {
  beforeEach(() => {
    vi.mocked(documentsAPI.getDocument).mockReset()
    vi.mocked(documentsAPI.putDocument).mockReset().mockResolvedValue({ revision: 2 })
    useAuthStore.setState({
      user: { id: 'w', username: 'w', role: 'writer', is_active: true },
    })
  })

  it('enregistre la frappe en cours dans le dialogue quitté, pas dans le suivant', async () => {
    vi.mocked(documentsAPI.getDocument).mockImplementation(async (id: string) =>
      documentFor(id === 'A' ? 'Ligne A' : 'Ligne B'),
    )
    const { rerender } = render(<UnityDialogueDetails filename="A.json" onClose={vi.fn()} />)
    const field = await screen.findByDisplayValue('Ligne A')
    fireEvent.change(field, { target: { value: 'Ligne A ceci est un test' } })

    rerender(<UnityDialogueDetails filename="B.json" onClose={vi.fn()} />)

    await waitFor(() => expect(documentsAPI.putDocument).toHaveBeenCalledTimes(1))
    const [docId, body] = vi.mocked(documentsAPI.putDocument).mock.calls[0]
    expect(docId).toBe('A')
    expect((body.document.nodes as UnityDialogueNode[])[0].line).toBe('Ligne A ceci est un test')
    expect(await screen.findByDisplayValue('Ligne B')).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(documentsAPI.putDocument).toHaveBeenCalledTimes(1)
  })

  it('en invité, le dialogue s’affiche en lecture seule', async () => {
    useAuthStore.setState({
      user: { id: 'g', username: 'guest', role: 'guest', is_active: true },
    })
    vi.mocked(documentsAPI.getDocument).mockResolvedValue({
      ...documentFor('Ligne A'),
      capabilities: { can_read: true, can_edit: false, can_delete: false, is_owner: false },
    })
    render(<UnityDialogueDetails filename="A.json" onClose={vi.fn()} />)
    expect(await screen.findByDisplayValue('Ligne A')).toBeDisabled()
    expect(screen.getByTestId('unity-dialogue-editor-readonly')).toHaveTextContent(/mode invité/i)
  })
})
