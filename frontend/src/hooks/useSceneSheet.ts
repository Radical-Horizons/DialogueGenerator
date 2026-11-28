/**
 * Fiche de scène du dialogue ouvert, côté composants : enregistrée ou déduite.
 */
import { useEffect, useMemo } from 'react'
import { useGraphStore } from '../store/graphStore'
import { mentionNames, useSceneCatalogStore } from '../store/sceneCatalogStore'
import { useSceneProfileStore } from '../store/sceneProfileStore'
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
export function useSceneGeneration(
  parentNodeId: string | null | undefined,
): SceneGeneration & { authorProfile: string | undefined } {
  const { sheet } = useSceneSheet()
  const nodes = useGraphStore((state) => state.nodes)
  const characters = useSceneCatalogStore((state) => state.characters)
  const items = useSceneCatalogStore((state) => state.items)
  const places = useSceneCatalogStore((state) => state.places)
  const species = useSceneCatalogStore((state) => state.species)
  const communities = useSceneCatalogStore((state) => state.communities)
  const generation = useMemo(
    () =>
      buildSceneGeneration({
        sheet,
        nodes,
        parentNodeId,
        characters,
        mentionNames: mentionNames({ characters, places, items, species, communities }),
      }),
    [sheet, nodes, parentNodeId, characters, places, items, species, communities],
  )

  const profileId = generation.authorProfileId
  const loadVoices = useSceneProfileStore((state) => state.load)
  useEffect(() => {
    if (profileId) void loadVoices()
  }, [profileId, loadVoices])
  const authorProfile = useSceneProfileStore(
    (state) => state.voices.find((voice) => voice.id === profileId)?.content.trim() || undefined,
  )

  return useMemo(() => ({ ...generation, authorProfile }), [generation, authorProfile])
}
