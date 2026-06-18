/**
 * Compteur unique contexte GDD + optimisation (FR20/FR21) — panneau détail droit.
 */
import { useCallback, useId, useState } from 'react'
import { useContextConfigStore } from '../../store/contextConfigStore'
import { useGenerationStore } from '../../store/generationStore'
import { useGenerationActionsStore } from '../../store/generationActionsStore'
import { CONTEXT_OPTIMIZE_API_ENABLED } from '../../constants'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { formatContextTokensApprox } from '../../utils/formatContextTokens'
import { ContextOptimizeModal } from '../context/ContextOptimizeModal'

const ENTITY_LABELS: Record<string, string> = {
  characters: 'Personnages',
  locations: 'Lieux',
  items: 'Objets',
  species: 'Espèces',
  communities: 'Communautés',
}

const OPTIMIZATION_WARNING_THRESHOLD = 100_000

export interface ContextSelectionBudgetBarProps {
  /** Masquer sur graphe / autres vues sans génération. */
  visible?: boolean
}

export function ContextSelectionBudgetBar({ visible = true }: ContextSelectionBudgetBarProps) {
  const budgetId = useId()
  const statusId = useId()
  const [optimizeOpen, setOptimizeOpen] = useState(false)

  const contextTokenBudgetMax = useContextConfigStore((s) => s.contextTokenBudgetMax)
  const tokenCount = useGenerationStore((s) => s.tokenCount)
  const isEstimating = useGenerationStore((s) => s.isEstimating)
  const estimationError = useGenerationStore((s) => s.contextEstimationError)
  const breakdown = useGenerationStore((s) => s.contextTokenBreakdown)
  const breakdownNote = useGenerationStore((s) => s.contextBreakdownNote)
  const estimateTokens = useGenerationActionsStore((s) => s.actions.estimateTokens)

  const handleOptimizeApplied = useCallback(() => {
    void estimateTokens?.()
  }, [estimateTokens])

  if (!visible) return null

  const selectionTokens = tokenCount ?? 0
  const overBudget =
    contextTokenBudgetMax > 0 && selectionTokens > contextTokenBudgetMax
  const overOptimizationThreshold = contextTokenBudgetMax > OPTIMIZATION_WARNING_THRESHOLD
  const pct =
    contextTokenBudgetMax > 0
      ? Math.min(100, (selectionTokens / contextTokenBudgetMax) * 100)
      : 0

  return (
    <section
      data-testid="context-selection-budget-bar"
      style={{
        flexShrink: 0,
        borderBottom: `1px solid ${theme.border.primary}`,
        backgroundColor: theme.background.tertiary,
        padding: '0.45rem 0.65rem',
        fontSize: remSize('body'),
      }}
      aria-labelledby={`${budgetId}-title`}
    >
      <div
        id={statusId}
        role="status"
        aria-live="polite"
        aria-busy={isEstimating}
        data-testid="context-token-budget-status"
        style={{ color: theme.text.primary, marginBottom: '0.25rem' }}
      >
        {isEstimating && 'Estimation…'}
        {!isEstimating && estimationError && (
          <span style={{ color: theme.state.error.color }}>{estimationError}</span>
        )}
        {!isEstimating && !estimationError && tokenCount != null && (
          <>
            Contexte GDD :{' '}
            <strong>{formatContextTokensApprox(selectionTokens)}</strong> /{' '}
            <strong>{contextTokenBudgetMax.toLocaleString()}</strong>
            {overBudget && (
              <span
                data-testid="context-token-budget-warning"
                style={{ display: 'block', marginTop: 4, color: theme.state.warning.color, fontSize: remSize('caption') }}
              >
                Budget dépassé — réduire la sélection ou optimiser.
              </span>
            )}
            {overOptimizationThreshold && (
              <span
                data-testid="context-token-budget-high-cap-warning"
                style={{ display: 'block', marginTop: 4, color: theme.state.warning.color, fontSize: remSize('caption') }}
              >
                Plafond élevé — surveillez coût et latence au-delà de 100k.
              </span>
            )}
          </>
        )}
        {!isEstimating && !estimationError && tokenCount == null && (
          <span style={{ color: theme.text.secondary }}>Sélectionnez du contexte pour estimer.</span>
        )}
      </div>

      {tokenCount != null && (
        <div
          style={{
            height: 5,
            borderRadius: 3,
            backgroundColor: theme.background.secondary,
            overflow: 'hidden',
            marginBottom: overBudget ? '0.35rem' : 0,
          }}
          aria-hidden
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              backgroundColor: overBudget ? theme.state.error.color : theme.button.primary.background,
              transition: 'width 0.2s ease',
            }}
          />
        </div>
      )}

      {overBudget && (
        <div style={{ marginTop: '0.35rem' }}>
          <button
            type="button"
            data-testid="context-optimize-cta"
            disabled={!CONTEXT_OPTIMIZE_API_ENABLED}
            onClick={() => CONTEXT_OPTIMIZE_API_ENABLED && setOptimizeOpen(true)}
            title={
              CONTEXT_OPTIMIZE_API_ENABLED
                ? 'Optimiser le contexte (FR21)'
                : 'Disponible après optimisation automatique (FR21)'
            }
            style={{
              padding: '0.2rem 0.45rem',
              fontSize: remSize('small'),
              borderRadius: 4,
              border: `1px solid ${theme.border.primary}`,
              backgroundColor: CONTEXT_OPTIMIZE_API_ENABLED
                ? theme.button.primary.background
                : theme.background.tertiary,
              color: CONTEXT_OPTIMIZE_API_ENABLED ? theme.button.primary.color : theme.text.secondary,
              cursor: CONTEXT_OPTIMIZE_API_ENABLED ? 'pointer' : 'not-allowed',
            }}
          >
            Optimiser le contexte
          </button>
        </div>
      )}

      <ContextOptimizeModal
        open={optimizeOpen}
        onClose={() => setOptimizeOpen(false)}
        onApplied={handleOptimizeApplied}
      />

      {breakdown.length > 0 && (
        <details style={{ marginTop: '0.35rem' }}>
          <summary
            style={{
              cursor: 'pointer',
              color: theme.text.secondary,
              fontWeight: 500,
              fontSize: remSize('small'),
            }}
          >
            Détails
          </summary>
          {breakdownNote && (
            <p style={{ margin: '0.25rem 0', fontSize: remSize('caption'), color: theme.text.secondary }}>
              {breakdownNote}
            </p>
          )}
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: remSize('caption'),
              marginTop: '0.2rem',
            }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.1rem' }}>Type</th>
                <th style={{ textAlign: 'left', padding: '0.1rem' }}>Mode</th>
                <th style={{ textAlign: 'right', padding: '0.1rem' }}>Tokens</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((row, i) => (
                <tr key={`${row.entity_type}-${row.mode}-${i}`}>
                  <td style={{ padding: '0.1rem' }}>{ENTITY_LABELS[row.entity_type] ?? row.entity_type}</td>
                  <td style={{ padding: '0.1rem' }}>{row.mode === 'full' ? 'Complet' : 'Extrait'}</td>
                  <td style={{ padding: '0.1rem', textAlign: 'right' }}>{row.token_count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  )
}
