/**
 * Canvas principal du graphe avec ReactFlow.
 * Mode controlled (ADR-007) : nodes et edges proviennent exclusivement du store.
 */
import { memo, useCallback, useMemo, useEffect, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Connection,
  type Node,
  type NodeChange,
  type EdgeChange,
  type NodeTypes,
  type Viewport,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { DialogueNode, TestNode, EndNode } from './nodes'
import { StableLabelSmoothStepEdge } from './edges/StableLabelSmoothStepEdge'
import { NodeContextMenu } from './NodeContextMenu'
import { useGraphStore } from '../../store/graphStore'
import { theme } from '../../theme'

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
    if (isGraphLoading || !documentId) {
      return
    }
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
        // Délai court pour laisser la virtualisation mesurer le nœud avant fitView (centrage fiable).
        // AC #3 : animation fluide 300 ms.
        fitViewTimeoutId = window.setTimeout(() => {
          fitViewTimeoutId = null
          fitView({
            nodes: [node],
            duration: 300,
            padding: 0.3,
          })
        }, 100)
      }
    }
    window.addEventListener('focus-generated-node', handleFocusNode as EventListener)
    return () => {
      window.removeEventListener('focus-generated-node', handleFocusNode as EventListener)
      if (fitViewTimeoutId !== null) {
        window.clearTimeout(fitViewTimeoutId)
      }
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

export const GraphCanvas = memo(function GraphCanvas() {
  const {
    nodes: storeNodes,
    edges: storeEdges,
    selectedNodeId,
    validationErrors,
    highlightedNodeIds,
    highlightedCycleNodes,
    documentId,
    setSelectedNode,
    updateNodePosition,
    updateNodeDimensions,
    connectNodes,
    deleteNode,
    disconnectNodes,
  } = useGraphStore()
  const [menu, setMenu] = useState<{ id: string; top: number; left: number; right?: number; bottom?: number } | null>(null)
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT)
  const ref = useRef<HTMLDivElement>(null)

  const openContextMenu = useCallback(
    (nodeId: string, clientX: number, clientY: number) => {
      const menuWidth = 200
      const menuHeight = 220
      const padding = 8
      // position:fixed → coordonnées viewport ; garder le menu à l'écran
      let left = clientX + padding
      let top = clientY + padding
      if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - padding
      if (top + menuHeight > window.innerHeight) top = window.innerHeight - menuHeight - padding
      if (left < padding) left = padding
      if (top < padding) top = padding
      setMenu({ id: nodeId, top, left, right: undefined, bottom: undefined })
    },
    [setMenu]
  )

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault()
      openContextMenu(node.id, event.clientX, event.clientY)
    },
    [openContextMenu]
  )

  // Fallback : si React Flow ne déclenche pas onNodeContextMenu (ex. nœuds custom), écouter l'événement du nœud
  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ nodeId: string; clientX: number; clientY: number }>
      if (ev.detail?.nodeId) {
        openContextMenu(ev.detail.nodeId, ev.detail.clientX ?? 0, ev.detail.clientY ?? 0)
      }
    }
    window.addEventListener('graph-node-contextmenu', handler)
    return () => window.removeEventListener('graph-node-contextmenu', handler)
  }, [openContextMenu])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
    setMenu(null)
  }, [setSelectedNode, setMenu])

  /** Double-clic nœud → focus (centrage + zoom confortable). Réutilise focus-generated-node (Story 2.3 AC #3). */
  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    window.dispatchEvent(new CustomEvent('focus-generated-node', { detail: { nodeId: node.id } }))
  }, [])

  const fitViewRequestedAfterDimensionsRef = useRef(false)
  useEffect(() => {
    fitViewRequestedAfterDimensionsRef.current = false
  }, [documentId])

  // RAF throttle pour updateNodePosition pendant le drag (évite scintillement)
  const positionRafRef = useRef<number | null>(null)
  const pendingPositionRef = useRef<{ nodeId: string; position: { x: number; y: number } } | null>(null)

  // Annuler le RAF en attente au démontage (évite updateNodePosition après unmount)
  useEffect(() => {
    return () => {
      if (positionRafRef.current !== null) {
        cancelAnimationFrame(positionRafRef.current)
        positionRafRef.current = null
      }
    }
  }, [])

  // Dériver nodes du store avec enrichissement (validation, highlight, sélection) — AC #1, #3
  const nodes = useMemo(() => {
    return storeNodes.map((node) => {
      const nodeErrors = validationErrors.filter((err) => err.node_id === node.id)
      const errors = nodeErrors.filter((err) => err.severity === 'error')
      const warnings = nodeErrors.filter((err) => err.severity === 'warning')
      const isHighlighted = highlightedNodeIds.includes(node.id)
      const isInCycle = highlightedCycleNodes.includes(node.id)

      return {
        ...node,
        selected: node.id === selectedNodeId,
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
  }, [storeNodes, selectedNodeId, validationErrors, highlightedNodeIds, highlightedCycleNodes])

  // Dériver edges du store avec enrichissement (broken reference) — AC #1
  // Exclure les edges avec sourceHandle legacy "choice-N" (ADR-008) pour éviter React Flow #008 et permettre l'affichage du graphe
  const edges = useMemo(() => {
    const brokenReferences = validationErrors.filter(
      (err) => err.type === 'broken_reference' && err.target
    )
    const brokenTargets = new Set(brokenReferences.map((err) => err.target!))
    const hasLegacyChoiceHandles = storeEdges.some((edge) => {
      const sh = edge.sourceHandle
      return Boolean(sh && /^choice-\d+$/.test(sh))
    })

    // Fast path: conserver exactement la même référence d'edges.
    // Cela évite les remounts d'EdgeLabel pendant le drag si rien ne change côté edges.
    if (brokenTargets.size === 0 && !hasLegacyChoiceHandles) {
      return storeEdges
    }

    const validEdges = storeEdges.filter((edge) => {
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
  }, [storeEdges, validationErrors])

  const flushPositionUpdate = useCallback(() => {
    if (pendingPositionRef.current) {
      const { nodeId, position } = pendingPositionRef.current
      pendingPositionRef.current = null
      updateNodePosition(nodeId, position)
    }
    positionRafRef.current = null
  }, [updateNodePosition])

  const schedulePositionUpdate = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      pendingPositionRef.current = { nodeId, position }
      if (positionRafRef.current === null) {
        positionRafRef.current = requestAnimationFrame(flushPositionUpdate)
      }
    },
    [flushPositionUpdate]
  )

  // onNodesChange : uniquement actions du store — AC #2, #3
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === 'remove' && change.id) {
          deleteNode(change.id)
          continue
        }
        if (change.type === 'select' && change.id !== undefined) {
          setSelectedNode(change.selected ? change.id : null)
          continue
        }
        if (change.type === 'position' && change.position && change.id) {
          // Pendant le drag, throttler via RAF ; position finale gérée par onNodeDragStop
          const isDragging = 'dragging' in change && change.dragging
          if (isDragging) {
            schedulePositionUpdate(change.id, change.position)
          } else {
            updateNodePosition(change.id, change.position)
          }
          continue
        }
        if (change.type === 'dimensions' && change.id && 'dimensions' in change) {
          // React Flow controlled mode: we must apply dimension updates back to node state,
          // otherwise React Flow keeps nodes container `visibility:hidden` (nodes not "initialized").
          const dims = (change as { dimensions?: { width?: number; height?: number } }).dimensions
          if (dims && typeof dims.width === 'number' && typeof dims.height === 'number') {
            updateNodeDimensions(change.id, {
              width: dims.width,
              height: dims.height,
            })
            if (!fitViewRequestedAfterDimensionsRef.current) {
              fitViewRequestedAfterDimensionsRef.current = true
              window.dispatchEvent(new CustomEvent(FITVIEW_AFTER_DIMENSIONS_EVENT))
            }
          }
          continue
        }
      }
    },
    [
      deleteNode,
      setSelectedNode,
      updateNodePosition,
      updateNodeDimensions,
      schedulePositionUpdate,
    ]
  )

  // onEdgesChange : uniquement actions du store — AC #2
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === 'remove' && change.id) {
          disconnectNodes(change.id)
        }
      }
    },
    [disconnectNodes]
  )

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id)
    },
    [setSelectedNode]
  )

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
      }
      connectNodes(connection.source, connection.target, choiceIndex, connectionType)
    },
    [connectNodes]
  )

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      // Annuler tout RAF en attente et committer la position finale
      if (positionRafRef.current !== null) {
        cancelAnimationFrame(positionRafRef.current)
        positionRafRef.current = null
      }
      if (pendingPositionRef.current?.nodeId === node.id) {
        updateNodePosition(node.id, pendingPositionRef.current.position)
        pendingPositionRef.current = null
      } else {
        updateNodePosition(node.id, node.position)
      }
    },
    [updateNodePosition]
  )

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      dialogueNode: DialogueNode,
      testNode: TestNode,
      endNode: EndNode,
    }),
    []
  )

  const edgeTypes = useMemo(
    () => ({
      smoothstep: StableLabelSmoothStepEdge,
    }),
    []
  )

  const onMove = useCallback((_event: unknown, newViewport: Viewport) => {
    setViewport(newViewport)
  }, [])

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
          const event = new CustomEvent('reactflow-instance-ready', {
            detail: instance,
          })
          window.dispatchEvent(event)
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
          style: { stroke: theme.text.secondary, strokeWidth: 2 },
        }}
        style={{
          backgroundColor: theme.background.panel,
        }}
      >
        <Background
          color={theme.text.secondary}
          gap={15}
          size={1}
          style={{ opacity: 0.2 }}
        />
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
              case 'dialogueNode':
                return '#4A90E2'
              case 'testNode':
                return '#F5A623'
              case 'endNode':
                return '#B8B8B8'
              default:
                return '#4A90E2'
            }
          }}
          nodeBorderRadius={8}
          style={{
            backgroundColor: theme.background.secondary,
            border: `1px solid ${theme.border.primary}`,
          }}
          maskColor={`${theme.background.panel}80`}
        />
        {menu && <NodeContextMenu {...menu} onClose={() => setMenu(null)} />}
      </ReactFlow>
    </div>
  )
})
