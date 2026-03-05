/**
 * Slice CRUD nœuds du store graphe.
 * Gère addNode, createEmptyNode, updateNode (avec sous-fonctions TestNode/DialogueNode),
 * deleteNode, duplicateNode(s) (dédupliqués via cloneNodeData).
 */
import type { StateCreator } from 'zustand'
import type { Node } from 'reactflow'
import type { GraphState } from '../types/graphState'
import type { Choice } from '../../schemas/nodeEditorSchema'
import {
  getParentChoiceForTestNode,
  syncTestNodeFromChoice,
  syncChoiceFromTestNode,
} from '../../utils/testNodeSync'
import { truncateChoiceLabel } from '../../utils/graphEdgeBuilders'
import { normalizeTestBars } from '../../utils/graphNormalizers'
import { syncDocAndLayout } from '../../utils/syncDocLayout'
import { documentToGraph } from '../../utils/documentToGraph'

export type NodeSlice = Pick<
  GraphState,
  | 'addNode'
  | 'createEmptyNode'
  | 'updateNode'
  | 'deleteNode'
  | 'duplicateNode'
  | 'duplicateNodes'
>

// ---------------------------------------------------------------------------
// Helpers privés
// ---------------------------------------------------------------------------

/** Offsets pour la duplication (Story 1.7 - Task 1.3). */
const DUPLICATE_OFFSET_X = 50
const DUPLICATE_OFFSET_Y = 50
const DUPLICATE_OFFSET_STEP = 40

/**
 * Deep-clone les données d'un nœud en supprimant les références de connexion uniquement (AC#2 isolée, AC#3 metadata conservée).
 */
function cloneNodeData(
  originalData: Record<string, unknown>,
  newId: string
): Record<string, unknown> {
  const data = JSON.parse(JSON.stringify(originalData)) as Record<string, unknown>
  data.id = newId
  delete data.nextNode
  if (data.choices && Array.isArray(data.choices)) {
    data.choices = (data.choices as Array<Choice & { targetNode?: string; testSuccessNode?: string; testFailureNode?: string; testCriticalSuccessNode?: string; testCriticalFailureNode?: string }>).map((choice) => {
      const {
        targetNode,
        testSuccessNode,
        testFailureNode,
        testCriticalSuccessNode,
        testCriticalFailureNode,
        ...rest
      } = choice
      void targetNode
      void testSuccessNode
      void testFailureNode
      void testCriticalSuccessNode
      void testCriticalFailureNode
      return rest
    })
  }
  delete data.testCriticalFailureNode
  delete data.testFailureNode
  delete data.testSuccessNode
  delete data.testCriticalSuccessNode
  return data
}

/**
 * Traite la mise à jour d'un TestNode en mode document SoT.
 * Retourne le nouvel état partiel ou null si le parent n'est pas trouvé.
 */
function updateTestNodeInDocumentSoT(
  nodeId: string,
  updates: Partial<Node>,
  state: GraphState
): Partial<GraphState> | null {
  const node = state.nodes.find((n) => n.id === nodeId)
  if (!node) return null

  const doc = JSON.parse(JSON.stringify(state.document)) as Record<string, unknown>
  const nodesArray = (doc.nodes as Record<string, unknown>[]) ?? []
  const parent = getParentChoiceForTestNode(nodeId, state.nodes)
  if (!parent) return null

  const updatedTestNode = { ...node, ...updates } as Node
  const updatedChoice = syncChoiceFromTestNode(
    updatedTestNode,
    parent.dialogueNodeId,
    parent.choiceIndex,
    parent.choice
  )
  const docNode = nodesArray.find(
    (n: Record<string, unknown>) => n.id === parent.dialogueNodeId
  ) as Record<string, unknown> | undefined
  if (!docNode || !Array.isArray(docNode.choices)) return null

  const choices = docNode.choices as Record<string, unknown>[]
  if (parent.choiceIndex < choices.length) {
    choices[parent.choiceIndex] = updatedChoice as unknown as Record<string, unknown>
  }

  const layoutPositions = state.layout as { nodes?: Record<string, { x: number; y: number }> }
  const { nodes: projectedNodes, edges: projectedEdges } = documentToGraph(doc, layoutPositions)
  const normalized = normalizeTestBars(projectedNodes, projectedEdges)
  return {
    document: doc,
    nodes: normalized.nodes,
    edges: normalized.edges,
    dialogueMetadata: {
      ...state.dialogueMetadata,
      node_count: normalized.nodes.length,
      edge_count: normalized.edges.length,
    },
  }
}

