/**
 * Compteur prompt complet + sous-ligne sélection GDD (budget / optimisation FR20–FR21).
 */
import { useCallback, useId, useState, type ReactNode } from 'react'
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

function StatusPill({
  children,
  tone,
  testId,
}: {
  children: ReactNode
  tone: 'warning' | 'error'
  testId?: string
}) {
  const color = tone === 'error' ? theme.state.error.color : theme.state.warning.color
  return (
    <span
      data-testid={testId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.12rem 0.45rem',
        borderRadius: 999,
        fontSize: remSize('caption'),
        fontWeight: 600,
        lineHeight: 1.25,
        color,
        backgroundColor: `${color}18`,
        border: `1px solid ${color}44`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
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
  const pctRaw =
    contextTokenBudgetMax > 0 ? (gddTokens / contextTokenBudgetMax) * 100 : 0
  const barPct = Math.min(100, pctRaw)
  const hasEstimate = selectionTokens != null

  return (
    <section
      data-testid="context-selection-budget-bar"
      style={{
        flexShrink: 0,
        borderBottom: `1px solid ${theme.border.primary}`,
        backgroundColor: theme.background.tertiary,
        padding: '0.5rem 0.75rem',
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
      >
        {isEstimating && (
          <span style={{ color: theme.text.secondary }}>Estimation…</span>
        )}
        {!isEstimating && estimationError && (
          <span style={{ color: theme.state.error.color }}>{estimationError}</span>
        )}
        {!isEstimating && !estimationError && !hasEstimate && (
          <span style={{ color: theme.text.secondary }}>Sélectionnez du contexte pour estimer.</span>
        )}
        {!isEstimating && !estimationError && hasEstimate && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '0.65rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 12rem', minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  flexWrap: 'wrap',
                  gap: '0.35rem 0.5rem',
                  color: theme.text.primary,
                }}
              >
                <span style={{ color: theme.text.secondary, fontSize: remSize('caption') }}>
                  Prompt
                </span>
                <strong
                  data-testid="prompt-token-total"
                  style={{ fontSize: remSize('body'), fontWeight: 700 }}
                >
                  {formatContextTokensApprox(promptTokens)}
                </strong>
                <span
                  aria-hidden
                  style={{ color: theme.border.primary, userSelect: 'none' }}
                >
                  ·
                </span>
                <span
                  data-testid="context-gdd-token-subline"
                  style={{
                    color: theme.text.secondary,
                    fontSize: remSize('caption'),
                  }}
                >
                  GDD{' '}
                  <strong style={{ color: theme.text.primary }}>
                    {formatContextTokensApprox(gddTokens)}
                  </strong>
                  {' / '}
                  <strong style={{ color: theme.text.primary }}>
                    {contextTokenBudgetMax.toLocaleString()}
                  </strong>
                </span>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
                gap: '0.35rem',
                flex: '0 1 auto',
              }}
            >
              {overBudget && (
                <StatusPill tone="error" testId="context-token-budget-warning">
                  Budget dépassé
                </StatusPill>
              )}
              {highContext && (
                <StatusPill tone="warning" testId="context-token-high-context-warning">
                  Contexte élevé
                </StatusPill>
              )}
              {overBudget && (
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
                    padding: '0.22rem 0.55rem',
                    fontSize: remSize('small'),
                    borderRadius: 6,
                    border: 'none',
                    backgroundColor: CONTEXT_OPTIMIZE_API_ENABLED
                      ? theme.button.primary.background
                      : theme.background.secondary,
                    color: CONTEXT_OPTIMIZE_API_ENABLED
                      ? theme.button.primary.color
                      : theme.text.secondary,
                    cursor: CONTEXT_OPTIMIZE_API_ENABLED ? 'pointer' : 'not-allowed',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Optimiser le contexte
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {hasEstimate && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            marginTop: '0.4rem',
          }}
          aria-hidden
        >
          <div
            style={{
              flex: 1,
              height: 6,
              borderRadius: 999,
              backgroundColor: theme.background.secondary,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${barPct}%`,
                backgroundColor: overBudget
                  ? theme.state.error.color
                  : theme.button.primary.background,
                transition: 'width 0.2s ease',
              }}
            />
          </div>
          <span
            style={{
              flexShrink: 0,
              minWidth: '2.75rem',
              textAlign: 'right',
              fontSize: remSize('caption'),
              fontWeight: 600,
              color: overBudget ? theme.state.error.color : theme.text.secondary,
            }}
          >
            {Math.round(pctRaw)}%
          </span>
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
