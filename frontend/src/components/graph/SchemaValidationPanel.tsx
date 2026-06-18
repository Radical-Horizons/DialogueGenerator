/**
 * Panneau de validation conformité schéma JSON Unity (FR48 / Story 4.13, FR51).
 */
import { useState } from 'react'
import { theme } from '../../theme'
import { GraphToolFloatingShell } from './GraphToolFloatingShell'
import { SchemaValidationIssueList } from './SchemaValidationIssueList'
import { UnitySchemaReferencePanel } from './UnitySchemaReferencePanel'
import type { SchemaValidationIssue } from '../../types/graph'

interface SchemaValidationPanelProps {
  isOpen: boolean
  isLoading: boolean
  isValid: boolean
  errors: string[]
  errorCount: number
  warnings?: SchemaValidationIssue[]
  structuredErrors?: SchemaValidationIssue[]
  onClose: () => void
  /** Appelé au clic sur une erreur structurée — focalise le nœud concerné. */
  onIssueClick?: (issue: SchemaValidationIssue) => void
}

const SCHEMA_STATUS_STYLES = {
  valid: {
    badge: { backgroundColor: '#22c55e', color: '#fff' },
    label: 'Schéma Unity : 100 % conforme',
  },
  invalid: {
    badge: { backgroundColor: '#ef4444', color: '#fff' },
  },
} as const

function buildStructuredErrors(
  structuredErrors: SchemaValidationIssue[] | undefined,
  errors: string[],
): SchemaValidationIssue[] {
  if (structuredErrors && structuredErrors.length > 0) {
    return structuredErrors
  }
  return errors.map((message) => ({
    code: 'validation_error',
    message,
    path: '',
  }))
}

export function SchemaValidationPanel({
  isOpen,
  isLoading,
  isValid,
  errors,
  errorCount,
  warnings = [],
  structuredErrors,
  onClose,
  onIssueClick,
}: SchemaValidationPanelProps) {
  const [showSchemaReference, setShowSchemaReference] = useState(false)

  if (!isOpen) return null

  const errorIssues = buildStructuredErrors(structuredErrors, errors)
  const errorSummary =
    errorCount === 1
      ? '1 erreur de schéma détectée'
      : `${errorCount} erreurs de schéma détectées`

  return (
    <>
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
              {isValid
                ? '✅ conforme'
                : `❌ ${errorCount} erreur${errorCount > 1 ? 's' : ''} détectée${errorCount > 1 ? 's' : ''}`}
            </div>

            {isValid && warnings.length === 0 && (
              <p
                data-testid="schema-valid-label"
                style={{ margin: 0, fontSize: '0.82rem', color: theme.text.secondary }}
              >
                {SCHEMA_STATUS_STYLES.valid.label}
              </p>
            )}

            {!isValid && errorIssues.length > 0 && (
              <SchemaValidationIssueList
                title={errorSummary}
                issues={errorIssues}
                variant="error"
                onIssueClick={onIssueClick}
                testIdPrefix="schema-error"
              />
            )}

            {warnings.length > 0 && (
              <SchemaValidationIssueList
                title="Avertissements"
                issues={warnings}
                variant="warning"
                testIdPrefix="schema-warning"
              />
            )}

            <button
              type="button"
              data-testid="schema-reference-link"
              onClick={() => setShowSchemaReference(true)}
              style={{
                marginTop: 12,
                background: 'transparent',
                border: `1px solid ${theme.border.default}`,
                borderRadius: 4,
                padding: '4px 8px',
                fontSize: '0.78rem',
                color: theme.text.primary,
                cursor: 'pointer',
              }}
            >
              Schéma Unity de référence
            </button>
          </>
        )}
      </GraphToolFloatingShell>

      <UnitySchemaReferencePanel
        isOpen={showSchemaReference}
        onClose={() => setShowSchemaReference(false)}
      />
    </>
  )
}
