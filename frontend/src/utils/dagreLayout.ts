/**
 * Utilitaire pour calculer le layout Dagre d'un graphe ReactFlow.
 * Utilise dagre pour organiser automatiquement les nœuds selon une direction donnée.
 */
import dagre from 'dagre'
import type { Node, Edge } from 'reactflow'
import {
  GRAPH_DIALOGUE_NODE_WIDTH,
  GRAPH_TEST_NODE_WIDTH,
  siblingBranchOffset,
} from './graphNodeLayout'
import { formatNodeLinePreview } from './nodeLinePreview'
import { splitDialogueLine } from './dialogueLineSegments'

export type DagreDirection = 'TB' | 'LR' | 'BT' | 'RL'
export type DagreSpacingMode = 'compact' | 'normal' | 'large'

export interface DagreLayoutOptions {
  direction: DagreDirection
  spacingMode?: DagreSpacingMode
  nodeWidth?: number
  nodeHeight?: number
  nodeSpacing?: { x: number; y: number }
}

export interface RedistributeSiblingBranchOptions {
  minSiblingCount?: number
  onlyWhenFlatOnMainAxis?: boolean
  flatAxisThresholdPx?: number
}

const DEFAULT_NODE_WIDTH = GRAPH_DIALOGUE_NODE_WIDTH
const DEFAULT_NODE_HEIGHT = 160
const DEFAULT_NODE_SPACING = { x: 120, y: 240 }
const SPACING_BY_MODE: Record<DagreSpacingMode, { x: number; y: number }> = {
  compact: { x: 90, y: 180 },
  normal: DEFAULT_NODE_SPACING,
  large: { x: 170, y: 320 },
}

/** Carte 2e mesurée dans l'app : en-tête, pied et marges, puis 12,5 px × 1,45 par ligne sur 256 px utiles. */
const DIALOGUE_NODE_CHROME_PX = 101
const DIALOGUE_NODE_LINE_PX = 18
const DIALOGUE_NODE_CHARS_PER_LINE = 40

function estimateDialogueNodeHeight(node: Node, fallback: number): number {
  const data = (node.data ?? {}) as { line?: string }
  // La carte n'affiche qu'un aperçu tronqué de la réplique (le titre tient sur une ligne
  // d'en-tête) : estimer sur la réplique entière gonflait chaque rang de plusieurs centaines
  // de px à l'ouverture d'un dialogue importé, avant toute mesure du DOM.
  const preview = typeof data.line === 'string' ? formatNodeLinePreview(data.line.trim()) : ''
  // Chaque passage narration/parole (`DialogueLineText`) et chaque saut de ligne ouvre une ligne.
  const textLines = splitDialogueLine(preview)
    .flatMap((segment) => segment.text.split('\n'))
    .reduce(
      (total, segment) =>
        total + Math.max(1, Math.ceil(segment.length / DIALOGUE_NODE_CHARS_PER_LINE)),
      0
    )
  const pendingActionsHeight = node.data?.status === 'pending' ? 44 : 0

  return Math.max(
    fallback,
    DIALOGUE_NODE_CHROME_PX + textLines * DIALOGUE_NODE_LINE_PX + pendingActionsHeight
  )
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

/** En deçà, la cible d'un renvoi est une sortie partagée : elle reste sous ses sources. */
const RETURN_TARGET_MIN_DESCENDANTS = 3

function breadthFirstDepths(nodes: Node[], edges: Edge[]): Map<string, number> {
  const successors = new Map<string, string[]>()
  const incoming = new Set<string>()
  for (const edge of edges) {
    const list = successors.get(edge.source) ?? []
    list.push(edge.target)
    successors.set(edge.source, list)
    incoming.add(edge.target)
  }
  const depths = new Map<string, number>()
  const visit = (rootId: string) => {
    if (depths.has(rootId)) return
    depths.set(rootId, 0)
    const queue = [rootId]
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head]
      const depth = depths.get(current) ?? 0
      for (const next of successors.get(current) ?? []) {
        if (depths.has(next)) continue
        depths.set(next, depth + 1)
        queue.push(next)
      }
    }
  }
  nodes.filter((node) => !incoming.has(node.id)).forEach((node) => visit(node.id))
  // Composantes sans racine (tout en boucle) : on part du premier nœud écrit.
  nodes.forEach((node) => visit(node.id))
  return depths
}

function countDescendants(nodeId: string, successors: Map<string, string[]>): number {
  const seen = new Set<string>([nodeId])
  const stack = [nodeId]
  while (stack.length > 0) {
    const current = stack.pop() as string
    for (const next of successors.get(current) ?? []) {
      if (seen.has(next)) continue
      seen.add(next)
      stack.push(next)
    }
  }
  return seen.size - 1
}

/**
 * Renvois vers un nœud déjà atteint plus haut (« retour au dialogue principal », boucle) :
 * classés comme liens descendants, ils tireraient leur cible — et toute la suite qui en
 * part — sous la branche qui y revient. Ils sont tracés mais ne comptent pas dans les rangs.
 */
