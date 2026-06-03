import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useNarrowInlineSize } from './useNarrowInlineSize'

describe('useNarrowInlineSize', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Cas A : nœud monté immédiatement, largeur > seuil → isNarrow false', () => {
    function Host() {
      const { ref, isNarrow } = useNarrowInlineSize(640)
      return (
        <div ref={ref} style={{ width: '800px' }} data-testid="node" data-narrow={String(isNarrow)} />
      )
    }
    render(<Host />)
    expect(screen.getByTestId('node')).toHaveAttribute('data-narrow', 'false')
  })

  it('Cas B : nœud monté immédiatement, largeur < seuil → isNarrow true', () => {
    function Host() {
      const { ref, isNarrow } = useNarrowInlineSize(640)
      return (
        <div ref={ref} style={{ width: '400px' }} data-testid="node" data-narrow={String(isNarrow)} />
      )
    }
    render(<Host />)
    expect(screen.getByTestId('node')).toHaveAttribute('data-narrow', 'true')
  })

  it('Cas C : nœud monté après le 1er render → isNarrow reflète la mesure sans resize artificiel', async () => {
    function Host() {
      const { ref, isNarrow } = useNarrowInlineSize(640)
      const [show, setShow] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setShow(true)}>
            montrer
          </button>
          {show ? <div ref={ref} style={{ width: '400px' }} data-testid="mes" /> : null}
          <span data-testid="flag">{String(isNarrow)}</span>
        </>
      )
    }
    const user = userEvent.setup()
    render(<Host />)
    expect(screen.getByTestId('flag')).toHaveTextContent('false')
    await user.click(screen.getByRole('button', { name: /montrer/i }))
    await waitFor(() => {
      expect(screen.getByTestId('flag')).toHaveTextContent('true')
    })
  })

  it('Cas D : ré-attachement sur un autre nœud — disconnect RO puis nouvelle mesure', async () => {
    let disconnectCallCount = 0
    let resizeObserverInstanceCount = 0
    const PreviousResizeObserver = global.ResizeObserver
    global.ResizeObserver = class ResizeObserver {
      constructor() {
        resizeObserverInstanceCount += 1
      }
      observe() {}
      unobserve() {}
      disconnect() {
        disconnectCallCount += 1
      }
    } as unknown as typeof ResizeObserver

    function Host() {
      const { ref, isNarrow } = useNarrowInlineSize(640)
      const [phase, setPhase] = useState<'a' | 'b'>('a')
      return (
        <>
          {phase === 'a' ? (
            <div key="pane-a" ref={ref} style={{ width: '400px' }} data-testid="pane" />
          ) : (
            <div key="pane-b" ref={ref} style={{ width: '800px' }} data-testid="pane" />
          )}
          <button type="button" onClick={() => setPhase('b')}>
            élargir
          </button>
          <span data-testid="flag">{String(isNarrow)}</span>
        </>
      )
    }
    const user = userEvent.setup()
    try {
      render(<Host />)
      expect(screen.getByTestId('flag')).toHaveTextContent('true')
      const instancesBeforeSwitch = resizeObserverInstanceCount
      await user.click(screen.getByRole('button', { name: /élargir/i }))
      await waitFor(() => {
        expect(screen.getByTestId('flag')).toHaveTextContent('false')
      })
      expect(resizeObserverInstanceCount).toBeGreaterThan(instancesBeforeSwitch)
      expect(disconnectCallCount).toBeGreaterThan(0)
    } finally {
      global.ResizeObserver = PreviousResizeObserver
    }
  })

  it('mesure le parent quand measureParentClientWidth est true (colonne Dashboard)', () => {
    function Host() {
      const { ref, isNarrow } = useNarrowInlineSize(640, { measureParentClientWidth: true })
      return (
        <div style={{ width: '400px' }} data-testid="parent">
          <div ref={ref} style={{ width: '900px' }} data-testid="child" data-narrow={String(isNarrow)} />
        </div>
      )
    }
    render(<Host />)
    expect(screen.getByTestId('child')).toHaveAttribute('data-narrow', 'true')
  })

  it('remet isNarrow à false quand le nœud observé est démonté', async () => {
    function Host() {
      const { ref, isNarrow } = useNarrowInlineSize(640)
      const [show, setShow] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setShow(false)}>
            cacher
          </button>
          {show ? <div ref={ref} style={{ width: '400px' }} data-testid="mes" /> : null}
          <span data-testid="flag">{String(isNarrow)}</span>
        </>
      )
    }
    const user = userEvent.setup()
    render(<Host />)
    await waitFor(() => {
      expect(screen.getByTestId('flag')).toHaveTextContent('true')
    })
    await user.click(screen.getByRole('button', { name: /cacher/i }))
    await waitFor(() => {
      expect(screen.getByTestId('flag')).toHaveTextContent('false')
    })
  })
})