/**
 * Traite la mise à jour d'un DialogueNode en mode document SoT.
 * Retourne le nouvel état partiel ou null si le nœud n'est pas trouvé.
 */
function updateDialogueNodeInDocumentSoT(
  nodeId: string,
  updates: Partial<Node>,
  state: GraphState
): Partial<GraphState> | null {
  const doc = JSON.parse(JSON.stringify(state.document)) as Record<string, unknown>
  const nodesArray = (doc.nodes as Record<string, unknown>[]) ?? []
  const docNode = nodesArray.find(
    (n: Record<string, unknown>) => n.id === nodeId
  ) as Record<string, unknown> | undefined
  if (!docNode) return null

  const data = updates.data as Record<string, unknown> | undefined
  if (data) {
    if (data.line !== undefined) docNode.line = data.line
    if (data.speaker !== undefined) docNode.speaker = data.speaker
    if (data.nextNode !== undefined) docNode.nextNode = data.nextNode
    if (data.choices !== undefined) docNode.choices = data.choices
  }

  const layoutPositions = state.layout as { nodes?: Record<string, { x: number; y: number }> }
  const { nodes: projectedNodes, edges: projectedEdges } = documentToGraph(doc, layoutPositions)
  const normalized = normalizeTestBars(projectedNodes, projectedEdges)
  return {
    document: doc,
    nodes: normalized.nodes,
    edges: normalized.edges,
    dialogueMetadata: {
      ...state.dialogueMetadata,
      node_count: normalized.nodes.length,
      edge_count: normalized.edges.length,
    },
  }
}

/**
 * Met à jour un TestNode directement (mode sans document SoT).
 * Synchronise le choix parent depuis le TestNode, puis le TestNode depuis le choix.
 */
function updateTestNodeDirectly(
  nodeId: string,
  updates: Partial<Node>,
  state: GraphState
): Partial<GraphState> | typeof state {
  const node = state.nodes.find((n) => n.id === nodeId)
  if (!node) return state

  const parent = getParentChoiceForTestNode(nodeId, state.nodes)
  if (!parent) return state

  const updatedTestNode = { ...node, ...updates } as Node
  const updatedChoice = syncChoiceFromTestNode(
    updatedTestNode,
    parent.dialogueNodeId,
    parent.choiceIndex,
    parent.choice
  )

  const updatedDialogueNode = {
    ...parent.dialogueNode,
    data: {
      ...parent.dialogueNode.data,
      choices: (parent.dialogueNode.data.choices as Choice[]).map((choice, idx) =>
        idx === parent.choiceIndex ? updatedChoice : choice
      ),
    },
  }

  const newNodes = state.nodes.map((n) =>
    n.id === parent.dialogueNodeId ? updatedDialogueNode : n
  )

  const syncResult = syncTestNodeFromChoice(
    updatedChoice,
    parent.choiceIndex,
    parent.dialogueNodeId,
    updatedDialogueNode.position,
    updatedTestNode,
    state.edges,
    newNodes
  )

  let finalNodes = newNodes
  if (syncResult.testNode) {
    finalNodes = finalNodes.map((n) => (n.id === nodeId ? syncResult.testNode! : n))
  } else {
    finalNodes = finalNodes.filter((n) => n.id !== nodeId)
  }

  return {
    nodes: finalNodes,
    edges: syncResult.edges,
    dialogueMetadata: {
      ...state.dialogueMetadata,
      node_count: finalNodes.length,
      edge_count: syncResult.edges.length,
    },
  }
}

