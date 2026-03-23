/**
 * Utilitaire pour calculer le layout Dagre d'un graphe ReactFlow.
 * Utilise dagre pour organiser automatiquement les nœuds selon une direction donnée.
 */
import dagre from 'dagre'
import type { Node, Edge } from 'reactflow'
import {
  GRAPH_DIALOGUE_NODE_WIDTH,
  GRAPH_TEST_NODE_WIDTH,
} from './graphNodeLayout'

export type DagreDirection = 'TB' | 'LR' | 'BT' | 'RL'
export type DagreSpacingMode = 'compact' | 'normal' | 'large'

export interface DagreLayoutOptions {
  direction: DagreDirection
  spacingMode?: DagreSpacingMode
  nodeWidth?: number
  nodeHeight?: number
  nodeSpacing?: { x: number; y: number }
}

const DEFAULT_NODE_WIDTH = GRAPH_DIALOGUE_NODE_WIDTH
const DEFAULT_NODE_HEIGHT = 160
const DEFAULT_NODE_SPACING = { x: 120, y: 240 }
const SPACING_BY_MODE: Record<DagreSpacingMode, { x: number; y: number }> = {
  compact: { x: 90, y: 180 },
  normal: DEFAULT_NODE_SPACING,
  large: { x: 170, y: 320 },
}

function estimateDialogueNodeHeight(node: Node, fallback: number): number {
  const data = (node.data ?? {}) as {
    line?: string
    title?: string
    choices?: Array<unknown>
  }
  const lineLength = typeof data.line === 'string' ? data.line.trim().length : 0
  const titleLength = typeof data.title === 'string' ? data.title.trim().length : 0
  const choicesCount = Array.isArray(data.choices) ? data.choices.length : 0

  const estimatedTitleLines = titleLength > 0 ? Math.max(1, Math.ceil(titleLength / 26)) : 0
  const estimatedTextLines = Math.max(1, Math.ceil(lineLength / 30))
  const contentHeight = estimatedTextLines * 20
  const titleHeight = estimatedTitleLines * 18
  const choicesHeight = choicesCount > 0 ? 16 : 0
  const footerReservedHeight = choicesCount > 0 ? 52 : 28
  const pendingActionsHeight = node.data?.status === 'pending' ? 44 : 0

  return Math.max(fallback, 78 + titleHeight + contentHeight + choicesHeight + footerReservedHeight + pendingActionsHeight)
}

function getDefaultNodeWidth(node: Node, fallback: number): number {
  const measured = (node as Node & { measured?: { width?: number } }).measured?.width
  if (typeof measured === 'number' && measured > 0) return measured
  if (typeof node.width === 'number' && node.width > 0) return node.width
  if (node.type === 'testNode') return GRAPH_TEST_NODE_WIDTH
  if (node.type === 'endNode') return 200
  return fallback
}

function getDefaultNodeHeight(node: Node, fallback: number): number {
  const measured = (node as Node & { measured?: { height?: number } }).measured?.height
  if (typeof measured === 'number' && measured > 0) return measured
  if (typeof node.height === 'number' && node.height > 0) return node.height
  if (node.type === 'testNode') return 44
  if (node.type === 'endNode') return 80
  if (node.type === 'dialogueNode') return estimateDialogueNodeHeight(node, fallback)
  return fallback
}

export function getLayoutNodeHeight(node: Node, fallback = DEFAULT_NODE_HEIGHT): number {
  return getDefaultNodeHeight(node, fallback)
}

/**
 * Convertit une direction Dagre en format dagre.
 */
function getDagreDirection(direction: DagreDirection): 'TB' | 'LR' | 'BT' | 'RL' {
  return direction
}

export function resolveDagreNodeSpacing(mode: DagreSpacingMode): { x: number; y: number } {
  return SPACING_BY_MODE[mode]
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
    spacingMode = 'normal',
    nodeSpacing = resolveDagreNodeSpacing(spacingMode),
  } = options

  // Créer un nouveau graphe Dagre
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  dagreGraph.setGraph({
    rankdir: getDagreDirection(direction),
    nodesep: nodeSpacing.x,
    ranksep: nodeSpacing.y,
    edgesep: Math.max(40, Math.round(nodeSpacing.x / 2)),
    align: 'UL', // Alignement haut-gauche
    ranker: 'network-simplex',
  })

  // Ajouter les nœuds au graphe Dagre
  nodes.forEach((node) => {
    const width = getDefaultNodeWidth(node, nodeWidth)
    const height = getDefaultNodeHeight(node, nodeHeight)
    dagreGraph.setNode(node.id, {
      width,
      height,
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
    const width = getDefaultNodeWidth(node, nodeWidth)
    const height = getDefaultNodeHeight(node, nodeHeight)
    
    // Dagre retourne les positions avec le centre du nœud comme référence
    // ReactFlow utilise le coin supérieur gauche
    const position = {
      x: dagreNode.x - width / 2,
      y: dagreNode.y - height / 2,
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
