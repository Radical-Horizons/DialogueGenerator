/**
 * Catalogue GDD lu par la fiche de scène (personnages et lieux, avec `notion_page_id`).
 * Distinct du panneau de contexte : la fiche et les générations ne lisent pas ses sélections.
 */
import { create } from 'zustand'
import * as contextAPI from '../api/context'
import type { GddCatalogEntry } from '../utils/gddEntityNames'

interface SceneCatalogState {
  characters: GddCatalogEntry[]
  places: GddCatalogEntry[]
  /** Révision GDD chargée ; `null` tant qu'aucun chargement n'a réussi. */
  loadedRevision: number | null
  load: (revision: number) => Promise<void>
}

let inFlightRevision: number | null = null

export const useSceneCatalogStore = create<SceneCatalogState>((set, get) => ({
  characters: [],
  places: [],
  loadedRevision: null,
  load: async (revision) => {
    if (get().loadedRevision === revision || inFlightRevision === revision) return
    inFlightRevision = revision
    try {
      const [characters, locations] = await Promise.all([
        contextAPI.listCharacters(),
        contextAPI.listLocations(),
      ])
      set({
        characters: characters.characters,
        places: locations.locations,
        loadedRevision: revision,
      })
    } catch (error) {
      console.warn('[SceneSheet] Catalogue GDD indisponible:', error)
    } finally {
      inFlightRevision = null
    }
  },
}))
