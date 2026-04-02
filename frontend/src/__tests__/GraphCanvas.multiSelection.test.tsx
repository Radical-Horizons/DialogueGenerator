/**
 * Story 2.10 (FR31): intégration GraphCanvas ↔ store pour la multi-sélection.
 * Vérifie la synchro store via onSelectionChange, le clear sur pane click
 * et le déplacement de groupe en mode controlled.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { act, render } from '@testing-library/react'
import { GraphCanvas } from '../components/graph/GraphCanvas'
import { useGraphStore } from '../store/graphStore'
import { CHOICE_EDGE_COLOR } from '../utils/graphEdgeBuilders'

type ReactFlowProps = Record<string, unknown>

let capturedReactFlowProps: ReactFlowProps | null = null

vi.mock('reactflow', () => ({
  default: (props: ReactFlowProps) => {
    capturedReactFlowProps = props
    return React.createElement('div', { 'data-testid': 'mock-reactflow' })
  },
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  useReactFlow: () => ({
    fitView: vi.fn(),
    getNode: vi.fn(),
  }),
}))

vi.mock('../api/graph', () => ({
  getNodePrompt: vi.fn(),
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

describe('GraphCanvas multi-selection (Story 2.10)', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    capturedReactFlowProps = null
  })

  it('onNodesChange with select type synchronizes selectedNodeIds and selectedNodeId in the store', async () => {
    useGraphStore.setState({
      nodes: [
        { id: 'n1', type: 'dialogueNode', position: { x: 0, y: 0 }, data: { id: 'n1' } },
        { id: 'n2', type: 'dialogueNode', position: { x: 100, y: 0 }, data: { id: 'n2' } },
      ],
      selectedNodeIds: [],
    })

    render(React.createElement(GraphCanvas))

    await act(async () => {
      (capturedReactFlowProps?.onNodesChange as (changes: Array<{ type: string; id: string; selected: boolean }>) => void)([
        { type: 'select', id: 'n1', selected: true },
        { type: 'select', id: 'n2', selected: true },
      ])
    })

    const state = useGraphStore.getState()
    expect(state.selectedNodeIds).toEqual(['n1', 'n2'])
    expect(state.selectedNodeId).toBe('n1')
  })

  it('pane click clears the multi-selection', async () => {
    useGraphStore.getState().setSelectedNodes(['n1', 'n2'])
    render(React.createElement(GraphCanvas))

    await act(async () => {
      (capturedReactFlowProps?.onPaneClick as () => void)()
    })

    const state = useGraphStore.getState()
    expect(state.selectedNodeIds).toEqual([])
    expect(state.selectedNodeId).toBeNull()
  })

  it('shift-click does not collapse an existing multi-selection', async () => {
    useGraphStore.setState({
      nodes: [
        { id: 'n1', type: 'dialogueNode', position: { x: 0, y: 0 }, data: { id: 'n1' } },
        { id: 'n2', type: 'dialogueNode', position: { x: 100, y: 0 }, data: { id: 'n2' } },
      ],
    })
    useGraphStore.getState().setSelectedNodes(['n1', 'n2'])

    render(React.createElement(GraphCanvas))

    await act(async () => {
      (capturedReactFlowProps?.onNodeClick as (event: { shiftKey?: boolean }, node: { id: string }) => void)(
        { shiftKey: true },
        { id: 'n2' }
      )
    })

    const state = useGraphStore.getState()
    expect(state.selectedNodeIds).toEqual(['n1', 'n2'])
    expect(state.selectedNodeId).toBe('n1')
  })

  it('dragging one selected node moves the whole selected group with preserved offsets', async () => {
    useGraphStore.setState({
      nodes: [
        { id: 'g1', type: 'dialogueNode', position: { x: 0, y: 0 }, data: { id: 'g1' } },
        { id: 'g2', type: 'dialogueNode', position: { x: 50, y: 0 }, data: { id: 'g2' } },
        { id: 'g3', type: 'dialogueNode', position: { x: 100, y: 0 }, data: { id: 'g3' } },
      ],
    })
    useGraphStore.getState().setSelectedNodes(['g1', 'g2', 'g3'])

    render(React.createElement(GraphCanvas))

    await act(async () => {
      const onNodeDragStart = capturedReactFlowProps?.onNodeDragStart as
        | ((event: unknown, node: { id: string }) => void)
        | undefined
      const onNodeDragStop = capturedReactFlowProps?.onNodeDragStop as
        | ((event: unknown, node: { id: string; position: { x: number; y: number } }) => void)
        | undefined
      onNodeDragStart?.({}, { id: 'g1' })
      onNodeDragStop?.({}, { id: 'g1', position: { x: 100, y: 100 } })
    })

    const state = useGraphStore.getState()
    expect(state.nodes.find((node) => node.id === 'g1')?.position).toEqual({ x: 100, y: 100 })
    expect(state.nodes.find((node) => node.id === 'g2')?.position).toEqual({ x: 150, y: 100 })
    expect(state.nodes.find((node) => node.id === 'g3')?.position).toEqual({ x: 200, y: 100 })
  })

  it('dragging a node moves outgoing descendants by the same delta (default)', async () => {
    useGraphStore.setState({
      nodes: [
        { id: 'p', type: 'dialogueNode', position: { x: 0, y: 0 }, data: { id: 'p' } },
        { id: 'c', type: 'dialogueNode', position: { x: 100, y: 0 }, data: { id: 'c' } },
      ],
      edges: [{ id: 'e-p-c', source: 'p', target: 'c', type: 'smoothstep' }],
      selectedNodeIds: [],
    })

    render(React.createElement(GraphCanvas))

    await act(async () => {
      const onNodeDragStart = capturedReactFlowProps?.onNodeDragStart as
        | ((event: { ctrlKey?: boolean }, node: { id: string }) => void)
        | undefined
      const onNodeDragStop = capturedReactFlowProps?.onNodeDragStop as
        | ((event: unknown, node: { id: string; position: { x: number; y: number } }) => void)
        | undefined
      onNodeDragStart?.({}, { id: 'p' })
      onNodeDragStop?.({}, { id: 'p', position: { x: 40, y: 30 } })
    })

    const state = useGraphStore.getState()
    expect(state.nodes.find((n) => n.id === 'p')?.position).toEqual({ x: 40, y: 30 })
    expect(state.nodes.find((n) => n.id === 'c')?.position).toEqual({ x: 140, y: 30 })
  })

  it('Ctrl at drag start moves only the dragged node', async () => {
    useGraphStore.setState({
      nodes: [
        { id: 'p', type: 'dialogueNode', position: { x: 0, y: 0 }, data: { id: 'p' } },
        { id: 'c', type: 'dialogueNode', position: { x: 100, y: 0 }, data: { id: 'c' } },
      ],
      edges: [{ id: 'e-p-c', source: 'p', target: 'c', type: 'smoothstep' }],
      selectedNodeIds: [],
    })

    render(React.createElement(GraphCanvas))

    await act(async () => {
      const onNodeDragStart = capturedReactFlowProps?.onNodeDragStart as
        | ((event: { ctrlKey?: boolean }, node: { id: string }) => void)
        | undefined
      const onNodeDragStop = capturedReactFlowProps?.onNodeDragStop as
        | ((event: unknown, node: { id: string; position: { x: number; y: number } }) => void)
        | undefined
      onNodeDragStart?.({ ctrlKey: true }, { id: 'p' })
      onNodeDragStop?.({}, { id: 'p', position: { x: 40, y: 30 } })
    })

    const state = useGraphStore.getState()
    expect(state.nodes.find((n) => n.id === 'p')?.position).toEqual({ x: 40, y: 30 })
    expect(state.nodes.find((n) => n.id === 'c')?.position).toEqual({ x: 100, y: 0 })
  })

  it('normalise en mémoire la couleur des edges legacy selon le handle source parent', async () => {
    useGraphStore.setState({
      nodes: [
        {
          id: 'p',
          type: 'dialogueNode',
          position: { x: 0, y: 0 },
          data: { id: 'p', choices: [{ text: 'A', choiceId: 'accept' }] },
        },
        { id: 'c', type: 'dialogueNode', position: { x: 100, y: 100 }, data: { id: 'c' } },
      ],
      edges: [
        {
          id: 'e:p:choice:accept',
          source: 'p',
          target: 'c',
          sourceHandle: 'choice:accept',
          type: 'smoothstep',
          data: { edgeType: 'choice', choiceIndex: 0 },
        },
      ],
      selectedNodeIds: [],
    })

    render(React.createElement(GraphCanvas))
    const edges = capturedReactFlowProps?.edges as Array<{ id: string; style?: { stroke?: string } }>
    const legacyEdge = edges.find((e) => e.id === 'e:p:choice:accept')
    expect(legacyEdge?.style?.stroke).toBe(CHOICE_EDGE_COLOR)
  })
})
