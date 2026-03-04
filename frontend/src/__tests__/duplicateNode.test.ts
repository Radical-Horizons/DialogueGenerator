/**
 * Tests unitaires pour la duplication de nœuds (Story 1.7 - FR7).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useGraphStore } from '../store/graphStore'
import type { Node } from 'reactflow'

describe('graphStore - Duplicate Nodes', () => {
  beforeEach(() => {
    const store = useGraphStore.getState()
    store.resetGraph()
  })

  it('should duplicate a single node with cleaned references (AC#2 isolated, AC#3 metadata kept)', () => {
    const store = useGraphStore.getState()

    // 1. Nœud avec connexions et metadata (conditions dans les choix)
    const originalNodeId = 'node-1'
    const originalNode: Node = {
      id: originalNodeId,
      type: 'dialogueNode',
      position: { x: 100, y: 100 },
      data: {
        id: originalNodeId,
        speaker: 'Marc',
        line: 'Bonjour',
        nextNode: 'node-2',
        choices: [
          { text: 'Réponse 1', targetNode: 'node-3', test: 'Dex:12', testSuccessNode: 'suc', testFailureNode: 'fail' },
          { text: 'Réponse 2', targetNode: 'node-4' }
        ],
        test: 'Strength:10',
        testSuccessNode: 'node-success',
        testFailureNode: 'node-failure'
      }
    }

    useGraphStore.setState({ nodes: [originalNode] })

    const duplicate = store.duplicateNode(originalNodeId)

    expect(duplicate).not.toBeNull()
    const state = useGraphStore.getState()
    const dialogueNodes = state.nodes.filter((n) => n.type === 'dialogueNode')
    expect(dialogueNodes.length).toBe(2) // original + duplicate (TestNodes peuvent être créés par normalizeTestBars)

    expect(duplicate!.id).toMatch(/^manual-/)
    expect(duplicate!.id).not.toBe(originalNodeId)
    expect(duplicate!.type).toBe('dialogueNode')
    expect(duplicate!.position).toEqual({ x: 150, y: 150 }) // DUPLICATE_OFFSET_X/Y = 50

    const dupData = duplicate!.data as any
    expect(dupData.speaker).toBe('Marc')
    expect(dupData.line).toBe('Bonjour')
    expect(dupData.nextNode).toBeUndefined()
    // AC#3 : metadata (condition) au niveau nœud conservée
    expect(dupData.test).toBe('Strength:10')
    expect(dupData.testSuccessNode).toBeUndefined()
    expect(dupData.testFailureNode).toBeUndefined()

    expect(dupData.choices.length).toBe(2)
    expect(dupData.choices[0].text).toBe('Réponse 1')
    expect(dupData.choices[0].targetNode).toBeUndefined()
    expect(dupData.choices[0].test).toBe('Dex:12') // AC#3 : condition conservée
    expect(dupData.choices[0].testSuccessNode).toBeUndefined() // AC#2 : connexions supprimées
    expect(dupData.choices[0].testFailureNode).toBeUndefined()
    expect(dupData.choices[1].text).toBe('Réponse 2')
    expect(dupData.choices[1].targetNode).toBeUndefined()

    expect(state.selectedNodeId).toBe(duplicate!.id)
  })

  it('should duplicate multiple nodes with progressive offset', () => {
    const store = useGraphStore.getState()
    
    const nodes: Node[] = [
      {
        id: 'node-1',
        type: 'dialogueNode',
        position: { x: 100, y: 100 },
        data: { id: 'node-1', line: 'Node 1' }
      },
      {
        id: 'node-2',
        type: 'dialogueNode',
        position: { x: 200, y: 200 },
        data: { id: 'node-2', line: 'Node 2' }
      }
    ]
    
    useGraphStore.setState({ nodes })
    
    store.duplicateNodes(['node-1', 'node-2'])
    
    const state = useGraphStore.getState()
    expect(state.nodes.length).toBe(4)
    
    const duplicates = state.nodes.filter(n => n.id.startsWith('manual-'))
    expect(duplicates.length).toBe(2)
    
    // Vérifier les offsets progressifs (+40 par index + 1)
    const dup1 = duplicates.find(d => d.data.line === 'Node 1')
    const dup2 = duplicates.find(d => d.data.line === 'Node 2')
    
    expect(dup1!.position).toEqual({ x: 140, y: 140 }) // DUPLICATE_OFFSET_STEP * 1
    expect(dup2!.position).toEqual({ x: 280, y: 280 }) // DUPLICATE_OFFSET_STEP * 2

    // duplicateNodes sélectionne le dernier nœud dupliqué
    expect(state.selectedNodeId).toBe(dup2!.id)
  })

  it('should return null when trying to duplicate a non-existent or non-dialogue node', () => {
    const store = useGraphStore.getState()
    
    const nodes: Node[] = [
      {
        id: 'test-node',
        type: 'testNode',
        position: { x: 100, y: 100 },
        data: { id: 'test-node' }
      }
    ]
    
    useGraphStore.setState({ nodes })
    
    const result1 = store.duplicateNode('non-existent')
    expect(result1).toBeNull()
    
    const result2 = store.duplicateNode('test-node')
    expect(result2).toBeNull()
    
    expect(useGraphStore.getState().nodes.length).toBe(1)
  })
})
