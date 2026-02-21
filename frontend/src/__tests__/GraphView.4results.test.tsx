/**
 * Tests pour GraphView avec 4 résultats de test.
 */
import { describe, it, expect } from 'vitest'
import { unityJsonToGraph } from '../components/generation/GraphView'

describe('GraphView - 4 résultats de test', () => {
  it('devrait créer un TestNode automatiquement quand un choix contient un test', () => {
    // GIVEN: JSON Unity avec un DialogueNode contenant un choix avec test
    const unityJson = JSON.stringify([
      {
        id: 'START',
        speaker: 'PNJ',
        line: 'Bonjour',
        choices: [
          {
            text: 'Tenter de convaincre',
            test: 'Raison+Diplomatie:8',
            testCriticalFailureNode: 'NODE_CRITICAL_FAILURE',
            testFailureNode: 'NODE_FAILURE',
            testSuccessNode: 'NODE_SUCCESS',
            testCriticalSuccessNode: 'NODE_CRITICAL_SUCCESS',
          },
        ],
      },
      {
        id: 'NODE_CRITICAL_FAILURE',
        speaker: 'PNJ',
        line: 'Réponse échec critique',
      },
      {
        id: 'NODE_FAILURE',
        speaker: 'PNJ',
        line: 'Réponse échec',
      },
      {
        id: 'NODE_SUCCESS',
        speaker: 'PNJ',
        line: 'Réponse réussite',
      },
      {
        id: 'NODE_CRITICAL_SUCCESS',
        speaker: 'PNJ',
        line: 'Réponse réussite critique',
      },
    ])

    // WHEN: Conversion en graphe ReactFlow
    const { nodes } = unityJsonToGraph(unityJson)

    // THEN: Un TestNode doit être créé automatiquement
    const testNode = nodes.find((n) => n.type === 'testNode')
    expect(testNode).toBeDefined()
    expect(testNode?.id).toMatch(/test-node-.*/) // ID généré automatiquement
    expect(testNode?.data.test).toBe('Raison+Diplomatie:8')
  })

  it('devrait créer 4 edges pour les 4 résultats de test', () => {
    // GIVEN: JSON Unity avec un DialogueNode contenant un choix avec test et 4 nœuds de résultat
    const unityJson = JSON.stringify([
      {
        id: 'START',
        speaker: 'PNJ',
        line: 'Bonjour',
        choices: [
          {
            text: 'Tenter de convaincre',
            test: 'Raison+Diplomatie:8',
            testCriticalFailureNode: 'NODE_CRITICAL_FAILURE',
            testFailureNode: 'NODE_FAILURE',
            testSuccessNode: 'NODE_SUCCESS',
            testCriticalSuccessNode: 'NODE_CRITICAL_SUCCESS',
          },
        ],
      },
      {
        id: 'NODE_CRITICAL_FAILURE',
        speaker: 'PNJ',
        line: 'Réponse échec critique',
      },
      {
        id: 'NODE_FAILURE',
        speaker: 'PNJ',
        line: 'Réponse échec',
      },
      {
        id: 'NODE_SUCCESS',
        speaker: 'PNJ',
        line: 'Réponse réussite',
      },
      {
        id: 'NODE_CRITICAL_SUCCESS',
        speaker: 'PNJ',
        line: 'Réponse réussite critique',
      },
    ])

    // WHEN: Conversion en graphe ReactFlow
    const { nodes, edges } = unityJsonToGraph(unityJson)

    // THEN: 4 edges doivent être créés depuis le TestNode vers les 4 nœuds de résultat
    const testNode = nodes.find((n) => n.type === 'testNode')
    expect(testNode).toBeDefined()

    const testNodeEdges = edges.filter((e) => e.source === testNode?.id)
    expect(testNodeEdges.length).toBe(4)

    // Vérifier que les 4 edges pointent vers les bons nœuds
    const edgeTargets = testNodeEdges.map((e) => e.target).sort()
    expect(edgeTargets).toContain('NODE_CRITICAL_FAILURE')
    expect(edgeTargets).toContain('NODE_FAILURE')
    expect(edgeTargets).toContain('NODE_SUCCESS')
    expect(edgeTargets).toContain('NODE_CRITICAL_SUCCESS')

    // Vérifier les labels et couleurs
    const criticalFailureEdge = testNodeEdges.find((e) => e.target === 'NODE_CRITICAL_FAILURE')
    expect(criticalFailureEdge?.label).toBe('Échec critique')
    expect(criticalFailureEdge?.style?.stroke).toBe('#C0392B')

    const failureEdge = testNodeEdges.find((e) => e.target === 'NODE_FAILURE')
    expect(failureEdge?.label).toBe('Échec')
    expect(failureEdge?.style?.stroke).toBe('#E74C3C')

    const successEdge = testNodeEdges.find((e) => e.target === 'NODE_SUCCESS')
    expect(successEdge?.label).toBe('Réussite')
    expect(successEdge?.style?.stroke).toBe('#27AE60')

    const criticalSuccessEdge = testNodeEdges.find((e) => e.target === 'NODE_CRITICAL_SUCCESS')
    expect(criticalSuccessEdge?.label).toBe('Réussite critique')
    expect(criticalSuccessEdge?.style?.stroke).toBe('#229954')
  })

  it('devrait créer un TestNode même si les 4 nœuds de résultat ne sont pas encore générés', () => {
    // GIVEN: JSON Unity avec un DialogueNode contenant un choix avec test mais sans nœuds de résultat
    const unityJson = JSON.stringify([
      {
        id: 'START',
        speaker: 'PNJ',
        line: 'Bonjour',
        choices: [
          {
            text: 'Tenter de convaincre',
            test: 'Raison+Diplomatie:8',
            // Pas de testCriticalFailureNode, testFailureNode, etc. (pas encore générés)
          },
        ],
      },
    ])

    // WHEN: Conversion en graphe ReactFlow
    const { nodes, edges } = unityJsonToGraph(unityJson)

    // THEN: Un TestNode doit quand même être créé (avec 4 handles, même sans connexions)
    const testNode = nodes.find((n) => n.type === 'testNode')
    expect(testNode).toBeDefined()
    expect(testNode?.data.test).toBe('Raison+Diplomatie:8')

    // Pas d'edges car les nœuds cibles n'existent pas encore
    const testNodeEdges = edges.filter((e) => e.source === testNode?.id)
    expect(testNodeEdges.length).toBe(0)
  })

  it('devrait créer un edge depuis le DialogueNode vers le TestNode via le choix', () => {
    // GIVEN: JSON Unity avec un DialogueNode contenant un choix avec test
    const unityJson = JSON.stringify([
      {
        id: 'START',
        speaker: 'PNJ',
        line: 'Bonjour',
        choices: [
          {
            text: 'Tenter de convaincre',
            test: 'Raison+Diplomatie:8',
            testCriticalFailureNode: 'NODE_CRITICAL_FAILURE',
            testFailureNode: 'NODE_FAILURE',
            testSuccessNode: 'NODE_SUCCESS',
            testCriticalSuccessNode: 'NODE_CRITICAL_SUCCESS',
          },
        ],
      },
      {
        id: 'NODE_CRITICAL_FAILURE',
        speaker: 'PNJ',
        line: 'Réponse échec critique',
      },
      {
        id: 'NODE_FAILURE',
        speaker: 'PNJ',
        line: 'Réponse échec',
      },
      {
        id: 'NODE_SUCCESS',
        speaker: 'PNJ',
        line: 'Réponse réussite',
      },
      {
        id: 'NODE_CRITICAL_SUCCESS',
        speaker: 'PNJ',
        line: 'Réponse réussite critique',
      },
    ])

    // WHEN: Conversion en graphe ReactFlow
    const { nodes, edges } = unityJsonToGraph(unityJson)

    // THEN: Un edge doit être créé depuis START (via le handle du choix) vers le TestNode
    const testNode = nodes.find((n) => n.type === 'testNode')
    expect(testNode).toBeDefined()

    const choiceToTestEdge = edges.find(
      (e) => e.source === 'START' && e.target === testNode?.id && e.sourceHandle?.startsWith('choice:')
    )
    expect(choiceToTestEdge).toBeDefined()
    expect(choiceToTestEdge?.sourceHandle).toBe('choice:__idx_0')
  })
})
