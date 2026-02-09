/**
 * Store Zustand pour la gestion de l'état du graphe de dialogues.
 * Gère la conversion Unity JSON ↔ ReactFlow, actions CRUD.
 */
import { create } from 'zustand'
import type { Node, Edge } from 'reactflow'
import * as graphAPI from '../api/graph'
import * as documentsAPI from '../api/documents'
import type {
  SaveGraphResponse,
  ValidationErrorDetail,
} from '../types/graph'
import { documentToGraph, graphToDocument, buildLayoutFromNodes } from '../utils/documentToGraph'
import { saveNodePositions, loadNodePositions, type NodePositions } from '../utils/nodePositions'
import {
  getParentChoiceForTestNode,
  syncTestNodeFromChoice,
  syncChoiceFromTestNode,
  TEST_HANDLE_TO_CHOICE_FIELD,
} from '../utils/testNodeSync'
import type { Choice } from '../schemas/nodeEditorSchema'
import {
  buildChoiceEdge,
  choiceEdgeId,
  truncateChoiceLabel,
} from '../utils/graphEdgeBuilders'
import {
  setPending as journalSetPending,
  writeSnapshot as journalWriteSnapshot,
  clearPending as journalClearPending,
} from '../utils/graphJournal'

const VALID_NODE_TYPES = ['dialogueNode', 'testNode', 'endNode'] as const

function ensureValidNode(
  node: { id: string; type: string; position: { x: number; y: number }; data: unknown }
): Node {
  const x = typeof node.position?.x === 'number' ? node.position.x : 0
  const y = typeof node.position?.y === 'number' ? node.position.y : 0
  const type = VALID_NODE_TYPES.includes(node.type as (typeof VALID_NODE_TYPES)[number])
    ? node.type
    : 'dialogueNode'
  return {
    id: node.id,
    type,
    position: { x, y },
    data: node.data ?? {},
  }
}

/**
 * Normalise les nodes pour garantir la synchronisation TestBar ↔ choix.
 * 
 * Règle : Pour chaque DialogueNode avec choix ayant un test,
 * un TestBar doit exister. Si le choix n'a plus de test, le TestBar doit être supprimé.
 * 
 * @param nodes - Liste des nodes à normaliser
 * @param edges - Liste des edges à normaliser
 * @returns Nodes et edges normalisés avec TestBars synchronisés
 */
function normalizeTestBars(nodes: Node[], edges: Edge[]): { nodes: Node[], edges: Edge[] } {
  let normalizedNodes = [...nodes]
  let normalizedEdges = [...edges]
  
  // Parcourir tous les DialogueNodes
  normalizedNodes.forEach((node) => {
    if (node.type === 'dialogueNode') {
      const choices = (node.data.choices || []) as Choice[]
      
      choices.forEach((choice, choiceIndex) => {
        const choiceId = (choice as Choice & { choiceId?: string }).choiceId
        const testBarId = choiceId ? `test:${choiceId}` : `test-node-${node.id}-choice-${choiceIndex}`
        const existingTestBar = normalizedNodes.find((n) => n.id === testBarId)
        
        // Synchroniser TestBar depuis le choix
        const syncResult = syncTestNodeFromChoice(
          choice,
          choiceIndex,
          node.id,
          node.position,
          existingTestBar || null,
          normalizedEdges,
          normalizedNodes
        )
        
        // Mettre à jour ou supprimer le TestBar
        if (syncResult.testNode) {
          const testBarIndex = normalizedNodes.findIndex((n) => n.id === testBarId)
          if (testBarIndex !== -1) {
            normalizedNodes[testBarIndex] = syncResult.testNode
          } else {
            normalizedNodes.push(syncResult.testNode)
          }
        } else {
          // Supprimer le TestBar s'il existe
          normalizedNodes = normalizedNodes.filter((n) => n.id !== testBarId)
        }
        
        normalizedEdges = syncResult.edges
        
        // Nettoyer targetNode si le choix a un test
        if (choice.test && choice.targetNode) {
          const nodeIndex = normalizedNodes.findIndex((n) => n.id === node.id)
          if (nodeIndex !== -1) {
            const updatedDialogueNode = normalizedNodes[nodeIndex]
            const updatedChoices = (updatedDialogueNode.data.choices as Choice[]).map((c, idx) =>
              idx === choiceIndex
                ? { ...c, targetNode: undefined }
                : c
            )
            normalizedNodes[nodeIndex] = {
              ...updatedDialogueNode,
              data: {
                ...updatedDialogueNode.data,
                choices: updatedChoices,
              },
            }
          }
        }
      })
    }
  })
  
  return { nodes: normalizedNodes, edges: normalizedEdges }
}

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
  dialogueMetadata: GraphMetadata
  
  // État UI
  isGenerating: boolean
  isLoading: boolean
  isSaving: boolean
  validationErrors: ValidationErrorDetail[]
  highlightedNodeIds: string[] // Pour la recherche
  highlightedCycleNodes: string[] // Pour les nœuds dans des cycles
  intentionalCycles: string[] // IDs des cycles marqués comme intentionnels (persisté localStorage)
  
  // État pending save (auto-save vers backend, pas de draft local)
  hasUnsavedChanges: boolean
  lastSaveError: string | null // Message d'erreur si la dernière sauvegarde a échoué (pour indicateur)
  lastSavedAt: number | null // Timestamp de la dernière sauvegarde réussie (pour indicateur)

  // ADR-006: seq + journal + statut sync
  clientSeq: number // Prochaine séquence à envoyer
  documentId: string | null // ID stable du document (ex. filename)
  syncStatus: 'synced' | 'offline' | 'error'
  lastAckSeq: number | null // Dernier seq reconnu par le serveur (pour UI "Synced (seq …)")

  // Story 16.4 : SoT document + layout (load/save via API documents)
  document: Record<string, unknown> | null // Document canonique (schemaVersion, nodes)
  layout: Record<string, unknown> | null // Layout (positions, viewport)
  documentRevision: number | null
  layoutRevision: number | null
  loadDialogueByDocumentId: (documentId: string) => Promise<void>

  // Actions CRUD
  loadDialogue: (
    jsonContent: string,
    savedPositions?: Record<string, { x: number; y: number }>,
    filename?: string
  ) => Promise<void>
  addNode: (node: Node) => void
  /** Crée un nœud vide (sans LLM). Story 1.6 - FR6. Retourne le nœud ; l'appelant appelle addNode + setSelectedNode. */
  createEmptyNode: (position?: { x: number; y: number }) => Node
  updateNode: (nodeId: string, updates: Partial<Node>) => void
  deleteNode: (nodeId: string) => void
  connectNodes: (
    sourceId: string,
    targetId: string,
    choiceIndex?: number,
    connectionType?: string
  ) => void
  disconnectNodes: (edgeId: string) => void
  setSelectedNode: (nodeId: string | null) => void
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void
  
  // Actions IA
  generateFromNode: (
    parentNodeId: string,
    instructions: string,
    options: Record<string, unknown>
  ) => Promise<{ nodeId: string | null; batchInfo?: {
    generatedChoices: number
    connectedChoices: number
    failedChoices: number
    totalChoices: number
  } }> // Retourne le nodeId du nouveau nœud généré + infos batch
  
  // Accept/Reject nodes (Task 3 - Story 1.4)
  acceptNode: (nodeId: string) => Promise<void>
  rejectNode: (nodeId: string) => Promise<void>
  
  // Validation
  validateGraph: () => Promise<void>
  
  // Persistence
  saveDialogue: () => Promise<SaveGraphResponse>
  exportToUnity: (opts?: { keepStatusForDraft?: boolean }) => string
  
  // Layout
  applyAutoLayout: (algorithm: string, direction: string) => Promise<void>
  
  // Metadata
  updateMetadata: (updates: Partial<GraphMetadata>) => void
  
  // Reset
  resetGraph: () => void
  
  // Recherche
  setHighlightedNodes: (nodeIds: string[]) => void
  
  // Cycles intentionnels
  markCycleAsIntentional: (cycleId: string) => void
  unmarkCycleAsIntentional: (cycleId: string) => void
  
  // Pending save (déclenche auto-save backend via debounce dans GraphEditor)
  markDirty: () => void

  // Modale confirmation suppression nœud (Supr.)
  showDeleteNodeConfirm: boolean
  setShowDeleteNodeConfirm: (show: boolean) => void
}

