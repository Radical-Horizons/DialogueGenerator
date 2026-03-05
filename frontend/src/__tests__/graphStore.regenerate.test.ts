/**
 * Tests unitaires pour régénération de nœuds et historique d'instructions (Story 1.10).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphStore } from '@/store/graphStore'
import * as graphAPI from '@/api/graph'
import type { Node } from 'reactflow'

vi.mock('@/api/graph', () => ({
  acceptNode: vi.fn(),
  rejectNode: vi.fn(),
  regenerateNode: vi.fn(),
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

describe('graphStore - Regeneration & history (Story 1.10)', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    vi.clearAllMocks()
  })

  describe('addToRegenerationHistory', () => {
    it('should add entry to node regenerationHistory when array is empty', () => {
      const node: Node = {
        id: 'node-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'node-1', speaker: 'Test', line: 'Line', status: 'pending' as const },
      }
      useGraphStore.getState().addNode(node)

      useGraphStore.getState().addToRegenerationHistory('node-1', 'First instructions')

      const updated = useGraphStore.getState().nodes.find((n) => n.id === 'node-1')
      const history = (updated?.data as { regenerationHistory?: Array<{ instructions: string }> })?.regenerationHistory
      expect(history).toHaveLength(1)
      expect(history?.[0].instructions).toBe('First instructions')
      expect(history?.[0]).toHaveProperty('timestamp')
      expect(history?.[0]).toHaveProperty('generationId')
    })

    it('should append entry and keep max 10 entries (FIFO)', () => {
      const node: Node = {
        id: 'node-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'node-1', speaker: 'Test', line: 'Line', status: 'pending' as const },
      }
      useGraphStore.getState().addNode(node)

      for (let i = 0; i < 12; i++) {
        useGraphStore.getState().addToRegenerationHistory('node-1', `Instructions ${i}`)
      }

      const updated = useGraphStore.getState().nodes.find((n) => n.id === 'node-1')
      const history = (updated?.data as { regenerationHistory?: Array<{ instructions: string }> })?.regenerationHistory
      expect(history).toHaveLength(10)
      expect(history?.[0].instructions).toBe('Instructions 2')
      expect(history?.[9].instructions).toBe('Instructions 11')
    })

    it('should do nothing when node not found', () => {
      useGraphStore.getState().addToRegenerationHistory('non-existent', 'Instructions')
      expect(useGraphStore.getState().nodes).toHaveLength(0)
    })
  })

  describe('generateFromNode - lastGenerationInstructions', () => {
    it('should store lastGenerationInstructions on generated node', async () => {
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
        nodes: undefined,
        suggested_connections: [],
        parent_node_id: 'parent-1',
      })

      await useGraphStore.getState().generateFromNode('parent-1', 'Tone plus sombre', {})

      const generatedNode = useGraphStore.getState().nodes.find((n) => n.id === 'generated-1')
      const instructions = (generatedNode?.data as { lastGenerationInstructions?: string })?.lastGenerationInstructions
      expect(instructions).toBe('Tone plus sombre')
    })
  })

  describe('regenerateNode', () => {
    it('should replace node in-place, preserve id and edges, add to regenerationHistory', async () => {
      const parentNode: Node = {
        id: 'parent-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'parent-1', speaker: 'Parent', line: 'Parent line', choices: [{ text: 'Choice' }] },
      }
      const pendingNode: Node = {
        id: 'pending-1',
        type: 'dialogueNode',
        position: { x: 300, y: 0 },
        data: {
          id: 'pending-1',
          speaker: 'Old',
          line: 'Old line',
          status: 'pending' as const,
        },
      }
      useGraphStore.getState().addNode(parentNode)
      useGraphStore.getState().addNode(pendingNode)
      useGraphStore.getState().connectNodes('parent-1', 'pending-1', 0)
      vi.mocked(graphAPI.regenerateNode).mockResolvedValue({
        node: {
          id: 'pending-1',
          speaker: 'NewSpeaker',
          line: 'New line',
        },
        suggested_connections: [
          { from: 'parent-1', to: 'pending-1', via_choice_index: 0, connection_type: 'choice' },
        ],
      })

      await useGraphStore.getState().regenerateNode('pending-1', 'New instructions')

      const updated = useGraphStore.getState().nodes.find((n) => n.id === 'pending-1')
      expect(updated).toBeDefined()
      expect(updated!.data.line).toBe('New line')
      expect(updated!.data.speaker).toBe('NewSpeaker')
      expect((updated!.data as { lastGenerationInstructions?: string }).lastGenerationInstructions).toBe('New instructions')
      const history = (updated!.data as { regenerationHistory?: Array<{ instructions: string }> }).regenerationHistory
      expect(history).toHaveLength(1)
      expect(history![0].instructions).toBe('New instructions')
      const edges = useGraphStore.getState().edges
      expect(edges.some((e) => e.source === 'parent-1' && e.target === 'pending-1')).toBe(true)
    })

    it('should throw when node not found', async () => {
      await expect(useGraphStore.getState().regenerateNode('non-existent', 'Instructions')).rejects.toThrow(
        'Nœud non-existent introuvable'
      )
    })

    it('should throw when parent node missing', async () => {
      const orphan: Node = {
        id: 'orphan-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'orphan-1', speaker: 'O', line: 'L', status: 'pending' as const },
      }
      useGraphStore.getState().addNode(orphan)
      await expect(useGraphStore.getState().regenerateNode('orphan-1', 'Instructions')).rejects.toThrow(
        'Nœud parent introuvable'
      )
    })
  })
})
