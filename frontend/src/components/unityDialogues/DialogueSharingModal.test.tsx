/**
 * Tests DialogueSharingModal — invite / revoke co-éditeurs.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DialogueSharingModal } from './DialogueSharingModal'
import * as dialogueSharesAPI from '../../api/dialogueShares'

vi.mock('../../api/dialogueShares', () => ({
  listDialogueShares: vi.fn(),
  createDialogueShare: vi.fn(),
  deleteDialogueShare: vi.fn(),
}))

describe('DialogueSharingModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(dialogueSharesAPI.listDialogueShares).mockResolvedValue([])
  })

  it('charge la liste et invite un writer', async () => {
    const created = {
      document_id: 'doc-1',
      user_id: 'writer-b',
      username: 'writer-b',
      permission: 'writer',
      created_at: '2026-07-17T00:00:00Z',
    }
    vi.mocked(dialogueSharesAPI.createDialogueShare).mockResolvedValue(created)
    vi.mocked(dialogueSharesAPI.listDialogueShares)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([created])

    render(
      <DialogueSharingModal documentId="doc-1" open onClose={vi.fn()} />
    )

    await waitFor(() => {
      expect(dialogueSharesAPI.listDialogueShares).toHaveBeenCalledWith('doc-1')
    })

    fireEvent.change(screen.getByTestId('dialogue-share-username'), {
      target: { value: 'writer-b' },
    })
    fireEvent.click(screen.getByTestId('dialogue-share-invite'))

    await waitFor(() => {
      expect(dialogueSharesAPI.createDialogueShare).toHaveBeenCalledWith(
        'doc-1',
        'writer-b'
      )
    })
    expect(await screen.findByTestId('dialogue-share-row-writer-b')).toBeInTheDocument()
  })

  it('révoque un co-éditeur listé', async () => {
    vi.mocked(dialogueSharesAPI.listDialogueShares).mockResolvedValue([
      {
        document_id: 'doc-1',
        user_id: 'writer-b',
        username: 'writer-b',
        permission: 'writer',
        created_at: '2026-07-17T00:00:00Z',
      },
    ])
    vi.mocked(dialogueSharesAPI.deleteDialogueShare).mockResolvedValue()

    render(
      <DialogueSharingModal documentId="doc-1" open onClose={vi.fn()} />
    )

    expect(await screen.findByTestId('dialogue-share-row-writer-b')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('dialogue-share-revoke-writer-b'))

    await waitFor(() => {
      expect(dialogueSharesAPI.deleteDialogueShare).toHaveBeenCalledWith(
        'doc-1',
        'writer-b'
      )
    })
    await waitFor(() => {
      expect(screen.queryByTestId('dialogue-share-row-writer-b')).not.toBeInTheDocument()
    })
  })
})
