/**
 * Vue graphe intégrée pour afficher un dialogue Unity sous forme de graphe ReactFlow.
 * Utilisé dans UnityDialogueEditor pour basculer entre vue liste et vue graphe.
 */
import { memo, useMemo, useCallback, useEffect } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { DialogueNode, TestNode, EndNode } from '../graph/nodes'
import { theme } from '../../theme'
import type { UnityDialogueNode } from '../../types/api'
import {
  buildChoiceEdge,
  buildTestResultEdge,
  choiceEdgeId,
  choiceToTestEdgeId,
  TEST_RESULT_EDGE_CONFIG,
} from '../../utils/graphEdgeBuilders'

interface GraphViewProps {
  json_content: string
}

/**
 * Convertit un dialogue Unity JSON en format ReactFlow (nodes + edges).
 * 
 * ⚠️ NOTE ARCHITECTURE :
 * Cette fonction est une "projection de présentation" pour ce composant read-only.
 * Pour la projection canonique (avec validation, gestion complète des TestNodes avec 4 résultats),
 * utilisez l'API /load qui utilise GraphConversionService (backend).
 * 
 * Voir docs/architecture/graph-conversion-architecture.md pour plus de détails.
 */
/* eslint-disable react-refresh/only-export-components -- helper partagé avec le composant, déplacer en fichier séparé si besoin */
export function unityJsonToGraph(jsonContent: string): { nodes: Node[]; edges: Edge[] } {
  try {
    const unityNodes: UnityDialogueNode[] = JSON.parse(jsonContent)
    
    if (!Array.isArray(unityNodes)) {
      throw new Error('Le JSON Unity doit être un tableau de nœuds')
    }
    
    const reactflowNodes: Node[] = []
    const reactflowEdges: Edge[] = []
    
    // Map pour stocker les TestNodes créés par choix (pour éviter les doublons)
    const testNodeMap = new Map<string, string>() // key: `${nodeId}-choice-${index}`, value: testNodeId
    
    const xOffset = 0
    let yOffset = 0
    
    for (const unityNode of unityNodes) {
      const nodeId = unityNode.id
      if (!nodeId) continue
      
      // Déterminer le type de nœud
      let nodeType = 'dialogueNode'
      if (unityNode.test) {
        nodeType = 'testNode'
      } else if (nodeId === 'END' || (!unityNode.choices && !unityNode.nextNode)) {
        nodeType = 'endNode'
      }
      
      // Créer le nœud ReactFlow
      reactflowNodes.push({
        id: nodeId,
        type: nodeType,
        position: { x: xOffset, y: yOffset },
        data: unityNode,
      })
      
      yOffset += 150
      
      // Créer les edges
      if (unityNode.nextNode) {
        reactflowEdges.push({
          id: `${nodeId}-next-${unityNode.nextNode}`,
          source: nodeId,
          target: unityNode.nextNode,
          type: 'smoothstep',
        })
      }
      
      if (unityNode.successNode) {
        reactflowEdges.push({
          id: `${nodeId}-success-${unityNode.successNode}`,
          source: nodeId,
          target: unityNode.successNode,
          type: 'smoothstep',
          label: 'Succès',
          style: { stroke: '#27AE60' },
        })
      }
      
      if (unityNode.failureNode) {
        reactflowEdges.push({
          id: `${nodeId}-failure-${unityNode.failureNode}`,
          source: nodeId,
          target: unityNode.failureNode,
          type: 'smoothstep',
          label: 'Échec',
          style: { stroke: '#E74C3C' },
        })
      }
      
      if (unityNode.choices) {
        unityNode.choices.forEach((choice, index) => {
          // Si le choix a un attribut test, créer un TestNode automatiquement
          if (choice.test) {
            const testNodeKey = `${nodeId}-choice-${index}`
            let testNodeId = testNodeMap.get(testNodeKey)
            
            // Créer le TestNode s'il n'existe pas déjà
            if (!testNodeId) {
              testNodeId = `test-node-${nodeId}-choice-${index}`
              testNodeMap.set(testNodeKey, testNodeId)
              
              // Créer le TestNode avec les données du test
              reactflowNodes.push({
                id: testNodeId,
                type: 'testNode',
                position: { x: xOffset + 300, y: yOffset - 150 + (index * 200) },
                data: {
                  test: choice.test,
                  line: choice.text,
                  // Stocker les IDs des nœuds cibles pour créer les edges
                  testCriticalFailureNode: choice.testCriticalFailureNode,
                  testFailureNode: choice.testFailureNode,
                  testSuccessNode: choice.testSuccessNode,
                  testCriticalSuccessNode: choice.testCriticalSuccessNode,
                },
              })
              
              // Edge DialogueNode → TestNode (buildChoiceEdge DRY)
              reactflowEdges.push(
                buildChoiceEdge({
                  sourceId: nodeId,
                  targetId: testNodeId,
                  choiceIndex: index,
                  choiceText: choice.text,
                  edgeId: choiceToTestEdgeId(nodeId, index),
                })
              )
              
              // 4 edges TestNode → nœuds de résultat (config centralisée)
              TEST_RESULT_EDGE_CONFIG.forEach((result) => {
                const targetNodeId = choice[result.field]
                if (targetNodeId && unityNodes.some((n) => n.id === targetNodeId)) {
                  reactflowEdges.push(
                    buildTestResultEdge(
                      testNodeId,
                      targetNodeId,
                      result.handleId,
                      result.label,
                      result.color
                    )
                  )
                }
              })
            }
          } else if (choice.targetNode) {
            // Choix normal sans test (buildChoiceEdge + label tronqué)
            reactflowEdges.push(
              buildChoiceEdge({
                sourceId: nodeId,
                targetId: choice.targetNode,
                choiceIndex: index,
                choiceText: choice.text,
                edgeId: choiceEdgeId(nodeId, index, choice.targetNode),
              })
            )
          }
        })
      }
    }
    
    return { nodes: reactflowNodes, edges: reactflowEdges }
  } catch (error) {
    console.error('Erreur lors de la conversion Unity → ReactFlow:', error)
    return { nodes: [], edges: [] }
  }
}


export const GraphView = memo(function GraphView({
  json_content,
}: GraphViewProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => unityJsonToGraph(json_content),
    [json_content]
  )
  
  const [nodes, setNodes, onNodesChangeLocal] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  
  // Synchroniser quand json_content change
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = unityJsonToGraph(json_content)
    setNodes(newNodes)
    setEdges(newEdges)
  }, [json_content, setNodes, setEdges])
  
  const nodeTypes: NodeTypes = useMemo(
    () => ({
      dialogueNode: DialogueNode,
      testNode: TestNode,
      endNode: EndNode,
    }),
    []
  )
  
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds))
    },
    [setEdges]
  )
  
  const onNodeClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature requise par ReactFlow, usage prévu plus tard
    (_event: React.MouseEvent, _node: Node) => {
      // TODO: Ouvrir le panneau d'édition
    },
    []
  )
  
  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: theme.background.panel }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChangeLocal}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'testNode') return '#F5A623'
            if (node.type === 'endNode') return '#B8B8B8'
            return '#4A90E2'
          }}
          style={{ backgroundColor: theme.background.secondary }}
        />
      </ReactFlow>
    </div>
  )
})
