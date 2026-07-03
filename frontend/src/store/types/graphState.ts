/**
 * Types et état initial du store graphe de dialogues.
 * Centralisé ici pour éviter les imports circulaires entre slices.
 */
import type { Node, Edge } from 'reactflow'
import type { SaveGraphResponse, ValidationErrorDetail } from '../../types/graph'
import type { DialogueFlagBinding } from '../../types/dialogueFlags'
import type { DocumentFieldError } from '../../utils/documentValidationFieldErrors'

/** Story 2.14 FR35: snapshot du graphe pour undo/redo (incl. SoT document + layout). */
export interface GraphSnapshot {
  nodes: Node[]
  edges: Edge[]
  /** Copie profonde au moment du snapshot ; null si pas de document SoT. */
  document: Record<string, unknown> | null
  /** Copie profonde au moment du snapshot ; null si pas de layout SoT. */
  layout: Record<string, unknown> | null
}

/** Story 2.9 FR30: types de nœuds pour filtrage (dialogue / test / end). */
export type NodeType = 'dialogue' | 'test' | 'end'

/** Story 2.9 FR30: filtres de vue graphe (masquage par type, restriction par speaker). */
export interface GraphFilters {
  hiddenTypes?: NodeType[]
  allowedSpeakers?: string[]
}

export type GraphLayoutSpacingMode = 'compact' | 'normal' | 'large'

export interface GraphMetadata {
  title: string
  filename?: string
  node_count: number
  edge_count: number
}

export interface GraphState {
  // Données
  nodes: Node[]
  edges: Edge[]
  selectedNodeId: string | null
  /** Story 2.10 FR31: IDs des nœuds en multi-sélection (shift-click, lasso). */
  selectedNodeIds: string[]
  dialogueMetadata: GraphMetadata

  // État UI
  isGenerating: boolean
  isLoading: boolean
  isSaving: boolean
  validationErrors: ValidationErrorDetail[]
  /** Bandeau contradictions explicites (champ API `summary_explicit_only`, FR39 AC #5). */
  loreExplicitValidationSummary: string | null
  /** True pendant l’appel validate-lore-explicit */
  loreExplicitValidationLoading: boolean
  highlightedNodeIds: string[]
  highlightedCycleNodes: string[]
  intentionalCycles: string[]

  // État pending save (auto-save vers backend, pas de draft local)
  hasUnsavedChanges: boolean
  lastSaveError: string | null
  /** Erreurs validation document mappées sur champs éditables (panneau Détails). */
  documentFieldErrors: DocumentFieldError[]
  lastSavedAt: number | null

  // ADR-006: seq + journal + statut sync
  clientSeq: number
  documentId: string | null
  syncStatus: 'synced' | 'offline' | 'error'
  lastAckSeq: number | null
  activeLoadSeq: number

  // Story 16.4 : SoT document + layout (load/save via API documents)
  document: Record<string, unknown> | null
  layout: Record<string, unknown> | null
  documentRevision: number | null
  layoutRevision: number | null

  /** Story 9.1 — liaisons catalogue ↔ valeurs initiales persistées dans le document. */
  dialogueFlagBindings: DialogueFlagBinding[]
  setDialogueFlagBindings: (bindings: DialogueFlagBinding[]) => void
  upsertDialogueFlagBinding: (binding: DialogueFlagBinding) => void
  removeDialogueFlagBinding: (flagId: string) => void

  // Modale confirmation suppression nœud (Supr.)
  showDeleteNodeConfirm: boolean

  // Story 2.9 FR30: filtres vue graphe (types nœuds, speakers)
  graphFilters: GraphFilters
  layoutSpacingMode: GraphLayoutSpacingMode

  // Story 2.14 FR35: undo/redo
  undoStack: GraphSnapshot[]
  redoStack: GraphSnapshot[]

