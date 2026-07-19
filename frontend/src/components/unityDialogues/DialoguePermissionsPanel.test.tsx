/**
 * Tests du panneau agrégé des permissions dialogue.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as dialoguePermissionsAPI from '../../api/dialoguePermissions'
import * as dialogueSharesAPI from '../../api/dialogueShares'
import { DialoguePermissionsPanel } from './DialoguePermissionsPanel'

vi.mock('../../api/dialoguePermissions', () => ({
  getDialoguePermissions: vi.fn(),
}))

vi.mock('../../api/dialogueShares', () => ({
  deleteDialogueShare: vi.fn(),
}))

const permissions = {
  owner: { user_id: 'writer-a', username: 'writer-a' },
  co_editors: [
    {
      document_id: 'doc-1',
      user_id: 'writer-b',
      username: 'writer-b',
      permission: 'writer',
      created_at: '2026-07-19T00:00:00Z',
    },
  ],
  can_manage: true,
}

describe('DialoguePermissionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(dialoguePermissionsAPI.getDialoguePermissions).mockResolvedValue(
      permissions
    )
  })

  it('affiche le propriétaire et les co-éditeurs', async () => {
    render(
      <DialoguePermissionsPanel documentId="doc-1" open onClose={vi.fn()} />
    )

    expect(await screen.findByText('writer-a')).toBeInTheDocument()
    expect(screen.getByText('writer-b')).toBeInTheDocument()
    expect(screen.getByTestId('dialogue-permission-revoke-writer-b')).toBeInTheDocument()
  })

  it('masque la révocation au co-éditeur', async () => {
    vi.mocked(dialoguePermissionsAPI.getDialoguePermissions).mockResolvedValue({
      ...permissions,
      can_manage: false,
    })
    render(
      <DialoguePermissionsPanel documentId="doc-1" open onClose={vi.fn()} />
    )

    expect(await screen.findByText('writer-b')).toBeInTheDocument()
    expect(
      screen.queryByTestId('dialogue-permission-revoke-writer-b')
    ).not.toBeInTheDocument()
  })

  it('révoque via le endpoint shares existant', async () => {
    vi.mocked(dialogueSharesAPI.deleteDialogueShare).mockResolvedValue()
    render(
      <DialoguePermissionsPanel documentId="doc-1" open onClose={vi.fn()} />
    )

    fireEvent.click(
      await screen.findByTestId('dialogue-permission-revoke-writer-b')
    )
    await waitFor(() => {
      expect(dialogueSharesAPI.deleteDialogueShare).toHaveBeenCalledWith(
        'doc-1',
        'writer-b'
      )
    })
    expect(screen.queryByText('writer-b')).not.toBeInTheDocument()
  })

  it('traite une révocation 404 comme succès local', async () => {
    vi.mocked(dialogueSharesAPI.deleteDialogueShare).mockRejectedValue({
      isAxiosError: true,
      response: { status: 404 },
    })
    render(
      <DialoguePermissionsPanel documentId="doc-1" open onClose={vi.fn()} />
    )

    fireEvent.click(
      await screen.findByTestId('dialogue-permission-revoke-writer-b')
    )
    await waitFor(() => {
      expect(screen.queryByText('writer-b')).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
