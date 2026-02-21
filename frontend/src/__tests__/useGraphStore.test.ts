/**
 * Tests pour useGraphStore - Pending save state (auto-save backend, pas de draft local)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphStore } from '../store/graphStore'
import type { Node } from 'reactflow'

// Mock graphAPI
vi.mock('../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

describe('useGraphStore - Pending save state', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
  })

  describe('Initial state', () => {
    it('should initialize hasUnsavedChanges to false', () => {
      const state = useGraphStore.getState()
      expect(state.hasUnsavedChanges).toBe(false)
    })

    it('should initialize lastSaveError to null', () => {
      const state = useGraphStore.getState()
      expect(state.lastSaveError).toBeNull()
    })

    it('should initialize lastSavedAt to null', () => {
      const state = useGraphStore.getState()
      expect(state.lastSavedAt).toBeNull()
    })
  })

  describe('markDirty', () => {
    it('should set hasUnsavedChanges to true', () => {
      const { markDirty } = useGraphStore.getState()
      markDirty()
      const state = useGraphStore.getState()
      expect(state.hasUnsavedChanges).toBe(true)
    })
  })

  describe('Graph mutations should mark dirty', () => {
    it('should mark dirty when addNode is called', () => {
      const { addNode } = useGraphStore.getState()
      const newNode: Node = {
        id: 'test-node-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { text: 'Test' },
      }
      
      addNode(newNode)
      
      const state = useGraphStore.getState()
      expect(state.hasUnsavedChanges).toBe(true)
    })

    it('should mark dirty when updateNode is called', () => {
      const { addNode, updateNode } = useGraphStore.getState()
      const newNode: Node = {
        id: 'test-node-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { text: 'Test' },
      }
      addNode(newNode)
      updateNode('test-node-1', { data: { text: 'Updated' } })
      const state = useGraphStore.getState()
      expect(state.hasUnsavedChanges).toBe(true)
    })

    it('should mark dirty when deleteNode is called', () => {
      const { addNode, deleteNode } = useGraphStore.getState()
      const newNode: Node = {
        id: 'test-node-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { text: 'Test' },
      }
      addNode(newNode)
      deleteNode('test-node-1')
      const state = useGraphStore.getState()
      expect(state.hasUnsavedChanges).toBe(true)
    })

    it('should delete associated TestNodes when deleting a DialogueNode', () => {
      const { addNode, deleteNode } = useGraphStore.getState()
      
      // Créer un DialogueNode avec des choix ayant des tests
      // Les TestBars seront créés automatiquement par normalizeTestBars lors de addNode
      const dialogueNode: Node = {
        id: 'dialogue-node-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'dialogue-node-1',
          choices: [
            { text: 'Choix 1', test: 'Raison+Diplomatie:8' },
            { text: 'Choix 2', test: 'Force+Combat:10' },
          ],
        },
      }
      addNode(dialogueNode)
      
      // Vérifier que les nodes existent (DialogueNode + 2 TestBars créés automatiquement)
      let state = useGraphStore.getState()
      expect(state.nodes.length).toBe(3)
      expect(state.nodes.find(n => n.id === 'dialogue-node-1')).toBeDefined()
      expect(state.nodes.find(n => n.id === 'test-node-dialogue-node-1-choice-0')).toBeDefined()
      expect(state.nodes.find(n => n.id === 'test-node-dialogue-node-1-choice-1')).toBeDefined()
      
      // Supprimer le DialogueNode
      deleteNode('dialogue-node-1')
      
      // Vérifier que le DialogueNode et tous les TestBars associés sont supprimés
      state = useGraphStore.getState()
      expect(state.nodes.length).toBe(0)
      expect(state.nodes.find(n => n.id === 'dialogue-node-1')).toBeUndefined()
      expect(state.nodes.find(n => n.id === 'test-node-dialogue-node-1-choice-0')).toBeUndefined()
      expect(state.nodes.find(n => n.id === 'test-node-dialogue-node-1-choice-1')).toBeUndefined()
    })

    it('should only delete the TestNode when deleting a TestNode directly (not the parent)', () => {
      const { addNode, deleteNode } = useGraphStore.getState()
      
      // Créer un DialogueNode et un TestNode associé
      const dialogueNode: Node = {
        id: 'dialogue-node-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          choices: [
            { text: 'Choix 1', test: 'Raison+Diplomatie:8' },
          ],
        },
      }
      addNode(dialogueNode)
      
      const testNode: Node = {
        id: 'test-node-dialogue-node-1-choice-0',
        type: 'testNode',
        position: { x: 300, y: 0 },
        data: { test: 'Raison+Diplomatie:8' },
      }
      addNode(testNode)
      
      // Supprimer directement le TestNode
      deleteNode('test-node-dialogue-node-1-choice-0')
      
      // Vérifier que seul le TestNode est supprimé, pas le DialogueNode parent
      const state = useGraphStore.getState()
      expect(state.nodes.length).toBe(1)
      expect(state.nodes.find(n => n.id === 'dialogue-node-1')).toBeDefined()
      expect(state.nodes.find(n => n.id === 'test-node-dialogue-node-1-choice-0')).toBeUndefined()
    })

    it('should clean up targetNode references when deleting a node', () => {
      const { addNode, deleteNode } = useGraphStore.getState()
      
      // Créer deux DialogueNodes avec une connexion
      const parentNode: Node = {
        id: 'parent-node',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'parent-node',
          choices: [
            { text: 'Choix vers enfant', targetNode: 'child-node' },
          ],
        },
      }
      const childNode: Node = {
        id: 'child-node',
        type: 'dialogueNode',
        position: { x: 200, y: 200 },
        data: {
          id: 'child-node',
          line: 'Nœud enfant',
        },
      }
      
      addNode(parentNode)
      addNode(childNode)
      
      // Vérifier que la référence existe
      let state = useGraphStore.getState()
      const parent = state.nodes.find(n => n.id === 'parent-node')
      expect(parent).toBeDefined()
      expect((parent?.data as { choices?: Array<{ targetNode?: string }> }).choices?.[0]?.targetNode).toBe('child-node')
      
      // Supprimer le nœud enfant
      deleteNode('child-node')
      
      // Vérifier que la référence targetNode a été nettoyée
      state = useGraphStore.getState()
      const updatedParent = state.nodes.find(n => n.id === 'parent-node')
      expect(updatedParent).toBeDefined()
      const updatedChoices = (updatedParent?.data as { choices?: Array<{ targetNode?: string }> }).choices
      expect(updatedChoices?.[0]?.targetNode).toBeUndefined()
    })

    it('should clean up nextNode references when deleting a node', () => {
      const { addNode, deleteNode } = useGraphStore.getState()
      
      // Créer deux DialogueNodes avec nextNode
      const firstNode: Node = {
        id: 'first-node',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'first-node',
          line: 'Premier nœud',
          nextNode: 'second-node',
        },
      }
      const secondNode: Node = {
        id: 'second-node',
        type: 'dialogueNode',
        position: { x: 200, y: 0 },
        data: {
          id: 'second-node',
          line: 'Deuxième nœud',
        },
      }
      
      addNode(firstNode)
      addNode(secondNode)
      
      // Vérifier que la référence existe
      let state = useGraphStore.getState()
      const first = state.nodes.find(n => n.id === 'first-node')
      expect(first).toBeDefined()
      expect((first?.data as { nextNode?: string }).nextNode).toBe('second-node')
      
      // Supprimer le deuxième nœud
      deleteNode('second-node')
      
      // Vérifier que la référence nextNode a été nettoyée
      state = useGraphStore.getState()
      const updatedFirst = state.nodes.find(n => n.id === 'first-node')
      expect(updatedFirst).toBeDefined()
      expect((updatedFirst?.data as { nextNode?: string }).nextNode).toBeUndefined()
    })

    it('should mark dirty when connectNodes is called', () => {
      const { addNode, connectNodes } = useGraphStore.getState()
      const node1: Node = { id: 'node-1', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} }
      const node2: Node = { id: 'node-2', type: 'dialogueNode', position: { x: 100, y: 0 }, data: {} }
      addNode(node1)
      addNode(node2)
      connectNodes('node-1', 'node-2')
      const state = useGraphStore.getState()
      expect(state.hasUnsavedChanges).toBe(true)
    })

    it('should mark dirty when disconnectNodes is called', () => {
      const { addNode, connectNodes, disconnectNodes } = useGraphStore.getState()
      const node1: Node = { id: 'node-1', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} }
      const node2: Node = { id: 'node-2', type: 'dialogueNode', position: { x: 100, y: 0 }, data: {} }
      addNode(node1)
      addNode(node2)
      connectNodes('node-1', 'node-2')
      const edges = useGraphStore.getState().edges
      const edgeId = edges.find(e => e.source === 'node-1' && e.target === 'node-2')?.id
      if (edgeId) {
        disconnectNodes(edgeId)
      }
      const state = useGraphStore.getState()
      expect(state.hasUnsavedChanges).toBe(true)
    })

    it('should mark dirty when updateNodePosition is called', () => {
      const { addNode, updateNodePosition } = useGraphStore.getState()
      const newNode: Node = {
        id: 'test-node-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { text: 'Test' },
      }
      addNode(newNode)
      updateNodePosition('test-node-1', { x: 100, y: 100 })
      const state = useGraphStore.getState()
      expect(state.hasUnsavedChanges).toBe(true)
    })

    it('should mark dirty when updateMetadata is called', () => {
      const { updateMetadata } = useGraphStore.getState()
      updateMetadata({ title: 'New Title' })
      const state = useGraphStore.getState()
      expect(state.hasUnsavedChanges).toBe(true)
    })

    it('should NOT mark dirty when loadDialogue is called', async () => {
      const { markDirty, loadDialogue } = useGraphStore.getState()
      
      // Marquer dirty d'abord
      markDirty()
      expect(useGraphStore.getState().hasUnsavedChanges).toBe(true)
      
      // Mock graphAPI.loadGraph (accessible via vi.mocked après import)
      const graphAPI = await import('../api/graph')
      const mockLoadGraph = vi.mocked(graphAPI.loadGraph)
      mockLoadGraph.mockResolvedValueOnce({
        nodes: [],
        edges: [],
        metadata: {
          title: 'Test Dialogue',
          node_count: 0,
          edge_count: 0,
          filename: 'test.json',
        },
      })
      
      // Appeler loadDialogue
      await loadDialogue('{"id": "START"}')
      
      const state = useGraphStore.getState()
      expect(state.hasUnsavedChanges).toBe(false)
      expect(state.lastSaveError).toBeNull()
      expect(state.lastSavedAt).toBeNull()

      // Vérifier que loadGraph a été appelé
      expect(mockLoadGraph).toHaveBeenCalledWith({ json_content: '{"id": "START"}' })
    })
  })

  describe('generateFromNode - Batch generation support', () => {
    beforeEach(() => {
      useGraphStore.getState().resetGraph()
    })

    it('should pass target_choice_index to API when provided', async () => {
      const { addNode, generateFromNode } = useGraphStore.getState()
      
      // Créer un nœud parent avec choix
      const parentNode: Node = {
        id: 'parent-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          speaker: 'PNJ',
          line: 'Test',
          choices: [
            { text: 'Choix 1', targetNode: null },
            { text: 'Choix 2', targetNode: null },
          ],
        },
      }
      addNode(parentNode)
      
      // Mock generateNode API
      const graphAPI = await import('../api/graph')
      const mockGenerateNode = vi.mocked(graphAPI.generateNode)
      mockGenerateNode.mockResolvedValueOnce({
        node: {
          id: 'generated-1',
          speaker: 'PNJ',
          line: 'Réponse',
        },
        suggested_connections: [
          {
            from: 'parent-1',
            to: 'generated-1',
            via_choice_index: 0,
            connection_type: 'choice',
          },
        ],
        parent_node_id: 'parent-1',
      })
      
      await generateFromNode('parent-1', 'Instructions', {
        target_choice_index: 0,
        generate_all_choices: false,
      })
      
      // Vérifier que l'API a été appelée avec target_choice_index
      expect(mockGenerateNode).toHaveBeenCalledWith(
        expect.objectContaining({
          parent_node_id: 'parent-1',
          target_choice_index: 0,
          generate_all_choices: false,
        })
      )
    })

    it('should pass generate_all_choices to API when true', async () => {
      const { addNode, generateFromNode } = useGraphStore.getState()
      
      const parentNode: Node = {
        id: 'parent-2',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          speaker: 'PNJ',
          line: 'Test',
          choices: [
            { text: 'Choix 1', targetNode: null },
            { text: 'Choix 2', targetNode: null },
          ],
        },
      }
      addNode(parentNode)
      
      const graphAPI = await import('../api/graph')
      const mockGenerateNode = vi.mocked(graphAPI.generateNode)
      mockGenerateNode.mockResolvedValueOnce({
        node: {
          id: 'generated-1',
          speaker: 'PNJ',
          line: 'Réponse',
        },
        suggested_connections: [],
        parent_node_id: 'parent-2',
      })
      
      await generateFromNode('parent-2', 'Instructions', {
        generate_all_choices: true,
      })
      
      expect(mockGenerateNode).toHaveBeenCalledWith(
        expect.objectContaining({
          generate_all_choices: true,
        })
      )
    })

    it('should update targetNode in parent when connecting via choice', async () => {
      const { addNode, generateFromNode } = useGraphStore.getState()
      
      const parentNode: Node = {
        id: 'parent-3',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          speaker: 'PNJ',
          line: 'Test',
          choices: [
            { text: 'Choix 1', targetNode: null },
          ],
        },
      }
      addNode(parentNode)
      
      const graphAPI = await import('../api/graph')
      const mockGenerateNode = vi.mocked(graphAPI.generateNode)
      mockGenerateNode.mockResolvedValueOnce({
        node: {
          id: 'generated-1',
          speaker: 'PNJ',
          line: 'Réponse',
        },
        suggested_connections: [
          {
            from: 'parent-3',
            to: 'generated-1',
            via_choice_index: 0,
            connection_type: 'choice',
          },
        ],
        parent_node_id: 'parent-3',
      })
      
      await generateFromNode('parent-3', 'Instructions', {
        target_choice_index: 0,
      })
      
      // Vérifier que targetNode a été mis à jour dans le parent
      const state = useGraphStore.getState()
      const updatedParent = state.nodes.find((n) => n.id === 'parent-3')
      expect(updatedParent?.data?.choices?.[0]?.targetNode).toBe('generated-1')
    })

    it('should position nodes in cascade for batch generation', async () => {
      const { addNode, generateFromNode } = useGraphStore.getState()
      
      const parentNode: Node = {
        id: 'parent-4',
        type: 'dialogueNode',
        position: { x: 100, y: 100 },
        data: {
          speaker: 'PNJ',
          line: 'Test',
          choices: [
            { text: 'Choix 1', targetNode: null },
            { text: 'Choix 2', targetNode: null },
          ],
        },
      }
      addNode(parentNode)
      
      const graphAPI = await import('../api/graph')
      const mockGenerateNode = vi.mocked(graphAPI.generateNode)
      mockGenerateNode.mockResolvedValueOnce({
        node: {
          id: 'generated-1',
          speaker: 'PNJ',
          line: 'Réponse',
        },
        suggested_connections: [
          {
            from: 'parent-4',
            to: 'generated-1',
            via_choice_index: 0,
            connection_type: 'choice',
          },
        ],
        parent_node_id: 'parent-4',
      })
      
      await generateFromNode('parent-4', 'Instructions', {
        generate_all_choices: true,
      })
      
      // Vérifier positionnement (pour l'instant un seul nœud, mais position calculée)
      const state = useGraphStore.getState()
      const generatedNode = state.nodes.find((n) => n.id === 'generated-1')
      expect(generatedNode?.position.x).toBe(400) // parent.x + 300
      expect(generatedNode?.position.y).toBe(100) // parent.y + (150 * 0) pour choix index 0
    })
  })
})