/**
 * Canvas principal du graphe avec ReactFlow.
 * Mode controlled (ADR-007) : nodes et edges proviennent exclusivement du store.
 * Les handlers événementiels sont délégués à useReactFlowHandlers.
 */
import { memo, useMemo, useEffect, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type ReactFlowInstance,
  type Node as ReactFlowNode,
  type NodeTypes,
  type Viewport,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { DialogueNode, TestNode, EndNode } from './nodes'
import { StableLabelSmoothStepEdge } from './edges/StableLabelSmoothStepEdge'
import { NodeContextMenu } from './NodeContextMenu'
import { PaneContextMenu } from './PaneContextMenu'
import { EdgeLabelEditModal } from './EdgeLabelEditModal'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import { useGraphStore } from '../../store/graphStore'
import { theme } from '../../theme'
import { applyNodeFilters, applyEdgeFilters } from './graphFilterUtils'
import { useReactFlowHandlers } from '../../hooks/useReactFlowHandlers'

const FITVIEW_AFTER_DIMENSIONS_EVENT = 'graph-request-fitview'

/** Module-level so React keeps the same component identity across GraphCanvas re-renders. */
const GraphCanvasInner = memo(function GraphCanvasInner() {
  const reactFlowInstance = useReactFlow()
  const instanceRef = useRef(reactFlowInstance)
  instanceRef.current = reactFlowInstance
  const { fitView, getNode } = reactFlowInstance
  const setSelectedNodeInner = useGraphStore((s) => s.setSelectedNode)
  const setHighlightedNodesInner = useGraphStore((s) => s.setHighlightedNodes)
  const isGraphLoading = useGraphStore((s) => s.isLoading)
  const documentId = useGraphStore((s) => s.documentId)
  const alreadyFitForDocumentIdRef = useRef<string | null>(null)

  // Fit view once per dialogue when load has finished. Signal: !isGraphLoading + documentId (not nodesLength).
  // Double rAF runs after layout so React Flow has measured nodes; ref prevents duplicate fit per document.
  useEffect(() => {
    if (isGraphLoading || !documentId) return
    if (alreadyFitForDocumentIdRef.current === documentId) return
    alreadyFitForDocumentIdRef.current = documentId
    const documentIdToFit = documentId
    const runFitView = () => {
      if (useGraphStore.getState().documentId !== documentIdToFit) return
      const instance = instanceRef.current
      if (instance) instance.fitView({ padding: 0.2, duration: 0 })
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(runFitView)
    })
    window.setTimeout(runFitView, 150)
  }, [isGraphLoading, documentId])

  useEffect(() => {
    let fitViewTimeoutId: number | null = null
    const handleFocusNode = (event: CustomEvent<{ nodeId: string }>) => {
      if (fitViewTimeoutId !== null) {
        window.clearTimeout(fitViewTimeoutId)
        fitViewTimeoutId = null
      }
      const nodeId = event.detail.nodeId
      const node = getNode(nodeId)
      if (node) {
        setHighlightedNodesInner([nodeId])
        setSelectedNodeInner(nodeId)
        fitViewTimeoutId = window.setTimeout(() => {
          fitViewTimeoutId = null
          fitView({ nodes: [node], duration: 300, padding: 0.3 })
        }, 100)
      }
    }
    window.addEventListener('focus-generated-node', handleFocusNode as EventListener)
    return () => {
      window.removeEventListener('focus-generated-node', handleFocusNode as EventListener)
      if (fitViewTimeoutId !== null) window.clearTimeout(fitViewTimeoutId)
    }
  }, [getNode, fitView, setSelectedNodeInner, setHighlightedNodesInner])

  useEffect(() => {
    let timeoutId: number | null = null
    const handler = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          instanceRef.current?.fitView({ padding: 0.2, duration: 200 })
        })
      })
      if (timeoutId) window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => {
        instanceRef.current?.fitView({ padding: 0.2, duration: 200 })
        timeoutId = null
      }, 120)
    }
    window.addEventListener(FITVIEW_AFTER_DIMENSIONS_EVENT, handler)
    return () => {
      window.removeEventListener(FITVIEW_AFTER_DIMENSIONS_EVENT, handler)
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  }, [])

  return null
})

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 120, zoom: 1 }
const SNAP_GRID: [number, number] = [15, 15]

