/**
 * Section couverture de simulation de flux (FR47 / Story 4.12).
 *
 * Affiche le pourcentage de nœuds accessibles avec un badge coloré :
 *   ≥ 90 % → vert, 70–89 % → orange, < 70 % → rouge.
 * La section est masquée quand `coverage` est absent ou que `total_nodes == 0`.
 */
import type { FlowCoverageStats } from '../../types/graph'

/** Seuils et couleurs du badge de couverture : ≥90% vert, 70–89% orange, <70% rouge. */
const COVERAGE_COLOR_THRESHOLDS = [
  { min: 90, color: 'green', hex: '#2e7d32' },
  { min: 70, color: 'orange', hex: '#e65100' },
  { min: 0, color: 'red', hex: '#b71c1c' },
] as const

type CoverageThreshold = (typeof COVERAGE_COLOR_THRESHOLDS)[number]

function getCoverageColor(percentage: number): CoverageThreshold {
  return (
    COVERAGE_COLOR_THRESHOLDS.find((t) => percentage >= t.min) ??
    COVERAGE_COLOR_THRESHOLDS[COVERAGE_COLOR_THRESHOLDS.length - 1]
  )
}

interface CoverageSectionProps {
  coverage: FlowCoverageStats
}

export function CoverageSection({ coverage }: CoverageSectionProps) {
  if (coverage.total_nodes === 0) return null

  const { color, hex } = getCoverageColor(coverage.coverage_percentage)

  return (
    <section data-testid="coverage-section" aria-label="Couverture du dialogue">
      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.85rem' }}>
        📊 Couverture
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span
          data-testid="coverage-badge"
          data-color={color}
          style={{
            backgroundColor: hex,
            color: '#fff',
            borderRadius: 4,
            padding: '2px 8px',
            fontWeight: 700,
            fontSize: '0.9rem',
            minWidth: 48,
            textAlign: 'center',
          }}
        >
          {coverage.coverage_percentage}%
        </span>
        <span style={{ fontSize: '0.82rem' }}>
          {coverage.accessible_count} / {coverage.total_nodes} nœuds accessibles
        </span>
      </div>
      {(coverage.dead_end_count > 0 || coverage.cul_de_sac_count > 0) && (
        <div style={{ fontSize: '0.78rem', marginTop: 4, opacity: 0.8 }}>
          {coverage.dead_end_count > 0 && (
            <span>{coverage.dead_end_count} dead end{coverage.dead_end_count > 1 ? 's' : ''} </span>
          )}
          {coverage.cul_de_sac_count > 0 && (
            <span>· {coverage.cul_de_sac_count} cul-de-sac{coverage.cul_de_sac_count > 1 ? 's' : ''}</span>
          )}
        </div>
      )}
    </section>
  )
}
