/**
 * Une réponse « collections » qui arrive après le démontage ne touche plus au composant.
 * En CI (jsdom détruit en fin de fichier), ce setState tardif levait « window is not defined ».
 */
import { describe, it, expect, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import * as collectionsAPI from '../../api/collections'
import { UnityDialogueList } from './UnityDialogueList'

const toastSpy = vi.fn()

vi.mock('../shared', async (importActual) => ({
  ...(await importActual<typeof import('../shared')>()),
  useToast: () => toastSpy,
}))

vi.mock('../../api/unityDialogues', () => ({
  listUnityDialogues: vi.fn().mockResolvedValue({ dialogues: [], total: 0 }),
}))

vi.mock('../../api/dialogues', () => ({
  validateDocumentSchema: vi.fn(),
  batchExportUnityDialogues: vi.fn(),
}))

vi.mock('../../api/documents', () => ({
  putDocument: vi.fn(),
}))

vi.mock('../../api/collections', () => ({
  listCollections: vi.fn(),
  createCollection: vi.fn(),
  updateCollection: vi.fn(),
  deleteCollection: vi.fn(),
  addDialoguesToCollection: vi.fn(),
  removeDialoguesFromCollection: vi.fn(),
  buildDocumentCollectionMap: () => new Map(),
}))

vi.mock('../../api/dialogueSearch', () => ({
  searchUnityDialogues: vi.fn().mockResolvedValue({
    query: '',
    elapsed_ms: 0,
    document_ids: [],
    total: 0,
  }),
}))

describe('UnityDialogueList — réponse après démontage', () => {
  it('ignore une erreur de collections arrivée après le démontage', async () => {
    let rejectCollections!: (reason: unknown) => void
    vi.mocked(collectionsAPI.listCollections).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectCollections = reject
        }),
    )
    const { unmount } = render(
      <UnityDialogueList onSelectDialogue={() => {}} selectedFilename={null} />,
    )

    unmount()
    await act(async () => {
      rejectCollections(new Error('Network Error'))
      await Promise.resolve()
    })

    expect(toastSpy).not.toHaveBeenCalled()
  })
})
