/**
 * Modal affichant le rapport de validation pour les nœuds sélectionnés (Story 2.11 FR32).
 */
import { theme } from '../../theme'
import { useNarrowInlineSize } from '../../hooks/useNarrowInlineSize'
import { modalTypography } from '../../theme/responsiveChrome'
import type { ValidationErrorDetail } from '../../types/graph'

export interface BatchValidationReportModalProps {
  isOpen: boolean
  onClose: () => void
  validationErrors: ValidationErrorDetail[]
  selectedNodeIds: string[]
}

export function BatchValidationReportModal({
  isOpen,
  onClose,
  validationErrors,
  selectedNodeIds,
}: BatchValidationReportModalProps) {
  const { ref: panelRef, isNarrow } = useNarrowInlineSize(520)
  const typo = isNarrow ? modalTypography.narrow : modalTypography.comfortable
  if (!isOpen) return null

  const selectedSet = new Set(selectedNodeIds)
  const filtered = validationErrors.filter(
    (e) => e.node_id != null && selectedSet.has(e.node_id)
  )
  const errors = filtered.filter((e) => e.severity === 'error')
  const warnings = filtered.filter((e) => e.severity === 'warning')

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-validation-report-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1500,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: '90%',
          maxWidth: '480px',
          maxHeight: '80vh',
          backgroundColor: theme.background.elevated,
          borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
        ref={panelRef}
      >
        <div
          id="batch-validation-report-title"
          style={{
            padding: isNarrow ? '0.85rem' : '1rem 1.25rem',
            borderBottom: `1px solid ${theme.border.primary}`,
            fontWeight: 700,
            fontSize: `${typo.titleFontRem}rem`,
            color: theme.text.primary,
          }}
        >
          Rapport de validation ({selectedNodeIds.length} nœud
          {selectedNodeIds.length > 1 ? 's' : ''} sélectionné
          {selectedNodeIds.length > 1 ? 's' : ''})
        </div>
        <div
          style={{
            padding: isNarrow ? '0.85rem' : '1rem 1.25rem',
            overflow: 'auto',
            flex: 1,
            minHeight: 0,
          }}
        >
          {filtered.length === 0 ? (
            <p style={{ margin: 0, color: theme.state.success.color, fontSize: `${typo.bodyFontRem}rem` }}>
              Aucune erreur ni avertissement pour les nœuds sélectionnés.
            </p>
          ) : (
            <>
              {errors.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <div
                    style={{
                      fontSize: `${typo.subtitleFontRem}rem`,
                      fontWeight: 600,
                      color: theme.state.error.color,
                      marginBottom: '0.35rem',
                    }}
                  >
                    Erreurs ({errors.length})
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                    {errors.map((e, i) => (
                      <li
                        key={`e-${i}`}
                        style={{
                          fontSize: `${typo.bodyFontRem}rem`,
                          color: theme.text.primary,
                          marginBottom: '0.25rem',
                        }}
                      >
                        {e.node_id != null && (
                          <span style={{ color: theme.text.secondary }}>[{e.node_id}] </span>
                        )}
                        {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {warnings.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: `${typo.subtitleFontRem}rem`,
                      fontWeight: 600,
                      color: theme.state.warning.color,
                      marginBottom: '0.35rem',
                    }}
                  >
                    Avertissements ({warnings.length})
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                    {warnings.map((w, i) => (
                      <li
                        key={`w-${i}`}
                        style={{
                          fontSize: `${typo.bodyFontRem}rem`,
                          color: theme.text.primary,
                          marginBottom: '0.25rem',
                        }}
                      >
                        {w.node_id != null && (
                          <span style={{ color: theme.text.secondary }}>[{w.node_id}] </span>
                        )}
                        {w.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
        <div
          style={{
            padding: '0.75rem 1.25rem',
            borderTop: `1px solid ${theme.border.primary}`,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.4rem 1rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '6px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: 'pointer',
              fontSize: `${typo.bodyFontRem}rem`,
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
