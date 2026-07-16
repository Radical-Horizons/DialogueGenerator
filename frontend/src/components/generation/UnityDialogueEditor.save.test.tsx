import { createRef } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as documentsAPI from '../../api/documents'
import * as dialoguesAPI from '../../api/dialogues'
import {
  UnityDialogueEditor,
  type UnityDialogueEditorHandle,
} from './UnityDialogueEditor'

vi.mock('../../api/documents', () => ({
  putDocument: vi.fn(),
  getDocument: vi.fn(),
}))

vi.mock('../../api/dialogues', () => ({
  exportUnityDialogue: vi.fn(),
}))

const jsonContent = JSON.stringify([
  { id: 'START', speaker: 'NPC', line: 'Hello' },
])

describe('UnityDialogueEditor save', () => {
  beforeEach(() => {
    vi.mocked(documentsAPI.putDocument).mockReset()
    vi.mocked(documentsAPI.getDocument).mockReset()
    vi.mocked(dialoguesAPI.exportUnityDialogue).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('affiche le bouton Sauvegarder et n’autosauvegarde pas à la saisie', async () => {
    vi.mocked(documentsAPI.putDocument).mockResolvedValue({ revision: 2 })
    render(
      <UnityDialogueEditor
        json_content={jsonContent}
        filename="manual"
        document={{ schemaVersion: '1.2.0', nodes: [] }}
        documentRevision={1}
      />,
    )

    expect(screen.getByRole('button', { name: 'Sauvegarder' })).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Texte du dialogue...'), {
      target: { value: 'Updated manually' },
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(documentsAPI.putDocument).not.toHaveBeenCalled()
  })

  it('crée un nouveau dialogue via export quand filename est absent', async () => {
    vi.mocked(dialoguesAPI.exportUnityDialogue).mockResolvedValue({
      filename: 'Nouveau_dialogue.json',
      success: true,
    })
    const onSave = vi.fn()
    render(
      <UnityDialogueEditor
        json_content={jsonContent}
        title="Nouveau dialogue"
        hideHeaderSaveButton={false}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sauvegarder' }))
    await waitFor(() => {
      expect(dialoguesAPI.exportUnityDialogue).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Nouveau dialogue',
          filename: 'Nouveau_dialogue',
          json_content: expect.any(String),
        }),
      )
    })
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('Nouveau_dialogue.json', 1)
    })
  })

  it('réessaie avec un suffixe _2 si export renvoie canonical_revision_required', async () => {
    const conflict = {
      response: {
        status: 409,
        data: {
          detail: {
            code: 'canonical_revision_required',
            message: 'Utilisez PUT /documents/{id}',
          },
        },
      },
    }
    vi.mocked(dialoguesAPI.exportUnityDialogue)
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({
        filename: 'Existant_2.json',
        success: true,
      })
    const onSave = vi.fn()
    render(
      <UnityDialogueEditor
        json_content={jsonContent}
        title="Existant"
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sauvegarder' }))
    await waitFor(() => {
      expect(dialoguesAPI.exportUnityDialogue).toHaveBeenCalledTimes(2)
    })
    expect(dialoguesAPI.exportUnityDialogue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ filename: 'Existant' }),
    )
    expect(dialoguesAPI.exportUnityDialogue).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ filename: 'Existant_2' }),
    )
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('Existant_2.json', 1)
    })
    expect(documentsAPI.getDocument).not.toHaveBeenCalled()
    expect(documentsAPI.putDocument).not.toHaveBeenCalled()
  })

  it('attend le callback post-save et lui transmet la révision canonique', async () => {
    vi.mocked(documentsAPI.putDocument).mockResolvedValue({ revision: 2 })
    let releaseCallback!: () => void
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseCallback = resolve
        }),
    )
    const ref = createRef<UnityDialogueEditorHandle>()
    render(
      <UnityDialogueEditor
        ref={ref}
        json_content={jsonContent}
        filename="awaited"
        document={{ schemaVersion: '1.2.0', nodes: [] }}
        documentRevision={1}
        onSave={onSave}
      />,
    )

    let savePromise!: Promise<void>
    act(() => {
      savePromise = ref.current!.handleSave()
    })
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('awaited.json', 2)
    })
    let settled = false
    void savePromise.finally(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    await act(async () => {
      releaseCallback()
      await savePromise
    })
    expect(settled).toBe(true)
  })

  it('propage un échec du callback post-save', async () => {
    vi.mocked(documentsAPI.putDocument).mockResolvedValue({ revision: 4 })
    const onSave = vi.fn().mockRejectedValue(new Error('reload failed'))
    const ref = createRef<UnityDialogueEditorHandle>()
    render(
      <UnityDialogueEditor
        ref={ref}
        json_content={jsonContent}
        filename="propagated"
        document={{ schemaVersion: '1.2.0', nodes: [] }}
        documentRevision={3}
        onSave={onSave}
      />,
    )

    let caughtError: unknown
    await act(async () => {
      try {
        await ref.current!.handleSave()
      } catch (error) {
        caughtError = error
      }
    })
    expect(caughtError).toEqual(new Error('reload failed'))
  })

  it('émet onContentChange synchronement à chaque édition (sync graphe 1ʳᵉ génération)', () => {
    const onContentChange = vi.fn()
    render(
      <UnityDialogueEditor
        json_content={jsonContent}
        hideHeaderSaveButton={true}
        onContentChange={onContentChange}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Texte du dialogue...'), {
      target: { value: 'Modifié avant sauvegarde graphe' },
    })

    expect(onContentChange).toHaveBeenCalled()
    const lastPayload = onContentChange.mock.calls.at(-1)?.[0] as string
    expect(JSON.parse(lastPayload)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'START',
          line: 'Modifié avant sauvegarde graphe',
        }),
      ]),
    )
  })
})
