/**
 * « Générer la suite » depuis Éditer : le graphe ouvre le dialogue, puis la génération
 * sur le nœud demandé — jamais avant que ce dialogue soit chargé.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDialogueLoader } from '../hooks/useDialogueLoader'
import { useGraphStore } from '../store/graphStore'
import { useGraphViewStore } from '../store/graphViewStore'

vi.mock('../api/unityDialogues', () => ({
  getUnityDialogue: vi.fn(),
}))

function fakeLoad(documentId: string) {
  useGraphStore.setState({
    documentId,
    dialogueMetadata: { ...useGraphStore.getState().dialogueMetadata, filename: documentId },
    nodes: [{ id: 'node-2', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} }],
    hasUnsavedChanges: false,
  })
}

describe('useDialogueLoader — continuation depuis Éditer', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    useGraphViewStore.setState({ continuationRequest: null, aiGenerationNodeId: null, focusQueue: [] })
  })

  it('charge le dialogue puis ouvre la génération sur le nœud demandé', async () => {
    let releaseLoad!: () => void
    const loadDialogueByDocumentId = vi.fn(
      (documentId: string) =>
        new Promise<void>((resolve) => {
          releaseLoad = () => {
            fakeLoad(documentId)
            resolve()
          }
        }),
    )
    useGraphStore.setState({
      loadDialogueByDocumentId,
      validateGraph: vi.fn().mockResolvedValue(undefined),
    })
    const { result } = renderHook(() => useDialogueLoader(vi.fn(), null))

    act(() => {
      useGraphViewStore.getState().requestContinuation('La_carte_refusée.json', 'node-2')
    })

    await waitFor(() => expect(loadDialogueByDocumentId).toHaveBeenCalledWith('La_carte_refusée'))
    expect(result.current.selectedDialogue?.filename).toBe('La_carte_refusée.json')
    expect(useGraphViewStore.getState().aiGenerationNodeId).toBeNull()

    await act(async () => {
      releaseLoad()
    })

    await waitFor(() => expect(useGraphViewStore.getState().aiGenerationNodeId).toBe('node-2'))
    expect(useGraphViewStore.getState().continuationRequest).toBeNull()
    expect(useGraphViewStore.getState().focusQueue).toContain('node-2')
  })

  it('recharge la copie du graphe quand ce dialogue y était déjà ouvert', async () => {
    fakeLoad('La_carte_refusée')
    const loadDialogueByDocumentId = vi.fn(async (documentId: string) => fakeLoad(documentId))
    useGraphStore.setState({
      loadDialogueByDocumentId,
      validateGraph: vi.fn().mockResolvedValue(undefined),
    })
    renderHook(() => useDialogueLoader(vi.fn(), null))

    act(() => {
      useGraphViewStore.getState().requestContinuation('La_carte_refusée.json', 'node-2')
    })

    await waitFor(() => expect(useGraphViewStore.getState().aiGenerationNodeId).toBe('node-2'))
    expect(loadDialogueByDocumentId).toHaveBeenCalledWith('La_carte_refusée')
  })
})
