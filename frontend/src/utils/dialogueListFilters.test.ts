/**
 * Tests des helpers de période pour le filtre date bibliothèque (FR82).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  dialogueCreatedAfter,
  matchesDialogueDatePeriod,
} from './dialogueListFilters'

describe('dialogueListFilters', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('all → aucun seuil ; today/week/month/year → seuils attendus', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0)) // 15 juin 2026

    expect(dialogueCreatedAfter('all')).toBeNull()

    const today = dialogueCreatedAfter('today')!
    expect(today.getFullYear()).toBe(2026)
    expect(today.getMonth()).toBe(5)
    expect(today.getDate()).toBe(15)
    expect(today.getHours()).toBe(0)

    const week = dialogueCreatedAfter('week')!
    expect(week.getDate()).toBe(8)

    const month = dialogueCreatedAfter('month')!
    expect(month.getMonth()).toBe(4) // ~16 mai
    expect(month.getDate()).toBe(16)

    const year = dialogueCreatedAfter('year')!
    expect(year.getFullYear()).toBe(2026)
    expect(year.getMonth()).toBe(0)
    expect(year.getDate()).toBe(1)
  })

  it('matchesDialogueDatePeriod exclut les dates hors période', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0))

    expect(matchesDialogueDatePeriod('2026-06-14T10:00:00', 'week')).toBe(true)
    expect(matchesDialogueDatePeriod('2026-05-01T10:00:00', 'week')).toBe(false)
    expect(matchesDialogueDatePeriod('2025-12-31T10:00:00', 'year')).toBe(false)
    expect(matchesDialogueDatePeriod('2026-01-02T10:00:00', 'year')).toBe(true)
    expect(matchesDialogueDatePeriod(undefined, 'week')).toBe(false)
    expect(matchesDialogueDatePeriod('2020-01-01', 'all')).toBe(true)
  })
})
