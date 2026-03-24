/**
 * Client API pour les endpoints de suivi d'utilisation LLM.
 */
import apiClient from './client'

export interface LLMUsageRecord {
  request_id: string
  timestamp: string
  model_name: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  estimated_cost: number
  duration_ms: number
  success: boolean
  endpoint: string
  k_variants: number
  error_message?: string | null
  dialogue_id?: string | null
  node_id?: string | null
}

export interface NodeCostEntry {
  node_id?: string | null
  timestamp: string
  model_name: string
  prompt_tokens: number
  completion_tokens: number
  cost_eur: number
  success: boolean
  deleted: boolean
}

export interface DialogueCostResponse {
  dialogue_id: string
  total_cost_eur: number
  node_count: number
  avg_cost_per_node_eur: number
  breakdown: NodeCostEntry[]
}

export interface DialogueCostSummaryEntry {
  dialogue_id: string
  total_cost_eur: number
  node_count: number
  avg_cost_per_node_eur: number
}

export interface AllDialoguesCostResponse {
  dialogues: DialogueCostSummaryEntry[]
  total_dialogues: number
}

export interface LLMUsageHistoryResponse {
  records: LLMUsageRecord[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface LLMUsageStatistics {
  total_tokens: number
  total_prompt_tokens: number
  total_completion_tokens: number
  total_cost: number
  calls_count: number
  success_count: number
  error_count: number
  success_rate: number
  avg_duration_ms: number
  start_date?: string | null
  end_date?: string | null
  model_name?: string | null
}

/** Entrée de log de génération (Story 1.15). */
export interface GenerationLogEntry {
  request_id: string
  timestamp: string
  node_id?: string | null
  model_name: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  estimated_cost: number
  cost_eur: number
  duration_ms: number
  success: boolean
  error_message?: string | null
  prompt?: string | null
  response?: string | null
}

/** Réponse GET /dialogue/{id}/generation-logs (Story 1.15). */
export interface GenerationLogsResponse {
  entries: GenerationLogEntry[]
  total_count: number
  total_cost_eur: number
}

export interface GetGenerationLogsParams {
  start_date?: string | null
  end_date?: string | null
  model_name?: string | null
}

/**
 * Récupère l'historique d'utilisation LLM avec pagination.
 */
export async function getUsageHistory(
  startDate?: string | null,
  endDate?: string | null,
  model?: string | null,
  page: number = 1,
  pageSize: number = 50
): Promise<LLMUsageHistoryResponse> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  if (model) params.append('model', model)
  params.append('page', page.toString())
  params.append('page_size', pageSize.toString())

  const response = await apiClient.get(`/api/v1/llm-usage/history?${params.toString()}`)
  return response.data
}

/**
 * Récupère le breakdown des coûts LLM pour un dialogue spécifique.
 */
export async function getDialogueCosts(dialogueId: string): Promise<DialogueCostResponse> {
  const response = await apiClient.get(`/api/v1/llm-usage/dialogue/${encodeURIComponent(dialogueId)}/costs`)
  return response.data
}

/**
 * Récupère tous les dialogues avec leurs coûts agrégés, triés par coût décroissant (AC#3).
 */
export async function getAllDialoguesCosts(): Promise<AllDialoguesCostResponse> {
  const response = await apiClient.get('/api/v1/llm-usage/dialogues/costs')
  return response.data
}

/**
 * Marque un nœud comme supprimé dans l'historique des coûts (AC#5).
 */
export async function markNodeDeleted(nodeId: string): Promise<void> {
  await apiClient.post(`/api/v1/llm-usage/nodes/${encodeURIComponent(nodeId)}/mark-deleted`)
}

/**
 * Récupère les statistiques agrégées d'utilisation LLM.
 */
export async function getUsageStatistics(
  startDate?: string | null,
  endDate?: string | null,
  model?: string | null
): Promise<LLMUsageStatistics> {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  if (model) params.append('model', model)

  const response = await apiClient.get(`/api/v1/llm-usage/statistics?${params.toString()}`)
  return response.data
}

/**
 * Récupère les logs de génération pour un dialogue (Story 1.15).
 * Filtres optionnels : start_date, end_date, model_name (provider).
 */
export async function getGenerationLogs(
  dialogueId: string,
  params?: GetGenerationLogsParams
): Promise<GenerationLogsResponse> {
  const search = new URLSearchParams()
  if (params?.start_date) search.append('start_date', params.start_date)
  if (params?.end_date) search.append('end_date', params.end_date)
  if (params?.model_name) search.append('model_name', params.model_name)
  const qs = search.toString()
  const url = `/api/v1/llm-usage/dialogue/${encodeURIComponent(dialogueId)}/generation-logs${qs ? `?${qs}` : ''}`
  const response = await apiClient.get(url)
  return response.data
}

/** Rapport de pertinence contexte GDD pour un nœud (Story 3.6). */
export interface ContextRelevanceReport {
  dialogue_id: string
  node_id: string
  request_id?: string | null
  score_percent: number
  breakdown_by_type: Record<string, number>
  reflected_types: string[]
  weak_types: string[]
  low_context_warning: boolean
  low_threshold_percent: number
  method: string
  computation_ms: number
  computed_at: string
  suggestions_hints: string[]
}

export interface ContextRelevanceHistoryEntry {
  request_id: string
  node_id?: string | null
  timestamp: string
  score_percent: number
  low_context_warning: boolean
  breakdown_by_type: Record<string, number>
}

export interface ContextRelevanceHistoryResponse {
  dialogue_id: string
  entries: ContextRelevanceHistoryEntry[]
  total_count: number
}

export async function getNodeContextRelevance(
  dialogueId: string,
  nodeId: string
): Promise<ContextRelevanceReport> {
  const url = `/api/v1/llm-usage/dialogue/${encodeURIComponent(dialogueId)}/nodes/${encodeURIComponent(nodeId)}/context-relevance`
  const response = await apiClient.get(url)
  return response.data
}

export async function getContextRelevanceHistory(
  dialogueId: string
): Promise<ContextRelevanceHistoryResponse> {
  const url = `/api/v1/llm-usage/dialogue/${encodeURIComponent(dialogueId)}/context-relevance-history`
  const response = await apiClient.get(url)
  return response.data
}

