/**
 * Message d'erreur sous un champ de formulaire (validation inline).
 */
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'

export interface InlineFieldErrorProps {
  message?: string
  id?: string
}

export function InlineFieldError({ message, id }: InlineFieldErrorProps) {
  if (!message) return null
  return (
    <div
      id={id}
      role="alert"
      style={{
        marginTop: '0.25rem',
        fontSize: remSize('caption'),
        color: theme.state.error.color,
        lineHeight: 1.35,
      }}
    >
      {message}
    </div>
  )
}

/** Bordure input/textarea en erreur. */
export function fieldErrorBorder(hasError: boolean, defaultBorder: string): string {
  return hasError ? theme.state.error.border : defaultBorder
}
