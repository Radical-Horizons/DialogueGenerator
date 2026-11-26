import { describe, expect, it } from 'vitest'
import type { Edge, Node } from 'reactflow'
import {
  calculateDagreLayout,
  getLayoutNodeHeight,
  redistributeSiblingBranches,
} from '../utils/dagreLayout'

function createSiblingFixture(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [
    {
      id: 'parent',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { id: 'parent', line: 'Parent', choices: Array.from({ length: 5 }, () => ({})) },
    },
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `child-${index}`,
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { id: `child-${index}`, line: `Child ${index}` },
    })),
  ]
  const edges: Edge[] = Array.from({ length: 5 }, (_, index) => ({
    id: `e-parent-${index}`,
    source: 'parent',
    target: `child-${index}`,
    type: 'smoothstep',
    data: { choiceIndex: index },
  }))

  return { nodes, edges }
}

function parentWithChildren(count: number): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [
    {
      id: 'parent',
      type: 'dialogueNode',
      position: { x: 140, y: 0 },
      data: { id: 'parent', line: 'Parent', choices: Array.from({ length: count }, () => ({})) },
    },
    ...Array.from({ length: count }, (_, index) => ({
      id: `child-${index}`,
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { id: `child-${index}`, line: `Enfant ${index}` },
    })),
  ]
  const edges: Edge[] = Array.from({ length: count }, (_, index) => ({
    id: `e-${index}`,
    source: 'parent',
    target: `child-${index}`,
    type: 'smoothstep',
    data: { choiceIndex: index },
  }))
  return { nodes, edges }
}

describe('dagreLayout — pyramide', () => {
  it.each([2, 3, 4, 5, 8])('centre le parent au-dessus de ses %i enfants', (count) => {
    const { nodes, edges } = parentWithChildren(count)

    const layouted = calculateDagreLayout(nodes, edges, { direction: 'TB', spacingMode: 'normal' })

    const parent = layouted.find((n) => n.id === 'parent')!
    const childXs = layouted.filter((n) => n.id !== 'parent').map((n) => n.position.x)
    const childrenCenter = (Math.min(...childXs) + Math.max(...childXs)) / 2
    expect(Math.abs(parent.position.x - childrenCenter)).toBeLessThanOrEqual(1)
  })

  it('garde le parent entre ses enfants quand une branche a sa propre descendance', () => {
    const { nodes, edges } = parentWithChildren(3)
    nodes.push({
      id: 'grandchild',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { id: 'grandchild' },
    })
    edges.push({ id: 'e-g', source: 'child-0', target: 'grandchild', type: 'smoothstep' })

    const layouted = calculateDagreLayout(nodes, edges, { direction: 'TB', spacingMode: 'normal' })

    const parent = layouted.find((n) => n.id === 'parent')!
    const childXs = ['child-0', 'child-1', 'child-2'].map(
      (id) => layouted.find((n) => n.id === id)!.position.x
    )
    expect(parent.position.x).toBeGreaterThan(Math.min(...childXs))
    expect(parent.position.x).toBeLessThan(Math.max(...childXs))
  })
})

describe('dagreLayout', () => {
  it('préserve plusieurs niveaux verticaux pour 5 enfants en TB', () => {
    const { nodes, edges } = createSiblingFixture()

    const layouted = calculateDagreLayout(nodes, edges, {
      direction: 'TB',
      spacingMode: 'normal',
    })

    const childYValues = layouted
      .filter((node) => node.id.startsWith('child-'))
      .map((node) => node.position.y)

    expect(new Set(childYValues).size).toBeGreaterThan(1)
  })

  it('réinjecte un quinconce léger au reload si un groupe de 5 enfants est plat', () => {
    const { edges } = createSiblingFixture()
    const flatNodes: Node[] = [
      {
        id: 'parent',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'parent' },
      },
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `child-${index}`,
        type: 'dialogueNode',
        position: { x: index * 220, y: 320 },
        data: { id: `child-${index}` },
      })),
    ]

    const redistributed = redistributeSiblingBranches(flatNodes, edges, 'TB', 'normal', {
      minSiblingCount: 5,
      onlyWhenFlatOnMainAxis: true,
    })

    const childYValues = redistributed
      .filter((node) => node.id.startsWith('child-'))
      .map((node) => node.position.y)

    expect(new Set(childYValues).size).toBeGreaterThan(1)
  })
})

describe('dagreLayout — hauteur estimée avant mesure', () => {
  const card = (id: string, line: string): Node => ({
    id,
    type: 'dialogueNode',
    position: { x: 0, y: 0 },
    data: { id, line, choices: [{}, {}] },
  })

  it("estime la carte sur l'aperçu affiché, pas sur la réplique entière", () => {
    const longLine = 'Le Dédale respire et ses murs se souviennent. '.repeat(20)
    expect(getLayoutNodeHeight(card('long', longLine))).toBe(
      getLayoutNodeHeight(card('preview', longLine.slice(0, 100)))
    )
    expect(getLayoutNodeHeight(card('long', longLine))).toBeLessThanOrEqual(200)
  })

  it("une longue réplique n'écarte plus les rangs de dagre", () => {
    const longLine = 'Le Dédale respire et ses murs se souviennent. '.repeat(20)
    const nodes = [card('a', longLine), card('b', longLine)]
    const edges: Edge[] = [{ id: 'a-b', source: 'a', target: 'b' }]
    const [a, b] = calculateDagreLayout(nodes, edges, { direction: 'TB', spacingMode: 'normal' })
    expect(b.position.y - a.position.y).toBeLessThan(500)
  })
})

describe('dagreLayout — sauts de ligne de la réplique', () => {
  it('une didascalie suivie de la réplique compte ses lignes séparément', () => {
    const node = (line: string): Node => ({
      id: 'n',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { id: 'n', line },
    })
    const reply = '« Les cartes… ce sont les cartes ! Elles échappent à la perception. »'
    // La carte met toujours la parole à la ligne après la narration (`DialogueLineText`),
    // que l'auteur ait écrit le saut de ligne ou non.
    const withBreak = getLayoutNodeHeight(node(`*Il se lève.*\n\n${reply}`), 0)
    expect(getLayoutNodeHeight(node(`*Il se lève.* ${reply}`), 0)).toBe(withBreak)
    expect(withBreak).toBeGreaterThan(getLayoutNodeHeight(node(reply), 0))
    // L'espace entre deux didascalies est un bloc sans texte : il n'ouvre pas de ligne.
    expect(getLayoutNodeHeight(node('*Il se lève.* *Il sort.*'), 0)).toBe(
      getLayoutNodeHeight(node('*Il se lève.* « Il sort. »'), 0)
    )
  })

  it("un `*` non fermé n'ouvre pas de passage : la réplique tient sur la même ligne", () => {
    const node = (line: string): Node => ({
      id: 'n',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { id: 'n', line },
    })
    const oneLine = getLayoutNodeHeight(node('« Oui. »'), 0)
    expect(getLayoutNodeHeight(node('« Oui. » *Il pose'), 0)).toBe(oneLine)
    expect(getLayoutNodeHeight(node('« Oui. » *Il pose*'), 0)).toBeGreaterThan(oneLine)
  })
})
