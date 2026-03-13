/**
 * Utilitaire pour calculer le layout Dagre d'un graphe ReactFlow.
 * Utilise dagre pour organiser automatiquement les nœuds selon une direction donnée.
 */
import dagre from 'dagre'
import type { Node, Edge } from 'reactflow'

export type DagreDirection = 'TB' | 'LR' | 'BT' | 'RL'

export interface DagreLayoutOptions {
  direction: DagreDirection
  nodeWidth?: number
  nodeHeight?: number
  nodeSpacing?: { x: number; y: number }
}

const DEFAULT_NODE_WIDTH = 200
const DEFAULT_NODE_HEIGHT = 100
const DEFAULT_NODE_SPACING = { x: 50, y: 50 }

/**
 * Convertit une direction Dagre en format dagre.
 */
function getDagreDirection(direction: DagreDirection): 'TB' | 'LR' | 'BT' | 'RL' {
  return direction
}

/**
 * Calcule le layout Dagre pour un graphe ReactFlow.
 * Dagre est conçu pour les DAG ; en présence de cycles, la lib dagre applique un ordre
 * interne et produit un layout défini — le graphe reste lisible (AC3).
 *
 * @param nodes - Nœuds ReactFlow
 * @param edges - Edges ReactFlow
 * @param options - Options de layout
 * @returns Nœuds avec positions calculées
 */
export function calculateDagreLayout(
  nodes: Node[],
  edges: Edge[],
  options: DagreLayoutOptions
): Node[] {
  const {
    direction,
    nodeWidth = DEFAULT_NODE_WIDTH,
    nodeHeight = DEFAULT_NODE_HEIGHT,
    nodeSpacing = DEFAULT_NODE_SPACING,
  } = options

  // Créer un nouveau graphe Dagre
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  dagreGraph.setGraph({
    rankdir: getDagreDirection(direction),
    nodesep: nodeSpacing.x,
    ranksep: nodeSpacing.y,
    align: 'UL', // Alignement haut-gauche
  })

  // Ajouter les nœuds au graphe Dagre
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: nodeWidth,
      height: nodeHeight,
    })
  })

  // Ajouter les edges au graphe Dagre
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  // Calculer le layout
  dagre.layout(dagreGraph)

  // Convertir les positions Dagre en positions ReactFlow
  const layoutedNodes = nodes.map((node) => {
    const dagreNode = dagreGraph.node(node.id)
    
    // Dagre retourne les positions avec le centre du nœud comme référence
    // ReactFlow utilise le coin supérieur gauche
    const position = {
      x: dagreNode.x - nodeWidth / 2,
      y: dagreNode.y - nodeHeight / 2,
    }

    return {
      ...node,
      position,
    }
  })

  return layoutedNodes
}

/**
 * Calcule les bounds de tous les nœuds pour centrer le graphe.
 * 
 * @param nodes - Nœuds avec positions
 * @returns Bounds du graphe (minX, minY, maxX, maxY, width, height)
 */
export function calculateGraphBounds(nodes: Node[]): {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
  centerX: number
  centerY: number
} {
  if (nodes.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
      centerX: 0,
      centerY: 0,
    }
  }

  const positions = nodes.map((node) => node.position)
  const minX = Math.min(...positions.map((p) => p.x))
  const minY = Math.min(...positions.map((p) => p.y))
  const maxX = Math.max(...positions.map((p) => p.x))
  const maxY = Math.max(...positions.map((p) => p.y))

  // Estimer la taille des nœuds (approximation)
  const estimatedNodeWidth = 200
  const estimatedNodeHeight = 100

  return {
    minX,
    minY,
    maxX: maxX + estimatedNodeWidth,
    maxY: maxY + estimatedNodeHeight,
    width: maxX - minX + estimatedNodeWidth,
    height: maxY - minY + estimatedNodeHeight,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  }
}
