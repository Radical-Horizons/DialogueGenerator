/**
 * Panneau validation : libellés FR36, focus au clic, bouton data.id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GraphValidationPanel } from '../components/graph/GraphValidationPanel'
import { useGraphStore } from '../store/graphStore'

const hoisted = vi.hoisted(() => {
  const focusNodeMock = vi.fn()
  const requestFitViewOnNodeIdsMock = vi.fn()
  const setSelectedNodeMock = vi.fn()
  const syncNodeDocumentIdMock = vi.fn()
  const syncMissingDisplayNamesMock = vi.fn(() => ['n1', 'n2'])
  const batchDeleteNodesMock = vi.fn()
  const validateGraphMock = vi.fn(() => Promise.resolve())
  const defaultGraphStoreMock = () => ({
    nodes: [{ id: 'O1', position: { x: 0, y: 0 }, data: {} }],
    edges: [],
    selectedNodeIds: [] as string[],
    setSelectedNode: setSelectedNodeMock,
    syncNodeDocumentId: syncNodeDocumentIdMock,
    syncMissingDisplayNames: syncMissingDisplayNamesMock,
    pruneMissingDisplayNameErrors: vi.fn(),
    intentionalCycles: [],
    markCycleAsIntentional: vi.fn(),
    unmarkCycleAsIntentional: vi.fn(),
    batchDeleteNodes: batchDeleteNodesMock,
    validateGraph: validateGraphMock,
  })
  return {
    focusNodeMock,
    requestFitViewOnNodeIdsMock,
    setSelectedNodeMock,
    syncNodeDocumentIdMock,
    syncMissingDisplayNamesMock,
    batchDeleteNodesMock,
    validateGraphMock,
    defaultGraphStoreMock,
  }
})

const {
  focusNodeMock,
  requestFitViewOnNodeIdsMock,
  setSelectedNodeMock,
  syncNodeDocumentIdMock,
  syncMissingDisplayNamesMock,
  batchDeleteNodesMock,
  validateGraphMock,
  defaultGraphStoreMock,
} = hoisted

vi.mock('../store/graphStore', () => ({
  useGraphStore: vi.fn(() => hoisted.defaultGraphStoreMock()),
}))

vi.mock('../store/graphViewStore', () => ({
  useGraphViewStore: Object.assign(vi.fn(), {
    getState: () => ({
      focusNode: focusNodeMock,
      requestFitViewOnNodeIds: requestFitViewOnNodeIdsMock,
    }),
  }),
}))

describe('GraphValidationPanel (FR36)', () => {
  const noopClose = () => {}

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useGraphStore).mockImplementation(() => defaultGraphStoreMock() as ReturnType<typeof useGraphStore>)
  })

  it('affiche une seule ligne pour missing_display_name avec le décompte', () => {
    const errors = [
      {
        type: 'missing_display_name',
        node_id: 'n1',
        message: 'Nœud [n1] : DisplayName manquant',
        severity: 'error',
      },
      {
        type: 'missing_display_name',
        node_id: 'n2',
        message: 'Nœud [n2] : DisplayName manquant',
        severity: 'error',
      },
    ]
    render(
      <GraphValidationPanel
        validationErrors={errors}
        onClose={noopClose}
      />
    )
    expect(screen.getByText(/DisplayName manquant \(2\)/)).toBeTruthy()
    expect(screen.queryByText(/Nœud \[n1\]/)).toBeNull()
    expect(screen.queryByText(/Nœud \[n2\]/)).toBeNull()
    expect(screen.getByRole('button', { name: /Corriger tous les displayName/i })).toBeTruthy()
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
        onClose={noopClose}
      />
    )
    const btn = screen.getByRole('button', { name: /aligner data\.id/i })
    expect(btn).toBeTruthy()
    fireEvent.click(btn)
    expect(syncNodeDocumentIdMock).toHaveBeenCalledWith('n1')
  })

  it('corrige tous les displayName manquants et relance la validation', async () => {
    const errors = [
      {
        type: 'missing_display_name',
        node_id: 'n1',
        message: 'Nœud [n1] : DisplayName manquant',
        severity: 'error',
      },
      {
        type: 'missing_display_name',
        node_id: 'n2',
        message: 'Nœud [n2] : DisplayName manquant',
        severity: 'error',
      },
    ]
    render(
      <GraphValidationPanel
        validationErrors={errors}
        onClose={noopClose}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Corriger tous les displayName/i }))
    expect(syncMissingDisplayNamesMock).toHaveBeenCalledWith(['n1', 'n2'])
    await Promise.resolve()
    expect(validateGraphMock).toHaveBeenCalled()
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
        loreExplicitSummary="Résumé API"
        loreDialogueScopeKey="test-fr39-panel"
        onClose={noopClose}
      />
    )
    expect(screen.getByTestId('lore-potential-display-count').textContent).toMatch(/1 incohérence/)
    fireEvent.click(screen.getByRole('button', { name: /Ignorer/i }))
    expect(screen.getByTestId('lore-potential-display-count').textContent).toMatch(/0 incohérence/)
  })

  it('FR41 : résumé cycles + clic déclenche requestFitViewOnNodeIds', () => {
    vi.mocked(useGraphStore).mockImplementation(
      () =>
        ({
          ...defaultGraphStoreMock(),
          nodes: [{ id: 'A', position: { x: 0, y: 0 }, data: {} }],
          edges: [],
        }) as ReturnType<typeof useGraphStore>
    )
    const warnings = [
      {
        type: 'cycle_detected',
        severity: 'warning',
        message: 'm',
        cycle_id: 'c1',
        cycle_nodes: ['A'],
        cycle_path: 'A → A',
      },
    ]
    render(<GraphValidationPanel validationErrors={warnings} onClose={noopClose} />)
    expect(screen.getByTestId('structural-cycles-summary')).toHaveTextContent(/1 cycle détecté/)
    fireEvent.click(screen.getByTitle('Cliquer pour zoomer sur les nœuds du cycle'))
    expect(setSelectedNodeMock).toHaveBeenCalledWith('A')
    expect(requestFitViewOnNodeIdsMock).toHaveBeenCalledWith(['A'])
  })

  it('FR40 : résumé topologie visible même si des erreurs structurelles coexistent', () => {
    const mixed = [
      {
        type: 'missing_display_name',
        node_id: 'n1',
        message: 'Nœud [n1] : DisplayName manquant',
        severity: 'error',
      },
      {
        type: 'orphan_node',
        node_id: 'O1',
        message: 'Orphelin test',
        severity: 'warning',
      },
    ]
    render(
      <GraphValidationPanel
        validationErrors={mixed}
        onClose={noopClose}
      />
    )
    expect(screen.getByTestId('structural-topology-summary').textContent).toMatch(/orphelin/)
  })

  it('FR40 : résumé orphelin + inaccessible et focus sur avertissement orphelin', () => {
    const errors = [
      {
        type: 'orphan_node',
        node_id: 'O1',
        message: 'Orphelin test',
        severity: 'warning',
      },
      {
        type: 'unreachable_node',
        node_id: 'U1',
        message: 'Inaccessible test',
        severity: 'warning',
      },
    ]
    render(
      <GraphValidationPanel
        validationErrors={errors}
        onClose={noopClose}
      />
    )
    const summary = screen.getByTestId('structural-topology-summary')
    expect(summary.textContent).toMatch(/orphelin/)
    expect(summary.textContent).toMatch(/inaccessible/)
    fireEvent.click(screen.getByText(/Orphelin test/))
    expect(setSelectedNodeMock).toHaveBeenCalledWith('O1')
    expect(focusNodeMock).toHaveBeenCalledWith('O1')
  })

  it('FR40 : bouton supprimer orphelins sélectionnés appelle batchDeleteNodes + validateGraph', () => {
    vi.mocked(useGraphStore).mockImplementation(
      () =>
        ({
          ...defaultGraphStoreMock(),
          selectedNodeIds: ['O1'],
        }) as ReturnType<typeof useGraphStore>
    )

    render(
      <GraphValidationPanel
        validationErrors={[
          {
            type: 'orphan_node',
            node_id: 'O1',
            message: 'x',
            severity: 'warning',
          },
        ]}
        onClose={noopClose}
      />
    )
    const btn = screen.getByTestId('validation-delete-selected-orphans')
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    expect(batchDeleteNodesMock).toHaveBeenCalledWith(['O1'])
    expect(validateGraphMock).toHaveBeenCalled()
  })

  it('appelle onClose au clic sur la croix', () => {
    const onClose = vi.fn()
    render(
      <GraphValidationPanel
        validationErrors={[]}
        loreExplicitSummary="Résumé"
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByTestId('validation-panel-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
