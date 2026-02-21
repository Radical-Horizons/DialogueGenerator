/**
 * Tests d'intégration pour useGraphStore - Synchronisation TestNode ↔ Choix Parent
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphStore } from '../store/graphStore'
import type { Node } from 'reactflow'
import type { Choice } from '../schemas/nodeEditorSchema'

// Mock graphAPI
vi.mock('../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

describe('useGraphStore - TestNode Synchronization', () => {
  beforeEach(() => {
    // Reset store avant chaque test
    useGraphStore.getState().resetGraph()
  })

  describe('updateNode - TestNode modification', () => {
    it('should update parent choice when TestNode is modified', () => {
      const { addNode, updateNode } = useGraphStore.getState()

      // Créer un DialogueNode avec un choix ayant un test
      const dialogueNode: Node = {
        id: 'dialogue-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'dialogue-1',
          choices: [
            {
              text: 'Test choice',
              test: 'Raison+Diplomatie:8',
              testSuccessNode: 'node-success',
            },
          ],
        },
      }
      addNode(dialogueNode)

      // Le TestNode sera créé automatiquement par updateNode
      // Simuler la création en appelant updateNode sur le DialogueNode
      updateNode('dialogue-1', {
        data: dialogueNode.data,
      })

      // Vérifier que le TestNode existe
      let state = useGraphStore.getState()
      const testNode = state.nodes.find((n) => n.id === 'test-node-dialogue-1-choice-0')
      expect(testNode).toBeDefined()

      // Modifier le TestNode
      updateNode('test-node-dialogue-1-choice-0', {
        data: {
          ...testNode!.data,
          test: 'Force+Combat:10',
          failureNode: 'node-failure',
        },
      })

      // Vérifier que le choix parent a été mis à jour
      state = useGraphStore.getState()
      const updatedDialogueNode = state.nodes.find((n) => n.id === 'dialogue-1')
      const updatedChoice = (updatedDialogueNode?.data.choices as Choice[])?.[0]

      expect(updatedChoice?.test).toBe('Force+Combat:10')
      expect(updatedChoice?.testFailureNode).toBe('node-failure')
    })

    it('should remove test from parent choice when TestNode test is removed', () => {
      const { addNode, updateNode } = useGraphStore.getState()

      // Créer un DialogueNode avec un choix ayant un test
      const dialogueNode: Node = {
        id: 'dialogue-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'dialogue-1',
          choices: [
            {
              text: 'Test choice',
              test: 'Raison+Diplomatie:8',
            },
          ],
        },
      }
      addNode(dialogueNode)

      // Créer le TestNode
      updateNode('dialogue-1', {
        data: dialogueNode.data,
      })

      let state = useGraphStore.getState()
      const testNode = state.nodes.find((n) => n.id === 'test-node-dialogue-1-choice-0')
      expect(testNode).toBeDefined()

      // Supprimer le test du TestNode
      updateNode('test-node-dialogue-1-choice-0', {
        data: {
          ...testNode!.data,
          test: undefined,
        },
      })

      // Vérifier que le test a été supprimé du choix parent
      state = useGraphStore.getState()
      const updatedDialogueNode = state.nodes.find((n) => n.id === 'dialogue-1')
      const updatedChoice = (updatedDialogueNode?.data.choices as Choice[])?.[0]

      expect(updatedChoice?.test).toBeUndefined()
      // Le TestNode doit être supprimé automatiquement
      const remainingTestNode = state.nodes.find((n) => n.id === 'test-node-dialogue-1-choice-0')
      expect(remainingTestNode).toBeUndefined()
    })
  })

  describe('deleteNode - TestNode deletion', () => {
    it('should remove test from parent choice when TestNode is deleted', () => {
      const { addNode, deleteNode } = useGraphStore.getState()

      // Créer un DialogueNode avec un choix ayant un test
      const dialogueNode: Node = {
        id: 'dialogue-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'dialogue-1',
          choices: [
            {
              text: 'Test choice',
              test: 'Raison+Diplomatie:8',
              testSuccessNode: 'node-success',
              testFailureNode: 'node-failure',
            },
          ],
        },
      }
      addNode(dialogueNode)

      // Créer le TestNode automatiquement
      useGraphStore.getState().updateNode('dialogue-1', {
        data: dialogueNode.data,
      })

      let state = useGraphStore.getState()
      const testNode = state.nodes.find((n) => n.id === 'test-node-dialogue-1-choice-0')
      expect(testNode).toBeDefined()

      // Supprimer le TestNode
      deleteNode('test-node-dialogue-1-choice-0')

      // Vérifier que le test a été supprimé du choix parent
      state = useGraphStore.getState()
      const updatedDialogueNode = state.nodes.find((n) => n.id === 'dialogue-1')
      const updatedChoice = (updatedDialogueNode?.data.choices as Choice[])?.[0]

      expect(updatedChoice?.test).toBeUndefined()
      expect(updatedChoice?.testSuccessNode).toBeUndefined()
      expect(updatedChoice?.testFailureNode).toBeUndefined()
    })

    it('should not delete parent DialogueNode when TestNode is deleted', () => {
      const { addNode, deleteNode } = useGraphStore.getState()

      const dialogueNode: Node = {
        id: 'dialogue-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'dialogue-1',
          choices: [
            {
              text: 'Test choice',
              test: 'Raison+Diplomatie:8',
            },
          ],
        },
      }
      addNode(dialogueNode)

      // Créer le TestNode
      useGraphStore.getState().updateNode('dialogue-1', {
        data: dialogueNode.data,
      })

      // Supprimer le TestNode
      deleteNode('test-node-dialogue-1-choice-0')

      // Vérifier que le DialogueNode parent existe toujours
      const state = useGraphStore.getState()
      const remainingDialogueNode = state.nodes.find((n) => n.id === 'dialogue-1')
      expect(remainingDialogueNode).toBeDefined()
    })
  })

  describe('connectNodes - TestNode connection', () => {
    it('should update parent choice when connecting from TestNode', () => {
      const { addNode, connectNodes } = useGraphStore.getState()

      // Créer un DialogueNode avec un choix ayant un test
      const dialogueNode: Node = {
        id: 'dialogue-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'dialogue-1',
          choices: [
            {
              text: 'Test choice',
              test: 'Raison+Diplomatie:8',
            },
          ],
        },
      }
      addNode(dialogueNode)

      // Créer le TestNode
      useGraphStore.getState().updateNode('dialogue-1', {
        data: dialogueNode.data,
      })

      // Créer un nœud cible
      const targetNode: Node = {
        id: 'node-success',
        type: 'dialogueNode',
        position: { x: 500, y: 0 },
        data: { id: 'node-success' },
      }
      addNode(targetNode)

      // Connecter depuis le TestNode (handle success)
      connectNodes('test-node-dialogue-1-choice-0', 'node-success', undefined, 'test-success', 'success')

      // Vérifier que le choix parent a été mis à jour
      const state = useGraphStore.getState()
      const updatedDialogueNode = state.nodes.find((n) => n.id === 'dialogue-1')
      const updatedChoice = (updatedDialogueNode?.data.choices as Choice[])?.[0]

      expect(updatedChoice?.testSuccessNode).toBe('node-success')
    })

    it('should update all 4 test result fields when connecting from TestNode', () => {
      const { addNode, connectNodes } = useGraphStore.getState()

      const dialogueNode: Node = {
        id: 'dialogue-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'dialogue-1',
          choices: [
            {
              text: 'Test choice',
              test: 'Raison+Diplomatie:8',
            },
          ],
        },
      }
      addNode(dialogueNode)
      useGraphStore.getState().updateNode('dialogue-1', {
        data: dialogueNode.data,
      })

      const nodes = [
        { id: 'node-crit-fail', type: 'dialogueNode' as const, position: { x: 0, y: 0 }, data: {} },
        { id: 'node-fail', type: 'dialogueNode' as const, position: { x: 0, y: 0 }, data: {} },
        { id: 'node-success', type: 'dialogueNode' as const, position: { x: 0, y: 0 }, data: {} },
        { id: 'node-crit-success', type: 'dialogueNode' as const, position: { x: 0, y: 0 }, data: {} },
      ]
      nodes.forEach((node) => addNode(node))

      // Connecter les 4 résultats
      connectNodes('test-node-dialogue-1-choice-0', 'node-crit-fail', undefined, 'test-critical-failure', 'critical-failure')
      connectNodes('test-node-dialogue-1-choice-0', 'node-fail', undefined, 'test-failure', 'failure')
      connectNodes('test-node-dialogue-1-choice-0', 'node-success', undefined, 'test-success', 'success')
      connectNodes('test-node-dialogue-1-choice-0', 'node-crit-success', undefined, 'test-critical-success', 'critical-success')

      // Vérifier que tous les champs ont été mis à jour dans le choix parent
      const state = useGraphStore.getState()
      const updatedDialogueNode = state.nodes.find((n) => n.id === 'dialogue-1')
      const updatedChoice = (updatedDialogueNode?.data.choices as Choice[])?.[0]

      expect(updatedChoice?.testCriticalFailureNode).toBe('node-crit-fail')
      expect(updatedChoice?.testFailureNode).toBe('node-fail')
      expect(updatedChoice?.testSuccessNode).toBe('node-success')
      expect(updatedChoice?.testCriticalSuccessNode).toBe('node-crit-success')
    })
  })

  describe('disconnectNodes - TestNode disconnection', () => {
    it('should update parent choice when disconnecting from TestNode', () => {
      const { addNode, connectNodes, disconnectNodes } = useGraphStore.getState()

      // Créer un DialogueNode avec un choix ayant un test et une connexion
      const dialogueNode: Node = {
        id: 'dialogue-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'dialogue-1',
          choices: [
            {
              text: 'Test choice',
              test: 'Raison+Diplomatie:8',
              testSuccessNode: 'node-success',
            },
          ],
        },
      }
      addNode(dialogueNode)
      useGraphStore.getState().updateNode('dialogue-1', {
        data: dialogueNode.data,
      })

      const targetNode: Node = {
        id: 'node-success',
        type: 'dialogueNode',
        position: { x: 500, y: 0 },
        data: { id: 'node-success' },
      }
      addNode(targetNode)

      // Créer la connexion d'abord
      connectNodes('test-node-dialogue-1-choice-0', 'node-success', undefined, 'test-success', 'success')

      // Trouver l'edge créé
      let state = useGraphStore.getState()
      const edge = state.edges.find(
        (e) =>
          e.source === 'test-node-dialogue-1-choice-0' &&
          e.target === 'node-success' &&
          e.sourceHandle === 'success'
      )
      expect(edge).toBeDefined()

      // Déconnecter
      if (edge) {
        disconnectNodes(edge.id)
      }

      // Vérifier que le champ testSuccessNode a été supprimé du choix parent
      state = useGraphStore.getState()
      const updatedDialogueNode = state.nodes.find((n) => n.id === 'dialogue-1')
      const updatedChoice = (updatedDialogueNode?.data.choices as Choice[])?.[0]

      expect(updatedChoice?.testSuccessNode).toBeUndefined()
    })
  })

  describe('targetNode cleanup', () => {
    it('should not allow targetNode to point to a TestBar', () => {
      const { addNode, connectNodes } = useGraphStore.getState()

      // Créer un DialogueNode avec un choix
      const dialogueNode: Node = {
        id: 'dialogue-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'dialogue-1',
          choices: [
            {
              text: 'Test choice',
              targetNode: 'END',
            },
          ],
        },
      }
      addNode(dialogueNode)

      // Créer un TestBar (simulé)
      const testBar: Node = {
        id: 'test-node-dialogue-1-choice-0',
        type: 'testNode',
        position: { x: 300, y: 0 },
        data: {
          id: 'test-node-dialogue-1-choice-0',
          test: 'Raison+Diplomatie:8',
        },
      }
      addNode(testBar)

      // Essayer de connecter le choix vers le TestBar
      connectNodes('dialogue-1', 'test-node-dialogue-1-choice-0', 0)

      // Vérifier que targetNode n'a pas été mis à jour vers le TestBar
      const state = useGraphStore.getState()
      const updatedDialogueNode = state.nodes.find((n) => n.id === 'dialogue-1')
      const updatedChoice = (updatedDialogueNode?.data.choices as Choice[])?.[0]

      expect(updatedChoice?.targetNode).not.toBe('test-node-dialogue-1-choice-0')
      // targetNode devrait rester 'END' ou être undefined, mais pas pointer vers le TestBar
    })

    it('should remove targetNode when a test is added to a choice', () => {
      const { addNode, updateNode } = useGraphStore.getState()

      // Créer un DialogueNode avec un choix ayant un targetNode
      const dialogueNode: Node = {
        id: 'dialogue-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'dialogue-1',
          choices: [
            {
              text: 'Test choice',
              targetNode: 'NODE_TARGET',
            },
          ],
        },
      }
      addNode(dialogueNode)

      // Ajouter un test au choix
      updateNode('dialogue-1', {
        data: {
          choices: [
            {
              text: 'Test choice',
              targetNode: 'NODE_TARGET',
              test: 'Raison+Diplomatie:8',
            },
          ],
        },
      })

      // Vérifier que targetNode a été supprimé
      const state = useGraphStore.getState()
      const updatedDialogueNode = state.nodes.find((n) => n.id === 'dialogue-1')
      const updatedChoice = (updatedDialogueNode?.data.choices as Choice[])?.[0]

      expect(updatedChoice?.test).toBe('Raison+Diplomatie:8')
      expect(updatedChoice?.targetNode).toBeUndefined()
    })

    it('should not set targetNode when connecting a choice with test', () => {
      const { addNode, connectNodes } = useGraphStore.getState()

      // Créer un DialogueNode avec un choix ayant un test
      const dialogueNode: Node = {
        id: 'dialogue-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'dialogue-1',
          choices: [
            {
              text: 'Test choice',
              test: 'Raison+Diplomatie:8',
            },
          ],
        },
      }
      addNode(dialogueNode)

      // Créer un nœud cible
      const targetNode: Node = {
        id: 'NODE_TARGET',
        type: 'dialogueNode',
        position: { x: 300, y: 0 },
        data: {
          id: 'NODE_TARGET',
        },
      }
      addNode(targetNode)

      // Essayer de connecter le choix (avec test) vers le nœud cible
      connectNodes('dialogue-1', 'NODE_TARGET', 0)

      // Vérifier que targetNode n'a pas été mis à jour (car le choix a un test)
      const state = useGraphStore.getState()
      const updatedDialogueNode = state.nodes.find((n) => n.id === 'dialogue-1')
      const updatedChoice = (updatedDialogueNode?.data.choices as Choice[])?.[0]

      expect(updatedChoice?.test).toBe('Raison+Diplomatie:8')
      expect(updatedChoice?.targetNode).toBeUndefined()
    })
  })

  describe('Anti-recursion', () => {
    it('should not create infinite loop when updating TestNode that updates choice that updates TestNode', () => {
      const { addNode, updateNode } = useGraphStore.getState()

      const dialogueNode: Node = {
        id: 'dialogue-1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'dialogue-1',
          choices: [
            {
              text: 'Test choice',
              test: 'Raison+Diplomatie:8',
            },
          ],
        },
      }
      addNode(dialogueNode)

      // Créer le TestNode
      updateNode('dialogue-1', {
        data: dialogueNode.data,
      })

      // Modifier le TestNode plusieurs fois (ne doit pas créer de boucle)
      const testNodeId = 'test-node-dialogue-1-choice-0'
      updateNode(testNodeId, {
        data: {
          test: 'Force+Combat:10',
        },
      })

      updateNode(testNodeId, {
        data: {
          test: 'Raison+Architecture:12',
        },
      })

      // Vérifier que le système est stable
      const state = useGraphStore.getState()
      const updatedDialogueNode = state.nodes.find((n) => n.id === 'dialogue-1')
      const updatedChoice = (updatedDialogueNode?.data.choices as Choice[])?.[0]

      expect(updatedChoice?.test).toBe('Raison+Architecture:12')
    })
  })
})
