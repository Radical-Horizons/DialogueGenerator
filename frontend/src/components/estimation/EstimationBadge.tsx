/**
 * Badge d'estimation unifié (tokens + coût) pour tous les flux de génération.
 * Affichage seul : résultat, état, erreur, bouton Estimer, avertissements budget.
 */
import { useState } from 'react'
import { theme } from '../../theme'
import { redesignFont } from '../../theme/redesignTokens'
import { formatCurrency, formatNumber, formatPercent } from '../../utils/formatCurrency'
import type { EstimationResult } from '../../types/estimation'

/** Estimation en euros (champs `*_cost_eur`) : « ≈ 0,0042 € ». */
function formatEstimateEur(value: number): string {
  return formatCurrency(value, 'EUR', { maximumFractionDigits: 4, approx: true })
}

const monoStyle = { fontFamily: redesignFont.mono } as const

export interface EstimationBadgeProps {
  /** Résultat normalisé (tokens ; coût optionnel). */
  result: EstimationResult | null
  /** État du chargement. */
  state: 'idle' | 'loading' | 'success' | 'error'
  /** Message d'erreur. */
  error: string | null
  /** Déclencher l'estimation (manuel). */
  onEstimate: () => void
  /** Budget dépassé (désactiver Générer). */
  budgetExceeded?: boolean
  /** Avertissement budget ≥ 90%. */
  budgetWarning90?: boolean
  /** Afficher le badge même sans requête (ex. flux dialogue). */
  showWhenIdle?: boolean
}

export function EstimationBadge({
  result,
  state,
  error,
  onEstimate,
  budgetExceeded = false,
  budgetWarning90 = false,
  showWhenIdle = true,
}: EstimationBadgeProps) {
  const [breakdownExpanded, setBreakdownExpanded] = useState(false)

  const comparisonLabel =
    result?.cost_difference_pct != null && result.alternative_provider && result.provider
      ? `${result.alternative_provider} : ${formatPercent(result.cost_difference_pct, 1, { signed: true })} vs ${result.provider}`
      : null

  const totalTokens = result ? result.prompt_tokens + result.completion_tokens : 0
  const hasCost = result?.estimated_cost_eur != null

  if (!showWhenIdle && state === 'idle' && !result) return null

  return (
    <div
      style={{
        padding: '0.75rem',
        backgroundColor: theme.background.secondary,
        borderRadius: '8px',
        border: `1px solid ${theme.border.primary}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onEstimate}
          disabled={state === 'loading'}
          style={{
            padding: '0.4rem 0.75rem',
            fontSize: '0.85rem',
            borderRadius: '6px',
            border: `1px solid ${theme.button.primary.background}`,
            backgroundColor: state === 'loading' ? theme.background.tertiary : theme.button.primary.background,
            color: theme.button.primary.color,
            cursor: state === 'loading' ? 'not-allowed' : 'pointer',
          }}
        >
          {state === 'loading' ? 'Estimation…' : 'Estimer le coût'}
        </button>
        {state === 'success' && result && (
          <span style={{ fontSize: '0.85rem', color: theme.text.primary, ...monoStyle }}>
            {hasCost && `${formatEstimateEur(result.estimated_cost_eur!)} · `}
            {formatNumber(totalTokens)} tokens
            {result.provider && ` · ${result.provider}`}
          </span>
        )}
        {state === 'error' && (
          <span style={{ fontSize: '0.85rem', color: theme.state.error.color }}>{error}</span>
        )}
      </div>

      {state === 'success' && comparisonLabel && hasCost && (
        <div style={{ fontSize: '0.8rem', color: theme.text.secondary, ...monoStyle }}>
          {comparisonLabel}
          {result?.alternative_cost_eur != null && (
            <span> ({formatEstimateEur(result.alternative_cost_eur)})</span>
          )}
        </div>
      )}

      {state === 'success' && result?.per_node_breakdown && result.per_node_breakdown.length > 1 && (
        <div>
          <button
            type="button"
            onClick={() => setBreakdownExpanded((v) => !v)}
            style={{
              background: 'none',
              border: 'none',
              color: theme.text.secondary,
              fontSize: '0.8rem',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            {breakdownExpanded
              ? '▲ Masquer le détail'
              : `▼ Voir détail (${result.per_node_breakdown.length} nœuds)`}
          </button>
          {breakdownExpanded && (
            <div style={{ marginTop: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              {result.per_node_breakdown.map((node, idx) => (
                <div key={idx} style={{ fontSize: '0.78rem', color: theme.text.secondary, ...monoStyle }}>
                  Nœud {node.choice_index ?? idx} — {formatEstimateEur(node.estimated_cost_eur)} ·{' '}
                  {formatNumber(node.prompt_tokens + node.completion_tokens)} tokens
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {budgetWarning90 && !budgetExceeded && (
        <div style={{ fontSize: '0.8rem', color: theme.state.warning.color }}>
          Budget atteint à {formatPercent(90, 0)} — vérifiez avant de générer.
        </div>
      )}
      {budgetExceeded && (
        <div style={{ fontSize: '0.8rem', color: theme.state.error.color, fontWeight: 600 }}>
          Budget dépassé — génération bloquée.
        </div>
      )}
    </div>
  )
}