  // Actions CRUD
  loadDialogue: (
    jsonContent: string,
    savedPositions?: Record<string, { x: number; y: number }>,
    filename?: string
  ) => Promise<void>
  loadDialogueByDocumentId: (documentId: string) => Promise<void>
  /** Charge depuis le JSON brut (projection frontend uniquement). Utilisé quand l’API documents renvoie 404. */
  loadDialogueFromRawJson: (jsonContent: string, documentId: string) => Promise<void>
  /** Incrémente la séquence de chargement pour annulation des requêtes obsolètes. */
  incrementLoadSeq: () => number
  /** Applique les résultats d'un chargement si la séquence correspond. */
  applyLoadResult: (params: {
    nodes: Node[]
    edges: Edge[]
    document: Record<string, unknown>
    layout: Record<string, unknown>
    metadata: GraphMetadata
    documentId: string
    documentRevision: number
    layoutRevision: number
    loadSeq: number
  }) => boolean
  addNode: (node: Node) => void
  /** Crée un nœud vide (sans LLM). Story 1.6 - FR6. */
  createEmptyNode: (position?: { x: number; y: number }) => Node
  /** @param skipMarkDirty Si true, n'appelle pas markDirty (batch: appeler markDirty une fois après). */
  updateNode: (nodeId: string, updates: Partial<Node>, skipMarkDirty?: boolean) => void
  /** Aligner `data.id` sur l'id React Flow (correctif validation missing_stable_id / data.id). */
  syncNodeDocumentId: (nodeId: string) => void
  /** Remplir `data.displayName` depuis la première ligne ou l'id (correctif missing_display_name). */
  syncNodeDisplayName: (nodeId: string) => void
  /** Lot de correctifs displayName ; retourne les ids effectivement mis à jour. */
  syncMissingDisplayNames: (nodeIds: string[]) => string[]
  /** @param skipMarkDirty Si true, n'appelle pas markDirty (batch: appeler markDirty une fois après). */
  /** @param skipPushUndoSnapshot Si true, ne pousse pas de snapshot (batch: un snapshot avant le lot). */
  deleteNode: (nodeId: string, skipMarkDirty?: boolean, skipPushUndoSnapshot?: boolean) => void
  /** Story 2.11 FR32: supprime les nœuds en lot ; retourne deleted/failed (avec raison si dispo) ; appelle markDirty une fois. */
  batchDeleteNodes: (nodeIds: string[]) => {
    deleted: string[]
    failed: Array<{ id: string; reason?: string }>
  }
  /** Story 2.11 FR32: applique un tag à tous les nœuds ; appelle markDirty une fois. */
  batchTagNodes: (nodeIds: string[], tag: string) => void
  connectNodes: (
    sourceId: string,
    targetId: string,
    choiceIndex?: number,
    connectionType?: string,
    sourceHandle?: string,
    /** Batch génération : un snapshot undo + markDirty une fois pour tout le lot. */
    txOptions?: { skipUndo?: boolean; skipMarkDirty?: boolean }
  ) => void
  /** @param skipMarkDirty Si true, n'appelle pas markDirty (utilisé pour batch : appeler markDirty une fois après). */
  disconnectNodes: (edgeId: string, skipMarkDirty?: boolean) => void
  /** Met à jour le libellé d'une edge de type choice (Story 2.5 AC #4). */
  updateChoiceEdgeLabel: (edgeId: string, newText: string) => void
  /** Normalise les couleurs des edges depuis le handle source parent. Retourne true si l'état a changé. */
  normalizeEdgeColors: (opts?: { skipMarkDirty?: boolean }) => boolean
  setSelectedNode: (nodeId: string | null) => void
  /** Story 2.10 FR31: définit la liste des nœuds sélectionnés (multi-sélection). selectedNodeId = premier de la liste pour l’éditeur. */
  setSelectedNodes: (nodeIds: string[]) => void
  /** Story 2.10 FR31: vide la sélection multiple et selectedNodeId. */
  clearSelection: () => void
  /** Story 2.8 FR29: centre le graphe sur le nœud et le sélectionne (setSelectedNode + graphViewStore.focusNode). No-op si nodeId absent. */
  jumpToNode: (nodeId: string) => void
  /** Story 2.8 FR29: recherche nœuds par ID exact ou nom (displayName / line). Retourne liste ordonnée (exact d'abord, puis partiels). */
  findNodesByQuery: (query: string) => Array<{ id: string; label: string }>
  /** Story 2.9 FR30: appliquer filtres (types, speakers). */
  setFilters: (filters: GraphFilters) => void
  /** Story 2.9 FR30: réinitialiser les filtres (équivalent setFilters({})). */
  resetFilters: () => void
  setLayoutSpacingMode: (mode: GraphLayoutSpacingMode) => void
  duplicateNode: (nodeId: string) => Node | null
  duplicateNodes: (nodeIds: string[]) => void
  /** @param skipMarkDirty Si true, n'appelle pas markDirty (batch: appeler markDirty une fois après). */
  /** @param pushUndoSnapshot Si true, pousse un snapshot avant la modification (ex. onNodeDragStop). */
  updateNodePosition: (
    nodeId: string,
    position: { x: number; y: number },
    skipMarkDirty?: boolean,
    pushUndoSnapshot?: boolean
  ) => void
  updateNodeDimensions: (
    nodeId: string,
    dimensions: { width: number; height: number }
  ) => void
  /** Batch dimension updates in one set() to avoid cascade re-renders (StoreUpdater loop). */
  updateNodeDimensionsBatch: (
    updates: Record<string, { width: number; height: number }>
  ) => void

