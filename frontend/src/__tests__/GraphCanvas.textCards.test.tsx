/**
 * Story 20.2 : le canvas passe au prototype derrière le drapeau et pose le palier à `onMoveEnd`.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import React from 'react'
import { act, render } from '@testing-library/react'
import {
  ReactFlowProvider,
  useReactFlow,
  useStoreApi,
  type Edge,
  type Node,
  type ReactFlowInstance,
  type Viewport,
} from 'reactflow'
import { GraphCanvas } from '../components/graph/GraphCanvas'
import { DialogueNode } from '../components/graph/nodes'
import { TextCardNode } from '../components/graph/nodes/TextCardNode'
import { useGraphStore } from '../store/graphStore'
import { useGraphViewStore } from '../store/graphViewStore'
import { useUiLayoutStore } from '../store/uiLayoutStore'
import { documentToGraph } from '../utils/documentToGraph'

interface CapturedProps {
  nodes: Node[]
  edges: Edge[]
  nodeTypes: Record<string, unknown>
  onMove: (event: unknown, viewport: Viewport) => void
  onMoveEnd?: (event: unknown, viewport: Viewport) => void
}

let captured: CapturedProps

vi.mock('reactflow', async (importOriginal) => {
  const mod = await importOriginal<typeof import('reactflow')>()
  const ActualReactFlow = mod.default
  return {
    ...mod,
    default: function CapturingReactFlow(props: Record<string, unknown>) {
      captured = props as unknown as CapturedProps
      return React.createElement(ActualReactFlow, props)
    },
  }
})

const document = {
  schemaVersion: '1.1.0',
  nodes: [
    {
      id: 'START',
      line: 'Bonjour',
      choices: [{ choiceId: 'c0', text: 'Tester', test: 'Raison:12', testSuccessNode: 'node-a' }],
    },
    { id: 'node-a', line: 'Réussi' },
  ],
}

let instance: ReactFlowInstance
let flowStore: ReturnType<typeof useStoreApi>

function CaptureInstance() {
  instance = useReactFlow()
  flowStore = useStoreApi()
  return null
}

const renderCanvas = () =>
  render(
    <ReactFlowProvider>
      <GraphCanvas />
      <CaptureInstance />
    </ReactFlowProvider>
  )

/** Le zoom passe par une transition d3 que jsdom ne joue pas : on pose la transformation. */
const zoomTo = (zoom: number) => {
  act(() => flowStore.setState({ transform: [0, 0, zoom] }))
  expect(instance.getZoom()).toBe(zoom)
}

const gesture = { type: 'wheel' }

