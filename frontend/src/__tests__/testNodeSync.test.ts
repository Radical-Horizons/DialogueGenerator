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
import { normalizeTestBars } from '../utils/graphNormalizers'
import {
  GRAPH_DIALOGUE_NODE_WIDTH,
  GRAPH_TEST_NODE_COLUMN_STEP,
  GRAPH_TEST_NODE_WIDTH,
} from '../utils/graphNodeLayout'

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
    const createDialogueNode = (
      position: { x: number; y: number },
      overrides: Partial<Node> = {}
    ): Node => ({
      id: 'dialogue-1',
      type: 'dialogueNode',
      position,
      data: { id: 'dialogue-1', line: 'Short line' },
      ...overrides,
    })

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
        createDialogueNode({ x: 100, y: 200 }),
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
        createDialogueNode({ x: 100, y: 200 }),
        existingTestNode,
        existingEdges
      )

      expect(result.testNode).not.toBeNull()
      expect(result.testNode?.data.test).toBe('Force+Combat:10')
      expect(result.testNode?.data.failureNode).toBe('node-failure')
      expect(result.testNode?.position.x).toBe(140)
      expect(result.testNode?.position.y).toBeGreaterThan(200)
    })

    it('should place a new test bar below a tall parent without overlap', () => {
      const tallParent = createDialogueNode(
        { x: 100, y: 100 },
        {
          measured: { width: 280, height: 420 },
          width: 280,
          height: 420,
          data: {
            id: 'dialogue-1',
            title: 'Parent très long',
            line: 'Texte long '.repeat(20),
            choices: [],
          },
        } as Partial<Node>
      )
      const choice: Choice = {
        text: 'Investigation',
        test: 'Investigation:9',
      }

      const result = syncTestNodeFromChoice(
        choice,
        0,
        'dialogue-1',
        tallParent,
        null,
        []
      )

      expect(result.testNode).not.toBeNull()
      expect(result.testNode!.position.y).toBeGreaterThan(tallParent.position.y + 420)
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
        createDialogueNode({ x: 100, y: 200 }),
        existingTestNode,
        existingEdges
      )

      expect(result.testNode).toBeNull()
      // Toutes les edges liées au TestNode doivent être supprimées
      expect(result.edges.every((e) => !e.id.includes('test-node-dialogue-1-choice-0'))).toBe(
        true
      )
    })

    it('should create edge from dialogue node to test node with canonical id e:nodeId:choice:cid:test', () => {
      const choice: Choice = {
        text: 'Long choice text that should be truncated',
        test: 'Raison+Diplomatie:8',
      }
      const existingEdges: Edge[] = []

      const result = syncTestNodeFromChoice(
        choice,
        0,
        'dialogue-1',
        createDialogueNode({ x: 100, y: 200 }),
        null,
        existingEdges
      )

      const dialogueToTestEdge = result.edges.find(
        (e) => e.source === 'dialogue-1' && e.target === 'test-node-dialogue-1-choice-0'
      )
      expect(dialogueToTestEdge).not.toBeUndefined()
      expect(dialogueToTestEdge?.id).toBe('e:dialogue-1:choice:__idx_0:test')
      expect(dialogueToTestEdge?.source).toBe('dialogue-1')
      expect(dialogueToTestEdge?.target).toBe('test-node-dialogue-1-choice-0')
      expect(dialogueToTestEdge?.sourceHandle).toBe('choice:__idx_0')
    })

    it('should produce at most one dialogue→test edge per (source, sourceHandle, target)', () => {
      const choice: Choice = {
        text: 'One choice',
        test: 'Raison+Diplomatie:8',
      }
      const existingEdges: Edge[] = [
        {
          id: 'e:dialogue-1:choice:__idx_0:test',
          source: 'dialogue-1',
          target: 'test-node-dialogue-1-choice-0',
          sourceHandle: 'choice:__idx_0',
        },
      ]

      const result = syncTestNodeFromChoice(
        choice,
        0,
        'dialogue-1',
        createDialogueNode({ x: 100, y: 200 }),
        null,
        existingEdges
      )

      const dialogueToTest = result.edges.filter(
        (e) => e.source === 'dialogue-1' && e.target === 'test-node-dialogue-1-choice-0'
      )
      expect(dialogueToTest).toHaveLength(1)
      expect(dialogueToTest[0].id).toBe('e:dialogue-1:choice:__idx_0:test')
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
        createDialogueNode({ x: 100, y: 200 }),
        null,
        existingEdges
      )

      const dialogueToTestEdge = result.edges.find(
        (e) => e.source === 'dialogue-1' && e.target === 'test-node-dialogue-1-choice-0'
      )
      expect(dialogueToTestEdge?.label).toBe('A'.repeat(30) + '...')
    })

    it('normalizeTestBars recentre plusieurs barres de test sous le parent', () => {
      const parent: Node = {
        id: 'START',
        type: 'dialogueNode',
        position: { x: 200, y: 80 },
        data: {
          id: 'START',
          line: 'Choisissez',
          choices: [
            { text: 'A', test: 'A:8' },
            { text: 'B', test: 'B:8' },
            { text: 'C', test: 'C:8' },
            { text: 'D', test: 'D:8' },
            { text: 'E', test: 'E:8' },
          ],
        },
      }
      const stalePositions = [
        { x: 340, y: 260 },
        { x: 604, y: 260 },
        { x: 868, y: 260 },
        { x: 1132, y: 260 },
        { x: 1396, y: 260 },
      ]
      const nodes: Node[] = [
        parent,
        ...stalePositions.map((position, index) => ({
          id: `test-node-START-choice-${index}`,
          type: 'testNode' as const,
          position,
          data: { id: `test-node-START-choice-${index}`, test: `${index}:8` },
        })),
      ]
      const edges: Edge[] = stalePositions.map((_, index) => ({
        id: `e:START:choice:__idx_${index}:test`,
        source: 'START',
        target: `test-node-START-choice-${index}`,
        sourceHandle: `choice:__idx_${index}`,
      }))

      const { nodes: normalized } = normalizeTestBars(nodes, edges)
      const testNodes = normalized
        .filter((node) => node.type === 'testNode')
        .sort((left, right) => left.position.x - right.position.x)

      expect(testNodes).toHaveLength(5)
      const parentCenterX = parent.position.x + GRAPH_DIALOGUE_NODE_WIDTH / 2
      const firstCenter = testNodes[0].position.x + GRAPH_TEST_NODE_WIDTH / 2
      const lastCenter =
        testNodes[4].position.x + GRAPH_TEST_NODE_WIDTH / 2
      const rowCenter = (firstCenter + lastCenter) / 2
      expect(rowCenter).toBeCloseTo(parentCenterX, 1)
      expect(testNodes[1].position.x - testNodes[0].position.x).toBe(
        GRAPH_TEST_NODE_COLUMN_STEP,
      )
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

    it('should keep existing choice test*Node when test node carries empty strings (flush formulaire)', () => {
      const testNode: Node = {
        id: 'test-node-dialogue-1-choice-0',
        type: 'testNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'test-node-dialogue-1-choice-0',
          test: 'Dex:10',
          criticalFailureNode: '',
          failureNode: '',
          successNode: '',
          criticalSuccessNode: '',
        },
      }
      const existingChoice: Choice & {
        testCriticalFailureNode?: string
        testFailureNode?: string
        testSuccessNode?: string
        testCriticalSuccessNode?: string
      } = {
        text: 'Roll',
        test: 'Dex:10',
        testCriticalFailureNode: 'NODE_CF',
        testFailureNode: 'NODE_F',
        testSuccessNode: 'NODE_S',
        testCriticalSuccessNode: 'NODE_CS',
      }

      const result = syncChoiceFromTestNode(testNode, 'dialogue-1', 0, existingChoice)

      expect(result.testCriticalFailureNode).toBe('NODE_CF')
      expect(result.testFailureNode).toBe('NODE_F')
      expect(result.testSuccessNode).toBe('NODE_S')
      expect(result.testCriticalSuccessNode).toBe('NODE_CS')
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
