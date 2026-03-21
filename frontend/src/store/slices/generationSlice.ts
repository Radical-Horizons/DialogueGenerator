/**
 * Slice génération IA du store graphe : generateFromNode, acceptNode, rejectNode, regenerateNode.
 */
import type { StateCreator } from 'zustand'
import type { Node, Edge } from 'reactflow'
import type { GraphState } from '../types/graphState'
import type { Choice } from '../../schemas/nodeEditorSchema'
import * as graphAPI from '../../api/graph'
import { markNodeDeleted } from '../../api/llmUsage'
import { normalizeTestBars } from '../../utils/graphNormalizers'
import { syncDocAndLayout } from '../../utils/syncDocLayout'
import {
  childNodeTopLeftX,
  GRAPH_DIALOGUE_NODE_WIDTH,
  GRAPH_OFFSET_PARENT_TO_CHILD_Y,
  graphParentNodeWidth,
} from '../../utils/graphNodeLayout'

/** Hash simple pour contexte GDD (Story 1.10 AC#5 - stockage). */
function simpleHash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return String(Math.abs(h))
}

/** API peut renvoyer from_node/to_node (noms Pydantic) au lieu de from/to (alias). */
function normalizedConn(conn: { from?: string; to?: string; from_node?: string; to_node?: string; via_choice_index?: number; connection_type: string }) {
  return {
    from: conn.from ?? conn.from_node ?? '',
    to: conn.to ?? conn.to_node ?? '',
    via_choice_index: conn.via_choice_index,
    connection_type: conn.connection_type,
  }
}

/**
 * Normalise le contenu parent envoyé à l'API : retire "test" des choix quand il est vide,
 * pour éviter la branche "4 nœuds" côté backend après suppression du TestNode.
 */
function normalizeParentContentForGeneration(content: Record<string, unknown>): Record<string, unknown> {
  const choices = content.choices as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(choices)) return content
  const normalizedChoices = choices.map((c) => {
    const test = c?.test
    if (test === '' || (typeof test === 'string' && !test.trim())) {
      const { test: _unused, ...rest } = c ?? {}
      void _unused
      return rest
    }
    return c
  })
  return { ...content, choices: normalizedChoices }
}

export type GenerationSlice = Pick<
  GraphState,
  'generateFromNode' | 'acceptNode' | 'rejectNode' | 'regenerateNode'
>

export const createGenerationSlice: StateCreator<
  GraphState,
  [],
  [],
  GenerationSlice
