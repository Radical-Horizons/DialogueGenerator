/**
 * Slice CRUD nœuds du store graphe.
 * Gère addNode, createEmptyNode, updateNode (avec sous-fonctions TestNode/DialogueNode),
 * deleteNode, duplicateNode(s) (dédupliqués via cloneNodeData).
 */
import type { StateCreator } from 'zustand'
import type { Edge, Node } from 'reactflow'
import type { GraphState, GraphSnapshot } from '../types/graphState'
import type { Choice } from '../../schemas/nodeEditorSchema'
import type { RegenerationEntry } from '../../types/graph'
import {
  getParentChoiceForTestNode,
  syncTestNodeFromChoice,
  syncChoiceFromTestNode,
} from '../../utils/testNodeSync'
import { truncateChoiceLabel } from '../../utils/graphEdgeBuilders'
import { normalizeTestBars } from '../../utils/graphNormalizers'
import { runGraphTransaction } from '../utils/runGraphTransaction'
import { documentToGraph } from '../../utils/documentToGraph'
import { syncDocAndLayout } from '../../utils/syncDocLayout'
import { applyLinearNextNodeFromGraphEdges } from '../../utils/mergeNodeEditorForm'
import { pruneGraphValidationDiagnostics } from '../../utils/pruneGraphValidationDiagnostics'
import {
  deriveAutoDisplayName,
  nodeHasStructuralDisplayName,
} from '../../utils/nodeTargetLabel'

/** Nombre max d'entrées dans l'historique de régénération (Story 1.10 - AC#3). */
const MAX_REGENERATION_HISTORY = 10

export type NodeSlice = Pick<
  GraphState,
  | 'addNode'
  | 'createEmptyNode'
  | 'updateNode'
  | 'syncNodeDocumentId'
  | 'syncNodeDisplayName'
  | 'syncMissingDisplayNames'
  | 'deleteNode'
  | 'batchDeleteNodes'
  | 'batchTagNodes'
  | 'duplicateNode'
  | 'duplicateNodes'
  | 'addToRegenerationHistory'
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
  const origTitle = originalData.title as string | undefined
  data.title = typeof origTitle === 'string' && origTitle.length > 0 ? `${origTitle} (copie)` : ''
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
 * Ajoute au graphe les arêtes créées pour un nouveau dialogue (lien vers ses barres de test),
 * sans reprendre le reste de la normalisation : les arêtes existantes restent intactes.
 */
function appendEdgesOfNewDialogueNode(
  nodeId: string,
  currentEdges: Edge[],
  normalizedEdges: Edge[]
): Edge[] {
  const testBarPrefix = `test-node-${nodeId}-`
  const knownEdgeIds = new Set(currentEdges.map((e) => e.id))
  const newEdges = normalizedEdges.filter(
    (e) =>
      !knownEdgeIds.has(e.id) && (e.source === nodeId || e.source.startsWith(testBarPrefix))
  )
  return newEdges.length > 0 ? [...currentEdges, ...newEdges] : currentEdges
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
  if (!parent) {
    return null
  }

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
    if (data.title !== undefined) docNode.title = data.title
    if (data.displayName !== undefined) docNode.displayName = data.displayName
    if (data.label !== undefined) docNode.label = data.label
    if (data.line !== undefined) docNode.line = data.line
    if (data.speaker !== undefined) docNode.speaker = data.speaker
    if (data.nextNode !== undefined) docNode.nextNode = data.nextNode
    if (data.choices !== undefined) docNode.choices = data.choices
    if (data.visibilityConditions !== undefined) docNode.visibilityConditions = data.visibilityConditions
  }

  const docChoices = docNode.choices as unknown[] | undefined
  if (Array.isArray(docChoices) && docChoices.length === 0) {
    const aligned = applyLinearNextNodeFromGraphEdges(
      nodeId,
      docNode as Record<string, unknown>,
      state.edges
    )
    const next = aligned.nextNode
    if (typeof next === 'string' && next.trim() !== '') {
      docNode.nextNode = next
    }
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
    updatedDialogueNode,
    updatedTestNode,
    state.edges,
    newNodes,
    (updatedDialogueNode.data.choices || []) as Choice[]
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

    const testNodeId = `test-node-${nodeId}-choice-${choiceIndex}`
    const existingTestNode = newNodes.find((n) => n.id === testNodeId)

    const syncResult = syncTestNodeFromChoice(
      currentChoice,
      choiceIndex,
      nodeId,
      currentDialogueNode,
      existingTestNode || null,
      newEdges,
      newNodes,
      currentChoices
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

/**
 * Une pause de saisie au moins aussi longue clôt l'étape d'undo en cours (story 18.4) :
 * coalescer évite qu'une minute de frappe vide les 50 snapshots de l'historique structurel.
 */
const UNDO_COALESCE_WINDOW_MS = 1000

/**
 * Forme comparable d'une valeur : ordre des clés ignoré ; absent, null, '', NaN, [], {} et
 * `{ items: [] }` équivalents — ce sont les défauts que le formulaire ajoute à des données brutes.
 */
function canonicalValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'number' && Number.isNaN(value)) return ''
  if (Array.isArray(value)) return value.length === 0 ? '' : value.map(canonicalValue)
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => [k, canonicalValue(v)] as const)
      .filter(([, v]) => v !== '')
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return entries.length === 0 ? '' : Object.fromEntries(entries)
  }
  return value
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonicalValue(a)) === JSON.stringify(canonicalValue(b))
}