describe('GraphCanvas — prototype cartes de texte (Story 20.2)', () => {
  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    }
  })

  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    useGraphStore.setState(documentToGraph(document, undefined))
    useGraphViewStore.setState({ zoomTier: 'write', writingNodeId: null })
    useUiLayoutStore.setState({ textCardsPrototype: true, textCardsTestBars: false })
  })

  afterEach(() => {
    useUiLayoutStore.setState({ textCardsPrototype: false, textCardsTestBars: false })
    vi.useRealTimers()
  })

  it('drapeau éteint : carte actuelle, nœuds de test et aucun onMoveEnd', () => {
    useUiLayoutStore.setState({ textCardsPrototype: false })
    renderCanvas()
    expect(captured.nodeTypes.dialogueNode).toBe(DialogueNode)
    expect(captured.nodes.some((n) => n.type === 'testNode')).toBe(true)
    expect(captured.onMoveEnd).toBeUndefined()
  })

  it('drapeau actif : cartes de texte, issues sans nœud de test, store intact', () => {
    renderCanvas()
    expect(captured.nodeTypes.dialogueNode).toBe(TextCardNode)
    expect(captured.nodes.map((n) => n.id)).toEqual(['START', 'node-a'])
    expect(captured.edges.map((e) => [e.source, e.sourceHandle, e.target])).toEqual([
      ['START', 'test:c0:success', 'node-a'],
    ])
    expect(useGraphStore.getState().nodes.some((n) => n.type === 'testNode')).toBe(true)
  })

  it('onMove sans onMoveEnd : palier inchangé ; onMoveEnd le pose', () => {
    vi.useFakeTimers()
    renderCanvas()
    act(() => captured.onMove(gesture, { x: 0, y: 0, zoom: 0.2 }))
    zoomTo(0.2)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(useGraphViewStore.getState().zoomTier).toBe('write')

    act(() => captured.onMoveEnd?.(gesture, { x: 0, y: 0, zoom: 0.5 }))
    expect(useGraphViewStore.getState().zoomTier).toBe('read')
    act(() => captured.onMoveEnd?.(gesture, { x: 0, y: 0, zoom: 0.2 }))
    expect(useGraphViewStore.getState().zoomTier).toBe('situate')
  })

  it('un zoom programmé, sans geste, pose le palier', () => {
    vi.useFakeTimers()
    renderCanvas()
    zoomTo(0.5)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(useGraphViewStore.getState().zoomTier).toBe('read')
  })

  it('une sélection ne reconstruit que les nœuds touchés, une validation tous les concernés', () => {
    renderCanvas()
    const [start, other] = captured.nodes
    const edges = captured.edges

    act(() => useGraphStore.getState().setSelectedNode('START'))
    expect(captured.nodes[0]).not.toBe(start)
    expect(captured.nodes[0].selected).toBe(true)
    expect(captured.nodes[1]).toBe(other)
    expect(captured.edges.map((e) => e.id)).toEqual(edges.map((e) => e.id))

    act(() =>
      useGraphStore.setState({
        validationErrors: [
          { type: 'missing_display_name', node_id: 'node-a', message: 'x', severity: 'error' },
        ],
      })
    )
    expect(captured.nodes[1].data.validationErrors).toHaveLength(1)
    act(() => useGraphStore.setState({ highlightedNodeIds: ['node-a'] }))
    expect(captured.nodes[1].data.isHighlighted).toBe(true)

    act(() => useGraphStore.setState({ highlightedCycleNodes: ['START'] }))
    expect(captured.nodes[0].style?.border).toBe('3px solid orange')
    act(() => useGraphStore.setState({ highlightedCycleNodes: [] }))
    expect(captured.nodes[0].style?.border).toBeUndefined()

    const storeEdges = useGraphStore.getState().edges
    const color = captured.nodes[1].data.incomingEdgeColor
    expect(color).toBeDefined()
    act(() => useGraphStore.setState({ edges: storeEdges.filter((e) => e.target !== 'node-a') }))
    expect(captured.nodes[1].data.incomingEdgeColor).toBeUndefined()
    act(() => useGraphStore.setState({ edges: storeEdges }))
    expect(captured.nodes[1].data.incomingEdgeColor).toBe(color)
  })

  it('les positions du glisser en cours ne changent que les nœuds déplacés', () => {
    renderCanvas()
    const before = captured.nodes
    act(() => useGraphViewStore.getState().setDragPositions({ START: { x: 42, y: 24 } }))

    expect(captured.nodes[0]).toMatchObject({ id: 'START', position: { x: 42, y: 24 } })
    expect(captured.nodes[0].data).toBe(before[0].data)
    expect(captured.nodes[1]).toBe(before[1])

    act(() => useGraphViewStore.getState().setDragPositions(null))
    expect(captured.nodes).toBe(before)
  })

  it("changer de nœud, de dialogue ou rouvrir l'inspecteur met fin à l'écriture", () => {
    useGraphStore.setState({ documentId: 'premier' })
    renderCanvas()
    const endsWriting = (change: () => void) => {
      act(() => {
        useGraphStore.getState().setSelectedNode('START')
        useUiLayoutStore.getState().setInspectorTab(null)
        useGraphViewStore.getState().setWritingNode('START')
      })
      expect(useGraphViewStore.getState().writingNodeId).toBe('START')
      act(change)
      expect(useGraphViewStore.getState().writingNodeId).toBeNull()
    }

    endsWriting(() => useUiLayoutStore.getState().setInspectorTab('node'))
    endsWriting(() => useGraphStore.getState().setSelectedNode('node-a'))
    endsWriting(() => useGraphStore.setState({ documentId: 'second' }))
  })
})
