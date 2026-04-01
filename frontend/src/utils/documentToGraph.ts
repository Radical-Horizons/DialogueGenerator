/**
 * Projection document canonique + layout → nodes/edges React Flow.
 * Story 16.4 Task 2.1 : IDs stables ADR-008 (node.id, choice:choiceId, edge e:...).
 * TestNode id : toujours test-node-{nodeId}-choice-{index} pour unicité (évite collision entre nœuds parents quand choiceId = __idx_N).
 */
import type { Node, Edge } from 'reactflow'
import {
  CHOICE_EDGE_COLOR,
  NEXT_EDGE_COLOR,
  stableChoiceEdgeId,
  truncateChoiceLabel,
} from './graphEdgeBuilders'
import { TEST_RESULT_EDGE_CONFIG } from './graphEdgeBuilders'
import {
  childNodeTopLeftX,
  GRAPH_DIALOGUE_NODE_WIDTH,
  GRAPH_OFFSET_PARENT_TO_CHILD_Y,
  GRAPH_TEST_NODE_WIDTH,
} from './graphNodeLayout'

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
  if (unityNode.id === 'END') return 'endNode'
  return 'dialogueNode'
}

/**
 * Projection : document (v1.1.0 ou tableau legacy) + layout → { nodes, edges }.
 * Règle : si un choice a un test, il a FORCÉMENT un TestNode — le TestNode est la représentation
 * graphique de l'information du test (barre + 4 handles). On ne crée le TestNode qu'à partir de
 * choice.test ; la réapparition après suppression est gérée côté sauvegarde (graphToDocument).
 */
