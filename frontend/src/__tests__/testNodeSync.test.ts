/**
 * Tests unitaires pour testNodeSync.ts
 */
import { describe, it, expect } from 'vitest'
import type { Node, Edge } from 'reactflow'
import type { Choice } from '../schemas/nodeEditorSchema'
import {
  parseTestNodeId,
  getParentChoiceForTestNode,
  syncTestNodeFromChoice,
  syncChoiceFromTestNode,
  syncTestNodeResultEdges,
  TEST_HANDLE_TO_CHOICE_FIELD,
  CHOICE_FIELD_TO_HANDLE,
} from '../utils/testNodeSync'

describe('testNodeSync', () => {
  describe('parseTestNodeId', () => {
    it('should parse valid test node ID', () => {
      const result = parseTestNodeId('test-node-dialogue-123-choice-0')
      expect(result).toEqual({
        dialogueNodeId: 'dialogue-123',
        choiceIndex: 0,
      })
    })

    it('should parse test node ID with multiple dashes in dialogueNodeId', () => {
      const result = parseTestNodeId('test-node-complex-node-id-choice-2')
      expect(result).toEqual({
        dialogueNodeId: 'complex-node-id',
        choiceIndex: 2,
      })
    })

    it('should return null for invalid format (no prefix)', () => {
      const result = parseTestNodeId('dialogue-123-choice-0')
      expect(result).toBeNull()
    })

    it('should return null for invalid format (missing choice part)', () => {
      const result = parseTestNodeId('test-node-dialogue-123')
      expect(result).toBeNull()
    })

    it('should return null for invalid format (invalid choiceIndex)', () => {
      const result = parseTestNodeId('test-node-dialogue-123-choice-invalid')
      expect(result).toBeNull()
    })

    it('should return null for invalid format (negative choiceIndex)', () => {
      const result = parseTestNodeId('test-node-dialogue-123-choice--1')
      expect(result).toBeNull()
    })
  })

  describe('getParentChoiceForTestNode', () => {
    const createDialogueNode = (id: string, choices: Choice[]): Node => ({
      id,
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { id, choices },
    })

    const createTestNode = (id: string): Node => ({
      id,
      type: 'testNode',
      position: { x: 300, y: 0 },
      data: { id },
    })

    it('should find parent choice for valid test node', () => {
      const choice: Choice = {
        text: 'Test choice',
        test: 'Raison+Diplomatie:8',
      }
      const dialogueNode = createDialogueNode('dialogue-1', [choice])
      const nodes = [dialogueNode, createTestNode('test-node-dialogue-1-choice-0')]

      const result = getParentChoiceForTestNode('test-node-dialogue-1-choice-0', nodes)

      expect(result).not.toBeNull()
      expect(result?.dialogueNodeId).toBe('dialogue-1')
      expect(result?.choiceIndex).toBe(0)
      expect(result?.choice).toEqual(choice)
      expect(result?.dialogueNode).toEqual(dialogueNode)
    })

    it('should return null if dialogue node not found', () => {
      const nodes = [createTestNode('test-node-dialogue-1-choice-0')]

      const result = getParentChoiceForTestNode('test-node-dialogue-1-choice-0', nodes)

      expect(result).toBeNull()
    })

    it('should return null if choice index out of bounds', () => {
      const dialogueNode = createDialogueNode('dialogue-1', [
        { text: 'Choice 0' },
        { text: 'Choice 1' },
      ])
      const nodes = [dialogueNode]

      const result = getParentChoiceForTestNode('test-node-dialogue-1-choice-5', nodes)

      expect(result).toBeNull()
    })

    it('should return null for invalid test node ID', () => {
      const nodes = [createDialogueNode('dialogue-1', [{ text: 'Choice 0' }])]

      const result = getParentChoiceForTestNode('invalid-id', nodes)

      expect(result).toBeNull()
    })
  })

  describe('syncTestNodeFromChoice', () => {
    const dialogueNodePosition = { x: 100, y: 200 }

    it('should create test node when choice has test and no existing test node', () => {
      const choice: Choice = {
        text: 'Test choice',
        test: 'Raison+Diplomatie:8',
        testSuccessNode: 'node-success',
      }
      const existingEdges: Edge[] = []

      const result = syncTestNodeFromChoice(
        choice,
        0,
        'dialogue-1',
        dialogueNodePosition,
        null,
        existingEdges
      )

      expect(result.testNode).not.toBeNull()
      expect(result.testNode?.id).toBe('test-node-dialogue-1-choice-0')
      expect(result.testNode?.type).toBe('testNode')
      expect(result.testNode?.data.test).toBe('Raison+Diplomatie:8')
      expect(result.testNode?.data.successNode).toBe('node-success')
      expect(result.edges.length).toBeGreaterThan(0)
    })

    it('should update existing test node when choice changes', () => {
      const choice: Choice = {
        text: 'Updated choice',
        test: 'Force+Combat:10',
        testFailureNode: 'node-failure',
      }
      const existingTestNode: Node = {
        id: 'test-node-dialogue-1-choice-0',
        type: 'testNode',
        position: { x: 400, y: 300 },
        data: {
          id: 'test-node-dialogue-1-choice-0',
          test: 'Raison+Diplomatie:8',
        },
      }
      const existingEdges: Edge[] = []

      const result = syncTestNodeFromChoice(
        choice,
        0,
        'dialogue-1',
        dialogueNodePosition,
        existingTestNode,
        existingEdges
      )

      expect(result.testNode).not.toBeNull()
      expect(result.testNode?.data.test).toBe('Force+Combat:10')
      expect(result.testNode?.data.failureNode).toBe('node-failure')
      // Position préservée
      expect(result.testNode?.position).toEqual({ x: 400, y: 300 })
    })

    it('should delete test node when choice has no test', () => {
      const choice: Choice = {
        text: 'Choice without test',
      }
      const existingTestNode: Node = {
        id: 'test-node-dialogue-1-choice-0',
        type: 'testNode',
        position: { x: 400, y: 300 },
        data: { id: 'test-node-dialogue-1-choice-0', test: 'Raison+Diplomatie:8' },
      }
      const existingEdges: Edge[] = [
        {
          id: 'edge-1',
          source: 'dialogue-1',
          target: 'test-node-dialogue-1-choice-0',
        },
        {
          id: 'edge-2',
          source: 'test-node-dialogue-1-choice-0',
          target: 'node-success',
        },
      ]

      const result = syncTestNodeFromChoice(
        choice,
        0,
        'dialogue-1',
        dialogueNodePosition,
        existingTestNode,
        existingEdges
      )

      expect(result.testNode).toBeNull()
      // Toutes les edges liées au TestNode doivent être supprimées
      expect(result.edges.every((e) => !e.id.includes('test-node-dialogue-1-choice-0'))).toBe(
        true
      )
    })

    it('should create edge from dialogue node to test node', () => {
      const choice: Choice = {
        text: 'Long choice text that should be truncated',
        test: 'Raison+Diplomatie:8',
      }
      const existingEdges: Edge[] = []

      const result = syncTestNodeFromChoice(
        choice,
        0,
        'dialogue-1',
        dialogueNodePosition,
        null,
        existingEdges
      )

      const dialogueToTestEdge = result.edges.find(
        (e) => e.id === 'dialogue-1-choice-0-to-test'
      )
      expect(dialogueToTestEdge).not.toBeUndefined()
      expect(dialogueToTestEdge?.source).toBe('dialogue-1')
      expect(dialogueToTestEdge?.target).toBe('test-node-dialogue-1-choice-0')
      expect(dialogueToTestEdge?.sourceHandle).toBe('choice:__idx_0')
    })

    it('should truncate long choice text in edge label', () => {
      const choice: Choice = {
        text: 'A'.repeat(50), // 50 caractères
        test: 'Raison+Diplomatie:8',
      }
      const existingEdges: Edge[] = []

      const result = syncTestNodeFromChoice(
        choice,
        0,
        'dialogue-1',
        dialogueNodePosition,
        null,
        existingEdges
      )

      const dialogueToTestEdge = result.edges.find(
        (e) => e.id === 'dialogue-1-choice-0-to-test'
      )
      expect(dialogueToTestEdge?.label).toBe('A'.repeat(30) + '...')
    })
  })

  describe('syncChoiceFromTestNode', () => {
    it('should sync all test fields from test node to choice', () => {
      const testNode: Node = {
        id: 'test-node-dialogue-1-choice-0',
        type: 'testNode',
        position: { x: 400, y: 300 },
        data: {
          id: 'test-node-dialogue-1-choice-0',
          test: 'Force+Combat:10',
          criticalFailureNode: 'node-crit-fail',
          failureNode: 'node-fail',
          successNode: 'node-success',
          criticalSuccessNode: 'node-crit-success',
        },
      }
      const existingChoice: Choice = {
        text: 'Original choice text',
        test: 'Raison+Diplomatie:8',
      }

      const result = syncChoiceFromTestNode(testNode, 'dialogue-1', 0, existingChoice)

      expect(result.test).toBe('Force+Combat:10')
      expect(result.testCriticalFailureNode).toBe('node-crit-fail')
      expect(result.testFailureNode).toBe('node-fail')
      expect(result.testSuccessNode).toBe('node-success')
      expect(result.testCriticalSuccessNode).toBe('node-crit-success')
      // text du choix n'est pas modifié
      expect(result.text).toBe('Original choice text')
    })

    it('should preserve other choice fields', () => {
      const testNode: Node = {
        id: 'test-node-dialogue-1-choice-0',
        type: 'testNode',
        position: { x: 400, y: 300 },
        data: {
          id: 'test-node-dialogue-1-choice-0',
          test: 'Force+Combat:10',
        },
      }
      const existingChoice: Choice = {
        text: 'Original choice',
        targetNode: 'node-target',
        condition: 'FLAG_SET',
        traitRequirements: [{ trait: 'Courage', minValue: 5 }],
      }

      const result = syncChoiceFromTestNode(testNode, 'dialogue-1', 0, existingChoice)

      expect(result.test).toBe('Force+Combat:10')
      expect(result.text).toBe('Original choice')
      expect(result.targetNode).toBe('node-target')
      expect(result.condition).toBe('FLAG_SET')
      expect(result.traitRequirements).toEqual([{ trait: 'Courage', minValue: 5 }])
    })
  })

  describe('syncTestNodeResultEdges', () => {
    const testNodeId = 'test-node-dialogue-1-choice-0'

    it('should create edges for all 4 test results', () => {
      const choice: Choice = {
        text: 'Test choice',
        test: 'Raison+Diplomatie:8',
        testCriticalFailureNode: 'node-crit-fail',
        testFailureNode: 'node-fail',
        testSuccessNode: 'node-success',
        testCriticalSuccessNode: 'node-crit-success',
      }
      const nodes: Node[] = [
        { id: 'node-crit-fail', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} },
        { id: 'node-fail', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} },
        { id: 'node-success', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} },
        { id: 'node-crit-success', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} },
      ]
      const existingEdges: Edge[] = []

      const result = syncTestNodeResultEdges(testNodeId, choice, nodes, existingEdges)

      expect(result.length).toBe(4)
      expect(result.find((e) => e.sourceHandle === 'critical-failure')).not.toBeUndefined()
      expect(result.find((e) => e.sourceHandle === 'failure')).not.toBeUndefined()
      expect(result.find((e) => e.sourceHandle === 'success')).not.toBeUndefined()
      expect(result.find((e) => e.sourceHandle === 'critical-success')).not.toBeUndefined()
    })

    it('should not create edge if target node does not exist', () => {
      const choice: Choice = {
        text: 'Test choice',
        test: 'Raison+Diplomatie:8',
        testSuccessNode: 'non-existent-node',
      }
      const nodes: Node[] = [
        { id: 'other-node', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} },
      ]
      const existingEdges: Edge[] = []

      const result = syncTestNodeResultEdges(testNodeId, choice, nodes, existingEdges)

      expect(result.length).toBe(0)
    })

    it('should not create duplicate edges', () => {
      const choice: Choice = {
        text: 'Test choice',
        test: 'Raison+Diplomatie:8',
        testSuccessNode: 'node-success',
      }
      const nodes: Node[] = [
        { id: 'node-success', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} },
      ]
      const existingEdges: Edge[] = [
        {
          id: `${testNodeId}-success-node-success`,
          source: testNodeId,
          target: 'node-success',
          sourceHandle: 'success',
        },
      ]

      const result = syncTestNodeResultEdges(testNodeId, choice, nodes, existingEdges)

      // Ne doit pas créer de doublon
      const successEdges = result.filter(
        (e) => e.source === testNodeId && e.sourceHandle === 'success'
      )
      expect(successEdges.length).toBe(1)
    })

    it('should remove edge when test result field is removed', () => {
      const choice: Choice = {
        text: 'Test choice',
        test: 'Raison+Diplomatie:8',
        // Pas de testSuccessNode
      }
      const nodes: Node[] = []
      const existingEdges: Edge[] = [
        {
          id: `${testNodeId}-success-node-success`,
          source: testNodeId,
          target: 'node-success',
          sourceHandle: 'success',
        },
      ]

      const result = syncTestNodeResultEdges(testNodeId, choice, nodes, existingEdges)

      // L'edge doit être supprimé
      expect(result.find((e) => e.sourceHandle === 'success')).toBeUndefined()
    })
  })

  describe('Constants', () => {
    it('should have correct mapping TEST_HANDLE_TO_CHOICE_FIELD', () => {
      expect(TEST_HANDLE_TO_CHOICE_FIELD['critical-failure']).toBe('testCriticalFailureNode')
      expect(TEST_HANDLE_TO_CHOICE_FIELD['failure']).toBe('testFailureNode')
      expect(TEST_HANDLE_TO_CHOICE_FIELD['success']).toBe('testSuccessNode')
      expect(TEST_HANDLE_TO_CHOICE_FIELD['critical-success']).toBe('testCriticalSuccessNode')
    })

    it('should have correct mapping CHOICE_FIELD_TO_HANDLE', () => {
      expect(CHOICE_FIELD_TO_HANDLE['testCriticalFailureNode']).toBe('critical-failure')
      expect(CHOICE_FIELD_TO_HANDLE['testFailureNode']).toBe('failure')
      expect(CHOICE_FIELD_TO_HANDLE['testSuccessNode']).toBe('success')
      expect(CHOICE_FIELD_TO_HANDLE['testCriticalSuccessNode']).toBe('critical-success')
    })

    it('should have bidirectional mapping', () => {
      // Pour chaque handle, le mapping inverse doit être correct
      Object.entries(TEST_HANDLE_TO_CHOICE_FIELD).forEach(([handle, field]) => {
        expect(CHOICE_FIELD_TO_HANDLE[field]).toBe(handle)
      })
    })
  })
})
