/**
 * Handlers du canvas : validation des liens et regroupement undo des suppressions.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeChange } from 'reactflow'

import { useGraphStore } from '../store/graphStore'
import { resolveReactFlowNodeIdUnderPointer } from '../utils/resolveReactFlowNodeIdUnderPointer'
import { useReactFlowHandlers } from './useReactFlowHandlers'

vi.mock('../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

vi.mock('../utils/resolveReactFlowNodeIdUnderPointer', () => ({
  resolveReactFlowNodeIdUnderPointer: vi.fn(),
}))

function dialogue(id: string, choices: unknown[] = []) {
  return {
    id,
    type: 'dialogueNode',
    position: { x: 0, y: 0 },
    data: { id, speaker: 'PNJ', line: id, choices },
  }
}

function renderHandlers() {
  const onChoiceDropOnPane = vi.fn()
  const hook = renderHook(() =>
    useReactFlowHandlers(
      { current: true },
      {
        getFlowPosition: () => ({ x: 10, y: 20 }),
        onChoiceDropOnPane,
        flowContainerRef: { current: document.createElement('div') },
      }
    )
  )
  return { ...hook, onChoiceDropOnPane }
}

function dragChoiceHandleFrom(
  handlers: ReturnType<typeof useReactFlowHandlers>,
  nodeId: string
): void {
  handlers.onConnectStart({} as React.MouseEvent, { nodeId, handleId: 'choice:c1' })
}

describe('useReactFlowHandlers', () => {
  beforeEach(() => {
    vi.mocked(resolveReactFlowNodeIdUnderPointer).mockReset()
    useGraphStore.getState().resetGraph()
    useGraphStore.getState().addNode(dialogue('a', [{ text: 'Partir', choiceId: 'c1' }]))
    useGraphStore.getState().addNode(dialogue('b'))
    useGraphStore.getState().clearUndoHistory()
  })

  it('isValidConnection refuse un nœud relié à lui-même', () => {
    const { result } = renderHandlers()

    expect(
      result.current.isValidConnection({
        source: 'a',
        target: 'a',
        sourceHandle: 'failure',
        targetHandle: null,
      })
    ).toBe(false)
    expect(
      result.current.isValidConnection({
        source: 'a',
        target: 'b',
        sourceHandle: 'failure',
        targetHandle: null,
      })
    ).toBe(true)
  })

  it('un choix lâché sur son propre nœud n’ouvre pas le menu de création et ne relie rien', () => {
    vi.mocked(resolveReactFlowNodeIdUnderPointer).mockReturnValue('a')
    const { result, onChoiceDropOnPane } = renderHandlers()

    dragChoiceHandleFrom(result.current, 'a')
    result.current.onConnectEnd(new MouseEvent('mouseup'))

    expect(onChoiceDropOnPane).not.toHaveBeenCalled()
    expect(useGraphStore.getState().edges).toHaveLength(0)
  })

  it('un choix lâché sur un autre nœud le relie', () => {
    vi.mocked(resolveReactFlowNodeIdUnderPointer).mockReturnValue('b')
    const { result, onChoiceDropOnPane } = renderHandlers()

    dragChoiceHandleFrom(result.current, 'a')
    result.current.onConnectEnd(new MouseEvent('mouseup'))

    expect(onChoiceDropOnPane).not.toHaveBeenCalled()
    expect(useGraphStore.getState().edges.map((e) => e.target)).toEqual(['b'])
  })

  it('un choix lâché dans le vide ouvre toujours le menu de création', () => {
    vi.mocked(resolveReactFlowNodeIdUnderPointer).mockReturnValue(null)
    const { result, onChoiceDropOnPane } = renderHandlers()

    dragChoiceHandleFrom(result.current, 'a')
    result.current.onConnectEnd(new MouseEvent('mouseup'))

    expect(onChoiceDropOnPane).toHaveBeenCalledWith(
      { x: 10, y: 20 },
      { sourceNodeId: 'a', sourceHandleId: 'choice:c1' }
    )
  })

  it('supprimer plusieurs nœuds d’un coup ne pousse qu’un snapshot', () => {
    const { result } = renderHandlers()
    const changes: NodeChange[] = [
      { type: 'remove', id: 'a' },
      { type: 'remove', id: 'b' },
    ]

    act(() => result.current.onNodesChange(changes))

    expect(useGraphStore.getState().nodes).toHaveLength(0)
    expect(useGraphStore.getState().undoStack).toHaveLength(1)
  })
})
