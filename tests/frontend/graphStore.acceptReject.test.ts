/**
 * Tests unitaires pour accept/reject nodes dans graphStore (Story 1.4).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphStore } from '../../frontend/src/store/graphStore'
import * as graphAPI from '../../frontend/src/api/graph'
import type { Node } from 'reactflow'

// Mock de l'API
vi.mock('../../frontend/src/api/graph', () => ({
  acceptNode: vi.fn(),
  rejectNode: vi.fn(),
  saveGraph: vi.fn(),
  generateNode: vi.fn(),
}))

// Mock Toast pour tests rollback (acceptNode en cas d'échec saveDialogue)
vi.mock('../../frontend/src/components/shared/Toast', () => ({
  toastManager: { show: vi.fn() },
}))

describe('graphStore - Accept/Reject Nodes (Story 1.4)', () => {
  beforeEach(() => {
    // Réinitialiser le store avant chaque test
    useGraphStore.getState().resetGraph()
    vi.clearAllMocks()
  })

  describe('acceptNode', () => {
    it('should mark node as accepted and call API', async () => {
      // GIVEN: un nœud pending dans le store
      const pendingNode: Node = {
        id: 'node-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'node-1',
          speaker: 'Test',
          line: 'Test line',
          status: 'pending' as const,
        },
      }
      
      useGraphStore.getState().addNode(pendingNode)
      useGraphStore.getState().updateMetadata({ filename: 'test-dialogue.json' })
      
      // Mock API calls
      vi.mocked(graphAPI.acceptNode).mockResolvedValue(undefined)
      vi.mocked(graphAPI.saveGraph).mockResolvedValue({
        success: true,
        filename: 'test-dialogue.json',
        json_content: '[]',
      })
      
      // WHEN: j'accepte le nœud
      await useGraphStore.getState().acceptNode('node-1')
      
      // THEN: le nœud est marqué comme accepted
      const node = useGraphStore.getState().nodes.find((n) => n.id === 'node-1')
      expect(node?.data.status).toBe('accepted')
      
      // ET: l'API acceptNode est appelée
      expect(graphAPI.acceptNode).toHaveBeenCalledWith('test-dialogue.json', 'node-1')
      
      // ET: saveDialogue est appelé pour persister
      expect(graphAPI.saveGraph).toHaveBeenCalled()
    })
    
    it('should throw error if node not found', async () => {
      // GIVEN: aucun nœud dans le store
      
      // WHEN/THEN: accepter un nœud inexistant lève une erreur
      await expect(
        useGraphStore.getState().acceptNode('non-existent')
      ).rejects.toThrow('Nœud non-existent introuvable')
    })

    it('should rollback status to pending and show toast when saveDialogue fails', async () => {
      const pendingNode: Node = {
        id: 'node-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'node-1',
          speaker: 'Test',
          line: 'Test line',
          status: 'pending' as const,
        },
      }
      useGraphStore.getState().addNode(pendingNode)
      useGraphStore.getState().updateMetadata({ filename: 'test-dialogue.json' })
      vi.mocked(graphAPI.acceptNode).mockResolvedValue(undefined)
      vi.mocked(graphAPI.saveGraph).mockRejectedValue(new Error('Save failed'))

      await expect(useGraphStore.getState().acceptNode('node-1')).rejects.toThrow('Save failed')

      const node = useGraphStore.getState().nodes.find((n) => n.id === 'node-1')
      expect(node?.data.status).toBe('pending')
      const { toastManager } = await import('../../frontend/src/components/shared/Toast')
      expect(toastManager.show).toHaveBeenCalledWith(
        'Impossible de sauvegarder l'acceptation. Réessayez.',
        'error',
        5000
      )
    })
  })

  describe('rejectNode', () => {
    it('should remove node and call API', async () => {
      // GIVEN: un nœud pending dans le store
      const pendingNode: Node = {
        id: 'node-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'node-1',
          speaker: 'Test',
          line: 'Test line',
          status: 'pending' as const,
        },
      }
      
      useGraphStore.getState().addNode(pendingNode)
      useGraphStore.getState().updateMetadata({ filename: 'test-dialogue.json' })
      
      // Mock API calls
      vi.mocked(graphAPI.rejectNode).mockResolvedValue(undefined)
      
      // WHEN: je rejette le nœud
      await useGraphStore.getState().rejectNode('node-1')
      
      // THEN: le nœud est supprimé du store
      const node = useGraphStore.getState().nodes.find((n) => n.id === 'node-1')
      expect(node).toBeUndefined()
      
      // ET: l'API rejectNode est appelée
      expect(graphAPI.rejectNode).toHaveBeenCalledWith('test-dialogue.json', 'node-1')
    })
    
    it('should throw error if node not found', async () => {
      // GIVEN: aucun nœud dans le store
      
      // WHEN/THEN: rejeter un nœud inexistant lève une erreur
      await expect(
        useGraphStore.getState().rejectNode('non-existent')
      ).rejects.toThrow('Nœud non-existent introuvable')
    })

    it('should clean parent targetNode when rejecting node referenced by choice', async () => {
      // GIVEN: parent avec choice.targetNode → enfant, enfant pending
      const parent: Node = {
        id: 'parent-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'parent-1',
          speaker: 'Parent',
          line: 'Ligne',
          choices: [{ text: 'Choix 1', targetNode: 'child-1' }],
        },
      }
      const child: Node = {
        id: 'child-1',
        type: 'dialogueNode',
        position: { x: 200, y: 0 },
        data: { id: 'child-1', speaker: 'Child', line: 'Ligne', status: 'pending' as const },
      }
      useGraphStore.getState().addNode(parent)
      useGraphStore.getState().addNode(child)
      useGraphStore.getState().updateMetadata({ filename: 'test-dialogue.json' })
      vi.mocked(graphAPI.rejectNode).mockResolvedValue(undefined)

      // WHEN: je rejette l'enfant
      await useGraphStore.getState().rejectNode('child-1')

      // THEN: l'enfant est supprimé
      expect(useGraphStore.getState().nodes.find((n) => n.id === 'child-1')).toBeUndefined()
      // ET: le parent n'a plus targetNode sur le choix
      const p = useGraphStore.getState().nodes.find((n) => n.id === 'parent-1')
      const choices = (p?.data?.choices ?? []) as Array<{ text: string; targetNode?: string }>
      expect(choices.some((c) => c.targetNode === 'child-1')).toBe(false)
      expect(choices[0]?.targetNode).toBeUndefined()
    })

    it('should clean parent nextNode when rejecting node referenced by nextNode', async () => {
      // GIVEN: parent avec nextNode → enfant, enfant pending
      const parent: Node = {
        id: 'parent-2',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'parent-2',
          speaker: 'Parent',
          line: 'Ligne',
          nextNode: 'child-2',
        },
      }
      const child: Node = {
        id: 'child-2',
        type: 'dialogueNode',
        position: { x: 200, y: 0 },
        data: { id: 'child-2', speaker: 'Child', line: 'Ligne', status: 'pending' as const },
      }
      useGraphStore.getState().addNode(parent)
      useGraphStore.getState().addNode(child)
      useGraphStore.getState().updateMetadata({ filename: 'test-dialogue.json' })
      vi.mocked(graphAPI.rejectNode).mockResolvedValue(undefined)

      // WHEN: je rejette l'enfant
      await useGraphStore.getState().rejectNode('child-2')

      // THEN: l'enfant est supprimé
      expect(useGraphStore.getState().nodes.find((n) => n.id === 'child-2')).toBeUndefined()
      // ET: le parent n'a plus nextNode
      const p = useGraphStore.getState().nodes.find((n) => n.id === 'parent-2')
      expect((p?.data as { nextNode?: string })?.nextNode).toBeUndefined()
    })
  })

  describe('generateFromNode - pending status', () => {
    it('should mark generated nodes as pending', async () => {
      // GIVEN: un nœud parent
      const parentNode: Node = {
        id: 'parent-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'parent-1',
          speaker: 'Parent',
          line: 'Parent line',
        },
      }
      
      useGraphStore.getState().addNode(parentNode)
      
      // Mock API generateNode
      vi.mocked(graphAPI.generateNode).mockResolvedValue({
        node: {
          id: 'generated-1',
          speaker: 'Generated',
          line: 'Generated line',
        },
        nodes: null,
        suggested_connections: [],
        parent_node_id: 'parent-1',
      })
      
      // WHEN: je génère un nœud
      await useGraphStore.getState().generateFromNode('parent-1', 'instructions', {})
      
      // THEN: le nœud généré est marqué comme pending
      const generatedNode = useGraphStore.getState().nodes.find((n) => n.id === 'generated-1')
      expect(generatedNode?.data.status).toBe('pending')
    })
  })
})
