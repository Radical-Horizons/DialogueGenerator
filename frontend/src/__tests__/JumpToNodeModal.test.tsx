/**
 * Story 2.8 FR29: Tests JumpToNodeModal — champ saisie, suggestions, Enter, sélection liste, "Nœud non trouvé", Escape.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JumpToNodeModal } from '../components/graph/JumpToNodeModal'
import { useGraphStore } from '../store/graphStore'

vi.mock('../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

describe('JumpToNodeModal', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useGraphStore.getState().resetGraph()
  })

  function getInput() {
    return screen.getByRole('textbox', { name: /Jump to node/i })
  }

  it('renders input and label when open', () => {
    render(<JumpToNodeModal isOpen={true} onClose={onClose} />)
    expect(getInput()).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Saisir un ID ou un nom/)).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    render(<JumpToNodeModal isOpen={false} onClose={onClose} />)
    expect(screen.queryByRole('textbox', { name: /Jump to node/i })).not.toBeInTheDocument()
  })

  it('shows suggestions when typing and Enter on first result calls jumpToNode and onClose', async () => {
    const user = userEvent.setup()
    const { addNode } = useGraphStore.getState()
    addNode({
      id: 'node_abc',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { displayName: 'Opening Scene' },
    })

    render(<JumpToNodeModal isOpen={true} onClose={onClose} />)
    const input = getInput()
    await user.type(input, 'Opening')
    await vi.waitFor(() => {
      expect(screen.queryByRole('listbox')).toBeInTheDocument()
    }, { timeout: 400 })

    await user.keyboard('{Enter}')
    expect(useGraphStore.getState().selectedNodeId).toBe('node_abc')
    expect(onClose).toHaveBeenCalled()
  })

  it('selection in list calls jumpToNode and closes modal', async () => {
    const user = userEvent.setup()
    const { addNode } = useGraphStore.getState()
    addNode({
      id: 'n1',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { line: 'Scene 1' },
    })

    render(<JumpToNodeModal isOpen={true} onClose={onClose} />)
    const input = getInput()
    await user.type(input, 'Scene')
    await vi.waitFor(() => {
      expect(screen.getByRole('option')).toBeInTheDocument()
    }, { timeout: 400 })

    await user.click(screen.getByRole('option'))
    expect(useGraphStore.getState().selectedNodeId).toBe('n1')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows "Nœud non trouvé" when no results and Enter', async () => {
    const user = userEvent.setup()
    render(<JumpToNodeModal isOpen={true} onClose={onClose} />)
    const input = getInput()
    await user.type(input, 'nonexistent')
    await vi.waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    }, { timeout: 600 })
    await user.click(input)
    await user.keyboard('{Enter}')
    await vi.waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Nœud non trouvé')
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Escape closes modal', () => {
    render(<JumpToNodeModal isOpen={true} onClose={onClose} />)
    fireEvent.keyDown(getInput(), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
