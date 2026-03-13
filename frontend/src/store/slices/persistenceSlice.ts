/**
 * Slice persistance du store graphe.
 * Gère le chargement (loadDialogue, loadDialogueByDocumentId), la sauvegarde (saveDialogue)
 * et l'export Unity (exportToUnity).
 */
import type { StateCreator } from 'zustand'
import type { Node, Edge } from 'reactflow'
import type { GraphState } from '../types/graphState'
import type { SaveGraphResponse } from '../../types/graph'
import * as graphAPI from '../../api/graph'
import * as documentsAPI from '../../api/documents'
import { documentToGraph, graphToDocument, buildLayoutFromNodes } from '../../utils/documentToGraph'
import { loadNodePositions } from '../../utils/nodePositions'
import {
  writeSnapshot as journalWriteSnapshot,
  clearPending as journalClearPending,
} from '../../utils/graphJournal'
import {
  ensureValidNode,
  normalizeChoiceHandleInEdges,
  normalizeTestBars,
  documentRequiresChoiceIdMigration,
} from '../../utils/graphNormalizers'

export type PersistenceSlice = Pick<
  GraphState,
  'loadDialogue' | 'loadDialogueByDocumentId' | 'saveDialogue' | 'exportToUnity'
>

export const createPersistenceSlice: StateCreator<
  GraphState,
  [],
  [],
  PersistenceSlice
