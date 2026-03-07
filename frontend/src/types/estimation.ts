/**
 * Types unifiés pour l'estimation (tokens + coût) avant génération.
 * Un seul contrat pour tous les flux : graphe (nœud) et dialogue complet.
 */

/** Détail par nœud (batch). */
export interface EstimationPerNodeBreakdown {
  choice_index?: number
  prompt_tokens: number
  completion_tokens: number
  estimated_cost_eur: number
}

/**
 * Résultat d'estimation normalisé affiché par EstimationBadge.
 * Coût et provider optionnels (flux dialogue sans endpoint estimate-cost).
 */
export interface EstimationResult {
  prompt_tokens: number
  completion_tokens: number
  /** Coût en € ; null si non disponible (ex. flux dialogue sans estimate-cost). */
  estimated_cost_eur: number | null
  provider?: string
  model_id?: string
  /** Comparaison inter-providers (Story 1.11 AC #3). */
  alternative_provider?: string
  alternative_cost_eur?: number
  cost_difference_pct?: number
  /** Détail par nœud en génération batch. */
  per_node_breakdown?: EstimationPerNodeBreakdown[]
}

export type EstimationState = 'idle' | 'loading' | 'success' | 'error'