/**
 * Met à jour un DialogueNode directement (mode sans document SoT).
 * Synchronise les TestBars selon les changements de choix.
 */
function updateDialogueNodeDirectly(
  nodeId: string,
  updates: Partial<Node>,
  state: GraphState
): Partial<GraphState> {
  const updatedNodes = state.nodes.map((node) =>
    node.id === nodeId ? { ...node, ...updates } : node
  )

  const updatedNode = updatedNodes.find((n) => n.id === nodeId)
  if (!updatedNode || updatedNode.type !== 'dialogueNode') {
    return { nodes: updatedNodes }
  }

  const updatedData = updatedNode.data as { choices?: Choice[]; [key: string]: unknown }
  const choices = updatedData?.choices || []

  const newNodes = [...updatedNodes]
  const testNodeIdsForThisDialogue = choices.map(
    (_, idx) => `test-node-${nodeId}-choice-${idx}`
  )
  let newEdges = state.edges.filter((e) => !testNodeIdsForThisDialogue.includes(e.source))

  choices.forEach((choice: Choice, choiceIndex: number) => {
    const currentDialogueNode = newNodes.find((n) => n.id === nodeId)
    if (!currentDialogueNode || currentDialogueNode.type !== 'dialogueNode') return

    const currentChoices = (currentDialogueNode.data.choices || []) as Choice[]
    const currentChoice = currentChoices[choiceIndex] || choice

    const choiceId = (currentChoice as Choice & { choiceId?: string }).choiceId
    const testNodeId = choiceId
      ? `test:${choiceId}`
      : `test-node-${nodeId}-choice-${choiceIndex}`
    const existingTestNode = newNodes.find((n) => n.id === testNodeId)

    const syncResult = syncTestNodeFromChoice(
      currentChoice,
      choiceIndex,
      nodeId,
      currentDialogueNode.position,
      existingTestNode || null,
      newEdges,
      newNodes
    )

    if (syncResult.testNode) {
      const testNodeIndex = newNodes.findIndex((n) => n.id === testNodeId)
      if (testNodeIndex !== -1) {
        newNodes[testNodeIndex] = syncResult.testNode
      } else {
        newNodes.push(syncResult.testNode)
      }
    } else {
      const testNodeIndex = newNodes.findIndex((n) => n.id === testNodeId)
      if (testNodeIndex !== -1) {
        newNodes.splice(testNodeIndex, 1)
      }
    }

    newEdges = syncResult.edges

    if (currentChoice.test) {
      const stableHandle = (currentChoice as Choice & { choiceId?: string }).choiceId
        ? `choice:${(currentChoice as Choice & { choiceId?: string }).choiceId}`
        : `choice-${choiceIndex}`
      const directEdgeIndex = newEdges.findIndex(
        (e) =>
          e.source === nodeId &&
          e.target === currentChoice.targetNode &&
          e.sourceHandle === stableHandle
      )
      if (directEdgeIndex !== -1) {
        newEdges.splice(directEdgeIndex, 1)
      }

      if (currentChoice.targetNode) {
        const dialogueNodeIndex = newNodes.findIndex((n) => n.id === nodeId)
        if (dialogueNodeIndex !== -1) {
          const updatedDialogueNode = newNodes[dialogueNodeIndex]
          const updatedChoices = (updatedDialogueNode.data.choices as Choice[]).map((c, idx) =>
            idx === choiceIndex ? { ...c, targetNode: undefined } : c
          )
          newNodes[dialogueNodeIndex] = {
            ...updatedDialogueNode,
            data: { ...updatedDialogueNode.data, choices: updatedChoices },
          }
        }
      }
    }
  })

  // Mettre à jour le label des edges choix → targetNode si le texte du choix change
  const dialogueNodeAfter = newNodes.find((n) => n.id === nodeId)
  if (dialogueNodeAfter?.type === 'dialogueNode' && dialogueNodeAfter.data?.choices) {
    const choicesAfter = dialogueNodeAfter.data.choices as Choice[]
    newEdges = newEdges.map((e) => {
      if (
        e.source === nodeId &&
        (e.sourceHandle?.startsWith('choice:') || e.sourceHandle?.startsWith('choice-'))
      ) {
        const idx = e.sourceHandle.startsWith('choice:')
          ? (choicesAfter as (Choice & { choiceId?: string })[]).findIndex(
              (c, i) => (c?.choiceId ?? `__idx_${i}`) === e.sourceHandle!.slice(7)
            )
          : parseInt(e.sourceHandle.replace('choice-', ''), 10)
        const choice = choicesAfter[idx]
        if (choice?.targetNode && !choice?.test) {
          const newLabel = truncateChoiceLabel(choice.text, idx)
          if (e.label !== newLabel) return { ...e, label: newLabel }
        }
      }
      return e
    })
  }

  // Stabiliser les références d'edges pour éviter le clignotement des étiquettes
  const stabilizedEdges = newEdges.map((e) => {
    const existing = state.edges.find((s) => s.id === e.id)
    if (
      existing &&
      existing.source === e.source &&
      existing.target === e.target &&
      existing.sourceHandle === e.sourceHandle &&
      existing.label === e.label
    ) {
      return existing
    }
    return e
  })

  const edgesToReturn =
    stabilizedEdges.length === state.edges.length &&
    stabilizedEdges.every((e, i) => e === state.edges[i])
      ? state.edges
      : stabilizedEdges

  return {
    nodes: newNodes,
    edges: edgesToReturn,
    dialogueMetadata: {
      ...state.dialogueMetadata,
      node_count: newNodes.length,
      edge_count: edgesToReturn.length,
    },
  }
}

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

