/**
 * Projection document canonique + layout → nodes/edges React Flow.
 * Story 16.4 Task 2.1 : IDs stables ADR-008 (node.id, choice:choiceId, test:choiceId, edge e:...).
 */
import type { Node, Edge } from 'reactflow'
import { stableChoiceEdgeId, truncateChoiceLabel } from './graphEdgeBuilders'
import { TEST_RESULT_EDGE_CONFIG } from './graphEdgeBuilders'

/** Résout l’identité stable d’un choix (choiceId ou fallback index). */
function choiceStableId(choice: UnityChoice, choiceIndex: number): string {
  return (choice.choiceId as string) ?? `__idx_${choiceIndex}`
}

export interface UnityDocument {
  schemaVersion?: string
  nodes: UnityNode[]
}

export interface UnityNode {
  id: string
  speaker?: string
  line?: string
  nextNode?: string
  choices?: UnityChoice[]
  test?: unknown
  [key: string]: unknown
}

export interface UnityChoice {
  choiceId?: string
  text?: string
  targetNode?: string
  test?: unknown
  testCriticalFailureNode?: string
  testFailureNode?: string
  testSuccessNode?: string
  testCriticalSuccessNode?: string
  [key: string]: unknown
}

/** Layout : positions des nœuds (optionnel). */
export interface LayoutPositions {
  nodes?: Record<string, { x: number; y: number }>
  viewport?: unknown
}

function getPosition(
  nodeId: string,
  index: number,
  layout: LayoutPositions | null | undefined
): { x: number; y: number } {
  const pos = layout?.nodes?.[nodeId]
  if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
    return pos
  }
  return { x: 0, y: index * 150 }
}

function determineNodeType(unityNode: UnityNode): string {
  if (unityNode.test) return 'testNode'
  if (unityNode.id === 'END') return 'endNode'
  return 'dialogueNode'
}

/**
 * Projection : document (v1.1.0 ou tableau legacy) + layout → { nodes, edges }.
 */
export function documentToGraph(
  document: Record<string, unknown> | UnityNode[],
  layout: LayoutPositions | null | undefined
): { nodes: Node[]; edges: Edge[] } {
  const nodesArray: UnityNode[] = Array.isArray(document)
    ? document
    : (document?.nodes as UnityNode[]) ?? []
  const layoutPositions = layout ?? null

  const nodes: Node[] = []
  const edges: Edge[] = []

  for (let i = 0; i < nodesArray.length; i++) {
    const unityNode = nodesArray[i]
    const nodeId = unityNode?.id
    if (!nodeId) continue

    const nodeType = determineNodeType(unityNode)
    if (nodeType === 'testNode') continue

    const position = getPosition(nodeId, i, layoutPositions)

    nodes.push({
      id: nodeId,
      type: nodeType,
      position,
      data: { ...unityNode },
    })

    const choices = unityNode.choices ?? []
    for (let choiceIndex = 0; choiceIndex < choices.length; choiceIndex++) {
      const choice = choices[choiceIndex]
      const cid = choiceStableId(choice, choiceIndex)
      const sourceHandle = `choice:${cid}`
      if (choice.test) {
        const testNodeId = `test:${cid}`
        const testPosition = { x: position.x + 300, y: position.y + choiceIndex * 60 }
        nodes.push({
          id: testNodeId,
          type: 'testNode',
          position: testPosition,
          data: {
            id: testNodeId,
            test: choice.test,
            line: choice.text ?? '',
            criticalFailureNode: choice.testCriticalFailureNode,
            failureNode: choice.testFailureNode,
            successNode: choice.testSuccessNode,
            criticalSuccessNode: choice.testCriticalSuccessNode,
          },
        })
        const choiceText = choice.text ?? `Choix ${choiceIndex + 1}`
        const label = truncateChoiceLabel(choiceText, choiceIndex)
        edges.push({
          id: `e:${nodeId}:choice:${cid}:test`,
          source: nodeId,
          target: testNodeId,
          sourceHandle,
          type: 'smoothstep',
          label,
          data: { edgeType: 'choice', choiceIndex, choiceId: cid, choiceText },
        })
        for (const config of TEST_RESULT_EDGE_CONFIG) {
          const targetId = choice[config.field] as string | undefined
          if (targetId && nodesArray.some((n) => n?.id === targetId)) {
            edges.push({
              id: `e:test:${cid}:${config.handleId}:${targetId}`,
              source: testNodeId,
              target: targetId,
              sourceHandle: config.handleId,
              type: 'smoothstep',
              label: config.label,
              style: { stroke: config.color },
            })
          }
        }
      } else {
        const targetNode = choice.targetNode
        if (targetNode) {
          const choiceText = choice.text ?? `Choix ${choiceIndex + 1}`
          const label = truncateChoiceLabel(choiceText, choiceIndex)
          edges.push({
            id: stableChoiceEdgeId(nodeId, cid),
            source: nodeId,
            target: targetNode,
            sourceHandle,
            type: 'default',
            label,
            data: { edgeType: 'choice', choiceIndex, choiceId: cid, choiceText },
          })
        }
      }
    }

    const nextNode = unityNode.nextNode
    if (nextNode && !choices.length) {
      edges.push({
        id: `${nodeId}->${nextNode}`,
        source: nodeId,
        target: nextNode,
        type: 'default',
        label: 'Suivant',
      })
    }
  }

  return { nodes, edges }
}

