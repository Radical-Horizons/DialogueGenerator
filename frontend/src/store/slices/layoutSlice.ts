/**
 * Slice layout du store graphe : applyAutoLayout, updateNodePosition, updateNodeDimensions, updateNodeDimensionsBatch.
 */
import type { StateCreator } from 'zustand'
import type { Node } from 'reactflow'
import type { GraphState } from '../types/graphState'
import * as graphAPI from '../../api/graph'
import { documentToGraph } from '../../utils/documentToGraph'
import { normalizeTestBars, normalizeTestBarsAfterLayout } from '../../utils/graphNormalizers'
import {
  isTextCardsWorkingLayout,
  mergeLayoutWithNodePositions,
  syncDocAndLayout,
} from '../../utils/syncDocLayout'
import { useUiLayoutStore } from '../uiLayoutStore'

export type LayoutSlice = Pick<
  GraphState,
  | 'applyAutoLayout'
  | 'updateNodePosition'
  | 'moveNodes'
  | 'updateNodeDimensions'
  | 'updateNodeDimensionsBatch'
>

export const createLayoutSlice: StateCreator<GraphState, [], [], LayoutSlice> = (set, get) => ({
  applyAutoLayout: async (algorithm: string, direction: string) => {
    try {
      const state = get()

      if (algorithm === 'dagre') {
        get()._pushUndoSnapshot()
        const { calculateDagreLayout } = await import('../../utils/dagreLayout')
        // Comme au chargement : les barres de test gardent la place que dagre leur donne.
        // Un layout du prototype (20.2) se redispose toujours en cartes, gauche → droite.
        const disposed = isTextCardsWorkingLayout(state.layout)
          ? (await import('../../utils/textCardLayout')).calculateTextCardLayout(
              state.nodes,
              state.edges,
              {
                spacingMode: state.layoutSpacingMode,
                showTestBars: useUiLayoutStore.getState().textCardsTestBars,
              }
            )
          : calculateDagreLayout(state.nodes, state.edges, {
              direction: direction as 'TB' | 'LR' | 'BT' | 'RL',
              spacingMode: state.layoutSpacingMode,
            })
        const layoutedNodes = normalizeTestBarsAfterLayout(disposed, state.edges).nodes
        // `layout` est la source des positions projetées : sans ce sync, le déplacement
        // suivant rejoue les anciennes positions et annule la disposition.
        const synced =
          state.document != null && state.layout != null
            ? syncDocAndLayout(
                layoutedNodes,
                state.edges,
                state.layout as Record<string, unknown>,
                state.document as Record<string, unknown>
              )
            : null
        set({ nodes: layoutedNodes, ...(synced ?? {}) })
        get().markDirty()
        return
      }

      // Fallback backend pour les autres algorithmes
      get()._pushUndoSnapshot()
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

      set((state) => ({
        nodes: state.nodes.map((node) => {
          const layoutedNode = response.nodes.find((n) => n.id === node.id)
          return layoutedNode ? { ...node, position: layoutedNode.position } : node
        }),
      }))
      get().markDirty()
    } catch (error) {
      console.error('Erreur lors du calcul de layout:', error)
      throw error
    }
  },

  updateNodePosition: (
    nodeId: string,
    position: { x: number; y: number },
    skipMarkDirty?: boolean,
    pushUndoSnapshot?: boolean
  ) => {
    const node = get().nodes.find((n) => n.id === nodeId)
    const positionChanged =
      !node ||
      Math.abs(node.position.x - position.x) > 0.1 ||
      Math.abs(node.position.y - position.y) > 0.1

    // Guard: skip store update entirely if position hasn't changed to prevent StoreUpdater loops.
    if (!positionChanged) return
    if (pushUndoSnapshot) get()._pushUndoSnapshot()
    const state = get()

    // Prototype 20.2 sans barres de test : rien d'autre ne dépend de la position, et
    // reprojeter tout le document à chaque image du glisser coûtait ~250 ms à 500 répliques.
    if (isTextCardsWorkingLayout(state.layout) && !useUiLayoutStore.getState().textCardsTestBars) {
      get().moveNodes({ [nodeId]: position })
      if (!skipMarkDirty) get().markDirty()
      return
    }

    // Mode document SoT : mettre à jour le layout (pas le document) puis recalculer la projection
    if (state.document != null && state.layout != null) {
      const layoutNodes =
        (state.layout?.nodes as Record<string, { x: number; y: number }>) ?? {}
      const newLayout = {
        ...state.layout,
        nodes: { ...layoutNodes, [nodeId]: position },
      }
      const { nodes: projectedNodes, edges: projectedEdges } = documentToGraph(
        state.document,
        newLayout as { nodes?: Record<string, { x: number; y: number }> }
      )
      const normalized = normalizeTestBars(
        projectedNodes,
        projectedEdges,
        newLayout as { nodes?: Record<string, { x: number; y: number }> }
      )

      // Conserver la ref edges si seule la position a changé (évite scintillement des étiquettes)
      const newIds = new Set(normalized.edges.map((e) => e.id))
      const edgesUnchanged =
        state.edges.length === normalized.edges.length &&
        state.edges.every((e) => newIds.has(e.id))
      // Ne jamais remplacer par une projection qui a moins d'edges : évite de perdre une connexion
      // venant d'une génération IA (race : updateNodePosition/dimensions après set() génération).
      const edgesToSet =
        edgesUnchanged
          ? state.edges
          : normalized.edges.length >= state.edges.length
            ? normalized.edges
            : state.edges

      set({
        layout: mergeLayoutWithNodePositions(newLayout, normalized.nodes),
        nodes: normalized.nodes,
        edges: edgesToSet,
      })
      if (!skipMarkDirty) get().markDirty()
      return
    }

    // Mode direct : position dans le store uniquement ; persistance via saveDialogue (legacy path).
    set({
      nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, position } : n)),
    })
    if (!skipMarkDirty) get().markDirty()
  },

  moveNodes: (positions) => {
    const state = get()
    set({
      nodes: state.nodes.map((n) => (positions[n.id] ? { ...n, position: positions[n.id] } : n)),
      layout: {
        ...state.layout,
        nodes: { ...(state.layout?.nodes as Record<string, unknown>), ...positions },
      },
    })
  },

  updateNodeDimensions: (nodeId: string, dimensions: { width: number; height: number }) => {
    set((state) => {
      const currentNode = state.nodes.find((n) => n.id === nodeId)
      if (!currentNode) return state
      const currentMeasured = (
        currentNode as Node & { measured?: { width?: number; height?: number } }
      ).measured as { width?: number; height?: number } | undefined
      const currentWidth = currentMeasured?.width ?? currentNode.width
      const currentHeight = currentMeasured?.height ?? currentNode.height
      const widthChanged = Math.abs((currentWidth ?? 0) - dimensions.width) > 0.1
      const heightChanged = Math.abs((currentHeight ?? 0) - dimensions.height) > 0.1
      if (!widthChanged && !heightChanged) return state

      return {
        nodes: state.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                measured: { width: dimensions.width, height: dimensions.height },
                width: dimensions.width,
                height: dimensions.height,
              }
            : node
        ),
      }
    })
  },

  updateNodeDimensionsBatch: (updates) => {
    if (Object.keys(updates).length === 0) return
    set((state) => {
      let hasChange = false
      const nextNodes = state.nodes.map((node) => {
        const dims = updates[node.id]
        if (!dims) return node
        const currentMeasured = (
          node as Node & { measured?: { width?: number; height?: number } }
        ).measured as { width?: number; height?: number } | undefined
        const currentWidth = currentMeasured?.width ?? node.width
        const currentHeight = currentMeasured?.height ?? node.height
        const widthChanged = Math.abs((currentWidth ?? 0) - dims.width) > 0.1
        const heightChanged = Math.abs((currentHeight ?? 0) - dims.height) > 0.1
        if (!widthChanged && !heightChanged) return node
        hasChange = true
        return {
          ...node,
          measured: { width: dims.width, height: dims.height },
          width: dims.width,
          height: dims.height,
        }
      })
      return hasChange ? { nodes: nextNodes } : state
    })
  },
})