export const GraphCanvas = memo(function GraphCanvas() {
  const {
    nodes: storeNodes,
    edges: storeEdges,
    graphFilters,
    selectedNodeIds,
    validationErrors,
    highlightedNodeIds,
    highlightedCycleNodes,
    documentId,
  } = useGraphStore()

  const visibleStoreNodes = useMemo(
    () => applyNodeFilters(storeNodes, graphFilters),
    [storeNodes, graphFilters]
  )
  const visibleStoreNodeIds = useMemo(
    () => new Set(visibleStoreNodes.map((n) => n.id)),
    [visibleStoreNodes]
  )
  const visibleStoreEdges = useMemo(
    () => applyEdgeFilters(storeEdges, visibleStoreNodeIds, graphFilters),
    [storeEdges, visibleStoreNodeIds, graphFilters]
  )

  const [menu, setMenu] = useState<{
    id: string
    top: number
    left: number
    right?: number
    bottom?: number
  } | null>(null)
  const [paneMenu, setPaneMenu] = useState<{
    top: number
    left: number
    position: { x: number; y: number } | undefined
  } | null>(null)
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null)
  const { createEmptyNode, addNode, applyAutoLayout } = useGraphStore()
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT)
  const ref = useRef<HTMLDivElement>(null)

  const fitViewRequestedAfterDimensionsRef = useRef(false)
  useEffect(() => {
    fitViewRequestedAfterDimensionsRef.current = false
  }, [documentId])

  const {
    edgeIdsToDelete,
    edgeLabelEdit,
    setEdgeLabelEdit,
    onNodesChange,
    onEdgesChange,
    onConfirmDeleteEdges,
    onCancelDeleteEdges,
    onNodeClick,
    onNodeDoubleClick,
    onPaneClick: onPaneClickBase,
    onConnect,
    onNodeDragStart,
    onNodeDragStop,
    handleEdgeLabelConfirm,
  } = useReactFlowHandlers(fitViewRequestedAfterDimensionsRef)

  const openContextMenu = (nodeId: string, clientX: number, clientY: number) => {
    const menuWidth = 200
    const menuHeight = 220
    const padding = 8
    let left = clientX + padding
    let top = clientY + padding
    if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - padding
    if (top + menuHeight > window.innerHeight) top = window.innerHeight - menuHeight - padding
    if (left < padding) left = padding
    if (top < padding) top = padding
    setPaneMenu(null)
    setMenu({ id: nodeId, top, left, right: undefined, bottom: undefined })
  }

  const onNodeContextMenu = (event: React.MouseEvent, node: ReactFlowNode) => {
    event.preventDefault()
    openContextMenu(node.id, event.clientX, event.clientY)
  }

  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ nodeId: string; clientX: number; clientY: number }>
      if (ev.detail?.nodeId) {
        openContextMenu(ev.detail.nodeId, ev.detail.clientX ?? 0, ev.detail.clientY ?? 0)
      }
    }
    window.addEventListener('graph-node-contextmenu', handler)
    return () => window.removeEventListener('graph-node-contextmenu', handler)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenu(null)
        setPaneMenu(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) {
        setMenu(null)
        setPaneMenu(null)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  const onPaneContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
    const padding = 8
    const menuWidth = 180
    const menuHeight = 90
    let left = event.clientX + padding
    let top = event.clientY + padding
    if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - padding
    if (top + menuHeight > window.innerHeight) top = window.innerHeight - menuHeight - padding
    if (left < padding) left = padding
    if (top < padding) top = padding
    const position = reactFlowInstanceRef.current
      ? reactFlowInstanceRef.current.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        })
      : undefined
    setMenu(null)
    setPaneMenu({ top, left, position })
  }

  const onPaneClick = () => {
    onPaneClickBase()
    setMenu(null)
    setPaneMenu(null)
  }

  // Dériver nodes du store avec enrichissement (validation, highlight, sélection)
  const nodes = useMemo(() => {
    return visibleStoreNodes.map((node) => {
      const nodeErrors = validationErrors.filter((err) => err.node_id === node.id)
      const errors = nodeErrors.filter((err) => err.severity === 'error')
      const warnings = nodeErrors.filter((err) => err.severity === 'warning')
      const isHighlighted = highlightedNodeIds.includes(node.id)
      const isInCycle = highlightedCycleNodes.includes(node.id)
      return {
        ...node,
        selected: selectedNodeIds.includes(node.id),
        style: {
          ...node.style,
          ...(isInCycle && {
            border: '3px solid orange',
            backgroundColor: 'rgba(255, 165, 0, 0.2)',
          }),
        },
        data: {
          ...node.data,
          validationErrors: errors,
          validationWarnings: warnings,
          isHighlighted,
        },
      }
    })
  }, [visibleStoreNodes, selectedNodeIds, validationErrors, highlightedNodeIds, highlightedCycleNodes])

  // Dériver edges du store — Story 2.9 FR30, ADR-008
  const edges = useMemo(() => {
    const brokenReferences = validationErrors.filter(
      (err) => err.type === 'broken_reference' && err.target
    )
    const brokenTargets = new Set(brokenReferences.map((err) => err.target!))
    const hasLegacyChoiceHandles = visibleStoreEdges.some((edge) => {
      const sh = edge.sourceHandle
      return Boolean(sh && /^choice-\d+$/.test(sh))
    })
    if (brokenTargets.size === 0 && !hasLegacyChoiceHandles) {
      return visibleStoreEdges
    }
    const validEdges = visibleStoreEdges.filter((edge) => {
      const sh = edge.sourceHandle
      if (sh && /^choice-\d+$/.test(sh)) return false
      return true
    })
    return validEdges.map((edge) => {
      const isBroken = brokenTargets.has(edge.target)
      if (isBroken) {
        return {
          ...edge,
          style: {
            ...edge.style,
            stroke: theme.state.error.border,
            strokeDasharray: '8,4',
            opacity: 0.5,
          },
          animated: false,
        }
      }
      return edge
    })
  }, [visibleStoreEdges, validationErrors])

  const nodeTypes: NodeTypes = useMemo(
    () => ({ dialogueNode: DialogueNode, testNode: TestNode, endNode: EndNode }),
    []
  )
  const edgeTypes = useMemo(() => ({ smoothstep: StableLabelSmoothStepEdge }), [])
  const defaultEdgeOptions = useMemo(
    () => ({
      type: 'smoothstep' as const,
      animated: false,
      style: { stroke: theme.text.secondary, strokeWidth: 2 },
    }),
    []
  )
  const reactFlowStyle = useMemo(() => ({ backgroundColor: theme.background.panel }), [])

  const onMove = (_event: unknown, newViewport: Viewport) => {
    setViewport(newViewport)
  }

  return (
    <div ref={ref} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <GraphCanvasInner />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView={false}
        defaultViewport={DEFAULT_VIEWPORT}
        minZoom={0.1}
        maxZoom={2}
        panActivationKeyCode="Space"
        onlyRenderVisibleElements={true}
        onMove={onMove}
        onInit={(instance) => {
          reactFlowInstanceRef.current = instance
          window.dispatchEvent(new CustomEvent('reactflow-instance-ready', { detail: instance }))
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={onPaneClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        multiSelectionKeyCode="Shift"
        selectionOnDrag
        autoPanOnNodeDrag
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        snapToGrid
        snapGrid={SNAP_GRID}
        defaultEdgeOptions={defaultEdgeOptions}
        style={reactFlowStyle}
      >
        <Background color={theme.text.secondary} gap={15} size={1} style={{ opacity: 0.2 }} />
        <Controls />
        <div
          aria-label="Zoom level"
          style={{
            position: 'absolute',
            bottom: 48,
            left: 12,
            fontSize: 12,
            color: theme.text.secondary,
            backgroundColor: theme.background.secondary,
            padding: '2px 6px',
            borderRadius: 4,
            border: `1px solid ${theme.border.primary}`,
          }}
        >
          {Math.round(viewport.zoom * 100)}%
        </div>
        <MiniMap
          nodeColor={(node) => {
            switch (node.type) {
              case 'dialogueNode': return '#4A90E2'
              case 'testNode': return '#F5A623'
              case 'endNode': return '#B8B8B8'
              default: return '#4A90E2'
            }
          }}
          nodeBorderRadius={8}
          style={{
            backgroundColor: theme.background.secondary,
            border: `1px solid ${theme.border.primary}`,
          }}
          maskColor={`${theme.background.panel}80`}
        />
      </ReactFlow>
      {menu && <NodeContextMenu {...menu} onClose={() => setMenu(null)} />}
      {paneMenu && (
        <PaneContextMenu
          top={paneMenu.top}
          left={paneMenu.left}
          onCreateNode={() => {
            const node = createEmptyNode(paneMenu.position ?? undefined)
            addNode(node)
            setPaneMenu(null)
          }}
          onAutoLayout={() => {
            applyAutoLayout('dagre', 'TB')
            setPaneMenu(null)
          }}
          onClose={() => setPaneMenu(null)}
        />
      )}
      <EdgeLabelEditModal
        isOpen={edgeLabelEdit != null}
        initialValue={edgeLabelEdit?.initialText ?? ''}
        onConfirm={handleEdgeLabelConfirm}
        onCancel={() => setEdgeLabelEdit(null)}
      />
      <ConfirmDialog
        isOpen={edgeIdsToDelete != null && edgeIdsToDelete.length > 0}
        title={
          edgeIdsToDelete?.length === 1 ? 'Supprimer la connexion' : 'Supprimer les connexions'
        }
        message={
          edgeIdsToDelete?.length === 1
            ? 'Supprimer cette connexion ?'
            : `Supprimer ${edgeIdsToDelete?.length ?? 0} connexions ?`
        }
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        onConfirm={onConfirmDeleteEdges}
        onCancel={onCancelDeleteEdges}
        variant="danger"
      />
    </div>
  )
})
