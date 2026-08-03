/**
 * Hook partagé qui charge la liste des dialogues Unity, expose la requête de
 * recherche, le tri configurable et la liste filtrée résultante.
 *
 * Story 17.7 — extrait de la logique précédemment dupliquée dans
 * `UnityDialogueList`, désormais consommée à la fois par cette liste
 * (mode desktop) et par `DialogueCombobox` (mode narrow).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as unityDialoguesAPI from '../api/unityDialogues'
import type { UnityDialogueMetadata } from '../types/api'
import { getErrorMessage } from '../types/errors'

export type DialogueListSortType =
  | 'name-asc'
  | 'name-desc'
  | 'date-desc'
  | 'date-asc'

/**
 * Taille de page par défaut de la bibliothèque de dialogues (Story 8.1 / FR80).
 */
export const DIALOGUE_LIST_PAGE_SIZE = 50

export interface UseDialogueListDataReturn {
  /** Dialogues bruts retournés par l'API (avant filtre / tri). */
  dialogues: UnityDialogueMetadata[]
  /** Liste filtrée par `searchQuery` puis triée par `sortType`. */
  filteredDialogues: UnityDialogueMetadata[]
  /**
   * Sous-ensemble de `filteredDialogues` correspondant à la page courante
   * (Story 8.1). La pagination est appliquée après recherche et tri.
   */
  paginatedDialogues: UnityDialogueMetadata[]
  /** Nombre total de dialogues retournés par l'API. */
  total: number
  /** Nombre de dialogues après application du filtre de recherche. */
  filteredCount: number
  searchQuery: string
  setSearchQuery: (query: string) => void
  sortType: DialogueListSortType
  setSortType: (sort: DialogueListSortType) => void
  /** Page courante (1-indexé), bornée à `[1, totalPages]`. */
  page: number
  /** Nombre total de pages pour la liste filtrée (>= 1). */
  totalPages: number
  /** Taille de page appliquée. */
  pageSize: number
  /** Change la page demandée (le hook la borne à `[1, totalPages]`). */
  setPage: (page: number) => void
  isLoading: boolean
  error: string | null
  /** Re-fetch la liste depuis l'API ; les filtres / tri restent inchangés. */
  refresh: () => Promise<void>
}

/**
 * Chargement initial + refresh + filtrage/tri local des dialogues Unity.
 *
 * Source de vérité unique pour les composants `UnityDialogueList`
 * et `DialogueCombobox` (Story 17.7).
 */
export function useDialogueListData(): UseDialogueListDataReturn {
  const [dialogues, setDialogues] = useState<UnityDialogueMetadata[]>([])
  const [total, setTotal] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortType, setSortType] = useState<DialogueListSortType>('date-desc')
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await unityDialoguesAPI.listUnityDialogues()
      setDialogues(response.dialogues)
      setTotal(response.total)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const filteredDialogues = useMemo(() => {
    let result = dialogues

    if (searchQuery.trim()) {
      // Recherche FR81 : nom (filename/title), personnage (speakers) et texte
      // des répliques (search_text, déjà en minuscules côté serveur). Un seul
      // terme libre, insensible à la casse. `trim` cohérent avec le garde
      // ci-dessus : sans lui, un espace parasite casserait tous les matches.
      const query = searchQuery.trim().toLowerCase()
      result = result.filter(
        (dialogue) =>
          dialogue.filename.toLowerCase().includes(query) ||
          (dialogue.title?.toLowerCase().includes(query) ?? false) ||
          (dialogue.speakers?.some((speaker) =>
            speaker.toLowerCase().includes(query)
          ) ?? false) ||
          (dialogue.search_text?.includes(query) ?? false)
      )
    }

    return [...result].sort((a, b) => {
      switch (sortType) {
        case 'name-asc':
          return (a.title || a.filename).localeCompare(
            b.title || b.filename,
            'fr',
            { sensitivity: 'base' }
          )
        case 'name-desc':
          return (b.title || b.filename).localeCompare(
            a.title || a.filename,
            'fr',
            { sensitivity: 'base' }
          )
        case 'date-asc':
          return (
            new Date(a.modified_time).getTime() -
            new Date(b.modified_time).getTime()
          )
        case 'date-desc':
        default:
          return (
            new Date(b.modified_time).getTime() -
            new Date(a.modified_time).getTime()
          )
      }
    })
  }, [dialogues, searchQuery, sortType])

  // Revenir à la première page quand le filtre ou le tri change : la page
  // courante n'a plus de sens sur un ensemble filtré différent.
  useEffect(() => {
    setPage(1)
  }, [searchQuery, sortType])

  const totalPages = Math.max(
    1,
    Math.ceil(filteredDialogues.length / DIALOGUE_LIST_PAGE_SIZE)
  )
  // Borne la page demandée : après une suppression, `page` peut dépasser le
  // nouveau nombre de pages.
  const safePage = Math.min(Math.max(page, 1), totalPages)

  const paginatedDialogues = useMemo(
    () =>
      filteredDialogues.slice(
        (safePage - 1) * DIALOGUE_LIST_PAGE_SIZE,
        safePage * DIALOGUE_LIST_PAGE_SIZE
      ),
    [filteredDialogues, safePage]
  )

  const setPageClamped = useCallback((next: number) => {
    // Ignorer les valeurs non finies (NaN via un calcul amont) plutôt que de
    // corrompre l'état de page.
    if (!Number.isFinite(next)) return
    setPage(Math.max(1, Math.floor(next)))
  }, [])

  return {
    dialogues,
    filteredDialogues,
    paginatedDialogues,
    total,
    filteredCount: filteredDialogues.length,
    searchQuery,
    setSearchQuery,
    sortType,
    setSortType,
    page: safePage,
    totalPages,
    pageSize: DIALOGUE_LIST_PAGE_SIZE,
    setPage: setPageClamped,
    isLoading,
    error,
    refresh,
  }
}
