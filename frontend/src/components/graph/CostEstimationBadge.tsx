/**
 * Badge d'estimation du coût LLM avant génération (Story 1.11).
 * Wrapper autour du composant unifié EstimationBadge + useEstimation (flux graphe).
 */
import { useEffect } from 'react'
import { useEstimation } from '../../hooks/useEstimation'
import { EstimationBadge } from '../estimation'
import type { EstimateCostRequest } from '../../types/graph'

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
  const { result, state, error, runEstimate, budgetExceeded, budgetWarning90 } = useEstimation({
    type: 'graph',
    request: estimateRequest,
  })

  useEffect(() => {
    onBudgetExceeded?.(budgetExceeded)
  }, [budgetExceeded, onBudgetExceeded])

  if (estimateRequest === null) return null

  return (
    <EstimationBadge
      result={result}
      state={state}
      error={error}
      onEstimate={runEstimate}
      budgetExceeded={budgetExceeded}
      budgetWarning90={budgetWarning90}
      showWhenIdle={true}
    />
  )
}
