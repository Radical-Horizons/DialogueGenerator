/**
 * Story 18.4 : updateNode passe par la pile undo, coalescée par rafale de saisie.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Node } from 'reactflow'
import { useGraphStore } from '../store/graphStore'
import { documentToGraph } from '../utils/documentToGraph'

vi.mock('../api/graph', () => ({
  loadGraph: vi.fn().mockResolvedValue({
    nodes: [],
    edges: [],
    metadata: { title: 'Test', filename: 'test.json' },
  }),
}))

const N1: Node = {
  id: 'n1',
  type: 'dialogueNode',
  position: { x: 0, y: 0 },
  data: { id: 'n1', title: '', speaker: 'PNJ', line: 'Bonjour', choices: [] },
}
const N2: Node = {
  id: 'n2',
  type: 'dialogueNode',
  position: { x: 300, y: 0 },
  data: { id: 'n2', title: '', speaker: 'PNJ', line: 'Au revoir', choices: [] },
}

let now = 0

function lineOf(nodeId: string): unknown {
  return useGraphStore.getState().nodes.find((n) => n.id === nodeId)?.data.line
}

function typeInto(nodeId: string, text: string, stepMs = 150) {
  for (let i = 1; i <= text.length; i++) {
    const node = useGraphStore.getState().nodes.find((n) => n.id === nodeId)!
    useGraphStore.getState().updateNode(nodeId, {
      data: { ...node.data, line: text.slice(0, i) },
    })
    now += stepMs
  }
}

describe('graphStore - updateNode undo coalescing (story 18.4)', () => {
  beforeEach(() => {
    now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    useGraphStore.getState().resetGraph()
    useGraphStore.setState({
      nodes: [structuredClone(N1), structuredClone(N2)],
      edges: [],
      undoStack: [],
      redoStack: [],
      hasUnsavedChanges: false,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('a typing burst is a single undo step that restores the initial text', () => {
    typeInto('n1', 'Salut toi')
    expect(lineOf('n1')).toBe('Salut toi')
    expect(useGraphStore.getState().hasUnsavedChanges).toBe(true)
    expect(useGraphStore.getState().undoStack).toHaveLength(1)

    useGraphStore.getState().undo()
    expect(lineOf('n1')).toBe('Bonjour')

    useGraphStore.getState().redo()
    expect(lineOf('n1')).toBe('Salut toi')
  })

  it('two bursts separated by a pause of at least 1 s are two undo steps', () => {
    typeInto('n1', 'Salut')
    now += 1000
    const node = useGraphStore.getState().nodes.find((n) => n.id === 'n1')!
    useGraphStore.getState().updateNode('n1', { data: { ...node.data, line: 'Salut toi' } })

    expect(useGraphStore.getState().undoStack).toHaveLength(2)
    useGraphStore.getState().undo()
    expect(lineOf('n1')).toBe('Salut')
    useGraphStore.getState().undo()
    expect(lineOf('n1')).toBe('Bonjour')
  })

  it('switching node or field starts a new undo step', () => {
    typeInto('n1', 'Ab')
    typeInto('n2', 'Cd')
    const n2 = useGraphStore.getState().nodes.find((n) => n.id === 'n2')!
    useGraphStore.getState().updateNode('n2', { data: { ...n2.data, speaker: 'Garde' } })

    expect(useGraphStore.getState().undoStack).toHaveLength(3)
  })

  it('30 s of continuous typing does not consume the undo history', () => {
    typeInto('n1', 'x'.repeat(200))
    expect(useGraphStore.getState().undoStack).toHaveLength(1)
  })

  it('a no-op update pushes no undo step and keeps the redo stack', () => {
    typeInto('n1', 'Salut')
    useGraphStore.getState().undo()
    expect(useGraphStore.getState().redoStack).toHaveLength(1)

    const node = useGraphStore.getState().nodes.find((n) => n.id === 'n1')!
    useGraphStore.getState().updateNode('n1', { data: { ...node.data } })

    expect(useGraphStore.getState().undoStack).toHaveLength(0)
    expect(useGraphStore.getState().redoStack).toHaveLength(1)
  })

  it('typing again right after an undo opens a new step', () => {
    typeInto('n1', 'Salut')
    useGraphStore.getState().undo()
    typeInto('n1', 'Yo')

    expect(useGraphStore.getState().undoStack).toHaveLength(1)
    useGraphStore.getState().undo()
    expect(lineOf('n1')).toBe('Bonjour')
  })
})

describe('graphStore - updateNode writes nothing the store would not keep', () => {
  function load(withDocumentSoT: boolean) {
    const document = {
      schemaVersion: '1.1.0',
      nodes: [
        {
          id: 'd1',
          speaker: 'PNJ',
          line: 'Bonjour',
          choices: [{ choiceId: 'c1', text: 'Forcer', test: 'Dex:10', testSuccessNode: 'd2' }],
        },
        { id: 'd2', speaker: 'PNJ', line: 'Suite' },
        { id: 'd3', speaker: 'PNJ', line: 'À supprimer' },
      ],
    }
    const layout = { nodes: {} }
    const { nodes, edges } = documentToGraph(document, layout)
    useGraphStore.getState().resetGraph()
    useGraphStore.setState({
      nodes,
      edges,
      document: withDocumentSoT ? document : null,
      layout: withDocumentSoT ? layout : null,
      undoStack: [],
      redoStack: [],
      hasUnsavedChanges: false,
    })
  }

  it.each([
    ['document SoT', true],
    ['direct', false],
  ])('a TestNode line the store rebuilds from the choice is not an undo step (%s)', (_mode, doc) => {
    load(doc)
    useGraphStore.getState().deleteNode('d3')
    useGraphStore.getState().undo()
    expect(useGraphStore.getState().redoStack).toHaveLength(1)

    const testNode = useGraphStore.getState().nodes.find((n) => n.type === 'testNode')!
    useGraphStore.getState().updateNode(testNode.id, {
      data: { ...testNode.data, line: 'Texte jamais conservé' },
    })

    expect(useGraphStore.getState().undoStack).toHaveLength(0)
    expect(useGraphStore.getState().redoStack).toHaveLength(1)
  })

  it('node-level visibility conditions are kept in document SoT and undoable', () => {
    load(true)
    const conditions = { items: [{ kind: 'flag', flag: 'met_guard', value: true }] }
    const d1 = useGraphStore.getState().nodes.find((n) => n.id === 'd1')!
    useGraphStore.getState().updateNode('d1', { data: { ...d1.data, visibilityConditions: conditions } })

    const stored = () =>
      useGraphStore.getState().nodes.find((n) => n.id === 'd1')!.data.visibilityConditions
    expect(stored()).toEqual(conditions)
    expect(useGraphStore.getState().undoStack).toHaveLength(1)

    useGraphStore.getState().undo()
    expect(stored()).toBeUndefined()
  })
})
