/**
 * Autosave fiable : relance après le délai de blocage, déclenchement sur tout état sale,
 * sauvegarde avant de changer de dialogue par l'URL, sauvegarde immédiate en quittant la page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDialogueLoader } from '../hooks/useDialogueLoader'
import { useGraphStore } from '../store/graphStore'
import { useGenerationStore } from '../store/generationStore'

vi.mock('../api/unityDialogues', () => ({
  getUnityDialogue: vi.fn(),
}))

const toastMock = vi.fn()

type SaveDialogue = ReturnType<typeof useGraphStore.getState>['saveDialogue']

function dirtyDialogueState(saveDialogue: unknown) {
  useGraphStore.setState({
    saveDialogue: saveDialogue as SaveDialogue,
    hasUnsavedChanges: true,
    nodes: [{ id: 'n1', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} }],
    edges: [],
    dialogueMetadata: { filename: 'dial.json', title: 'D', node_count: 1, edge_count: 0 },
    isLoading: false,
    isSaving: false,
    isGenerating: false,
  })
}

describe('useDialogueLoader — autosave fiable', () => {
  beforeEach(() => {
    toastMock.mockReset()
    useGraphStore.getState().resetGraph()
    useGenerationStore.getState().clearTemplateSession()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('erreur serveur passagère : relance à la fin du délai de blocage, sans attendre une nouvelle édition', async () => {
    vi.useFakeTimers()
    const saveDialogueMock = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('Unavailable'), { response: { status: 503 } }))
      .mockResolvedValue({ success: true, filename: 'dial' })
    dirtyDialogueState(saveDialogueMock)

    renderHook(() => useDialogueLoader(toastMock, null))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(saveDialogueMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_500)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(saveDialogueMock).toHaveBeenCalledTimes(2)
  })

  it("déclenche l'autosave sur toute édition (arêtes, flags…), pas seulement sur les nœuds", async () => {
    vi.useFakeTimers()
    const saveDialogueMock = vi.fn().mockResolvedValue({ success: true, filename: 'dial' })
    dirtyDialogueState(saveDialogueMock)

    renderHook(() => useDialogueLoader(toastMock, null))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(saveDialogueMock).toHaveBeenCalledTimes(1)

    act(() => {
      useGraphStore.setState((s) => ({
        edges: [{ id: 'e1', source: 'n1', target: 'n1' }],
        clientSeq: s.clientSeq + 1,
      }))
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(saveDialogueMock).toHaveBeenCalledTimes(2)
  })

  it("sauvegarde le dialogue courant avant d'en charger un autre par l'URL", async () => {
    const calls: string[] = []
    const saveDialogueMock = vi.fn(async () => {
      calls.push('save')
      return { success: true, filename: 'dial' }
    })
    const loadMock = vi.fn(async (id: string) => {
      calls.push(`load:${id}`)
      useGraphStore.setState({
        dialogueMetadata: { filename: id, title: id, node_count: 1, edge_count: 0 },
      })
    })
    dirtyDialogueState(saveDialogueMock)
    useGraphStore.setState({
      isSaving: true,
      loadDialogueByDocumentId: loadMock,
      validateGraph: vi.fn().mockResolvedValue(undefined),
    })

    const routeTarget = { normalizedDialogueId: 'autre', decodedDialogueId: 'autre' }
    renderHook(() => useDialogueLoader(toastMock, routeTarget))

    await waitFor(() => expect(loadMock).toHaveBeenCalled())
    expect(calls[0]).toBe('save')
    expect(calls[1]).toBe('load:autre')
  })

  it('en quittant la page, la sauvegarde keepalive part immédiatement', () => {
    const saveDialogueMock = vi.fn().mockResolvedValue({ success: true, filename: 'dial' })
    dirtyDialogueState(saveDialogueMock)
    useGraphStore.setState({ isSaving: true })
    const { unmount } = renderHook(() => useDialogueLoader(toastMock, null))

    window.dispatchEvent(new Event('pagehide'))

    expect(saveDialogueMock).toHaveBeenCalledWith({ keepalive: true })
    unmount()
  })
})
