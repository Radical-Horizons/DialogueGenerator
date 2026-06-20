import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as unityDialoguesAPI from '../../api/unityDialogues'
import { DialogueListContextMenu } from './DialogueListContextMenu'

vi.mock('../../api/unityDialogues', () => ({
  deleteUnityDialogue: vi.fn(),
}))

const dialogue = {
  filename: 'test_dialogue.json',
  file_path: '/data/test_dialogue.json',
  modified_time: '2026-04-08T12:00:00.000Z',
  size_bytes: 1024,
  title: 'Titre test',
}

describe('DialogueListContextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('affiche supprimer le dialogue et appelle l’API après confirmation', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onDeleted = vi.fn().mockResolvedValue(undefined)
    vi.mocked(unityDialoguesAPI.deleteUnityDialogue).mockResolvedValue(undefined)

    render(
      <DialogueListContextMenu
        state={{ dialogue, clientX: 100, clientY: 120 }}
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    )

    await user.click(screen.getByTestId('dialogue-list-context-delete'))

    await waitFor(() => {
      expect(unityDialoguesAPI.deleteUnityDialogue).toHaveBeenCalledWith('test_dialogue.json')
    })
    expect(onDeleted).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('affiche Télécharger et appelle onDownload (Story 5.4 AC #6)', async () => {
    const user = userEvent.setup()
    const onDownload = vi.fn()
    const onClose = vi.fn()

    render(
      <DialogueListContextMenu
        state={{ dialogue, clientX: 100, clientY: 120 }}
        onClose={onClose}
        onDownload={onDownload}
      />,
    )

    await user.click(screen.getByTestId('dialogue-list-context-download'))

    expect(onDownload).toHaveBeenCalledWith(dialogue)
    expect(onClose).toHaveBeenCalled()
  })
})