export function findReturnEdges(nodes: Node[], edges: Edge[]): Set<string> {
  const depths = breadthFirstDepths(nodes, edges)
  const successors = new Map<string, string[]>()
  for (const edge of edges) {
    const list = successors.get(edge.source) ?? []
    list.push(edge.target)
    successors.set(edge.source, list)
  }
  const descendantCounts = new Map<string, number>()
  const returnEdgeIds = new Set<string>()
  for (const edge of edges) {
    const sourceDepth = depths.get(edge.source)
    const targetDepth = depths.get(edge.target)
    if (sourceDepth == null || targetDepth == null || targetDepth >= sourceDepth) continue
    if (!descendantCounts.has(edge.target)) {
      descendantCounts.set(edge.target, countDescendants(edge.target, successors))
    }
    if ((descendantCounts.get(edge.target) ?? 0) >= RETURN_TARGET_MIN_DESCENDANTS) {
      returnEdgeIds.add(edge.id)
    }
  }
  return returnEdgeIds
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
    // Sans `align`, dagre équilibre ses quatre alignements et centre chaque parent sur ses
    // enfants ; avec 'UL', le parent reste collé au premier enfant et la rangée part à droite.
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

  // Une cible absente du canvas (`END`) deviendrait un nœud fantôme au dernier rang,
  // qui entraînerait ses sources tout en bas du graphe.
  const nodeIds = new Set(nodes.map((node) => node.id))
  const layoutEdges = edges.filter(
    (edge) => edge.source !== edge.target && nodeIds.has(edge.source) && nodeIds.has(edge.target)
  )
  const returnEdgeIds = findReturnEdges(nodes, layoutEdges)
  layoutEdges.forEach((edge) => {
    if (returnEdgeIds.has(edge.id)) return
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

  return redistributeSiblingBranches(layoutedNodes, edges, direction, spacingMode)
}

function getMainAxisPosition(node: Node, direction: DagreDirection): number {
  return direction === 'TB' || direction === 'BT' ? node.position.y : node.position.x
}

export function redistributeSiblingBranches(
  nodes: Node[],
  edges: Edge[],
  direction: DagreDirection,
  spacingMode: DagreSpacingMode,
  options: RedistributeSiblingBranchOptions = {}
): Node[] {
  const {
    minSiblingCount = 3,
    onlyWhenFlatOnMainAxis = false,
    flatAxisThresholdPx = 8,
  } = options
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const incomingCounts = new Map<string, number>()
  for (const edge of edges) {
    incomingCounts.set(edge.target, (incomingCounts.get(edge.target) ?? 0) + 1)
  }

  const childrenByParent = new Map<string, Edge[]>()
  for (const edge of edges) {
    if (!nodeById.has(edge.target)) continue
    // Uniquement les enfants avec un parent principal clair pour éviter
    // des déplacements incohérents sur les nœuds multi-entrées.
    if ((incomingCounts.get(edge.target) ?? 0) !== 1) continue
    const list = childrenByParent.get(edge.source) ?? []
    if (!list.some((existingEdge) => existingEdge.target === edge.target)) {
      list.push(edge)
    }
    childrenByParent.set(edge.source, list)
  }

  const nextNodes = nodes.map((n) => ({ ...n, position: { ...n.position } }))
  const nextById = new Map(nextNodes.map((n) => [n.id, n]))

  for (const [, childEdges] of childrenByParent.entries()) {
    if (childEdges.length < minSiblingCount) continue
    const sorted = [...childEdges].sort((left, right) => {
      const leftIndex = left.data?.choiceIndex
      const rightIndex = right.data?.choiceIndex
      if (typeof leftIndex === 'number' && typeof rightIndex === 'number' && leftIndex !== rightIndex) {
        return leftIndex - rightIndex
      }
      const leftNode = nodeById.get(left.target)
      const rightNode = nodeById.get(right.target)
      if (!leftNode || !rightNode) {
        return left.target.localeCompare(right.target)
      }
      return direction === 'TB' || direction === 'BT'
        ? leftNode.position.x - rightNode.position.x
        : leftNode.position.y - rightNode.position.y
    })
    if (onlyWhenFlatOnMainAxis) {
      const mainAxisValues = sorted
        .map((edge) => nextById.get(edge.target))
        .filter((node): node is Node => node != null)
        .map((node) => getMainAxisPosition(node, direction))
      if (mainAxisValues.length < minSiblingCount) continue
      const spread = Math.max(...mainAxisValues) - Math.min(...mainAxisValues)
      if (spread > flatAxisThresholdPx) continue
    }
    for (let i = 0; i < sorted.length; i++) {
      const offset = siblingBranchOffset({
        siblingIndex: i,
        siblingCount: sorted.length,
        spacingMode,
        direction,
      })
      const node = nextById.get(sorted[i].target)
      if (!node) continue
      node.position = {
        x: node.position.x + offset.dx,
        y: node.position.y + offset.dy,
      }
    }
  }

  return nextNodes
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
