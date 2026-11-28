/**
 * Fiche de scène du dialogue ouvert, côté composants : enregistrée ou déduite.
 */
import { useMemo } from 'react'
import { useGraphStore } from '../store/graphStore'
import { useSceneCatalogStore } from '../store/sceneCatalogStore'
import {
  buildSceneGeneration,
  deduceSceneSheet,
  type SceneGeneration,
  type SceneSheet,
} from '../utils/sceneSheet'

export function useSceneSheet(): { sheet: SceneSheet; isDeduced: boolean } {
  const stored = useGraphStore((state) => state.scene)
  const nodes = useGraphStore((state) => state.nodes)
  const characters = useSceneCatalogStore((state) => state.characters)
  const sheet = useMemo(
    () => stored ?? deduceSceneSheet(nodes, characters),
    [stored, nodes, characters],
  )
  return { sheet, isDeduced: !stored }
}

/** Ce qu'enverrait une génération partant de ce nœud (estimations, résumés). */
export function useSceneGeneration(parentNodeId: string | null | undefined): SceneGeneration {
  const { sheet } = useSceneSheet()
  const nodes = useGraphStore((state) => state.nodes)
  const characters = useSceneCatalogStore((state) => state.characters)
  return useMemo(
    () => buildSceneGeneration({ sheet, nodes, parentNodeId, characters }),
    [sheet, nodes, parentNodeId, characters],
  )
}