/** Construit le layout (positions) à partir des nodes React Flow. */
export function buildLayoutFromNodes(nodes: Node[]): LayoutPositions {
  const positions: Record<string, { x: number; y: number }> = {}
  for (const node of nodes) {
    if (node.position && typeof node.position.x === 'number' && typeof node.position.y === 'number') {
      positions[node.id] = { x: node.position.x, y: node.position.y }
    }
  }
  return { nodes: positions }
}

/**
 * Reconstruit le document Unity (schemaVersion, nodes) à partir des nodes/edges React Flow.
 * Exclut les TestNodes ; reconstruit nextNode/choices[].targetNode et test*Node depuis les edges.
 */
export function graphToDocument(nodes: Node[], edges: Edge[]): UnityDocument {
  const unityNodes: Record<string, unknown>[] = []
  for (const node of nodes) {
    if (node.type === 'testNode') continue
    const data = (node.data ?? {}) as Record<string, unknown>
    const unityNode = { ...data, id: node.id } as Record<string, unknown>
    unityNode.nextNode = undefined
    if (Array.isArray(unityNode.choices)) {
      for (const choice of unityNode.choices as Record<string, unknown>[]) {
        delete choice.targetNode
        delete choice.testCriticalFailureNode
        delete choice.testFailureNode
        delete choice.testSuccessNode
        delete choice.testCriticalSuccessNode
      }
    }
    unityNodes.push(unityNode)
  }
  const findChoiceIndexByChoiceId = (node: Record<string, unknown>, choiceId: string): number => {
    const choices = node.choices as Record<string, unknown>[] | undefined
    if (!choices) return -1
    const idx = choices.findIndex((c) => (c.choiceId as string) === choiceId || (c as { choiceId?: string }).choiceId === choiceId)
    if (idx >= 0) return idx
    const m = /^__idx_(\d+)$/.exec(choiceId)
    return m ? parseInt(m[1], 10) : -1
  }

  for (const edge of edges) {
    const sourceNode = unityNodes.find((n) => n.id === edge.source)
    if (!sourceNode) continue
    if (edge.sourceHandle?.startsWith('choice:')) {
      const choiceId = edge.sourceHandle.slice(7)
      const choiceIndex = findChoiceIndexByChoiceId(sourceNode, choiceId)
      const choices = sourceNode.choices as Record<string, unknown>[] | undefined
      if (choiceIndex >= 0 && choices?.[choiceIndex]) {
        choices[choiceIndex].targetNode = edge.target
      }
    } else if (edge.data?.edgeType === 'choice' && typeof edge.data.choiceIndex === 'number') {
      const choices = sourceNode.choices as Record<string, unknown>[] | undefined
      if (choices?.[edge.data.choiceIndex]) {
        choices[edge.data.choiceIndex].targetNode = edge.target
      }
    } else if (edge.sourceHandle && edge.source.startsWith('test:')) {
      const choiceId = edge.source.slice(5)
      for (const u of unityNodes) {
        const choiceIndex = findChoiceIndexByChoiceId(u, choiceId)
        if (choiceIndex < 0) continue
        const choices = u.choices as Record<string, unknown>[] | undefined
        const config = TEST_RESULT_EDGE_CONFIG.find((c) => c.handleId === edge.sourceHandle)
        if (config && choices?.[choiceIndex]) {
          choices[choiceIndex][config.field] = edge.target
        }
        break
      }
    } else if (edge.sourceHandle && edge.source.startsWith('test-node-')) {
      const match = edge.source.match(/^test-node-(.+)-choice-(\d+)$/)
      if (match) {
        const [, sourceId, idxStr] = match
        const choiceIndex = parseInt(idxStr, 10)
        const sourceUnity = unityNodes.find((n) => n.id === sourceId)
        const choices = sourceUnity?.choices as Record<string, unknown>[] | undefined
        const config = TEST_RESULT_EDGE_CONFIG.find((c) => c.handleId === edge.sourceHandle)
        if (config && choices?.[choiceIndex]) {
          choices[choiceIndex][config.field] = edge.target
        }
      }
    } else if (!sourceNode.choices?.length && edge.label === 'Suivant') {
      sourceNode.nextNode = edge.target
    }
  }
  return { schemaVersion: '1.1.0', nodes: unityNodes as UnityNode[] }
}