  // Actions IA
  generateFromNode: (
    parentNodeId: string,
    instructions: string,
    options: Record<string, unknown>
  ) => Promise<{
    nodeId: string | null
    batchInfo?: {
      generatedChoices: number
      connectedChoices: number
      failedChoices: number
      totalChoices: number
    }
  }>

  // Accept/Reject nodes (Story 1.4)
  acceptNode: (nodeId: string) => Promise<void>
  rejectNode: (nodeId: string) => Promise<void>

  // Régénération (Story 1.10) - historique instructions
  addToRegenerationHistory: (nodeId: string, instructions: string) => void
  regenerateNode: (nodeId: string, newInstructions: string) => Promise<void>

  // Validation
  validateGraph: () => Promise<void>
  /** Retire les erreurs missing_display_name pour les nœuds corrigés (retour UI immédiat). */
  pruneMissingDisplayNameErrors: (nodeIds: string[]) => void
  /** FR38 — fusionne les erreurs lore avec la validation structurelle courante */
  validateLoreExplicit: (contextSelections?: Record<string, unknown>) => Promise<void>

  // Persistence
  saveDialogue: () => Promise<SaveGraphResponse>
  exportToUnity: (opts?: { keepStatusForDraft?: boolean }) => string

  // Layout
  applyAutoLayout: (algorithm: string, direction: string) => Promise<void>

  // Metadata
  updateMetadata: (updates: Partial<GraphMetadata>) => void

  // Reset
  resetGraph: () => void

  // Story 2.14 FR35: undo/redo
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  _pushUndoSnapshot: () => void
  clearUndoHistory: () => void

  // Recherche (Story 2.7 - FR28)
  setHighlightedNodes: (nodeIds: string[]) => void
  /** Filtre les nœuds par contenu texte (data.line) et/ou speaker (data.speaker). Retourne les node.id. */
  searchNodes: (query: string, filters?: { speaker?: string }) => string[]
  /** Liste des noms de speakers uniques dérivés des nœuds (pour filtre UI). */
  getUniqueSpeakers: () => string[]

  // Cycles intentionnels
  markCycleAsIntentional: (cycleId: string) => void
  unmarkCycleAsIntentional: (cycleId: string) => void

  // Pending save
  markDirty: () => void

  setShowDeleteNodeConfirm: (show: boolean) => void

  setDocumentFieldErrors: (errors: DocumentFieldError[]) => void
  clearDocumentFieldError: (nodeId: string, field: string) => void
  clearDocumentFieldErrors: () => void
}

export const initialState = {
  nodes: [] as Node[],
  edges: [] as Edge[],
  selectedNodeId: null as string | null,
  selectedNodeIds: [] as string[],
  dialogueMetadata: {
    title: 'Nouveau Dialogue',
    node_count: 0,
    edge_count: 0,
  } as GraphMetadata,
  isGenerating: false,
  isLoading: false,
  isSaving: false,
  validationErrors: [] as ValidationErrorDetail[],
  loreExplicitValidationSummary: null as string | null,
  loreExplicitValidationLoading: false,
  highlightedNodeIds: [] as string[],
  highlightedCycleNodes: [] as string[],
  intentionalCycles: (() => {
    try {
      const stored = localStorage.getItem('graph_intentional_cycles')
      return stored ? (JSON.parse(stored) as string[]) : []
    } catch {
      return [] as string[]
    }
  })(),
  hasUnsavedChanges: false,
  lastSaveError: null as string | null,
  documentFieldErrors: [] as DocumentFieldError[],
  lastSavedAt: null as number | null,
  showDeleteNodeConfirm: false,
  clientSeq: 1,
  documentId: null as string | null,
  syncStatus: 'synced' as const,
  lastAckSeq: null as number | null,
  activeLoadSeq: 0,
  document: null as Record<string, unknown> | null,
  layout: null as Record<string, unknown> | null,
  documentRevision: null as number | null,
  layoutRevision: null as number | null,
  dialogueFlagBindings: [] as DialogueFlagBinding[],
  graphFilters: {} as GraphFilters,
  layoutSpacingMode: 'normal' as GraphLayoutSpacingMode,
  undoStack: [] as GraphSnapshot[],
  redoStack: [] as GraphSnapshot[],
}
