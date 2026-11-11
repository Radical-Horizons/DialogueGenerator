/**
 * Une action utilisateur = un seul snapshot undo.
 *
 * Régression recette : après Dupliquer puis Supprimer, une étape intermédiaire montrait le
 * dialogue et ses barres de test non reliés, et il fallait trois Ctrl+Z pour deux actions.
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

function dialogueWithTest(id: string): Node {
  return {
    id,
    type: 'dialogueNode',
    position: { x: 0, y: 0 },
    data: {
      id,
      speaker: 'PNJ',
      line: 'Réplique',
      choices: [{ text: 'Forcer', choiceId: 'c1', test: 'force+persuasion:10' }],
    },
  }
}

const testBarIdOf = (dialogueId: string) => `test-node-${dialogueId}-choice-0`

describe('graphStore — une action, un snapshot undo', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    useGraphStore.getState().addNode(dialogueWithTest('origin'))
    useGraphStore.getState().clearUndoHistory()
  })

  it('relie le nœud dupliqué à ses barres de test dès la duplication', () => {
    const duplicate = useGraphStore.getState().duplicateNode('origin')!

    const { nodes, edges } = useGraphStore.getState()
    expect(nodes.some((n) => n.id === testBarIdOf(duplicate.id))).toBe(true)
    expect(
      edges.some((e) => e.source === duplicate.id && e.target === testBarIdOf(duplicate.id))
    ).toBe(true)
  })

  it('Dupliquer puis Supprimer se défait en deux Ctrl+Z, sans état non relié', () => {
    const nodeIdsBefore = useGraphStore.getState().nodes.map((n) => n.id).sort()

    const duplicate = useGraphStore.getState().duplicateNode('origin')!
    useGraphStore.getState().deleteNode(duplicate.id)
    expect(useGraphStore.getState().undoStack).toHaveLength(2)

    useGraphStore.getState().undo()
    const afterFirstUndo = useGraphStore.getState()
    expect(afterFirstUndo.nodes.some((n) => n.id === duplicate.id)).toBe(true)
    expect(
      afterFirstUndo.edges.some(
        (e) => e.source === duplicate.id && e.target === testBarIdOf(duplicate.id)
      )
    ).toBe(true)

    useGraphStore.getState().undo()
    expect(useGraphStore.getState().nodes.map((n) => n.id).sort()).toEqual(nodeIdsBefore)
    expect(useGraphStore.getState().undoStack).toHaveLength(0)
  })

  it('ne touche pas aux arêtes existantes quand on ajoute un nœud sans test', () => {
    const edgesBefore = useGraphStore.getState().edges
    useGraphStore.getState().addNode({
      id: 'plain',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { id: 'plain', speaker: '', line: '', choices: [] },
    })
    expect(useGraphStore.getState().edges).toEqual(edgesBefore)
  })

  it('duplicateNodes ne pousse qu’un snapshot pour toute la sélection', () => {
    useGraphStore.getState().addNode(dialogueWithTest('other'))
    useGraphStore.getState().clearUndoHistory()

    useGraphStore.getState().duplicateNodes(['origin', 'other'])

    expect(useGraphStore.getState().undoStack).toHaveLength(1)
  })

  it('runAsSingleUndoStep regroupe plusieurs mutations en un seul Ctrl+Z', () => {
    const nodeIdsBefore = useGraphStore.getState().nodes.map((n) => n.id)

    useGraphStore.getState().runAsSingleUndoStep(() => {
      const { addNode, connectNodes, createEmptyNode } = useGraphStore.getState()
      const node = createEmptyNode({ x: 0, y: 300 })
      addNode(node)
      connectNodes('origin', node.id, undefined, 'nextNode')
    })

    expect(useGraphStore.getState().undoStack).toHaveLength(1)
    useGraphStore.getState().undo()
    expect(useGraphStore.getState().nodes.map((n) => n.id)).toEqual(nodeIdsBefore)
  })

  it('runAsSingleUndoStep rétablit le snapshot normal après une exception', () => {
    expect(() =>
      useGraphStore.getState().runAsSingleUndoStep(() => {
        throw new Error('boom')
      })
    ).toThrow('boom')

    useGraphStore.getState().clearUndoHistory()
    useGraphStore.getState().addNode(dialogueWithTest('after'))
    expect(useGraphStore.getState().undoStack).toHaveLength(1)
  })
})
