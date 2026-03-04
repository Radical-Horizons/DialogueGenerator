/**
 * Fonctions de normalisation pures pour le graphe de dialogues.
 * Extraites de graphStore.ts pour être testables indépendamment.
 */
import type { Node, Edge } from 'reactflow'
import type { Choice } from '../schemas/nodeEditorSchema'
import { syncTestNodeFromChoice } from './testNodeSync'

export const VALID_NODE_TYPES = ['dialogueNode', 'testNode', 'endNode'] as const

/**
 * Garantit qu'un nœud a un type valide et une position numérique.
 */
export function ensureValidNode(
  node: { id: string; type: string; position: { x: number; y: number }; data: unknown }
): Node {
  const x = typeof node.position?.x === 'number' ? node.position.x : 0
  const y = typeof node.position?.y === 'number' ? node.position.y : 0
  const type = VALID_NODE_TYPES.includes(node.type as (typeof VALID_NODE_TYPES)[number])
    ? node.type
    : 'dialogueNode'
  return {
    id: node.id,
    type,
    position: { x, y },
    data: node.data ?? {},
  }
}

/**
 * Normalise les edges chargés depuis l'API (loadGraph) ou un cache legacy :
 * sourceHandle "choice-N" → "choice:__idx_N" pour correspondre aux handles du DialogueNode (ADR-008).
 */
export function normalizeChoiceHandleInEdges(edges: Edge[], nodes: Node[]): Edge[] {
  const nodesById = new Map(nodes.map((n) => [n.id, n]))
  return edges.map((edge) => {
    const sh = edge.sourceHandle
    if (!sh || !sh.startsWith('choice-')) {
      return edge
    }
    const idx = parseInt(sh.replace('choice-', ''), 10)
    if (Number.isNaN(idx)) {
      return edge
    }
    const sourceNode = nodesById.get(edge.source)
    const choices = (sourceNode?.data as { choices?: unknown[] })?.choices ?? []
    const choice = choices[idx] as (Choice & { choiceId?: string }) | undefined
    const stableId = choice?.choiceId ?? `__idx_${idx}`
    const newSourceHandle = `choice:${stableId}`
    return {
      ...edge,
      sourceHandle: newSourceHandle,
      data: {
        ...(edge.data as object),
        choiceId: stableId,
        choiceIndex: idx,
      },
    }
  })
}

/**
 * Normalise les nodes pour garantir la synchronisation TestBar ↔ choix.
 *
 * Règle : Pour chaque DialogueNode avec choix ayant un test,
 * un TestBar doit exister. Si le choix n'a plus de test, le TestBar doit être supprimé.
 */
export function normalizeTestBars(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  let normalizedNodes = [...nodes]
  let normalizedEdges = [...edges]

  normalizedNodes.forEach((node) => {
    if (node.type === 'dialogueNode') {
      const choices = (node.data.choices || []) as Choice[]

      choices.forEach((choice, choiceIndex) => {
        const choiceId = (choice as Choice & { choiceId?: string }).choiceId
        const testBarId = choiceId
          ? `test:${choiceId}`
          : `test-node-${node.id}-choice-${choiceIndex}`
        const existingTestBar = normalizedNodes.find((n) => n.id === testBarId)

        const syncResult = syncTestNodeFromChoice(
          choice,
          choiceIndex,
          node.id,
          node.position,
          existingTestBar || null,
          normalizedEdges,
          normalizedNodes
        )

        if (syncResult.testNode) {
          const testBarIndex = normalizedNodes.findIndex((n) => n.id === testBarId)
          if (testBarIndex !== -1) {
            normalizedNodes[testBarIndex] = syncResult.testNode
          } else {
            normalizedNodes.push(syncResult.testNode)
          }
        } else {
          normalizedNodes = normalizedNodes.filter((n) => n.id !== testBarId)
        }

        normalizedEdges = syncResult.edges

        if (choice.test && choice.targetNode) {
          const nodeIndex = normalizedNodes.findIndex((n) => n.id === node.id)
          if (nodeIndex !== -1) {
            const updatedDialogueNode = normalizedNodes[nodeIndex]
            const updatedChoices = (updatedDialogueNode.data.choices as Choice[]).map((c, idx) =>
              idx === choiceIndex ? { ...c, targetNode: undefined } : c
            )
            normalizedNodes[nodeIndex] = {
              ...updatedDialogueNode,
              data: {
                ...updatedDialogueNode.data,
                choices: updatedChoices,
              },
            }
          }
        }
      })
    }
  })

  return { nodes: normalizedNodes, edges: normalizedEdges }
}

/**
 * Détecte les documents v1.1.x non migrés (choices sans choiceId).
 * Ces documents sont explicitement refusés par l'API documents en mode draft.
 */
export function documentRequiresChoiceIdMigration(document: Record<string, unknown>): boolean {
  const schemaVersionValue = document.schemaVersion
  const schemaVersion =
    typeof schemaVersionValue === 'string' ? schemaVersionValue.trim() : ''
  if (!(schemaVersion === '1.1' || schemaVersion >= '1.1.0')) {
    return false
  }
  const nodesValue = document.nodes
  if (!Array.isArray(nodesValue)) return false
  for (const node of nodesValue) {
    if (typeof node !== 'object' || node === null) continue
    const choicesValue = (node as { choices?: unknown }).choices
    if (!Array.isArray(choicesValue)) continue
    for (const choice of choicesValue) {
      if (typeof choice !== 'object' || choice === null) return true
      const choiceId = (choice as { choiceId?: unknown }).choiceId
      if (typeof choiceId !== 'string' || choiceId.trim() === '') {
        return true
      }
    }
  }
  return false
}
