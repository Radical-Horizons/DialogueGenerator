/**
 * Catalogue GDD lu par la fiche de scène : les cinq catégories qu'une mention peut citer,
 * avec leurs données (`notion_page_id`, aperçu). Distinct du panneau de contexte : la
 * fiche et les générations ne lisent pas ses sélections.
 */
import { create } from 'zustand'
import * as contextAPI from '../api/context'
import type { GddCatalogEntry } from '../utils/gddEntityNames'
import type { MentionCategory } from '../utils/sceneSheet'

interface SceneCatalogState {
  characters: GddCatalogEntry[]
  places: GddCatalogEntry[]
  items: GddCatalogEntry[]
  species: GddCatalogEntry[]
  communities: GddCatalogEntry[]
  /** Révision GDD chargée ; `null` tant qu'aucun chargement complet n'a réussi. */
  loadedRevision: number | null
  load: (revision: number) => Promise<void>
}

let inFlightRevision: number | null = null

export const useSceneCatalogStore = create<SceneCatalogState>((set, get) => ({
  characters: [],
  places: [],
  items: [],
  species: [],
  communities: [],
  loadedRevision: null,
  load: async (revision) => {
    if (get().loadedRevision === revision || inFlightRevision === revision) return
    inFlightRevision = revision
    const lists: Array<[keyof SceneCatalogState, () => Promise<GddCatalogEntry[]>]> = [
      ['characters', async () => (await contextAPI.listCharacters()).characters],
      ['places', async () => (await contextAPI.listLocations()).locations],
      ['items', async () => (await contextAPI.listItems()).items],
      ['species', async () => (await contextAPI.listSpecies()).species],
      ['communities', async () => (await contextAPI.listCommunities()).communities],
    ]
    // Une catégorie indisponible n'emporte pas les autres.
    const results = await Promise.allSettled(
      lists.map(async ([key, fetch]) => set({ [key]: await fetch() })),
    )
    inFlightRevision = null
    const failure = results.find((result) => result.status === 'rejected')
    if (failure) {
      console.warn('[SceneSheet] Catalogue GDD incomplet:', failure.reason)
    } else {
      set({ loadedRevision: revision })
    }
  },
}))

/** Catalogue par catégorie de fiche liée (`ContextSelection`). */
export function mentionCatalogs(
  state: Pick<SceneCatalogState, 'characters' | 'places' | 'items' | 'species' | 'communities'>,
): Record<MentionCategory, GddCatalogEntry[]> {
  return {
    characters: state.characters,
    locations: state.places,
    items: state.items,
    species: state.species,
    communities: state.communities,
  }
}

/** Tous les noms citables dans un brief. */
export function mentionNames(state: Parameters<typeof mentionCatalogs>[0]): string[] {
  return Object.values(mentionCatalogs(state)).flatMap((entries) =>
    entries.map((entry) => entry.name),
  )
}
