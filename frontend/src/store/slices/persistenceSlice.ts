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
import { calculateDagreLayout } from '../../utils/dagreLayout'
import { mergeLayoutWithNodePositions } from '../../utils/syncDocLayout'
import {
  ensureValidNode,
  normalizeChoiceHandleInEdges,
  normalizeTestBars,
  documentRequiresChoiceIdMigration,
} from '../../utils/graphNormalizers'
import {
  mergeIntentionalCycleIdsIntoLayout,
  readIntentionalCycleIdsFromLayout,
} from '../../utils/layoutIntentionalCycles'
import {
  applyBindingsToDocument,
  parseBindingsFromDocument,
} from '../../utils/dialogueFlagBindings'
import { getErrorMessage } from '../../types/errors'
import { useGraphViewStore } from '../graphViewStore'
import {
  extractValidationIssuesFromApiError,
  inlineValidationToastMessage,
  type DocumentFieldError,
} from '../../utils/documentValidationFieldErrors'
import { acknowledgeSnapshot as journalAcknowledgeSnapshot } from '../../utils/graphJournal'

function unityNodesFromGraph(state: GraphState): Array<{ id?: string }> {
  const doc = graphToDocument(state.nodes, state.edges) as {
    nodes?: Array<{ id?: string }>
  }
  return doc.nodes ?? []
}

function hasLayoutPositions(
  layout: { nodes?: Record<string, { x: number; y: number }> } | undefined,
): boolean {
  const nodes = layout?.nodes
  if (!nodes) return false
  return Object.values(nodes).some(
    (position) => typeof position?.x === 'number' && typeof position?.y === 'number',
  )
}

function normalizeGraphForLoad(
  nodes: Node[],
  edges: Edge[],
  get: () => GraphState,
  shouldAutoLayout: boolean,
): { nodes: Node[]; edges: Edge[] } {
  let normalized = normalizeTestBars(nodes, edges)
  if (shouldAutoLayout && normalized.nodes.length > 1) {
    const layoutedNodes = calculateDagreLayout(normalized.nodes, normalized.edges, {
      direction: 'TB',
      spacingMode: get().layoutSpacingMode,
    })
    normalized = normalizeTestBars(layoutedNodes, normalized.edges)
  }
  return normalized
}

function applySaveFieldValidationErrors(
  get: () => GraphState,
  set: (partial: Partial<GraphState>) => void,
  error: unknown,
): { fieldErrors: DocumentFieldError[]; userMessage: string } {
  const snap = get()
  const { fieldErrors, unmappedMessages } = extractValidationIssuesFromApiError(
    error,
    unityNodesFromGraph(snap),
    snap.nodes,
  )
  if (fieldErrors.length > 0) {
    get().setDocumentFieldErrors(fieldErrors)
    const first = fieldErrors[0]
    if (first?.nodeId) {
      get().setSelectedNode(first.nodeId)
      useGraphViewStore.getState().focusNode(first.nodeId)
    }
  } else {
    get().clearDocumentFieldErrors()
  }
  const userMessage =
    fieldErrors.length > 0
      ? inlineValidationToastMessage(fieldErrors.length)
      : (unmappedMessages[0] ?? getErrorMessage(error))
  if (fieldErrors.length > 0) {
    set({ lastSaveError: null })
  }
  return { fieldErrors, userMessage }
}

function revisionConflictOf(error: unknown): number | null {
  const response = (error as { response?: { status?: number; data?: { revision?: unknown } } })
    ?.response
  const revision = response?.data?.revision
  return response?.status === 409 && typeof revision === 'number' ? revision : null
}

function conflictDocumentOf(error: unknown): Record<string, unknown> | undefined {
  const document = (error as { response?: { data?: { document?: unknown } } })?.response?.data
    ?.document
  return document && typeof document === 'object' ? (document as Record<string, unknown>) : undefined
}

/** Auteur unique : le graphe ouvert l'emporte sur une révision serveur plus récente. */
/** Diagnostics FR94 du rapport : conseils non bloquants, pas des erreurs de saisie. */
const NON_BLOCKING_REPORT_CODES = new Set(['social_system_confusion', 'reputation_palier_runtime_only'])

