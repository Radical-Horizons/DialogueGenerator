/**
 * Module utilitaire pour la synchronisation TestNode ↔ Choix Parent.
 * 
 * Architecture SOLID :
 * - Single Responsibility : Gère uniquement la synchronisation TestNode ↔ choix
 * - Source of Truth : Le choix parent est la source de vérité (JSON Unity)
 * - TestNode : Vue dérivée (artefact de visualisation ReactFlow)
 * 
 * Principe : Toute modification d'un TestNode doit être répercutée sur le choix parent,
 * et toute modification d'un choix avec test doit être répercutée sur le TestNode.
 */
import type { Node, Edge } from 'reactflow'
import type { Choice } from '../schemas/nodeEditorSchema'
import type { TestNodeParentInfo, TestNodeSyncResult } from '../types/testNode'
import {
  buildChoiceEdge,
  buildTestResultEdge,
  choiceToTestEdgeId,
  TEST_RESULT_EDGE_CONFIG,
} from './graphEdgeBuilders'

/**
 * Mapping handle TestNode → champ choice.
 */
export const TEST_HANDLE_TO_CHOICE_FIELD: Record<string, string> = {
  'critical-failure': 'testCriticalFailureNode',
  'failure': 'testFailureNode',
  'success': 'testSuccessNode',
  'critical-success': 'testCriticalSuccessNode',
} as const

/**
 * Mapping champ choice → handle TestNode.
 */
export const CHOICE_FIELD_TO_HANDLE: Record<string, string> = {
  'testCriticalFailureNode': 'critical-failure',
  'testFailureNode': 'failure',
  'testSuccessNode': 'success',
  'testCriticalSuccessNode': 'critical-success',
} as const

/**
 * Parse l'ID d'un TestNode pour extraire dialogueNodeId et choiceIndex.
 * Formats supportés (ADR-008) :
 * - test:choiceId (stable) → nécessite nodes pour résoudre le parent
 * - test-node-{dialogueNodeId}-choice-{choiceIndex} (legacy)
 *
 * @param testNodeId - ID du TestNode à parser
 * @param nodes - Liste des nodes (requise si testNodeId est test:choiceId)
 * @returns Objet avec dialogueNodeId et choiceIndex, ou null si format invalide
 */
export function parseTestNodeId(
  testNodeId: string,
  nodes: Node[] = []
): {
  dialogueNodeId: string
  choiceIndex: number
} | null {
  if (testNodeId.startsWith('test:')) {
    const choiceId = testNodeId.slice(5)
    for (const node of nodes) {
      if (node.type !== 'dialogueNode' || !node.data?.choices) continue
      const choices = node.data.choices as Choice[]
      const choiceIndex = choices.findIndex(
        (c) => (c as Choice & { choiceId?: string }).choiceId === choiceId
      )
      if (choiceIndex >= 0) {
        return { dialogueNodeId: node.id, choiceIndex }
      }
      const fallback = choices.findIndex((_, i) => `__idx_${i}` === choiceId)
      if (fallback >= 0) return { dialogueNodeId: node.id, choiceIndex: fallback }
    }
    return null
  }

  if (!testNodeId.startsWith('test-node-')) {
    return null
  }

  const withoutPrefix = testNodeId.replace('test-node-', '')
  const parts = withoutPrefix.split('-choice-')
  if (parts.length !== 2) {
    return null
  }

  const dialogueNodeId = parts[0]
  const choiceIndex = parseInt(parts[1], 10)

  if (isNaN(choiceIndex) || choiceIndex < 0) {
    return null
  }

  return { dialogueNodeId, choiceIndex }
}

/**
 * Trouve le choix parent d'un TestNode.
 * 
 * @param testNodeId - ID du TestNode
 * @param nodes - Liste de tous les nodes du graphe
 * @returns Informations sur le choix parent, ou null si non trouvé
 */
export function getParentChoiceForTestNode(
  testNodeId: string,
  nodes: Node[]
): TestNodeParentInfo | null {
  const parsed = parseTestNodeId(testNodeId, nodes)
  if (!parsed) {
    return null
  }

  const { dialogueNodeId, choiceIndex } = parsed

  // Trouver le DialogueNode parent
  const dialogueNode = nodes.find((n) => n.id === dialogueNodeId && n.type === 'dialogueNode')
  if (!dialogueNode) {
    return null
  }

  // Extraire les choix
  const choices = (dialogueNode.data?.choices as Choice[] | undefined) || []
  if (choiceIndex < 0 || choiceIndex >= choices.length) {
    return null
  }

  const choice = choices[choiceIndex]

  return {
    dialogueNodeId,
    choiceIndex,
    dialogueNode,
    choice,
  }
}

/**
 * Synchronise le TestNode depuis le choix parent (choice → testNode).
 * 
 * Crée, met à jour ou supprime le TestNode selon la présence du champ `test` dans le choix.
 * 
 * @param choice - Choix parent (Source of Truth)
 * @param choiceIndex - Index du choix dans le DialogueNode
 * @param dialogueNodeId - ID du DialogueNode parent
 * @param dialogueNodePosition - Position du DialogueNode (pour positionner le TestNode)
 * @param existingTestNode - TestNode existant (null si à créer)
 * @param existingEdges - Liste des edges existants
 * @param nodes - Liste de tous les nodes (pour vérifier existence des nœuds cibles, optionnel)
 * @returns TestNode synchronisé (ou null si pas de test) et edges mis à jour
 */
