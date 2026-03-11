/**
 * Story 2.6 (FR27): Supprimer connexions entre nœuds — confirmation avant suppression.
 * AC #1, #4 : sur remove edge, pas d'appel immédiat à disconnectNodes ; modal de confirmation (1 ou N connexions).
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import React from 'react'
import { render, screen, act } from '@testing-library/react'
import { ReactFlowProvider } from 'reactflow'
import type { EdgeChange } from 'reactflow'
import { GraphCanvas } from '../components/graph/GraphCanvas'
import { useGraphStore } from '../store/graphStore'

let capturedOnEdgesChange: ((changes: EdgeChange[]) => void) | undefined

vi.mock('reactflow', async (importOriginal) => {
  const mod = await importOriginal<typeof import('reactflow')>()
  const ActualReactFlow = mod.default
  return {
    ...mod,
    default: function MockReactFlow(props: Record<string, unknown>) {
      capturedOnEdgesChange = props.onEdgesChange as (changes: EdgeChange[]) => void
      return React.createElement(ActualReactFlow, props)
    },
  }
})

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
    React.createElement(ReactFlowProvider, null, React.createElement(GraphCanvas))
  )
}

describe('GraphCanvas edge delete confirmation (Story 2.6)', () => {
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
    capturedOnEdgesChange = undefined
  })

  it('on remove edge does not call disconnectNodes immediately; opens confirmation modal (AC #1)', async () => {
    const { addNode, connectNodes } = useGraphStore.getState()
    const n1 = { id: 'n1', type: 'dialogueNode' as const, position: { x: 0, y: 0 }, data: { id: 'n1' } }
    const n2 = { id: 'n2', type: 'dialogueNode' as const, position: { x: 100, y: 0 }, data: { id: 'n2' } }
    addNode(n1)
    addNode(n2)
    connectNodes('n1', 'n2')
    const edgeId = useGraphStore.getState().edges[0]?.id
    expect(edgeId).toBeDefined()

    renderGraphCanvas()
    expect(capturedOnEdgesChange).toBeDefined()

    await act(() => {
      capturedOnEdgesChange!([{ type: 'remove', id: edgeId! }])
    })

    expect(screen.getByText(/Supprimer cette connexion \?/)).toBeInTheDocument()
    expect(useGraphStore.getState().edges.some((e) => e.id === edgeId)).toBe(true)
  })

  it('modal shows "Supprimer N connexions ?" for multiple edges (AC #4)', async () => {
    renderGraphCanvas()
    await act(() => {
      capturedOnEdgesChange!([
        { type: 'remove', id: 'e1' },
        { type: 'remove', id: 'e2' },
        { type: 'remove', id: 'e3' },
      ])
    })
    expect(screen.getByText(/Supprimer 3 connexions \?/)).toBeInTheDocument()
  })

  it('Annuler closes modal without calling disconnectNodes', async () => {
    const { addNode, connectNodes } = useGraphStore.getState()
    addNode({ id: 'n1', type: 'dialogueNode', position: { x: 0, y: 0 }, data: { id: 'n1' } })
    addNode({ id: 'n2', type: 'dialogueNode', position: { x: 100, y: 0 }, data: { id: 'n2' } })
    connectNodes('n1', 'n2')
    const edgeId = useGraphStore.getState().edges[0]?.id!

    renderGraphCanvas()
    await act(() => {
      capturedOnEdgesChange!([{ type: 'remove', id: edgeId }])
    })
    expect(screen.getByText(/Supprimer cette connexion \?/)).toBeInTheDocument()

    await act(async () => {
      screen.getByRole('button', { name: 'Annuler' }).click()
    })
    expect(screen.queryByText(/Supprimer cette connexion \?/)).not.toBeInTheDocument()
    expect(useGraphStore.getState().edges.some((e) => e.id === edgeId)).toBe(true)
  })

  it('Confirm (Supprimer) calls disconnectNodes and removes edges (AC #2)', async () => {
    const { addNode, connectNodes } = useGraphStore.getState()
    addNode({ id: 'n1', type: 'dialogueNode', position: { x: 0, y: 0 }, data: { id: 'n1' } })
    addNode({ id: 'n2', type: 'dialogueNode', position: { x: 100, y: 0 }, data: { id: 'n2' } })
    connectNodes('n1', 'n2')
    const edgeId = useGraphStore.getState().edges[0]?.id!

    renderGraphCanvas()
    await act(() => {
      capturedOnEdgesChange!([{ type: 'remove', id: edgeId }])
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Supprimer' }).click()
    })
    expect(useGraphStore.getState().edges.some((e) => e.id === edgeId)).toBe(false)
  })
})
