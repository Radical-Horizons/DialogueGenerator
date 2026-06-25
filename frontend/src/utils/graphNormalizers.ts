/**
 * Fonctions de normalisation pures pour le graphe de dialogues.
 * Extraites de graphStore.ts pour être testables indépendamment.
 */
import type { Node, Edge } from 'reactflow'
import type { Choice } from '../schemas/nodeEditorSchema'
import { repositionTestNodesUnderDialogue, syncTestNodeFromChoice } from './testNodeSync'

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
  const normalizedNodes: Node[] = [...nodes]
  let currentEdges = [...edges]

  // Phase 1 : Collecter tous les changements nécessaires sans muter la liste pendant le parcours
  const dialogueNodes = nodes.filter((n) => n.type === 'dialogueNode')
  const testNodesToKeep = new Map<string, Node>()
  const nodesToUpdate = new Map<string, Node>()

  dialogueNodes.forEach((node) => {
    const choices = (node.data.choices || []) as Choice[]
    const updatedChoices = [...choices]
    let dialogueNodeModified = false

    choices.forEach((choice, choiceIndex) => {
      const testBarId = `test-node-${node.id}-choice-${choiceIndex}`
      
      const existingTestBar = normalizedNodes.find((n) => n.id === testBarId)

      const syncResult = syncTestNodeFromChoice(
        choice,
        choiceIndex,
        node.id,
        node,
        existingTestBar || null,
        currentEdges,
        normalizedNodes,
        choices
      )

      if (syncResult.testNode) {
        testNodesToKeep.set(testBarId, syncResult.testNode)
      }
      currentEdges = syncResult.edges

      // Story 16.4 : Si choice.test est présent, targetNode doit être undefined (porté par les edges de test)
      if (choice.test && choice.targetNode) {
        updatedChoices[choiceIndex] = { ...choice, targetNode: undefined }
        dialogueNodeModified = true
      }
    })

    repositionTestNodesUnderDialogue(node, choices, testNodesToKeep)

    if (dialogueNodeModified) {
      nodesToUpdate.set(node.id, {
        ...node,
        data: { ...node.data, choices: updatedChoices },
      })
    }
  })

  // Phase 2 : Construire la liste finale
  // Garder uniquement les nodes originaux qui ne sont pas des testNodes (ils seront rajoutés s'ils sont dans testNodesToKeep)
  const nonTestNodes = normalizedNodes.filter((n) => n.type !== 'testNode')
  
  const finalNodes = nonTestNodes.map((n) => nodesToUpdate.get(n.id) || n)
  
  // Ajouter les testNodes nécessaires
  testNodesToKeep.forEach((testNode) => {
    finalNodes.push(testNode)
  })

  return { nodes: finalNodes, edges: currentEdges }
}

/** Compare deux versions semver simples ``major.minor.patch`` (suffixe ignoré). */
function semverTuple(version: string): [number, number, number] | null {
  const trimmed = version.trim()
  const core = trimmed.split(/[-+]/, 1)[0] ?? trimmed
  const parts = core.split('.').map((p) => parseInt(p.replace(/\D/g, ''), 10))
  if (parts.some((n) => Number.isNaN(n))) return null
  const major = parts[0] ?? 0
  const minor = parts[1] ?? 0
  const patch = parts[2] ?? 0
  return [major, minor, patch]
}

function isSchemaVersionAtLeast(documentVersion: string, target: [number, number, number]): boolean {
  const v = documentVersion.trim()
  if (v === '1.1') return target[0] === 1 && target[1] === 1
  const t = semverTuple(v)
  if (!t) return false
  for (let i = 0; i < 3; i++) {
    if (t[i] > target[i]) return true
    if (t[i] < target[i]) return false
  }
  return true
}

/**
 * Détecte les documents v1.1.x non migrés (choices sans choiceId).
 * Ces documents sont explicitement refusés par l'API documents en mode draft.
 */
export function documentRequiresChoiceIdMigration(document: Record<string, unknown>): boolean {
  const schemaVersionValue = document.schemaVersion
  const schemaVersion =
    typeof schemaVersionValue === 'string' ? schemaVersionValue.trim() : ''
  if (!isSchemaVersionAtLeast(schemaVersion, [1, 1, 0])) {
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