export function documentToGraph(
  document: UnityDocument | Record<string, unknown> | UnityNode[],
  layout: LayoutPositions | null | undefined
): { nodes: Node[]; edges: Edge[] } {
  const nodesArray: UnityNode[] = Array.isArray(document)
    ? document
    : ((document as UnityDocument | Record<string, unknown>)?.nodes as UnityNode[]) ?? []
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
    const testedChoiceIndices = choices
      .map((c, idx) => (c.test ? idx : -1))
      .filter((idx) => idx >= 0)
    for (let choiceIndex = 0; choiceIndex < choices.length; choiceIndex++) {
      const choice = choices[choiceIndex]
      const cid = choiceStableId(choice, choiceIndex)
      const legacyTestNodeId = `test-node-${nodeId}-choice-${choiceIndex}`
      const sourceHandle = `choice:${cid}`
      if (choice.test) {
        const testNodeId = legacyTestNodeId
        const storedTestPosition =
          layoutPositions?.nodes?.[legacyTestNodeId] ??
          (layoutPositions?.nodes?.[`test:${cid}`] ?? undefined)
        const rank = testedChoiceIndices.indexOf(choiceIndex)
        const testPosition =
          storedTestPosition &&
          typeof storedTestPosition.x === 'number' &&
          typeof storedTestPosition.y === 'number'
            ? { x: storedTestPosition.x, y: storedTestPosition.y }
            : {
                x: childNodeTopLeftX({
                  parentX: position.x,
                  parentWidth: GRAPH_DIALOGUE_NODE_WIDTH,
                  childWidth: GRAPH_TEST_NODE_WIDTH,
                  siblingIndex: rank >= 0 ? rank : 0,
                  siblingCount: Math.max(testedChoiceIndices.length, 1),
                }),
                y: position.y + GRAPH_OFFSET_PARENT_TO_CHILD_Y,
              }
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
          style: { stroke: CHOICE_EDGE_COLOR },
          data: { edgeType: 'choice', choiceIndex, choiceId: cid, choiceText },
        })
        for (const config of TEST_RESULT_EDGE_CONFIG) {
          const targetId = choice[config.field] as string | undefined
          if (targetId && nodesArray.some((n) => n?.id === targetId)) {
            edges.push({
              id: `${testNodeId}-${config.handleId}-${targetId}`,
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
            type: 'smoothstep',
            label,
            style: { stroke: CHOICE_EDGE_COLOR },
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
        type: 'smoothstep',
        label: 'Suivant',
        style: { stroke: NEXT_EDGE_COLOR },
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
    if (node.data?.title !== undefined) unityNode.title = node.data.title
    unityNode.nextNode = undefined
    if (Array.isArray(unityNode.choices)) {
      unityNode.choices = (unityNode.choices as Record<string, unknown>[]).map((choice, idx) => {
        const cleanChoice = { ...choice }
        delete cleanChoice.targetNode
        delete cleanChoice.testCriticalFailureNode
        delete cleanChoice.testFailureNode
        delete cleanChoice.testSuccessNode
        delete cleanChoice.testCriticalSuccessNode
        delete cleanChoice.test
        const existing = (cleanChoice.choiceId as string)?.trim()
        if (!existing) cleanChoice.choiceId = `__idx_${idx}`
        return cleanChoice
      })
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
    // Edges from TestNode: source is test-node-{dialogueId}-choice-{index}; unityNodes has no test nodes, so handle first.
    if (edge.sourceHandle && edge.source.startsWith('test-node-')) {
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
      continue
    }
    if (edge.sourceHandle && edge.source.startsWith('test:')) {
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
      continue
    }

    const sourceNode = unityNodes.find((n) => n.id === edge.source)
    if (!sourceNode) continue
    if (edge.sourceHandle?.startsWith('choice:')) {
      const choiceId = edge.sourceHandle.slice(7)
      const choiceIndex = findChoiceIndexByChoiceId(sourceNode, choiceId)
      const choices = sourceNode.choices as Record<string, unknown>[] | undefined
      if (choiceIndex >= 0 && choices?.[choiceIndex]) {
        // ADR-008 : On ne remplit targetNode que si la cible n'est pas un testNode
        // Les connexions vers les testNodes sont portées par les champs test*Node du choix
        if (!edge.target.startsWith('test:') && !edge.target.startsWith('test-node-')) {
          choices[choiceIndex].targetNode = edge.target
        }
      }
    } else if (edge.data?.edgeType === 'choice' && typeof edge.data.choiceIndex === 'number') {
      const choices = sourceNode.choices as Record<string, unknown>[] | undefined
      if (choices?.[edge.data.choiceIndex]) {
        // ADR-008 : On ne remplit targetNode que si la cible n'est pas un testNode
        if (!edge.target.startsWith('test:') && !edge.target.startsWith('test-node-')) {
          choices[edge.data.choiceIndex].targetNode = edge.target
        }
      }
    }
  }

  // Nœud dialogue sans choix : nextNode depuis arêtes « Suivant » legacy et/ou edgeType nextNode.
  // Si les deux coexistent (ex. disconnect incomplet + reconnect), la cible explicite nextNode prime.
  // Plusieurs « Suivant » seuls : l’ordre du tableau edges n’est pas canonique — tie-break via
  // node.data.nextNode (mis à jour par connectNodes / ConnectionTargetSelect).
  for (const u of unityNodes) {
    const choices = u.choices as Record<string, unknown>[] | undefined
    if (!Array.isArray(choices) || choices.length !== 0) continue
    const sourceId = u.id as string
    const sourceRf = nodes.find((n) => n.id === sourceId && n.type !== 'testNode')
    const dataNextRaw = (sourceRf?.data as { nextNode?: string } | undefined)?.nextNode
    const dataNext =
      typeof dataNextRaw === 'string' && dataNextRaw.trim() !== '' ? dataNextRaw.trim() : ''

    let nextFromNextNodeType: string | undefined
    let nextFromSuivant: string | undefined
    for (const e of edges) {
      if (e.source !== sourceId) continue
      if (e.label === 'Suivant') {
        nextFromSuivant = e.target
      }
      if ((e.data as { edgeType?: string } | undefined)?.edgeType === 'nextNode') {
        nextFromNextNodeType = e.target
      }
    }
    let resolved = nextFromNextNodeType ?? nextFromSuivant
    const linearOut = edges.filter(
      (e) =>
        e.source === sourceId &&
        (e.label === 'Suivant' ||
          (e.data as { edgeType?: string } | undefined)?.edgeType === 'nextNode')
    )
    const suivantOnly = linearOut.filter((e) => e.label === 'Suivant')
    const distinctSuivantTargets = new Set(suivantOnly.map((e) => e.target))
    if (
      !nextFromNextNodeType &&
      suivantOnly.length > 1 &&
      distinctSuivantTargets.size > 1 &&
      dataNext &&
      linearOut.some((e) => e.target === dataNext)
    ) {
      resolved = dataNext
    }
    if (resolved) {
      u.nextNode = resolved
    }
  }

  // Ne garder choice.test que si une arête relie ce choix à un TestNode (évite réapparition après suppression).
  for (const u of unityNodes) {
    const choices = u.choices as Record<string, unknown>[] | undefined
    if (!choices) continue
    const inputNode = nodes.find((n) => n.id === (u.id as string) && n.type !== 'testNode')
    for (let i = 0; i < choices.length; i++) {
      const c = choices[i] as Record<string, unknown> & { choiceId?: string }
      const choiceId = c.choiceId ?? `__idx_${i}`
      const sourceHandle = `choice:${choiceId}`
      const hasEdgeToTestNode = edges.some(
        (e) =>
          e.source === u.id &&
          (e.target.startsWith('test:') || e.target.startsWith('test-node-')) &&
          (e.sourceHandle === sourceHandle ||
            (e.data as { choiceIndex?: number })?.choiceIndex === i)
      )
      if (hasEdgeToTestNode && inputNode?.data) {
        const inputChoices = (inputNode.data as { choices?: Record<string, unknown>[] })
          .choices
        const inputChoice = inputChoices?.[i]
        const inputTest =
          inputChoice && typeof inputChoice === 'object'
            ? (inputChoice as Record<string, unknown>).test
            : undefined
        if (inputTest !== undefined) c.test = inputTest
      }
    }
  }

  return { schemaVersion: '1.1.0', nodes: unityNodes as UnityNode[] }
}
