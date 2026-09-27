/**
 * Point d'état 6 px du panneau de validation : la gravité se lit à sa couleur, le texte
 * voisin dit le reste. Même motif que le badge santé de la barre d'outils (écran 2e).
 */
import { theme } from '../../theme'

export type ValidationSeverityTone = 'error' | 'warning' | 'success'

const TONE_COLOR: Record<ValidationSeverityTone, string> = {
  error: theme.state.error.color,
  warning: theme.state.warning.color,
  success: theme.state.success.color,
}

export function ValidationSeverityDot({
  tone,
  testId,
}: {
  tone: ValidationSeverityTone
  testId?: string
}) {
  return (
    <span
      aria-hidden
      data-testid={testId}
      data-tone={tone}
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        backgroundColor: TONE_COLOR[tone],
        flexShrink: 0,
      }}
    />
  )
}
