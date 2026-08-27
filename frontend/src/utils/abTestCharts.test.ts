/**
 * Agrégats barres A/B (gagnant, pourcentages, série historique).
 */
import { describe, expect, it } from 'vitest'
import {
  costBarPercents,
  prebuiltAbTestId,
  scoreBarPercent,
  scoreHistorySeries,
  winnerLabel,
} from './abTestCharts'
import type { ABTestHistoryItem, ABTestResult, ABTestSideTotals } from '../types/template'

function totals(mean: number | null, cost = 1): ABTestSideTotals {
  return {
    meanOverall: mean,
    scoredCount: mean == null ? 0 : 1,
    totalCostEur: cost,
    totalDurationMs: 10,
    thumbsUp: 0,
    thumbsDown: 0,
  }
}

function result(overrides: Partial<ABTestResult> = {}): ABTestResult {
  return {
    testId: 't1',
    status: 'completed',
    current: 2,
    total: 2,
    createdAt: '2026-08-16T10:00:00Z',
    templateAId: 'a',
    templateBId: 'b',
    templateAName: 'Alpha',
    templateBName: 'Beta',
    generationsPerTemplate: 1,
    maxDepth: 1,
    parentTestId: null,
    winnerTemplateId: 'a',
    scoreVarianceNote: '±1',
    generations: [],
    totals: { templateA: totals(8), templateB: totals(5) },
    error: null,
    ...overrides,
  }
}

describe('abTestCharts', () => {
  it('nomme le gagnant ou égalité', () => {
    expect(winnerLabel(result())).toBe('Alpha')
    expect(winnerLabel(result({ winnerTemplateId: 'b' }))).toBe('Beta')
    expect(winnerLabel(result({ winnerTemplateId: null }))).toBe('Égalité')
    expect(winnerLabel(result({ status: 'running', winnerTemplateId: null }))).toBe('—')
    expect(
      winnerLabel(
        result({
          winnerTemplateId: null,
          totals: { templateA: totals(null), templateB: totals(5) },
        }),
      ),
    ).toBe('Pas de vainqueur')
  })

  it('borne les pourcentages de score et de coût', () => {
    expect(scoreBarPercent(5)).toBe(50)
    expect(scoreBarPercent(null)).toBe(0)
    expect(costBarPercents(totals(8, 2), totals(5, 1))).toEqual({ a: 100, b: 50 })
  })

  it('série historique d’un template, chronologique', () => {
    const history: ABTestHistoryItem[] = [
      {
        testId: '2',
        status: 'completed',
        createdAt: '2026-08-17T00:00:00Z',
        templateAId: 'a',
        templateBId: 'x',
        templateAName: 'Alpha',
        templateBName: 'X',
        winnerTemplateId: 'a',
        parentTestId: null,
        meanScoreA: 9,
        meanScoreB: 4,
      },
      {
        testId: '1',
        status: 'completed',
        createdAt: '2026-08-16T00:00:00Z',
        templateAId: 'z',
        templateBId: 'a',
        templateAName: 'Z',
        templateBName: 'Alpha',
        winnerTemplateId: 'a',
        parentTestId: null,
        meanScoreA: 2,
        meanScoreB: 7,
      },
    ]
    expect(scoreHistorySeries(history, 'a').map((point) => point.mean)).toEqual([7, 9])
    expect(prebuiltAbTestId('salutation')).toBe('prebuilt:salutation')
  })
})
