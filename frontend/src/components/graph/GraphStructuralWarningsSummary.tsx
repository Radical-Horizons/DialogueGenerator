import { theme } from '../../theme'
import type { GraphValidationWarningSummary } from '../../utils/graphValidationSummary'
import { CyclesSummary } from './CyclesSummary'

interface GraphStructuralWarningsSummaryProps {
  warningSummary: GraphValidationWarningSummary
}

/**
 * Résumé textuel topologie : orphelin / inatteignable (FR40) + cycles visibles (FR41).
 */
export function GraphStructuralWarningsSummary({
  warningSummary,
}: GraphStructuralWarningsSummaryProps) {
  const orphanCount = warningSummary.countsByType.orphan_node ?? 0
  const unreachableCount = warningSummary.countsByType.unreachable_node ?? 0
  const cycleCount = warningSummary.cycleCount
  if (orphanCount === 0 && unreachableCount === 0 && cycleCount === 0) {
    return null
  }

  const parts: string[] = []
  if (orphanCount > 0) {
    parts.push(
      `${orphanCount} nœud${orphanCount > 1 ? 's' : ''} orphelin${orphanCount > 1 ? 's' : ''} détecté${
        orphanCount > 1 ? 's' : ''
      }`
    )
  }
  if (unreachableCount > 0) {
    parts.push(
      `${unreachableCount} nœud${unreachableCount > 1 ? 's' : ''} inaccessible${
        unreachableCount > 1 ? 's' : ''
      } depuis l’entrée`
    )
  }

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      {parts.length > 0 ? (
        <div
          data-testid="structural-topology-summary"
          style={{
            fontSize: '0.75rem',
            color: theme.state.warning.color,
            marginBottom: cycleCount > 0 ? '0.35rem' : 0,
            opacity: 0.95,
            lineHeight: 1.35,
          }}
        >
          {parts.join(' · ')}
        </div>
      ) : null}
      <CyclesSummary visibleCycleCount={cycleCount} />
    </div>
  )
}