function blockingDraftReport(response: { validationReport?: Array<{ code?: string }> }) {
  return {
    ...response,
    validationReport: (response.validationReport ?? []).filter(
      (row) => !NON_BLOCKING_REPORT_CODES.has(row.code ?? ''),
    ),
  }
}

export const DELETED_DIALOGUE_MESSAGE =
  "Ce dialogue a été supprimé : les modifications du graphe ne sont plus enregistrées. Ouvrez un autre dialogue."

export function isDeletedDocumentError(error: unknown): boolean {
  return (error as { response?: { status?: number } })?.response?.status === 404
}

async function putOverwritingRevisionConflict<T>(
  put: (revision: number, serverDocument?: Record<string, unknown>) => Promise<T>,
  revision: number,
): Promise<{ result: T; conflicted: boolean }> {
  try {
    return { result: await put(revision), conflicted: false }
  } catch (error) {
    const serverRevision = revisionConflictOf(error)
    if (serverRevision === null) throw error
    return { result: await put(serverRevision, conflictDocumentOf(error)), conflicted: true }
  }
}

export type PersistenceSlice = Pick<
  GraphState,
  | 'loadDialogue'
  | 'loadDialogueByDocumentId'
  | 'loadDialogueFromRawJson'
  | 'applyUnityDocumentNodes'
  | 'saveDialogue'
  | 'exportToUnity'
  | 'incrementLoadSeq'
  | 'applyLoadResult'
>

let saveQueue: Promise<void> | null = null

/** Révision envoyée par chaque PUT en vol : celle qu'une sauvegarde keepalive doit attendre + 1. */
const revisionsInFlight: { document: number | null; layout: number | null } = {
  document: null,
  layout: null,
}

async function trackRevisionInFlight<T>(
  stage: 'document' | 'layout',
  revision: number,
  put: () => Promise<T>,
): Promise<T> {
  revisionsInFlight[stage] = revision
  try {
    return await put()
  } finally {
    if (revisionsInFlight[stage] === revision) revisionsInFlight[stage] = null
  }
}

