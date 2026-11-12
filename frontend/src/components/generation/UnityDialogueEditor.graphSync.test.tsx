/**
 * Éditer ↔ graphe : chaque vue annonce ses enregistrements (graphViewStore.documentSaved)
 * et l'autre recharge sa copie au lieu de garder une révision périmée.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as documentsAPI from '../../api/documents'
import { useAuthStore } from '../../store/authStore'
import { useGraphViewStore } from '../../store/graphViewStore'
import { UnityDialogueDetails } from '../unityDialogues/UnityDialogueDetails'

vi.mock('../../api/documents', () => ({
  getDocument: vi.fn(),
  putDocument: vi.fn(),
  putDocumentKeepalive: vi.fn(),
  deleteDocument: vi.fn(),
}))

vi.mock('../unityDialogues/DialogueSharingModal', () => ({ DialogueSharingModal: () => null }))
vi.mock('../unityDialogues/DialoguePermissionsPanel', () => ({ DialoguePermissionsPanel: () => null }))
vi.mock('../unityDialogues/DialogueMetadataPanel', () => ({ DialogueMetadataPanel: () => null }))

function documentAt(line: string, revision: number) {
  return {
    document: { schemaVersion: '1.2.0', nodes: [{ id: 'START', speaker: 'NPC', line }] },
    schemaVersion: '1.2.0',
    revision,
    capabilities: { can_read: true, can_edit: true, can_delete: true, is_owner: true },
  }
}

describe('Éditer ↔ graphe — enregistrements croisés', () => {
  beforeEach(() => {
    vi.mocked(documentsAPI.getDocument).mockReset()
    vi.mocked(documentsAPI.putDocument).mockReset()
    vi.mocked(documentsAPI.putDocumentKeepalive).mockReset().mockResolvedValue(null)
    useGraphViewStore.setState({ documentSaved: null })
    useAuthStore.setState({
      user: { id: 'w', username: 'w', role: 'writer', is_active: true },
    })
  })

  it('le graphe enregistre le dialogue ouvert dans Éditer : Éditer recharge contenu et révision', async () => {
    vi.mocked(documentsAPI.getDocument)
      .mockResolvedValueOnce(documentAt('Avant', 3))
      .mockResolvedValueOnce(documentAt('Écrit dans le graphe', 4))
    vi.mocked(documentsAPI.putDocument).mockResolvedValue({ revision: 5 })
    render(<UnityDialogueDetails filename="A.json" onClose={vi.fn()} />)
    await screen.findByDisplayValue('Avant')

    act(() => {
      useGraphViewStore
        .getState()
        .notifyDocumentSaved({ documentId: 'A', revision: 4, source: 'graph' })
    })

    const field = await screen.findByDisplayValue('Écrit dans le graphe')
    fireEvent.change(field, { target: { value: 'Écrit dans le graphe puis ici' } })
    fireEvent.blur(field)
    await waitFor(() => expect(documentsAPI.putDocument).toHaveBeenCalled(), { timeout: 3000 })
    expect(vi.mocked(documentsAPI.putDocument).mock.calls[0][1].revision).toBe(4)
  })

  it('Éditer annonce chaque enregistrement au graphe', async () => {
    vi.mocked(documentsAPI.getDocument).mockResolvedValue(documentAt('Avant', 3))
    vi.mocked(documentsAPI.putDocument).mockResolvedValue({ revision: 4 })
    render(<UnityDialogueDetails filename="A.json" onClose={vi.fn()} />)
    const field = await screen.findByDisplayValue('Avant')

    fireEvent.change(field, { target: { value: 'Après' } })

    await waitFor(
      () =>
        expect(useGraphViewStore.getState().documentSaved).toEqual({
          documentId: 'A',
          revision: 4,
          source: 'edition',
        }),
      { timeout: 3000 },
    )
  })
})
