import { theme } from '../../theme'

interface CyclesSummaryProps {
  /** Nombre de warnings `cycle_detected` encore visibles (hors intentionnels). */
  visibleCycleCount: number
}

/**
 * Ligne de résumé dédiée aux cycles (FR41), séparée du bloc orphelin / inaccessible (FR40).
 */
export function CyclesSummary({ visibleCycleCount }: CyclesSummaryProps) {
  if (visibleCycleCount <= 0) {
    return null
  }

  return (
    <div
      data-testid="structural-cycles-summary"
      style={{
        fontSize: '0.75rem',
        color: theme.state.warning.color,
        marginBottom: '0.35rem',
        opacity: 0.95,
        lineHeight: 1.35,
      }}
    >
      {visibleCycleCount} cycle{visibleCycleCount > 1 ? 's' : ''} détecté
      {visibleCycleCount > 1 ? 's' : ''} (voir la liste ci-dessous)
    </div>
  )
}
