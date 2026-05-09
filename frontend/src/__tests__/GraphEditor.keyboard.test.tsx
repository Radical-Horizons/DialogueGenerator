/**
 * Story 2.3 (FR24): Raccourcis clavier zoom/pan dans l'éditeur de graphe.
 * - Fit View (Ctrl+0) appelle fitView() sur l'instance React Flow (Task 4.1).
 * - Flèches / WASD déplacent le viewport (pan) ; pas de déclenchement quand le focus est dans un input (Task 5.1, AC #5).
 * Story 2.7 (FR28): Ctrl+F ouvre la barre de recherche, Escape la ferme et vide les highlights.
 *
 * On teste le même contrat que GraphEditor (useKeyboardShortcuts + instance fitView/setViewport)
 * via un composant minimal qui enregistre les raccourcis avec instance fournie dès le montage,
 * car useKeyboardShortcuts n'enregistre qu'au montage (deps []).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, waitFor, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { GraphSearchBar } from '../components/graph/GraphSearchBar'
import { JumpToNodeModal } from '../components/graph/JumpToNodeModal'
import { GraphFiltersPanel } from '../components/graph/GraphFiltersPanel'
import { useGraphStore } from '../store/graphStore'

const PAN_DELTA = 50

function GraphShortcutsHarness({
  reactFlowInstance,
}: {
  reactFlowInstance: { fitView: (o: { padding: number; duration: number }) => void; getViewport: () => { x: number; y: number; zoom: number }; setViewport: (vp: { x: number; y: number; zoom: number }) => void } | null
}) {
  useKeyboardShortcuts(
    [
      {
        key: 'ctrl+0',
        handler: (e) => {
          e.preventDefault()
          if (reactFlowInstance) reactFlowInstance.fitView({ padding: 0.2, duration: 200 })
        },
        description: 'Fit View',
        enabled: !!reactFlowInstance,
      },
      {
        key: 'arrowup',
        handler: (e) => {
          e.preventDefault()
          if (reactFlowInstance) {
            const vp = reactFlowInstance.getViewport()
            reactFlowInstance.setViewport({ ...vp, y: vp.y + PAN_DELTA })
          }
        },
        description: 'Pan up',
        enabled: !!reactFlowInstance,
      },
      {
        key: 'arrowdown',
        handler: (e) => {
          e.preventDefault()
          if (reactFlowInstance) {
            const vp = reactFlowInstance.getViewport()
            reactFlowInstance.setViewport({ ...vp, y: vp.y - PAN_DELTA })
          }
        },
        description: 'Pan down',
        enabled: !!reactFlowInstance,
      },
      {
        key: 'w',
        handler: (e) => {
          e.preventDefault()
          if (reactFlowInstance) {
            const vp = reactFlowInstance.getViewport()
            reactFlowInstance.setViewport({ ...vp, y: vp.y + PAN_DELTA })
          }
        },
        description: 'Pan up WASD',
        enabled: !!reactFlowInstance,
      },
      {
        key: 's',
        handler: (e) => {
          e.preventDefault()
          if (reactFlowInstance) {
            const vp = reactFlowInstance.getViewport()
            reactFlowInstance.setViewport({ ...vp, y: vp.y - PAN_DELTA })
          }
        },
        description: 'Pan down WASD',
        enabled: !!reactFlowInstance,
      },
    ],
    [reactFlowInstance]
  )
  return React.createElement('div', { 'data-testid': 'harness' })
}

describe('GraphEditor keyboard shortcuts (Story 2.3)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Ctrl+0 calls fitView on React Flow instance (Story 2.3 Task 4.1, AC #4)', async () => {
    const fitView = vi.fn()
    const mockInstance = {
      fitView,
      getViewport: vi.fn().mockReturnValue({ x: 0, y: 0, zoom: 1 }),
      setViewport: vi.fn(),
    }
    render(React.createElement(GraphShortcutsHarness, { reactFlowInstance: mockInstance }))

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: '0', ctrlKey: true, bubbles: true })
      )
    })

    await waitFor(() => {
      expect(fitView).toHaveBeenCalledWith({ padding: 0.2, duration: 200 })
    })
  })

  it('ArrowUp pans viewport (y += PAN_DELTA) when focus not in input (Story 2.3 Task 5.1, AC #5)', async () => {
    const setViewport = vi.fn()
    const mockInstance = {
      fitView: vi.fn(),
      getViewport: vi.fn().mockReturnValue({ x: 0, y: 0, zoom: 1 }),
      setViewport,
    }
    render(React.createElement(GraphShortcutsHarness, { reactFlowInstance: mockInstance }))

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
      )
    })

    await waitFor(() => {
      expect(setViewport).toHaveBeenCalledWith(expect.objectContaining({ y: 50, x: 0, zoom: 1 }))
    })
  })

  it('ArrowDown pans viewport (y -= PAN_DELTA)', async () => {
    const setViewport = vi.fn()
    const mockInstance = {
      fitView: vi.fn(),
      getViewport: vi.fn().mockReturnValue({ x: 0, y: 0, zoom: 1 }),
      setViewport,
    }
    render(React.createElement(GraphShortcutsHarness, { reactFlowInstance: mockInstance }))

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
      )
    })

    await waitFor(() => {
      expect(setViewport).toHaveBeenCalledWith(expect.objectContaining({ y: -50, x: 0, zoom: 1 }))
    })
  })

  it('WASD keys pan viewport when focus not in input', async () => {
    const setViewport = vi.fn()
    const mockInstance = {
      fitView: vi.fn(),
      getViewport: vi.fn().mockReturnValue({ x: 0, y: 0, zoom: 1 }),
      setViewport,
    }
    render(React.createElement(GraphShortcutsHarness, { reactFlowInstance: mockInstance }))

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }))
    })
    await waitFor(() => {
      expect(setViewport).toHaveBeenCalledWith(expect.objectContaining({ y: 50 }))
    })

    setViewport.mockClear()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }))
    })
    await waitFor(() => {
      expect(setViewport).toHaveBeenCalledWith(expect.objectContaining({ y: -50 }))
    })
  })

  it('arrow keys do not pan when focus is in an input (AC #5)', async () => {
    const setViewport = vi.fn()
    const mockInstance = {
      fitView: vi.fn(),
      getViewport: vi.fn().mockReturnValue({ x: 0, y: 0, zoom: 1 }),
      setViewport,
    }
    render(React.createElement(GraphShortcutsHarness, { reactFlowInstance: mockInstance }))

    const input = document.createElement('input')
    input.setAttribute('type', 'text')
    document.body.appendChild(input)
    input.focus()

    act(() => {
      const ev = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
      Object.defineProperty(ev, 'target', { value: input, writable: false })
      window.dispatchEvent(ev)
    })

    expect(setViewport).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })
})

describe('GraphEditor search bar (Story 2.7)', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
  })

  it('Ctrl+Shift+F opens search bar, Ctrl+F stays available for the browser', async () => {
    const setHighlightedNodes = useGraphStore.getState().setHighlightedNodes
    const MockEditor = () => {
      const [show, setShow] = React.useState(false)
      useKeyboardShortcuts(
        [
          {
            key: 'ctrl+shift+f',
            handler: (e) => {
              e.preventDefault()
              setShow((v) => {
                if (v) useGraphStore.getState().setHighlightedNodes([])
                return !v
              })
            },
            description: 'Recherche',
            enabled: true,
          },
        ],
        []
      )
      return React.createElement(
        'div',
        null,
        show && React.createElement(GraphSearchBar, { onClose: () => { useGraphStore.getState().setHighlightedNodes([]); setShow(false) } })
      )
    }
    const { unmount } = render(React.createElement(MockEditor))
    expect(screen.queryByPlaceholderText(/Rechercher/)).not.toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }))
    })
    expect(screen.queryByPlaceholderText(/Rechercher/)).not.toBeInTheDocument()
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, bubbles: true })
      )
    })
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Rechercher/)).toBeInTheDocument()
    })
    setHighlightedNodes(['n1'])
    expect(useGraphStore.getState().highlightedNodeIds).toEqual(['n1'])
    const searchInput = screen.getByPlaceholderText(/Rechercher/)
    act(() => {
      fireEvent.keyDown(searchInput, { key: 'Escape' })
    })
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/Rechercher/)).not.toBeInTheDocument()
    })
    expect(useGraphStore.getState().highlightedNodeIds).toEqual([])
    unmount()
  })
})

describe('GraphEditor Jump to Node (Story 2.8)', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
  })

  it('Ctrl+J opens Jump to Node modal, Escape closes it (Task 4.1)', async () => {
    const MockEditor = () => {
      const [show, setShow] = React.useState(false)
      useKeyboardShortcuts(
        [
          {
            key: 'ctrl+j',
            handler: (e) => {
              e.preventDefault()
              setShow(true)
            },
            description: 'Jump to Node',
            enabled: true,
          },
        ],
        []
      )
      return React.createElement(
        'div',
        null,
        React.createElement(JumpToNodeModal, {
          isOpen: show,
          onClose: () => setShow(false),
        })
      )
    }
    render(React.createElement(MockEditor))
    expect(screen.queryByRole('dialog', { name: /Jump to node/i })).not.toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true, bubbles: true }))
    })
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Jump to node/i })).toBeInTheDocument()
    })
    const input = screen.getByRole('textbox', { name: /Jump to node/i })
    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Jump to node/i })).not.toBeInTheDocument()
    })
  })
})

describe('GraphEditor Filters panel (Story 2.9)', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
  })

  it('Ctrl+Alt+F opens filters panel, Escape closes it (Task 4.1)', async () => {
    const MockEditor = () => {
      const [show, setShow] = React.useState(false)
      useKeyboardShortcuts(
        [
          {
            key: 'ctrl+alt+f',
            handler: (e) => {
              e.preventDefault()
              setShow((v) => !v)
            },
            description: 'Filtres graphe',
            enabled: true,
          },
        ],
        []
      )
      return React.createElement(
        'div',
        null,
        React.createElement(GraphFiltersPanel, {
          isOpen: show,
          onClose: () => setShow(false),
        })
      )
    }
    render(React.createElement(MockEditor))
    expect(screen.queryByRole('dialog', { name: /Filtres du graphe/i })).not.toBeInTheDocument()
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, altKey: true, bubbles: true })
      )
    })
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Filtres du graphe/i })).toBeInTheDocument()
    })
    const heading = screen.getByRole('heading', { name: /Filtres du graphe/i })
    fireEvent.keyDown(heading.closest('div')!, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Filtres du graphe/i })).not.toBeInTheDocument()
    })
  })
})