/** Champs que `updates` modifie réellement sur `node` (`data.<champ>` pour les données). */
function changedFieldKeys(node: Node, updates: Partial<Node>): string[] {
  const changed: string[] = []
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'data' && value !== null && typeof value === 'object') {
      const before = (node.data ?? {}) as Record<string, unknown>
      for (const [field, next] of Object.entries(value as Record<string, unknown>)) {
        if (!sameValue(before[field], next)) changed.push(`data.${field}`)
      }
    } else if (!sameValue((node as unknown as Record<string, unknown>)[key], value)) {
      changed.push(key)
    }
  }
  return changed.sort()
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Ce qu'un undo restaurerait : sert à reconnaître une écriture qui ne change rien d'effectif.
 * L'ordre des tableaux est ignoré : la reprojection du document range les TestNodes à part.
 */
function graphContentKey(nodes: Node[], edges: Edge[], document: unknown): string {
  return JSON.stringify(
    canonicalValue({
      nodes: nodes.map((n) => ({ id: n.id, type: n.type, data: n.data })).sort(byId),
      edges: edges
        .map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
        }))
        .sort(byId),
      document,
    })
  )
}

function computeNodeUpdate(
  node: Node,
  updates: Partial<Node>,
  state: GraphState
): Partial<GraphState> {
  if (state.document != null && state.layout != null) {
    const result =
      node.type === 'testNode'
        ? updateTestNodeInDocumentSoT(node.id, updates, state)
        : updateDialogueNodeInDocumentSoT(node.id, updates, state)
    return result ?? {}
  }
  if (node.type === 'testNode') {
    const result = updateTestNodeDirectly(node.id, updates, state)
    return result === state ? {} : result
  }
  return updateDialogueNodeDirectly(node.id, updates, state)
}

/**
 * Rafale de saisie en cours : tant qu'elle dure, ses écritures partagent la même étape d'undo.
 * Liée au snapshot qu'elle a poussé : un undo ou une autre transaction la clôt d'office.
 */
let lastFieldEdit: { key: string; at: number; snapshot: GraphSnapshot | undefined } | null = null

function topUndoSnapshot(state: GraphState): GraphSnapshot | undefined {
  return state.undoStack[state.undoStack.length - 1]
}

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

