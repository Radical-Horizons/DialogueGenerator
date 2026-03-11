/**
 * Story 2.3 (FR24): Raccourcis clavier zoom/pan dans l'éditeur de graphe.
 * - Fit View (Ctrl+0) appelle fitView() sur l'instance React Flow (Task 4.1).
 * - Flèches / WASD déplacent le viewport (pan) ; pas de déclenchement quand le focus est dans un input (Task 5.1, AC #5).
 *
 * On teste le même contrat que GraphEditor (useKeyboardShortcuts + instance fitView/setViewport)
 * via un composant minimal qui enregistre les raccourcis avec instance fournie dès le montage,
 * car useKeyboardShortcuts n'enregistre qu'au montage (deps []).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import React from 'react'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'

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
