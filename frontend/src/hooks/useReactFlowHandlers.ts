/**
 * Handlers ReactFlow : drag, selection, edges, connexions, context menu edges.
 * Extrait de GraphCanvas pour isoler la logique événementielle du rendu JSX.
 */
import { useState, useRef, useCallback, useEffect, type RefObject } from 'react'
import type { Connection, Node, NodeChange, EdgeChange } from 'reactflow'
import { useGraphStore } from '../store/graphStore'
import { getChoiceIndexFromSourceHandle } from '../utils/choiceHandleIndex'
import { useGraphViewStore } from '../store/graphViewStore'
import { collectOutgoingDescendantIds } from '../utils/collectOutgoingDescendantIds'
import { resolveReactFlowNodeIdUnderPointer } from '../utils/resolveReactFlowNodeIdUnderPointer'

type DragGroupMode = 'multi' | 'with-children' | null

export interface EdgeLabelEditState {
  edgeId: string
  sourceId: string
  choiceIndex: number
  initialText: string
}

export interface PendingChoiceConnection {
  sourceNodeId: string
  sourceHandleId: string
}

export interface UseReactFlowHandlersOptions {
  getFlowPosition: (event: MouseEvent | TouchEvent) => { x: number; y: number }
  onChoiceDropOnPane: (position: { x: number; y: number }, pending: PendingChoiceConnection) => void
  /** Wrapper du graphe : pour rattacher un choix lâché sur le corps d'un nœud (hors rayon de la poignée). */
  flowContainerRef?: RefObject<HTMLElement>
}

export interface UseReactFlowHandlersReturn {
  edgeIdsToDelete: string[] | null
  edgeLabelEdit: EdgeLabelEditState | null
  setEdgeLabelEdit: (v: EdgeLabelEditState | null) => void
  fitViewRequestedAfterDimensionsRef: React.MutableRefObject<boolean>
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConfirmDeleteEdges: () => void
  onCancelDeleteEdges: () => void
  onNodeClick: (event: React.MouseEvent, node: Node) => void
  onNodeDoubleClick: (event: React.MouseEvent, node: Node) => void
  onPaneClick: () => void
  onConnect: (connection: Connection) => void
  onConnectStart: (event: React.MouseEvent | React.TouchEvent, params: { nodeId: string | null; handleId: string | null }) => void
  onConnectEnd: (event: MouseEvent | TouchEvent) => void
  onNodeDragStart: (event: React.MouseEvent, node: Node) => void
  onNodeDragStop: (event: React.MouseEvent, node: Node) => void
  handleEdgeLabelConfirm: (newText: string) => void
}

function isChoiceHandle(handleId: string | null): boolean {
  if (!handleId) return false
  if (handleId.startsWith('choice:')) return true
  if (/^choice-\d+$/.test(handleId)) return true
  return false
}

