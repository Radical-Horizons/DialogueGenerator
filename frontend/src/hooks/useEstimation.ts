/**
 * Hook unifié d'estimation (tokens + coût) pour tous les flux de génération.
 * Un seul point d'entrée : graphe (nœud) ou dialogue complet.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { estimateCost } from '../api/graph'
import { estimateTokens } from '../api/dialogues'
import { getBudget } from '../api/costs'
import type { EstimateCostRequest, EstimateCostResponse } from '../types/graph'
import type { EstimateTokensRequest, EstimateTokensResponse } from '../types/api'
import type { EstimationResult, EstimationState } from '../types/estimation'

const DEBOUNCE_MS = 400

/** Payload graphe (nœud). */
export interface EstimationInputGraph {
  type: 'graph'
  request: EstimateCostRequest | null
}

/** Payload dialogue complet. */
export interface EstimationInputDialogue {
  type: 'dialogue'
  request: EstimateTokensRequest | null
}

export type EstimationInput = EstimationInputGraph | EstimationInputDialogue

function mapGraphResponse(res: EstimateCostResponse): EstimationResult {
  return {
    prompt_tokens: res.prompt_tokens,
    completion_tokens: res.completion_tokens,
    estimated_cost_eur: res.estimated_cost_eur,
    provider: res.provider,
    model_id: res.model_id,
    alternative_provider: res.alternative_provider,
    alternative_cost_eur: res.alternative_cost_eur,
    cost_difference_pct: res.cost_difference_pct,
    per_node_breakdown: res.per_node_breakdown,
  }
}

function mapDialogueResponse(res: EstimateTokensResponse): EstimationResult {
  return {
    prompt_tokens: res.token_count,
    completion_tokens: res.completion_tokens ?? 0,
    estimated_cost_eur: res.estimated_cost_eur ?? null,
  }
}

export interface UseEstimationReturn {
  result: EstimationResult | null
  state: EstimationState
  error: string | null
  runEstimate: () => Promise<void>
  budgetExceeded: boolean
  budgetWarning90: boolean
}

/**
 * Un seul hook pour l'estimation : graphe ou dialogue.
 * Déclenchement manuel + debounce automatique quand le request change.
 */
export function useEstimation(input: EstimationInput): UseEstimationReturn {
  const [result, setResult] = useState<EstimationResult | null>(null)
  const [state, setState] = useState<EstimationState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [budgetExceeded, setBudgetExceeded] = useState(false)
  const [budgetWarning90, setBudgetWarning90] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runEstimate = useCallback(async () => {
    if (input.type === 'graph') {
      if (!input.request) return
      setState('loading')
      setError(null)
      setResult(null)
      setBudgetExceeded(false)
      setBudgetWarning90(false)
      try {
        const data = await estimateCost(input.request)
        setResult(mapGraphResponse(data))
        setState('success')
        const budget = await getBudget()
        const projected = budget.amount + data.estimated_cost_eur
        const pct = budget.quota > 0 ? (projected / budget.quota) * 100 : 0
        setBudgetExceeded(pct >= 100)
        setBudgetWarning90(pct >= 90 && pct < 100)
      } catch (err) {
        setState('error')
        setError(err instanceof Error ? err.message : 'Erreur estimation')
      }
      return
    }

    if (input.type === 'dialogue') {
      if (!input.request) return
      setState('loading')
      setError(null)
      setResult(null)
      try {
        const data = await estimateTokens(input.request)
        setResult(mapDialogueResponse(data))
        setState('success')
      } catch (err) {
        setState('error')
        setError(err instanceof Error ? err.message : 'Erreur estimation')
      }
    }
  }, [input.type, input.request])

  useEffect(() => {
    const req = input.type === 'graph' ? input.request : input.request
    if (!req) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void runEstimate()
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [input.type, input.request, runEstimate])

  return { result, state, error, runEstimate, budgetExceeded, budgetWarning90 }
}
