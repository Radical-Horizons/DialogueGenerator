/**
 * Story 18.9 : « Éditer » et « Nouveau nœud » donnent la main pour écrire — le curseur est déjà
 * dans la réplique, en fin de texte, sans clic supplémentaire.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, screen } from '@testing-library/react'
import { ReactFlowProvider } from 'reactflow'
import { NodeEditorPanel } from '../components/graph/NodeEditorPanel'
import { useGraphStore } from '../store/graphStore'
import { useContextStore } from '../store/contextStore'
import { documentToGraph } from '../utils/documentToGraph'

vi.mock('../store/contextStore', () => ({
  useContextStore: vi.fn(),
}))

vi.mock('../api/config', () => ({
  listLLMModels: vi.fn().mockResolvedValue({ models: [] }),
}))

vi.mock('../components/shared', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('../hooks/useEstimation', () => ({
  useEstimation: () => ({
    result: null, state: 'idle', error: null,
    runEstimate: vi.fn(), budgetExceeded: false, budgetWarning90: false,
  }),
}))

function loadGraph() {
  const document = {
    schemaVersion: '1.1.0',
    nodes: [
      { id: 'd1', speaker: 'PNJ', line: 'Bonjour' },
      { id: 'd2', speaker: 'PNJ', line: 'Suite' },
    ],
  }
  const { nodes, edges } = documentToGraph(document, { nodes: {} })
  useGraphStore.getState().resetGraph()
  useGraphStore.setState({ nodes, edges, selectedNodeId: 'd1', undoStack: [], redoStack: [] })
}

function panel(props: { focusLine?: boolean; onLineFocused?: () => void }) {
  return (
    <ReactFlowProvider>
      <NodeEditorPanel {...props} />
    </ReactFlowProvider>
  )
}

const lineField = () => screen.getByPlaceholderText('Texte du dialogue...') as HTMLTextAreaElement

describe('NodeEditorPanel — curseur dans la réplique à l’ouverture en édition', () => {
  beforeEach(() => {
    vi.mocked(useContextStore).mockReturnValue({ selections: {} } as ReturnType<typeof useContextStore>)
    loadGraph()
  })

  it('focus en fin de réplique quand l’édition est demandée', () => {
    const onLineFocused = vi.fn()
    render(panel({ focusLine: true, onLineFocused }))

    const field = lineField()
    expect(document.activeElement).toBe(field)
    expect(field.value).toBe('Bonjour')
    expect(field.selectionStart).toBe('Bonjour'.length)
    expect(onLineFocused).toHaveBeenCalledTimes(1)
  })

  it('suit le nœud nouvellement sélectionné quand la demande arrive avec lui', () => {
    const onLineFocused = vi.fn()
    const { rerender } = render(panel({ focusLine: false, onLineFocused }))
    expect(document.activeElement).not.toBe(lineField())

    act(() => useGraphStore.getState().setSelectedNode('d2'))
    rerender(panel({ focusLine: true, onLineFocused }))

    expect(document.activeElement).toBe(lineField())
    expect(lineField().value).toBe('Suite')
    expect(lineField().selectionStart).toBe('Suite'.length)
  })

  it('sans demande, l’ouverture ne prend pas le focus', () => {
    render(panel({}))
    expect(document.activeElement).not.toBe(lineField())
  })
})
