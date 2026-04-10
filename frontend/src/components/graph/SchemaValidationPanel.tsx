/**
 * Panneau de validation conformité schéma JSON Unity (FR48 / Story 4.13).
 */
import { theme } from '../../theme'

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
    <div
      data-testid="schema-validation-panel"
      style={{
        position: 'absolute',
        top: 80,
        right: 16,
        width: 'min(360px, calc(100% - 32px))',
        maxHeight: 'min(500px, 65vh)',
        overflowY: 'auto',
        backgroundColor: theme.background.panel,
        border: `1px solid ${theme.border.primary}`,
        borderRadius: 8,
        padding: '0.75rem',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
        zIndex: 1001,
        color: theme.text.primary,
        fontSize: '0.88rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <strong>Validation schéma Unity</strong>
        <button
          type="button"
          data-testid="schema-close-btn"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: theme.text.secondary,
            cursor: 'pointer',
            fontSize: '1rem',
            padding: '0 4px',
          }}
          title="Fermer"
        >
          ✕
        </button>
      </div>

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
    </div>
  )
}