export const createNodeSlice: StateCreator<GraphState, [], [], NodeSlice> = (set, get) => ({
  syncNodeDocumentId: (nodeId: string) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === nodeId)
    if (!node?.data || typeof node.data !== 'object') return
    const d = { ...(node.data as Record<string, unknown>) }
    if (d.id === nodeId) return
    d.id = nodeId
    get().updateNode(nodeId, { data: d })
  },

  syncNodeDisplayName: (nodeId: string) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === nodeId)
    if (!node?.data || typeof node.data !== 'object') return
    const data = node.data as Record<string, unknown>
    if (nodeHasStructuralDisplayName(data)) return
    const displayName = deriveAutoDisplayName(node)
    if (!displayName.trim()) return
    get().updateNode(nodeId, { data: { ...data, displayName } })
  },

  syncMissingDisplayNames: (nodeIds: string[]) => {
    const updated: string[] = []
    const state = get()
    state.runAsSingleUndoStep(() => {
      for (const nodeId of nodeIds) {
        const node = state.nodes.find((n) => n.id === nodeId)
        if (!node?.data || typeof node.data !== 'object') continue
        const data = node.data as Record<string, unknown>
        if (nodeHasStructuralDisplayName(data)) continue
        const displayName = deriveAutoDisplayName(node)
        if (!displayName.trim()) continue
        get().updateNode(nodeId, { data: { ...data, displayName } }, true)
        updated.push(nodeId)
      }
    })
    if (updated.length > 0) get().markDirty()
    return updated
  },

  addNode: (node: Node) => {
    runGraphTransaction(get, set, (state) => {
      const newNodes = [...state.nodes, node]
      const normalized = normalizeTestBars(newNodes, state.edges)
      const edgesToSet =
        node.type === 'dialogueNode'
          ? appendEdgesOfNewDialogueNode(node.id, state.edges, normalized.edges)
          : normalized.edges
      return {
        nodes: normalized.nodes,
        edges: edgesToSet,
        dialogueMetadata: {
          ...state.dialogueMetadata,
          node_count: normalized.nodes.length,
          edge_count: edgesToSet.length,
        },
      }
    })
  },

  createEmptyNode: (position?: { x: number; y: number }) => {
    const id = `manual-${crypto.randomUUID()}`
    const pos = position ?? { x: 0, y: 0 }
    const node: Node = {
      id,
      type: 'dialogueNode',
      position: pos,
      data: { id, title: '', speaker: '', line: '', choices: [] },
    }
    return node
  },

  updateNode: (nodeId: string, updates: Partial<Node>, skipMarkDirty = false) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === nodeId)
    if (!node) return
    const changed = changedFieldKeys(node, updates)
    if (changed.length === 0) return
    const patch = computeNodeUpdate(node, updates, state)
    // Le flush du panneau réécrit en continu des valeurs que le store ne conserve pas (défauts
    // du formulaire, ligne d'un TestNode reconstruite depuis le choix) : sans changement effectif,
    // ni étape d'undo, ni redo vidé, ni document marqué modifié.
    const touchesNodeOutsideData = changed.some((key) => !key.startsWith('data.'))
    if (
      !touchesNodeOutsideData &&
      graphContentKey(patch.nodes ?? state.nodes, patch.edges ?? state.edges, patch.document ?? state.document) ===
        graphContentKey(state.nodes, state.edges, state.document)
    ) {
      return
    }

    const editKey = `${nodeId}:${changed.join(',')}`
    const now = Date.now()
    const continuesBurst =
      lastFieldEdit !== null &&
      lastFieldEdit.key === editKey &&
      now - lastFieldEdit.at < UNDO_COALESCE_WINDOW_MS &&
      lastFieldEdit.snapshot === topUndoSnapshot(state)

    runGraphTransaction(get, set, () => patch, {
      skipUndo: continuesBurst,
      skipMarkDirty,
      skipSyncDoc: true,
    })

    lastFieldEdit = { key: editKey, at: now, snapshot: topUndoSnapshot(get()) }
  },

  deleteNode: (nodeId: string, skipMarkDirty = false, skipPushUndoSnapshot = false) => {
    runGraphTransaction(get, set, (state) => {
      if (nodeId.startsWith('test-node-') || nodeId.startsWith('test:')) {
        const parent = getParentChoiceForTestNode(nodeId, state.nodes)

        let newNodes = state.nodes
        let newEdges = state.edges

        if (parent) {
          const updatedChoices = (parent.dialogueNode.data.choices as Choice[]).map(
            (choice, idx) => {
              if (idx === parent.choiceIndex) {
                const {
                  test: removedTest,
                  testCriticalFailureNode: removedCriticalFailureNode,
                  testFailureNode: removedFailureNode,
                  testSuccessNode: removedSuccessNode,
                  testCriticalSuccessNode: removedCriticalSuccessNode,
                  ...rest
                } = choice
                void removedTest
                void removedCriticalFailureNode
                void removedFailureNode
                void removedSuccessNode
                void removedCriticalSuccessNode
                return rest
              }
              return choice
            }
          )

          const updatedDialogueNode = {
            ...parent.dialogueNode,
            data: { ...parent.dialogueNode.data, choices: updatedChoices },
          }
          newNodes = state.nodes
            .map((n) => (n.id === parent.dialogueNodeId ? updatedDialogueNode : n))
            .filter((n) => n.id !== nodeId)
          newEdges = state.edges.filter(
            (e) => e.source !== nodeId && e.target !== nodeId
          )
        } else {
          newNodes = state.nodes.map(node => {
            if (node.type !== 'dialogueNode' || !node.data.choices) return node
            const choices = node.data.choices as Choice[]
            let modified = false
            const updatedChoices = choices.map((c, idx) => {
              const possibleId = `test-node-${node.id}-choice-${idx}`
              
              if (possibleId === nodeId || c.testSuccessNode === nodeId || c.testFailureNode === nodeId) {
                modified = true
                const {
                  test: removedTest,
                  testCriticalFailureNode: removedCriticalFailureNode,
                  testFailureNode: removedFailureNode,
                  testSuccessNode: removedSuccessNode,
                  testCriticalSuccessNode: removedCriticalSuccessNode,
                  ...rest
                } = c
                void removedTest
                void removedCriticalFailureNode
                void removedFailureNode
                void removedSuccessNode
                void removedCriticalSuccessNode
                return rest
              }
              return c
            })
            return modified ? { ...node, data: { ...node.data, choices: updatedChoices } } : node
          }).filter(n => n.id !== nodeId)
          
          newEdges = state.edges.filter(
            (e) => e.source !== nodeId && e.target !== nodeId
          )
        }

        const newSelectedNodeId =
          state.selectedNodeId === nodeId ? (parent?.dialogueNodeId ?? null) : state.selectedNodeId

        const surviving = new Set(newNodes.map((n) => n.id))
        const pruned = pruneGraphValidationDiagnostics(state, surviving)

        return {
          nodes: newNodes,
          edges: newEdges,
          selectedNodeId: newSelectedNodeId,
          selectedNodeIds: state.selectedNodeIds.filter((id) => id !== nodeId),
          dialogueMetadata: {
            ...state.dialogueMetadata,
            node_count: newNodes.length,
            edge_count: newEdges.length,
          },
          ...pruned,
        }
      }

      const testNodePrefix = `test-node-${nodeId}-`
      const associatedTestNodeIds = state.nodes
        .filter((n) => n.id.startsWith(testNodePrefix))
        .map((n) => n.id)
      const nodesToDelete = [nodeId, ...associatedTestNodeIds]

      let newNodes = state.nodes.filter((n) => !nodesToDelete.includes(n.id))

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
      const survivingIds = new Set(newNodes.map((n) => n.id))
      const pruned = pruneGraphValidationDiagnostics(state, survivingIds)

      return {
        nodes: newNodes,
        edges: newEdges,
        selectedNodeId: selectedNodeToRemove ? null : state.selectedNodeId,
        selectedNodeIds: state.selectedNodeIds.filter((id) => !nodesToDelete.includes(id)),
        dialogueMetadata: {
          ...state.dialogueMetadata,
          node_count: newNodes.length,
          edge_count: newEdges.length,
        },
        ...pruned,
      }
    }, { skipUndo: skipPushUndoSnapshot, skipMarkDirty })
  },

  batchDeleteNodes: (nodeIds: string[]) => {
    const deleted: string[] = []
    const failed: Array<{ id: string; reason?: string }> = []
    let state = get()
    const toDelete = nodeIds.filter((id) => state.nodes.some((n) => n.id === id))
    if (toDelete.length > 0) get()._pushUndoSnapshot()
    for (const id of nodeIds) {
      if (!state.nodes.some((n) => n.id === id)) {
        failed.push({ id, reason: 'nœud introuvable' })
        continue
      }
      try {
        get().deleteNode(id, true, true)
        deleted.push(id)
      } catch (err) {
        failed.push({
          id,
          reason: err instanceof Error ? err.message : String(err),
        })
      }
      state = get()
    }
    if (deleted.length > 0) get().markDirty()
    return { deleted, failed }
  },

  batchTagNodes: (nodeIds: string[], tag: string) => {
    const state = get()
    let updatedCount = 0
    state.runAsSingleUndoStep(() => {
      for (const nodeId of nodeIds) {
        const node = state.nodes.find((n) => n.id === nodeId)
        if (!node) continue
        const currentData = (node.data ?? {}) as Record<string, unknown>
        get().updateNode(nodeId, { data: { ...currentData, tag } }, true)
        updatedCount += 1
      }
    })
    if (updatedCount > 0) get().markDirty()
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

    state.runAsSingleUndoStep(() => {
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
    })

    if (lastAddedId != null) {
      get().setSelectedNode(lastAddedId)
    }
  },

  addToRegenerationHistory: (nodeId: string, instructions: string) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === nodeId)
    if (!node) return

    const entry: RegenerationEntry = {
      timestamp: new Date().toISOString(),
      instructions,
      generationId: crypto.randomUUID(),
    }
    const currentHistory =
      (node.data as { regenerationHistory?: RegenerationEntry[] }).regenerationHistory ?? []
    const newHistory = [...currentHistory, entry].slice(-MAX_REGENERATION_HISTORY)

    set((s) => {
      const nodes = s.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, regenerationHistory: newHistory } }
          : n
      )
      const next = { ...s, nodes }
      if (next.document != null && next.layout != null) {
        const { document, layout } = syncDocAndLayout(
          nodes,
          s.edges,
          next.layout as Record<string, unknown>,
          next.document as Record<string, unknown>
        )
        return { ...next, document, layout }
      }
      return next
    })
  },
})
