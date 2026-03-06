/**
 * Badge d'estimation du coût LLM avant génération (Story 1.11).
 * - Bouton manuel "Estimer le coût" + recalcul automatique debounce 400 ms (AC #2)
 * - Affiche coût (€), tokens, provider + comparaison inter-providers (AC #3)
 * - Breakdown par nœud expandable pour les batchs (AC #4)
 * - Warnings budget 90% / 100% (AC #5)
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { theme } from '../../theme'
import { estimateCost } from '../../api/graph'
import { getBudget } from '../../api/costs'
import type { EstimateCostRequest, EstimateCostResponse } from '../../types/graph'

type EstimateState = 'idle' | 'loading' | 'success' | 'error'

const DEBOUNCE_MS = 400

export interface CostEstimationBadgeProps {
  /** Payload pour l'appel estimate-cost (aligné sur GenerateNodeRequest). */
  estimateRequest: EstimateCostRequest | null
  /** Callback quand l'estimation indique un dépassement 100% (désactiver "Générer"). */
  onBudgetExceeded?: (exceeded: boolean) => void
}

export function CostEstimationBadge({
  estimateRequest,
  onBudgetExceeded,
}: CostEstimationBadgeProps) {
  const [state, setState] = useState<EstimateState>('idle')
  const [result, setResult] = useState<EstimateCostResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [warningLevel, setWarningLevel] = useState<'none' | '90' | '100'>('none')
  const [breakdownExpanded, setBreakdownExpanded] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runEstimate = useCallback(async (req: EstimateCostRequest) => {
    setState('loading')
    setErrorMessage(null)
    setResult(null)
    setWarningLevel('none')
    onBudgetExceeded?.(false)
    try {
      const data = await estimateCost(req)
      setResult(data)
      setState('success')
      const budget = await getBudget()
      const projectedAmount = budget.amount + data.estimated_cost_eur
      const projectedPercentage = budget.quota > 0 ? (projectedAmount / budget.quota) * 100 : 0
      if (projectedPercentage >= 100) {
        setWarningLevel('100')
        onBudgetExceeded?.(true)
      } else if (projectedPercentage >= 90) {
        setWarningLevel('90')
      }
    } catch (err) {
      setState('error')
      setErrorMessage(err instanceof Error ? err.message : 'Erreur estimation')
    }
  }, [onBudgetExceeded])

  // AC #2 : recalcul automatique debounce quand le contexte/instructions/modèle change.
  useEffect(() => {
    if (!estimateRequest) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      runEstimate(estimateRequest)
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [estimateRequest, runEstimate])

  const handleEstimate = useCallback(() => {
    if (!estimateRequest) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    runEstimate(estimateRequest)
  }, [estimateRequest, runEstimate])

  if (!estimateRequest) return null

  // AC #3 : libellé de comparaison inter-providers.
  const comparisonLabel =
    result?.cost_difference_pct != null && result.alternative_provider
      ? `${result.alternative_provider} : ${result.cost_difference_pct > 0 ? '+' : ''}${result.cost_difference_pct.toFixed(1)}% vs ${result.provider}`
      : null

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
      {/* Ligne principale : bouton + résumé */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleEstimate}
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
          <span style={{ fontSize: '0.85rem', color: theme.text.primary }}>
            ~{result.estimated_cost_eur.toFixed(4)} € · {result.prompt_tokens + result.completion_tokens} tokens · {result.provider}
          </span>
        )}
        {state === 'error' && (
          <span style={{ fontSize: '0.85rem', color: theme.text.error ?? '#e57373' }}>
            {errorMessage}
          </span>
        )}
      </div>

      {/* AC #3 : comparaison inter-providers */}
      {state === 'success' && comparisonLabel && (
        <div style={{ fontSize: '0.8rem', color: theme.text.secondary ?? '#aaa' }}>
          {comparisonLabel}
          {result?.alternative_cost_eur != null && (
            <span> ({result.alternative_cost_eur.toFixed(4)} €)</span>
          )}
        </div>
      )}

      {/* AC #4 : breakdown par nœud (batch) */}
      {state === 'success' && result?.per_node_breakdown && result.per_node_breakdown.length > 1 && (
        <div>
          <button
            type="button"
            onClick={() => setBreakdownExpanded(v => !v)}
            style={{
              background: 'none',
              border: 'none',
              color: theme.text.secondary ?? '#aaa',
              fontSize: '0.8rem',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            {breakdownExpanded ? '▲ Masquer le détail' : `▼ Voir détail (${result.per_node_breakdown.length} nœuds)`}
          </button>
          {breakdownExpanded && (
            <div
              style={{
                marginTop: '0.35rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.2rem',
              }}
            >
              {result.per_node_breakdown.map((node, idx) => (
                <div key={idx} style={{ fontSize: '0.78rem', color: theme.text.secondary ?? '#aaa' }}>
                  Nœud {node.choice_index ?? idx} — {node.estimated_cost_eur.toFixed(4)} € · {node.prompt_tokens + node.completion_tokens} tokens
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AC #5 : warnings budget */}
      {warningLevel === '90' && (
        <div style={{ fontSize: '0.8rem', color: theme.text.warning ?? '#ffb74d' }}>
          Budget atteint à 90% — vérifiez avant de générer.
        </div>
      )}
      {warningLevel === '100' && (
        <div style={{ fontSize: '0.8rem', color: theme.text.error ?? '#e57373', fontWeight: 600 }}>
          Budget dépassé — génération bloquée.
        </div>
      )}
    </div>
  )
}
