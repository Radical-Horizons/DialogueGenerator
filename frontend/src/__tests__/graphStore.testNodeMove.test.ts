/**
 * Un nœud de test (barre à 4 résultats) se déplace seul, comme n'importe quel nœud.
 *
 * Régression : en mode document SoT, chaque projection (`normalizeTestBars`) recentrait
 * les barres sous leur parent et ignorait la position du layout. Le glisser-déposer
 * écrivait bien la position, puis la barre revenait sous son parent.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphStore } from '../store/graphStore'
import { documentToGraph } from '../utils/documentToGraph'
import { normalizeTestBars } from '../utils/graphNormalizers'
import { mergeLayoutWithNodePositions } from '../utils/syncDocLayout'

vi.mock('../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

const TEST_A = 'test-node-P-choice-0'
const TEST_B = 'test-node-P-choice-1'

function loadDocument(choices: Array<Record<string, unknown>>): void {
  const document = {
    schemaVersion: '1.1.0',
    nodes: [
      { id: 'P', speaker: 'S', line: 'Parent', choices },
      { id: 'R', speaker: 'S', line: 'Résultat' },
    ],
  }
  const baseLayout = { nodes: { P: { x: 0, y: 0 }, R: { x: 0, y: 600 } } }
  const projected = documentToGraph(document, baseLayout)
  const normalized = normalizeTestBars(projected.nodes, projected.edges)
  useGraphStore.setState({
    document,
    layout: mergeLayoutWithNodePositions(baseLayout, normalized.nodes),
    nodes: normalized.nodes,
    edges: normalized.edges,
  })
}

function positionOf(id: string): { x: number; y: number } {
  const node = useGraphStore.getState().nodes.find((n) => n.id === id)
  if (!node) throw new Error(`nœud absent : ${id}`)
  return node.position
}

describe('graphStore — déplacer un nœud de test', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
  })

  it('garde la position déposée au lieu de recoller la barre sous son parent', () => {
    loadDocument([
      { choiceId: 'a', text: 'A', test: 'Force:8', testSuccessNode: 'R' },
      { choiceId: 'b', text: 'B', test: 'Ruse:8' },
    ])

    useGraphStore.getState().updateNodePosition(TEST_A, { x: 900, y: 700 })

    expect(positionOf(TEST_A)).toEqual({ x: 900, y: 700 })
  })

  it('la position déposée survit à une modification du parent', () => {
    loadDocument([{ choiceId: 'a', text: 'A', test: 'Force:8' }])
    useGraphStore.getState().updateNodePosition(TEST_A, { x: 900, y: 700 })

    const parent = useGraphStore.getState().nodes.find((n) => n.id === 'P')!
    useGraphStore.getState().updateNode('P', { data: { ...parent.data, line: 'Parent modifié' } })

    expect(positionOf(TEST_A)).toEqual({ x: 900, y: 700 })
  })

  it('un nouveau test sur le parent réaligne toujours les barres sous lui', () => {
    loadDocument([
      { choiceId: 'a', text: 'A', test: 'Force:8' },
      { choiceId: 'b', text: 'B' },
    ])
    const aloneX = positionOf(TEST_A).x

    const parent = useGraphStore.getState().nodes.find((n) => n.id === 'P')!
    const choices = (parent.data.choices as Array<Record<string, unknown>>).map((c, i) =>
      i === 1 ? { ...c, test: 'Ruse:8' } : c
    )
    useGraphStore.getState().updateNode('P', { data: { ...parent.data, choices } })

    expect(positionOf(TEST_A).x).toBeLessThan(aloneX)
    expect(positionOf(TEST_B).x).toBeGreaterThan(positionOf(TEST_A).x)
    expect(positionOf(TEST_B).y).toBe(positionOf(TEST_A).y)
  })

  function setChoiceTests(tests: Array<string | undefined>): void {
    const parent = useGraphStore.getState().nodes.find((n) => n.id === 'P')!
    const choices = (parent.data.choices as Array<Record<string, unknown>>).map((c, i) => {
      const rest = { ...c }
      delete rest.test
      return tests[i] ? { ...rest, test: tests[i] } : rest
    })
    useGraphStore.getState().updateNode('P', { data: { ...parent.data, choices } })
  }

  it('après ajout d’un test, déplacer une barre ne recolle pas le groupe', () => {
    loadDocument([
      { choiceId: 'a', text: 'A', test: 'Force:8' },
      { choiceId: 'b', text: 'B' },
    ])
    setChoiceTests(['Force:8', 'Ruse:8'])
    const bBefore = positionOf(TEST_B)

    useGraphStore.getState().updateNodePosition(TEST_A, { x: 900, y: 700 })

    expect(positionOf(TEST_A)).toEqual({ x: 900, y: 700 })
    expect(positionOf(TEST_B)).toEqual(bBefore)
    const layout = useGraphStore.getState().layout as { nodes: Record<string, unknown> }
    expect(layout.nodes[TEST_B]).toEqual(bBefore)
  })

  it('un test retiré puis remis ne superpose pas deux barres', () => {
    loadDocument([
      { choiceId: 'a', text: 'A', test: 'Force:8' },
      { choiceId: 'b', text: 'B' },
    ])
    setChoiceTests([undefined, 'Ruse:8'])
    const layout = useGraphStore.getState().layout as { nodes: Record<string, unknown> }
    expect(layout.nodes[TEST_A]).toBeUndefined()

    setChoiceTests(['Force:8', 'Ruse:8'])

    expect(positionOf(TEST_A)).not.toEqual(positionOf(TEST_B))
    expect(positionOf(TEST_A).y).toBe(positionOf(TEST_B).y)
  })

  it('sans document, un second test ne chevauche pas la première barre', () => {
    useGraphStore.getState().addNode({
      id: 'P',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { id: 'P', line: 'Parent', choices: [{ text: 'A', test: 'Force:8' }, { text: 'B' }] },
    })
    const parent = useGraphStore.getState().nodes.find((n) => n.id === 'P')!
    useGraphStore.getState().updateNode('P', {
      data: { ...parent.data, choices: [{ text: 'A', test: 'Force:8' }, { text: 'B', test: 'Ruse:8' }] },
    })

    expect(Math.abs(positionOf(TEST_B).x - positionOf(TEST_A).x)).toBeGreaterThanOrEqual(200)
  })
})
