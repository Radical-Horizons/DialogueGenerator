import { describe, expect, it } from 'vitest'
import type { Edge, Node } from 'reactflow'
import {
  calculateDagreLayout,
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
