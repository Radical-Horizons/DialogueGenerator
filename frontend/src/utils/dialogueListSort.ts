/**
 * Persistance localStorage du tri de la bibliothèque de dialogues (Story 8.4 / FR83).
 */
export const DIALOGUE_LIST_SORT_STORAGE_KEY = 'dialogueGenerator.dialogueListSort'

export const DIALOGUE_LIST_SORT_TYPES = [
  'name-asc',
  'name-desc',
  'date-desc',
  'date-asc',
  'size-desc',
  'size-asc',
] as const

export type PersistedDialogueListSortType = (typeof DIALOGUE_LIST_SORT_TYPES)[number]

export const DEFAULT_DIALOGUE_LIST_SORT: PersistedDialogueListSortType = 'date-desc'

/**
 * Indique si une valeur brute est un tri de liste reconnu.
 */
export function isDialogueListSortType(
  value: unknown
): value is PersistedDialogueListSortType {
  return (
    typeof value === 'string' &&
    (DIALOGUE_LIST_SORT_TYPES as readonly string[]).includes(value)
  )
}

/**
 * Charge la préférence de tri depuis localStorage.
 * Valeur absente ou invalide → `date-desc` (défaut Story 8.1).
 */
export function loadDialogueListSort(): PersistedDialogueListSortType {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_DIALOGUE_LIST_SORT
  }
  try {
    const raw = localStorage.getItem(DIALOGUE_LIST_SORT_STORAGE_KEY)
    if (isDialogueListSortType(raw)) {
      return raw
    }
  } catch {
    // Quota / mode privé : ignorer et retomber sur le défaut.
  }
  return DEFAULT_DIALOGUE_LIST_SORT
}

/**
 * Persiste la préférence de tri dans localStorage.
 */
export function saveDialogueListSort(sort: PersistedDialogueListSortType): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  try {
    localStorage.setItem(DIALOGUE_LIST_SORT_STORAGE_KEY, sort)
  } catch {
    // Écriture impossible : non bloquant pour l'UX.
  }
}
