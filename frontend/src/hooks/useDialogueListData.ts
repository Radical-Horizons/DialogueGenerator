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

export interface UseDialogueListDataReturn {
  /** Dialogues bruts retournés par l'API (avant filtre / tri). */
  dialogues: UnityDialogueMetadata[]
  /** Liste filtrée par `searchQuery` puis triée par `sortType`. */
  filteredDialogues: UnityDialogueMetadata[]
  /** Nombre total de dialogues retournés par l'API. */
  total: number
  /** Nombre de dialogues après application du filtre de recherche. */
  filteredCount: number
  searchQuery: string
  setSearchQuery: (query: string) => void
  sortType: DialogueListSortType
  setSortType: (sort: DialogueListSortType) => void
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
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (dialogue) =>
          dialogue.filename.toLowerCase().includes(query) ||
          (dialogue.title && dialogue.title.toLowerCase().includes(query))
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

  return {
    dialogues,
    filteredDialogues,
    total,
    filteredCount: filteredDialogues.length,
    searchQuery,
    setSearchQuery,
    sortType,
    setSortType,
    isLoading,
    error,
    refresh,
  }
}
