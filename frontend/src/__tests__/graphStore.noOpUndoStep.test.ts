/**
 * Une action qui ne change rien n'est pas une étape d'undo : elle ne pousse pas de snapshot,
 * ne vide pas le redo et ne marque pas le document modifié.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Node } from 'reactflow'
import { useGraphStore } from '../store/graphStore'

vi.mock('../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

function dialogueNode(id: string, data: Record<string, unknown> = {}): Node {
  return {
    id,
    type: 'dialogueNode',
    position: { x: 0, y: 0 },
    data: { id, speaker: 'PNJ', line: 'Réplique', choices: [], ...data },
  }
}

/** Un undo réel laisse une étape dans le redo : c'est elle qu'une action vide ne doit pas effacer. */
function withPendingRedo() {
  const store = useGraphStore.getState()
  store.addNode(dialogueNode('extra'))
  store.undo()
  useGraphStore.setState({ hasUnsavedChanges: false })
  expect(useGraphStore.getState().redoStack).toHaveLength(1)
}

describe('graphStore — pas d’étape d’undo sans changement', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    useGraphStore.getState().addNode(dialogueNode('n1', { tag: 'À réviser', title: 'Accueil' }))
    useGraphStore.getState().clearUndoHistory()
    withPendingRedo()
  })

  it('runAsSingleUndoStep sans mutation rend la pile undo et garde le redo', () => {
    useGraphStore.getState().runAsSingleUndoStep(() => {})

    expect(useGraphStore.getState().undoStack).toHaveLength(0)
    expect(useGraphStore.getState().redoStack).toHaveLength(1)
  })

  it('runAsSingleUndoStep avec mutation garde son étape et vide le redo', () => {
    useGraphStore.getState().runAsSingleUndoStep(() => {
      useGraphStore.getState().addNode(dialogueNode('n2'))
    })

    expect(useGraphStore.getState().undoStack).toHaveLength(1)
    expect(useGraphStore.getState().redoStack).toHaveLength(0)
  })

  it('batchTagNodes sur des nœuds déjà étiquetés ne touche ni undo, ni redo, ni dirty', () => {
    useGraphStore.getState().batchTagNodes(['n1', 'absent'], 'À réviser')

    const state = useGraphStore.getState()
    expect(state.undoStack).toHaveLength(0)
    expect(state.redoStack).toHaveLength(1)
    expect(state.hasUnsavedChanges).toBe(false)
  })

  it('syncMissingDisplayNames sans nom manquant ne touche ni undo, ni redo, ni dirty', () => {
    const updated = useGraphStore.getState().syncMissingDisplayNames(['n1'])

    const state = useGraphStore.getState()
    expect(updated).toEqual([])
    expect(state.undoStack).toHaveLength(0)
    expect(state.redoStack).toHaveLength(1)
    expect(state.hasUnsavedChanges).toBe(false)
  })

  it('valider le libellé d’une réponse sans le changer ne crée pas d’étape', () => {
    const store = useGraphStore.getState()
    store.addNode(dialogueNode('a', { choices: [{ text: 'Original' }] }))
    store.addNode(dialogueNode('b'))
    store.connectNodes('a', 'b', 0, 'choice')
    const edgeId = useGraphStore.getState().edges.find((e) => e.source === 'a')!.id
    store.updateChoiceEdgeLabel(edgeId, 'Texte')
    store.clearUndoHistory()
    withPendingRedo()

    useGraphStore.getState().updateChoiceEdgeLabel(edgeId, 'Texte')

    const state = useGraphStore.getState()
    expect(state.undoStack).toHaveLength(0)
    expect(state.redoStack).toHaveLength(1)
    expect(state.hasUnsavedChanges).toBe(false)
  })

  it('une position inchangée ne pousse pas d’étape même si on la demande', () => {
    useGraphStore.getState().updateNodePosition('n1', { x: 0, y: 0 }, false, true)

    expect(useGraphStore.getState().undoStack).toHaveLength(0)
    expect(useGraphStore.getState().redoStack).toHaveLength(1)
  })

  it('duplicateNodes sans nœud dialogue ne pousse pas d’étape', () => {
    useGraphStore.getState().duplicateNodes(['absent'])

    expect(useGraphStore.getState().undoStack).toHaveLength(0)
    expect(useGraphStore.getState().redoStack).toHaveLength(1)
  })
})
