/**
 * Slice edges du store graphe : connectNodes, disconnectNodes.
 */
import type { StateCreator } from 'zustand'
import type { Edge } from 'reactflow'
import type { GraphState } from '../types/graphState'
import type { Choice } from '../../schemas/nodeEditorSchema'
import {
  getParentChoiceForTestNode,
  syncTestNodeFromChoice,
  TEST_HANDLE_TO_CHOICE_FIELD,
} from '../../utils/testNodeSync'
import {
  buildChoiceEdge,
  edgeStrokeFromSource,
  stableChoiceEdgeId,
  truncateChoiceLabel,
} from '../../utils/graphEdgeBuilders'
import { runGraphTransaction } from '../utils/runGraphTransaction'

export type EdgeSlice = Pick<
  GraphState,
  'connectNodes' | 'disconnectNodes' | 'updateChoiceEdgeLabel' | 'normalizeEdgeColors'
>

export const createEdgeSlice: StateCreator<GraphState, [], [], EdgeSlice> = (set, get) => ({
  connectNodes: (
    sourceId: string,
    targetId: string,
    choiceIndex?: number,
    connectionType: string = 'default',
    sourceHandle?: string
  ) => {
    let actualSourceHandle = sourceHandle
    if (!actualSourceHandle && connectionType.startsWith('test-')) {
      actualSourceHandle = connectionType.replace('test-', '')
    }
    if (!actualSourceHandle && ['critical-failure', 'failure', 'success', 'critical-success'].includes(connectionType)) {
      actualSourceHandle = connectionType
    }

    const isChoiceConnection = choiceIndex !== undefined && !actualSourceHandle
    if (connectionType === 'choice' && !isChoiceConnection && !actualSourceHandle) {
      console.warn('[Graph] Ignoring ambiguous choice connection without choiceIndex', {
        sourceId,
        targetId,
      })
      return
    }

    const preState = get()
    const sourceNodeForChoice = isChoiceConnection
      ? preState.nodes.find((n) => n.id === sourceId)
      : null
    const choiceAt = sourceNodeForChoice?.data?.choices?.[
      choiceIndex != null ? choiceIndex : 0
    ] as (Choice & { choiceId?: string }) | undefined
    const choiceText = choiceAt?.text
    const choiceId = choiceAt?.choiceId
    const choiceStableId = choiceId ?? (choiceIndex !== undefined ? `__idx_${choiceIndex}` : 'unknown')

    const edgeId = isChoiceConnection
      ? stableChoiceEdgeId(sourceId, choiceStableId)
      : actualSourceHandle
      ? `${sourceId}-${actualSourceHandle}-${targetId}`
      : choiceIndex !== undefined
      ? `${sourceId}-choice${choiceIndex}->${targetId}`
      : `${sourceId}->${targetId}`

    const existingEdgeIndex = preState.edges.findIndex((e) => e.id === edgeId)
    if (existingEdgeIndex !== -1 && !isChoiceConnection) {
      return
    }

    runGraphTransaction(get, set, (state) => {
      const strokeColor = edgeStrokeFromSource({
        sourceHandle: actualSourceHandle,
        connectionType,
      })
      const newEdge: Edge = isChoiceConnection
        ? buildChoiceEdge({
            sourceId,
            targetId,
            choiceIndex: choiceIndex!,
            choiceText,
            choiceId,
          })
        : {
            id: edgeId,
            source: sourceId,
            target: targetId,
            ...(actualSourceHandle && { sourceHandle: actualSourceHandle }),
            type: 'smoothstep',
            ...(strokeColor && { style: { stroke: strokeColor } }),
            data: { edgeType: connectionType, choiceIndex },
          }

      let newEdges: Edge[] =
        isChoiceConnection && existingEdgeIndex !== -1
          ? [...state.edges.filter((e) => e.id !== edgeId), newEdge]
          : [...state.edges, newEdge]

      let updatedNodes = [...state.nodes]
      const sourceNodeIndex = updatedNodes.findIndex((n) => n.id === sourceId)

      if (sourceNodeIndex !== -1) {
        const sourceNode = updatedNodes[sourceNodeIndex]

        if (
          actualSourceHandle &&
          ['critical-failure', 'failure', 'success', 'critical-success'].includes(actualSourceHandle)
        ) {
          const parent = getParentChoiceForTestNode(sourceId, state.nodes)
          if (parent && TEST_HANDLE_TO_CHOICE_FIELD[actualSourceHandle]) {
            const fieldName = TEST_HANDLE_TO_CHOICE_FIELD[actualSourceHandle]
            const updatedChoices = (parent.dialogueNode.data.choices as Choice[]).map(
              (choice, idx) =>
                idx === parent.choiceIndex ? { ...choice, [fieldName]: targetId } : choice
            )
            const updatedDialogueNode = {
              ...parent.dialogueNode,
              data: { ...parent.dialogueNode.data, choices: updatedChoices },
            }
            updatedNodes = updatedNodes.map((n) =>
              n.id === parent.dialogueNodeId ? updatedDialogueNode : n
            )

            const updatedChoice = updatedChoices[parent.choiceIndex]
            const syncResult = syncTestNodeFromChoice(
              updatedChoice,
              parent.choiceIndex,
              parent.dialogueNodeId,
              updatedDialogueNode.position,
              sourceNode,
              newEdges,
              updatedNodes,
              updatedChoices
            )

            if (syncResult.testNode) {
              updatedNodes = updatedNodes.map((n) =>
                n.id === sourceId ? syncResult.testNode! : n
              )
            }
            newEdges = syncResult.edges
          } else {
            const fieldMapping: Record<string, string> = {
              'critical-failure': 'criticalFailureNode',
              failure: 'failureNode',
              success: 'successNode',
              'critical-success': 'criticalSuccessNode',
            }
            const fieldName = fieldMapping[actualSourceHandle]
            if (fieldName) {
              updatedNodes[sourceNodeIndex] = {
                ...sourceNode,
                data: { ...sourceNode.data, [fieldName]: targetId },
              }
            }
          }
        } else if (choiceIndex !== undefined) {
          if (sourceNode.data?.choices && sourceNode.data.choices[choiceIndex]) {
            const choice = sourceNode.data.choices[choiceIndex] as Choice
            const isTargetTestBar = targetId.startsWith('test-node-')
            const choiceHasTest = !!choice.test

            if (!isTargetTestBar && !choiceHasTest) {
              const newChoices = (sourceNode.data.choices as Choice[]).map((c, idx) =>
                idx === choiceIndex ? { ...c, targetNode: targetId } : c
              )
              updatedNodes[sourceNodeIndex] = {
                ...sourceNode,
                data: { ...sourceNode.data, choices: newChoices },
              }
            }
          }
        } else if (connectionType === 'nextNode') {
          updatedNodes[sourceNodeIndex] = {
            ...sourceNode,
            data: { ...sourceNode.data, nextNode: targetId },
          }
        }
      }

      return {
        nodes: updatedNodes,
        edges: newEdges,
        dialogueMetadata: {
          ...state.dialogueMetadata,
          node_count: updatedNodes.length,
          edge_count: newEdges.length,
        },
      }
    })
  },

  disconnectNodes: (edgeId: string, skipMarkDirty?: boolean) => {
    const preState = get()
    const edge = preState.edges.find((e) => e.id === edgeId)
    if (!edge) return

    runGraphTransaction(get, set, (state) => {
      if (
        edge.sourceHandle &&
        (edge.source.startsWith('test-node-') || edge.source.startsWith('test:'))
      ) {
        const parent = getParentChoiceForTestNode(edge.source, state.nodes)
        if (parent && TEST_HANDLE_TO_CHOICE_FIELD[edge.sourceHandle]) {
          const fieldName = TEST_HANDLE_TO_CHOICE_FIELD[edge.sourceHandle]
          const updatedChoices = (parent.dialogueNode.data.choices as Choice[]).map(
            (choice, idx) => {
              if (idx === parent.choiceIndex) {
                const choiceWithIndex = choice as Choice & Record<string, unknown>
                const { [fieldName]: _removed, ...rest } = choiceWithIndex
                void _removed
                return rest as Choice
              }
              return choice
            }
          )

          const updatedDialogueNode = {
            ...parent.dialogueNode,
            data: { ...parent.dialogueNode.data, choices: updatedChoices },
          }
          let updatedNodes = state.nodes.map((n) =>
            n.id === parent.dialogueNodeId ? updatedDialogueNode : n
          )
          const newEdges = state.edges.filter((e) => e.id !== edgeId)

          const updatedChoice = updatedChoices[parent.choiceIndex]
          if (!updatedChoice) return {}

          const testNode = updatedNodes.find((n) => n.id === edge.source)
          const syncResult = syncTestNodeFromChoice(
            updatedChoice,
            parent.choiceIndex,
            parent.dialogueNodeId,
            updatedDialogueNode.position,
            testNode || null,
            newEdges,
            updatedNodes,
            updatedChoices
          )

          if (syncResult.testNode) {
            updatedNodes = updatedNodes.map((n) =>
              n.id === edge.source ? syncResult.testNode! : n
            )
          }

          return {
            nodes: updatedNodes,
            edges: syncResult.edges,
            dialogueMetadata: {
              ...state.dialogueMetadata,
              node_count: updatedNodes.length,
              edge_count: syncResult.edges.length,
            },
          }
        }
      }

      const newEdges = state.edges.filter((e) => e.id !== edgeId)
      let updatedNodes = state.nodes
      if (
        (edge.data as { edgeType?: string })?.edgeType === 'choice' &&
        typeof (edge.data as { choiceIndex?: number })?.choiceIndex === 'number'
      ) {
        const sourceId = edge.source
        const choiceIndex = (edge.data as { choiceIndex?: number }).choiceIndex!
        const sourceIdx = state.nodes.findIndex((n) => n.id === sourceId)
        if (sourceIdx !== -1) {
          const sourceNode = state.nodes[sourceIdx]
          const choices = (sourceNode.data?.choices ?? []) as Choice[]
          if (choiceIndex < choices.length) {
            const updatedChoices = choices.map((c, i) =>
              i === choiceIndex ? { ...c, targetNode: undefined } as Choice : c
            )
            updatedNodes = state.nodes.map((n) =>
              n.id === sourceId ? { ...n, data: { ...n.data, choices: updatedChoices } } : n
            )
          }
        }
      }

      if (edge?.label === 'Suivant' && edge.source) {
        updatedNodes = updatedNodes.map((n) =>
          n.id === edge.source
            ? { ...n, data: { ...n.data, nextNode: '' } }
            : n
        )
      }

      return {
        nodes: updatedNodes,
        edges: newEdges,
        dialogueMetadata: {
          ...state.dialogueMetadata,
          node_count: updatedNodes.length,
          edge_count: newEdges.length,
        },
      }
    }, { skipMarkDirty: !!skipMarkDirty })
  },

  updateChoiceEdgeLabel: (edgeId: string, newText: string) => {
    const preState = get()
    const edge = preState.edges.find((e) => e.id === edgeId)
    if (!edge || (edge.data as { edgeType?: string })?.edgeType !== 'choice') return
    const sourceId = edge.source
    const choiceIndex = (edge.data as { choiceIndex?: number })?.choiceIndex
    if (choiceIndex == null) return
    const sourceNodeIndex = preState.nodes.findIndex((n) => n.id === sourceId)
    if (sourceNodeIndex === -1) return
    const sourceNode = preState.nodes[sourceNodeIndex]
    const choices = (sourceNode.data?.choices ?? []) as Choice[]
    if (choiceIndex >= choices.length) return

    runGraphTransaction(get, set, (state) => {
      const updatedChoices = choices.map((c, i) =>
        i === choiceIndex ? { ...c, text: newText } : c
      )
      const updatedNodes = state.nodes.map((n) =>
        n.id === sourceId
          ? { ...n, data: { ...n.data, choices: updatedChoices } }
          : n
      )
      const displayLabel = truncateChoiceLabel(newText, choiceIndex)
      const updatedEdges = state.edges.map((e) =>
        e.id === edgeId ? { ...e, label: displayLabel } : e
      )
      return {
        nodes: updatedNodes,
        edges: updatedEdges,
        dialogueMetadata: {
          ...state.dialogueMetadata,
          node_count: updatedNodes.length,
          edge_count: updatedEdges.length,
        },
      }
    })
  },

  normalizeEdgeColors: () => {
    const state = get()
    let changed = false
    const normalizedEdges = state.edges.map((edge) => {
      const derivedStroke = edgeStrokeFromSource({
        sourceHandle: edge.sourceHandle,
        connectionType: (edge.data as { edgeType?: string } | undefined)?.edgeType,
        edgeLabel: typeof edge.label === 'string' ? edge.label : undefined,
      })
      if (!derivedStroke) return edge
      const currentStroke = edge.style?.stroke
      if (currentStroke === derivedStroke) return edge
      changed = true
      return {
        ...edge,
        style: {
          ...edge.style,
          stroke: derivedStroke,
        },
      }
    })
    if (!changed) return false
    runGraphTransaction(
      get,
      set,
      (s) => ({
        edges: normalizedEdges,
        dialogueMetadata: {
          ...s.dialogueMetadata,
          edge_count: normalizedEdges.length,
        },
      }),
      { skipUndo: true }
    )
    return true
  },
})
