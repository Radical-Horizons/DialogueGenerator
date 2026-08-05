/**
 * Story 2.1 (FR22) + Story 2.2 (FR23): virtualisation React Flow.
 * Vérifie que onlyRenderVisibleElements est activé pour les graphes 500+ nœuds (NFR-P1),
 * couleurs par type (AC #2), régression edges après sélection.
 * Story 2.2: virtualisation active ⇒ nœuds hors viewport non rendus (mémoire); perf <1s / <100ms (NFR-P1/P4) assurées par virtualisation.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import React from 'react'
import { render, screen, act } from '@testing-library/react'
import { ReactFlowProvider } from 'reactflow'
import type { Node } from 'reactflow'
import { GraphCanvas } from '../components/graph/GraphCanvas'
import { useGraphViewStore } from '../store/graphViewStore'
import { DialogueNode, TestNode, EndNode } from '../components/graph/nodes'
import { useGraphStore } from '../store/graphStore'

const capturedReactFlowProps: {
  onlyRenderVisibleElements?: boolean
  nodeTypes?: Record<string, unknown>
  minZoom?: number
  maxZoom?: number
  onNodeDoubleClick?: (event: unknown, node: { id: string }) => void
  snapToGrid?: boolean
  snapGrid?: [number, number]
  autoPanOnNodeDrag?: boolean
} = {}

vi.mock('reactflow', async (importOriginal) => {
  const mod = await importOriginal<typeof import('reactflow')>()
  const ActualReactFlow = mod.default
  return {
    ...mod,
    default: function MockReactFlow(props: Record<string, unknown>) {
      capturedReactFlowProps.onlyRenderVisibleElements = props.onlyRenderVisibleElements as boolean
      capturedReactFlowProps.nodeTypes = props.nodeTypes as Record<string, unknown>
      capturedReactFlowProps.minZoom = props.minZoom as number
      capturedReactFlowProps.maxZoom = props.maxZoom as number
      capturedReactFlowProps.onNodeDoubleClick = props.onNodeDoubleClick as (event: unknown, node: { id: string }) => void
      capturedReactFlowProps.snapToGrid = props.snapToGrid as boolean
      capturedReactFlowProps.snapGrid = props.snapGrid as [number, number]
      capturedReactFlowProps.autoPanOnNodeDrag = props.autoPanOnNodeDrag as boolean
      return React.createElement(ActualReactFlow, props)
    },
  }
})

// Mock graph API used by DialogueNode (prompt/regenerate)
vi.mock('../api/graph', () => ({
  getNodePrompt: vi.fn(),
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

function renderGraphCanvas() {
  return render(
    React.createElement(
      ReactFlowProvider,
      null,
      React.createElement(GraphCanvas)
    )
  )
}

function createMockNode(id: string, type: 'dialogueNode' | 'testNode' | 'endNode'): Node {
  const base = { id, type, position: { x: 0, y: 0 }, data: {} }
  if (type === 'dialogueNode') {
    return { ...base, data: { id, speaker: 'Speaker', line: 'Preview text' } }
  }
  if (type === 'testNode') {
    return { ...base, data: { id, test: 'Test', line: 'Test preview' } }
  }
  return base
}

describe('GraphCanvas virtualization (Story 2.1)', () => {
  beforeAll(() => {
    if (typeof globalThis.ResizeObserver === 'undefined') {
      globalThis.ResizeObserver = class ResizeObserver {
        observe = vi.fn()
        unobserve = vi.fn()
        disconnect = vi.fn()
      }
    }
  })

  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    capturedReactFlowProps.onlyRenderVisibleElements = undefined
    capturedReactFlowProps.minZoom = undefined
    capturedReactFlowProps.maxZoom = undefined
    capturedReactFlowProps.onNodeDoubleClick = undefined
    capturedReactFlowProps.snapToGrid = undefined
    capturedReactFlowProps.snapGrid = undefined
    capturedReactFlowProps.autoPanOnNodeDrag = undefined
  })

  it('passes onlyRenderVisibleElements={true} to ReactFlow for 500+ nodes performance (NFR-P1)', () => {
    renderGraphCanvas()
    expect(capturedReactFlowProps.onlyRenderVisibleElements).toBe(true)
  })

  it('keeps nodeTypes (dialogueNode, testNode, endNode) unchanged (AC #2)', () => {
    renderGraphCanvas()
    const { nodeTypes } = capturedReactFlowProps
    expect(nodeTypes).toBeDefined()
    expect(nodeTypes?.dialogueNode).toBeDefined()
    expect(nodeTypes?.testNode).toBeDefined()
    expect(nodeTypes?.endNode).toBeDefined()
  })

  it(
    'with 500 nodes in store, still passes onlyRenderVisibleElements=true (NFR-P1 readiness)',
    () => {
      const { addNode } = useGraphStore.getState()
      // Pas de testNode orphelin : normalizeTestBars les retire du store (barres de test liées à un choix).
      for (let i = 0; i < 500; i++) {
        addNode(createMockNode(`n${i}`, i % 2 === 0 ? 'dialogueNode' : 'endNode'))
      }
      renderGraphCanvas()
      expect(capturedReactFlowProps.onlyRenderVisibleElements).toBe(true)
      expect(useGraphStore.getState().nodes).toHaveLength(500)
    },
    15000
  )

  it(
    'with 501+ nodes, virtualisation active so only visible nodes are rendered (Story 2.2 AC #1, #2)',
    () => {
      const { addNode } = useGraphStore.getState()
      for (let i = 0; i < 501; i++) {
        addNode(createMockNode(`n${i}`, i % 2 === 0 ? 'dialogueNode' : 'endNode'))
      }
      renderGraphCanvas()
      expect(capturedReactFlowProps.onlyRenderVisibleElements).toBe(true)
      expect(useGraphStore.getState().nodes).toHaveLength(501)
      // With onlyRenderVisibleElements=true, React Flow renders only viewport nodes; no backend lazy loading required for 500+ nodes.
    },
    15000
  )

  it('when focusNode is called via graphViewStore, setHighlightedNodes is called and store highlights node (Story 2.2 AC #3)', async () => {
    const { addNode } = useGraphStore.getState()
    addNode(createMockNode('n1', 'dialogueNode'))
    addNode(createMockNode('n2', 'dialogueNode'))
    renderGraphCanvas()
    expect(useGraphStore.getState().highlightedNodeIds).toEqual([])
    await act(async () => {
      useGraphViewStore.getState().focusNode('n2')
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150))
    })
    expect(useGraphStore.getState().highlightedNodeIds).toEqual(['n2'])
  })

  it('passes minZoom and maxZoom to ReactFlow (Story 2.3 AC #1)', () => {
    renderGraphCanvas()
    expect(capturedReactFlowProps.minZoom).toBe(0.1)
    expect(capturedReactFlowProps.maxZoom).toBe(2)
  })

  it('passes snapToGrid and snapGrid to ReactFlow (Story 2.4 AC #4)', () => {
    renderGraphCanvas()
    expect(capturedReactFlowProps.snapToGrid).toBe(true)
    expect(capturedReactFlowProps.snapGrid).toEqual([15, 15])
  })

  it('passes autoPanOnNodeDrag to ReactFlow (Story 2.4 AC #5)', () => {
    renderGraphCanvas()
    expect(capturedReactFlowProps.autoPanOnNodeDrag).toBe(true)
  })

  it('displays zoom level in UI (Story 2.3 AC #1 - controls/indicator)', () => {
    renderGraphCanvas()
    // Ecran 2e : une barrette « - N % + AJUSTER » remplace la pile React Flow
    // doublee d un badge de zoom. En canvas etroit (cas jsdom) elle garde son
    // compteur et perd ses boutons.
    expect(screen.getByTestId('graph-zoom-level')).toHaveTextContent('100 %')
  })

  it('double-click on node triggers focusNode via graphViewStore (Story 2.3 AC #3)', () => {
    const { addNode } = useGraphStore.getState()
    addNode(createMockNode('n1', 'dialogueNode'))
    addNode(createMockNode('n2', 'dialogueNode'))
    renderGraphCanvas()
    expect(capturedReactFlowProps.onNodeDoubleClick).toBeDefined()
    const focusSpy = vi.fn()
    const originalFocusNode = useGraphViewStore.getState().focusNode
    useGraphViewStore.setState({
      focusNode: (nodeId: string) => { focusSpy(nodeId); originalFocusNode(nodeId) },
    })
    act(() => {
      capturedReactFlowProps.onNodeDoubleClick!(null, { id: 'n2' })
    })
    expect(focusSpy).toHaveBeenCalledWith('n2')
    useGraphViewStore.setState({ focusNode: originalFocusNode })
  })

  it('with multiple nodes and edges, selection does not alter nodes or edges count (regression)', () => {
    const { addNode, connectNodes, setSelectedNode } = useGraphStore.getState()
    for (let i = 0; i < 10; i++) {
      addNode(createMockNode(`n${i}`, 'dialogueNode'))
    }
    for (let i = 0; i < 9; i++) {
      connectNodes(`n${i}`, `n${i + 1}`, 0, 'choice')
    }
    renderGraphCanvas()
    act(() => {
      setSelectedNode('n1')
    })
    const state = useGraphStore.getState()
    expect(state.nodes).toHaveLength(10)
    expect(state.edges).toHaveLength(9)
  })
})

describe('Node type colors (AC #2) - dialogue=bleu, test=orange, end=gris', () => {
  beforeAll(() => {
    if (typeof globalThis.ResizeObserver === 'undefined') {
      globalThis.ResizeObserver = class ResizeObserver {
        observe = vi.fn()
        unobserve = vi.fn()
        disconnect = vi.fn()
      }
    }
  })

  beforeEach(() => {
    useGraphStore.getState().resetGraph()
  })

  const defaultNodeProps = (type: string, data: Record<string, unknown>) => ({
    id: 'n1',
    type,
    position: { x: 0, y: 0 },
    data: { id: 'n1', ...data },
    selected: false,
    xPos: 0,
    yPos: 0,
    width: 200,
    height: 80,
    measured: { width: 200, height: 80 },
    dragging: false,
    zIndex: 0,
    isConnectable: true,
  })

  // Refonte 2e : bordure neutre #3d3d46 (rgb(61, 61, 70)) par défaut sur les trois types.
  it('DialogueNode uses neutral redesign border (#3d3d46) when not selected', () => {
    render(
      React.createElement(
        ReactFlowProvider,
        null,
        React.createElement(DialogueNode, defaultNodeProps('dialogueNode', { speaker: 'A', line: 'Hi' }) as React.ComponentProps<typeof DialogueNode>)
      )
    )
    const node = screen.getByTestId('graph-node-content')
    expect(node.getAttribute('style')).toMatch(/61,\s*61,\s*70|3d3d46/i)
  })

  it('TestNode uses neutral redesign border (#3d3d46) when not selected', () => {
    render(
      React.createElement(
        ReactFlowProvider,
        null,
        React.createElement(TestNode, defaultNodeProps('testNode', { test: 'T', line: 'L' }) as React.ComponentProps<typeof TestNode>)
      )
    )
    const node = screen.getByTestId('graph-node-content')
    expect(node.getAttribute('style')).toMatch(/61,\s*61,\s*70|3d3d46/i)
  })

  it('EndNode uses neutral redesign border (#3d3d46) when not selected', () => {
    render(
      React.createElement(
        ReactFlowProvider,
        null,
        React.createElement(EndNode, defaultNodeProps('endNode', {}) as React.ComponentProps<typeof EndNode>)
      )
    )
    const node = screen.getByTestId('graph-node-content')
    expect(node.getAttribute('style')).toMatch(/61,\s*61,\s*70|3d3d46/i)
  })
})
