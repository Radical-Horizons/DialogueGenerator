/**
 * Helper partagé pour synchroniser document + layout depuis la projection nodes/edges courante.
 * Extrait le pattern répété 8× dans graphStore.ts pour éviter toute divergence silencieuse.
 */
import type { Node, Edge } from 'reactflow'
import { graphToDocument, buildLayoutFromNodes, type LayoutPositions } from './documentToGraph'

/**
 * Fusionne un layout existant avec les positions courantes des nœuds.
 * Les positions calculées depuis `nodes` priment toujours pour éviter
 * qu'un layout stale écrase la géométrie réellement affichée.
 *
 * Les barres de test absentes de `nodes` sont retirées : leur position est indexée par
 * index de choix, et une position orpheline ferait passer une barre réapparue pour une
 * barre déplacée à la main (superposée à sa voisine au lieu d'être réalignée).
 */
export function mergeLayoutWithNodePositions(
  currentLayout: Record<string, unknown> | LayoutPositions | null | undefined,
  nodes: Node[]
): Record<string, unknown> {
  const newPositions = buildLayoutFromNodes(nodes)
  const layoutNodes = currentLayout?.['nodes'] as
    | Record<string, { x: number; y: number }>
    | undefined
  const presentIds = new Set(nodes.map((node) => node.id))
  const keptPositions = Object.fromEntries(
    Object.entries(layoutNodes ?? {}).filter(
      ([id]) => !isTestBarLayoutKey(id) || presentIds.has(id)
    )
  )
  return {
    ...(currentLayout ?? {}),
    nodes: {
      ...keptPositions,
      ...newPositions.nodes,
    },
  }
}

/** Marque un layout en mémoire dont `nodes` porte les positions gauche → droite. */
const TEXT_CARDS_LAYOUT_MARKER = 'textCardsPrototype'

/**
 * Prototype 20.2 : tout le store lit `layout.nodes`. À l'ouverture, on y met les positions
 * gauche → droite (`nodesLR` côté serveur) et on garde de côté les positions haut → bas,
 * que `toPersistedLayout` remet à leur place avant tout enregistrement.
 */
export function toTextCardsWorkingLayout(
  persisted: Record<string, unknown>
): Record<string, unknown> {
  const { nodes, nodesLR, ...rest } = persisted
  return {
    ...rest,
    nodes: nodesLR ?? {},
    nodesTB: nodes ?? {},
    [TEXT_CARDS_LAYOUT_MARKER]: true,
  }
}

export function isTextCardsWorkingLayout(
  layout: Record<string, unknown> | null | undefined
): boolean {
  return layout?.[TEXT_CARDS_LAYOUT_MARKER] === true
}

/** Inverse de `toTextCardsWorkingLayout` ; un layout ordinaire est rendu tel quel. */
export function toPersistedLayout(layout: Record<string, unknown>): Record<string, unknown> {
  if (!isTextCardsWorkingLayout(layout)) return layout
  const { nodes, nodesTB, ...rest } = layout
  delete rest[TEXT_CARDS_LAYOUT_MARKER]
  return { ...rest, nodes: nodesTB ?? {}, nodesLR: nodes ?? {} }
}

function isTestBarLayoutKey(id: string): boolean {
  return id.startsWith('test-node-') || id.startsWith('test:')
}

/**
 * Recalcule le document canonique et le layout à partir des nodes/edges ReactFlow courants.
 * Fusionne les positions existantes du layout avec les nouvelles positions calculées.
 *
 * @param nodes - Nœuds ReactFlow courants
 * @param edges - Edges ReactFlow courants
 * @param currentLayout - Layout actuel (contient les positions persistées)
 * @param currentDocument - Document actuel : ses champs de tête (titre…) sont conservés, le graphe
 *   ne portant que les nœuds
 * @returns `{ document, layout }` prêts à être écrits dans le store
 */
export function syncDocAndLayout(
  nodes: Node[],
  edges: Edge[],
  currentLayout: Record<string, unknown>,
  currentDocument?: Record<string, unknown> | null
): { document: Record<string, unknown>; layout: Record<string, unknown> } {
  const projected = graphToDocument(nodes, edges) as unknown as Record<string, unknown>
  const doc = currentDocument ? { ...currentDocument, ...projected } : projected
  const newLayout = mergeLayoutWithNodePositions(currentLayout, nodes)
  return { document: doc, layout: newLayout }
}
