import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useNarrowInlineSize } from './useNarrowInlineSize'

describe('useNarrowInlineSize', () => {
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

  it('Cas D : ré-attachement sur un autre nœud après changement de phase (largeur différente)', async () => {
    function Host() {
      const { ref, isNarrow } = useNarrowInlineSize(640)
      const [phase, setPhase] = useState<'a' | 'b'>('a')
      return (
        <>
          {phase === 'a' ? (
            <div ref={ref} style={{ width: '400px' }} data-testid="pane" />
          ) : (
            <div ref={ref} style={{ width: '800px' }} data-testid="pane" />
          )}
          <button type="button" onClick={() => setPhase('b')}>
            élargir
          </button>
          <span data-testid="flag">{String(isNarrow)}</span>
        </>
      )
    }
    const user = userEvent.setup()
    render(<Host />)
    expect(screen.getByTestId('flag')).toHaveTextContent('true')
    await user.click(screen.getByRole('button', { name: /élargir/i }))
    await waitFor(() => {
      expect(screen.getByTestId('flag')).toHaveTextContent('false')
    })
  })
})