const initialState = {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  dialogueMetadata: {
    title: 'Nouveau Dialogue',
    node_count: 0,
    edge_count: 0,
  },
  isGenerating: false,
  isLoading: false,
  isSaving: false,
  validationErrors: [],
  highlightedNodeIds: [],
  highlightedCycleNodes: [],
  intentionalCycles: (() => {
    // Charger depuis localStorage au démarrage
    try {
      const stored = localStorage.getItem('graph_intentional_cycles')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })(),
  hasUnsavedChanges: false,
  lastSaveError: null,
  lastSavedAt: null,
  showDeleteNodeConfirm: false,
  clientSeq: 1,
  documentId: null,
  syncStatus: 'synced' as const,
  lastAckSeq: null,
  document: null,
  layout: null,
  documentRevision: null,
  layoutRevision: null,
}

export const useGraphStore = create<GraphState>()((set, get) => ({
      ...initialState,
      
      // Charger un dialogue Unity JSON
      loadDialogue: async (jsonContent: string, savedPositions?: Record<string, { x: number; y: number }>, explicitFilename?: string) => {
        set({ isLoading: true })
        try {
          const response = await graphAPI.loadGraph({ json_content: jsonContent })

          // Charger les positions depuis localStorage (clé dédiée)
          // Utiliser le filename passé en paramètre en priorité, sinon celui des métadonnées
          const filename = explicitFilename || response.metadata.filename
          const persistedPositions = filename ? loadNodePositions(filename) : null

          // Convertir les nœuds en format ReactFlow (position et type garantis pour l'affichage)
          // Priorité : positions localStorage > positions draft (savedPositions) > positions backend
          const nodes: Node[] = response.nodes.map((node: { id: string; type: string; position?: { x: number; y: number }; data?: unknown }) => {
            const raw = ensureValidNode({
              id: node.id,
              type: node.type ?? 'dialogueNode',
              position: node.position ?? { x: 0, y: 0 },
              data: node.data,
            })
            const position = persistedPositions?.[node.id] ?? savedPositions?.[node.id] ?? raw.position
            return {
              ...raw,
              position: typeof position?.x === 'number' && typeof position?.y === 'number'
                ? position
                : raw.position,
            }
          })
          
          // Convertir les edges
          const edges: Edge[] = response.edges.map((edge: { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string; label?: string }) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            type: edge.type || 'default',
            label: edge.label,
            data: edge.data,
            ...(edge.sourceHandle && { sourceHandle: edge.sourceHandle }), // Préserver sourceHandle si présent
          }))
          
          // Normaliser pour garantir la synchronisation TestBar ↔ choix après chargement
          const normalized = normalizeTestBars(nodes, edges)
          set({
            nodes: normalized.nodes,
            edges: normalized.edges,
            dialogueMetadata: {
              title: response.metadata.title,
              node_count: normalized.nodes.length,
              edge_count: normalized.edges.length,
              filename: filename, // Utiliser le filename résolu (explicitFilename ou metadata)
            },
            isLoading: false,
            validationErrors: [],
            highlightedCycleNodes: [], // Réinitialiser highlight cycles lors du chargement
            hasUnsavedChanges: false,
            lastSaveError: null,
            lastSavedAt: null,
            documentId: filename ?? null,
            syncStatus: 'synced',
            lastAckSeq: null,
          })

          // Ne pas restaurer le journal après un chargement API explicite : l'utilisateur doit voir
          // l'état serveur. Restaurer le pending écrase avec un état IndexedDB qui peut être invalide
          // (positions/type manquants après désérialisation) et empêche l'affichage des nœuds (bug).
          // Le journal reste écrit pour une future restauration (ex. après refresh) si on l'implémente.
        } catch (error) {
          console.error('Erreur lors du chargement du graphe:', error)
          set({ isLoading: false })
          throw error
        }
      },

      // Story 16.4 : Charger par id via API documents (GET document + GET layout)
      loadDialogueByDocumentId: async (documentId: string) => {
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
          const layoutPositions = layoutBlob?.nodes ? { nodes: layoutBlob.nodes as Record<string, { x: number; y: number }> } : undefined
          const { nodes: projectedNodes, edges: projectedEdges } = documentToGraph(doc, layoutPositions)
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
            hasUnsavedChanges: false,
            lastSaveError: null,
            lastSavedAt: null,
            syncStatus: 'synced',
            lastAckSeq: null,
          })
        } catch (error: unknown) {
          console.error('Erreur chargement document:', error)
          set({ isLoading: false })
          // Story 16.5 (AC3) : message clair si document v1.1.0 sans choiceId (migration requise)
          const err = error as { response?: { status?: number; data?: { error?: { code?: string } } } }
          if (
            (err?.response?.status === 422 || err?.response?.status === 400) &&
            err?.response?.data?.error?.code === 'missing_choice_id'
          ) {
            throw new Error('Ce dialogue doit être migré avec l\'outil de migration choiceId.')
          }
          throw error
        }
      },

      // Ajouter un nœud
      addNode: (node: Node) => {
        const state = get()
        const newNodes = [...state.nodes, node]

        // Normaliser pour garantir la synchronisation TestBar ↔ choix
        const normalized = normalizeTestBars(newNodes, state.edges)

        // En ajoutant un dialogueNode (panneau Détails ou barre « Nouveau nœud »), ne pas
        // écraser edges : connectNodes sera appelé juste après pour lier le choix ; garder
        // state.edges évite de perdre les liaisons déjà présentes (ex. choice 0).
        const edgesToSet =
          node.type === 'dialogueNode' ? state.edges : normalized.edges

        // Story 16.4 : en mode document SoT, garder document/layout synchronisés (addNode modifie la projection)
        const isDocumentSoT = state.document != null && state.layout != null
        const docAndLayout = isDocumentSoT
          ? (() => {
              const doc = graphToDocument(normalized.nodes, edgesToSet) as unknown as Record<string, unknown>
              const newPositions = buildLayoutFromNodes(normalized.nodes)
              const layoutNodes = (state.layout as Record<string, unknown>)?.['nodes'] as Record<string, { x: number; y: number }> | undefined
              const mergedNodes = { ...layoutNodes, ...newPositions.nodes }
              const newLayout = { ...state.layout, nodes: mergedNodes } as Record<string, unknown>
              return { document: doc, layout: newLayout }
            })()
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
        // Marquer dirty pour auto-save draft (Task 1 - Story 0.5)
        get().markDirty()
      },

      // Créer un nœud vide sans LLM (Story 1.6 - FR6). Retourne le nœud ; l'action appelle addNode(node) puis setSelectedNode(node.id).
      createEmptyNode: (position?: { x: number; y: number }) => {
        const id = `manual-${crypto.randomUUID()}`
        const pos = position ?? { x: 0, y: 0 }
        const node: Node = {
          id,
          type: 'dialogueNode',
          position: pos,
          data: {
            id,
            speaker: '',
            line: '',
            choices: [],
          },
        }
        return node
      },
      
      // Mettre à jour un nœud
      updateNode: (nodeId: string, updates: Partial<Node>) => {
        set((state) => {
          const node = state.nodes.find((n) => n.id === nodeId)
          if (!node) {
            return state
          }

          // Story 16.4 Task 2.2 : en mode document SoT, patcher le document puis recalculer la projection
          if (state.document != null && state.layout != null) {
            const doc = JSON.parse(JSON.stringify(state.document)) as Record<string, unknown>
            const nodesArray = (doc.nodes as Record<string, unknown>[]) ?? []
            if (node.type === 'testNode') {
              const parent = getParentChoiceForTestNode(nodeId, state.nodes)
              if (!parent) return state
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
              if (!docNode || !Array.isArray(docNode.choices)) return state
              const choices = docNode.choices as Record<string, unknown>[]
              if (parent.choiceIndex < choices.length) {
                choices[parent.choiceIndex] = updatedChoice as unknown as Record<string, unknown>
              }
            } else {
              const docNode = nodesArray.find(
                (n: Record<string, unknown>) => n.id === nodeId
              ) as Record<string, unknown> | undefined
              if (!docNode) return state
              const data = updates.data as Record<string, unknown> | undefined
              if (data) {
                if (data.line !== undefined) docNode.line = data.line
                if (data.speaker !== undefined) docNode.speaker = data.speaker
                if (data.nextNode !== undefined) docNode.nextNode = data.nextNode
                if (data.choices !== undefined) docNode.choices = data.choices
              }
            }
            const layoutPositions = state.layout as { nodes?: Record<string, { x: number; y: number }> }
            const { nodes: projectedNodes, edges: projectedEdges } = documentToGraph(
              doc,
              layoutPositions
            )
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

          // Si c'est un TestNode, rediriger vers le choix parent
          if (node.type === 'testNode') {
            const parent = getParentChoiceForTestNode(nodeId, state.nodes)
            if (parent) {
              // Appliquer les updates au TestNode
              const updatedTestNode = { ...node, ...updates } as Node

              // Synchroniser le choix parent depuis le TestNode (testNode → choice)
              const updatedChoice = syncChoiceFromTestNode(
                updatedTestNode,
                parent.dialogueNodeId,
                parent.choiceIndex,
                parent.choice
              )

              // Mettre à jour le DialogueNode avec le choix modifié
              const updatedDialogueNode = {
                ...parent.dialogueNode,
                data: {
                  ...parent.dialogueNode.data,
                  choices: (parent.dialogueNode.data.choices as Choice[]).map((choice, idx) =>
                    idx === parent.choiceIndex ? updatedChoice : choice
                  ),
                },
              }

              // Remplacer le DialogueNode dans la liste
              const newNodes = state.nodes.map((n) =>
                n.id === parent.dialogueNodeId ? updatedDialogueNode : n
              )

              // Synchroniser le TestNode depuis le choix mis à jour (choice → testNode)
              // pour garantir la cohérence
              const syncResult = syncTestNodeFromChoice(
                updatedChoice,
                parent.choiceIndex,
                parent.dialogueNodeId,
                updatedDialogueNode.position,
                updatedTestNode,
                state.edges,
                newNodes
              )

              // Mettre à jour ou supprimer le TestNode selon le résultat
              let finalNodes = newNodes
              if (syncResult.testNode) {
                // Mettre à jour le TestNode
                finalNodes = finalNodes.map((n) =>
                  n.id === nodeId ? syncResult.testNode! : n
                )
              } else {
                // Supprimer le TestNode (si le test a été supprimé du choix)
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
            // Si parent non trouvé, retourner state inchangé
            return state
          }

          // Logique existante pour DialogueNode
          const updatedNodes = state.nodes.map((node) =>
            node.id === nodeId ? { ...node, ...updates } : node
          )

          // Trouver le nœud mis à jour
          const updatedNode = updatedNodes.find((n) => n.id === nodeId)
          if (!updatedNode || updatedNode.type !== 'dialogueNode') {
            return { ...state, nodes: updatedNodes }
          }

          // Vérifier si un choix a obtenu ou perdu un attribut test
          const updatedData = updatedNode.data as {
            choices?: Choice[]
            [key: string]: unknown
          }
          const choices = updatedData?.choices || []

          const newNodes = [...updatedNodes]
          // Exclure uniquement les edges dont la source est un TestNode (test→résultat) ;
          // garder les edges dialogue→test pour mise à jour du label en place (évite clignotement)
          const testNodeIdsForThisDialogue = choices.map(
            (_, idx) => `test-node-${nodeId}-choice-${idx}`
          )
          let newEdges = state.edges.filter(
            (e) => !testNodeIdsForThisDialogue.includes(e.source)
          )

          // Parcourir tous les choix pour détecter les changements
          choices.forEach((choice: Choice, choiceIndex: number) => {
            // Récupérer le node mis à jour depuis newNodes (peut avoir été modifié dans une itération précédente)
            const currentDialogueNode = newNodes.find((n) => n.id === nodeId)
            if (!currentDialogueNode || currentDialogueNode.type !== 'dialogueNode') {
              return
            }
            const currentChoices = (currentDialogueNode.data.choices || []) as Choice[]
            const currentChoice = currentChoices[choiceIndex] || choice
            
            const choiceId = (currentChoice as Choice & { choiceId?: string }).choiceId
            const testNodeId = choiceId ? `test:${choiceId}` : `test-node-${nodeId}-choice-${choiceIndex}`
            const existingTestNode = newNodes.find((n) => n.id === testNodeId)

            // Utiliser syncTestNodeFromChoice pour synchroniser
            // Passer newEdges et newNodes pour vérifier l'existence des nœuds cibles
            // Note: newEdges est accumulé à chaque itération pour préserver les edges des choix précédents
            const syncResult = syncTestNodeFromChoice(
              currentChoice,
              choiceIndex,
              nodeId,
              currentDialogueNode.position,
              existingTestNode || null,
              newEdges,
              newNodes
            )

            // Mettre à jour ou supprimer le TestNode
            if (syncResult.testNode) {
              const testNodeIndex = newNodes.findIndex((n) => n.id === testNodeId)
              if (testNodeIndex !== -1) {
                newNodes[testNodeIndex] = syncResult.testNode
              } else {
                newNodes.push(syncResult.testNode)
              }
            } else {
              // Supprimer le TestNode s'il existe
              const testNodeIndex = newNodes.findIndex((n) => n.id === testNodeId)
              if (testNodeIndex !== -1) {
                newNodes.splice(testNodeIndex, 1)
              }
            }

            // Accumuler les edges : syncResult.edges contient les edges existants passés en paramètre
            // + les nouveaux edges TestNode créés/mis à jour
            // Donc on peut simplement utiliser syncResult.edges qui inclut déjà tout
            newEdges = syncResult.edges

            // Supprimer l'edge directe vers targetNode si elle existe (choix avec test n'a pas de targetNode direct)
            if (currentChoice.test) {
              // Si le choix a un test, targetNode doit être undefined
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
              
              // Nettoyer targetNode si présent
              if (currentChoice.targetNode) {
                const dialogueNodeIndex = newNodes.findIndex((n) => n.id === nodeId)
                if (dialogueNodeIndex !== -1) {
                  const updatedDialogueNode = newNodes[dialogueNodeIndex]
                  const updatedChoices = (updatedDialogueNode.data.choices as Choice[]).map((c, idx) =>
                    idx === choiceIndex
                      ? { ...c, targetNode: undefined }
                      : c
                  )
                  newNodes[dialogueNodeIndex] = {
                    ...updatedDialogueNode,
                    data: {
                      ...updatedDialogueNode.data,
                      choices: updatedChoices,
                    },
                  }
                }
              }
            }
            // Si pas de test et currentChoice.targetNode : on garde l'edge choix→targetNode
            // (aucune suppression ; le bloc "Mettre à jour le label" plus bas gère le label en place)
          })

          // Mettre à jour le label des edges choix → targetNode quand le texte du choix change
          // Ne créer un nouvel objet edge que si le label a réellement changé (évite scintillement)
          const dialogueNodeAfter = newNodes.find((n) => n.id === nodeId)
          if (dialogueNodeAfter?.type === 'dialogueNode' && dialogueNodeAfter.data?.choices) {
            const choicesAfter = dialogueNodeAfter.data.choices as Choice[]
            newEdges = newEdges.map((e) => {
              if (e.source === nodeId && (e.sourceHandle?.startsWith('choice:') || e.sourceHandle?.startsWith('choice-'))) {
                const idx = e.sourceHandle.startsWith('choice:')
                  ? (choicesAfter as (Choice & { choiceId?: string })[]).findIndex((c, i) => (c?.choiceId ?? `__idx_${i}`) === e.sourceHandle!.slice(7))
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
          // (ADR-006 : debounce 100 ms pousse souvent ; réutiliser l'objet edge si inchangé)
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

          // Réutiliser state.edges si aucune référence n'a changé (évite re-render inutile)
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
        })
        // Marquer dirty pour auto-save draft (Task 1 - Story 0.5)
        get().markDirty()
      },
      
      // Supprimer un nœud
      deleteNode: (nodeId: string) => {
        set((state) => {
          // Si c'est un TestNode, supprimer le test du choix parent
          if (nodeId.startsWith('test-node-')) {
            const parent = getParentChoiceForTestNode(nodeId, state.nodes)
            
            if (parent) {
              // Supprimer le champ test et tous les champs test*Node du choix
              const updatedChoices = (parent.dialogueNode.data.choices as Choice[]).map(
                (choice, idx) => {
                  if (idx === parent.choiceIndex) {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructure to omit test* fields from rest
                  const { test, testCriticalFailureNode, testFailureNode, testSuccessNode, testCriticalSuccessNode, ...rest } = choice
                    return rest
                  }
                  return choice
                }
              )

              // Mettre à jour le DialogueNode avec le choix modifié
              const updatedDialogueNode = {
                ...parent.dialogueNode,
                data: {
                  ...parent.dialogueNode.data,
                  choices: updatedChoices,
                },
              }

              // Remplacer le DialogueNode dans la liste
              const newNodes = state.nodes.map((n) =>
                n.id === parent.dialogueNodeId ? updatedDialogueNode : n
              )

              // Supprimer le TestNode et toutes ses edges
              const finalNodes = newNodes.filter((n) => n.id !== nodeId)
              const newEdges = state.edges.filter(
                (e) => e.source !== nodeId && e.target !== nodeId
              )

              // Mettre à jour selectedNodeId si le TestNode était sélectionné
              const selectedNodeToRemove = state.selectedNodeId === nodeId
              
              // Si le TestNode était sélectionné, sélectionner automatiquement le DialogueNode parent
              // pour que l'utilisateur voie que le test a été supprimé du choix
              const newSelectedNodeId = selectedNodeToRemove 
                ? parent.dialogueNodeId  // Sélectionner le DialogueNode parent
                : state.selectedNodeId

              return {
                nodes: finalNodes,
                edges: newEdges,
                selectedNodeId: newSelectedNodeId,
                dialogueMetadata: {
                  ...state.dialogueMetadata,
                  node_count: finalNodes.length,
                  edge_count: newEdges.length,
                },
              }
            }
            // Si parent non trouvé, supprimer simplement le TestNode
            const newNodes = state.nodes.filter((n) => n.id !== nodeId)
            const newEdges = state.edges.filter(
              (e) => e.source !== nodeId && e.target !== nodeId
            )
            const selectedNodeToRemove = state.selectedNodeId === nodeId

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
          }

          // Logique existante pour DialogueNode : supprimer le nœud et tous ses TestNodes associés
          // Identifier les TestNodes associés (test-node-{nodeId}-choice-{index} ou test:choiceId ADR-008)
          const dialogueNode = state.nodes.find((n) => n.id === nodeId)
          const testNodePrefix = `test-node-${nodeId}-`
          const byPrefix = state.nodes.filter((n) => n.id.startsWith(testNodePrefix)).map((n) => n.id)
          const byChoiceId = (dialogueNode?.data?.choices ?? [])
            .map((c) => (c as Choice & { choiceId?: string }).choiceId ? `test:${(c as Choice & { choiceId?: string }).choiceId}` : null)
            .filter((id): id is string => id != null)
          const associatedTestNodeIds = [...new Set([...byPrefix, ...byChoiceId])]

          // Supprimer le nœud principal et tous les TestNodes associés
          const nodesToDelete = [nodeId, ...associatedTestNodeIds]
          let newNodes = state.nodes.filter((n) => !nodesToDelete.includes(n.id))

          // Nettoyer toutes les références vers les nœuds supprimés dans les nœuds restants
          newNodes = newNodes.map((node) => {
            // Nettoyer les références dans les DialogueNodes
            if (node.type === 'dialogueNode') {
              const data = node.data as { choices?: Choice[], nextNode?: string }
              const updatedData = { ...data }

              // Nettoyer nextNode si il référence un nœud supprimé
              if (updatedData.nextNode && nodesToDelete.includes(updatedData.nextNode)) {
                delete updatedData.nextNode
              }

              // Nettoyer les références dans les choix
              if (data.choices) {
                updatedData.choices = data.choices.map((choice) => {
                  const updatedChoice = { ...choice }

                  // Nettoyer targetNode
                  if (updatedChoice.targetNode && nodesToDelete.includes(updatedChoice.targetNode)) {
                    delete updatedChoice.targetNode
                  }

                  // Nettoyer les références de test
                  if (updatedChoice.testCriticalFailureNode && nodesToDelete.includes(updatedChoice.testCriticalFailureNode)) {
                    delete updatedChoice.testCriticalFailureNode
                  }
                  if (updatedChoice.testFailureNode && nodesToDelete.includes(updatedChoice.testFailureNode)) {
                    delete updatedChoice.testFailureNode
                  }
                  if (updatedChoice.testSuccessNode && nodesToDelete.includes(updatedChoice.testSuccessNode)) {
                    delete updatedChoice.testSuccessNode
                  }
                  if (updatedChoice.testCriticalSuccessNode && nodesToDelete.includes(updatedChoice.testCriticalSuccessNode)) {
                    delete updatedChoice.testCriticalSuccessNode
                  }

                  return updatedChoice
                })
              }

              return {
                ...node,
                data: updatedData,
              }
            }

            // Nettoyer les références dans les TestNodes
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

              return {
                ...node,
                data: updatedData,
              }
            }

            return node
          })

          // Supprimer aussi les edges liés (source ou target = nodeId ou TestNode associé)
          const newEdges = state.edges.filter(
            (e) => !nodesToDelete.includes(e.source) && !nodesToDelete.includes(e.target)
          )

          // Mettre à jour le selectedNodeId si le nœud supprimé ou un TestNode associé était sélectionné
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
        // Marquer dirty pour auto-save draft (Task 1 - Story 0.5)
        get().markDirty()
      },
      
      // Connecter deux nœuds
      connectNodes: (
        sourceId: string,
        targetId: string,
        choiceIndex?: number,
        connectionType: string = 'default',
        sourceHandle?: string
      ) => {
        const state = get()

        // Extraire le sourceHandle depuis connectionType si c'est un type de test
        let actualSourceHandle = sourceHandle
        if (!actualSourceHandle && connectionType.startsWith('test-')) {
          actualSourceHandle = connectionType.replace('test-', '')
        }
        
        // Générer un ID unique pour l'edge
        const edgeId = actualSourceHandle
          ? `${sourceId}-${actualSourceHandle}-${targetId}`
          : choiceIndex !== undefined
          ? `${sourceId}-choice${choiceIndex}->${targetId}`
          : `${sourceId}->${targetId}`
        
        // Vérifier si l'edge existe déjà
        if (state.edges.some((e) => e.id === edgeId)) {
          return
        }

        // Connexion via choix (panneau Détails ou drag) : edge via buildChoiceEdge (DRY)
        const isChoiceConnection =
          choiceIndex !== undefined && !actualSourceHandle
        const sourceNodeForChoice = isChoiceConnection
          ? state.nodes.find((n) => n.id === sourceId)
          : null
        const choiceAt = sourceNodeForChoice?.data?.choices?.[choiceIndex != null ? choiceIndex : 0] as (Choice & { choiceId?: string }) | undefined
        const choiceText = choiceAt?.text
        const choiceId = choiceAt?.choiceId
        const newEdge: Edge = isChoiceConnection
          ? buildChoiceEdge({
              sourceId,
              targetId,
              choiceIndex: choiceIndex!,
              choiceText,
              choiceId,
              edgeId: choiceId ? `e:${sourceId}:choice:${choiceId}:${targetId}` : choiceEdgeId(sourceId, choiceIndex!, targetId),
            })
          : {
              id: edgeId,
              source: sourceId,
              target: targetId,
              ...(actualSourceHandle && { sourceHandle: actualSourceHandle }),
              type: 'default',
              data: {
                edgeType: connectionType,
                choiceIndex,
              },
            }
        
        let newEdges = [...state.edges, newEdge]

        // Mettre à jour les nœuds selon le type de connexion
        let updatedNodes = [...state.nodes]
        const sourceNodeIndex = updatedNodes.findIndex((n) => n.id === sourceId)
        
        if (sourceNodeIndex !== -1) {
          const sourceNode = updatedNodes[sourceNodeIndex]
          
          // Gérer les connexions depuis un TestNode (avec sourceHandle pour les 4 résultats)
          if (actualSourceHandle && (actualSourceHandle === 'critical-failure' || actualSourceHandle === 'failure' || actualSourceHandle === 'success' || actualSourceHandle === 'critical-success')) {
            // Trouver le choix parent du TestNode
            const parent = getParentChoiceForTestNode(sourceId, state.nodes)
            if (parent && TEST_HANDLE_TO_CHOICE_FIELD[actualSourceHandle]) {
              // Mettre à jour le champ test*Node dans le choix parent (Source of Truth)
              const fieldName = TEST_HANDLE_TO_CHOICE_FIELD[actualSourceHandle]
              const updatedChoices = (parent.dialogueNode.data.choices as Choice[]).map(
                (choice, idx) =>
                  idx === parent.choiceIndex
                    ? { ...choice, [fieldName]: targetId }
                    : choice
              )

              // Mettre à jour le DialogueNode avec le choix modifié
              const updatedDialogueNode = {
                ...parent.dialogueNode,
                data: {
                  ...parent.dialogueNode.data,
                  choices: updatedChoices,
                },
              }

              // Remplacer le DialogueNode dans la liste
              updatedNodes = updatedNodes.map((n) =>
                n.id === parent.dialogueNodeId ? updatedDialogueNode : n
              )

              // Synchroniser le TestNode depuis le choix mis à jour (choice → testNode)
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

              // Mettre à jour le TestNode
              if (syncResult.testNode) {
                updatedNodes = updatedNodes.map((n) =>
                  n.id === sourceId ? syncResult.testNode! : n
                )
              }

              // Mettre à jour les edges avec ceux retournés par syncTestNodeFromChoice
              newEdges = syncResult.edges
            } else {
              // Fallback : mettre à jour le champ correspondant dans le TestNode (pour compatibilité)
              const fieldMapping: Record<string, string> = {
                'critical-failure': 'criticalFailureNode',
                'failure': 'failureNode',
                'success': 'successNode',
                'critical-success': 'criticalSuccessNode',
              }
              const fieldName = fieldMapping[actualSourceHandle]
              if (fieldName) {
                updatedNodes[sourceNodeIndex] = {
                  ...sourceNode,
                  data: {
                    ...sourceNode.data,
                    [fieldName]: targetId,
                  },
                }
              }
            }
          } else if (choiceIndex !== undefined) {
            // Connexion via choix (DialogueNode)
            if (sourceNode.data?.choices && sourceNode.data.choices[choiceIndex]) {
              const choice = sourceNode.data.choices[choiceIndex] as Choice

              // BUG FIX: Ne pas mettre à jour targetNode si :
              // 1. Le target est un TestBar (commence par "test-node-")
              // 2. Le choix a déjà un test (les connexions se font via les TestTargets)
              const isTargetTestBar = targetId.startsWith('test-node-')
              const choiceHasTest = !!choice.test
              
              if (isTargetTestBar || choiceHasTest) {
                // Ne pas mettre à jour targetNode - les connexions se font via les TestTargets
                // Le TestBar est géré par syncTestNodeFromChoice
                // Ne rien faire ici, la connexion est déjà créée dans newEdge
              } else {
                // Mettre à jour targetNode uniquement si pas de test
                const newChoices = (sourceNode.data.choices as Choice[]).map((c, idx) =>
                  idx === choiceIndex
                    ? { ...c, targetNode: targetId }
                    : c
                )
                updatedNodes[sourceNodeIndex] = {
                  ...sourceNode,
                  data: {
                    ...sourceNode.data,
                    choices: newChoices,
                  },
                }
              }
            }
          } else if (connectionType === 'nextNode') {
            // Mettre à jour nextNode dans le parent pour navigation linéaire
            updatedNodes[sourceNodeIndex] = {
              ...sourceNode,
              data: {
                ...sourceNode.data,
                nextNode: targetId,
              },
            }
          }
        }
        
        // Story 16.4 : en mode document SoT, garder document/layout synchronisés (connectNodes modifie la projection)
        const isDocumentSoT = state.document != null && state.layout != null
        const docAndLayout = isDocumentSoT
          ? (() => {
              const doc = graphToDocument(updatedNodes, newEdges) as unknown as Record<string, unknown>
              const newPositions = buildLayoutFromNodes(updatedNodes)
              const layoutNodes = (state.layout as Record<string, unknown>)?.['nodes'] as Record<string, { x: number; y: number }> | undefined
              const mergedNodes = { ...layoutNodes, ...newPositions.nodes }
              const newLayout = { ...state.layout, nodes: mergedNodes } as Record<string, unknown>
              return { document: doc, layout: newLayout }
            })()
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
        // Marquer dirty pour auto-save draft (Task 1 - Story 0.5)
        get().markDirty()
      },
      
      // Déconnecter deux nœuds
      disconnectNodes: (edgeId: string) => {
        set((state) => {
          const edge = state.edges.find((e) => e.id === edgeId)
          if (!edge) {
            return state
          }

          // Si déconnexion depuis un TestNode, mettre à jour le choix parent
          if (edge.sourceHandle && (edge.source.startsWith('test-node-') || edge.source.startsWith('test:'))) {
            const parent = getParentChoiceForTestNode(edge.source, state.nodes)
            if (parent && TEST_HANDLE_TO_CHOICE_FIELD[edge.sourceHandle]) {
              // Supprimer le champ test*Node dans le choix parent (Source of Truth)
              const fieldName = TEST_HANDLE_TO_CHOICE_FIELD[edge.sourceHandle]
              const updatedChoices = (parent.dialogueNode.data.choices as Choice[]).map(
                (choice, idx) => {
                  if (idx === parent.choiceIndex) {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructure to omit field from rest
                    const { [fieldName]: _removed, ...rest } = choice
                    return rest
                  }
                  return choice
                }
              )

              // Mettre à jour le DialogueNode avec le choix modifié
              const updatedDialogueNode = {
                ...parent.dialogueNode,
                data: {
                  ...parent.dialogueNode.data,
                  choices: updatedChoices,
                },
              }

              // Remplacer le DialogueNode dans la liste
              let updatedNodes = state.nodes.map((n) =>
                n.id === parent.dialogueNodeId ? updatedDialogueNode : n
              )

              // Supprimer l'edge
              const newEdges = state.edges.filter((e) => e.id !== edgeId)

              // Synchroniser le TestNode depuis le choix mis à jour (choice → testNode)
              const updatedChoice = updatedChoices[parent.choiceIndex]
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

              // Mettre à jour le TestNode
              if (syncResult.testNode) {
                updatedNodes = updatedNodes.map((n) =>
                  n.id === edge.source ? syncResult.testNode! : n
                )
              }

              // Story 16.4 : en mode document SoT, garder document/layout synchronisés
              const isDocumentSoT = state.document != null && state.layout != null
              const docAndLayout = isDocumentSoT
                ? (() => {
                    const doc = graphToDocument(updatedNodes, syncResult.edges) as unknown as Record<string, unknown>
                    const newPositions = buildLayoutFromNodes(updatedNodes)
                    const layoutNodes = (state.layout as Record<string, unknown>)?.['nodes'] as Record<string, { x: number; y: number }> | undefined
                    const mergedNodes = { ...layoutNodes, ...newPositions.nodes }
                    const newLayout = { ...state.layout, nodes: mergedNodes } as Record<string, unknown>
                    return { document: doc, layout: newLayout }
                  })()
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

          // Logique existante : supprimer simplement l'edge
          const newEdges = state.edges.filter((e) => e.id !== edgeId)
          const updatedNodes = state.nodes

          // Story 16.4 : en mode document SoT, garder document synchronisé
          const isDocumentSoT = state.document != null && state.layout != null
          const docAndLayout = isDocumentSoT
            ? (() => {
                const doc = graphToDocument(updatedNodes, newEdges) as unknown as Record<string, unknown>
                const newPositions = buildLayoutFromNodes(updatedNodes)
                const layoutNodes = (state.layout as Record<string, unknown>)?.['nodes'] as Record<string, { x: number; y: number }> | undefined
                const mergedNodes = { ...layoutNodes, ...newPositions.nodes }
                const newLayout = { ...state.layout, nodes: mergedNodes } as Record<string, unknown>
                return { document: doc, layout: newLayout }
              })()
            : {}

          return {
            edges: newEdges,
            dialogueMetadata: {
              ...state.dialogueMetadata,
              edge_count: newEdges.length,
            },
            ...docAndLayout,
          }
        })
        // Marquer dirty pour auto-save draft (Task 1 - Story 0.5)
        get().markDirty()
      },
      
      // Sélectionner un nœud
      setSelectedNode: (nodeId: string | null) => {
        set({ selectedNodeId: nodeId })
      },
      
      // Mettre à jour la position d'un nœud
      updateNodePosition: (nodeId: string, position: { x: number; y: number }) => {
        const state = get()
        const node = state.nodes.find((n) => n.id === nodeId)
        const positionChanged = !node ||
          Math.abs(node.position.x - position.x) > 0.1 ||
          Math.abs(node.position.y - position.y) > 0.1

        // Story 16.4 Task 2.3 : en mode document SoT, mettre à jour le layout (pas le document) puis recalculer la projection
        if (state.document != null && state.layout != null) {
          const layoutNodes = (state.layout?.nodes as Record<string, { x: number; y: number }>) ?? {}
          const newLayout = {
            ...state.layout,
            nodes: { ...layoutNodes, [nodeId]: position },
          }
          const { nodes: projectedNodes, edges: projectedEdges } = documentToGraph(
            state.document,
            newLayout as { nodes?: Record<string, { x: number; y: number }> }
          )
          const normalized = normalizeTestBars(projectedNodes, projectedEdges)
          set({
            layout: newLayout,
            nodes: normalized.nodes,
            edges: normalized.edges,
          })
          if (positionChanged) get().markDirty()
          return
        }

        set({
          nodes: state.nodes.map((n) =>
            n.id === nodeId ? { ...n, position } : n
          ),
        })
        if (positionChanged) {
          get().markDirty()
          const filename = state.dialogueMetadata.filename
          if (filename) {
            const positions: NodePositions = {}
            state.nodes.forEach((n) => {
              positions[n.id] = n.id === nodeId ? position : n.position
            })
            saveNodePositions(filename, positions)
          }
        }
      },
      
      // Générer un nœud depuis un parent avec l'IA
      generateFromNode: async (
        parentNodeId: string,
        instructions: string,
        options: Record<string, unknown>
      ) => {
        set({ isGenerating: true })
        try {
          const state = get()
          const parentNode = state.nodes.find((n) => n.id === parentNodeId)
          
          if (!parentNode) {
            throw new Error(`Nœud parent ${parentNodeId} introuvable`)
          }
          
          // Si on génère depuis un TestNode, trouver le DialogueNode parent
          let parentNodeContent = parentNode.data
          if (parentNode.type === 'testNode' || parentNodeId.startsWith('test-node-') || parentNodeId.startsWith('test:')) {
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
          
          // Appeler l'API pour générer le nœud
          const response = await graphAPI.generateNode({
            parent_node_id: parentNodeId,
            parent_node_content: parentNodeContent,
            user_instructions: instructions,
            context_selections: options.context_selections || {},
            max_choices: options.max_choices,
            npc_speaker_id: options.npc_speaker_id,
            system_prompt_override: options.system_prompt_override,
            narrative_tags: options.narrative_tags,
            llm_model_identifier: options.llm_model_identifier,
            target_choice_index: options.target_choice_index ?? null,
            generate_all_choices: options.generate_all_choices ?? false,
          })
          
          // Gérer génération batch (si generate_all_choices, l'API retourne une liste)
          // OU si TestNode (génère toujours 4 nœuds pour les résultats de test)
          // Utiliser response.nodes si disponible (batch ou TestNode), sinon response.node (backward compatibility)
          const isTestNode = parentNodeId.startsWith('test-node-')
          const isBatch = options.generate_all_choices ?? false
          const hasMultipleNodes = response.nodes && response.nodes.length > 0
          
          const generatedNodes = hasMultipleNodes
            ? response.nodes 
            : (response.node ? [response.node] : [])
          
          // Ajouter les nouveaux nœuds avec positionnement en cascade pour batch
          const generatedNodeIds: string[] = []
          
          // Pour TestNodes, les connexions utilisent connection_type au lieu de via_choice_index
          // Pour batch normal, utiliser via_choice_index
          const connectionMap = new Map<number | string, { node: Record<string, unknown>, conn: { to: string; via_choice_index?: number; connection_type?: string; [key: string]: unknown } }>()
          for (const conn of response.suggested_connections) {
            const node = generatedNodes.find((n) => n.id === conn.to)
            if (node) {
              // Pour TestNodes, utiliser connection_type comme clé
              // Pour batch normal, utiliser via_choice_index
              const mapKey = isTestNode && conn.connection_type 
                ? conn.connection_type 
                : (conn.via_choice_index !== undefined ? conn.via_choice_index : `conn-${conn.to}`)
              connectionMap.set(mapKey, { node, conn })
            }
          }
          
          // Trier les connexions pour positionnement cascade
          // Pour TestNodes, ordre fixe: critical-failure, failure, success, critical-success
          // Pour batch normal, trier par via_choice_index
          let nodesToAdd: Array<{ node: Record<string, unknown>, choiceIndex: number }>
          if (isTestNode) {
            // Ordre fixe pour TestNodes
            const testOrder = ['test-critical-failure', 'test-failure', 'test-success', 'test-critical-success']
            nodesToAdd = testOrder
              .map((connType, index) => {
                const entry = connectionMap.get(connType)
                return entry ? { node: entry.node, choiceIndex: index } : null
              })
              .filter((item): item is { node: Record<string, unknown>, choiceIndex: number } => item !== null)
            // Ajouter les nœuds non mappés
            const mappedNodeIds = new Set(nodesToAdd.map(({ node }) => node.id))
            for (const node of generatedNodes) {
              if (!mappedNodeIds.has(node.id)) {
                nodesToAdd.push({ node, choiceIndex: nodesToAdd.length })
              }
            }
          } else {
            // Pour batch normal, trier par via_choice_index
            const sortedConnections = Array.from(connectionMap.entries())
              .filter(([key]) => typeof key === 'number')
              .sort((a, b) => (a[0] as number) - (b[0] as number))
            nodesToAdd = sortedConnections.length > 0
              ? sortedConnections.map(([choiceIndex, { node }]) => ({ node, choiceIndex: choiceIndex as number }))
              : generatedNodes.map((node, index) => ({ node, choiceIndex: index }))
          }
          
          const totalToAdd = nodesToAdd.length
          
          // Initialiser la progression si batch ou TestNode avec plusieurs nœuds
          if ((isBatch || (isTestNode && totalToAdd > 1)) && typeof options.onBatchProgress === 'function' && totalToAdd > 0) {
            options.onBatchProgress(0, totalToAdd)
          }
          
          // Ajouter les nœuds et mettre à jour la progression
          // Utiliser un batch update pour éviter les re-renders multiples
          const nodesToAddBatch: Node[] = []
          nodesToAdd.forEach(({ node: generatedNode, choiceIndex }, index) => {
            const isBatchOrTestNode = isBatch || (isTestNode && totalToAdd > 1)
            const isChoiceSpecific = !isBatchOrTestNode && options.target_choice_index !== undefined && options.target_choice_index !== null
            const verticalOffset = isBatchOrTestNode
              ? 150 * choiceIndex
              : (isChoiceSpecific ? (60 * choiceIndex) + 60 : 0)
            const newNode: Node = {
              id: generatedNode.id,
              type: 'dialogueNode',
              position: {
                x: parentNode.position.x + 300,
                // Positionnement en cascade verticale pour batch (offset Y = 150 * index_choice)
                y: parentNode.position.y + verticalOffset,
              },
              data: {
                ...generatedNode,
                status: "pending" as const,  // Marquer nœuds générés comme "pending" (Task 1 - Story 1.4)
              },
            }
            
            nodesToAddBatch.push(newNode)
            generatedNodeIds.push(generatedNode.id)
            
            // Mettre à jour la progression (appelé pour chaque nœud pour feedback progressif)
            if (isBatchOrTestNode && typeof options.onBatchProgress === 'function' && totalToAdd > 0) {
              options.onBatchProgress(index + 1, totalToAdd)
            }
          })
          
          // Ajouter tous les nœuds en une seule opération pour un re-render unique
          const currentState = get()
          const newNodes = [...currentState.nodes, ...nodesToAddBatch]
          set({
            nodes: newNodes,
            dialogueMetadata: {
              ...currentState.dialogueMetadata,
              node_count: newNodes.length,
            },
          })

          // Créer les connexions suggérées (appliquer automatiquement)
          for (const conn of response.suggested_connections) {
            // Appliquer automatiquement les connexions (mise à jour targetNode dans parent)
            get().connectNodes(
              conn.from,
              conn.to,
              conn.via_choice_index,
              conn.connection_type
            )
          }

          // Normaliser pour garantir la synchronisation TestBar ↔ choix après génération
          const stateAfterConnections = get()
          const normalized = normalizeTestBars(stateAfterConnections.nodes, stateAfterConnections.edges)
          set({
            nodes: normalized.nodes,
            edges: normalized.edges,
            dialogueMetadata: {
              ...stateAfterConnections.dialogueMetadata,
              node_count: normalized.nodes.length,
              edge_count: normalized.edges.length,
            },
          })

          // Marquer la génération comme terminée APRÈS avoir ajouté tous les nœuds
          // Cela permet à la modale de se fermer et aux nœuds d'être visibles immédiatement
          set({ isGenerating: false })
          
          // Retourner le nodeId du premier nouveau nœud pour feedback visuel
          // Note: Pour batch, on retourne l'ID du premier nœud, mais tous les nœuds sont ajoutés
          const firstNodeId = generatedNodeIds[0] || generatedNodes[0]?.id
          const batchInfo = options.generate_all_choices ? {
            generatedChoices: response.generated_choices_count ?? generatedNodes.length,
            connectedChoices: response.connected_choices_count ?? 0,
            failedChoices: response.failed_choices_count ?? 0,
            totalChoices: response.total_choices_count ?? (parentNode.data?.choices?.length ?? 0),
          } : undefined
          
          // Logger le résultat batch si applicable
          if (options.generate_all_choices && response.batch_count) {
            console.log(`Génération batch: ${response.batch_count} nœud(s) généré(s)`)
          }
          
          return { nodeId: firstNodeId ?? null, batchInfo }
        } catch (error: unknown) {
          console.error('Erreur lors de la génération de nœud:', error)
          set({ isGenerating: false })
          throw error
        }
      },
      
      // Valider le graphe
      validateGraph: async () => {
        try {
          const state = get()
          const response = await graphAPI.validateGraph({
            nodes: state.nodes.map((n) => ({
              id: n.id,
              type: n.type,
              position: n.position,
              data: n.data,
            })),
            edges: state.edges.map((e) => ({
              id: e.id,
              source: e.source,
              target: e.target,
              type: e.type,
              label: e.label,
              data: e.data,
            })),
          })
          
          // Extraire les nœuds des cycles depuis les warnings
          const cycleWarnings = response.warnings.filter(
            (w) => w.type === 'cycle_detected' && w.cycle_nodes && Array.isArray(w.cycle_nodes)
          )
          const cycleNodeIds = new Set<string>()
          cycleWarnings.forEach((warn) => {
            if (warn.cycle_nodes && Array.isArray(warn.cycle_nodes)) {
              warn.cycle_nodes.forEach((nodeId) => cycleNodeIds.add(nodeId))
            }
          })
          
          const newValidationErrors = [...response.errors, ...response.warnings]
          set({
            validationErrors: newValidationErrors,
            // Réinitialiser highlightedCycleNodes même s'il n'y a pas de cycles (AC #4)
            highlightedCycleNodes: Array.from(cycleNodeIds),
          })
        } catch (error) {
          console.error('Erreur lors de la validation:', error)
          throw error
        }
      },
      
      // Accepter un nœud généré (Task 3 - Story 1.4)
      acceptNode: async (nodeId: string) => {
        const state = get()
        const node = state.nodes.find((n) => n.id === nodeId)
        if (!node) {
          throw new Error(`Nœud ${nodeId} introuvable`)
        }
        if (node.data.status === "accepted") {
          return
        }

        // Mise à jour optimiste du statut
        set((currentState) => ({
          nodes: currentState.nodes.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, status: "accepted" as const } }
              : n
          ),
        }))

        try {
          const dialogueId = get().dialogueMetadata.filename || 'current'
          await graphAPI.acceptNode(dialogueId, nodeId)
          await get().saveDialogue()
          get().markDirty()
        } catch (err) {
          // Rollback: remettre le nœud en pending (code-review §6)
          set((currentState) => ({
            nodes: currentState.nodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, status: "pending" as const } }
                : n
            ),
          }))
          const { toastManager } = await import('../components/shared/Toast')
          toastManager.show(
            'Impossible de sauvegarder l’acceptation. Réessayez.',
            'error',
            5000
          )
          throw err
        }
      },
      
      // Rejeter un nœud généré (Task 3 - Story 1.4)
      // Ordre: API d'abord (évite état local incohérent si API échoue), puis mise à jour locale + saveDialogue pour persister (AC#3).
      rejectNode: async (nodeId: string) => {
        const state = get()
        const node = state.nodes.find((n) => n.id === nodeId)
        if (!node) {
          throw new Error(`Nœud ${nodeId} introuvable`)
        }

        const dialogueId = state.dialogueMetadata.filename || 'current'
        try {
          await graphAPI.rejectNode(dialogueId, nodeId)
        } catch (err) {
          console.error('Erreur lors du rejet du nœud:', err)
          const { toastManager } = await import('../components/shared/Toast')
          toastManager.show(
            'Impossible de rejeter le nœud. Réessayez.',
            'error',
            5000
          )
          throw err
        }

        try {
          // Nettoyer les références dans les choix des nœuds parents puis supprimer le nœud
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
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructure to omit targetNode from rest
                      const { targetNode, ...rest } = choice
                      return rest
                    }
                    return choice
                  })
                  return {
                    ...n,
                    data: { ...n.data, choices: cleanedChoices },
                  }
                }
              }
              if (n.data.nextNode === nodeId) {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructure to omit nextNode from restData
                const { nextNode, ...restData } = n.data
                return { ...n, data: restData }
              }
              return n
            })
            updatedEdges = updatedEdges.filter(
              (e) => e.source !== nodeId && e.target !== nodeId
            )
            return {
              ...currentState,
              nodes: updatedNodes,
              edges: updatedEdges,
            }
          })

          get().deleteNode(nodeId)

          // Persister immédiatement la suppression (AC#3 — le nœud ne doit pas réapparaître au reload)
          await get().saveDialogue()

          const { toastManager } = await import('../components/shared/Toast')
          toastManager.show('Nœud rejeté', 'info', 3000)
          get().markDirty()
        } catch (err) {
          console.error('Erreur après rejet (sauvegarde):', err)
          const { toastManager } = await import('../components/shared/Toast')
          toastManager.show(
            'Nœud retiré du graphe mais la sauvegarde a échoué. Réessayez de sauvegarder.',
            'error',
            5000
          )
          throw err
        }
      },
      
      // Sauvegarder le dialogue (ADR-006 / Story 16.4 : PUT document + layout si SoT document)
      saveDialogue: async () => {
        set({ isSaving: true, lastSaveError: null, syncStatus: 'synced' })
        const state = get()
        const documentId = state.documentId ?? state.dialogueMetadata.filename ?? null
        if (state.nodes.length === 0) {
          set({ isSaving: false })
          return
        }
        try {
          // Story 16.4 : flux principal = PUT document + PUT layout (pas nodes/edges). SoT = document + layout → envoyer state.document et state.layout.
          if (state.document != null && documentId) {
            const doc = state.document
            const layoutPayload = state.layout ?? buildLayoutFromNodes(state.nodes)
            const docRev = state.documentRevision ?? 1
            const layoutRev = state.layoutRevision ?? 1
            const [docRes, layoutRes] = await Promise.all([
              documentsAPI.putDocument(documentId, { document: doc, revision: docRev }),
              documentsAPI.putLayout(documentId, { layout: layoutPayload, revision: layoutRev }),
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
          }
        } catch (docErr: unknown) {
          const status = (docErr as { response?: { status?: number } })?.response?.status
          if (status === 409) {
            const msg = 'Conflit de révision (document ou layout modifié ailleurs). Rechargez ou réessayez.'
            set({ isSaving: false, lastSaveError: msg, syncStatus: 'error' })
            throw new Error(msg)
          }
          set({ isSaving: false, lastSaveError: (docErr as Error)?.message ?? String(docErr), syncStatus: 'error' })
          throw docErr
        }
        const seq = state.clientSeq
        try {
          const response = await graphAPI.saveGraphAndWrite({
            nodes: state.nodes.map((n) => ({
              id: n.id,
              type: n.type,
              position: n.position,
              data: n.data,
            })),
            edges: state.edges.map((e) => ({
              id: e.id,
              source: e.source,
              target: e.target,
              type: e.type,
              label: e.label,
              data: e.data,
            })),
            metadata: state.dialogueMetadata,
            seq: seq,
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
          set({
            isSaving: false,
            hasUnsavedChanges: false,
            lastSaveError: null,
            lastSavedAt: Date.now(),
            lastAckSeq: ackSeq,
            clientSeq: nextSeq,
            syncStatus: 'synced',
            documentId: documentId ?? response.filename ?? state.documentId,
            dialogueMetadata: {
              ...state.dialogueMetadata,
              filename: response.filename,
            },
          })
          return response
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error('Erreur lors de la sauvegarde:', error)
          set({
            isSaving: false,
            lastSaveError: message,
            syncStatus: 'error',
          })
          throw error
        }
      },
      
      // Exporter en Unity JSON
      // ⚠️ ATTENTION: Cette méthode utilise une logique locale simplifiée pour le draft local uniquement.
      // Elle NE gère PAS les TestNodes avec 4 résultats (testCriticalFailureNode, testCriticalSuccessNode).
      // Pour un export canonique avec validation complète, utilisez saveDialogue() qui appelle l'API /save.
      exportToUnity: (opts?: { keepStatusForDraft?: boolean }) => {
        const state = get()
        const keepStatus = opts?.keepStatusForDraft === true

        // Reconvertir les nœuds ReactFlow en Unity JSON
        const unityNodes = state.nodes.map((node) => {
          const unityNode = { ...node.data }
          
          // Ignorer les TestNodes (ils ne sont pas dans le JSON Unity, seulement les champs test*Node dans les choix)
          if (node.type === 'testNode') {
            return null
          }
          
          // Retirer le champ status avant export Unity sauf pour draft (session recovery AC#5)
          if (!keepStatus) {
            delete unityNode.status
          }
          
          // Nettoyer les champs de navigation (seront recréés depuis les edges)
          delete unityNode.nextNode
          delete unityNode.successNode
          delete unityNode.failureNode
          
          if (unityNode.choices) {
            unityNode.choices = (unityNode.choices as Array<{ targetNode?: string; [key: string]: unknown }>).map((choice) => {
              const cleanChoice = { ...choice }
              delete cleanChoice.targetNode
              // Note: Cette logique locale ne reconstruit PAS les 4 résultats de test correctement
              // (testCriticalFailureNode, testCriticalSuccessNode ne sont pas gérés)
              return cleanChoice
            })
          }
          
          return unityNode
        }).filter((node) => node !== null) // Filtrer les TestNodes
        
        // Reconstruire les connexions depuis les edges
        // ⚠️ Cette logique simplifiée ne gère pas les TestNodes avec 4 résultats
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
            // Edge par défaut (nextNode)
            if (!sourceNode.choices && !sourceNode.test) {
              sourceNode.nextNode = edge.target
            }
          }
        }
        
        return JSON.stringify(unityNodes, null, 2)
      },
      
      // Appliquer un auto-layout
      applyAutoLayout: async (algorithm: string, direction: string) => {
        try {
          const state = get()
          
          // Si Dagre, calculer côté frontend
          if (algorithm === 'dagre') {
            const { calculateDagreLayout } = await import('../utils/dagreLayout')
            const layoutedNodes = calculateDagreLayout(
              state.nodes,
              state.edges,
              { direction: direction as 'TB' | 'LR' | 'BT' | 'RL' }
            )
            
            // Mettre à jour les positions
            set({ nodes: layoutedNodes })
            return
          }
          
          // Sinon, utiliser l'API backend (fallback pour autres algorithmes)
          const response = await graphAPI.calculateLayout({
            nodes: state.nodes.map((n) => ({
              id: n.id,
              type: n.type,
              position: n.position,
              data: n.data,
            })),
            edges: state.edges.map((e) => ({
              id: e.id,
              source: e.source,
              target: e.target,
              type: e.type,
              label: e.label,
              data: e.data,
            })),
            algorithm,
            direction,
          })
          
          // Mettre à jour les positions
          set((state) => ({
            nodes: state.nodes.map((node) => {
              const layoutedNode = response.nodes.find((n: { id: string; position: { x: number; y: number }; [key: string]: unknown }) => n.id === node.id)
              return layoutedNode
                ? { ...node, position: layoutedNode.position }
                : node
            }),
          }))
        } catch (error) {
          console.error('Erreur lors du calcul de layout:', error)
          throw error
        }
      },
      
      // Mettre à jour les métadonnées
      updateMetadata: (updates: Partial<GraphMetadata>) => {
        set((state) => ({
          dialogueMetadata: {
            ...state.dialogueMetadata,
            ...updates,
          },
        }))
        // Marquer dirty pour auto-save draft (Task 1 - Story 0.5)
        get().markDirty()
      },
      
      // Réinitialiser le graphe
      resetGraph: () => {
        set(initialState)
      },
      
      // Définir les nœuds en surbrillance (pour la recherche)
      setHighlightedNodes: (nodeIds: string[]) => {
        set({ highlightedNodeIds: nodeIds })
      },
      
      // Marquer un cycle comme intentionnel
      markCycleAsIntentional: (cycleId: string) => {
        set((state) => {
          const newIntentionalCycles = state.intentionalCycles.includes(cycleId)
            ? state.intentionalCycles
            : [...state.intentionalCycles, cycleId]
          
          // Persister dans localStorage
          try {
            localStorage.setItem('graph_intentional_cycles', JSON.stringify(newIntentionalCycles))
          } catch (error) {
            console.error('Erreur lors de la sauvegarde des cycles intentionnels:', error)
            // Afficher une notification à l'utilisateur si localStorage est plein
            if (error instanceof DOMException && error.name === 'QuotaExceededError') {
              alert('Impossible de sauvegarder le marquage intentionnel: l\'espace de stockage est plein. Veuillez libérer de l\'espace.')
            }
          }
          
          return { intentionalCycles: newIntentionalCycles }
        })
      },
      
      // Décocher un cycle intentionnel
      unmarkCycleAsIntentional: (cycleId: string) => {
        set((state) => {
          const newIntentionalCycles = state.intentionalCycles.filter((id) => id !== cycleId)
          
          // Persister dans localStorage
          try {
            localStorage.setItem('graph_intentional_cycles', JSON.stringify(newIntentionalCycles))
          } catch (error) {
            console.error('Erreur lors de la sauvegarde des cycles intentionnels:', error)
            // Afficher une notification à l'utilisateur si localStorage est plein
            if (error instanceof DOMException && error.name === 'QuotaExceededError') {
              alert('Impossible de sauvegarder le marquage intentionnel: l\'espace de stockage est plein. Veuillez libérer de l\'espace.')
            }
          }
          
          return { intentionalCycles: newIntentionalCycles }
        })
      },
      
      markDirty: () => {
        set({ hasUnsavedChanges: true })
        const state = get()
        const docId = state.documentId ?? state.dialogueMetadata.filename ?? null
        if (docId) {
          journalSetPending(docId, {
            nodes: state.nodes,
            edges: state.edges,
            metadata: state.dialogueMetadata,
            seq: state.clientSeq,
          }).catch((e) => console.warn('Journal setPending:', e))
        }
      },

      setShowDeleteNodeConfirm: (show: boolean) => {
        set({ showDeleteNodeConfirm: show })
      },
    }))
