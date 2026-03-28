/**
 * Budget tokens pour la sélection de contexte GDD (FR20).
 */
import { useId, useState, useCallback } from 'react'
import { useContextConfigStore } from '../../store/contextConfigStore'
import { useContextSelectionTokenEstimate } from '../../hooks/useContextSelectionTokenEstimate'
import { CONTEXT_OPTIMIZE_API_ENABLED, CONTEXT_TOKENS_LIMITS } from '../../constants'
import { theme } from '../../theme'
import { ContextOptimizeModal } from './ContextOptimizeModal'

const ENTITY_LABELS: Record<string, string> = {
  characters: 'Personnages',
  locations: 'Lieux',
  items: 'Objets',
  species: 'Espèces',
  communities: 'Communautés',
}

export function ContextTokenBudgetSection() {
  const budgetId = useId()
  const statusId = useId()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [optimizeOpen, setOptimizeOpen] = useState(false)

  const contextTokenBudgetMax = useContextConfigStore((s) => s.contextTokenBudgetMax)
  const setContextTokenBudgetMax = useContextConfigStore((s) => s.setContextTokenBudgetMax)

  const { data, loading, error, refresh } = useContextSelectionTokenEstimate()

  const handleOptimizeApplied = useCallback(() => {
    void refresh()
  }, [refresh])

  const selectionTokens = data?.selection_tokens ?? 0
  const overBudget = selectionTokens > contextTokenBudgetMax
  const pct = contextTokenBudgetMax > 0 ? Math.min(100, (selectionTokens / contextTokenBudgetMax) * 100) : 0

  return (
    <section
      data-testid="context-token-budget-section"
      style={{
        flexShrink: 0,
        borderTop: `1px solid ${theme.border.primary}`,
        backgroundColor: theme.background.secondary,
        padding: '0.5rem 0.65rem',
        fontSize: '0.82rem',
      }}
      aria-labelledby={`${budgetId}-title`}
    >
      <h3
        id={`${budgetId}-title`}
        style={{ margin: '0 0 0.35rem', fontSize: '0.85rem', fontWeight: 600, color: theme.text.primary }}
      >
        Budget tokens contexte
      </h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '0.35rem' }}>
        <label htmlFor={budgetId} style={{ color: theme.text.secondary }}>
          Plafond
        </label>
        <input
          id={budgetId}
          data-testid="context-token-budget-input"
          type="number"
          min={CONTEXT_TOKENS_LIMITS.MIN}
          max={CONTEXT_TOKENS_LIMITS.MAX}
          step={100}
          value={contextTokenBudgetMax}
          onChange={(e) => setContextTokenBudgetMax(Number(e.target.value))}
          style={{
            width: '6.5rem',
            padding: '0.2rem 0.35rem',
            borderRadius: 4,
            border: `1px solid ${theme.border.primary}`,
            backgroundColor: theme.background.primary,
            color: theme.text.primary,
          }}
        />
        <span style={{ color: theme.text.secondary }}>tokens</span>
      </div>

      <div
        id={statusId}
        role="status"
        aria-live="polite"
        aria-busy={loading}
        data-testid="context-token-budget-status"
        style={{ color: theme.text.primary, marginBottom: '0.25rem' }}
      >
        {loading && 'Estimation des tokens…'}
        {!loading && error && (
          <span style={{ color: theme.state.error.color }}>{error}</span>
        )}
        {!loading && !error && (
          <>
            Sélection (estimée) : <strong>{selectionTokens.toLocaleString()}</strong> /{' '}
            <strong>{contextTokenBudgetMax.toLocaleString()}</strong>
            {overBudget && (
              <span
                data-testid="context-token-budget-warning"
                style={{ display: 'block', marginTop: 4, color: theme.state.warning.color }}
              >
                Budget dépassé — réduire la sélection. La génération reste possible (avertissement seul).
              </span>
            )}
          </>
        )}
      </div>

      <div
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: theme.background.tertiary,
          overflow: 'hidden',
          marginBottom: '0.35rem',
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

      {overBudget && (
        <div style={{ marginBottom: '0.35rem' }}>
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
              padding: '0.25rem 0.5rem',
              fontSize: '0.78rem',
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

      <details open={detailsOpen} onToggle={(e) => setDetailsOpen((e.target as HTMLDetailsElement).open)}>
        <summary
          style={{
            cursor: 'pointer',
            color: theme.text.secondary,
            fontWeight: 500,
            fontSize: '0.78rem',
          }}
        >
          Détails tokens
        </summary>
        {data?.context_breakdown_note && (
          <p style={{ margin: '0.35rem 0', fontSize: '0.72rem', color: theme.text.secondary }}>
            {data.context_breakdown_note}
          </p>
        )}
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.72rem',
            marginTop: '0.25rem',
          }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.15rem' }}>Type</th>
              <th style={{ textAlign: 'left', padding: '0.15rem' }}>Mode</th>
              <th style={{ textAlign: 'right', padding: '0.15rem' }}>Tokens</th>
            </tr>
          </thead>
          <tbody>
            {(data?.context_token_breakdown ?? []).map((row, i) => (
              <tr key={`${row.entity_type}-${row.mode}-${i}`}>
                <td style={{ padding: '0.15rem' }}>{ENTITY_LABELS[row.entity_type] ?? row.entity_type}</td>
                <td style={{ padding: '0.15rem' }}>{row.mode === 'full' ? 'Complet' : 'Extrait'}</td>
                <td style={{ padding: '0.15rem', textAlign: 'right' }}>{row.token_count.toLocaleString()}</td>
              </tr>
            ))}
            {(!data?.context_token_breakdown || data.context_token_breakdown.length === 0) && !loading && (
              <tr>
                <td colSpan={3} style={{ padding: '0.15rem', color: theme.text.secondary }}>
                  Aucune ligne (sélection vide ou estimation en attente).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </details>
    </section>
  )
}
