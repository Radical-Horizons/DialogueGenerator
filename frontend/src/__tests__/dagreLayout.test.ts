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
