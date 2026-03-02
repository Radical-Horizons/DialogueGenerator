/**
 * Canvas principal du graphe avec ReactFlow.
 * Gère l'affichage interactif du graphe de dialogues.
 */
import { memo, useCallback, useMemo, useEffect } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  type Connection,
  type Node,
  type NodeTypes,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { DialogueNode, TestNode, EndNode } from './nodes'
import { useGraphStore } from '../../store/graphStore'
import { theme } from '../../theme'

export const GraphCanvas = memo(function GraphCanvas() {
  const {
    nodes: storeNodes,
    edges: storeEdges,
    validationErrors,
    // selectedNodeId non utilisé - gardé pour usage futur
    // selectedNodeId,
    highlightedNodeIds,
    highlightedCycleNodes,
    setSelectedNode,
    updateNodePosition,
    connectNodes,
    deleteNode,
  } = useGraphStore()
  
  // Utiliser les hooks ReactFlow pour gérer l'état local du graphe
  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges)
  
  // Zoom automatique retiré : le zoom ne se fait plus automatiquement lors d'un clic sur un nœud
  
  // Synchroniser avec le store quand les nodes/edges changent
  // Enrichir les nœuds avec les erreurs de validation et le highlight de recherche
  const enrichedNodes = useMemo(() => {
    return storeNodes.map((node) => {
      const nodeErrors = validationErrors.filter((err) => err.node_id === node.id)
      const errors = nodeErrors.filter((err) => err.severity === 'error')
      const warnings = nodeErrors.filter((err) => err.severity === 'warning')
      const isHighlighted = highlightedNodeIds.includes(node.id)
      const isInCycle = highlightedCycleNodes.includes(node.id)
      
      return {
        ...node,
        style: {
          ...node.style,
          // Style orange pour les nœuds dans des cycles
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
  }, [storeNodes, validationErrors, highlightedNodeIds, highlightedCycleNodes])
  
  useEffect(() => {
    setNodes(enrichedNodes)
  }, [enrichedNodes, setNodes])
  
  // Enrichir les edges avec des styles d'erreur pour les connexions cassées
  const enrichedEdges = useMemo(() => {
    // Identifier les erreurs de type broken_reference
    const brokenReferences = validationErrors.filter(
      (err) => err.type === 'broken_reference' && err.target
    )
    const brokenTargets = new Set(brokenReferences.map((err) => err.target!))
    
    return storeEdges.map((edge) => {
      // Vérifier si cette edge pointe vers un nœud inexistant
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
  
  useEffect(() => {
    setEdges(enrichedEdges)
  }, [enrichedEdges, setEdges])
  
  // Types de nœuds personnalisés
  const nodeTypes: NodeTypes = useMemo(
    () => ({
      dialogueNode: DialogueNode,
      testNode: TestNode,
      endNode: EndNode,
    }),
    []
  )
  
  // Handler pour la sélection de nœud
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id)
    },
    [setSelectedNode]
  )
  
  // Handler pour le clic sur le canvas (désélection)
  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [setSelectedNode])
  
  // Handler pour la connexion de nœuds
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      
      // Déterminer le type de connexion
      const sourceHandle = connection.sourceHandle || ''
      let connectionType = 'default'
      let choiceIndex: number | undefined
      
      if (sourceHandle.startsWith('choice-')) {
        connectionType = 'choice'
        choiceIndex = parseInt(sourceHandle.replace('choice-', ''), 10)
      } else if (sourceHandle === 'success') {
        connectionType = 'success'
      } else if (sourceHandle === 'failure') {
        connectionType = 'failure'
      }
      
      // Ajouter au store
      connectNodes(connection.source, connection.target, choiceIndex, connectionType)
      
      // Ajouter à ReactFlow (pour affichage immédiat)
      setEdges((eds) => addEdge(connection, eds))
    },
    [connectNodes, setEdges]
  )
  
  // Handler pour le déplacement de nœud (drag)
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      updateNodePosition(node.id, node.position)
    },
    [updateNodePosition]
  )
  
  // Handler pour synchroniser les changements depuis ReactFlow vers le store
  // IMPORTANT: Ne PAS synchroniser les positions pendant le drag pour éviter le blinking
  // Les positions sont mises à jour uniquement sur onNodeDragStop
  const handleNodesChange = useCallback(
    (changes: Array<{ type: string; id?: string; position?: { x: number; y: number }; [key: string]: unknown }>) => {
      // Intercepter les suppressions de nœuds pour synchroniser avec le store
      for (const change of changes) {
        if (change.type === 'remove' && change.id) {
          // Appeler deleteNode du store pour gérer la synchronisation TestNode ↔ choix parent
          deleteNode(change.id)
        }
      }
      
      // Appeler le handler ReactFlow par défaut (gère l'état local du drag)
      onNodesChange(changes)
      
      // NE PAS synchroniser les positions pendant le drag (évite le blinking)
      // Les positions sont synchronisées uniquement dans onNodeDragStop
    },
    [onNodesChange, deleteNode]
  )
  
  // Composant interne pour utiliser useReactFlow (doit être dans ReactFlowProvider)
  const GraphCanvasInner = memo(function GraphCanvasInner() {
    const reactFlowInstance = useReactFlow()
    const { fitView, getNode } = reactFlowInstance
    const { setSelectedNode } = useGraphStore()
    
    // Exposer l'instance ReactFlow pour l'export (via un custom event ou ref)
    useEffect(() => {
      // Stocker l'instance dans un custom event pour que GraphEditor puisse y accéder
      const event = new CustomEvent('reactflow-instance-ready', { 
        detail: reactFlowInstance 
      })
      window.dispatchEvent(event)
    }, [reactFlowInstance])
    
    // Zoom automatique retiré : le zoom ne se fait plus automatiquement lors d'un clic sur un nœud
    
    // Écouter l'événement pour focus un nœud généré (avec animation flash)
    useEffect(() => {
      const handleFocusNode = (event: CustomEvent<{ nodeId: string }>) => {
        const nodeId = event.detail.nodeId
        const node = getNode(nodeId)
        if (node) {
          // Sélectionner le nœud
          setSelectedNode(nodeId)
          
          // Zoom vers le nœud après un court délai pour que le nœud soit bien rendu
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
    }, [getNode, fitView, setSelectedNode])
    
    return null
  })
  
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <GraphCanvasInner />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onInit={(instance) => {
          // Exposer l'instance ReactFlow pour l'export
          const event = new CustomEvent('reactflow-instance-ready', { 
            detail: instance 
          })
          window.dispatchEvent(event)
        }}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
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
        {/* Background avec grille */}
        <Background
          color={theme.text.secondary}
          gap={15}
          size={1}
          style={{ opacity: 0.2 }}
        />
        
        {/* Controls (zoom, pan, fit view) */}
        <Controls />
        
        {/* Minimap */}
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
