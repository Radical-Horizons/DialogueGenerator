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
      <GraphValidationPanel validationErrors={errors} reactFlowInstance={null} />
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
      <GraphValidationPanel validationErrors={errors} reactFlowInstance={null} />
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
      <GraphValidationPanel validationErrors={errors} reactFlowInstance={null} />
    )
    const btn = screen.getByRole('button', { name: /aligner data\.id/i })
    expect(btn).toBeTruthy()
    fireEvent.click(btn)
    expect(syncNodeDocumentIdMock).toHaveBeenCalledWith('n1')
  })
})