export const createNodeSlice: StateCreator<GraphState, [], [], NodeSlice> = (set, get) => ({
  addNode: (node: Node) => {
    const state = get()
    const newNodes = [...state.nodes, node]
    const normalized = normalizeTestBars(newNodes, state.edges)

    // En ajoutant un dialogueNode, ne pas écraser edges : connectNodes sera appelé juste après.
    const edgesToSet = node.type === 'dialogueNode' ? state.edges : normalized.edges

    const isDocumentSoT = state.document != null && state.layout != null
    const docAndLayout = isDocumentSoT
      ? syncDocAndLayout(
          normalized.nodes,
          edgesToSet,
          state.layout as Record<string, unknown>
        )
      : {}

    set({
      nodes: normalized.nodes,
      edges: edgesToSet,
      dialogueMetadata: {
        ...state.dialogueMetadata,
        node_count: normalized.nodes.length,
        edge_count: edgesToSet.length,
      },
      ...docAndLayout,
    })
    get().markDirty()
  },

  createEmptyNode: (position?: { x: number; y: number }) => {
    const id = `manual-${crypto.randomUUID()}`
    const pos = position ?? { x: 0, y: 0 }
    const node: Node = {
      id,
      type: 'dialogueNode',
      position: pos,
      data: { id, speaker: '', line: '', choices: [] },
    }
    return node
  },

  updateNode: (nodeId: string, updates: Partial<Node>) => {
    set((state) => {
      const node = state.nodes.find((n) => n.id === nodeId)
      if (!node) return state

      // Branche 1 : mode document SoT
      if (state.document != null && state.layout != null) {
        const result =
          node.type === 'testNode'
            ? updateTestNodeInDocumentSoT(nodeId, updates, state)
            : updateDialogueNodeInDocumentSoT(nodeId, updates, state)
        if (result === null) return state
        return result
      }

      // Branche 2 : TestNode direct
      if (node.type === 'testNode') {
        return updateTestNodeDirectly(nodeId, updates, state)
      }

      // Branche 3 : DialogueNode direct
      return updateDialogueNodeDirectly(nodeId, updates, state)
    })
    get().markDirty()
  },

  deleteNode: (nodeId: string) => {
    set((state) => {
      // TestNode : supprimer le test du choix parent
      if (nodeId.startsWith('test-node-') || nodeId.startsWith('test:')) {
        const parent = getParentChoiceForTestNode(nodeId, state.nodes)

        if (parent) {
          const updatedChoices = (parent.dialogueNode.data.choices as Choice[]).map(
            (choice, idx) => {
              if (idx === parent.choiceIndex) {
                const {
                  test,
                  testCriticalFailureNode,
                  testFailureNode,
                  testSuccessNode,
                  testCriticalSuccessNode,
                  ...rest
                } = choice
                void [test, testCriticalFailureNode, testFailureNode, testSuccessNode, testCriticalSuccessNode]
                return rest
              }
              return choice
            }
          )

          const updatedDialogueNode = {
            ...parent.dialogueNode,
            data: { ...parent.dialogueNode.data, choices: updatedChoices },
          }
          const newNodes = state.nodes
            .map((n) => (n.id === parent.dialogueNodeId ? updatedDialogueNode : n))
            .filter((n) => n.id !== nodeId)
          const newEdges = state.edges.filter(
            (e) => e.source !== nodeId && e.target !== nodeId
          )
          const newSelectedNodeId =
            state.selectedNodeId === nodeId ? parent.dialogueNodeId : state.selectedNodeId

          return {
            nodes: newNodes,
            edges: newEdges,
            selectedNodeId: newSelectedNodeId,
            dialogueMetadata: {
              ...state.dialogueMetadata,
              node_count: newNodes.length,
              edge_count: newEdges.length,
            },
          }
        }

        // Parent non trouvé : supprimer simplement le TestNode
        const newNodes = state.nodes.filter((n) => n.id !== nodeId)
        const newEdges = state.edges.filter(
          (e) => e.source !== nodeId && e.target !== nodeId
        )
        return {
          nodes: newNodes,
          edges: newEdges,
          selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
          dialogueMetadata: {
            ...state.dialogueMetadata,
            node_count: newNodes.length,
            edge_count: newEdges.length,
          },
        }
      }

      // DialogueNode : supprimer le nœud et tous ses TestNodes associés
      const dialogueNode = state.nodes.find((n) => n.id === nodeId)
      const testNodePrefix = `test-node-${nodeId}-`
      const byPrefix = state.nodes
        .filter((n) => n.id.startsWith(testNodePrefix))
        .map((n) => n.id)
      const byChoiceId = ((dialogueNode?.data?.choices ?? []) as Choice[])
        .map((choice: Choice) => {
          const stableChoiceId = (choice as Choice & { choiceId?: string }).choiceId
          return stableChoiceId ? `test:${stableChoiceId}` : null
        })
        .filter((testNodeId: string | null): testNodeId is string => testNodeId != null)
      const associatedTestNodeIds = [...new Set([...byPrefix, ...byChoiceId])]
      const nodesToDelete = [nodeId, ...associatedTestNodeIds]

      let newNodes = state.nodes.filter((n) => !nodesToDelete.includes(n.id))

      // Nettoyer les références dans les nœuds restants
      newNodes = newNodes.map((node) => {
        if (node.type === 'dialogueNode') {
          const data = node.data as { choices?: Choice[]; nextNode?: string }
          const updatedData = { ...data }
          if (updatedData.nextNode && nodesToDelete.includes(updatedData.nextNode)) {
            delete updatedData.nextNode
          }
          if (data.choices) {
            updatedData.choices = data.choices.map((choice) => {
              const updatedChoice = { ...choice }
              if (updatedChoice.targetNode && nodesToDelete.includes(updatedChoice.targetNode)) {
                delete updatedChoice.targetNode
              }
              if (
                updatedChoice.testCriticalFailureNode &&
                nodesToDelete.includes(updatedChoice.testCriticalFailureNode)
              ) {
                delete updatedChoice.testCriticalFailureNode
              }
              if (
                updatedChoice.testFailureNode &&
                nodesToDelete.includes(updatedChoice.testFailureNode)
              ) {
                delete updatedChoice.testFailureNode
              }
              if (
                updatedChoice.testSuccessNode &&
                nodesToDelete.includes(updatedChoice.testSuccessNode)
              ) {
                delete updatedChoice.testSuccessNode
              }
              if (
                updatedChoice.testCriticalSuccessNode &&
                nodesToDelete.includes(updatedChoice.testCriticalSuccessNode)
              ) {
                delete updatedChoice.testCriticalSuccessNode
              }
              return updatedChoice
            })
          }
          return { ...node, data: updatedData }
        }

        if (node.type === 'testNode') {
          const data = node.data as {
            criticalFailureNode?: string
            failureNode?: string
            successNode?: string
            criticalSuccessNode?: string
          }
          const updatedData = { ...data }
          if (updatedData.criticalFailureNode && nodesToDelete.includes(updatedData.criticalFailureNode)) {
            delete updatedData.criticalFailureNode
          }
          if (updatedData.failureNode && nodesToDelete.includes(updatedData.failureNode)) {
            delete updatedData.failureNode
          }
          if (updatedData.successNode && nodesToDelete.includes(updatedData.successNode)) {
            delete updatedData.successNode
          }
          if (updatedData.criticalSuccessNode && nodesToDelete.includes(updatedData.criticalSuccessNode)) {
            delete updatedData.criticalSuccessNode
          }
          return { ...node, data: updatedData }
        }

        return node
      })

      const newEdges = state.edges.filter(
        (e) => !nodesToDelete.includes(e.source) && !nodesToDelete.includes(e.target)
      )
      const selectedNodeToRemove = nodesToDelete.includes(state.selectedNodeId || '')

      return {
        nodes: newNodes,
        edges: newEdges,
        selectedNodeId: selectedNodeToRemove ? null : state.selectedNodeId,
        dialogueMetadata: {
          ...state.dialogueMetadata,
          node_count: newNodes.length,
          edge_count: newEdges.length,
        },
      }
    })
    get().markDirty()
  },

  duplicateNode: (nodeId: string) => {
    const state = get()
    const originalNode = state.nodes.find((n) => n.id === nodeId)
    if (!originalNode || originalNode.type !== 'dialogueNode') return null

    const id = `manual-${crypto.randomUUID()}`
    const position = {
      x: originalNode.position.x + DUPLICATE_OFFSET_X,
      y: originalNode.position.y + DUPLICATE_OFFSET_Y,
    }
    const data = cloneNodeData(originalNode.data as Record<string, unknown>, id)
    const newNode: Node = { id, type: 'dialogueNode', position, data }

    state.addNode(newNode)
    state.setSelectedNode(id)
    return newNode
  },

  duplicateNodes: (nodeIds: string[]) => {
    const state = get()
    let lastAddedId: string | null = null

    nodeIds.forEach((id, index) => {
      const originalNode = state.nodes.find((n) => n.id === id)
      if (!originalNode || originalNode.type !== 'dialogueNode') return

      const newId = `manual-${crypto.randomUUID()}`
      const position = {
        x: originalNode.position.x + DUPLICATE_OFFSET_STEP * (index + 1),
        y: originalNode.position.y + DUPLICATE_OFFSET_STEP * (index + 1),
      }
      const data = cloneNodeData(originalNode.data as Record<string, unknown>, newId)
      const newNode: Node = { id: newId, type: 'dialogueNode', position, data }
      state.addNode(newNode)
      lastAddedId = newId
    })

    if (lastAddedId != null) {
      get().setSelectedNode(lastAddedId)
    }
  },
})
