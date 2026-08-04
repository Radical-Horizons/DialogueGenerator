/**
 * Tests hook génération batch multi-parents FR88.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useBatchGenerateFromNodes } from './useBatchGenerateFromNodes'
import * as batchApi from '../api/batchNodeGeneration'

vi.mock('../api/batchNodeGeneration', async () => {
  const actual = await vi.importActual<typeof import('../api/batchNodeGeneration')>(
    '../api/batchNodeGeneration'
  )
  return {
    ...actual,
    startBatchGenerateFromNodesJob: vi.fn(),
    getBatchGenerateFromNodesJob: vi.fn(),
    cancelBatchGenerateFromNodesJob: vi.fn(),
  }
})

const generateFromNode = vi.fn()
const applyGenerateNodeResponse = vi.fn()
const startPolling = vi.fn()

const defaultNodes = [
  {
    id: 'a',
    type: 'dialogueNode',
    position: { x: 0, y: 0 },
    data: { choices: [{ text: '1' }, { text: '2' }] },
  },
  {
    id: 'b',
    type: 'dialogueNode',
    position: { x: 0, y: 0 },
    data: { choices: [{ text: '1', targetNode: 'x' }] },
  },
  {
    id: 'c',
    type: 'dialogueNode',
    position: { x: 0, y: 0 },
    data: { choices: [{ text: '1' }] },
  },
]

const graphState = {
  selectedNodeIds: ['a', 'b', 'c'] as string[],
  nodes: defaultNodes as typeof defaultNodes,
  dialogueMetadata: { filename: 'demo.json', node_count: 3, edge_count: 0 },
  generateFromNode,
  applyGenerateNodeResponse,
}

vi.mock('../store/graphStore', () => ({
  useGraphStore: Object.assign(
    (selector?: (s: typeof graphState) => unknown) =>
      selector ? selector(graphState) : graphState,
    {
      getState: () => graphState,
    }
  ),
}))

vi.mock('../store/contextStore', () => ({
  useContextStore: {
    getState: () => ({
      selections: {
        characters_full: [],
        characters_excerpt: [],
        locations_full: [],
        locations_excerpt: [],
      },
    }),
  },
}))

vi.mock('../store/batchNodeGenerationJobStore', () => ({
  useBatchNodeGenerationJobStore: (selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      isPolling: false,
      current: 0,
      total: 0,
      detail: '',
      report: null,
      pendingApplyReport: null,
      startPolling,
      cancelActiveJob: vi.fn(),
      clearPendingApply: vi.fn(),
      dismissReport: vi.fn(),
    }
    return selector ? selector(state) : state
  },
}))

describe('useBatchGenerateFromNodes', () => {
  const toast = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    graphState.selectedNodeIds = ['a', 'b', 'c']
    graphState.nodes = defaultNodes
    graphState.dialogueMetadata = { filename: 'demo.json', node_count: 3, edge_count: 0 }
    generateFromNode.mockResolvedValue({
      nodeId: 'new-1',
      batchInfo: {
        generatedChoices: 1,
        connectedChoices: 0,
        failedChoices: 0,
        totalChoices: 2,
      },
    })
  })

  it('no-op when fewer than 2 parents', async () => {
    const { result } = renderHook(() => useBatchGenerateFromNodes(toast))
    await act(async () => {
      await result.current.startBatchGenerate(['only-one'])
    })
    expect(toast).toHaveBeenCalledWith('Sélectionnez au moins 2 nœuds', 'warning')
    expect(generateFromNode).not.toHaveBeenCalled()
  })

  it('runs sequential generateFromNode for small selection', async () => {
    const { result } = renderHook(() => useBatchGenerateFromNodes(toast))
    await act(async () => {
      await result.current.startBatchGenerate(['a', 'b', 'c'])
    })
    await waitFor(() => {
      expect(generateFromNode).toHaveBeenCalled()
    })
    expect(generateFromNode).toHaveBeenCalledTimes(2)
    expect(result.current.report?.ok_count).toBe(2)
    expect(result.current.report?.skipped_count).toBe(1)
  })

  it('starts server job when N >= 10', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `n${i}`)
    graphState.selectedNodeIds = ids
    graphState.nodes = ids.map((id) => ({
      id,
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { choices: [{ text: '1' }] },
    }))
    graphState.dialogueMetadata = { filename: 'big.json', node_count: 10, edge_count: 0 }

    vi.mocked(batchApi.startBatchGenerateFromNodesJob).mockResolvedValue({
      job_id: 'job-1',
      status: 'queued',
      total: 10,
    })

    const { result } = renderHook(() => useBatchGenerateFromNodes(toast))
    await act(async () => {
      await result.current.startBatchGenerate(ids)
    })
    expect(batchApi.startBatchGenerateFromNodesJob).toHaveBeenCalled()
    expect(startPolling).toHaveBeenCalledWith('job-1')
    expect(generateFromNode).not.toHaveBeenCalled()
  })
})
