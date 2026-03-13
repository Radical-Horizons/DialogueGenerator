import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDialogueLoader } from '../hooks/useDialogueLoader'
import { useGraphStore } from '../store/graphStore'

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
    const loadDialogueMock = vi.fn().mockResolvedValue(undefined)
    const validateGraphMock = vi.fn().mockResolvedValue(undefined)
    useGraphStore.setState({ loadDialogue: loadDialogueMock, validateGraph: validateGraphMock })

    getUnityDialogueMock.mockResolvedValue({ json_content: '[]' })

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

    expect(getUnityDialogueMock).toHaveBeenCalledWith('test.json')
    expect(loadDialogueMock).toHaveBeenCalledWith('[]', undefined, 'test.json')
    expect(validateGraphMock).toHaveBeenCalled()
  })

  it('shows error toast when load fails', async () => {
    const loadDialogueMock = vi.fn().mockRejectedValue(new Error('Network error'))
    useGraphStore.setState({
      loadDialogue: loadDialogueMock,
      validateGraph: vi.fn().mockResolvedValue(undefined),
    })
    getUnityDialogueMock.mockResolvedValue({ json_content: '[]' })

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
      window.dispatchEvent(
        new CustomEvent('unity-dialogue-deleted', { detail: { filename: 'will-delete.json' } })
      )
    })

    expect(result.current.selectedDialogue).toBeNull()
    expect(resetGraphMock).toHaveBeenCalled()
  })
})
