import { theme } from '../../theme'
import type { GraphValidationWarningSummary } from '../../utils/graphValidationSummary'

interface GraphStructuralWarningsSummaryProps {
  warningSummary: GraphValidationWarningSummary
}

/**
 * Résumé textuel des avertissements de topologie (orphelin vs inatteignable), FR40.
 */
export function GraphStructuralWarningsSummary({
  warningSummary,
}: GraphStructuralWarningsSummaryProps) {
  const orphanCount = warningSummary.countsByType.orphan_node ?? 0
  const unreachableCount = warningSummary.countsByType.unreachable_node ?? 0
  if (orphanCount === 0 && unreachableCount === 0) {
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
    <div
      data-testid="structural-topology-summary"
      style={{
        fontSize: '0.75rem',
        color: theme.state.warning.color,
        marginBottom: '0.75rem',
        opacity: 0.95,
        lineHeight: 1.35,
      }}
    >
      {parts.join(' · ')}
    </div>
  )
}
