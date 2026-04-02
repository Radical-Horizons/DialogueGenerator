/**
 * Parcourt le graphe orienté à partir d'un nœud racine en suivant uniquement
 * les arêtes sortantes (source → target).
 */
import type { Edge } from 'reactflow'

/**
 * Retourne les identifiants de tous les descendants atteignables depuis `rootId`
 * (BFS), sans inclure `rootId`. Les cycles sont ignorés via un ensemble visité.
 *
 * @param rootId - Identifiant du nœud d’origine.
 * @param edges - Arêtes du graphe (champs `source` / `target`).
 * @returns Liste ordonnée BFS des ids descendants.
 */
export function collectOutgoingDescendantIds(
  rootId: string,
  edges: readonly Pick<Edge, 'source' | 'target'>[]
): string[] {
  const descendants: string[] = []
  const visited = new Set<string>([rootId])
  const queue: string[] = [rootId]

  while (queue.length > 0) {
    const id = queue.shift()
    if (id === undefined) break
    for (const edge of edges) {
      if (edge.source !== id) continue
      const target = edge.target
      if (visited.has(target)) continue
      visited.add(target)
      descendants.push(target)
      queue.push(target)
    }
  }

  return descendants
}
