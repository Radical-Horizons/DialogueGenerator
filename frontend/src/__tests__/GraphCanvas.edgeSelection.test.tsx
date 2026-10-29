/**
 * Écran 2e : trait des liens dérivé dans GraphCanvas depuis l'état du store.
 * Choix et suites neutres (1,5 px), issues de test dans leur couleur, et chemin
 * sortant du nœud sélectionné en accent — qui revient au neutre à la désélection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { act, render } from '@testing-library/react'
import type { Edge } from 'reactflow'
import { GraphCanvas } from '../components/graph/GraphCanvas'
import { useGraphStore } from '../store/graphStore'
import {
  EDGE_NEUTRAL_COLOR,
  EDGE_STROKE_WIDTH,
  TEST_RESULT_EDGE_CONFIG,
} from '../utils/graphEdgeBuilders'
import { redesignAccent } from '../theme/redesignTokens'

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

const TEST_NODE_ID = 'test-node-p-choice-1'

function seedGraph() {
  useGraphStore.setState({
    nodes: [
      {
        id: 'p',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'p',
          choices: [
            { text: 'A', choiceId: 'a', targetNode: 'c' },
            { text: 'B', choiceId: 'b', test: 'Raison+Diplomatie:8' },
          ],
        },
      },
      { id: 'c', type: 'dialogueNode', position: { x: 0, y: 200 }, data: { id: 'c', nextNode: 'n' } },
      { id: 'n', type: 'dialogueNode', position: { x: 0, y: 400 }, data: { id: 'n' } },
      {
        id: TEST_NODE_ID,
        type: 'testNode',
        position: { x: 300, y: 200 },
        data: { id: TEST_NODE_ID, test: 'Raison+Diplomatie:8' },
      },
      { id: 's', type: 'dialogueNode', position: { x: 300, y: 400 }, data: { id: 's' } },
      { id: 'f', type: 'dialogueNode', position: { x: 500, y: 400 }, data: { id: 'f' } },
    ],
    edges: [
      {
        id: 'e:p:choice:a',
        source: 'p',
        target: 'c',
        sourceHandle: 'choice:a',
        type: 'smoothstep',
        data: { edgeType: 'choice', choiceIndex: 0 },
      },
      {
        id: 'e:p:choice:b:test',
        source: 'p',
        target: TEST_NODE_ID,
        sourceHandle: 'choice:b',
        type: 'smoothstep',
        data: { edgeType: 'choice', choiceIndex: 1 },
      },
      {
        id: 'c-next-n',
        source: 'c',
        target: 'n',
        type: 'smoothstep',
        label: 'Suivant',
        data: { edgeType: 'nextNode' },
      },
      {
        id: `${TEST_NODE_ID}-success-s`,
        source: TEST_NODE_ID,
        target: 's',
        sourceHandle: 'success',
        type: 'smoothstep',
        data: { edgeType: 'success' },
      },
      {
        id: `${TEST_NODE_ID}-failure-f`,
        source: TEST_NODE_ID,
        target: 'f',
        sourceHandle: 'failure',
        type: 'smoothstep',
        data: { edgeType: 'failure' },
      },
    ],
    selectedNodeIds: [],
    selectedNodeId: null,
  })
}

function renderedEdges(): Edge[] {
  return capturedReactFlowProps?.edges as Edge[]
}

function strokeOf(id: string): unknown {
  return renderedEdges().find((e) => e.id === id)?.style?.stroke
}

const SUCCESS_COLOR = TEST_RESULT_EDGE_CONFIG.find((c) => c.handleId === 'success')!.color
const FAILURE_COLOR = TEST_RESULT_EDGE_CONFIG.find((c) => c.handleId === 'failure')!.color

describe('GraphCanvas — trait des liens (écran 2e)', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    capturedReactFlowProps = null
    seedGraph()
  })

  it('choix et suites : un seul trait neutre à 1,5 px', () => {
    render(React.createElement(GraphCanvas))

    for (const id of ['e:p:choice:a', 'e:p:choice:b:test', 'c-next-n']) {
      const edge = renderedEdges().find((e) => e.id === id)
      expect(edge?.style).toMatchObject({
        stroke: EDGE_NEUTRAL_COLOR,
        strokeWidth: EDGE_STROKE_WIDTH,
      })
    }
    const defaults = capturedReactFlowProps?.defaultEdgeOptions as { style?: Record<string, unknown> }
    expect(defaults.style).toEqual({ stroke: EDGE_NEUTRAL_COLOR, strokeWidth: EDGE_STROKE_WIDTH })
  })

  it('sélection d’un nœud : ses liens sortants passent à l’accent, la désélection rend le neutre', async () => {
    render(React.createElement(GraphCanvas))

    await act(async () => {
      useGraphStore.getState().setSelectedNode('p')
    })
    expect(strokeOf('e:p:choice:a')).toBe(redesignAccent.base)
    expect(strokeOf('e:p:choice:b:test')).toBe(redesignAccent.base)
    expect(strokeOf('c-next-n')).toBe(EDGE_NEUTRAL_COLOR)

    await act(async () => {
      useGraphStore.getState().setSelectedNode('c')
    })
    expect(strokeOf('e:p:choice:a')).toBe(EDGE_NEUTRAL_COLOR)
    expect(strokeOf('c-next-n')).toBe(redesignAccent.base)

    await act(async () => {
      useGraphStore.getState().clearSelection()
    })
    for (const id of ['e:p:choice:a', 'e:p:choice:b:test', 'c-next-n']) {
      expect(strokeOf(id)).toBe(EDGE_NEUTRAL_COLOR)
    }
  })

  it('issues de test : gardent leur couleur, TestNode sélectionné ou non', async () => {
    render(React.createElement(GraphCanvas))
    expect(strokeOf(`${TEST_NODE_ID}-success-s`)).toBe(SUCCESS_COLOR)
    expect(strokeOf(`${TEST_NODE_ID}-failure-f`)).toBe(FAILURE_COLOR)

    await act(async () => {
      useGraphStore.getState().setSelectedNode(TEST_NODE_ID)
    })
    expect(strokeOf(`${TEST_NODE_ID}-success-s`)).toBe(SUCCESS_COLOR)
    expect(strokeOf(`${TEST_NODE_ID}-failure-f`)).toBe(FAILURE_COLOR)
  })

  it('handles d’entrée : couleur au repos, indépendante de la sélection du parent', async () => {
    render(React.createElement(GraphCanvas))
    await act(async () => {
      useGraphStore.getState().setSelectedNode('p')
    })
    const nodes = capturedReactFlowProps?.nodes as Array<{ id: string; data: { incomingEdgeColor?: string } }>
    expect(nodes.find((n) => n.id === 'c')?.data.incomingEdgeColor).toBe(EDGE_NEUTRAL_COLOR)
    expect(nodes.find((n) => n.id === 's')?.data.incomingEdgeColor).toBe(SUCCESS_COLOR)
  })
})