export function useReactFlowHandlers(
  fitViewRequestedAfterDimensionsRef: React.MutableRefObject<boolean>,
  options?: UseReactFlowHandlersOptions
): UseReactFlowHandlersReturn {
  const [edgeIdsToDelete, setEdgeIdsToDelete] = useState<string[] | null>(null)
  const [edgeLabelEdit, setEdgeLabelEdit] = useState<EdgeLabelEditState | null>(null)

  const pendingChoiceConnectionRef = useRef<PendingChoiceConnection | null>(null)
  const dragStartPositionsRef = useRef<Record<string, { x: number; y: number }> | null>(null)
  const dragGroupModeRef = useRef<DragGroupMode>(null)
  const positionRafRef = useRef<number | null>(null)
  const pendingPositionsRef = useRef<Record<string, { x: number; y: number }>>({})

  const {
    setSelectedNode,
    setSelectedNodes,
    clearSelection,
    updateNodePosition,
    updateNodeDimensionsBatch,
    markDirty,
    _pushUndoSnapshot,
    connectNodes,
    deleteNode,
    disconnectNodes,
    updateChoiceEdgeLabel,
  } = useGraphStore()

  useEffect(() => {
    return () => {
      if (positionRafRef.current !== null) {
        cancelAnimationFrame(positionRafRef.current)
        positionRafRef.current = null
      }
    }
  }, [])

  const edgeLabelEditRequest = useGraphViewStore((s) => s.edgeLabelEditRequest)
  useEffect(() => {
    if (!edgeLabelEditRequest) return
    const { edgeId } = edgeLabelEditRequest
    useGraphViewStore.getState().clearEdgeLabelEdit()
    const state = useGraphStore.getState()
    const edge = state.edges.find((e) => e.id === edgeId)
    if (!edge || (edge.data as { edgeType?: string })?.edgeType !== 'choice') return
    const sourceNode = state.nodes.find((n) => n.id === edge.source)
    const choiceIndex = (edge.data as { choiceIndex?: number })?.choiceIndex
    if (
      choiceIndex == null ||
      !sourceNode?.data?.choices ||
      !Array.isArray(sourceNode.data.choices) ||
      sourceNode.data.choices[choiceIndex] == null
    )
      return
    const choice = sourceNode.data.choices[choiceIndex] as { text?: string }
    setEdgeLabelEdit({
      edgeId: edge.id,
      sourceId: edge.source,
      choiceIndex,
      initialText: choice.text ?? '',
    })
  }, [edgeLabelEditRequest])

  const flushPositionUpdate = useCallback(() => {
    const pendingEntries = Object.entries(pendingPositionsRef.current)
    if (pendingEntries.length > 0) {
      pendingPositionsRef.current = {}
      for (const [nodeId, position] of pendingEntries) {
        updateNodePosition(nodeId, position, true)
      }
    }
    positionRafRef.current = null
  }, [updateNodePosition])

  const schedulePositionUpdate = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      pendingPositionsRef.current[nodeId] = position
      if (positionRafRef.current === null) {
        positionRafRef.current = requestAnimationFrame(flushPositionUpdate)
      }
    },
    [flushPositionUpdate]
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const dimensionUpdates: Record<string, { width: number; height: number }> = {}
      for (const change of changes) {
        if (change.type === 'remove' && change.id) {
          deleteNode(change.id)
          continue
        }
        if (change.type === 'select' && change.id !== undefined) {
          const state = useGraphStore.getState()
          const currentIds = state.selectedNodeIds
          let nextIds: string[]
          if (change.selected) {
            nextIds = currentIds.includes(change.id) ? currentIds : [...currentIds, change.id]
          } else {
            nextIds = currentIds.filter((id) => id !== change.id)
          }
          const currentSet = new Set(currentIds)
          const changed =
            currentSet.size !== nextIds.length || nextIds.some((id) => !currentSet.has(id))
          if (changed) setSelectedNodes(nextIds)
          continue
        }
        if (change.type === 'position' && change.position && change.id) {
          const isDragging = 'dragging' in change && change.dragging
          const groupMode = dragGroupModeRef.current
          const groupStarts = dragStartPositionsRef.current

          if (
            isDragging &&
            groupMode === 'with-children' &&
            groupStarts &&
            groupStarts[change.id]
          ) {
            const primaryId = change.id
            const origin = groupStarts[primaryId]
            const dx = change.position.x - origin.x
            const dy = change.position.y - origin.y
            schedulePositionUpdate(primaryId, change.position)
            for (const id of Object.keys(groupStarts)) {
              if (id === primaryId) continue
              const s = groupStarts[id]
              schedulePositionUpdate(id, { x: s.x + dx, y: s.y + dy })
            }
            continue
          }

          if (!isDragging && groupMode === 'with-children') {
            continue
          }

          if (isDragging) {
            schedulePositionUpdate(change.id, change.position)
          } else {
            updateNodePosition(change.id, change.position)
          }
          continue
        }
        if (change.type === 'dimensions' && change.id && 'dimensions' in change) {
          const dims = (change as { dimensions?: { width?: number; height?: number } }).dimensions
          if (dims && typeof dims.width === 'number' && typeof dims.height === 'number') {
            dimensionUpdates[change.id] = { width: dims.width, height: dims.height }
          }
        }
      }
      if (Object.keys(dimensionUpdates).length > 0) {
        const batch = { ...dimensionUpdates }
        requestAnimationFrame(() => {
          updateNodeDimensionsBatch(batch)
          if (!fitViewRequestedAfterDimensionsRef.current) {
            fitViewRequestedAfterDimensionsRef.current = true
            useGraphViewStore.getState().requestFitView()
          }
        })
      }
    },
    [
      deleteNode,
      setSelectedNodes,
      updateNodePosition,
      updateNodeDimensionsBatch,
      schedulePositionUpdate,
      fitViewRequestedAfterDimensionsRef,
    ]
  )

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const removeIds = changes
      .filter((c): c is { type: 'remove'; id: string } => c.type === 'remove' && Boolean(c.id))
      .map((c) => c.id)
    if (removeIds.length > 0) {
      setEdgeIdsToDelete(removeIds)
    }
  }, [])

  const onConfirmDeleteEdges = useCallback(() => {
    if (!edgeIdsToDelete || edgeIdsToDelete.length === 0) return
    for (const id of edgeIdsToDelete) {
      disconnectNodes(id, true)
    }
    markDirty()
    setEdgeIdsToDelete(null)
  }, [edgeIdsToDelete, disconnectNodes, markDirty])

  const onCancelDeleteEdges = useCallback(() => {
    setEdgeIdsToDelete(null)
  }, [])

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (event.shiftKey) return
      setSelectedNode(node.id)
    },
    [setSelectedNode]
  )

  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    useGraphViewStore.getState().focusNode(node.id)
  }, [])

  const onPaneClick = useCallback(() => {
    clearSelection()
  }, [clearSelection])

  const onConnect = useCallback(
    (connection: Connection) => {
      pendingChoiceConnectionRef.current = null
      if (!connection.source || !connection.target) return
      const sourceHandle = connection.sourceHandle || ''
      let connectionType = 'default'
      let choiceIndex: number | undefined
      if (sourceHandle.startsWith('choice:') || sourceHandle.startsWith('choice-')) {
        connectionType = 'choice'
        choiceIndex = getChoiceIndexFromSourceHandle(
          connection.source,
          sourceHandle,
          useGraphStore.getState().nodes
        )
      } else if (sourceHandle === 'success') {
        connectionType = 'success'
      } else if (sourceHandle === 'failure') {
        connectionType = 'failure'
      } else if (sourceHandle === 'critical-success') {
        connectionType = 'critical-success'
      } else if (sourceHandle === 'critical-failure') {
        connectionType = 'critical-failure'
      }
      connectNodes(
        connection.source,
        connection.target,
        choiceIndex,
        connectionType,
        connection.sourceHandle ?? undefined
      )
    },
    [connectNodes]
  )

  const onConnectStart = useCallback(
    (_event: React.MouseEvent | React.TouchEvent, params: { nodeId: string | null; handleId: string | null }) => {
      if (!params.nodeId || !isChoiceHandle(params.handleId)) {
        pendingChoiceConnectionRef.current = null
        return
      }
      pendingChoiceConnectionRef.current = {
        sourceNodeId: params.nodeId,
        sourceHandleId: params.handleId as string,
      }
    },
    []
  )

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const pending = pendingChoiceConnectionRef.current
      pendingChoiceConnectionRef.current = null
      if (!pending || !options?.getFlowPosition || !options?.onChoiceDropOnPane) return

      // Si onConnect n'a pas été appelé (curseur hors rayon de la poignée cible) mais que
      // l'utilisateur a lâché au-dessus d'un nœud, on complète la connexion comme onConnect.
      const container = options.flowContainerRef?.current ?? null
      const targetUnderPointer = container
        ? resolveReactFlowNodeIdUnderPointer(event, container)
        : null
      if (targetUnderPointer && targetUnderPointer !== pending.sourceNodeId) {
        onConnect({
          source: pending.sourceNodeId,
          target: targetUnderPointer,
          sourceHandle: pending.sourceHandleId,
          targetHandle: null,
        })
        return
      }

      const position = options.getFlowPosition(event)
      options.onChoiceDropOnPane(position, pending)
    },
    [options, onConnect]
  )

  const onNodeDragStart = useCallback(
    (event: React.MouseEvent, node: Node) => {
      _pushUndoSnapshot()
      const state = useGraphStore.getState()
      const ids = state.selectedNodeIds
      const nodes = state.nodes
      const edges = state.edges

      if (ids.length > 1 && ids.includes(node.id)) {
        const positions: Record<string, { x: number; y: number }> = {}
        for (const id of ids) {
          const n = nodes.find((nd) => nd.id === id)
          if (n) positions[id] = { x: n.position.x, y: n.position.y }
        }
        dragStartPositionsRef.current = positions
        dragGroupModeRef.current = 'multi'
        return
      }

      // Ctrl = nœud seul. TestNode (4 handles) = nœud seul aussi : ses
      // « enfants » sont des résultats de test, pas une suite narrative à emporter.
      const isTestNode =
        node.type === 'testNode' ||
        node.id.startsWith('test-node-') ||
        node.id.startsWith('test:')
      if (event.ctrlKey || isTestNode) {
        dragStartPositionsRef.current = null
        dragGroupModeRef.current = null
        return
      }

      const descendantIds = collectOutgoingDescendantIds(node.id, edges)
      const dragIds = [node.id, ...descendantIds]
      const positions: Record<string, { x: number; y: number }> = {}
      for (const id of dragIds) {
        const n = nodes.find((nd) => nd.id === id)
        if (n) positions[id] = { x: n.position.x, y: n.position.y }
      }
      dragStartPositionsRef.current = positions
      dragGroupModeRef.current = 'with-children'
    },
    [_pushUndoSnapshot]
  )

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (positionRafRef.current !== null) {
        cancelAnimationFrame(positionRafRef.current)
        positionRafRef.current = null
      }
      pendingPositionsRef.current = {}
      const startPositions = dragStartPositionsRef.current
      const groupMode = dragGroupModeRef.current
      const ids = useGraphStore.getState().selectedNodeIds
      if (startPositions && ids.length > 1 && ids.includes(node.id)) {
        const dx = node.position.x - startPositions[node.id].x
        const dy = node.position.y - startPositions[node.id].y
        for (const id of ids) {
          const start = startPositions[id]
          if (start) updateNodePosition(id, { x: start.x + dx, y: start.y + dy }, true)
        }
        markDirty()
      } else if (
        groupMode === 'with-children' &&
        startPositions &&
        startPositions[node.id]
      ) {
        const dx = node.position.x - startPositions[node.id].x
        const dy = node.position.y - startPositions[node.id].y
        for (const id of Object.keys(startPositions)) {
          const start = startPositions[id]
          updateNodePosition(id, { x: start.x + dx, y: start.y + dy }, true)
        }
        markDirty()
      } else {
        updateNodePosition(node.id, node.position, undefined, false)
      }
      dragStartPositionsRef.current = null
      dragGroupModeRef.current = null
    },
    [updateNodePosition, markDirty]
  )

  const handleEdgeLabelConfirm = useCallback(
    (newText: string) => {
      if (!edgeLabelEdit) return
      updateChoiceEdgeLabel(edgeLabelEdit.edgeId, newText.trim())
      setEdgeLabelEdit(null)
    },
    [edgeLabelEdit, updateChoiceEdgeLabel]
  )

  return {
    edgeIdsToDelete,
    edgeLabelEdit,
    setEdgeLabelEdit,
    fitViewRequestedAfterDimensionsRef,
    onNodesChange,
    onEdgesChange,
    onConfirmDeleteEdges,
    onCancelDeleteEdges,
    onNodeClick,
    onNodeDoubleClick,
    onPaneClick,
    onConnect,
    onConnectStart,
    onConnectEnd,
    onNodeDragStart,
    onNodeDragStop,
    handleEdgeLabelConfirm,
  }
}
