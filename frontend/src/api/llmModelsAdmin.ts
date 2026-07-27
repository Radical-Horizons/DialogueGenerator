/**
 * API client admin pour le catalogue de modèles LLM.
 */
import apiClient from './client'
import type { LLMModelResponse } from '../types/api'

export interface LLMModelUpsertPayload {
  api_identifier: string
  display_name: string
  client_type?: string
  max_tokens?: number
  default_temperature?: number
  input_price_per_1M?: number | null
  output_price_per_1M?: number | null
  pricing_description?: string | null
}

export interface LLMModelPatchPayload {
  display_name?: string
  max_tokens?: number
  default_temperature?: number
  input_price_per_1M?: number | null
  output_price_per_1M?: number | null
  pricing_description?: string | null
}

/**
 * Crée ou remplace un modèle LLM (admin).
 */
export async function createLLMModel(
  payload: LLMModelUpsertPayload,
): Promise<LLMModelResponse> {
  const response = await apiClient.post<LLMModelResponse>(
    '/api/v1/config/llm/models',
    payload,
  )
  return response.data
}

/**
 * Met à jour partiellement un modèle LLM (admin).
 */
export async function updateLLMModel(
  apiIdentifier: string,
  payload: LLMModelPatchPayload,
): Promise<LLMModelResponse> {
  const encoded = apiIdentifier
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  const response = await apiClient.patch<LLMModelResponse>(
    `/api/v1/config/llm/models/${encoded}`,
    payload,
  )
  return response.data
}

/**
 * Supprime un modèle LLM du catalogue (admin).
 */
export async function deleteLLMModel(apiIdentifier: string): Promise<void> {
  const encoded = apiIdentifier
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  await apiClient.delete(`/api/v1/config/llm/models/${encoded}`)
}
