/**
 * Story 17.2 FR119 — long press tactile (pointer: coarse) → menus contextuels.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import React from 'react'
import { render, screen, act, waitFor } from '@testing-library/react'
import { ReactFlowProvider } from 'reactflow'
import { GraphCanvas } from '../components/graph/GraphCanvas'
import { useGraphStore } from '../store/graphStore'
import { CONTEXT_MENU_LONG_PRESS_MS } from '../hooks/useGraphContextMenuLongPress'

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

vi.mock('../api/graph', () => ({
  getNodePrompt: vi.fn(),
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

function stubCoarseMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query.includes('pointer: coarse'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as MediaQueryList
  )
}

describe('GraphCanvas — long press context menu (17.2)', () => {
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
    stubCoarseMatchMedia()
    useGraphStore.getState().resetGraph()
    useGraphStore.setState({
      documentId: 'doc-fr119',
      nodes: [
        {
          id: 'n-dialogue',
          type: 'dialogueNode',
          position: { x: 0, y: 0 },
          data: { id: 'n-dialogue', speaker: 'S', line: 'L', choices: [] },
        },
      ],
      edges: [],
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('long press sur le pane ouvre le menu (Nouveau nœud)', async () => {
    const { container } = render(
      React.createElement(ReactFlowProvider, null, React.createElement(GraphCanvas))
    )
    await waitFor(() => {
      expect(container.querySelector('.react-flow__pane')).toBeTruthy()
    })
    const pane = container.querySelector('.react-flow__pane')!

    await act(async () => {
      pane.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 80,
          clientY: 80,
          pointerId: 1,
          pointerType: 'touch',
        })
      )
    })
    await act(async () => {
      await delay(CONTEXT_MENU_LONG_PRESS_MS + 80)
    })

    expect(screen.getByRole('menuitem', { name: /nouveau nœud/i })).toBeTruthy()
  })

  it('long press sur un nœud dialogue expose Éditer et Générer', async () => {
    const { container } = render(
      React.createElement(ReactFlowProvider, null, React.createElement(GraphCanvas))
    )
    await waitFor(() => {
      expect(container.querySelector('[data-testid="rf__node-n-dialogue"]')).toBeTruthy()
    })
    const node = container.querySelector('[data-testid="rf__node-n-dialogue"]')!

    await act(async () => {
      node.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 10,
          clientY: 10,
          pointerId: 2,
          pointerType: 'touch',
        })
      )
    })
    await act(async () => {
      await delay(CONTEXT_MENU_LONG_PRESS_MS + 80)
    })

    expect(screen.getByRole('menuitem', { name: /éditer/i })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /générer/i })).toBeTruthy()
  })

  it('mouvement > seuil annule le long press sur le pane', async () => {
    const { container } = render(
      React.createElement(ReactFlowProvider, null, React.createElement(GraphCanvas))
    )
    await waitFor(() => {
      expect(container.querySelector('.react-flow__pane')).toBeTruthy()
    })
    const pane = container.querySelector('.react-flow__pane')!

    await act(async () => {
      pane.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 100,
          clientY: 100,
          pointerId: 3,
          pointerType: 'touch',
        })
      )
    })
    await act(async () => {
      pane.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 130,
          clientY: 100,
          pointerId: 3,
          pointerType: 'touch',
        })
      )
    })
    await act(async () => {
      await delay(CONTEXT_MENU_LONG_PRESS_MS + 80)
    })

    expect(screen.queryByRole('menuitem', { name: /nouveau nœud/i })).toBeNull()
  })
})
