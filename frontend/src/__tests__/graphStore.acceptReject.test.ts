/**
 * Tests unitaires pour accept/reject nodes dans graphStore (Story 1.4).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphStore } from '@/store/graphStore'
import * as graphAPI from '@/api/graph'
import type { Node } from 'reactflow'

vi.mock('@/api/graph', () => ({
  acceptNode: vi.fn(),
  rejectNode: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  loadGraph: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

vi.mock('@/components/shared/Toast', () => ({
  toastManager: { show: vi.fn() },
}))

describe('graphStore - Accept/Reject Nodes (Story 1.4)', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    vi.clearAllMocks()
  })

  describe('acceptNode', () => {
    it('should mark node as accepted and call API', async () => {
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
      vi.mocked(graphAPI.saveGraphAndWrite).mockResolvedValue({
        success: true,
        filename: 'test-dialogue.json',
        json_content: '[]',
      })

      await useGraphStore.getState().acceptNode('node-1')

      const node = useGraphStore.getState().nodes.find((n) => n.id === 'node-1')
      expect(node?.data.status).toBe('accepted')
      expect(graphAPI.acceptNode).toHaveBeenCalledWith('test-dialogue.json', 'node-1')
      expect(graphAPI.saveGraphAndWrite).toHaveBeenCalled()
    })

    it('should throw error if node not found', async () => {
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
      vi.mocked(graphAPI.saveGraphAndWrite).mockRejectedValue(new Error('Save failed'))

      await expect(useGraphStore.getState().acceptNode('node-1')).rejects.toThrow('Save failed')

      const node = useGraphStore.getState().nodes.find((n) => n.id === 'node-1')
      expect(node?.data.status).toBe('pending')
      const { toastManager } = await import('@/components/shared/Toast')
      expect(toastManager.show).toHaveBeenCalledWith(
        'Impossible de sauvegarder l\u2019acceptation. Réessayez.',
        'error',
        5000
      )
    })
  })

  describe('rejectNode', () => {
    it('should remove node, call API and saveDialogue (persist removal)', async () => {
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
      const otherNode: Node = {
        id: 'END',
        type: 'endNode',
        position: { x: 100, y: 0 },
        data: { id: 'END', line: '' },
      }
      useGraphStore.getState().addNode(pendingNode)
      useGraphStore.getState().addNode(otherNode)
      useGraphStore.getState().updateMetadata({ filename: 'test-dialogue.json' })
      vi.mocked(graphAPI.rejectNode).mockResolvedValue(undefined)
      vi.mocked(graphAPI.saveGraphAndWrite).mockResolvedValue({
        success: true,
        filename: 'test-dialogue.json',
        json_content: '[]',
      })

      await useGraphStore.getState().rejectNode('node-1')

      expect(useGraphStore.getState().nodes.find((n) => n.id === 'node-1')).toBeUndefined()
      expect(graphAPI.rejectNode).toHaveBeenCalledWith('test-dialogue.json', 'node-1')
      expect(graphAPI.saveGraphAndWrite).toHaveBeenCalled()
    })

    it('should throw error if node not found', async () => {
      await expect(
        useGraphStore.getState().rejectNode('non-existent')
      ).rejects.toThrow('Nœud non-existent introuvable')
    })

    it('should not modify state and throw when reject API fails', async () => {
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
      vi.mocked(graphAPI.rejectNode).mockRejectedValue(new Error('Network error'))

      await expect(useGraphStore.getState().rejectNode('node-1')).rejects.toThrow('Network error')

      expect(useGraphStore.getState().nodes.find((n) => n.id === 'node-1')).toBeDefined()
      expect(graphAPI.saveGraphAndWrite).not.toHaveBeenCalled()
    })

    it('should clean parent targetNode when rejecting node referenced by choice', async () => {
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
      vi.mocked(graphAPI.saveGraphAndWrite).mockResolvedValue({
        success: true,
        filename: 'test-dialogue.json',
        json_content: '[]',
      })

      await useGraphStore.getState().rejectNode('child-1')

      expect(useGraphStore.getState().nodes.find((n) => n.id === 'child-1')).toBeUndefined()
      const p = useGraphStore.getState().nodes.find((n) => n.id === 'parent-1')
      const choices = (p?.data?.choices ?? []) as Array<{ text: string; targetNode?: string }>
      expect(choices.some((c) => c.targetNode === 'child-1')).toBe(false)
      expect(choices[0]?.targetNode).toBeUndefined()
    })

    it('should clean parent nextNode when rejecting node referenced by nextNode', async () => {
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
      vi.mocked(graphAPI.saveGraphAndWrite).mockResolvedValue({
        success: true,
        filename: 'test-dialogue.json',
        json_content: '[]',
      })

      await useGraphStore.getState().rejectNode('child-2')

      expect(useGraphStore.getState().nodes.find((n) => n.id === 'child-2')).toBeUndefined()
      const p = useGraphStore.getState().nodes.find((n) => n.id === 'parent-2')
      expect((p?.data as { nextNode?: string })?.nextNode).toBeUndefined()
    })
  })

  describe('generateFromNode - pending status', () => {
    it('should mark generated nodes as pending', async () => {
      const parentNode: Node = {
        id: 'parent-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'parent-1', speaker: 'Parent', line: 'Parent line' },
      }
      useGraphStore.getState().addNode(parentNode)
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

      await useGraphStore.getState().generateFromNode('parent-1', 'instructions', {})

      const generatedNode = useGraphStore.getState().nodes.find((n) => n.id === 'generated-1')
      expect(generatedNode?.data.status).toBe('pending')
    })
  })
})