export const createPersistenceSlice: StateCreator<GraphState, [], [], PersistenceSlice> = (
  set,
  get,
) => ({
  loadDialogue: async (
    jsonContent: string,
    savedPositions?: Record<string, { x: number; y: number }>,
    explicitFilename?: string,
  ) => {
    const loadSeq = get().activeLoadSeq
    set({ isLoading: true })
    try {
      const response = await graphAPI.loadGraph({
        json_content: jsonContent,
      })

      const filename = explicitFilename || response.metadata.filename

      const nodes: Node[] = response.nodes.map((node) => {
        const raw = ensureValidNode({
          id: node.id,
          type: node.type ?? 'dialogueNode',
          position: node.position ?? { x: 0, y: 0 },
          data: node.data,
        })
        const position = savedPositions?.[node.id] ?? raw.position
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

      const normalized = normalizeGraphForLoad(
        nodes,
        edges,
        get,
        !hasLayoutPositions(savedPositions ? { nodes: savedPositions } : undefined),
      )
      const document = graphToDocument(normalized.nodes, normalized.edges) as unknown as Record<
        string,
        unknown
      >
      const layout = buildLayoutFromNodes(normalized.nodes) as unknown as Record<string, unknown>

      get().applyLoadResult({
        nodes: normalized.nodes,
        edges: normalized.edges,
        document,
        layout,
        metadata: {
          title: response.metadata.title,
          node_count: normalized.nodes.length,
          edge_count: normalized.edges.length,
          filename,
        },
        documentId: filename ?? '',
        documentRevision: 1,
        layoutRevision: 1,
        loadSeq,
      })
      get().normalizeEdgeColors({ skipMarkDirty: true })
    } catch (error) {
      if (get().activeLoadSeq !== loadSeq) return
      console.error('Erreur lors du chargement du graphe:', error)
      set({ isLoading: false })
      throw error
    }
  },

  /** Charge depuis le JSON brut (frontend uniquement). Fallback 404 documents ou 422 missing_choice_id. */
  loadDialogueFromRawJson: async (jsonContent: string, documentId: string) => {
    const loadSeq = get().activeLoadSeq
    set({ isLoading: true })
    try {
      let parsed: unknown
      try {
        parsed = JSON.parse(jsonContent)
      } catch {
        throw new Error('Contenu JSON invalide')
      }
      const doc: Record<string, unknown> = Array.isArray(parsed)
        ? { schemaVersion: '1.1.0', nodes: parsed }
        : (parsed as Record<string, unknown>)

      let layoutPositions: { nodes: Record<string, { x: number; y: number }> } | undefined
      let serverLayout: Record<string, unknown> = {}
      try {
        const layoutRes = await documentsAPI.getLayout(documentId)
        serverLayout = (layoutRes?.layout ?? {}) as Record<string, unknown>
        const nodes = serverLayout.nodes as Record<string, { x: number; y: number }> | undefined
        if (nodes && typeof nodes === 'object' && Object.keys(nodes).length > 0) {
          layoutPositions = { nodes }
        }
      } catch {
        // Fallback sessionStorage removed as per plan
      }

      const { nodes: projectedNodes, edges: projectedEdges } = documentToGraph(doc, layoutPositions)
      const normalized = normalizeGraphForLoad(
        projectedNodes,
        projectedEdges,
        get,
        !hasLayoutPositions(layoutPositions),
      )
      const layoutBlob = mergeLayoutWithNodePositions(serverLayout, normalized.nodes)
      const nodeCount = normalized.nodes.filter((n) => n.type !== 'testNode').length

      get().applyLoadResult({
        nodes: normalized.nodes,
        edges: normalized.edges,
        document: doc,
        layout: layoutBlob,
        metadata: {
          title: 'Dialogue Unity',
          node_count: nodeCount,
          edge_count: normalized.edges.length,
          filename: documentId,
        },
        documentId,
        documentRevision: 1,
        layoutRevision: 1,
        loadSeq,
      })
      get().normalizeEdgeColors({ skipMarkDirty: true })
    } catch (error) {
      if (get().activeLoadSeq !== loadSeq) return
      set({ isLoading: false })
      throw error
    }
  },

  applyUnityDocumentNodes: (unityNodes: unknown[]) => {
    if (!Array.isArray(unityNodes)) return
    const state = get()
    const existingDoc =
      state.document && typeof state.document === 'object' && !Array.isArray(state.document)
        ? { ...(state.document as Record<string, unknown>) }
        : { schemaVersion: '1.2.0' }
    const doc: Record<string, unknown> = {
      ...existingDoc,
      schemaVersion: String(existingDoc.schemaVersion ?? '1.2.0'),
      nodes: unityNodes,
    }
    const layoutPositions: Record<string, { x: number; y: number }> = {}
    for (const node of state.nodes) {
      if (
        node?.id &&
        node.position &&
        typeof node.position.x === 'number' &&
        typeof node.position.y === 'number'
      ) {
        layoutPositions[node.id] = { x: node.position.x, y: node.position.y }
      }
    }
    const { nodes: projectedNodes, edges: projectedEdges } = documentToGraph(
      doc,
      Object.keys(layoutPositions).length > 0 ? { nodes: layoutPositions } : undefined,
    )
    const dialogueNodeCount = projectedNodes.filter((n) => n.type !== 'testNode').length
    set({
      nodes: projectedNodes,
      edges: projectedEdges,
      document: doc,
      dialogueMetadata: {
        ...state.dialogueMetadata,
        node_count: dialogueNodeCount,
        edge_count: projectedEdges.length,
      },
    })
    get().markDirty()
  },

  loadDialogueByDocumentId: async (documentId: string) => {
    const loadSeq = get().activeLoadSeq
    set({ isLoading: true })
    try {
      const [docResponse, layoutResponse] = await Promise.all([
        documentsAPI.getDocument(documentId),
        documentsAPI.getLayout(documentId).catch((err: { response?: { status?: number } }) => {
          if (err?.response?.status === 404) {
            return { layout: {}, revision: 1 }
          }
          throw err
        }),
      ])
      const doc = docResponse.document as Record<string, unknown>
      const layoutBlob = (layoutResponse?.layout ?? {}) as Record<string, unknown>
      const layoutPositions = layoutBlob?.nodes
        ? {
            nodes: layoutBlob.nodes as Record<string, { x: number; y: number }>,
          }
        : undefined
      const { nodes: projectedNodes, edges: projectedEdges } = documentToGraph(doc, layoutPositions)
      const normalized = normalizeGraphForLoad(
        projectedNodes,
        projectedEdges,
        get,
        !hasLayoutPositions(layoutPositions),
      )
      const hydratedLayout = mergeLayoutWithNodePositions(layoutBlob, normalized.nodes)
      const nodeCount = normalized.nodes.filter((n) => n.type !== 'testNode').length

      get().applyLoadResult({
        nodes: normalized.nodes,
        edges: normalized.edges,
        document: doc,
        layout: hydratedLayout,
        metadata: {
          title: 'Dialogue Unity',
          node_count: nodeCount,
          edge_count: normalized.edges.length,
          filename: documentId,
        },
        documentId,
        documentRevision: docResponse.revision,
        layoutRevision: (layoutResponse as { revision: number }).revision ?? 1,
        loadSeq,
      })
      get().normalizeEdgeColors({ skipMarkDirty: true })
    } catch (error: unknown) {
      if (get().activeLoadSeq !== loadSeq) return
      console.error('Erreur chargement document:', error)
      set({ isLoading: false })
      throw error
    }
  },

  incrementLoadSeq: () => {
    let nextSeq = 0
    set((state) => {
      nextSeq = state.activeLoadSeq + 1
      return {
        activeLoadSeq: nextSeq,
        activeSaveSeq: state.activeSaveSeq + 1,
        isSaving: false,
      }
    })
    return nextSeq
  },

  applyLoadResult: (params) => {
    const { loadSeq, ...rest } = params
    const currentSeq = get().activeLoadSeq
    if (loadSeq !== currentSeq) {
      console.warn(
        `[Persistence] Ignored stale load result (seq ${loadSeq}, current ${currentSeq})`,
      )
      return false
    }

    const intentionalCycles = readIntentionalCycleIdsFromLayout(
      rest.layout as Record<string, unknown>,
    )
    try {
      localStorage.setItem('graph_intentional_cycles', JSON.stringify(intentionalCycles))
    } catch (e) {
      console.warn('[Persistence] localStorage intentional cycles:', e)
    }

    set({
      nodes: rest.nodes,
      edges: rest.edges,
      document: rest.document,
      layout: rest.layout,
      dialogueMetadata: rest.metadata,
      documentId: rest.documentId,
      documentRevision: rest.documentRevision,
      layoutRevision: rest.layoutRevision,
      dialogueFlagBindings: parseBindingsFromDocument(rest.document as Record<string, unknown>),
      isLoading: false,
      isSaving: false,
      activeSaveSeq: get().activeSaveSeq + 1,
      validationErrors: [],
      loreExplicitValidationSummary: null,
      loreExplicitValidationLoading: false,
      highlightedNodeIds: [],
      highlightedCycleNodes: [],
      intentionalCycles,
      hasUnsavedChanges: false,
      lastSaveError: null,
      lastSavedAt: null,
      syncStatus: 'synced',
      lastAckSeq: null,
      undoStack: [],
      redoStack: [],
      selectedNodeId: null,
      selectedNodeIds: [],
      documentFieldErrors: [],
      graphFilters: {},
      isGenerating: false,
      showDeleteNodeConfirm: false,
    })
    return true
  },

  saveDialogue: (options) => {
    const performSave = async (
      expectedRevisions?: { document: number; layout: number },
    ): Promise<SaveGraphResponse> => {
      let saveOperationSeq = 0
      set((current) => {
        saveOperationSeq = current.activeSaveSeq + 1
        return {
          activeSaveSeq: saveOperationSeq,
          isSaving: true,
          lastSaveError: null,
          syncStatus: 'synced',
        }
      })
      get().clearDocumentFieldErrors()
      const state = get()
      const saveLoadSeq = state.activeLoadSeq
      const documentId = state.documentId ?? state.dialogueMetadata.filename ?? null
      if (!documentId || state.document == null) {
        const error = new Error('Aucun document canonique chargé')
        set({
          isSaving: false,
          lastSaveError: error.message,
          syncStatus: 'error',
        })
        throw error
      }

      const snap = get()
      const doc = graphToDocument(snap.nodes, snap.edges) as unknown as Record<string, unknown>
      // Le titre se renomme depuis Éditer : le graphe ne le porte pas mais ne doit pas l'effacer.
      const documentTitle = (state.document as Record<string, unknown>).title
      if (typeof documentTitle === 'string' && documentTitle.trim()) doc.title = documentTitle
      applyBindingsToDocument(doc, snap.dialogueFlagBindings ?? [])
      if (documentRequiresChoiceIdMigration(doc)) {
        const error = new Error("Ce dialogue doit être migré avec l'outil de migration choiceId.")
        set({
          isSaving: false,
          lastSaveError: error.message,
          syncStatus: 'error',
        })
        throw error
      }
      const layoutPayload = mergeIntentionalCycleIdsIntoLayout(
        mergeLayoutWithNodePositions(
          snap.layout ?? buildLayoutFromNodes(snap.nodes),
          snap.nodes,
        ) as Record<string, unknown>,
        snap.intentionalCycles,
      )
      const isActiveSave = (): boolean => {
        const current = get()
        const currentId = current.documentId ?? current.dialogueMetadata.filename ?? null
        return (
          currentId === documentId &&
          current.activeLoadSeq === saveLoadSeq &&
          current.activeSaveSeq === saveOperationSeq
        )
      }

      const putDocumentAt = async (revision: number, serverDocument?: Record<string, unknown>) => {
        // Le graphe ne porte pas le titre : sur conflit, celui du serveur (renommé dans Édition) prime.
        const serverTitle = serverDocument?.title
        if (typeof serverTitle === 'string' && serverTitle.trim()) doc.title = serverTitle
        // Brouillon : une saisie en cours (condition à moitié remplie) ne doit pas faire refuser
        // toute la persistance ; l'export Unity garde sa propre validation stricte.
        const body = { document: doc, revision, validationMode: 'draft' as const }
        return trackRevisionInFlight('document', revision, async () =>
          (options?.keepalive ? await documentsAPI.putDocumentKeepalive(documentId, body) : null) ??
          (await documentsAPI.putDocument(documentId, body)),
        )
      }
      const putLayoutAt = async (revision: number) => {
        const body = { layout: layoutPayload, revision }
        return trackRevisionInFlight('layout', revision, async () =>
          (options?.keepalive ? await documentsAPI.putLayoutKeepalive(documentId, body) : null) ??
          (await documentsAPI.putLayout(documentId, body)),
        )
      }
      const documentRevision = expectedRevisions?.document ?? state.documentRevision ?? 1
      const layoutRevision = expectedRevisions?.layout ?? state.layoutRevision ?? 1
      let failedStage: 'document' | 'layout' = 'document'
      // Le document réserve le quota keepalive avant le layout : c'est lui qu'on ne doit jamais perdre.
      const documentPut = putOverwritingRevisionConflict(putDocumentAt, documentRevision)
      void documentPut.catch(() => undefined)
      // En quittant la page, plus rien ne s'exécute après la réponse du document : le layout part en même temps.
      const earlyLayout = options?.keepalive
        ? putOverwritingRevisionConflict(putLayoutAt, layoutRevision)
        : null
      void earlyLayout?.catch(() => undefined)

      try {
        const { result: docRes, conflicted: replacedNewerVersion } = await documentPut
        if (!isActiveSave()) {
          return { success: true, filename: documentId } as SaveGraphResponse
        }
        set({
          document: doc,
          documentRevision: docRes.revision,
        })
        failedStage = 'layout'
        const { result: layoutRes } = await (earlyLayout ??
          putOverwritingRevisionConflict(putLayoutAt, layoutRevision))
        if (!isActiveSave()) {
          return { success: true, filename: documentId } as SaveGraphResponse
        }
        const hasNewerChanges = get().clientSeq !== snap.clientSeq
        const { fieldErrors: draftFieldErrors } = extractValidationIssuesFromApiError(
          { response: { data: blockingDraftReport(docRes) } },
          unityNodesFromGraph(snap),
          snap.nodes,
        )
        set({
          document: doc,
          layout: layoutPayload,
          documentRevision: docRes.revision,
          layoutRevision: layoutRes.revision,
          isSaving: false,
          hasUnsavedChanges: hasNewerChanges,
          lastSaveError: null,
          documentFieldErrors: draftFieldErrors,
          lastSavedAt: Date.now(),
          syncStatus: 'synced',
        })
        useGraphViewStore
          .getState()
          .notifyDocumentSaved({ documentId, revision: docRes.revision, source: 'graph' })
        try {
          await journalAcknowledgeSnapshot(documentId, {
            nodes: snap.nodes,
            edges: snap.edges,
            metadata: snap.dialogueMetadata,
            ackSeq: snap.clientSeq,
          })
        } catch (journalError) {
          console.warn('Journal save acknowledgement:', journalError)
        }
        try {
          await get().validateGraph()
        } catch (validationError) {
          console.error('Validation après sauvegarde:', validationError)
        }
        return { success: true, filename: documentId, replacedNewerVersion } as SaveGraphResponse
      } catch (error) {
        if (!isActiveSave()) {
          throw error
        }
        if (isDeletedDocumentError(error)) {
          set({ isSaving: false, lastSaveError: DELETED_DIALOGUE_MESSAGE, syncStatus: 'error' })
          throw error
        }
        const serverRevision = revisionConflictOf(error)
        if (serverRevision !== null) {
          set(
            failedStage === 'document'
              ? { documentRevision: serverRevision }
              : { layoutRevision: serverRevision },
          )
        }
        const { fieldErrors, userMessage } = applySaveFieldValidationErrors(get, set, error)
        set({
          isSaving: false,
          lastSaveError: fieldErrors.length > 0 ? null : userMessage,
          syncStatus: 'error',
        })
        throw error
      }
    }
    const previousQueue = saveQueue
    let saveOperation: Promise<SaveGraphResponse>
    if (options?.keepalive && previousQueue) {
      // En quittant la page, rien ne s'exécutera après la sauvegarde en vol : on part tout de suite,
      // sur les révisions qu'elle produira.
      const current = get()
      saveOperation = performSave({
        document:
          revisionsInFlight.document !== null
            ? revisionsInFlight.document + 1
            : (current.documentRevision ?? 1),
        layout:
          revisionsInFlight.layout !== null
            ? revisionsInFlight.layout + 1
            : (current.layoutRevision ?? 1),
      })
    } else {
      saveOperation = previousQueue ? previousQueue.then(() => performSave()) : performSave()
    }
    const queueTail = Promise.all([previousQueue, saveOperation]).then(
      () => undefined,
      () => undefined,
    )
    saveQueue = queueTail
    void queueTail.then(() => {
      if (saveQueue === queueTail) {
        saveQueue = null
      }
    })
    return saveOperation
  },

  exportToUnity: (opts?: { keepStatusForDraft?: boolean }) => {
    const state = get()
    const keepStatus = opts?.keepStatusForDraft === true
    const doc = graphToDocument(state.nodes, state.edges) as {
      schemaVersion: string
      nodes: Array<Record<string, unknown>>
    }
    if (!keepStatus) {
      for (const n of doc.nodes) {
        if (n && typeof n === 'object' && 'status' in n) {
          delete n.status
        }
      }
    }
    return JSON.stringify(doc, null, 2)
  },
})