export function syncTestNodeFromChoice(
  choice: Choice,
  choiceIndex: number,
  dialogueNodeId: string,
  dialogueNodePosition: { x: number; y: number },
  existingTestNode: Node | null,
  existingEdges: Edge[],
  nodes: Node[] = []
): TestNodeSyncResult {
  const choiceId = (choice as Choice & { choiceId?: string }).choiceId
  const testNodeId = choiceId ? `test:${choiceId}` : `test-node-${dialogueNodeId}-choice-${choiceIndex}`

  // Si le choix n'a pas de test, supprimer le TestNode s'il existe
  if (!choice.test) {
    if (existingTestNode) {
      const filteredEdges = existingEdges.filter(
        (e) => e.source !== testNodeId && e.target !== testNodeId
      )
      return { testNode: null, edges: filteredEdges }
    }
    return { testNode: null, edges: existingEdges }
  }

  // Le choix a un test : créer ou mettre à jour le TestNode
  const testNodePosition = existingTestNode?.position || {
    x: dialogueNodePosition.x + 300,
    y: dialogueNodePosition.y - 150 + (choiceIndex * 200),
  }

  const testNode: Node = {
    id: testNodeId,
    type: 'testNode',
    position: testNodePosition,
    data: {
      id: testNodeId,
      test: choice.test,
      line: choice.text || '',
      criticalFailureNode: choice.testCriticalFailureNode,
      failureNode: choice.testFailureNode,
      successNode: choice.testSuccessNode,
      criticalSuccessNode: choice.testCriticalSuccessNode,
    },
  }

  const edges = [...existingEdges]
  const dialogueToTestEdgeId = choiceId
    ? `e:${dialogueNodeId}:choice:${choiceId}:test`
    : choiceToTestEdgeId(dialogueNodeId, choiceIndex)
  const choiceEdge = buildChoiceEdge({
    sourceId: dialogueNodeId,
    targetId: testNodeId,
    choiceIndex,
    choiceText: choice.text,
    choiceId: choiceId ?? undefined,
    edgeId: dialogueToTestEdgeId,
  })
  const existingDialogueToTestEdgeIndex = edges.findIndex((e) => e.id === dialogueToTestEdgeId)
  if (existingDialogueToTestEdgeIndex === -1) {
    edges.push(choiceEdge)
  } else if (edges[existingDialogueToTestEdgeIndex].label !== choiceEdge.label) {
    edges[existingDialogueToTestEdgeIndex] = {
      ...edges[existingDialogueToTestEdgeIndex],
      label: choiceEdge.label,
    }
  }

  // Edges TestNode → nœuds de résultat
  const resultEdges = syncTestNodeResultEdges(testNodeId, choice, nodes, edges)

  return { testNode, edges: resultEdges }
}

/**
 * Synchronise le choix parent depuis le TestNode (testNode → choice).
 * 
 * @param testNode - TestNode modifié
 * @param dialogueNodeId - ID du DialogueNode parent
 * @param choiceIndex - Index du choix dans le DialogueNode
 * @param existingChoice - Choix existant à mettre à jour
 * @returns Choix mis à jour avec les données du TestNode
 */
export function syncChoiceFromTestNode(
  testNode: Node,
  dialogueNodeId: string,
  choiceIndex: number,
  existingChoice: Choice
): Choice {
  const testNodeData = testNode.data as {
    test?: string
    line?: string
    criticalFailureNode?: string
    failureNode?: string
    successNode?: string
    criticalSuccessNode?: string
    [key: string]: unknown
  }

  return {
    ...existingChoice,
    test: testNodeData.test || undefined,
    // Note: line du TestNode n'est pas synchronisé vers choice.text (choix.text reste inchangé)
    testCriticalFailureNode: testNodeData.criticalFailureNode || undefined,
    testFailureNode: testNodeData.failureNode || undefined,
    testSuccessNode: testNodeData.successNode || undefined,
    testCriticalSuccessNode: testNodeData.criticalSuccessNode || undefined,
  }
}

/**
 * Crée ou met à jour les edges TestNode → nœuds de résultat.
 * 
 * @param testNodeId - ID du TestNode
 * @param choice - Choix parent contenant les références test*Node
 * @param nodes - Liste de tous les nodes (pour vérifier existence)
 * @param existingEdges - Liste des edges existants
 * @returns Liste des edges mise à jour
 */
export function syncTestNodeResultEdges(
  testNodeId: string,
  choice: Choice,
  nodes: Node[],
  existingEdges: Edge[]
): Edge[] {
  const edges = [...existingEdges]

  // Pour chaque résultat de test (config centralisée dans graphEdgeBuilders)
  TEST_RESULT_EDGE_CONFIG.forEach((result) => {
    const targetNodeId = choice[result.field] as string | undefined

    if (targetNodeId) {
      // Vérifier que le nœud cible existe (si nodes fourni)
      if (nodes.length > 0) {
        const targetNodeExists = nodes.some((n) => n.id === targetNodeId)
        if (!targetNodeExists) {
          return // Skip si nœud n'existe pas
        }
      }

      // Vérifier si l'edge existe déjà
      const existingEdge = edges.find(
        (e) =>
          e.source === testNodeId &&
          e.target === targetNodeId &&
          e.sourceHandle === result.handleId
      )

      if (!existingEdge) {
        edges.push(
          buildTestResultEdge(
            testNodeId,
            targetNodeId,
            result.handleId,
            result.label,
            result.color
          )
        )
      }
    } else {
      // Supprimer l'edge si le champ test*Node n'existe plus
      const edgeToRemove = edges.find(
        (e) => e.source === testNodeId && e.sourceHandle === result.handleId
      )
      if (edgeToRemove) {
        const index = edges.indexOf(edgeToRemove)
        edges.splice(index, 1)
      }
    }
  })

  return edges
}
