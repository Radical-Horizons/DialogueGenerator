/**
 * `connectNodes` en mode `nextNode` : l'index `null` venu de l'API n'en fait pas un choix,
 * et une nouvelle suite remplace l'arête de l'ancienne au lieu de s'y ajouter.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphStore } from '../store/graphStore'

vi.mock('../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

function addDialogue(id: string): void {
  useGraphStore.getState().addNode({
    id,
    type: 'dialogueNode',
    position: { x: 0, y: 0 },
    data: { id, speaker: 'PNJ', line: id },
  })
}

function outgoing(sourceId: string) {
  return useGraphStore.getState().edges.filter((edge) => edge.source === sourceId)
}

describe('graphStore — suite nextNode', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    ;['feuille', 'ancienne-suite', 'nouvelle-suite'].forEach(addDialogue)
  })

  it('un index de choix null relie une feuille par nextNode, sans arête de choix fantôme', () => {
    useGraphStore.getState().connectNodes('feuille', 'nouvelle-suite', null, 'nextNode')
    const feuille = useGraphStore.getState().nodes.find((n) => n.id === 'feuille')!
    expect(feuille.data.nextNode).toBe('nouvelle-suite')
    const edges = outgoing('feuille')
    expect(edges).toHaveLength(1)
    expect(edges[0].sourceHandle).toBeUndefined()
    expect(edges[0].id).not.toContain('__idx_null')
  })

  it("une nouvelle suite retire l'arête de l'ancienne", () => {
    useGraphStore.getState().connectNodes('feuille', 'ancienne-suite', undefined, 'nextNode')
    useGraphStore.getState().connectNodes('feuille', 'nouvelle-suite', undefined, 'nextNode')
    expect(outgoing('feuille').map((edge) => edge.target)).toEqual(['nouvelle-suite'])
  })
})
