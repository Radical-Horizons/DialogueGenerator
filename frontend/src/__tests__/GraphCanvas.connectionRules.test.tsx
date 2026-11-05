/**
 * Câblage React Flow : auto-lien refusé au survol, et clic sans effet sur l'historique.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { ReactFlowProvider } from 'reactflow'
import type { Connection } from 'reactflow'
import { GraphCanvas } from '../components/graph/GraphCanvas'
import { useGraphStore } from '../store/graphStore'
import { useGraphViewStore } from '../store/graphViewStore'

const capturedProps: {
  isValidConnection?: (connection: Connection) => boolean
  nodeDragThreshold?: number
} = {}

vi.mock('reactflow', async (importOriginal) => {
  const mod = await importOriginal<typeof import('reactflow')>()
  const ActualReactFlow = mod.default
  return {
    ...mod,
    default: function MockReactFlow(props: Record<string, unknown>) {
      capturedProps.isValidConnection = props.isValidConnection as (c: Connection) => boolean
      capturedProps.nodeDragThreshold = props.nodeDragThreshold as number
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

describe('GraphCanvas — règles de connexion', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    useGraphViewStore.getState().clearFocus()
  })

  it('branche la validation : un nœud ne s’accroche pas à sa propre ancre', () => {
    renderGraphCanvas()

    const connection = { sourceHandle: 'failure', targetHandle: null }
    expect(capturedProps.isValidConnection?.({ ...connection, source: 'x', target: 'x' })).toBe(false)
    expect(capturedProps.isValidConnection?.({ ...connection, source: 'x', target: 'y' })).toBe(true)
  })

  it('ne démarre pas un déplacement au mousedown, qui pousserait un snapshot par clic', () => {
    renderGraphCanvas()

    expect(capturedProps.nodeDragThreshold).toBeGreaterThan(0)
  })

  it('expose le conteneur du canvas pour placer les nœuds dans la zone visible', () => {
    const { unmount } = renderGraphCanvas()

    expect(useGraphViewStore.getState().canvasElement).toBeInstanceOf(HTMLElement)
    expect(useGraphViewStore.getState().canvasElement).toContainElement(
      screen.getByTestId('graph-zoom-bar')
    )

    unmount()
    expect(useGraphViewStore.getState().canvasElement).toBeNull()
  })
})
