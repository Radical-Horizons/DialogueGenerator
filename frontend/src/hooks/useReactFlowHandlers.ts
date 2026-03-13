/**
 * Handlers ReactFlow : drag, selection, edges, connexions, context menu edges.
 * Extrait de GraphCanvas pour isoler la logique événementielle du rendu JSX.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import type { Connection, Node, NodeChange, EdgeChange } from 'reactflow'
import { useGraphStore } from '../store/graphStore'

export interface EdgeLabelEditState {
  edgeId: string
  sourceId: string
  choiceIndex: number
  initialText: string
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
  onNodeDragStart: (event: React.MouseEvent, node: Node) => void
  onNodeDragStop: (event: React.MouseEvent, node: Node) => void
  handleEdgeLabelConfirm: (newText: string) => void
}

export function useReactFlowHandlers(
  fitViewRequestedAfterDimensionsRef: React.MutableRefObject<boolean>
): UseReactFlowHandlersReturn {
  const [edgeIdsToDelete, setEdgeIdsToDelete] = useState<string[] | null>(null)
  const [edgeLabelEdit, setEdgeLabelEdit] = useState<EdgeLabelEditState | null>(null)

  const dragStartPositionsRef = useRef<Record<string, { x: number; y: number }> | null>(null)
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

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ edgeId: string }>).detail
      if (!detail?.edgeId) return
      const state = useGraphStore.getState()
      const edge = state.edges.find((e) => e.id === detail.edgeId)
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
    }
    window.addEventListener('edge-label-edit', handler)
    return () => window.removeEventListener('edge-label-edit', handler)
  }, [])

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
            window.dispatchEvent(new CustomEvent('graph-request-fitview'))
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
    window.dispatchEvent(new CustomEvent('focus-generated-node', { detail: { nodeId: node.id } }))
  }, [])

  const onPaneClick = useCallback(() => {
    clearSelection()
  }, [clearSelection])

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      const sourceHandle = connection.sourceHandle || ''
      let connectionType = 'default'
      let choiceIndex: number | undefined
      if (sourceHandle.startsWith('choice:')) {
        connectionType = 'choice'
        const choiceId = sourceHandle.slice(7)
        const nodes = useGraphStore.getState().nodes
        const sourceNode = nodes.find((n) => n.id === connection.source)
        const choices = (sourceNode?.data?.choices as Array<{ choiceId?: string }>) ?? []
        const idx = choices.findIndex((c, i) => (c?.choiceId ?? `__idx_${i}`) === choiceId)
        choiceIndex = idx >= 0 ? idx : undefined
      } else if (sourceHandle.startsWith('choice-')) {
        connectionType = 'choice'
        choiceIndex = parseInt(sourceHandle.replace('choice-', ''), 10)
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

  const onNodeDragStart = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      _pushUndoSnapshot()
      const ids = useGraphStore.getState().selectedNodeIds
      if (ids.length > 1 && ids.includes(node.id)) {
        const nodes = useGraphStore.getState().nodes
        const positions: Record<string, { x: number; y: number }> = {}
        for (const id of ids) {
          const n = nodes.find((nd) => nd.id === id)
          if (n) positions[id] = { x: n.position.x, y: n.position.y }
        }
        dragStartPositionsRef.current = positions
      } else {
        dragStartPositionsRef.current = null
      }
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
      const ids = useGraphStore.getState().selectedNodeIds
      if (startPositions && ids.length > 1 && ids.includes(node.id)) {
        const dx = node.position.x - startPositions[node.id].x
        const dy = node.position.y - startPositions[node.id].y
        for (const id of ids) {
          const start = startPositions[id]
          if (start) updateNodePosition(id, { x: start.x + dx, y: start.y + dy }, true)
        }
        markDirty()
      } else {
        updateNodePosition(node.id, node.position, undefined, false)
      }
      dragStartPositionsRef.current = null
    },
    [updateNodePosition, markDirty, _pushUndoSnapshot]
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
    onNodeDragStart,
    onNodeDragStop,
    handleEdgeLabelConfirm,
  }
}
