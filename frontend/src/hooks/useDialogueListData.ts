/**
 * Hook partagé qui charge la liste des dialogues Unity, expose la requête de
 * recherche, les filtres métadonnées (FR82), le tri configurable et la liste
 * filtrée résultante.
 *
 * Story 17.7 — extrait de la logique précédemment dupliquée dans
 * `UnityDialogueList`, désormais consommée à la fois par cette liste
 * (mode desktop) et par `DialogueCombobox` (mode narrow).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as unityDialoguesAPI from '../api/unityDialogues'
import type { UnityDialogueMetadata } from '../types/api'
import { getErrorMessage } from '../types/errors'
import {
  matchesDialogueDatePeriod,
  type DialogueDatePeriod,
} from '../utils/dialogueListFilters'

export type DialogueListSortType =
  | 'name-asc'
  | 'name-desc'
  | 'date-desc'
  | 'date-asc'

export type { DialogueDatePeriod }

export interface DialogueListAuthorOption {
  id: string
  username: string
}

/**
 * Taille de page par défaut de la bibliothèque de dialogues (Story 8.1 / FR80).
 */
export const DIALOGUE_LIST_PAGE_SIZE = 50

export interface UseDialogueListDataReturn {
  /** Dialogues bruts retournés par l'API (avant filtre / tri). */
  dialogues: UnityDialogueMetadata[]
  /** Liste filtrée (search + période + auteur) puis triée. */
  filteredDialogues: UnityDialogueMetadata[]
  /**
   * Sous-ensemble de `filteredDialogues` correspondant à la page courante
   * (Story 8.1). La pagination est appliquée après recherche et tri.
   */
  paginatedDialogues: UnityDialogueMetadata[]
  /** Nombre total de dialogues retournés par l'API. */
  total: number
  /** Nombre de dialogues après application des filtres. */
  filteredCount: number
  searchQuery: string
  setSearchQuery: (query: string) => void
  /** Preset de période de création (FR82). */
  datePeriod: DialogueDatePeriod
  setDatePeriod: (period: DialogueDatePeriod) => void
  /** Owner_id sélectionné, ou `null` = tous (FR82). */
  authorId: string | null
  setAuthorId: (id: string | null) => void
  /** Auteurs distincts dérivés des dialogues déjà visibles (post-RBAC). */
  availableAuthors: DialogueListAuthorOption[]
  /** True si période ≠ all ou auteur sélectionné. */
  hasActiveFilters: boolean
  /** Remet période=all et auteur=tous (ne touche pas à la recherche). */
  resetFilters: () => void
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
  const [datePeriod, setDatePeriod] = useState<DialogueDatePeriod>('all')
  const [authorId, setAuthorId] = useState<string | null>(null)
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

  const availableAuthors = useMemo(() => {
    const byId = new Map<string, string>()
    for (const dialogue of dialogues) {
      if (!dialogue.owner_id) continue
      // Inclure même sans username (compte disparu) : fallback sur l'id.
      byId.set(
        dialogue.owner_id,
        dialogue.owner_username || dialogue.owner_id
      )
    }
    return [...byId.entries()]
      .map(([id, username]) => ({ id, username }))
      .sort((a, b) =>
        a.username.localeCompare(b.username, 'fr', { sensitivity: 'base' })
      )
  }, [dialogues])

  // Si l'auteur sélectionné disparaît du corpus (refresh, partage retiré),
  // lever le filtre pour éviter une liste vide « fantôme ».
  useEffect(() => {
    if (
      authorId &&
      !availableAuthors.some((author) => author.id === authorId)
    ) {
      setAuthorId(null)
    }
  }, [authorId, availableAuthors])

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

    // Filtres métadonnées FR82 (ET avec la recherche).
    if (datePeriod !== 'all') {
      result = result.filter((dialogue) =>
        matchesDialogueDatePeriod(
          dialogue.created_at ?? dialogue.modified_time,
          datePeriod
        )
      )
    }
    if (authorId) {
      result = result.filter((dialogue) => dialogue.owner_id === authorId)
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
  }, [dialogues, searchQuery, datePeriod, authorId, sortType])

  // Revenir à la première page quand le filtre ou le tri change : la page
  // courante n'a plus de sens sur un ensemble filtré différent.
  useEffect(() => {
    setPage(1)
  }, [searchQuery, datePeriod, authorId, sortType])

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

  const hasActiveFilters = datePeriod !== 'all' || authorId !== null

  const resetFilters = useCallback(() => {
    setDatePeriod('all')
    setAuthorId(null)
  }, [])

  return {
    dialogues,
    filteredDialogues,
    paginatedDialogues,
    total,
    filteredCount: filteredDialogues.length,
    searchQuery,
    setSearchQuery,
    datePeriod,
    setDatePeriod,
    authorId,
    setAuthorId,
    availableAuthors,
    hasActiveFilters,
    resetFilters,
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
