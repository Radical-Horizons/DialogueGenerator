/**
 * Agrégats d'affichage A/B (barres CSS) — pas de lib charts.
 */
import type { ABTestHistoryItem, ABTestResult, ABTestSideTotals } from '../types/template'

export function winnerLabel(result: ABTestResult): string {
  if (result.status !== 'completed') {
    return '—'
  }
  if (result.winnerTemplateId === result.templateAId) {
    return result.templateAName
  }
  if (result.winnerTemplateId === result.templateBId) {
    return result.templateBName
  }
  const meanA = result.totals.templateA?.meanOverall ?? null
  const meanB = result.totals.templateB?.meanOverall ?? null
  if (meanA == null || meanB == null) {
    return 'Pas de vainqueur'
  }
  return 'Égalité'
}

export function scoreBarPercent(mean: number | null, max = 10): number {
  if (mean == null || max <= 0) {
    return 0
  }
  return Math.max(0, Math.min(100, (mean / max) * 100))
}

export function costBarPercents(
  sideA: ABTestSideTotals | undefined,
  sideB: ABTestSideTotals | undefined,
): { a: number; b: number } {
  const costA = sideA?.totalCostEur ?? 0
  const costB = sideB?.totalCostEur ?? 0
  const max = Math.max(costA, costB, 0.0001)
  return {
    a: Math.round((costA / max) * 100),
    b: Math.round((costB / max) * 100),
  }
}

export function scoreHistorySeries(
  history: ABTestHistoryItem[],
  templateId: string,
): Array<{ testId: string; createdAt: string; mean: number }> {
  return history
    .filter((item) => item.templateAId === templateId || item.templateBId === templateId)
    .map((item) => ({
      testId: item.testId,
      createdAt: item.createdAt,
      mean: item.templateAId === templateId ? item.meanScoreA : item.meanScoreB,
    }))
    .filter((point): point is { testId: string; createdAt: string; mean: number } => point.mean != null)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export function prebuiltAbTestId(slug: string): string {
  return `prebuilt:${slug}`
}

export function marketplaceAbTestId(listingId: string): string {
  return `marketplace:${listingId}`
}
