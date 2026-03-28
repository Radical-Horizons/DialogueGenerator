import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDialogueLoader } from '../hooks/useDialogueLoader'
import { useGraphStore } from '../store/graphStore'
import { useGraphViewStore } from '../store/graphViewStore'

const toastMock = vi.fn()
const getUnityDialogueMock = vi.fn()

vi.mock('../api/unityDialogues', () => ({
  getUnityDialogue: (...args: unknown[]) => getUnityDialogueMock(...args),
}))

describe('useDialogueLoader', () => {
  beforeEach(() => {
    toastMock.mockReset()
    getUnityDialogueMock.mockReset()
    useGraphStore.getState().resetGraph()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initial state: no dialogue loaded', () => {
    const { result } = renderHook(() => useDialogueLoader(toastMock, null))

    expect(result.current.selectedDialogue).toBeNull()
    expect(result.current.isLoadingDialogue).toBe(false)
    expect(result.current.activeDialogueFilename).toBeNull()
    expect(result.current.hasActiveDialogue).toBe(false)
  })

  it('loads dialogue when selectedDialogue changes', async () => {
    const loadDialogueByDocumentIdMock = vi.fn().mockResolvedValue(undefined)
    const validateGraphMock = vi.fn().mockResolvedValue(undefined)
    useGraphStore.setState({ loadDialogueByDocumentId: loadDialogueByDocumentIdMock, validateGraph: validateGraphMock })

    const { result } = renderHook(() => useDialogueLoader(toastMock, null))

    act(() => {
      result.current.setSelectedDialogue({
        filename: 'test.json',
        title: 'Test Dialogue',
        node_count: 0,
        edge_count: 0,
      })
    })

    await waitFor(() => {
      expect(result.current.isLoadingDialogue).toBe(false)
    })

    expect(loadDialogueByDocumentIdMock).toHaveBeenCalledWith('test')
    expect(validateGraphMock).toHaveBeenCalled()
  })

  it('shows error toast when load fails', async () => {
    const loadDialogueByDocumentIdMock = vi.fn().mockRejectedValue(new Error('Network error'))
    getUnityDialogueMock.mockRejectedValue(new Error('API error'))

    useGraphStore.setState({
      loadDialogueByDocumentId: loadDialogueByDocumentIdMock,
      validateGraph: vi.fn().mockResolvedValue(undefined),
    })

    const { result } = renderHook(() => useDialogueLoader(toastMock, null))

    act(() => {
      result.current.setSelectedDialogue({
        filename: 'fail.json',
        title: 'Fail',
        node_count: 0,
        edge_count: 0,
      })
    })

    await waitFor(() => {
      expect(result.current.isLoadingDialogue).toBe(false)
    })

    expect(toastMock).toHaveBeenCalledWith(expect.any(String), 'error')
  })

  it('autosave circuit breaker: attempts save when unsaved changes exist', async () => {
    const saveDialogueMock = vi.fn().mockRejectedValue(
      Object.assign(new Error('Forbidden'), { response: { status: 403 } })
    )
    useGraphStore.setState({
      saveDialogue: saveDialogueMock,
      hasUnsavedChanges: true,
      nodes: [
        { id: 'n1', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} },
      ],
      dialogueMetadata: { filename: 'dial.json', title: 'D', node_count: 1, edge_count: 0 },
      isLoading: false,
      isSaving: false,
      isGenerating: false,
    })

    renderHook(() => useDialogueLoader(toastMock, null))

    // The autosave is triggered by a useEffect debounced 100ms. Wait for it.
    await waitFor(
      () => {
        expect(saveDialogueMock).toHaveBeenCalled()
      },
      { timeout: 500 }
    )

    // After 4xx error, toast was called with autosave error message
    expect(
      toastMock.mock.calls.some(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('Sauvegarde automatique') &&
          call[1] === 'error'
      )
    ).toBe(true)
  })

  it('handleSave does not call saveDialogue when flush times out (no NodeEditorPanel)', async () => {
    vi.useFakeTimers()
    const saveDialogueMock = vi.fn().mockResolvedValue({
      filename: 'd.json',
      node_count: 0,
      edge_count: 0,
    })
    const validateGraphMock = vi.fn().mockResolvedValue(undefined)
    useGraphStore.setState({
      saveDialogue: saveDialogueMock,
      validateGraph: validateGraphMock,
      documentId: 'd',
      dialogueMetadata: {
        filename: 'd.json',
        title: 'D',
        node_count: 1,
        edge_count: 0,
      },
      nodes: [{ id: 'n1', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} }],
      isLoading: false,
      isSaving: false,
      isGenerating: false,
      hasUnsavedChanges: false,
    })

    const { result } = renderHook(() => useDialogueLoader(toastMock, null))

    await act(async () => {
      result.current.setSelectedDialogue({
        filename: 'd.json',
        title: 'D',
        node_count: 1,
        edge_count: 0,
      })
    })

    await act(async () => {
      const savePromise = result.current.handleSave()
      await vi.advanceTimersByTimeAsync(2000)
      await savePromise
    })

    expect(saveDialogueMock).not.toHaveBeenCalled()
    expect(
      toastMock.mock.calls.some(
        (c) =>
          c[1] === 'error' &&
          typeof c[0] === 'string' &&
          (c[0].includes('sauvegarde') || c[0].includes('Flush') || c[0].includes('synchronis'))
      )
    ).toBe(true)

    vi.useRealTimers()
  })

  it('dispatches unity-dialogue-deleted and clears dialogue when matching', async () => {
    const loadDialogueMock = vi.fn().mockResolvedValue(undefined)
    const validateGraphMock = vi.fn().mockResolvedValue(undefined)
    const resetGraphMock = vi.fn()
    useGraphStore.setState({
      loadDialogue: loadDialogueMock,
      validateGraph: validateGraphMock,
      resetGraph: resetGraphMock,
    })
    getUnityDialogueMock.mockResolvedValue({ json_content: '[]' })

    const { result } = renderHook(() => useDialogueLoader(toastMock, null))

    act(() => {
      result.current.setSelectedDialogue({
        filename: 'will-delete.json',
        title: 'Will Delete',
        node_count: 0,
        edge_count: 0,
      })
    })

    act(() => {
      useGraphViewStore.getState().notifyDialogueDeleted('will-delete.json')
    })

    expect(result.current.selectedDialogue).toBeNull()
    expect(resetGraphMock).toHaveBeenCalled()
  })
})
