/**
 * Canvas principal du graphe avec ReactFlow.
 * Mode controlled (ADR-007) : nodes et edges proviennent exclusivement du store.
 */
import { memo, useCallback, useMemo, useEffect, useRef } from 'react'
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
} from 'reactflow'
import 'reactflow/dist/style.css'
import { DialogueNode, TestNode, EndNode } from './nodes'
import { StableLabelSmoothStepEdge } from './edges/StableLabelSmoothStepEdge'
import { useGraphStore } from '../../store/graphStore'
import { theme } from '../../theme'

/** Module-level so React keeps the same component identity across GraphCanvas re-renders. */
const GraphCanvasInner = memo(function GraphCanvasInner() {
  const reactFlowInstance = useReactFlow()
  const instanceRef = useRef(reactFlowInstance)
  instanceRef.current = reactFlowInstance
  const { fitView, getNode } = reactFlowInstance
  const setSelectedNodeInner = useGraphStore((s) => s.setSelectedNode)
  const isGraphLoading = useGraphStore((s) => s.isLoading)
  const documentId = useGraphStore((s) => s.documentId)
  const alreadyFitForDocumentIdRef = useRef<string | null>(null)

  // Fit view once per dialogue when load has finished. Signal: !isGraphLoading + documentId (not nodesLength).
  // Double rAF runs after layout so React Flow has measured nodes; ref prevents duplicate fit per document.
  useEffect(() => {
    if (isGraphLoading || !documentId) return
    if (alreadyFitForDocumentIdRef.current === documentId) return
    alreadyFitForDocumentIdRef.current = documentId
    let cancelled = false
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) instanceRef.current?.fitView({ padding: 0.2, duration: 0 })
      })
    })
    return () => {
      cancelled = true
    }
  }, [isGraphLoading, documentId])

  useEffect(() => {
    const handleFocusNode = (event: CustomEvent<{ nodeId: string }>) => {
      const nodeId = event.detail.nodeId
      const node = getNode(nodeId)
      if (node) {
        setSelectedNodeInner(nodeId)
        setTimeout(() => {
          fitView({
            nodes: [node],
            duration: 400,
            padding: 0.3,
          })
        }, 100)
      }
    }
    window.addEventListener('focus-generated-node', handleFocusNode as EventListener)
    return () => {
      window.removeEventListener('focus-generated-node', handleFocusNode as EventListener)
    }
  }, [getNode, fitView, setSelectedNodeInner])

  return null
})

export const GraphCanvas = memo(function GraphCanvas() {
  const {
    nodes: storeNodes,
    edges: storeEdges,
    selectedNodeId,
    validationErrors,
    highlightedNodeIds,
    highlightedCycleNodes,
    setSelectedNode,
    updateNodePosition,
    updateNode,
    connectNodes,
    deleteNode,
    disconnectNodes,
  } = useGraphStore()

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
  const edges = useMemo(() => {
    const brokenReferences = validationErrors.filter(
      (err) => err.type === 'broken_reference' && err.target
    )
    const brokenTargets = new Set(brokenReferences.map((err) => err.target!))

    return storeEdges.map((edge) => {
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
            updateNode(change.id, {
              measured: { width: dims.width, height: dims.height },
              width: dims.width,
              height: dims.height,
            } as Partial<Node>)
          }
          continue
        }
      }
    },
    [
      deleteNode,
      setSelectedNode,
      updateNodePosition,
      updateNode,
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

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [setSelectedNode])

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

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <GraphCanvasInner />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2, duration: 0 }}
        onlyRenderVisibleElements={false}
        onInit={(instance) => {
          const event = new CustomEvent('reactflow-instance-ready', {
            detail: instance,
          })
          window.dispatchEvent(event)
          // fitView is triggered once per dialogue in GraphCanvasInner (documentId + nodesLength)
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
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
      </ReactFlow>
    </div>
  )
})
