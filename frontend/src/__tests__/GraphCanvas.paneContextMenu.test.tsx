/**
 * Story 2.12 (FR33): Actions contextuelles — intégration dans GraphCanvas.
 * Task 3.1 + Task 4.3 : Tests d'intégration onPaneContextMenu.
 * AC #3 : onPaneContextMenu affiche le PaneContextMenu.
 * AC #6 : onPaneClick ferme le menu pane.
 * AC #4.3 : onNodeContextMenu toujours fonctionnel (non-régression).
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import React from 'react'
import { render, screen, act } from '@testing-library/react'
import { ReactFlowProvider } from 'reactflow'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { GraphCanvas } from '../components/graph/GraphCanvas'
import { useGraphStore } from '../store/graphStore'

let capturedOnPaneContextMenu:
  | ((event: ReactMouseEvent<Element>) => void)
  | undefined
let capturedOnPaneClick: (() => void) | undefined
let capturedOnNodeContextMenu:
  | ((event: ReactMouseEvent<Element>, node: { id: string }) => void)
  | undefined

vi.mock('reactflow', async (importOriginal) => {
  const mod = await importOriginal<typeof import('reactflow')>()
  const ActualReactFlow = mod.default
  return {
    ...mod,
    default: function MockReactFlow(props: Record<string, unknown>) {
      capturedOnPaneContextMenu = props.onPaneContextMenu as typeof capturedOnPaneContextMenu
      capturedOnPaneClick = props.onPaneClick as typeof capturedOnPaneClick
      capturedOnNodeContextMenu = props.onNodeContextMenu as typeof capturedOnNodeContextMenu
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

describe('GraphCanvas — pane context menu (Story 2.12)', () => {
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
    capturedOnPaneContextMenu = undefined
    capturedOnPaneClick = undefined
    capturedOnNodeContextMenu = undefined
  })

  it('AC #3 : onPaneContextMenu est passé à ReactFlow', async () => {
    renderGraphCanvas()
    expect(capturedOnPaneContextMenu).toBeDefined()
  })

  it('AC #3 : onPaneContextMenu affiche le PaneContextMenu avec "Nouveau nœud"', async () => {
    renderGraphCanvas()
    await act(async () => {
      const fakeEvent = {
        preventDefault: vi.fn(),
        clientX: 400,
        clientY: 300,
      }
      capturedOnPaneContextMenu?.(fakeEvent as unknown as ReactMouseEvent<Element>)
    })
    expect(screen.getByText('Nouveau nœud')).toBeTruthy()
  })

  it('AC #6 : onPaneClick ferme le menu pane', async () => {
    renderGraphCanvas()
    await act(async () => {
      const fakeEvent = {
        preventDefault: vi.fn(),
        clientX: 400,
        clientY: 300,
      }
      capturedOnPaneContextMenu?.(fakeEvent as unknown as ReactMouseEvent<Element>)
    })
    expect(screen.getByText('Nouveau nœud')).toBeTruthy()
    await act(async () => {
      capturedOnPaneClick?.()
    })
    expect(screen.queryByText('Nouveau nœud')).toBeNull()
  })

  it('AC #6 : Escape ferme le menu pane', async () => {
    renderGraphCanvas()
    await act(async () => {
      const fakeEvent = {
        preventDefault: vi.fn(),
        clientX: 400,
        clientY: 300,
      }
      capturedOnPaneContextMenu?.(fakeEvent as unknown as ReactMouseEvent<Element>)
    })
    expect(screen.getByText('Nouveau nœud')).toBeTruthy()
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(screen.queryByText('Nouveau nœud')).toBeNull()
  })

  it('AC #4 : clic "Nouveau nœud" appelle createEmptyNode avec une position (x, y)', async () => {
    renderGraphCanvas()
    const initialCount = useGraphStore.getState().nodes.length
    await act(async () => {
      const fakeEvent = {
        preventDefault: vi.fn(),
        clientX: 400,
        clientY: 300,
      }
      capturedOnPaneContextMenu?.(fakeEvent as unknown as ReactMouseEvent<Element>)
    })
    const createNodeBtn = screen.getByText('Nouveau nœud').closest('button')!
    await act(async () => {
      createNodeBtn.click()
    })
    const nodes = useGraphStore.getState().nodes
    expect(nodes.length).toBe(initialCount + 1)
    const added = nodes[nodes.length - 1]
    expect(added.position).toBeDefined()
    expect(typeof added.position.x).toBe('number')
    expect(typeof added.position.y).toBe('number')
  })

  it('AC #4.3 (non-régression) : onNodeContextMenu toujours fonctionnel', async () => {
    renderGraphCanvas()
    expect(capturedOnNodeContextMenu).toBeDefined()
  })
})
