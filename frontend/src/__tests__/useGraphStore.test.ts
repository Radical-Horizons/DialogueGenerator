/**
 * Tests pour useGraphStore - Pending save state (auto-save backend, pas de draft local)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphStore } from '../store/graphStore'
import type { Node } from 'reactflow'
import * as graphAPI from '../api/graph'
import {
  childNodeTopLeftX,
  childNodeTopLeftY,
  GRAPH_DIALOGUE_NODE_WIDTH,
  GRAPH_SIBLING_COLUMN_STEP,
} from '../utils/graphNodeLayout'
import { getLayoutNodeHeight } from '../utils/dagreLayout'

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

    it('connectNodes with source, target, choiceIndex, connectionType adds choice edge and marks dirty (Story 2.5 AC #2, #3)', () => {
      const { addNode, connectNodes } = useGraphStore.getState()
      const node1: Node = {
        id: 'n1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { choices: [{ text: 'Choix A', choiceId: 'c1' }] },
      }
      const node2: Node = { id: 'n2', type: 'dialogueNode', position: { x: 100, y: 0 }, data: {} }
      addNode(node1)
      addNode(node2)
      connectNodes('n1', 'n2', 0, 'choice')
      const state = useGraphStore.getState()
      expect(state.edges).toHaveLength(1)
      expect(state.edges[0].source).toBe('n1')
      expect(state.edges[0].target).toBe('n2')
      expect(state.hasUnsavedChanges).toBe(true)
    })

    it('updateChoiceEdgeLabel updates choice text, edge label, and marks dirty (Story 2.5 AC #4)', () => {
      const { addNode, connectNodes, updateChoiceEdgeLabel } = useGraphStore.getState()
      const node1: Node = {
        id: 'n1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { choices: [{ text: 'Accepter', choiceId: 'c1' }] },
      }
      const node2: Node = { id: 'n2', type: 'dialogueNode', position: { x: 100, y: 0 }, data: {} }
      addNode(node1)
      addNode(node2)
      connectNodes('n1', 'n2', 0, 'choice')
      const edge = useGraphStore.getState().edges[0]
      expect(edge.label).toBe('Accepter')
      updateChoiceEdgeLabel(edge.id, 'Refuser')
      const state = useGraphStore.getState()
      const src = state.nodes.find((n) => n.id === 'n1')
      expect((src?.data?.choices as { text?: string }[])?.[0]?.text).toBe('Refuser')
      expect(state.edges[0].label).toBe('Refuser')
      expect(state.hasUnsavedChanges).toBe(true)
    })

    it('creating connection that forms cycle: validateGraph returns cycle_detected warning, edge remains (Story 2.5 AC #5)', async () => {
      vi.mocked(graphAPI.validateGraph).mockResolvedValueOnce({
        errors: [],
        warnings: [
          {
            type: 'cycle_detected',
            cycle_id: 'cycle_1',
            cycle_path: 'A → B → C → A',
            cycle_nodes: ['a', 'b', 'c'],
            message: 'Cycle détecté : A → B → C → A',
            severity: 'warning',
          },
        ],
        valid: true,
      })
      const { addNode, connectNodes, validateGraph } = useGraphStore.getState()
      const a: Node = { id: 'a', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} }
      const b: Node = { id: 'b', type: 'dialogueNode', position: { x: 100, y: 0 }, data: {} }
      const c: Node = { id: 'c', type: 'dialogueNode', position: { x: 200, y: 0 }, data: {} }
      addNode(a)
      addNode(b)
      addNode(c)
      connectNodes('a', 'b')
      connectNodes('b', 'c')
      connectNodes('c', 'a')
      expect(useGraphStore.getState().edges).toHaveLength(3)
      await validateGraph()
      const state = useGraphStore.getState()
      expect(state.edges).toHaveLength(3)
      const cycleWarn = state.validationErrors.find((e) => e.type === 'cycle_detected')
      expect(cycleWarn).toBeDefined()
      expect(cycleWarn?.message).toContain('Cycle détecté')
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

    it('disconnectNodes on choice edge clears source choice targetNode (store consistency)', () => {
      const { addNode, connectNodes, disconnectNodes } = useGraphStore.getState()
      const node1: Node = {
        id: 'n1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { choices: [{ text: 'Choix A', choiceId: 'c1' }] },
      }
      const node2: Node = { id: 'n2', type: 'dialogueNode', position: { x: 100, y: 0 }, data: {} }
      addNode(node1)
      addNode(node2)
      connectNodes('n1', 'n2', 0, 'choice')
      let state = useGraphStore.getState()
      const edge = state.edges.find((e) => e.source === 'n1' && e.target === 'n2')
      expect(edge).toBeDefined()
      const parent = state.nodes.find((n) => n.id === 'n1')
      expect((parent?.data?.choices as { targetNode?: string }[])?.[0]?.targetNode).toBe('n2')
      disconnectNodes(edge!.id)
      state = useGraphStore.getState()
      const updatedParent = state.nodes.find((n) => n.id === 'n1')
      expect(state.edges.some((e) => e.source === 'n1' && e.target === 'n2')).toBe(false)
      expect((updatedParent?.data?.choices as { targetNode?: string }[])?.[0]?.targetNode).toBeUndefined()
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

  describe('Story 2.2 (AC #4): graph unload on dialogue change', () => {
    it('after loadDialogue(B), state nodes/edges match B only; no leak of previous graph', async () => {
      const graphAPI = await import('../api/graph')
      const mockLoadGraph = vi.mocked(graphAPI.loadGraph)
      const dialogueA = {
        nodes: [
          { id: 'nA1', type: 'dialogueNode', position: { x: 0, y: 0 }, data: { speaker: 'A', line: 'A1' } },
          { id: 'nA2', type: 'dialogueNode', position: { x: 100, y: 0 }, data: { speaker: 'A', line: 'A2' } },
        ],
        edges: [{ id: 'eA1', source: 'nA1', target: 'nA2' }],
        metadata: { title: 'Dialogue A', node_count: 2, edge_count: 1, filename: 'a.json' },
      }
      const dialogueB = {
        nodes: [
          { id: 'nB1', type: 'dialogueNode', position: { x: 0, y: 0 }, data: { speaker: 'B', line: 'B1' } },
          { id: 'nB2', type: 'dialogueNode', position: { x: 100, y: 0 }, data: { speaker: 'B', line: 'B2' } },
        ],
        edges: [{ id: 'eB1', source: 'nB1', target: 'nB2' }],
        metadata: { title: 'Dialogue B', node_count: 2, edge_count: 1, filename: 'b.json' },
      }
      mockLoadGraph
        .mockResolvedValueOnce(dialogueA as Awaited<ReturnType<typeof graphAPI.loadGraph>>)
        .mockResolvedValueOnce(dialogueB as Awaited<ReturnType<typeof graphAPI.loadGraph>>)
      const { loadDialogue } = useGraphStore.getState()
      await loadDialogue('{"dialogue":"A"}')
      let state = useGraphStore.getState()
      expect(state.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['nA1', 'nA2']))
      expect(state.edges.some((e) => e.source === 'nA1' && e.target === 'nA2')).toBe(true)
      await loadDialogue('{"dialogue":"B"}')
      state = useGraphStore.getState()
      expect(state.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['nB1', 'nB2']))
      expect(state.nodes.some((n) => n.id === 'nA1' || n.id === 'nA2')).toBe(false)
      expect(state.edges.some((e) => e.source === 'nB1' && e.target === 'nB2')).toBe(true)
      expect(state.edges.some((e) => e.source === 'nA1')).toBe(false)
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
          type: 'dialogueNode',
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

    it('should fallback to a frontend choice connection when target_choice_index is set but API omits suggested_connections', async () => {
      const { addNode, generateFromNode } = useGraphStore.getState()

      const parentNode: Node = {
        id: 'parent-fallback-choice',
        type: 'dialogueNode',
        position: { x: 50, y: 80 },
        data: {
          speaker: 'PNJ',
          line: 'Parent',
          choices: [
            { text: 'Choix 1', choiceId: 'choice-a', targetNode: null },
            { text: 'Choix 2', choiceId: 'choice-b', targetNode: null },
          ],
        },
      }
      addNode(parentNode)

      const graphAPI = await import('../api/graph')
      const mockGenerateNode = vi.mocked(graphAPI.generateNode)
      mockGenerateNode.mockResolvedValueOnce({
        node: {
          id: 'generated-fallback-choice',
          type: 'dialogueNode',
          speaker: 'PNJ',
          line: 'Réponse fallback',
        },
        suggested_connections: [],
        parent_node_id: 'parent-fallback-choice',
      })

      await generateFromNode('parent-fallback-choice', 'Instructions', {
        target_choice_index: 1,
      })

      const state = useGraphStore.getState()
      const updatedParent = state.nodes.find((n) => n.id === 'parent-fallback-choice')
      const generatedNode = state.nodes.find((n) => n.id === 'generated-fallback-choice')
      const fallbackEdge = state.edges.find((e) => e.target === 'generated-fallback-choice')

      expect(generatedNode).toBeDefined()
      expect(updatedParent?.data?.choices?.[1]?.targetNode).toBe('generated-fallback-choice')
      expect(fallbackEdge?.source).toBe('parent-fallback-choice')
      expect((fallbackEdge?.data as { choiceIndex?: number } | undefined)?.choiceIndex).toBe(1)
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
          type: 'dialogueNode',
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

    it('should ignore ambiguous choice suggestions and still connect the generated node through the targeted branch', async () => {
      const { addNode, generateFromNode } = useGraphStore.getState()

      const parentNode: Node = {
        id: 'parent-ambiguous-choice',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          speaker: 'PNJ',
          line: 'Test',
          choices: [{ text: 'Choix 1', choiceId: 'choice-0', targetNode: null }],
        },
      }
      addNode(parentNode)

      const graphAPI = await import('../api/graph')
      const mockGenerateNode = vi.mocked(graphAPI.generateNode)
      mockGenerateNode.mockResolvedValueOnce({
        node: {
          id: 'generated-ambiguous-choice',
          type: 'dialogueNode',
          speaker: 'PNJ',
          line: 'Réponse',
        },
        suggested_connections: [
          {
            from: 'parent-ambiguous-choice',
            to: 'generated-ambiguous-choice',
            connection_type: 'choice',
          },
        ],
        parent_node_id: 'parent-ambiguous-choice',
      })

      await generateFromNode('parent-ambiguous-choice', 'Instructions', {
        target_choice_index: 0,
      })

      const state = useGraphStore.getState()
      const updatedParent = state.nodes.find((n) => n.id === 'parent-ambiguous-choice')
      const edgesToGenerated = state.edges.filter((e) => e.target === 'generated-ambiguous-choice')

      expect(updatedParent?.data?.choices?.[0]?.targetNode).toBe('generated-ambiguous-choice')
      expect(edgesToGenerated).toHaveLength(1)
      expect((edgesToGenerated[0].data as { choiceIndex?: number }).choiceIndex).toBe(0)
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
          type: 'dialogueNode',
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
          type: 'dialogueNode',
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
      
      // Vérifier positionnement : en dessous du parent, centré (un seul nœud)
      const state = useGraphStore.getState()
      const generatedNode = state.nodes.find((n) => n.id === 'generated-1')
      expect(generatedNode?.position.x).toBe(100) // parent.x + 0 (centré)
      expect(generatedNode!.position.y).toBeGreaterThanOrEqual(380)
    })

    it('should space multiple generated siblings by GRAPH_SIBLING_COLUMN_STEP', async () => {
      const { addNode, generateFromNode } = useGraphStore.getState()

      const parentNode: Node = {
        id: 'parent-5',
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
        nodes: [
          { id: 'gen-a', type: 'dialogueNode', speaker: 'PNJ', line: 'A' },
          { id: 'gen-b', type: 'dialogueNode', speaker: 'PNJ', line: 'B' },
        ],
        suggested_connections: [
          {
            from: 'parent-5',
            to: 'gen-a',
            via_choice_index: 0,
            connection_type: 'choice',
          },
          {
            from: 'parent-5',
            to: 'gen-b',
            via_choice_index: 1,
            connection_type: 'choice',
          },
        ],
        parent_node_id: 'parent-5',
      })

      await generateFromNode('parent-5', 'Instructions', {
        generate_all_choices: true,
      })

      const state = useGraphStore.getState()
      const a = state.nodes.find((n) => n.id === 'gen-a')
      const b = state.nodes.find((n) => n.id === 'gen-b')
      expect(a).toBeDefined()
      expect(b).toBeDefined()
      expect(b!.position.x - a!.position.x).toBeGreaterThanOrEqual(
        GRAPH_SIBLING_COLUMN_STEP
      )
      expect(a!.position.y).toBeGreaterThanOrEqual(380)
      expect(b!.position.y).toBeGreaterThanOrEqual(380)
    })

    it('should relayout a branched parent to avoid sibling overlap after multiple generations', async () => {
      const { addNode, generateFromNode } = useGraphStore.getState()

      const parentNode: Node = {
        id: 'parent-relayout',
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
      mockGenerateNode
        .mockResolvedValueOnce({
          node: {
            id: 'generated-left',
            type: 'dialogueNode',
            speaker: 'PNJ',
            line: 'Réponse gauche',
          },
          suggested_connections: [
            {
              from: 'parent-relayout',
              to: 'generated-left',
              via_choice_index: 0,
              connection_type: 'choice',
            },
          ],
          parent_node_id: 'parent-relayout',
        })
        .mockResolvedValueOnce({
          node: {
            id: 'generated-right',
            type: 'dialogueNode',
            speaker: 'PNJ',
            line: 'Réponse droite',
          },
          suggested_connections: [
            {
              from: 'parent-relayout',
              to: 'generated-right',
              via_choice_index: 1,
              connection_type: 'choice',
            },
          ],
          parent_node_id: 'parent-relayout',
        })

      await generateFromNode('parent-relayout', 'Instructions', {
        target_choice_index: 0,
      })
      await generateFromNode('parent-relayout', 'Instructions', {
        target_choice_index: 1,
      })

      const state = useGraphStore.getState()
      const left = state.nodes.find((n) => n.id === 'generated-left')
      const right = state.nodes.find((n) => n.id === 'generated-right')
      const parent = state.nodes.find((n) => n.id === 'parent-relayout')

      expect(parent?.position).toEqual(parentNode.position)
      expect(left).toBeDefined()
      expect(right).toBeDefined()
      expect(Math.abs((right!.position.x ?? 0) - (left!.position.x ?? 0))).toBeGreaterThanOrEqual(380)
      expect(left!.position.y).toBeGreaterThan(parentNode.position.y)
      expect(right!.position.y).toBeGreaterThan(parentNode.position.y)
    })

    it('should place a choice-specific generated node in the target branch column', async () => {
      const { addNode, generateFromNode } = useGraphStore.getState()

      const parentNode: Node = {
        id: 'parent-branch',
        type: 'dialogueNode',
        position: { x: 100, y: 100 },
        data: {
          speaker: 'PNJ',
          line: 'Test',
          choices: [
            { text: 'Choix 1', targetNode: null },
            { text: 'Choix 2', targetNode: null },
            { text: 'Choix 3', targetNode: null },
          ],
        },
      }
      addNode(parentNode)

      const graphAPI = await import('../api/graph')
      const mockGenerateNode = vi.mocked(graphAPI.generateNode)
      mockGenerateNode.mockResolvedValueOnce({
        node: {
          id: 'generated-branch',
          type: 'dialogueNode',
          speaker: 'PNJ',
          line: 'Réponse ciblée',
        },
        suggested_connections: [
          {
            from: 'parent-branch',
            to: 'generated-branch',
            via_choice_index: 1,
            connection_type: 'choice',
          },
        ],
        parent_node_id: 'parent-branch',
      })

      await generateFromNode('parent-branch', 'Instructions', {
        target_choice_index: 1,
      })

      const state = useGraphStore.getState()
      const generatedNode = state.nodes.find((n) => n.id === 'generated-branch')
      expect(generatedNode).toBeDefined()
      expect(generatedNode!.position.x).toBe(
        childNodeTopLeftX({
          parentX: parentNode.position.x,
          parentWidth: GRAPH_DIALOGUE_NODE_WIDTH,
          childWidth: GRAPH_DIALOGUE_NODE_WIDTH,
          siblingIndex: 1,
          siblingCount: 3,
        })
      )
      expect(generatedNode!.position.y).toBe(
        childNodeTopLeftY({
          parentY: parentNode.position.y,
          parentHeight: getLayoutNodeHeight(parentNode),
        })
      )
      const updatedParent = state.nodes.find((n) => n.id === 'parent-branch')
      expect(updatedParent?.data?.choices?.[1]?.targetNode).toBe('generated-branch')
    })

    it('should place a single generated child below a tall parent without overlap', async () => {
      const { addNode, generateFromNode } = useGraphStore.getState()

      const parentNode = {
        id: 'parent-tall',
        type: 'dialogueNode',
        position: { x: 100, y: 100 },
        measured: { width: GRAPH_DIALOGUE_NODE_WIDTH, height: 420 },
        width: GRAPH_DIALOGUE_NODE_WIDTH,
        height: 420,
        data: {
          speaker: 'PNJ',
          title: 'Parent très long',
          line: 'Texte long '.repeat(20),
          status: 'pending',
          choices: [{ text: 'Choix 1', choiceId: 'choice-tall', targetNode: null }],
        },
      } as Node & { measured: { width: number; height: number } }
      addNode(parentNode)

      const graphAPI = await import('../api/graph')
      const mockGenerateNode = vi.mocked(graphAPI.generateNode)
      mockGenerateNode.mockResolvedValueOnce({
        node: {
          id: 'generated-tall-child',
          type: 'dialogueNode',
          speaker: 'PNJ',
          line: 'Réponse',
        },
        suggested_connections: [],
        parent_node_id: 'parent-tall',
      })

      await generateFromNode('parent-tall', 'Instructions', {
        target_choice_index: 0,
      })

      const state = useGraphStore.getState()
      const generatedNode = state.nodes.find((n) => n.id === 'generated-tall-child')
      expect(generatedNode).toBeDefined()
      expect(generatedNode!.position.y).toBe(
        childNodeTopLeftY({
          parentY: parentNode.position.y,
          parentHeight: getLayoutNodeHeight(parentNode),
        })
      )
      expect(generatedNode!.position.y).toBeGreaterThan(parentNode.position.y + parentNode.height!)
    })

    it('should set parent choice test*Node fields when generating from TestNode (4 results)', async () => {
      const { addNode, generateFromNode } = useGraphStore.getState()
      const startNode: Node = {
        id: 'START',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'START',
          speaker: 'PNJ',
          line: 'Hello',
          choices: [{ text: 'Tenter', test: 'Raison+Diplomatie:8' }],
        },
      }
      addNode(startNode)
      const testNode: Node = {
        id: 'test-node-START-choice-0',
        type: 'testNode',
        position: { x: 0, y: 280 },
        data: { id: 'test-node-START-choice-0', test: 'Raison+Diplomatie:8', line: 'Tenter' },
      }
      addNode(testNode)
      const graphAPI = await import('../api/graph')
      const mockGenerateNode = vi.mocked(graphAPI.generateNode)
      mockGenerateNode.mockResolvedValueOnce({
        nodes: [
          { id: 'NODE_CF', type: 'dialogueNode', speaker: 'PNJ', line: 'Échec critique' },
          { id: 'NODE_F', type: 'dialogueNode', speaker: 'PNJ', line: 'Échec' },
          { id: 'NODE_S', type: 'dialogueNode', speaker: 'PNJ', line: 'Réussite' },
          { id: 'NODE_CS', type: 'dialogueNode', speaker: 'PNJ', line: 'Réussite critique' },
        ],
        suggested_connections: [
          { from: 'test-node-START-choice-0', to: 'NODE_CF', connection_type: 'test-critical-failure' },
          { from: 'test-node-START-choice-0', to: 'NODE_F', connection_type: 'test-failure' },
          { from: 'test-node-START-choice-0', to: 'NODE_S', connection_type: 'test-success' },
          { from: 'test-node-START-choice-0', to: 'NODE_CS', connection_type: 'test-critical-success' },
        ],
        parent_node_id: 'test-node-START-choice-0',
      })
      await generateFromNode('test-node-START-choice-0', 'Instructions', {})
      const state = useGraphStore.getState()
      const start = state.nodes.find((n) => n.id === 'START')
      const choice0 = (start?.data?.choices as Array<{ testCriticalFailureNode?: string; testFailureNode?: string; testSuccessNode?: string; testCriticalSuccessNode?: string }>)?.[0]
      expect(choice0?.testCriticalFailureNode).toBe('NODE_CF')
      expect(choice0?.testFailureNode).toBe('NODE_F')
      expect(choice0?.testSuccessNode).toBe('NODE_S')
      expect(choice0?.testCriticalSuccessNode).toBe('NODE_CS')
    })
  })
})