/**
 * Résumé agrégé pour le panneau context dropping (FR44).
 */
import { theme } from '../../theme'
import type { DetectContextDroppingResponse } from '../../types/graph'

export function GraphContextDroppingSummary({
  response,
}: {
  response: DetectContextDroppingResponse
}) {
  return (
    <div data-testid="graph-context-dropping-summary" style={{ marginBottom: '0.5rem' }}>
      {response.message ? (
        <p style={{ fontSize: '0.8rem', color: theme.text.secondary }}>{response.message}</p>
      ) : null}
      <p style={{ fontWeight: 600 }}>{response.summary}</p>
      <p style={{ fontSize: '0.75rem', color: theme.text.secondary }}>
        Profil : {response.rules_profile_effective}
      </p>
    </div>
  )
}
