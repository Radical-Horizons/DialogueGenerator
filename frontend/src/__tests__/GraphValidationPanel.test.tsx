/**
 * Panneau validation : libellés FR36, focus au clic, bouton data.id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GraphValidationPanel } from '../components/graph/GraphValidationPanel'

const focusNodeMock = vi.fn()
const setSelectedNodeMock = vi.fn()
const syncNodeDocumentIdMock = vi.fn()

vi.mock('../store/graphStore', () => ({
  useGraphStore: vi.fn(() => ({
    nodes: [],
    edges: [],
    setSelectedNode: setSelectedNodeMock,
    syncNodeDocumentId: syncNodeDocumentIdMock,
    intentionalCycles: [],
    markCycleAsIntentional: vi.fn(),
    unmarkCycleAsIntentional: vi.fn(),
  })),
}))

vi.mock('../store/graphViewStore', () => ({
  useGraphViewStore: Object.assign(vi.fn(), {
    getState: () => ({ focusNode: focusNodeMock }),
  }),
}))

describe('GraphValidationPanel (FR36)', () => {
  const noopClose = () => {}

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche un groupe pour missing_display_name et focus au clic', () => {
    const errors = [
      {
        type: 'missing_display_name',
        node_id: 'n1',
        message: 'Nœud [n1] : DisplayName manquant',
        severity: 'error',
      },
    ]
    render(
      <GraphValidationPanel
        validationErrors={errors}
        reactFlowInstance={null}
        onClose={noopClose}
      />
    )
    expect(screen.getByText(/DisplayName manquant \(\d+\)/)).toBeTruthy()
    fireEvent.click(screen.getByText(/Nœud \[n1\] : DisplayName manquant/))
    expect(setSelectedNodeMock).toHaveBeenCalledWith('n1')
    expect(focusNodeMock).toHaveBeenCalledWith('n1')
  })

  it('affiche le libellé FR37 pour missing_dialogue_text et bouton Éditer le nœud', () => {
    const errors = [
      {
        type: 'missing_dialogue_text',
        node_id: 'n1',
        message: 'Nœud [n1] : contenu vide (ni dialogue ni choix)',
        severity: 'error',
      },
    ]
    render(
      <GraphValidationPanel
        validationErrors={errors}
        reactFlowInstance={null}
        onClose={noopClose}
      />
    )
    expect(screen.getByText(/Contenu dialogue vide \(FR37\)/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Éditer le nœud/i }))
    expect(setSelectedNodeMock).toHaveBeenCalledWith('n1')
    expect(focusNodeMock).toHaveBeenCalledWith('n1')
  })

  it('affiche Générer stableID pour missing_stable_id lié à data.id', () => {
    const errors = [
      {
        type: 'missing_stable_id',
        node_id: 'n1',
        message: 'Nœud [n1] : identifiant document (data.id) manquant',
        severity: 'error',
      },
    ]
    render(
      <GraphValidationPanel
        validationErrors={errors}
        reactFlowInstance={null}
        onClose={noopClose}
      />
    )
    const btn = screen.getByRole('button', { name: /aligner data\.id/i })
    expect(btn).toBeTruthy()
    fireEvent.click(btn)
    expect(syncNodeDocumentIdMock).toHaveBeenCalledWith('n1')
  })

  it('affiche le résumé lore explicite (FR38) et le badge Lore sur l’erreur', () => {
    const errors = [
      {
        type: 'lore_contradiction_explicit',
        node_id: 'N1',
        message: 'Contradiction lore : exemple',
        severity: 'error',
        target: 'AliasX',
        gdd_reference: 'Test › AliasX',
      },
    ]
    render(
      <GraphValidationPanel
        validationErrors={errors}
        reactFlowInstance={null}
        loreExplicitSummary="1 contradiction dans 1 nœud"
        onClose={noopClose}
      />
    )
    expect(screen.getByTestId('lore-explicit-summary')).toHaveTextContent(
      '1 contradiction dans 1 nœud'
    )
    expect(screen.getByText('Lore')).toBeTruthy()
    fireEvent.click(screen.getByText(/Contradiction lore : exemple/))
    expect(setSelectedNodeMock).toHaveBeenCalledWith('N1')
    expect(focusNodeMock).toHaveBeenCalledWith('N1')
  })

  it('0 erreur et 0 avertissement : en-tête vert avec ✓ et « 0 avertissement »', () => {
    render(
      <GraphValidationPanel
        validationErrors={[]}
        reactFlowInstance={null}
        loreExplicitSummary="Aucune contradiction lore explicite (1 nœud dialogue analysé)"
        onClose={noopClose}
      />
    )
    expect(screen.getByText('0 avertissement')).toBeInTheDocument()
    const headerRow = screen.getByText('0 avertissement').closest('div')?.parentElement
    expect(headerRow?.textContent).toContain('✓')
  })

  it('FR39: Ignorer masque l’avertissement lore révisable et remet le compteur affiché à 0', () => {
    const errors = [
      {
        type: 'lore_potential_ambiguity',
        node_id: 'N1',
        message: 'Ambigu test message',
        severity: 'warning',
        lore_warning_key: 'k-fr39-panel',
      },
    ]
    render(
      <GraphValidationPanel
        validationErrors={errors}
        reactFlowInstance={null}
        loreExplicitSummary="Résumé API"
        loreDialogueScopeKey="test-fr39-panel"
        onClose={noopClose}
      />
    )
    expect(screen.getByTestId('lore-potential-display-count').textContent).toMatch(/1 incohérence/)
    fireEvent.click(screen.getByRole('button', { name: /Ignorer/i }))
    expect(screen.getByTestId('lore-potential-display-count').textContent).toMatch(/0 incohérence/)
  })

  it('appelle onClose au clic sur la croix', () => {
    const onClose = vi.fn()
    render(
      <GraphValidationPanel
        validationErrors={[]}
        reactFlowInstance={null}
        loreExplicitSummary="Résumé"
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByTestId('validation-panel-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
