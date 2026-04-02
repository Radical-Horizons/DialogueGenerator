import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBatchOperations } from '../hooks/useBatchOperations'
import { useGraphStore } from '../store/graphStore'

const toastMock = vi.fn()

describe('useBatchOperations', () => {
  beforeEach(() => {
    toastMock.mockReset()
    useGraphStore.getState().resetGraph()
    useGraphStore.setState({
      nodes: [
        {
          id: 'n1',
          type: 'dialogueNode',
          position: { x: 0, y: 0 },
          data: { id: 'n1', line: 'Hello' },
        },
        {
          id: 'n2',
          type: 'dialogueNode',
          position: { x: 100, y: 0 },
          data: { id: 'n2', line: 'World' },
        },
      ],
      edges: [],
      selectedNodeId: 'n1',
      selectedNodeIds: ['n1', 'n2'],
      isLoading: false,
      isSaving: false,
      hasUnsavedChanges: false,
      validationErrors: [],
    })
  })

  it('handleBatchDeleteSelection sets selectedNodeIdsToDelete when multiple nodes selected', () => {
    const { result } = renderHook(() => useBatchOperations(toastMock))

    expect(result.current.selectedNodeIdsToDelete).toBeNull()

    act(() => {
      result.current.handleBatchDeleteSelection()
    })

    expect(result.current.selectedNodeIdsToDelete).toEqual(['n1', 'n2'])
  })

  it('handleBatchDeleteSelection does nothing when only one node selected', () => {
    useGraphStore.setState({ selectedNodeIds: ['n1'] })
    const { result } = renderHook(() => useBatchOperations(toastMock))

    act(() => {
      result.current.handleBatchDeleteSelection()
    })

    expect(result.current.selectedNodeIdsToDelete).toBeNull()
  })

  it('handleConfirmBatchDelete deletes all nodes and clears selection', () => {
    const { result } = renderHook(() => useBatchOperations(toastMock))

    act(() => {
      result.current.handleBatchDeleteSelection()
    })
    act(() => {
      result.current.handleConfirmBatchDelete()
    })

    expect(useGraphStore.getState().nodes).toHaveLength(0)
    expect(useGraphStore.getState().selectedNodeIds).toEqual([])
    expect(result.current.selectedNodeIdsToDelete).toBeNull()
    expect(toastMock).toHaveBeenCalledWith('2 nœuds supprimés', 'success', 3000)
  })

  it('handleConfirmBatchDelete on partial failure shows toast with reasons and keeps failed ids in selection', () => {
    const batchDeleteNodesMock = vi.fn().mockReturnValue({
      deleted: ['n1'],
      failed: [
        { id: 'n2', reason: 'nœud introuvable' },
      ],
    })
    useGraphStore.setState({ batchDeleteNodes: batchDeleteNodesMock })

    const { result } = renderHook(() => useBatchOperations(toastMock))

    act(() => {
      result.current.handleBatchDeleteSelection()
    })
    act(() => {
      result.current.handleConfirmBatchDelete()
    })

    expect(batchDeleteNodesMock).toHaveBeenCalledWith(['n1', 'n2'])
    expect(toastMock).toHaveBeenCalledWith(
      '1 nœud supprimé(s), 1 échec(s): n2 (nœud introuvable)',
      'warning',
      5000
    )
    expect(useGraphStore.getState().selectedNodeIds).toEqual(['n2'])
    expect(result.current.selectedNodeIdsToDelete).toBeNull()
  })

  it('handleCancelBatchDelete clears selectedNodeIdsToDelete', () => {
    const { result } = renderHook(() => useBatchOperations(toastMock))

    act(() => {
      result.current.handleBatchDeleteSelection()
    })
    act(() => {
      result.current.handleCancelBatchDelete()
    })

    expect(result.current.selectedNodeIdsToDelete).toBeNull()
    expect(useGraphStore.getState().nodes).toHaveLength(2)
  })

  it('handleBatchTagSelection applies given tag to all selected nodes', () => {
    const { result } = renderHook(() => useBatchOperations(toastMock))

    act(() => {
      result.current.handleBatchTagSelection('À réviser')
    })

    const nodes = useGraphStore.getState().nodes
    const n1 = nodes.find((n) => n.id === 'n1')
    const n2 = nodes.find((n) => n.id === 'n2')
    expect((n1?.data as Record<string, unknown>).tag).toBe('À réviser')
    expect((n2?.data as Record<string, unknown>).tag).toBe('À réviser')
    expect(toastMock).toHaveBeenCalledWith('Opération appliquée à 2 nœuds', 'success', 3000)
  })

  it('handleBatchValidateSelection shows success toast when no issues on selected nodes', async () => {
    const validateGraphMock = vi.fn().mockResolvedValue(undefined)
    useGraphStore.setState({ validateGraph: validateGraphMock, validationErrors: [] })

    const { result } = renderHook(() => useBatchOperations(toastMock))

    await act(async () => {
      await result.current.handleBatchValidateSelection()
    })

    expect(validateGraphMock).toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith('Opération appliquée à 2 nœuds', 'success', 3000)
  })

  it('handleBatchValidateSelection shows warning toast when selected nodes have issues', async () => {
    const validateGraphMock = vi.fn().mockImplementation(async () => {
      useGraphStore.setState({
        validationErrors: [
          { node_id: 'n1', severity: 'warning', message: 'Empty', type: 'empty_node' },
        ],
      })
    })
    useGraphStore.setState({ validateGraph: validateGraphMock })

    const { result } = renderHook(() => useBatchOperations(toastMock))

    await act(async () => {
      await result.current.handleBatchValidateSelection()
    })

    expect(toastMock).toHaveBeenCalledWith(
      'Opération appliquée à 2 nœuds (1 signalement)',
      'warning',
      3000
    )
  })
})
