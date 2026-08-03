/**
 * Tests persistance du tri bibliothèque (Story 8.4 / FR83).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  DEFAULT_DIALOGUE_LIST_SORT,
  DIALOGUE_LIST_SORT_STORAGE_KEY,
  isDialogueListSortType,
  loadDialogueListSort,
  saveDialogueListSort,
} from './dialogueListSort'

describe('dialogueListSort', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('valide uniquement les tris connus', () => {
    expect(isDialogueListSortType('size-desc')).toBe(true)
    expect(isDialogueListSortType('date-desc')).toBe(true)
    expect(isDialogueListSortType('nope')).toBe(false)
    expect(isDialogueListSortType(null)).toBe(false)
  })

  it('charge date-desc par défaut si absent ou invalide', () => {
    expect(loadDialogueListSort()).toBe(DEFAULT_DIALOGUE_LIST_SORT)
    localStorage.setItem(DIALOGUE_LIST_SORT_STORAGE_KEY, 'garbage')
    expect(loadDialogueListSort()).toBe(DEFAULT_DIALOGUE_LIST_SORT)
  })

  it('persiste et recharge un tri valide', () => {
    saveDialogueListSort('size-asc')
    expect(localStorage.getItem(DIALOGUE_LIST_SORT_STORAGE_KEY)).toBe('size-asc')
    expect(loadDialogueListSort()).toBe('size-asc')
  })
})
