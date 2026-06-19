/**
 * Compteur prompt complet + sous-ligne sélection GDD (budget / optimisation FR20–FR21).
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

const HIGH_CONTEXT_WARNING_THRESHOLD = 100_000

export interface ContextSelectionBudgetBarProps {
  /** Masquer sur graphe / autres vues sans génération. */
  visible?: boolean
}

export function ContextSelectionBudgetBar({ visible = true }: ContextSelectionBudgetBarProps) {
  const budgetId = useId()
  const statusId = useId()
  const [optimizeOpen, setOptimizeOpen] = useState(false)

  const contextTokenBudgetMax = useContextConfigStore((s) => s.contextTokenBudgetMax)
  const selectionTokens = useGenerationStore((s) => s.tokenCount)
  const promptTokenCount = useGenerationStore((s) => s.promptTokenCount)
  const isEstimating = useGenerationStore((s) => s.isEstimating)
  const estimationError = useGenerationStore((s) => s.contextEstimationError)
  const estimateTokens = useGenerationActionsStore((s) => s.actions.estimateTokens)

  const handleOptimizeApplied = useCallback(() => {
    void estimateTokens?.()
  }, [estimateTokens])

  if (!visible) return null

  const gddTokens = selectionTokens ?? 0
  const promptTokens = promptTokenCount ?? gddTokens
  const overBudget =
    contextTokenBudgetMax > 0 && gddTokens > contextTokenBudgetMax
  const highContext = gddTokens > HIGH_CONTEXT_WARNING_THRESHOLD
  const pct =
    contextTokenBudgetMax > 0
      ? Math.min(100, (gddTokens / contextTokenBudgetMax) * 100)
      : 0
  const hasEstimate = selectionTokens != null

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
        {!isEstimating && !estimationError && hasEstimate && (
          <>
            Prompt :{' '}
            <strong data-testid="prompt-token-total">
              {formatContextTokensApprox(promptTokens)}
            </strong>
            <span
              style={{ display: 'block', marginTop: 4, color: theme.text.secondary, fontSize: remSize('caption') }}
              data-testid="context-gdd-token-subline"
            >
              dont sélection GDD :{' '}
              <strong>{formatContextTokensApprox(gddTokens)}</strong> /{' '}
              <strong>{contextTokenBudgetMax.toLocaleString()}</strong>
            </span>
            {overBudget && (
              <span
                data-testid="context-token-budget-warning"
                style={{ display: 'block', marginTop: 4, color: theme.state.warning.color, fontSize: remSize('caption') }}
              >
                Budget dépassé — réduire la sélection ou optimiser.
              </span>
            )}
            {highContext && (
              <span
                data-testid="context-token-high-context-warning"
                style={{ display: 'block', marginTop: 4, color: theme.state.warning.color, fontSize: remSize('caption') }}
              >
                Contexte élevé
              </span>
            )}
          </>
        )}
        {!isEstimating && !estimationError && !hasEstimate && (
          <span style={{ color: theme.text.secondary }}>Sélectionnez du contexte pour estimer.</span>
        )}
      </div>

      {hasEstimate && (
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
    </section>
  )
}
