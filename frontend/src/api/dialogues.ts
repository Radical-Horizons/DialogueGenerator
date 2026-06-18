/**
 * API client pour la génération de dialogues.
 */
import apiClient from './client'
import { API_TIMEOUTS } from '../constants'
import { buildCostEstimateHeaders, type CostEstimateHeadersInput } from './costEstimateHeaders'
import type {
  GenerateUnityDialogueRequest,
  GenerateUnityDialogueResponse,
  ExportUnityDialogueRequest,
  ExportUnityDialogueResponse,
  BatchExportRequest,
  BatchExportResponse,
  EstimateTokensRequest,
  EstimateTokensResponse,
  PreviewPromptRequest,
  PreviewPromptResponse,
  GenerationJobStatus,
} from '../types/api'
import type { ValidateSchemaResponse } from '../types/graph'

// NOTE: generateDialogueVariants et generateInteractionVariants ont été supprimés. Utiliser generateUnityDialogue à la place.

/**
 * Génère un nœud de dialogue au format Unity JSON.
 * 
 * Utilise un timeout étendu (5 minutes) pour permettre aux générations LLM longues de se terminer.
 */
export async function generateUnityDialogue(
  request: GenerateUnityDialogueRequest,
  costEstimate?: CostEstimateHeadersInput
): Promise<GenerateUnityDialogueResponse> {
  const hdr = buildCostEstimateHeaders(costEstimate)
  const response = await apiClient.post<GenerateUnityDialogueResponse>(
    '/api/v1/dialogues/generate/unity-dialogue',
    request,
    {
      timeout: API_TIMEOUTS.LLM_GENERATION, // 5 minutes pour les générations LLM
      ...(hdr ? { headers: hdr } : {}),
    }
  )
  return response.data
}

/**
 * Crée un job de génération Unity Dialogue avec streaming SSE (Story 0.2).
 * 
 * Retourne un job_id et une stream_url pour EventSource.
 */
export async function createGenerationJob(
  request: GenerateUnityDialogueRequest,
  costEstimate?: CostEstimateHeadersInput
): Promise<{ job_id: string; stream_url: string; status: string }> {
  const hdr = buildCostEstimateHeaders(costEstimate)
  const response = await apiClient.post<{ job_id: string; stream_url: string; status: string }>(
    '/api/v1/dialogues/generate/jobs',
    request,
    hdr ? { headers: hdr } : {}
  )
  return response.data
}

/**
 * Annule un job de génération en cours (Story 0.2).
 */
export async function cancelGenerationJob(
  job_id: string
): Promise<{ success: boolean; message: string; job_id: string }> {
  const response = await apiClient.post<{ success: boolean; message: string; job_id: string }>(
    `/api/v1/dialogues/generate/jobs/${job_id}/cancel`
  )
  return response.data
}

/**
 * Statut d'un job de génération (polling ; le flux principal reste SSE).
 */
export async function getGenerationJobStatus(job_id: string): Promise<GenerationJobStatus> {
  const response = await apiClient.get<GenerationJobStatus>(
    `/api/v1/dialogues/generate/jobs/${job_id}`
  )
  return response.data
}

/**
 * Estime le nombre de tokens pour un contexte donné.
 * 
 * Retourne également le prompt brut construit, mais pour la prévisualisation
 * uniquement (sans estimation), utiliser previewPrompt à la place.
 */
export async function estimateTokens(
  request: EstimateTokensRequest,
  signal?: AbortSignal
): Promise<EstimateTokensResponse> {
  const response = await apiClient.post<EstimateTokensResponse>('/api/v1/dialogues/estimate-tokens', request, {
    signal,
    timeout: API_TIMEOUTS.CONTEXT_ESTIMATION,
  })
  return response.data
}

/**
 * Prévisualise le prompt brut construit sans estimer les tokens.
 * 
 * Utilisé pour la prévisualisation du prompt avant génération.
 * Pour estimer les tokens, utiliser estimateTokens à la place.
 * 
 * Utilise un timeout étendu (60 secondes) car la construction du prompt peut être lente,
 * notamment via ngrok qui ajoute de la latence réseau.
 */
export async function previewPrompt(
  request: PreviewPromptRequest
): Promise<PreviewPromptResponse> {
  const response = await apiClient.post<PreviewPromptResponse>(
    '/api/v1/dialogues/preview-prompt',
    request,
    {
      timeout: 60000, // 60 secondes pour la construction du prompt (plus long en production via ngrok)
    }
  )
  return response.data
}


/**
 * Exporte un dialogue Unity JSON vers un fichier.
 */
export async function exportUnityDialogue(
  request: ExportUnityDialogueRequest
): Promise<ExportUnityDialogueResponse> {
  const response = await apiClient.post<ExportUnityDialogueResponse>(
    '/api/v1/dialogues/unity/export',
    request
  )
  return response.data
}

/**
 * Valide un document persisté contre le schéma Unity (Story 5.3 / FR51).
 */
export async function validateDocumentSchema(documentId: string): Promise<ValidateSchemaResponse> {
  const response = await apiClient.post<ValidateSchemaResponse>(
    `/api/v1/dialogues/${encodeURIComponent(documentId)}/validate-schema`,
  )
  return response.data
}

/**
 * Export batch de dialogues persistés vers Unity JSON (Story 5.2).
 */
export async function batchExportUnityDialogues(
  request: BatchExportRequest,
  signal?: AbortSignal,
): Promise<BatchExportResponse> {
  const response = await apiClient.post<BatchExportResponse>(
    '/api/v1/dialogues/batch-export',
    request,
    { signal },
  )
  return response.data
}

