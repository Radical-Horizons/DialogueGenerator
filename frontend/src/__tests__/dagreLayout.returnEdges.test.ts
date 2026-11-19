import { describe, expect, it } from 'vitest'
import type { Edge, Node } from 'reactflow'
import { calculateDagreLayout, findReturnEdges } from '../utils/dagreLayout'
import { normalizeTestBarsAfterLayout } from '../utils/graphNormalizers'

function dialogueNode(id: string, choices: Array<Record<string, unknown>> = []): Node {
  return { id, type: 'dialogueNode', position: { x: 0, y: 0 }, data: { id, line: id, choices } }
}

function edge(source: string, target: string, choiceIndex = 0): Edge {
  return {
    id: `e:${source}:${target}`,
    source,
    target,
    type: 'smoothstep',
    data: { edgeType: 'choice', choiceIndex },
  }
}

function layout(nodes: Node[], edges: Edge[]): Map<string, Node> {
  const layouted = calculateDagreLayout(nodes, edges, { direction: 'TB', spacingMode: 'normal' })
  return new Map(layouted.map((node) => [node.id, node]))
}

describe('dagreLayout — renvois vers le dialogue principal', () => {
  // Vécu le 2026-11-19 (Voknir, L'Atelier du Cartographe) : 8 « [Retour au dialogue
  // principal] » tiraient l'accueil, et tout le dialogue qui en part, sous la branche d'attente.
  const nodes = ['START', 'accueil', 'attente', 'scar', 'equations', 'respect', 'respect-2', 'fin'].map(
    (id) => dialogueNode(id)
  )
  const edges = [
    edge('START', 'accueil', 0),
    edge('START', 'attente', 1),
    edge('attente', 'scar'),
    edge('scar', 'accueil'),
    edge('accueil', 'equations', 0),
    edge('accueil', 'respect', 1),
    edge('respect', 'respect-2'),
    edge('equations', 'fin'),
  ]

  it('classe le renvoi vers un nœud déjà atteint plus haut comme retour', () => {
    expect([...findReturnEdges(nodes, edges)]).toEqual(['e:scar:accueil'])
  })

  it("garde l'accueil au rang de ses frères, au-dessus de la branche qui y revient", () => {
    const byId = layout(nodes, edges)
    expect(byId.get('accueil')?.position.y).toBe(byId.get('attente')?.position.y)
    expect(byId.get('accueil')!.position.y).toBeLessThan(byId.get('scar')!.position.y)
  })
})

describe('dagreLayout — sortie partagée', () => {
  it('une sortie sans suite reste sous la plus profonde de ses sources', () => {
    const nodes = ['START', 'a', 'b', 'c', 'sortie'].map((id) => dialogueNode(id))
    const edges = [
      edge('START', 'a'),
      edge('a', 'b', 0),
      edge('a', 'sortie', 1),
      edge('b', 'c'),
      edge('c', 'sortie'),
    ]
    expect(findReturnEdges(nodes, edges).size).toBe(0)
    const byId = layout(nodes, edges)
    expect(byId.get('sortie')!.position.y).toBeGreaterThan(byId.get('c')!.position.y)
  })
})

describe('dagreLayout — cible absente du canvas', () => {
  it("un choix vers END ne relègue pas sa source au dernier rang", () => {
    const nodes = ['START', 'autoritaire', 'attente', 'b', 'c', 'd'].map((id) => dialogueNode(id))
    const edges = [
      edge('START', 'autoritaire', 0),
      edge('START', 'attente', 1),
      edge('attente', 'b'),
      edge('b', 'c'),
      edge('c', 'd'),
      edge('autoritaire', 'END'),
    ]
    const byId = layout(nodes, edges)
    expect(byId.has('END')).toBe(false)
    expect(byId.get('autoritaire')?.position.y).toBe(byId.get('attente')?.position.y)
  })
})

describe('normalizeTestBarsAfterLayout', () => {
  it('laisse la barre de test à la place calculée au lieu de la recoller sous le parent', () => {
    const choices = [
      { text: 'Parler', targetNode: 'parler', choiceId: 'c0' },
      {
        text: 'Tester',
        choiceId: 'c1',
        test: 'Intelligence+Orientation:15',
        testSuccessNode: 'reussite',
        testFailureNode: 'echec',
      },
      { text: 'Partir', targetNode: 'partir', choiceId: 'c2' },
    ]
    const parent = { ...dialogueNode('parent', choices), position: { x: 0, y: 0 } }
    const bar: Node = {
      id: 'test-node-parent-choice-1',
      type: 'testNode',
      position: { x: 1200, y: 400 },
      data: { id: 'test-node-parent-choice-1', test: 'Intelligence+Orientation:15' },
    }
    const nodes = [parent, bar, ...['parler', 'partir', 'reussite', 'echec'].map((id) => dialogueNode(id))]
    const edges: Edge[] = [
      edge('parent', 'parler', 0),
      edge('parent', 'test-node-parent-choice-1', 1),
      edge('parent', 'partir', 2),
      { id: 'b-success', source: 'test-node-parent-choice-1', target: 'reussite', sourceHandle: 'success' },
      { id: 'b-failure', source: 'test-node-parent-choice-1', target: 'echec', sourceHandle: 'failure' },
    ]
    const result = normalizeTestBarsAfterLayout(nodes, edges)
    expect(result.nodes.find((node) => node.id === bar.id)?.position).toEqual({ x: 1200, y: 400 })
  })
})
