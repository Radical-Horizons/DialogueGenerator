import { describe, it, expect, beforeEach } from 'vitest'
import type { Node } from 'reactflow'
import { useGraphStore } from '../store/graphStore'

function dialogueNode(id: string, data: Record<string, unknown>): Node {
  return { id, type: 'dialogueNode', position: { x: 0, y: 0 }, data: { id, ...data } }
}

describe('graphStore - syncNodeDisplayName / syncMissingDisplayNames', () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [],
      edges: [],
      hasUnsavedChanges: false,
      validationErrors: [],
    })
  })

  it('remplit displayName depuis la première ligne de line', () => {
    useGraphStore.setState({
      nodes: [dialogueNode('n1', { line: 'Bonjour\nsuite' })],
    })
    useGraphStore.getState().syncNodeDisplayName('n1')
    const node = useGraphStore.getState().nodes.find((n) => n.id === 'n1')
    expect((node?.data as { displayName?: string }).displayName).toBe('Bonjour')
    expect(useGraphStore.getState().hasUnsavedChanges).toBe(true)
  })

  it('retombe sur l’id si line est vide', () => {
    useGraphStore.setState({
      nodes: [dialogueNode('fallback-id', { line: '' })],
    })
    useGraphStore.getState().syncNodeDisplayName('fallback-id')
    const node = useGraphStore.getState().nodes.find((n) => n.id === 'fallback-id')
    expect((node?.data as { displayName?: string }).displayName).toBe('fallback-id')
  })

  it('ne modifie pas un nœud qui a déjà un title', () => {
    useGraphStore.setState({
      nodes: [dialogueNode('n1', { title: 'Titre', line: 'Ligne' })],
    })
    useGraphStore.getState().syncNodeDisplayName('n1')
    const node = useGraphStore.getState().nodes.find((n) => n.id === 'n1')
    expect((node?.data as { displayName?: string }).displayName).toBeUndefined()
    expect(useGraphStore.getState().hasUnsavedChanges).toBe(false)
  })

  it('syncMissingDisplayNames met à jour plusieurs nœuds en un lot', () => {
    useGraphStore.setState({
      nodes: [
        dialogueNode('n1', { line: 'A' }),
        dialogueNode('n2', { line: 'B' }),
        dialogueNode('n3', { title: 'Déjà ok' }),
      ],
    })
    const updated = useGraphStore.getState().syncMissingDisplayNames(['n1', 'n2', 'n3'])
    expect(updated).toEqual(['n1', 'n2'])
    const nodes = useGraphStore.getState().nodes
    expect((nodes.find((n) => n.id === 'n1')?.data as { displayName?: string }).displayName).toBe(
      'A'
    )
    expect((nodes.find((n) => n.id === 'n2')?.data as { displayName?: string }).displayName).toBe(
      'B'
    )
  })
})
