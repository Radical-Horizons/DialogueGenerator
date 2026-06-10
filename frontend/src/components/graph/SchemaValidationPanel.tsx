/**
 * Panneau de validation conformité schéma JSON Unity (FR48 / Story 4.13).
 */
import { theme } from '../../theme'
import { GraphToolFloatingShell } from './GraphToolFloatingShell'

interface SchemaValidationPanelProps {
  isOpen: boolean
  isLoading: boolean
  isValid: boolean
  errors: string[]
  errorCount: number
  onClose: () => void
  /** Appelé au clic sur une erreur — permet au parent de focaliser le nœud concerné. */
  onErrorClick?: (error: string) => void
}

const SCHEMA_STATUS_STYLES = {
  valid: {
    badge: { backgroundColor: '#22c55e', color: '#fff' },
    label: 'Schéma Unity : 100% conforme',
  },
  invalid: {
    badge: { backgroundColor: '#ef4444', color: '#fff' },
  },
} as const

export function SchemaValidationPanel({
  isOpen,
  isLoading,
  isValid,
  errors,
  errorCount,
  onClose,
  onErrorClick,
}: SchemaValidationPanelProps) {
  if (!isOpen) return null

  return (
    <GraphToolFloatingShell
      title={<strong>Validation schéma Unity</strong>}
      onClose={onClose}
      dataTestId="schema-validation-panel"
      storageKey="schema-unity"
      initialOffset={{ top: 56, left: 320 }}
      width="min(400px, calc(100vw - 24px))"
      maxHeight="min(70vh, 540px)"
      closeButtonTestId="schema-close-btn"
      closeAriaLabel="Fermer"
      closeButtonChildren="✕"
      closeButtonStyle={{
        background: 'transparent',
        border: 'none',
        color: theme.text.secondary,
        fontSize: '1rem',
        padding: '0 4px',
      }}
    >
      {isLoading && (
        <div
          data-testid="schema-loading-indicator"
          style={{ textAlign: 'center', padding: '1rem 0', color: theme.text.secondary }}
        >
          ⏳ Validation en cours…
        </div>
      )}

      {!isLoading && (
        <>
          <div
            data-testid="schema-status-badge"
            data-valid={String(isValid)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: '0.82rem',
              fontWeight: 600,
              marginBottom: 8,
              ...(isValid ? SCHEMA_STATUS_STYLES.valid.badge : SCHEMA_STATUS_STYLES.invalid.badge),
            }}
          >
            {isValid ? '✅ conforme' : `❌ ${errorCount} erreur${errorCount > 1 ? 's' : ''} détectée${errorCount > 1 ? 's' : ''}`}
          </div>

          {isValid && (
            <p style={{ margin: 0, fontSize: '0.82rem', color: theme.text.secondary }}>
              {SCHEMA_STATUS_STYLES.valid.label}
            </p>
          )}

          {!isValid && errors.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.82rem' }}>
              {errors.map((err, idx) => (
                <li
                  key={idx}
                  data-testid="schema-error-item"
                  onClick={onErrorClick ? () => onErrorClick(err) : undefined}
                  style={{
                    marginBottom: 4,
                    color: theme.text.primary,
                    cursor: onErrorClick ? 'pointer' : 'default',
                  }}
                  title={onErrorClick ? 'Cliquer pour localiser le nœud' : undefined}
                >
                  {err}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </GraphToolFloatingShell>
  )
}
