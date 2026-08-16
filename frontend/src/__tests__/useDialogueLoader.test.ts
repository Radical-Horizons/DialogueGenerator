import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDialogueLoader } from '../hooks/useDialogueLoader'
import { useGraphStore } from '../store/graphStore'
import { useGraphViewStore } from '../store/graphViewStore'
import { useGenerationStore } from '../store/generationStore'
import type { UnityDialogueMetadata } from '../types/api'

const toastMock = vi.fn()

function unityDialogueFixture(
  partial: Pick<UnityDialogueMetadata, 'filename'> & Partial<UnityDialogueMetadata>
): UnityDialogueMetadata {
  return {
    file_path: `/mock/${partial.filename}`,
    size_bytes: 0,
    modified_time: '2020-01-01T00:00:00Z',
    ...partial,
  }
}
const getUnityDialogueMock = vi.fn()

vi.mock('../api/unityDialogues', () => ({
  getUnityDialogue: (...args: unknown[]) => getUnityDialogueMock(...args),
}))

describe('useDialogueLoader', () => {
  beforeEach(() => {
    toastMock.mockReset()
    getUnityDialogueMock.mockReset()
    useGraphStore.getState().resetGraph()
    useGenerationStore.getState().clearTemplateSession()
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
      result.current.setSelectedDialogue(
        unityDialogueFixture({
          filename: 'test.json',
          title: 'Test Dialogue',
          node_count: 0,
          edge_count: 0,
        })
      )
    })

    await waitFor(() => {
      expect(result.current.isLoadingDialogue).toBe(false)
    })

    expect(loadDialogueByDocumentIdMock).toHaveBeenCalledWith('test')
    expect(validateGraphMock).toHaveBeenCalled()
  })

  it('clears template session when switching dialogue', async () => {
    useGenerationStore.getState().setAppliedTemplate('confrontation', 'Confrontation')
    useGenerationStore.getState().setContextDroppingRulesOverlay({
      rules_profile: 'strict',
      tolerance: null,
      mandatory_info: [],
      dialogue_type_overrides: {},
      schema_version: '1.0',
    })
    useGenerationStore.getState().setContextDroppingWarning('cas')

    const loadDialogueByDocumentIdMock = vi.fn().mockResolvedValue(undefined)
    const validateGraphMock = vi.fn().mockResolvedValue(undefined)
    useGraphStore.setState({ loadDialogueByDocumentId: loadDialogueByDocumentIdMock, validateGraph: validateGraphMock })

    const { result } = renderHook(() => useDialogueLoader(toastMock, null))

    act(() => {
      result.current.setSelectedDialogue(
        unityDialogueFixture({
          filename: 'other.json',
          title: 'Other',
          node_count: 0,
          edge_count: 0,
        })
      )
    })

    await waitFor(() => {
      expect(result.current.isLoadingDialogue).toBe(false)
    })

    expect(useGenerationStore.getState().appliedTemplateId).toBeNull()
    expect(useGenerationStore.getState().contextDroppingRulesOverlay).toBeNull()
    expect(useGenerationStore.getState().contextDroppingWarning).toBeNull()
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
      result.current.setSelectedDialogue(
        unityDialogueFixture({
          filename: 'fail.json',
          title: 'Fail',
          node_count: 0,
          edge_count: 0,
        })
      )
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

  it('handleSave still calls saveDialogue when flush times out (best-effort persist)', async () => {
    vi.useFakeTimers()
    const validateGraphMock = vi.fn().mockResolvedValue(undefined)
    const saveDialogueMock = vi.fn().mockImplementation(async () => {
      await validateGraphMock()
      return { filename: 'd.json', node_count: 0, edge_count: 0 }
    })
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
      result.current.setSelectedDialogue(
        unityDialogueFixture({
          filename: 'd.json',
          title: 'D',
          node_count: 1,
          edge_count: 0,
        })
      )
    })

    await act(async () => {
      const savePromise = result.current.handleSave()
      // FLUSH_WAIT_MS dans useDialogueLoader (5s) + marge
      await vi.advanceTimersByTimeAsync(6000)
      await savePromise
    })

    expect(saveDialogueMock).toHaveBeenCalled()
    expect(validateGraphMock).toHaveBeenCalled()
    expect(
      toastMock.mock.calls.some(
        (c) =>
          c[1] === 'success' &&
          typeof c[0] === 'string' &&
          c[0].includes('sauvegardé')
      )
    ).toBe(true)

    vi.useRealTimers()
  })

  it('dispatches unity-dialogue-deleted and clears dialogue when matching', async () => {
    const loadDialogueByDocumentIdMock = vi.fn().mockResolvedValue(undefined)
    const validateGraphMock = vi.fn().mockResolvedValue(undefined)
    const resetGraphMock = vi.fn()
    useGraphStore.setState({
      loadDialogueByDocumentId: loadDialogueByDocumentIdMock,
      validateGraph: validateGraphMock,
      resetGraph: resetGraphMock,
    })
    getUnityDialogueMock.mockResolvedValue({ json_content: '[]' })

    const { result } = renderHook(() => useDialogueLoader(toastMock, null))

    act(() => {
      result.current.setSelectedDialogue(
        unityDialogueFixture({
          filename: 'will-delete.json',
          title: 'Will Delete',
          node_count: 0,
          edge_count: 0,
        })
      )
    })

    act(() => {
      useGraphViewStore.getState().notifyDialogueDeleted('will-delete.json')
    })

    expect(result.current.selectedDialogue).toBeNull()
    expect(resetGraphMock).toHaveBeenCalled()
  })
})
