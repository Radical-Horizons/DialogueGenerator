/**
 * Map index nœud Unity (ordre export) → id React Flow (Story 5.3).
 * Exclut les testNode comme ``GraphConversionService.graph_to_unity_json``.
 */
import type { Node } from 'reactflow'

/** Construit la correspondance index Unity → id graphe. */
export function buildUnityNodeIndexToIdMap(nodes: Node[]): Map<number, string> {
  const map = new Map<number, string>()
  let unityIndex = 0
  for (const node of nodes) {
    if (node.type === 'testNode') continue
    if (!node.id) continue
    map.set(unityIndex, node.id)
    unityIndex += 1
  }
  return map
}

/** Résout l'id graphe depuis un chemin JSON ``nodes.N…``. */
export function resolveGraphNodeIdFromUnityPath(
  path: string | undefined,
  unityIndexMap: Map<number, string>,
): string | undefined {
  if (!path?.startsWith('nodes')) return undefined
  const match = /^nodes\.(\d+)/.exec(path)
  if (!match) return undefined
  return unityIndexMap.get(parseInt(match[1], 10))
}
