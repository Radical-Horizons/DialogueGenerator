/**
 * Badge d'estimation du coût LLM avant génération (Story 1.11).
 * Affiche coût estimé (€), tokens, provider ; bouton "Estimer le coût" ; warnings 90% / 100%.
 */
import { useState, useCallback } from 'react'
import { theme } from '../../theme'
import { estimateCost } from '../../api/graph'
import { getBudget } from '../../api/costs'
import type { EstimateCostRequest, EstimateCostResponse } from '../../types/graph'

type EstimateState = 'idle' | 'loading' | 'success' | 'error'

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

  const handleEstimate = useCallback(async () => {
    if (!estimateRequest) return
    setState('loading')
    setErrorMessage(null)
    setResult(null)
    setWarningLevel('none')
    onBudgetExceeded?.(false)
    try {
      const data = await estimateCost(estimateRequest)
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
  }, [estimateRequest, onBudgetExceeded])

  if (!estimateRequest) return null

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