> = (set, get) => ({
  loadDialogue: async (
    jsonContent: string,
    savedPositions?: Record<string, { x: number; y: number }>,
    explicitFilename?: string
  ) => {
    set({ isLoading: true })
    try {
      const response = await graphAPI.loadGraph({ json_content: jsonContent })

      const filename = explicitFilename || response.metadata.filename
      const persistedPositions = filename ? loadNodePositions(filename) : null

      const nodes: Node[] = response.nodes.map((node) => {
        const raw = ensureValidNode({
          id: node.id,
          type: node.type ?? 'dialogueNode',
          position: node.position ?? { x: 0, y: 0 },
          data: node.data,
        })
        const position =
          persistedPositions?.[node.id] ?? savedPositions?.[node.id] ?? raw.position
        return {
          ...raw,
          position:
            typeof position?.x === 'number' && typeof position?.y === 'number'
              ? position
              : raw.position,
        }
      })

      let edges: Edge[] = response.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type || 'default',
        label: edge.label,
        data: edge.data,
        ...(edge.sourceHandle && { sourceHandle: edge.sourceHandle }),
      }))
      edges = normalizeChoiceHandleInEdges(edges, nodes)

      const normalized = normalizeTestBars(nodes, edges)
      const document = graphToDocument(
        normalized.nodes,
        normalized.edges
      ) as unknown as Record<string, unknown>
      const layout = buildLayoutFromNodes(
        normalized.nodes
      ) as unknown as Record<string, unknown>

      set({
        nodes: normalized.nodes,
        edges: normalized.edges,
        document,
        layout,
        documentRevision: 1,
        layoutRevision: 1,
        dialogueMetadata: {
          title: response.metadata.title,
          node_count: normalized.nodes.length,
          edge_count: normalized.edges.length,
          filename,
        },
        isLoading: false,
        validationErrors: [],
        highlightedNodeIds: [],
        highlightedCycleNodes: [],
        hasUnsavedChanges: false,
        lastSaveError: null,
        lastSavedAt: null,
        documentId: filename ?? null,
        syncStatus: 'synced',
        lastAckSeq: null,
        undoStack: [],
        redoStack: [],
      })
    } catch (error) {
      console.error('Erreur lors du chargement du graphe:', error)
      set({ isLoading: false })
      throw error
    }
  },

  loadDialogueByDocumentId: async (documentId: string) => {
    set({ isLoading: true })
    try {
      const [docResponse, layoutResponse] = await Promise.all([
        documentsAPI.getDocument(documentId),
        documentsAPI
          .getLayout(documentId)
          .catch((err: { response?: { status?: number } }) => {
            if (err?.response?.status === 404) {
              return { layout: {}, revision: 1 }
            }
            throw err
          }),
      ])
      const doc = docResponse.document as Record<string, unknown>
      const layoutBlob = (layoutResponse?.layout ?? {}) as Record<string, unknown>
      const layoutPositions = layoutBlob?.nodes
        ? { nodes: layoutBlob.nodes as Record<string, { x: number; y: number }> }
        : undefined
      const { nodes: projectedNodes, edges: projectedEdges } = documentToGraph(
        doc,
        layoutPositions
      )
      const normalized = normalizeTestBars(projectedNodes, projectedEdges)
      const nodeCount = normalized.nodes.filter((n) => n.type !== 'testNode').length
      set({
        document: doc,
        layout: layoutBlob,
        documentRevision: docResponse.revision,
        layoutRevision: (layoutResponse as { revision: number }).revision ?? 1,
        nodes: normalized.nodes,
        edges: normalized.edges,
        dialogueMetadata: {
          title: 'Dialogue Unity',
          node_count: nodeCount,
          edge_count: normalized.edges.length,
          filename: documentId,
        },
        documentId,
        isLoading: false,
        validationErrors: [],
        highlightedNodeIds: [],
        highlightedCycleNodes: [],
        hasUnsavedChanges: false,
        lastSaveError: null,
        lastSavedAt: null,
        syncStatus: 'synced',
        lastAckSeq: null,
        undoStack: [],
        redoStack: [],
      })
    } catch (error: unknown) {
      console.error('Erreur chargement document:', error)
      set({ isLoading: false })
      const err = error as {
        response?: { status?: number; data?: { error?: { code?: string } } }
      }
      if (
        (err?.response?.status === 422 || err?.response?.status === 400) &&
        err?.response?.data?.error?.code === 'missing_choice_id'
      ) {
        throw new Error(
          "Ce dialogue doit être migré avec l'outil de migration choiceId."
        )
      }
      throw error
    }
  },

  saveDialogue: async () => {
    set({ isSaving: true, lastSaveError: null, syncStatus: 'synced' })
    const state = get()
    const documentId = state.documentId ?? state.dialogueMetadata.filename ?? null

    if (state.nodes.length === 0) {
      set({ isSaving: false })
      return {
        success: true,
        filename: documentId ?? state.dialogueMetadata.filename ?? 'dialogue.json',
        json_content: '[]',
      } as SaveGraphResponse
    }

    try {
      // Flux principal : PUT document + PUT layout (Story 16.4)
      if (state.document != null && documentId) {
        const doc = state.document
        const layoutPayload = (
          state.layout ?? buildLayoutFromNodes(state.nodes)
        ) as Record<string, unknown>
        const docRev = state.documentRevision ?? 1
        const layoutRev = state.layoutRevision ?? 1
        const requiresChoiceIdMigration = documentRequiresChoiceIdMigration(doc)

        if (!requiresChoiceIdMigration) {
          try {
            const [docRes, layoutRes] = await Promise.all([
              documentsAPI.putDocument(documentId, { document: doc, revision: docRev }),
              documentsAPI.putLayout(documentId, {
                layout: layoutPayload,
                revision: layoutRev,
              }),
            ])
            set({
              documentRevision: docRes.revision,
              layoutRevision: layoutRes.revision,
              isSaving: false,
              hasUnsavedChanges: false,
              lastSaveError: null,
              lastSavedAt: Date.now(),
              syncStatus: 'synced',
            })
            return { success: true, filename: documentId } as SaveGraphResponse
          } catch (docErr: unknown) {
            const status = (
              docErr as { response?: { status?: number } }
            )?.response?.status
            if (status === 404) {
              console.warn('Document non trouvé (404), utilisation du chemin legacy')
              // Continuer avec le chemin legacy ci-dessous
            } else if (status === 409) {
              const msg =
                'Conflit de révision (document ou layout modifié ailleurs). Rechargez ou réessayez.'
              set({ isSaving: false, lastSaveError: msg, syncStatus: 'error' })
              throw new Error(msg)
            } else {
              console.warn(
                'Erreur sauvegarde via API documents, tentative legacy:',
                docErr
              )
              // Continuer avec le chemin legacy
            }
          }
        } else {
          set({ isSaving: false })
        }
      }
    } catch (docErr: unknown) {
      console.warn(
        'Erreur préparation sauvegarde via API documents, utilisation du chemin legacy:',
        docErr
      )
    }

    // Chemin legacy (fallback)
    const seq = state.clientSeq
    try {
      const response = await graphAPI.saveGraphAndWrite({
        nodes: state.nodes.map((n) => ({
          id: n.id,
          type: n.type ?? 'dialogueNode',
          position: n.position,
          data: n.data,
        })),
        edges: state.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: e.type,
          label: typeof e.label === 'string' ? e.label : undefined,
          data: e.data,
        })),
        metadata: state.dialogueMetadata,
        seq,
        document_id: documentId ?? undefined,
      })

      const ackSeq = response.ack_seq ?? response.last_seq ?? seq
      const nextSeq = (response.last_seq ?? response.ack_seq ?? seq) + 1

      if (documentId) {
        try {
          await journalWriteSnapshot(documentId, {
            nodes: state.nodes,
            edges: state.edges,
            metadata: state.dialogueMetadata,
            ackSeq,
          })
          await journalClearPending(documentId)
        } catch (e) {
          console.warn('Journal IndexedDB (snapshot/clear):', e)
        }
      }

      const updatedDocument =
        state.document ??
        (graphToDocument(state.nodes, state.edges) as unknown as Record<string, unknown>)
      const updatedLayout = (
        state.layout ?? buildLayoutFromNodes(state.nodes)
      ) as Record<string, unknown>

      set({
        isSaving: false,
        hasUnsavedChanges: false,
        lastSaveError: null,
        lastSavedAt: Date.now(),
        lastAckSeq: ackSeq,
        clientSeq: nextSeq,
        syncStatus: 'synced',
        documentId: documentId ?? response.filename ?? state.documentId,
        document: updatedDocument,
        layout: updatedLayout,
        documentRevision: state.documentRevision ?? 1,
        layoutRevision: state.layoutRevision ?? 1,
        dialogueMetadata: {
          ...state.dialogueMetadata,
          filename: response.filename,
        },
      })
      return response
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Erreur lors de la sauvegarde:', error)
      set({ isSaving: false, lastSaveError: message, syncStatus: 'error' })
      throw error
    }
  },

  exportToUnity: (opts?: { keepStatusForDraft?: boolean }) => {
    const state = get()
    const keepStatus = opts?.keepStatusForDraft === true

    const unityNodes = state.nodes
      .map((node) => {
        if (node.type === 'testNode') return null
        const unityNode = { ...node.data }
        if (!keepStatus) delete unityNode.status
        delete unityNode.nextNode
        delete unityNode.successNode
        delete unityNode.failureNode
        if (unityNode.choices) {
          unityNode.choices = (
            unityNode.choices as Array<{ targetNode?: string; [key: string]: unknown }>
          ).map((choice) => {
            const cleanChoice = { ...choice }
            delete cleanChoice.targetNode
            return cleanChoice
          })
        }
        return unityNode
      })
      .filter((node) => node !== null)

    // Reconstituer les connexions depuis les edges
    for (const edge of state.edges) {
      const sourceNode = unityNodes.find((n) => n && n.id === edge.source)
      if (!sourceNode) continue
      const edgeType = edge.data?.edgeType
      const choiceIndex = edge.data?.choiceIndex
      if (edgeType === 'success') {
        sourceNode.successNode = edge.target
      } else if (edgeType === 'failure') {
        sourceNode.failureNode = edge.target
      } else if (edgeType === 'choice' && choiceIndex !== undefined) {
        if (sourceNode.choices && sourceNode.choices[choiceIndex]) {
          sourceNode.choices[choiceIndex].targetNode = edge.target
        }
      } else {
        if (!sourceNode.choices && !sourceNode.test) {
          sourceNode.nextNode = edge.target
        }
      }
    }

    return JSON.stringify(unityNodes, null, 2)
  },
})
