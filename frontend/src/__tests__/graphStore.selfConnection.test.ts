/**
 * Un nœud ne se relie jamais à lui-même.
 *
 * Régression recette : l'issue « échec » d'un TestNode pouvait être reliée à l'ancre d'entrée
 * de ce même TestNode. `connectNodes` est le dernier rempart : `onConnectEnd` et la génération
 * l'appellent sans passer par la validation de React Flow.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphStore } from '../store/graphStore'
import { isConnectionAllowed } from '../utils/graphConnectionRules'

vi.mock('../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

const DIALOGUE_ID = 'dialogue'
const TEST_NODE_ID = `test-node-${DIALOGUE_ID}-choice-0`

function choiceOfDialogue(): Record<string, unknown> {
  const dialogue = useGraphStore.getState().nodes.find((n) => n.id === DIALOGUE_ID)!
  return (dialogue.data.choices as Array<Record<string, unknown>>)[0]
}

describe('graphStore — pas de lien d’un nœud vers lui-même', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    useGraphStore.getState().addNode({
      id: DIALOGUE_ID,
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: {
        id: DIALOGUE_ID,
        speaker: 'PNJ',
        line: 'Réplique',
        choices: [{ text: 'Forcer', choiceId: 'c1', test: 'force+persuasion:10' }],
      },
    })
    useGraphStore.getState().addNode({
      id: 'suite',
      type: 'dialogueNode',
      position: { x: 0, y: 300 },
      data: { id: 'suite', speaker: 'PNJ', line: 'Suite', choices: [] },
    })
    useGraphStore.getState().clearUndoHistory()
  })

  it.each(['critical-failure', 'failure', 'success', 'critical-success'])(
    'refuse de relier l’issue %s du test à son propre test',
    (handle) => {
      const edgesBefore = useGraphStore.getState().edges

      useGraphStore.getState().connectNodes(TEST_NODE_ID, TEST_NODE_ID, undefined, handle, handle)

      const state = useGraphStore.getState()
      expect(state.edges).toEqual(edgesBefore)
      expect(state.undoStack).toHaveLength(0)
      expect(choiceOfDialogue()).not.toHaveProperty('testFailureNode')
    }
  )

  it('refuse un choix ou une suite qui reboucle sur le même nœud', () => {
    const edgesBefore = useGraphStore.getState().edges

    useGraphStore.getState().connectNodes('suite', 'suite', undefined, 'nextNode')
    useGraphStore.getState().connectNodes(DIALOGUE_ID, DIALOGUE_ID, 0, 'choice')

    expect(useGraphStore.getState().edges).toEqual(edgesBefore)
  })

  it('laisse relier une issue de test à un autre nœud', () => {
    useGraphStore.getState().connectNodes(TEST_NODE_ID, 'suite', undefined, 'failure', 'failure')

    expect(choiceOfDialogue().testFailureNode).toBe('suite')
  })
})

describe('isConnectionAllowed', () => {
  it('refuse le même nœud et les extrémités absentes', () => {
    expect(isConnectionAllowed('a', 'a')).toBe(false)
    expect(isConnectionAllowed(null, 'a')).toBe(false)
    expect(isConnectionAllowed('a', undefined)).toBe(false)
  })

  it('accepte deux nœuds distincts', () => {
    expect(isConnectionAllowed('a', 'b')).toBe(true)
  })
})
