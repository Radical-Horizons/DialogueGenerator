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
  stableChoiceEdgeId,
  truncateChoiceLabel,
} from '../../utils/graphEdgeBuilders'
import { syncDocAndLayout } from '../../utils/syncDocLayout'

export type EdgeSlice = Pick<
  GraphState,
  'connectNodes' | 'disconnectNodes' | 'updateChoiceEdgeLabel'
>

export const createEdgeSlice: StateCreator<GraphState, [], [], EdgeSlice> = (set, get) => ({
  connectNodes: (
    sourceId: string,
    targetId: string,
    choiceIndex?: number,
    connectionType: string = 'default',
    sourceHandle?: string
  ) => {
    get()._pushUndoSnapshot()
    const state = get()

    let actualSourceHandle = sourceHandle
    if (!actualSourceHandle && connectionType.startsWith('test-')) {
      actualSourceHandle = connectionType.replace('test-', '')
    }
    if (!actualSourceHandle && ['critical-failure', 'failure', 'success', 'critical-success'].includes(connectionType)) {
      actualSourceHandle = connectionType
    }

    const isChoiceConnection = choiceIndex !== undefined && !actualSourceHandle
    const sourceNodeForChoice = isChoiceConnection
      ? state.nodes.find((n) => n.id === sourceId)
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

    const existingEdgeIndex = state.edges.findIndex((e) => e.id === edgeId)
    if (existingEdgeIndex !== -1 && !isChoiceConnection) {
      return
    }

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

      // Connexion depuis un TestNode (4 résultats)
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
            updatedNodes
          )

          if (syncResult.testNode) {
            updatedNodes = updatedNodes.map((n) =>
              n.id === sourceId ? syncResult.testNode! : n
            )
          }
          newEdges = syncResult.edges
        } else {
          // Fallback : mettre à jour le champ dans le TestNode directement
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
        // Connexion via choix (DialogueNode)
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

    const isDocumentSoT = state.document != null && state.layout != null
    const docAndLayout = isDocumentSoT
      ? syncDocAndLayout(updatedNodes, newEdges, state.layout as Record<string, unknown>)
      : {}

    set({
      nodes: updatedNodes,
      edges: newEdges,
      dialogueMetadata: {
        ...state.dialogueMetadata,
        node_count: updatedNodes.length,
        edge_count: newEdges.length,
      },
      ...docAndLayout,
    })
    get().markDirty()
  },

  disconnectNodes: (edgeId: string, skipMarkDirty?: boolean) => {
    get()._pushUndoSnapshot()
    set((state) => {
      const edge = state.edges.find((e) => e.id === edgeId)
      if (!edge) return state

      // Déconnexion depuis un TestNode : mettre à jour le choix parent
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
          if (!updatedChoice) return state

          const testNode = updatedNodes.find((n) => n.id === edge.source)
          const syncResult = syncTestNodeFromChoice(
            updatedChoice,
            parent.choiceIndex,
            parent.dialogueNodeId,
            updatedDialogueNode.position,
            testNode || null,
            newEdges,
            updatedNodes
          )

          if (syncResult.testNode) {
            updatedNodes = updatedNodes.map((n) =>
              n.id === edge.source ? syncResult.testNode! : n
            )
          }

          const isDocumentSoT = state.document != null && state.layout != null
          const docAndLayout = isDocumentSoT
            ? syncDocAndLayout(
                updatedNodes,
                syncResult.edges,
                state.layout as Record<string, unknown>
              )
            : {}

          return {
            nodes: updatedNodes,
            edges: syncResult.edges,
            dialogueMetadata: {
              ...state.dialogueMetadata,
              node_count: updatedNodes.length,
              edge_count: syncResult.edges.length,
            },
            ...docAndLayout,
          }
        }
      }

      // Déconnexion standard : supprimer l'edge et pour une edge choice, nettoyer choice.targetNode (cohérence store)
      const newEdges = state.edges.filter((e) => e.id !== edgeId)
      let updatedNodes = state.nodes
      if (
        edge &&
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

      const isDocumentSoT = state.document != null && state.layout != null
      const docAndLayout = isDocumentSoT
        ? syncDocAndLayout(updatedNodes, newEdges, state.layout as Record<string, unknown>)
        : {}

      return {
        nodes: updatedNodes,
        edges: newEdges,
        dialogueMetadata: {
          ...state.dialogueMetadata,
          node_count: updatedNodes.length,
          edge_count: newEdges.length,
        },
        ...docAndLayout,
      }
    })
    if (!skipMarkDirty) get().markDirty()
  },

  updateChoiceEdgeLabel: (edgeId: string, newText: string) => {
    const state = get()
    const edge = state.edges.find((e) => e.id === edgeId)
    if (!edge || (edge.data as { edgeType?: string })?.edgeType !== 'choice') return
    const sourceId = edge.source
    const choiceIndex = (edge.data as { choiceIndex?: number })?.choiceIndex
    if (choiceIndex == null) return
    const sourceNodeIndex = state.nodes.findIndex((n) => n.id === sourceId)
    if (sourceNodeIndex === -1) return
    const sourceNode = state.nodes[sourceNodeIndex]
    const choices = (sourceNode.data?.choices ?? []) as Choice[]
    if (choiceIndex >= choices.length) return
    get()._pushUndoSnapshot()
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
    const isDocumentSoT = state.document != null && state.layout != null
    const docAndLayout = isDocumentSoT
      ? syncDocAndLayout(updatedNodes, updatedEdges, state.layout as Record<string, unknown>)
      : {}
    set({
      nodes: updatedNodes,
      edges: updatedEdges,
      dialogueMetadata: {
        ...state.dialogueMetadata,
        node_count: updatedNodes.length,
        edge_count: updatedEdges.length,
      },
      ...docAndLayout,
    })
    get().markDirty()
  },
})
