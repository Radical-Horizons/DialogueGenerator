/**
 * Story 2.7 (FR28) : barre de recherche nœuds - composant GraphSearchBar.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { GraphSearchBar } from '../components/graph/GraphSearchBar'
import { useGraphStore } from '../store/graphStore'
import { useGraphViewStore } from '../store/graphViewStore'
import type { Node } from 'reactflow'

function makeDialogueNode(id: string, line: string, speaker: string): Node {
  return {
    id,
    type: 'dialogueNode',
    position: { x: 0, y: 0 },
    data: { id, line, speaker },
  }
}

describe('GraphSearchBar (Story 2.7)', () => {
  let onClose: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    onClose = vi.fn()
    useGraphStore.getState().resetGraph()
    useGraphStore.getState().addNode(makeDialogueNode('n1', 'Bonjour le monde', 'Alice'))
    useGraphStore.getState().addNode(makeDialogueNode('n2', 'Au revoir', 'Bob'))
    useGraphStore.getState().addNode(makeDialogueNode('n3', 'BONJOUR encore', 'Alice'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders search input, counter, Prev/Next, and Close button', () => {
    render(<GraphSearchBar onClose={onClose} />)
    expect(screen.getByPlaceholderText(/Rechercher/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Résultat précédent/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Résultat suivant/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Fermer/ })).toBeInTheDocument()
  })

  it('does not highlight or focus every node when opened with an empty query', async () => {
    render(<GraphSearchBar onClose={onClose} />)

    await act(async () => {
      vi.advanceTimersByTime(250)
    })

    expect(useGraphStore.getState().highlightedNodeIds).toEqual([])
    expect(useGraphViewStore.getState().focusQueue).toEqual([])
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('updates highlighted nodes when user types and shows result count', async () => {
    render(<GraphSearchBar onClose={onClose} />)
    const input = screen.getByPlaceholderText(/Rechercher/)
    await act(async () => {
      fireEvent.change(input, { target: { value: 'bonjour' } })
    })
    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    expect(useGraphStore.getState().highlightedNodeIds).toEqual(['n1', 'n3'])
    expect(screen.getByText(/2 résultats trouvés/)).toBeInTheDocument()
  })

  it('Prev/Next enqueue focus via graphViewStore and cycle through results', async () => {
    render(<GraphSearchBar onClose={onClose} />)
    const input = screen.getByPlaceholderText(/Rechercher/)
    await act(async () => {
      fireEvent.change(input, { target: { value: 'bonjour' } })
    })
    await act(async () => {
      vi.advanceTimersByTime(250)
    })

    const nextBtn = screen.getByLabelText(/Résultat suivant/)
    await act(async () => {
      fireEvent.click(nextBtn)
    })
    expect(useGraphViewStore.getState().focusQueue.at(-1)).toBe('n3')

    useGraphViewStore.getState().clearFocus()
    await act(async () => {
      fireEvent.click(nextBtn)
    })
    expect(useGraphViewStore.getState().focusQueue.at(-1)).toBe('n1')

    useGraphViewStore.getState().clearFocus()
    const prevBtn = screen.getByLabelText(/Résultat précédent/)
    await act(async () => {
      fireEvent.click(prevBtn)
    })
    expect(useGraphViewStore.getState().focusQueue.at(-1)).toBe('n3')
  })

  it('Escape calls setHighlightedNodes([]) and onClose', async () => {
    render(<GraphSearchBar onClose={onClose} />)
    const input = screen.getByPlaceholderText(/Rechercher/)
    await act(async () => {
      fireEvent.change(input, { target: { value: 'bonjour' } })
    })
    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    expect(useGraphStore.getState().highlightedNodeIds).toEqual(['n1', 'n3'])
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Escape' })
    })
    expect(useGraphStore.getState().highlightedNodeIds).toEqual([])
    expect(onClose).toHaveBeenCalled()
  })

  it('Close button calls setHighlightedNodes([]) and onClose', async () => {
    render(<GraphSearchBar onClose={onClose} />)
    const input = screen.getByPlaceholderText(/Rechercher/)
    await act(async () => {
      fireEvent.change(input, { target: { value: 'bonjour' } })
    })
    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Fermer/ }))
    })
    expect(useGraphStore.getState().highlightedNodeIds).toEqual([])
    expect(onClose).toHaveBeenCalled()
  })
})
