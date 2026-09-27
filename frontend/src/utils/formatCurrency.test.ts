/**
 * Charte des nombres : les caractères d'espacement sont ceux qu'Intl produit en fr-FR —
 * U+00A0 avant le symbole et le %, U+202F pour les milliers et avant une unité.
 */
import { describe, expect, it } from 'vitest'
import {
  EMPTY_NUMBER,
  formatCost,
  formatCostDetail,
  formatCurrency,
  formatDurationMs,
  formatNumber,
  formatPercent,
} from './formatCurrency'

const NBSP = '\u00a0'
const NNBSP = '\u202f'

describe('formatCurrency', () => {
  it('écrit le dollar après le montant, sans « US »', () => {
    expect(formatCurrency(0.18, 'USD')).toBe(`0,18${NBSP}$`)
    expect(formatCurrency(10, 'USD')).toBe(`10,00${NBSP}$`)
  })

  it('écrit l’euro après le montant', () => {
    expect(formatCurrency(8.2, 'EUR')).toBe(`8,20${NBSP}€`)
    expect(formatCurrency(0.0042, 'EUR', { maximumFractionDigits: 4 })).toBe(`0,0042${NBSP}€`)
  })

  it('garde six décimales quand l’écran les demande', () => {
    expect(
      formatCurrency(0.000123, 'USD', { minimumFractionDigits: 6, maximumFractionDigits: 6 })
    ).toBe(`0,000123${NBSP}$`)
  })

  it('sépare les milliers par une espace fine insécable', () => {
    expect(formatCurrency(1234.5, 'USD')).toBe(`1${NNBSP}234,50${NBSP}$`)
  })

  it('préfixe « ≈ » une estimation', () => {
    expect(formatCurrency(0.18, 'USD', { approx: true })).toBe(`≈ 0,18${NBSP}$`)
    expect(formatCurrency(0.5, 'EUR', { maximumFractionDigits: 4, approx: true })).toBe(
      `≈ 0,50${NBSP}€`
    )
  })

  it('accepte un maximum seul inférieur au minimum de la devise', () => {
    expect(formatCurrency(5, 'EUR', { maximumFractionDigits: 0 })).toBe(`5${NBSP}€`)
  })

  it('rend un tiret pour une valeur absente ou non numérique', () => {
    expect(formatCurrency(Number.NaN, 'USD')).toBe(EMPTY_NUMBER)
    expect(formatCurrency(undefined, 'EUR')).toBe(EMPTY_NUMBER)
    expect(formatCurrency(null, 'EUR')).toBe(EMPTY_NUMBER)
    expect(formatCurrency(Number.POSITIVE_INFINITY, 'USD')).toBe(EMPTY_NUMBER)
  })

  it('n’écrit jamais « -0,00 »', () => {
    expect(formatCurrency(-0, 'EUR')).toBe(`0,00${NBSP}€`)
  })
})

describe('formatCost', () => {
  it('deux décimales à partir du centime', () => {
    expect(formatCost(8.2, 'EUR')).toBe(`8,20${NBSP}€`)
    expect(formatCost(0.01, 'USD')).toBe(`0,01${NBSP}$`)
    expect(formatCost(0, 'EUR')).toBe(`0,00${NBSP}€`)
  })

  it('sous le centime, deux chiffres significatifs au lieu de « 0,00 »', () => {
    expect(formatCost(0.0042, 'EUR')).toBe(`0,0042${NBSP}€`)
    expect(formatCost(0.000774, 'EUR')).toBe(`0,00077${NBSP}€`)
    expect(formatCost(0.000123, 'USD')).toBe(`0,00012${NBSP}$`)
  })

  it('porte le préfixe d’estimation', () => {
    expect(formatCost(0.0042, 'EUR', { approx: true })).toBe(`≈ 0,0042${NBSP}€`)
  })

  it('rend un tiret pour une valeur absente', () => {
    expect(formatCost(undefined, 'EUR')).toBe(EMPTY_NUMBER)
  })
})

describe('formatCostDetail', () => {
  it('quatre décimales fixes pour aligner une colonne de logs', () => {
    expect(formatCostDetail(0.0092, 'EUR')).toBe(`0,0092${NBSP}€`)
    expect(formatCostDetail(0.3, 'EUR')).toBe(`0,3000${NBSP}€`)
    expect(formatCostDetail(0, 'EUR')).toBe(`0,0000${NBSP}€`)
  })

  it('six décimales sous 0,0001', () => {
    expect(formatCostDetail(0.000042, 'EUR')).toBe(`0,000042${NBSP}€`)
  })
})

describe('formatNumber', () => {
  it('groupe les milliers et met une virgule décimale', () => {
    expect(formatNumber(1234567)).toBe(`1${NNBSP}234${NNBSP}567`)
    expect(formatNumber(21.24, 1)).toBe('21,2')
    expect(formatNumber(Number.NaN)).toBe(EMPTY_NUMBER)
  })
})

describe('formatPercent', () => {
  it('prend un pourcentage sur 100 et met une espace avant %', () => {
    expect(formatPercent(82.3)).toBe(`82,3${NBSP}%`)
    expect(formatPercent(100)).toBe(`100,0${NBSP}%`)
  })

  it('signe les écarts sur demande', () => {
    expect(formatPercent(12.3, 1, { signed: true })).toBe(`+12,3${NBSP}%`)
    expect(formatPercent(-95.7, 1, { signed: true })).toBe(`-95,7${NBSP}%`)
  })
})

describe('formatDurationMs', () => {
  it('reste en millisecondes sous la seconde', () => {
    expect(formatDurationMs(1)).toBe(`1${NNBSP}ms`)
    expect(formatDurationMs(850.4)).toBe(`850${NNBSP}ms`)
  })

  it('passe en secondes au-delà', () => {
    expect(formatDurationMs(21_200)).toBe(`21,2${NNBSP}s`)
    expect(formatDurationMs(5_960, 2)).toBe(`5,96${NNBSP}s`)
    expect(formatDurationMs(999.7)).toBe(`1,0${NNBSP}s`)
  })
})
