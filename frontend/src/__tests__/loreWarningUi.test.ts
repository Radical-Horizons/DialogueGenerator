import { describe, it, expect, beforeEach } from 'vitest'
import type { ValidationErrorDetail } from '../types/graph'
import {
  applyLoreWarningFilters,
  countVisibleDismissibleLoreWarnings,
  getLoreWarningStorageKey,
  loadLoreDispositions,
  resolveLoreWarningKey,
  saveLoreDispositions,
} from '../utils/loreWarningUi'

describe('loreWarningUi (FR39)', () => {
  const w: ValidationErrorDetail = {
    type: 'lore_potential_ambiguity',
    node_id: 'N1',
    message: 'Ambigu test',
    severity: 'warning',
    lore_warning_key: 'stable-key-1',
  }

  beforeEach(() => {
    localStorage.clear()
  })

  it('resolveLoreWarningKey préfère lore_warning_key API', () => {
    expect(resolveLoreWarningKey(w)).toBe('stable-key-1')
  })

  it('persiste et recharge les dispositions par scope', () => {
    saveLoreDispositions('doc-a', { 'stable-key-1': 'ignored' })
    expect(loadLoreDispositions('doc-a')).toEqual({ 'stable-key-1': 'ignored' })
    expect(getLoreWarningStorageKey('doc-a')).toContain('doc-a')
  })

  it('exclut les ignorés du jeu actif par défaut', () => {
    const list: ValidationErrorDetail[] = [
      w,
      { type: 'cycle_detected', message: 'c', severity: 'warning', cycle_id: 'x' },
    ]
    const dispositions = { 'stable-key-1': 'ignored' as const }
    const filtered = applyLoreWarningFilters(list, {
      dispositions,
      showIgnored: false,
      typeFilter: 'all',
    })
    expect(filtered.some((e) => e.type === 'lore_potential_ambiguity')).toBe(false)
    expect(filtered.some((e) => e.type === 'cycle_detected')).toBe(true)
  })

  it('réintègre un ignoré quand showIgnored est true', () => {
    const list: ValidationErrorDetail[] = [w]
    const dispositions = { 'stable-key-1': 'ignored' as const }
    const filtered = applyLoreWarningFilters(list, {
      dispositions,
      showIgnored: true,
      typeFilter: 'all',
    })
    expect(filtered).toHaveLength(1)
  })

  it('filtre par type', () => {
    const list: ValidationErrorDetail[] = [
      w,
      {
        type: 'lore_contradiction_potential',
        node_id: 'N2',
        message: 'p',
        severity: 'warning',
        lore_warning_key: 'k2',
      },
    ]
    const out = applyLoreWarningFilters(list, {
      dispositions: {},
      showIgnored: false,
      typeFilter: 'lore_contradiction_potential',
    })
    expect(out.map((e) => e.type)).toEqual(['lore_contradiction_potential'])
  })

  it('countVisibleDismissibleLoreWarnings reflète le filtre', () => {
    const list: ValidationErrorDetail[] = [w]
    expect(
      countVisibleDismissibleLoreWarnings(list, {
        dispositions: { 'stable-key-1': 'ignored' },
        showIgnored: false,
        typeFilter: 'all',
      })
    ).toBe(0)
    expect(
      countVisibleDismissibleLoreWarnings(list, {
        dispositions: { 'stable-key-1': 'ignored' },
        showIgnored: true,
        typeFilter: 'all',
      })
    ).toBe(1)
  })
})
