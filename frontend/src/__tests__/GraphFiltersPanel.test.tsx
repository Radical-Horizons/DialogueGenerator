/**
 * Story 2.9 FR30: Tests GraphFiltersPanel — checkboxes types/speakers, setFilters, resetFilters, badge "X nœuds masqués".
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GraphFiltersPanel } from '../components/graph/GraphFiltersPanel'
import { useGraphStore } from '../store/graphStore'

vi.mock('../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

function addNode(
  id: string,
  type: 'dialogueNode' | 'testNode' | 'endNode',
  speaker?: string
) {
  useGraphStore.getState().addNode({
    id,
    type,
    position: { x: 0, y: 0 },
    data: speaker !== undefined ? { speaker } : {},
  })
}

/** Dialogue avec choix + test : le TestNode est créé par normalizeTestBars (pas d’orphelin supprimé). */
function addDialogueWithTestChoice(id: string) {
  useGraphStore.getState().addNode({
    id,
    type: 'dialogueNode',
    position: { x: 0, y: 0 },
    data: {
      id,
      line: 'Ligne',
      choices: [{ text: 'Choix test', test: 'Raison+Diplomatie:8' }],
    },
  })
}

describe('GraphFiltersPanel', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useGraphStore.getState().resetGraph()
  })

  it('does not render when isOpen is false', () => {
    render(<GraphFiltersPanel isOpen={false} onClose={onClose} />)
    expect(screen.queryByRole('dialog', { name: /Filtres du graphe/i })).not.toBeInTheDocument()
  })

  it('renders dialog with types checkboxes (dialogue, test, end) when open', () => {
    render(<GraphFiltersPanel isOpen={true} onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: /Filtres du graphe/i })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByLabelText(/Afficher nœuds Dialogue/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Afficher nœuds Test/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Afficher nœuds Fin/i)).toBeInTheDocument()
  })

  it('calls setFilters with hiddenTypes when type checkbox is toggled', () => {
    addNode('a', 'dialogueNode')
    addNode('b', 'testNode')
    render(<GraphFiltersPanel isOpen={true} onClose={onClose} />)
    const testCheckbox = screen.getByLabelText(/Afficher nœuds Test/i)
    expect(testCheckbox).toBeChecked()
    fireEvent.click(testCheckbox)
    expect(useGraphStore.getState().graphFilters.hiddenTypes).toContain('test')
    fireEvent.click(testCheckbox)
    expect(useGraphStore.getState().graphFilters.hiddenTypes ?? []).not.toContain('test')
  })

  it('shows speakers section when store has nodes with speaker and toggling speaker calls setFilters', () => {
    addNode('a', 'dialogueNode', 'Akthar')
    addNode('b', 'dialogueNode', 'Other')
    render(<GraphFiltersPanel isOpen={true} onClose={onClose} />)
    expect(screen.getByText('Akthar')).toBeInTheDocument()
    expect(screen.getByText('Other')).toBeInTheDocument()
    const aktharCheckbox = screen.getByLabelText(/Afficher uniquement speaker Akthar/i)
    fireEvent.click(aktharCheckbox)
    expect(useGraphStore.getState().graphFilters.allowedSpeakers).toContain('Akthar')
    fireEvent.click(aktharCheckbox)
    expect(useGraphStore.getState().graphFilters.allowedSpeakers ?? []).not.toContain('Akthar')
  })

  it('Réinitialiser filtres button calls resetFilters', () => {
    useGraphStore.getState().setFilters({ hiddenTypes: ['test'], allowedSpeakers: ['A'] })
    render(<GraphFiltersPanel isOpen={true} onClose={onClose} />)
    const resetBtn = screen.getByRole('button', { name: /Réinitialiser filtres/i })
    fireEvent.click(resetBtn)
    expect(useGraphStore.getState().graphFilters).toEqual({})
  })

  it('shows badge "X nœuds masqués" when hiddenCount > 0', () => {
    addNode('a', 'dialogueNode')
    addDialogueWithTestChoice('b')
    useGraphStore.getState().setFilters({ hiddenTypes: ['test'] })
    render(<GraphFiltersPanel isOpen={true} onClose={onClose} />)
    const summary = screen
      .getByRole('dialog', { name: /Filtres du graphe/i })
      .querySelector('p')
    expect(summary?.textContent?.replace(/\s+/g, ' ').trim()).toMatch(/1 nœud masqué/)
  })

  it('shows "X nœuds masqués" plural when multiple hidden', () => {
    addNode('a', 'dialogueNode')
    addDialogueWithTestChoice('b')
    addNode('c', 'endNode')
    useGraphStore.getState().setFilters({ hiddenTypes: ['test', 'end'] })
    render(<GraphFiltersPanel isOpen={true} onClose={onClose} />)
    const summary = screen
      .getByRole('dialog', { name: /Filtres du graphe/i })
      .querySelector('p')
    expect(summary?.textContent?.replace(/\s+/g, ' ').trim()).toMatch(/2 nœuds masqués/)
  })

  it('Escape closes panel via onClose', () => {
    render(<GraphFiltersPanel isOpen={true} onClose={onClose} />)
    const heading = screen.getByRole('heading', { name: /Filtres du graphe/i })
    fireEvent.keyDown(heading.closest('div')!, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