> = (set, get) => ({
  generateFromNode: async (
    parentNodeId: string,
    instructions: string,
    options: Record<string, unknown>
  ) => {
    const generationSeq = get().activeLoadSeq
    set({ isGenerating: true })
    try {
      const state = get()
      const parentNode = state.nodes.find((n) => n.id === parentNodeId)
      if (!parentNode) {
        throw new Error(`Nœud parent ${parentNodeId} introuvable`)
      }

      // Si on génère depuis un TestNode, enrichir le contenu avec les infos du DialogueNode parent
      let parentNodeContent = parentNode.data
      if (
        parentNode.type === 'testNode' ||
        parentNodeId.startsWith('test-node-') ||
        parentNodeId.startsWith('test:')
      ) {
        let parentDialogueNode: Node | undefined
        if (parentNodeId.startsWith('test:')) {
          const choiceId = parentNodeId.slice(5)
          parentDialogueNode = state.nodes.find((n) => {
            if (n.type !== 'dialogueNode' || !n.data?.choices) return false
            const choices = n.data.choices as (Choice & { choiceId?: string })[]
            return choices.some((c, i) => (c?.choiceId ?? `__idx_${i}`) === choiceId)
          })
        } else {
          const parts = parentNodeId.replace('test-node-', '').split('-choice-')
          if (parts.length === 2) {
            parentDialogueNode = state.nodes.find((n) => n.id === parts[0])
          }
        }
        if (parentDialogueNode) {
          parentNodeContent = {
            ...parentNode.data,
            type: 'testNode',
            parent_speaker: parentDialogueNode.data?.speaker || 'PNJ',
            parent_line: parentDialogueNode.data?.line || '',
          }
        }
      }

      const contextSelections =
        typeof options.context_selections === 'object' && options.context_selections != null
          ? (options.context_selections as Record<string, unknown>)
          : {}
      const maxChoices =
        typeof options.max_choices === 'number' ? options.max_choices : null
      const npcSpeakerId =
        typeof options.npc_speaker_id === 'string' ? options.npc_speaker_id : undefined
      const systemPromptOverride =
        typeof options.system_prompt_override === 'string'
          ? options.system_prompt_override
          : undefined
      const narrativeTags = Array.isArray(options.narrative_tags)
        ? options.narrative_tags.filter((t): t is string => typeof t === 'string')
        : undefined
      const llmModelIdentifier =
        typeof options.llm_model_identifier === 'string'
          ? options.llm_model_identifier
          : undefined
      const targetChoiceIndex =
        typeof options.target_choice_index === 'number'
          ? options.target_choice_index
          : null
      const generateAllChoices = options.generate_all_choices === true
      const onBatchProgress =
        typeof options.onBatchProgress === 'function'
          ? (options.onBatchProgress as (current: number, total: number) => void)
          : undefined

      const dialogueIdForCosts = state.dialogueMetadata.filename || undefined
      // Ne pas envoyer de test vide pour un choix (évite 422 après suppression du TestNode)
      const normalizedContent = normalizeParentContentForGeneration(parentNodeContent)
      const response = await graphAPI.generateNode({
        parent_node_id: parentNodeId,
        parent_node_content: normalizedContent,
        user_instructions: instructions,
        context_selections: contextSelections,
        max_choices: maxChoices,
        npc_speaker_id: npcSpeakerId,
        system_prompt_override: systemPromptOverride,
        narrative_tags: narrativeTags,
        llm_model_identifier: llmModelIdentifier,
        target_choice_index: targetChoiceIndex,
        generate_all_choices: generateAllChoices,
        dialogue_id: dialogueIdForCosts,
      })

      const isTestNode = parentNodeId.startsWith('test-node-')
      const isBatch = generateAllChoices
      const generatedNodes =
        Array.isArray(response.nodes) && response.nodes.length > 0
          ? response.nodes
          : response.node
          ? [response.node]
          : []

      const generatedNodeIds: string[] = []
      const connectionMap = new Map<
        number | string,
        {
          node: { id: string; [key: string]: unknown }
          conn: { to: string; via_choice_index?: number; connection_type: string }
        }
      >()

      for (const rawConn of response.suggested_connections) {
        const conn = normalizedConn(rawConn as Parameters<typeof normalizedConn>[0])
        const node = generatedNodes.find((n) => n.id === conn.to)
        if (node) {
          const mapKey =
            isTestNode && conn.connection_type
              ? conn.connection_type
              : conn.via_choice_index !== undefined
              ? conn.via_choice_index
              : `conn-${conn.to}`
          connectionMap.set(mapKey, { node, conn })
        }
      }

      let nodesToAdd: Array<{
        node: { id: string; [key: string]: unknown }
        choiceIndex: number
      }>

      if (isTestNode) {
        const testOrder = [
          'test-critical-failure',
          'test-failure',
          'test-success',
          'test-critical-success',
        ]
        nodesToAdd = testOrder
          .map((connType, index) => {
            const entry = connectionMap.get(connType)
            return entry ? { node: entry.node, choiceIndex: index } : null
          })
          .filter(
            (
              item
            ): item is {
              node: { id: string; [key: string]: unknown }
              choiceIndex: number
            } => item !== null
          )
        const mappedNodeIds = new Set(nodesToAdd.map(({ node }) => node.id))
        for (const node of generatedNodes) {
          if (!mappedNodeIds.has(node.id)) {
            nodesToAdd.push({ node, choiceIndex: nodesToAdd.length })
          }
        }
      } else {
        const sortedConnections = Array.from(connectionMap.entries())
          .filter(([key]) => typeof key === 'number')
          .sort((a, b) => (a[0] as number) - (b[0] as number))
        nodesToAdd =
          sortedConnections.length > 0
            ? sortedConnections.map(([choiceIndex, { node }]) => ({
                node,
                choiceIndex: choiceIndex as number,
              }))
            : generatedNodes.map((node, index) => ({ node, choiceIndex: index }))
      }

      const totalToAdd = nodesToAdd.length
      if ((isBatch || (isTestNode && totalToAdd > 1)) && onBatchProgress && totalToAdd > 0) {
        onBatchProgress(0, totalToAdd)
      }

      const nodesToAddBatch: Node[] = []
      const parentWidth = graphParentNodeWidth(parentNode.type)
      nodesToAdd.forEach(({ node: generatedNode }, index) => {
        const isBatchOrTestNode = isBatch || (isTestNode && totalToAdd > 1)
        const isChoiceSpecific = !isBatchOrTestNode && targetChoiceIndex !== null
        const childX = childNodeTopLeftX({
          parentX: parentNode.position.x,
          parentWidth,
          childWidth: GRAPH_DIALOGUE_NODE_WIDTH,
          siblingIndex: index,
          siblingCount: totalToAdd,
        })
        const verticalOffset = isChoiceSpecific && totalToAdd <= 1 ? 60 : 0
        const contextGddHash =
          Object.keys(contextSelections).length > 0
            ? simpleHash(JSON.stringify(contextSelections))
            : undefined
        const nodeStatus = totalToAdd === 1 ? ('pending' as const) : ('accepted' as const)
        const newNode: Node = {
          id: generatedNode.id,
          type: 'dialogueNode',
          position: {
            x: childX,
            y: parentNode.position.y + GRAPH_OFFSET_PARENT_TO_CHILD_Y + verticalOffset,
          },
          data: {
            ...generatedNode,
            status: nodeStatus,
            lastGenerationInstructions: instructions,
            ...(contextGddHash !== undefined && { contextGddHash }),
          },
        }
        nodesToAddBatch.push(newNode)
        generatedNodeIds.push(generatedNode.id)

        if (isBatchOrTestNode && onBatchProgress && totalToAdd > 0) {
          onBatchProgress(index + 1, totalToAdd)
        }
      })

      const currentState = get()
      if (currentState.activeLoadSeq !== generationSeq) {
        console.warn('[Generation] Ignored generation result because dialogue changed')
        return { nodeId: null }
      }
      const newNodes = [...currentState.nodes, ...nodesToAddBatch]
      set({
        nodes: newNodes,
        dialogueMetadata: {
          ...currentState.dialogueMetadata,
          node_count: newNodes.length,
        },
      })

      const testHandleTypes = ['critical-failure', 'failure', 'success', 'critical-success'] as const
      for (const rawConn of response.suggested_connections ?? []) {
        const conn = normalizedConn(rawConn as Parameters<typeof normalizedConn>[0])
        const sourceId =
          conn.connection_type === 'choice' || conn.connection_type === 'nextNode'
            ? parentNodeId
            : conn.from
        if (!sourceId || !conn.to) continue
        const sourceHandle =
          conn.connection_type?.startsWith('test-')
            ? conn.connection_type.replace('test-', '')
            : testHandleTypes.includes(conn.connection_type as (typeof testHandleTypes)[number])
              ? conn.connection_type
              : undefined
        get().connectNodes(sourceId, conn.to, conn.via_choice_index, conn.connection_type, sourceHandle)
      }

      const stateAfterConnections = get()
      if (stateAfterConnections.activeLoadSeq !== generationSeq) {
        console.warn('[Generation] Ignored generation result after connections because dialogue changed')
        return { nodeId: null }
      }
      let normalized = normalizeTestBars(
        stateAfterConnections.nodes,
        stateAfterConnections.edges
      )
      const isDocumentSoT =
        stateAfterConnections.document != null && stateAfterConnections.layout != null
      const docAndLayout = isDocumentSoT
        ? syncDocAndLayout(
            normalized.nodes,
            normalized.edges,
            stateAfterConnections.layout as Record<string, unknown>
          )
        : null
      set({
        nodes: normalized.nodes,
        edges: normalized.edges,
        dialogueMetadata: {
          ...stateAfterConnections.dialogueMetadata,
          node_count: normalized.nodes.length,
          edge_count: normalized.edges.length,
        },
        ...(docAndLayout != null && {
          document: docAndLayout.document,
          layout: docAndLayout.layout,
        }),
      })

      set({ isGenerating: false })
      get().markDirty()

      const firstNodeId = generatedNodeIds[0] || generatedNodes[0]?.id
      const batchInfo = generateAllChoices
        ? {
            generatedChoices:
              response.generated_choices_count ?? generatedNodes.length,
            connectedChoices: response.connected_choices_count ?? 0,
            failedChoices: response.failed_choices_count ?? 0,
            totalChoices:
              response.total_choices_count ??
              ((
                parentNode.data as { choices?: unknown[] } | undefined
              )?.choices?.length ?? 0),
          }
        : undefined

      if (generateAllChoices && response.batch_count) {
        console.log(`Génération batch: ${response.batch_count} nœud(s) généré(s)`)
      }

      return { nodeId: firstNodeId ?? null, batchInfo }
    } catch (error: unknown) {
      console.error('Erreur lors de la génération de nœud:', error)
      set({ isGenerating: false })
      throw error
    }
  },

  acceptNode: async (nodeId: string) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === nodeId)
    if (!node) throw new Error(`Nœud ${nodeId} introuvable`)
    if (node.data.status === 'accepted') return

    // Mise à jour optimiste
    set((currentState) => {
      const nextNodes = currentState.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, status: 'accepted' as const } } : n
      )
      const synced =
        currentState.document != null && currentState.layout != null
          ? syncDocAndLayout(nextNodes, currentState.edges, currentState.layout as Record<string, unknown>)
          : null
      return {
        nodes: nextNodes,
        ...(synced && { document: synced.document, layout: synced.layout }),
      }
    })

    try {
      const dialogueId = get().dialogueMetadata.filename || 'current'
      await graphAPI.acceptNode(dialogueId, nodeId)
      await get().saveDialogue()
      get().markDirty()
    } catch (err) {
      // Rollback
      set((currentState) => {
        const nextNodes = currentState.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, status: 'pending' as const } } : n
        )
        const synced =
          currentState.document != null && currentState.layout != null
            ? syncDocAndLayout(nextNodes, currentState.edges, currentState.layout as Record<string, unknown>)
            : null
        return {
          nodes: nextNodes,
          ...(synced && { document: synced.document, layout: synced.layout }),
        }
      })
      const { toastManager } = await import('../../components/shared/Toast')
      toastManager.show(
        'Impossible de sauvegarder l\u2019acceptation. Réessayez.',
        'error',
        5000
      )
      throw err
    }
  },

  regenerateNode: async (nodeId: string, newInstructions: string) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === nodeId)
    if (!node) throw new Error(`Nœud ${nodeId} introuvable`)

    const incomingEdge = state.edges.find((e) => e.target === nodeId)
    const parentId = incomingEdge?.source
    const parentNode = parentId ? state.nodes.find((n) => n.id === parentId) : null
    if (!parentNode) throw new Error(`Nœud parent introuvable pour ${nodeId}`)

    set({ isGenerating: true })
    try {
      const dialogueId = state.dialogueMetadata.filename || 'current'
      const via_choice_index =
        incomingEdge?.data != null &&
        typeof (incomingEdge.data as { via_choice_index?: number }).via_choice_index === 'number'
          ? (incomingEdge.data as { via_choice_index: number }).via_choice_index
          : undefined

      const response = await graphAPI.regenerateNode(nodeId, {
        dialogue_id: dialogueId,
        new_instructions: newInstructions,
        preserve_connections: true,
        parent_node_id: parentNode.id,
        parent_node_content: parentNode.data as Record<string, unknown>,
        context_selections: {},
        via_choice_index,
      })

      const existingData = node.data as Record<string, unknown>
      const existingHistory = (existingData.regenerationHistory as Array<{ instructions: string; timestamp: string; generationId: string }>) ?? []
      const newEntry = {
        timestamp: new Date().toISOString(),
        instructions: newInstructions,
        generationId: crypto.randomUUID(),
      }
      const regenerationHistory = [...existingHistory, newEntry].slice(-10)
      const newData = {
        ...response.node,
        id: nodeId,
        status: 'pending' as const,
        lastGenerationInstructions: newInstructions,
        regenerationHistory,
        contextGddHash: existingData.contextGddHash ?? (response.node as Record<string, unknown>).contextGddHash,
      }

      set((s) => {
        const nextNodes = s.nodes.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                position: n.position,
                data: newData,
              }
            : n
        )
        const nextEdges = s.edges
        const doc = s.document
        const layout = s.layout
        const synced =
          doc != null && layout != null
            ? syncDocAndLayout(nextNodes, nextEdges, layout as Record<string, unknown>)
            : null
        return {
          nodes: nextNodes,
          ...(synced && { document: synced.document, layout: synced.layout }),
          isGenerating: false,
        }
      })
      get().markDirty()
    } catch (err) {
      set({ isGenerating: false })
      console.error('Erreur lors de la régénération du nœud:', err)
      const { toastManager } = await import('../../components/shared/Toast')
      toastManager.show('Régénération échouée. Réessayez.', 'error', 5000)
      throw err
    }
  },

  rejectNode: async (nodeId: string) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === nodeId)
    if (!node) throw new Error(`Nœud ${nodeId} introuvable`)

    const dialogueId = state.dialogueMetadata.filename || 'current'
    try {
      await graphAPI.rejectNode(dialogueId, nodeId)
      // Marquer le nœud comme supprimé dans l'historique des coûts (AC#5)
      markNodeDeleted(nodeId).catch((err) => {
        console.warn('mark-node-deleted non-critique:', err)
      })
    } catch (err) {
      console.error('Erreur lors du rejet du nœud:', err)
      const { toastManager } = await import('../../components/shared/Toast')
      toastManager.show('Impossible de rejeter le nœud. Réessayez.', 'error', 5000)
      throw err
    }

    try {
      set((currentState) => {
        let updatedNodes = [...currentState.nodes]
        let updatedEdges = [...currentState.edges]

        updatedNodes = updatedNodes.map((n) => {
          if (n.type === 'dialogueNode' && n.data.choices) {
            const choices = n.data.choices as Choice[]
            const hasReference = choices.some((choice) => choice.targetNode === nodeId)
            if (hasReference) {
              const cleanedChoices = choices.map((choice) => {
                if (choice.targetNode === nodeId) {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { targetNode, ...rest } = choice
                  return rest
                }
                return choice
              })
              return { ...n, data: { ...n.data, choices: cleanedChoices } }
            }
          }
          if (n.data.nextNode === nodeId) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { nextNode, ...restData } = n.data
            return { ...n, data: restData }
          }
          return n
        })
        updatedEdges = updatedEdges.filter(
          (e) => e.source !== nodeId && e.target !== nodeId
        )
        return { ...currentState, nodes: updatedNodes, edges: updatedEdges }
      })

      get().deleteNode(nodeId)
      await get().saveDialogue()

      const { toastManager } = await import('../../components/shared/Toast')
      toastManager.show('Nœud rejeté', 'info', 3000)
      get().markDirty()
    } catch (err) {
      console.error('Erreur après rejet (sauvegarde):', err)
      const { toastManager } = await import('../../components/shared/Toast')
      toastManager.show(
        'Nœud retiré du graphe mais la sauvegarde a échoué. Réessayez de sauvegarder.',
        'error',
        5000
      )
      throw err
    }
  },
})
