/**
 * Canvas principal du graphe avec ReactFlow.
 * Mode controlled (ADR-007) : nodes et edges proviennent exclusivement du store.
 * Les handlers événementiels sont délégués à useReactFlowHandlers.
 */
import { memo, useMemo, useEffect, useRef, useState, useCallback } from 'react'
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
import { DropChoiceModal } from './DropChoiceModal'
import { GenerationLoaderContent } from './GenerationLoaderContent'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import { useGraphStore } from '../../store/graphStore'
import { useGraphViewStore } from '../../store/graphViewStore'
import { useContextStore } from '../../store/contextStore'
import { theme } from '../../theme'
import { applyNodeFilters, applyEdgeFilters } from './graphFilterUtils'
import { useReactFlowHandlers } from '../../hooks/useReactFlowHandlers'
import {
  edgeStrokeFromSource,
  edgeStrokeFromSourceHandle,
  stableChoiceEdgeId,
} from '../../utils/graphEdgeBuilders'
import { useToast } from '../shared'
import { getErrorMessage } from '../../types/errors'
import { DEFAULT_MODEL } from '../../constants'

/** Déduit l'index du choix à partir du sourceHandle (choice:N ou choice:__idx_N ou choice:choiceId). */
function getChoiceIndexFromHandle(
  sourceNodeId: string,
  sourceHandleId: string,
  nodes: Array<{ id: string; data?: { choices?: Array<{ choiceId?: string }> } }>
): number | undefined {
  if (sourceHandleId.startsWith('choice-')) {
    const n = parseInt(sourceHandleId.replace('choice-', ''), 10)
    return Number.isNaN(n) ? undefined : n
  }
  if (sourceHandleId.startsWith('choice:')) {
    const id = sourceHandleId.slice(7)
    if (id.startsWith('__idx_')) {
      const n = parseInt(id.replace('__idx_', ''), 10)
      return Number.isNaN(n) ? undefined : n
    }
    const source = nodes.find((n) => n.id === sourceNodeId)
    const choices = (source?.data?.choices ?? []) as Array<{ choiceId?: string }>
    const idx = choices.findIndex((c, i) => (c?.choiceId ?? `__idx_${i}`) === id)
    return idx >= 0 ? idx : undefined
  }
  return undefined
}

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

  const focusHeadId = useGraphViewStore((s) => s.focusQueue[0] ?? null)
  const fitViewTimeoutRef = useRef<number | null>(null)
  useEffect(() => {
    if (!focusHeadId) return
    useGraphViewStore.getState().dequeueFocus()
    if (fitViewTimeoutRef.current !== null) {
      window.clearTimeout(fitViewTimeoutRef.current)
      fitViewTimeoutRef.current = null
    }
    const node = getNode(focusHeadId)
    if (node) {
      setHighlightedNodesInner([focusHeadId])
      setSelectedNodeInner(focusHeadId)
      fitViewTimeoutRef.current = window.setTimeout(() => {
        fitViewTimeoutRef.current = null
        fitView({ nodes: [node], duration: 300, padding: 0.3 })
      }, 100)
    }
    return () => {
      if (fitViewTimeoutRef.current !== null) window.clearTimeout(fitViewTimeoutRef.current)
    }
  }, [focusHeadId, getNode, fitView, setSelectedNodeInner, setHighlightedNodesInner])

  const pendingFitView = useGraphViewStore((s) => s.pendingFitView)
  useEffect(() => {
    if (!pendingFitView) return
    useGraphViewStore.getState().clearFitView()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        instanceRef.current?.fitView({ padding: 0.2, duration: 200 })
      })
    })
    const timeoutId = window.setTimeout(() => {
      instanceRef.current?.fitView({ padding: 0.2, duration: 200 })
    }, 120)
    return () => window.clearTimeout(timeoutId)
  }, [pendingFitView])

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
    () => applyEdgeFilters(storeEdges, visibleStoreNodeIds),
    [storeEdges, visibleStoreNodeIds]
  )
  const incomingEdgeColorByTarget = useMemo(() => {
    const byTarget = new Map<string, string>()
    const edgesByTarget = new Map<string, typeof visibleStoreEdges>()
    for (const edge of visibleStoreEdges) {
      const list = edgesByTarget.get(edge.target) ?? []
      list.push(edge)
      edgesByTarget.set(edge.target, list)
    }
    for (const [targetId, targetEdges] of edgesByTarget.entries()) {
      const preferred = [...targetEdges].sort((a, b) => a.id.localeCompare(b.id))[0]
      const stroke = preferred.style?.stroke
      const color =
        (typeof stroke === 'string' ? stroke : undefined) ??
        edgeStrokeFromSourceHandle(preferred.sourceHandle ?? undefined) ??
        theme.text.secondary
      byTarget.set(targetId, color)
    }
    return byTarget
  }, [visibleStoreEdges])

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
  const {
    createEmptyNode,
    addNode,
    applyAutoLayout,
    connectNodes,
    disconnectNodes,
    setSelectedNode,
    generateFromNode,
    nodes: storeNodesForChoice,
    isGenerating,
  } = useGraphStore()
  const { selections } = useContextStore()
  const toast = useToast()
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT)
  const ref = useRef<HTMLDivElement>(null)

  const [dropChoiceMenu, setDropChoiceMenu] = useState<{
    sourceNodeId: string
    sourceHandleId: string
    position: { x: number; y: number }
  } | null>(null)
  const [showContextMenuGenerationLoader, setShowContextMenuGenerationLoader] = useState(false)

  const fitViewRequestedAfterDimensionsRef = useRef(false)
  useEffect(() => {
    fitViewRequestedAfterDimensionsRef.current = false
  }, [documentId])

  const handleChoiceDropOnPane = useCallback(
    (position: { x: number; y: number }, pending: { sourceNodeId: string; sourceHandleId: string }) => {
      setDropChoiceMenu({ ...pending, position })
    },
    []
  )

  const getFlowPosition = useCallback((event: MouseEvent | TouchEvent) => {
    const clientX = 'changedTouches' in event ? event.changedTouches[0].clientX : event.clientX
    const clientY = 'changedTouches' in event ? event.changedTouches[0].clientY : event.clientY
    return reactFlowInstanceRef.current?.screenToFlowPosition({ x: clientX, y: clientY }) ?? { x: 0, y: 0 }
  }, [])

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
    onConnectStart,
    onConnectEnd,
    onNodeDragStart,
    onNodeDragStop,
    handleEdgeLabelConfirm,
  } = useReactFlowHandlers(fitViewRequestedAfterDimensionsRef, {
    getFlowPosition,
    onChoiceDropOnPane: handleChoiceDropOnPane,
  })

  const choiceIndexFromDrop = dropChoiceMenu
    ? getChoiceIndexFromHandle(dropChoiceMenu.sourceNodeId, dropChoiceMenu.sourceHandleId, storeNodesForChoice)
    : undefined

  const handleDropChoiceCreateEmpty = useCallback(() => {
    if (!dropChoiceMenu || choiceIndexFromDrop === undefined) return
    const state = useGraphStore.getState()
    const sourceNode = state.nodes.find((n) => n.id === dropChoiceMenu.sourceNodeId)
    const choices = (sourceNode?.data?.choices ?? []) as Array<{ targetNode?: string; choiceId?: string }>
    const currentChoice = choices[choiceIndexFromDrop]
    const stableId = currentChoice?.choiceId ?? `__idx_${choiceIndexFromDrop}`
    const edgeId = stableChoiceEdgeId(dropChoiceMenu.sourceNodeId, stableId)
    if (currentChoice?.targetNode && currentChoice.targetNode !== 'END' && state.edges.some((e) => e.id === edgeId)) {
      disconnectNodes(edgeId)
    }
    const node = createEmptyNode(dropChoiceMenu.position)
    addNode(node)
    connectNodes(dropChoiceMenu.sourceNodeId, node.id, choiceIndexFromDrop, 'choice', dropChoiceMenu.sourceHandleId)
    setSelectedNode(node.id)
    setDropChoiceMenu(null)
  }, [dropChoiceMenu, choiceIndexFromDrop, createEmptyNode, addNode, connectNodes, disconnectNodes, setSelectedNode])

  const handleDropChoiceGenerate = useCallback(async () => {
    if (!dropChoiceMenu || choiceIndexFromDrop === undefined) return
    try {
      const allCharacters = [
        ...(selections.characters_full || []),
        ...(selections.characters_excerpt || []),
      ]
      const npcSpeakerId = allCharacters.length > 0 ? allCharacters[0] : undefined
      const instructions = 'Continue la conversation de manière naturelle'
      const result = await generateFromNode(dropChoiceMenu.sourceNodeId, instructions, {
        context_selections: selections,
        npc_speaker_id: npcSpeakerId,
        llm_model_identifier: DEFAULT_MODEL,
        target_choice_index: choiceIndexFromDrop,
      })
      toast('Nœud généré avec succès', 'success', 2000)
      if (result.nodeId) {
        setSelectedNode(result.nodeId)
        useGraphViewStore.getState().focusNode(result.nodeId)
      }
      setDropChoiceMenu(null)
    } catch (err) {
      toast(`Erreur lors de la génération: ${getErrorMessage(err)}`, 'error')
    }
  }, [dropChoiceMenu, choiceIndexFromDrop, selections, generateFromNode, setSelectedNode, toast])

  const handleGenerateFromTestNode = useCallback(
    async (testNodeId: string) => {
      setShowContextMenuGenerationLoader(true)
      try {
        const allCharacters = [
          ...(selections.characters_full || []),
          ...(selections.characters_excerpt || []),
        ]
        const npcSpeakerId = allCharacters.length > 0 ? allCharacters[0] : undefined
        const instructions = 'Continue la conversation de manière naturelle'
        const result = await generateFromNode(testNodeId, instructions, {
          context_selections: selections,
          npc_speaker_id: npcSpeakerId,
          llm_model_identifier: DEFAULT_MODEL,
        })
        toast('Nœud généré avec succès', 'success', 2000)
        if (result.nodeId) {
          setSelectedNode(result.nodeId)
          useGraphViewStore.getState().focusNode(result.nodeId)
        }
      } catch (err) {
        toast(`Erreur lors de la génération: ${getErrorMessage(err)}`, 'error')
      } finally {
        setShowContextMenuGenerationLoader(false)
      }
    },
    [selections, generateFromNode, setSelectedNode, toast]
  )

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

  const contextMenuRequest = useGraphViewStore((s) => s.contextMenuRequest)
  useEffect(() => {
    if (!contextMenuRequest) return
    useGraphViewStore.getState().closeContextMenu()
    openContextMenu(contextMenuRequest.nodeId, contextMenuRequest.x, contextMenuRequest.y)
  }, [contextMenuRequest])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenu(null)
        setPaneMenu(null)
        setDropChoiceMenu(null)
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
        setDropChoiceMenu(null)
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
          incomingEdgeColor: incomingEdgeColorByTarget.get(node.id),
        },
      }
    })
  }, [visibleStoreNodes, selectedNodeIds, validationErrors, highlightedNodeIds, highlightedCycleNodes, incomingEdgeColorByTarget])

  // Dériver edges du store — Story 2.9 FR30, ADR-008
  const edges = useMemo(() => {
    const brokenReferences = validationErrors.filter(
      (err) => err.type === 'broken_reference' && err.target
    )
    const brokenTargets = new Set(brokenReferences.map((err) => err.target!))
    const validEdges = visibleStoreEdges.filter((edge) => {
      const sh = edge.sourceHandle
      if (sh && /^choice-\d+$/.test(sh)) return false
      return true
    })
    return validEdges.map((edge) => {
      const sourceDerivedStroke = edgeStrokeFromSource({
        sourceHandle: edge.sourceHandle ?? undefined,
        connectionType: (edge.data as { edgeType?: string } | undefined)?.edgeType,
        edgeLabel: typeof edge.label === 'string' ? edge.label : undefined,
      })
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
      if (!sourceDerivedStroke) return edge
      return {
        ...edge,
        style: {
          ...edge.style,
          stroke: sourceDerivedStroke,
        },
      }
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
          useGraphViewStore.getState().registerReactFlowInstance(instance)
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
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
      {menu && (
        <NodeContextMenu
          {...menu}
          onClose={() => setMenu(null)}
          onGenerateFromTestNode={handleGenerateFromTestNode}
        />
      )}
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
      <DropChoiceModal
        isOpen={dropChoiceMenu != null && choiceIndexFromDrop !== undefined}
        onClose={() => setDropChoiceMenu(null)}
        onCreateEmpty={handleDropChoiceCreateEmpty}
        onGenerate={handleDropChoiceGenerate}
        isGenerating={isGenerating}
      />
      {showContextMenuGenerationLoader && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
          }}
          role="status"
          aria-live="polite"
          aria-label="Génération en cours"
        >
          <div
            style={{
              backgroundColor: theme.background.panel,
              borderRadius: 8,
              padding: '1.25rem 1.5rem',
              maxWidth: 360,
              width: '90%',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
              border: `1px solid ${theme.border.primary}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <GenerationLoaderContent />
          </div>
        </div>
      )}
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
