/**
 * Client API recherche FTS + admin index (Story 8.6 / FR85).
 */
import apiClient from './client'
import { API_TIMEOUTS } from '../constants'

export interface DialogueSearchResponse {
  query: string
  elapsed_ms: number
  document_ids: string[]
  total: number
}

export interface DialogueSearchStats {
  indexed_count: number
  last_rebuild_at: string | null
  last_search_ms: number | null
  rebuild_status: string
  rebuild_error: string | null
  index_bytes: number
}

export async function searchUnityDialogues(
  query: string
): Promise<DialogueSearchResponse> {
  const response = await apiClient.get<DialogueSearchResponse>(
    '/api/v1/unity-dialogues/search',
    {
      params: { q: query },
      timeout: API_TIMEOUTS.DOCUMENT_IO,
    }
  )
  return response.data
}

export async function getDialogueSearchStats(): Promise<DialogueSearchStats> {
  const response = await apiClient.get<DialogueSearchStats>(
    '/api/v1/admin/search-stats',
    { timeout: API_TIMEOUTS.DOCUMENT_IO }
  )
  return response.data
}

export async function startDialogueReindex(): Promise<{ status: string }> {
  const response = await apiClient.post<{ status: string }>(
    '/api/v1/admin/reindex',
    {},
    { timeout: API_TIMEOUTS.DOCUMENT_IO }
  )
  return response.data
}
